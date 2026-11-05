const fs = require('fs');
const path = require('path');
const config = require('./config');
const db = require('./db');
const { loadEventPhotos, thumb } = require('./drive');
const { html } = require('./http');
const { isAdmin } = require('./auth');

const templates = {};
function view(name) {
  if (process.env.NODE_ENV !== 'production' || !templates[name]) templates[name] = fs.readFileSync(path.join(config.root, 'views', name), 'utf8');
  return templates[name];
}

const escapeAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function formatDate(iso) {
  if (!iso) return '';
  return new Date(`${iso}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function metaTags({ title, description, image, noindex }) {
  const tags = [
    `<title>${escapeAttr(title)}</title>`,
    `<meta property="og:title" content="${escapeAttr(title)}">`,
    `<meta property="og:description" content="${escapeAttr(description)}">`,
    '<meta property="og:type" content="website">',
  ];
  if (noindex) tags.push('<meta name="robots" content="noindex">'); // las galerías son privadas: solo con el link
  if (image) {
    tags.push(`<meta property="og:image" content="${escapeAttr(image)}">`);
    tags.push('<meta name="twitter:card" content="summary_large_image">');
  }
  return tags.join('\n');
}

function renderGallery(res, status, data, meta) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  html(res, status, view('gallery.html').replace('<!--META-->', meta).replace('/*__DATA__*/null', json));
}

const { brand } = config;

function notFound(res) {
  renderGallery(res, 404, { brand, error: 'notfound' }, metaTags({ title: `Galería no encontrada · ${brand.name}`, description: '', noindex: true }));
}

async function galleryPage(req, res, slug) {
  const event = db.getEvent(slug);
  if (!event || (!event.active && !isAdmin(req))) return notFound(res);

  let photos;
  try {
    photos = await loadEventPhotos(event);
  } catch (err) {
    console.error(`[galería ${slug}]`, err.message);
    return renderGallery(res, 500, { brand, error: 'unavailable' }, metaTags({ title: `${event.title} · ${brand.name}`, description: '', noindex: true }));
  }

  const cover = photos.find((p) => p.name === event.cover) || photos[0];
  const data = {
    brand,
    event: {
      slug,
      title: event.title,
      subtitle: event.subtitle,
      date: formatDate(event.date),
      driveUrl: event.folderId ? `https://drive.google.com/drive/folders/${event.folderId}` : '',
      selections: event.selections,
    },
    cover: cover ? (event.demo ? cover.full : thumb(cover.id, 1800)) : '',
    photos,
  };
  const description = [event.subtitle, formatDate(event.date), `${photos.length} fotos`].filter(Boolean).join(' · ');
  const image = cover ? (event.demo ? cover.thumb : thumb(cover.id, 800)) : '';
  renderGallery(res, 200, data, metaTags({ title: `${event.title} · ${brand.name}`, description, image, noindex: true }));
}

function homePage(res) {
  const values = {
    NAME: brand.name, SHORT: brand.short, TAGLINE: brand.tagline, LOCATION: brand.location,
    INSTAGRAM: brand.instagram, WHATSAPP: brand.whatsapp,
  };
  // Fotos del portfolio: public/portfolio/bodas y public/portfolio/quince (sin carpeta: se muestran fondos de color)
  const photos = {};
  for (const group of ['bodas', 'quince']) {
    try {
      photos[group] = fs.readdirSync(path.join(config.root, 'public', 'portfolio', group))
        .filter((f) => /\.(jpe?g|png|webp|avif)$/i.test(f)).sort()
        .map((f) => `/portfolio/${group}/${encodeURIComponent(f)}`);
    } catch { photos[group] = []; }
  }
  const page = view('home.html').replace(/\{\{(\w+)\}\}/g, (_, key) =>
    key === 'PHOTOS' ? JSON.stringify(photos).replace(/</g, '\\u003c') : escapeAttr(values[key] ?? ''));
  html(res, 200, page);
}

module.exports = { galleryPage, homePage, notFound };
