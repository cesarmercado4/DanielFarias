// Copia de seguridad de la base:  npm run backup
// Deja un archivo por día en <DATA_DIR>/backups y conserva los últimos 14.
const fs = require('fs');
const path = require('path');
const config = require('../src/config');
const { db } = require('../src/db');

const KEEP = 14;
const dir = path.join(config.dataDir, 'backups');
fs.mkdirSync(dir, { recursive: true });

const file = path.join(dir, `tusfotos-${new Date().toISOString().slice(0, 10)}.db`);

db.backup(file)
  .then(() => {
    const old = fs.readdirSync(dir).filter((f) => /^tusfotos-.*\.db$/.test(f)).sort().slice(0, -KEEP);
    old.forEach((f) => fs.unlinkSync(path.join(dir, f)));
    console.log(`Copia guardada: ${file}${old.length ? ` (se borraron ${old.length} antiguas)` : ''}`);
  })
  .catch((err) => { console.error('No se pudo hacer la copia:', err.message); process.exitCode = 1; })
  .finally(() => db.close());
