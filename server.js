// Servidor único: página oficial, galerías de clientes y panel de administración.
//   node server.js        (en tu PC:  http://localhost:3000)
const http = require('http');
const fs = require('fs');
const path = require('path');
const config = require('./src/config');
const { db } = require('./src/db');
const pages = require('./src/pages');
const select = require('./src/select');
const admin = require('./src/admin');
const { json, send } = require('./src/http');

const PUBLIC = path.join(config.root, 'public');
const TYPES = { '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif','.ico': 'image/x-icon', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };

function serveStatic(res, pathname) {
  const file = path.join(PUBLIC, path.normalize(pathname));
  if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
  send(res, 200, fs.readFileSync(file), { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'public, max-age=3600' });
  return true;
}

async function route(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  if (p === '/healthz') return send(res, 200, 'ok', { 'Content-Type': 'text/plain' });
  if (p === '/robots.txt') return send(res, 200, 'User-agent: *\nDisallow: /admin\n', { 'Content-Type': 'text/plain; charset=utf-8' });
  if (p === '/api/select') return select(req, res, url);
  if (p === '/admin' || p.startsWith('/admin/')) return admin(req, res, url);

  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { message: 'Método no permitido' });
  if (p === '/') return pages.homePage(res);
  if (serveStatic(res, decodeURIComponent(p))) return;

  const m = p.match(/^\/([^/]+)\/?$/);
  if (m) return pages.galleryPage(req, res, decodeURIComponent(m[1]).toLowerCase());
  pages.notFound(res);
}

const server = http.createServer((req, res) => {
  route(req, res).catch((err) => {
    const status = err.status || (err instanceof URIError ? 400 : 500);
    if (status >= 500) console.error(`[${req.method} ${req.url}]`, err);
    if (res.headersSent) return res.end();
    json(res, status, { message: status >= 500 ? 'Error del servidor' : err.message });
  });
});

server.listen(config.port, config.host, () => {
  console.log(`Galerías en http://${config.host}:${config.port}`);
  if (!config.googleKey) console.warn('⚠ Falta GOOGLE_API_KEY: no se podrán leer carpetas de Drive.');
  if (!config.adminPassword) console.warn('⚠ Falta ADMIN_PASSWORD: no se podrá ingresar al panel.');
  if (config.ephemeralSecret) console.warn('⚠ Falta SESSION_SECRET: la sesión del panel se cierra cada vez que se reinicia el servidor.');
});

function shutdown() {
  server.close(() => { db.close(); process.exit(0); });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
