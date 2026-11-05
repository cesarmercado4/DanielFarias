// Favoritas de los invitados: GET trae las de una persona, POST marca o desmarca una foto.
const db = require('./db');
const { json, readJson } = require('./http');

const MAX_NAME = 40;

// "  Ana   García " -> "ana garcía"
const normalizeName = (s) => String(s || '').replace(/[\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, MAX_NAME);

module.exports = async function select(req, res, url) {
  const body = req.method === 'POST' ? await readJson(req) : {};
  const slug = String(body.slug || url.searchParams.get('slug') || '').toLowerCase();
  const who = normalizeName(body.who || url.searchParams.get('who'));
  const event = db.getEvent(slug);

  if (!event || !event.active || !event.selections) return json(res, 403, { error: 'disabled' });
  if (!who) return json(res, 400, { error: 'name' });

  if (req.method === 'GET') return json(res, 200, { picks: db.getPicks(slug, who) });

  if (req.method === 'POST') {
    const id = String(body.photo || '');
    if (!/^[\w-]{1,80}$/.test(id)) return json(res, 400, { error: 'photo' });
    db.setPick(slug, who, id, Boolean(body.on));
    return json(res, 200, { ok: true });
  }
  json(res, 405, { error: 'method' });
};
