
require('dotenv').config();
const crypto = require('crypto');
const path   = require('path');
const db     = require('../database/db');

const images = db.prepare('SELECT id, original_name FROM images').all();
let updated = 0;

const updateStmt = db.prepare('UPDATE images SET original_name = ? WHERE id = ?');

const doMigration = db.transaction(() => {
  for (const img of images) {
    const ext     = path.extname(img.original_name).toLowerCase() || '.jpg';
    const hash    = crypto.createHash('sha256')
                          .update(img.id + img.original_name)
                          .digest('hex')
                          .slice(0, 12);
    const newName = hash + ext;
    updateStmt.run(newName, img.id);
    updated++;
    console.log(`  ${img.original_name.slice(0,30).padEnd(30)} → ${newName}`);
  }
});

doMigration();
console.log(`\n✅ ${updated} imagens anonimizadas`);
