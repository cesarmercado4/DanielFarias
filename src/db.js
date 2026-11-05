const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('./config');

fs.mkdirSync(config.dataDir, { recursive: true });
const db = new Database(path.join(config.dataDir, 'tusfotos.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    slug        TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    subtitle    TEXT NOT NULL DEFAULT '',
    date        TEXT NOT NULL DEFAULT '',
    folder_id   TEXT NOT NULL DEFAULT '',
    cover       TEXT NOT NULL DEFAULT '',
    sort        TEXT NOT NULL DEFAULT 'name',
    selections  INTEGER NOT NULL DEFAULT 0,
    demo        INTEGER NOT NULL DEFAULT 0,
    active      INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS picks (
    slug        TEXT NOT NULL REFERENCES events(slug) ON DELETE CASCADE,
    who         TEXT NOT NULL,
    photo_id    TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (slug, who, photo_id)
  );
`);

// Primera vez: se importan los eventos que estaban en events.json.
if (db.prepare('SELECT COUNT(*) AS n FROM events').get().n === 0) {
  try {
    const seed = JSON.parse(fs.readFileSync(path.join(config.root, 'events.json'), 'utf8')).events;
    const insert = db.prepare(`INSERT INTO events (slug, title, subtitle, date, folder_id, cover, sort, selections, demo)
      VALUES (@slug, @title, @subtitle, @date, @folderId, @cover, @sort, @selections, @demo)`);
    db.transaction(() => {
      for (const [slug, e] of Object.entries(seed)) {
        insert.run({
          slug, title: e.title, subtitle: e.subtitle || '', date: e.date || '', folderId: e.folderId || '',
          cover: e.cover || '', sort: e.order === 'time' ? 'time' : 'name', selections: e.selections ? 1 : 0, demo: e.demo ? 1 : 0,
        });
      }
    })();
  } catch {}
}

const toEvent = (r) => r && ({
  slug: r.slug, title: r.title, subtitle: r.subtitle, date: r.date, folderId: r.folder_id, cover: r.cover, sort: r.sort,
  selections: !!r.selections, demo: !!r.demo, active: !!r.active, createdAt: r.created_at,
});

/* ---------- eventos ---------- */
const listEvents = () => db.prepare('SELECT * FROM events ORDER BY created_at DESC, rowid DESC').all().map(toEvent);
const getEvent = (slug) => toEvent(db.prepare('SELECT * FROM events WHERE slug = ?').get(slug));

function createEvent(e) {
  db.prepare(`INSERT INTO events (slug, title, subtitle, date, folder_id, cover, sort, selections, active)
    VALUES (@slug, @title, @subtitle, @date, @folderId, @cover, @sort, @selections, @active)`)
    .run({ ...e, selections: e.selections ? 1 : 0, active: e.active === false ? 0 : 1 });
  return getEvent(e.slug);
}

const COLUMNS = { title: 'title', subtitle: 'subtitle', date: 'date', folderId: 'folder_id', cover: 'cover', sort: 'sort', selections: 'selections', active: 'active' };
function updateEvent(slug, patch) {
  const keys = Object.keys(patch).filter((k) => k in COLUMNS);
  if (keys.length) {
    const set = keys.map((k) => `${COLUMNS[k]} = @${k}`).join(', ');
    const values = Object.fromEntries(keys.map((k) => [k, typeof patch[k] === 'boolean' ? Number(patch[k]) : patch[k]]));
    db.prepare(`UPDATE events SET ${set} WHERE slug = @slug`).run({ ...values, slug });
  }
  return getEvent(slug);
}

const deleteEvent = (slug) => db.prepare('DELETE FROM events WHERE slug = ?').run(slug).changes > 0;

/* ---------- favoritas ---------- */
const MAX_PICKS_PER_PERSON = 5000;

const getPicks = (slug, who) => db.prepare('SELECT photo_id FROM picks WHERE slug = ? AND who = ?').all(slug, who).map((r) => r.photo_id);

function setPick(slug, who, photoId, on) {
  if (!on) return db.prepare('DELETE FROM picks WHERE slug = ? AND who = ? AND photo_id = ?').run(slug, who, photoId);
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM picks WHERE slug = ? AND who = ?').get(slug, who);
  if (n >= MAX_PICKS_PER_PERSON) throw Object.assign(new Error('Demasiadas favoritas'), { status: 429 });
  db.prepare('INSERT OR IGNORE INTO picks (slug, who, photo_id) VALUES (?, ?, ?)').run(slug, who, photoId);
}

// { "ana garcía": ["id1", "id2"], "luis": [...] }
function allPicks(slug) {
  const out = {};
  for (const r of db.prepare('SELECT who, photo_id FROM picks WHERE slug = ? ORDER BY who, rowid').all(slug)) (out[r.who] ||= []).push(r.photo_id);
  return out;
}

// { slug: { people, picks } } para el listado del panel
function pickStats() {
  const rows = db.prepare('SELECT slug, COUNT(DISTINCT who) AS people, COUNT(*) AS picks FROM picks GROUP BY slug').all();
  return Object.fromEntries(rows.map((r) => [r.slug, { people: r.people, picks: r.picks }]));
}

const clearPicks = (slug) => db.prepare('DELETE FROM picks WHERE slug = ?').run(slug).changes;

module.exports = { db, listEvents, getEvent, createEvent, updateEvent, deleteEvent, getPicks, setPick, allPicks, pickStats, clearPicks };
