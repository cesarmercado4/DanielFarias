// Panel de administración: login y API para manejar las galerías.
const fs = require('fs');
const path = require('path');
const config = require('./config');
const db = require('./db');
const auth = require('./auth');
const { parseFolderId, checkFolder, loadEventPhotos, forgetEvent } = require('./drive');
const { httpError, send, json, html, redirect, readJson } = require('./http');

const view = (name) => fs.readFileSync(path.join(config.root, 'views', name), 'utf8');
const PRIVATE = { 'X-Frame-Options': 'DENY', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };

// Direcciones que no se pueden usar para una galería porque son del sistema.
const RESERVED = new Set(['admin', 'api', 'login', 'logout', 'ingresar', 'static', 'public', 'assets', 'healthz', 'robots', 'favicon']);

const FOLDER_MESSAGES = {
  notfound: 'No pudimos abrir esa carpeta. Revisá que el link esté completo y que la carpeta esté compartida como "Cualquier persona con el vínculo".',
  notfolder: 'Ese link no es de una carpeta (parece un archivo). Copiá el link de la carpeta.',
  badkey: 'La clave de Google del servidor (GOOGLE_API_KEY) no es válida.',
  apidisabled: 'Falta habilitar la API de Google Drive para la clave del servidor.',
  nokey: 'Falta configurar GOOGLE_API_KEY en el servidor.',
};

const slugify = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 60);
const naturalSort = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });
const code = (name) => name.replace(/\.[^.]+$/, '');

/* ---------- validación ---------- */

const text = (value, max, label, { required = false } = {}) => {
  const v = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (required && !v) throw httpError(422, `Falta ${label}.`);
  if (v.length > max) throw httpError(422, `${label[0].toUpperCase()}${label.slice(1)} es demasiado largo.`);
  return v;
};

// Devuelve solo los campos que vinieron, ya validados.
function readFields(body) {
  const f = {};
  if ('title' in body) f.title = text(body.title, 120, 'el título', { required: true });
  if ('subtitle' in body) f.subtitle = text(body.subtitle, 60, 'el subtítulo');
  if ('date' in body) {
    f.date = String(body.date || '');
    if (f.date && !/^\d{4}-\d{2}-\d{2}$/.test(f.date)) throw httpError(422, 'La fecha no es válida.');
  }
  if ('cover' in body) f.cover = text(body.cover, 120, 'el nombre de la portada');
  if ('sort' in body) f.sort = body.sort === 'time' ? 'time' : 'name';
  if ('selections' in body) f.selections = Boolean(body.selections);
  if ('active' in body) f.active = Boolean(body.active);
  return f;
}

async function verifiedFolderId(link) {
  const folderId = parseFolderId(link);
  if (!folderId) throw httpError(422, 'No encontramos el ID de la carpeta en ese link. Copiá el link de la carpeta de Drive.');
  const result = await checkFolder(folderId);
  if (result.error) throw httpError(422, FOLDER_MESSAGES[result.error]);
  return { folderId, result };
}

/* ---------- elecciones de los invitados ---------- */

async function picksReport(event) {
  let photos = [];
  try { photos = await loadEventPhotos(event, { fresh: true }); } catch {}
  const byId = new Map(photos.map((p) => [p.id, p]));
  const describe = (id) => {
    const p = byId.get(id);
    return p ? { id, name: p.name, thumb: p.thumb } : { id, name: null, thumb: null };
  };
  const byName = (a, b) => naturalSort(a.name ?? 'zzz', b.name ?? 'zzz');

  const all = db.allPicks(event.slug);
  const people = Object.entries(all)
    .map(([who, ids]) => ({ who, count: ids.length, photos: ids.map(describe).sort(byName) }))
    .sort((a, b) => b.count - a.count);

  const tally = new Map();
  people.forEach((p) => p.photos.forEach((ph) => tally.set(ph.id, (tally.get(ph.id) || 0) + 1)));
  const popular = [...tally].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ ...describe(id), people: n }));

  return { people, popular, distinct: tally.size };
}

function picksCsv(report) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const rows = ['persona,archivo'];
  report.people.forEach((p) => p.photos.forEach((ph) => rows.push(`${q(p.who)},${q(ph.name ? code(ph.name) : `(foto eliminada ${ph.id})`)}`)));
  return `﻿${rows.join('\r\n')}`; // BOM para que Excel respete los acentos
}

/* ---------- API ---------- */

async function api(req, res, url) {
  const p = url.pathname.replace(/^\/admin\/api/, '');
  const method = req.method;

  // Los cambios solo se aceptan como JSON y desde este mismo sitio.
  if (method !== 'GET') {
    if (!String(req.headers['content-type'] || '').includes('application/json') && method !== 'DELETE') throw httpError(415, 'Tipo de pedido no permitido');
    const origin = req.headers.origin;
    if (origin) {
      let host = '';
      try { host = new URL(origin).host; } catch {}
      if (host !== req.headers.host) throw httpError(403, 'Origen no permitido');
    }
  }

  if (p === '/events' && method === 'GET') {
    const stats = db.pickStats();
    return json(res, 200, { events: db.listEvents().map((e) => ({ ...e, ...(stats[e.slug] || { people: 0, picks: 0 }) })) });
  }

  if (p === '/check' && method === 'POST') {
    const { link } = await readJson(req);
    const folderId = parseFolderId(link);
    if (!folderId) return json(res, 200, { ok: false, message: 'No encontramos el ID de la carpeta en ese link.' });
    const result = await checkFolder(folderId);
    if (result.error) return json(res, 200, { ok: false, message: FOLDER_MESSAGES[result.error] });
    return json(res, 200, { ok: true, folderId, name: result.name, count: result.count });
  }

  if (p === '/events' && method === 'POST') {
    const body = await readJson(req);
    const fields = readFields({ title: '', ...body });
    const slug = String(body.slug || '').trim().toLowerCase() || slugify(fields.title);
    if (!/^[a-z0-9-]{3,60}$/.test(slug) || slug.startsWith('-') || slug.endsWith('-')) throw httpError(422, 'La dirección debe tener entre 3 y 60 letras o números (se permiten guiones).');
    if (RESERVED.has(slug)) throw httpError(422, 'Esa dirección está reservada. Elegí otra.');
    if (db.getEvent(slug)) throw httpError(409, 'Ya existe una galería con esa dirección.');

    const { folderId, result } = await verifiedFolderId(body.link);
    const event = db.createEvent({ subtitle: '', date: '', cover: '', sort: 'name', selections: false, ...fields, slug, folderId });
    return json(res, 201, { event, check: { name: result.name, count: result.count } });
  }

  const one = p.match(/^\/events\/([a-z0-9-]+)(\/picks(?:\.csv)?)?$/);
  if (one) {
    const event = db.getEvent(one[1]);
    if (!event) throw httpError(404, 'No existe esa galería.');
    const sub = one[2];

    if (!sub && method === 'PUT') {
      const body = await readJson(req);
      const fields = readFields(body);
      if (body.link) {
        const { folderId } = await verifiedFolderId(body.link);
        if (folderId !== event.folderId) fields.folderId = folderId;
      }
      const updated = db.updateEvent(event.slug, fields);
      forgetEvent(event.slug);
      return json(res, 200, { event: updated });
    }
    if (!sub && method === 'DELETE') {
      db.deleteEvent(event.slug);
      forgetEvent(event.slug);
      return json(res, 200, { ok: true });
    }
    if (sub === '/picks' && method === 'GET') return json(res, 200, await picksReport(event));
    if (sub === '/picks.csv' && method === 'GET') {
      return send(res, 200, picksCsv(await picksReport(event)), {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="selecciones-${event.slug}.csv"`,
        'Cache-Control': 'no-store',
      });
    }
    if (sub === '/picks' && method === 'DELETE') return json(res, 200, { removed: db.clearPicks(event.slug) });
  }

  throw httpError(404, 'No encontrado');
}

/* ---------- páginas y login ---------- */

module.exports = async function admin(req, res, url) {
  const p = url.pathname.replace(/\/$/, '') || '/admin';

  if (p === '/admin/login' && req.method === 'GET') {
    return auth.isAdmin(req) ? redirect(res, '/admin') : html(res, 200, view('login.html'), PRIVATE);
  }

  if (p === '/admin/login' && req.method === 'POST') {
    if (!config.adminPassword) return json(res, 503, { message: 'Falta configurar ADMIN_PASSWORD en el servidor.' });
    if (auth.tooManyAttempts(req)) return json(res, 429, { message: 'Demasiados intentos. Esperá unos minutos.' });
    const { password } = await readJson(req);
    if (!auth.checkPassword(password)) {
      auth.recordFailure(req);
      await new Promise((r) => setTimeout(r, 800)); // frena a quien prueba contraseñas
      return json(res, 401, { message: 'Contraseña incorrecta.' });
    }
    res.setHeader('Set-Cookie', auth.loginCookie(req));
    return json(res, 200, { ok: true });
  }

  if (p === '/admin/logout' && req.method === 'POST') {
    res.setHeader('Set-Cookie', auth.logoutCookie(req));
    return json(res, 200, { ok: true });
  }

  if (p === '/admin' && req.method === 'GET') {
    return auth.isAdmin(req) ? html(res, 200, view('admin.html'), PRIVATE) : redirect(res, '/admin/login');
  }

  if (p.startsWith('/admin/api/')) {
    if (!auth.isAdmin(req)) return json(res, 401, { message: 'Tu sesión venció. Volvé a ingresar.' });
    try {
      return await api(req, res, url);
    } catch (err) {
      if (err.status) return json(res, err.status, { message: err.message });
      throw err;
    }
  }

  json(res, 404, { message: 'No encontrado' });
};
