const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');

// .env: solo para trabajar en tu PC. En el servidor las variables van en el servicio (ver deploy/).
try {
  for (const line of fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
} catch {}

module.exports = {
  root,
  host: process.env.HOST || '127.0.0.1', // detrás de Caddy se queda en 127.0.0.1
  port: Number(process.env.PORT) || 3000,
  dataDir: process.env.DATA_DIR || path.join(root, 'data'),
  googleKey: process.env.GOOGLE_API_KEY || '',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  sessionSecret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  ephemeralSecret: !process.env.SESSION_SECRET,
  brand: JSON.parse(fs.readFileSync(path.join(root, 'brand.json'), 'utf8')),
};
