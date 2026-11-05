const config = require('./config');

const API = 'https://www.googleapis.com/drive/v3/files';
const CACHE_MS = 5 * 60 * 1000;

/* ---------- link de carpeta -> ID ---------- */

// Acepta el link completo, un link con ?id=, o el ID pelado. Devuelve '' si no parece una carpeta de Drive.
function parseFolderId(input) {
  const text = String(input || '').trim();
  const m = text.match(/\/folders\/([\w-]{10,80})/) || text.match(/[?&]id=([\w-]{10,80})/) || text.match(/^([\w-]{10,80})$/);
  return m ? m[1] : '';
}

/* ---------- API de Drive ---------- */

async function listImages(folderId) {
  const files = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false and mimeType contains 'image/'`,
      fields: 'nextPageToken, files(id, name, imageMediaMetadata(width, height, rotation, time))',
      orderBy: 'name_natural', // IMG_9 antes que IMG_10
      pageSize: '1000',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
      key: config.googleKey,
    });
    if (pageToken) params.set('pageToken', pageToken);

    const res = await fetch(`${API}?${params}`);
    if (!res.ok) throw new Error(`Drive API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    files.push(...data.files);
    pageToken = data.nextPageToken;
  } while (pageToken);
  return files;
}

// Abre la carpeta y cuenta las fotos: sirve para avisar enseguida si el link está mal o no es público.
async function checkFolder(folderId) {
  if (!config.googleKey) return { error: 'nokey' };
  const params = new URLSearchParams({ fields: 'id,name,mimeType', supportsAllDrives: 'true', key: config.googleKey });
  const res = await fetch(`${API}/${folderId}?${params}`);
  if (!res.ok) {
    const reason = ((await res.json().catch(() => ({}))).error?.errors || [])[0]?.reason;
    if (reason === 'keyInvalid') return { error: 'badkey' };
    if (reason === 'accessNotConfigured' || reason === 'SERVICE_DISABLED') return { error: 'apidisabled' };
    return { error: 'notfound' };
  }
  const folder = await res.json();
  if (folder.mimeType !== 'application/vnd.google-apps.folder') return { error: 'notfolder' };
  return { name: folder.name, count: (await listImages(folderId)).length };
}

/* ---------- fotos de un evento ---------- */

const thumb = (id, w) => `https://lh3.googleusercontent.com/d/${id}=w${w}`; // directo al servidor de imágenes de Google

function toPhoto(file) {
  const meta = file.imageMediaMetadata || {};
  let w = meta.width || 3;
  let h = meta.height || 2;
  // rotation = cuartos de vuelta horaria; si es impar, el ancho y el alto están intercambiados
  if (meta.rotation % 2 === 1) [w, h] = [h, w];
  return {
    id: file.id,
    name: file.name,
    w,
    h,
    thumb: thumb(file.id, 640),
    full: thumb(file.id, 2000), // Drive no entrega más de 2000 px de ancho por este camino
    download: `https://drive.google.com/uc?export=download&id=${file.id}`,
  };
}

async function fetchDrivePhotos(folderId, sort) {
  const files = await listImages(folderId);
  if (sort === 'time') {
    // la hora viene como "2026:10:17 14:03:22", se ordena como texto; si falta, queda el orden por nombre
    const when = (f) => (f.imageMediaMetadata && f.imageMediaMetadata.time) || '';
    files.sort((a, b) => when(a).localeCompare(when(b)));
  }
  return files.map(toPhoto);
}

// Fotos de ejemplo para ver el diseño sin tocar Drive.
function getDemoPhotos() {
  const ids = [10, 1011, 1025, 1027, 1035, 1043, 1050, 1062, 1074, 1080, 129, 133, 152, 164, 177, 188, 191, 200, 211, 219, 237, 247, 256, 274];
  const shapes = [[3, 2], [2, 3], [3, 2], [3, 2], [2, 3], [4, 3], [3, 2], [2, 3]];
  return ids.map((id, i) => {
    const [sw, sh] = shapes[i % shapes.length];
    const w = sw * 400;
    const h = sh * 400;
    const url = (width) => `https://picsum.photos/id/${id}/${width}/${Math.round((width * h) / w)}`;
    return { id: String(id), name: `demo-${String(i + 1).padStart(3, '0')}.jpg`, w, h, thumb: url(640), full: url(1800), download: url(2400) };
  });
}

const cache = new Map(); // slug -> { at, key, photos }

// Si Drive falla pero hay una copia vieja, se usa esa en lugar de mostrar un error.
async function loadEventPhotos(event, { fresh = false } = {}) {
  if (event.demo) return getDemoPhotos();
  if (!config.googleKey) throw new Error('Falta la variable GOOGLE_API_KEY');

  const key = `${event.folderId}|${event.sort}`;
  const hit = cache.get(event.slug);
  if (!fresh && hit && hit.key === key && Date.now() - hit.at < CACHE_MS) return hit.photos;

  try {
    const photos = await fetchDrivePhotos(event.folderId, event.sort);
    cache.set(event.slug, { at: Date.now(), key, photos });
    return photos;
  } catch (err) {
    if (hit && hit.key === key) return hit.photos;
    throw err;
  }
}

const forgetEvent = (slug) => cache.delete(slug);

module.exports = { parseFolderId, checkFolder, loadEventPhotos, forgetEvent, thumb };
