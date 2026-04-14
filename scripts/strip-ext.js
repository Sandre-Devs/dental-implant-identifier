
require('dotenv').config();
const path = require('path');
const db = require('../database/db');
const rows = db.prepare('SELECT id, original_name FROM images').all();
const stmt = db.prepare('UPDATE images SET original_name=? WHERE id=?');
const run = db.transaction(() => {
  let n = 0;
  for (const r of rows) {
    const stripped = r.original_name.replace(/\.[^.]+$/, '');
    if (stripped !== r.original_name) { stmt.run(stripped, r.id); n++; }
  }
  return n;
});
const n = run();
console.log(`✅ ${n} registros atualizados (extensão removida)`);
