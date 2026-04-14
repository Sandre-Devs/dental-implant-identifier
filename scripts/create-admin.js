require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');

const name     = process.env.ADMIN_NAME     || 'Administrador';
const email    = process.env.ADMIN_EMAIL    || 'admin@dii.sandre.dev';
const password = process.env.ADMIN_PASSWORD || 'DII@admin2025!';

const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
if (exists) {
  console.log('⚠️  Admin já existe:', email);
  process.exit(0);
}

const id     = uuidv4();
const hashed = bcrypt.hashSync(password, 12);
db.prepare('INSERT INTO users (id,name,email,password,role) VALUES (?,?,?,?,?)')
  .run(id, name, email, hashed, 'admin');

console.log('✅ Admin criado com sucesso!');
console.log('   E-mail  :', email);
console.log('   Senha   :', password);
console.log('   ⚠️  Altere a senha após o primeiro login!\n');
