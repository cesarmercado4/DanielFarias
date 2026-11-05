const crypto = require('crypto');
const config = require('./config');
const { parseCookies, clientIp, isHttps } = require('./http');

const COOKIE = 'tf_admin';
const SESSION_DAYS = 7;

const mac = (text) => crypto.createHmac('sha256', config.sessionSecret).update(text).digest('base64url');
const digest = (s) => crypto.createHash('sha256').update(String(s)).digest();

// La sesión es una cookie firmada con vencimiento: no se guarda nada en el servidor.
function makeToken() {
  const body = Buffer.from(JSON.stringify({ exp: Date.now() + SESSION_DAYS * 86400000 })).toString('base64url');
  return `${body}.${mac(body)}`;
}

function validToken(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return false;
  const a = Buffer.from(sig);
  const b = Buffer.from(mac(body));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString()).exp > Date.now();
  } catch {
    return false;
  }
}

const isAdmin = (req) => validToken(parseCookies(req.headers.cookie)[COOKIE]);

const checkPassword = (given) => Boolean(config.adminPassword) && crypto.timingSafeEqual(digest(given), digest(config.adminPassword));

function sessionCookie(req, token, maxAge) {
  return `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${isHttps(req) ? '; Secure' : ''}`;
}
const loginCookie = (req) => sessionCookie(req, makeToken(), SESSION_DAYS * 86400);
const logoutCookie = (req) => sessionCookie(req, '', 0);

// Freno a los intentos de contraseña: 8 fallos por IP cada 15 minutos.
const failures = new Map(); // ip -> [timestamps]
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 8;

function recent(ip) {
  const list = (failures.get(ip) || []).filter((t) => Date.now() - t < WINDOW_MS);
  failures.set(ip, list);
  return list;
}
const tooManyAttempts = (req) => recent(clientIp(req)).length >= MAX_FAILS;
const recordFailure = (req) => recent(clientIp(req)).push(Date.now());

module.exports = { isAdmin, checkPassword, loginCookie, logoutCookie, tooManyAttempts, recordFailure };
