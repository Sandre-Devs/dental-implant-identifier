const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.resolve(__dirname, '../data/dii.db');
const SCHEMA_PATH = path.resolve(__dirname, 'schema.sql');

// Garante que a pasta data/ existe
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Aplica schema (idempotente — IF NOT EXISTS em todas as tabelas)
const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
db.exec(schema);

// Otimizações globais de performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = -16000'); // 16 MB

module.exports = db;
