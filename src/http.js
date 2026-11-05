const MAX_BODY = 200 * 1024;

const httpError = (status, message) => Object.assign(new Error(message || String(status)), { status });

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(body);
}

const json = (res, status, obj) => send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
const html = (res, status, body, headers = {}) => send(res, status, body, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', ...headers });
const redirect = (res, to) => send(res, 302, '', { Location: to });

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw httpError(413, 'Pedido demasiado grande');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw httpError(400, 'JSON inválido');
  }
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// Detrás de Caddy la IP real viene en X-Forwarded-For.
const clientIp = (req) => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';
const isHttps = (req) => req.headers['x-forwarded-proto'] === 'https';

module.exports = { httpError, send, json, html, redirect, readJson, parseCookies, clientIp, isHttps };
