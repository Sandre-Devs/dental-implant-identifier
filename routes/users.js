const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { requireAuth, requireRole } = require('../middleware/auth');

// GET /api/users — admin only
router.get('/', requireAuth, requireRole('admin'), (req, res) => {
  const users = db.prepare(
    'SELECT id, name, email, role, active, created_at FROM users ORDER BY name'
  ).all();
  res.json(users);
});

// POST /api/users — admin cria usuário
router.post('/', requireAuth, requireRole('admin'),
  body('name').notEmpty().trim(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('role').isIn(['admin','annotator','reviewer','viewer']),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, email, password, role } = req.body;
    const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (exists) return res.status(409).json({ error: 'E-mail já cadastrado.' });

    const id     = uuidv4();
    const hashed = bcrypt.hashSync(password, 12);
    db.prepare(`INSERT INTO users (id,name,email,password,role) VALUES (?,?,?,?,?)`)
      .run(id, name, email, hashed, role);

    res.status(201).json({ id, name, email, role });
  }
);

// PATCH /api/users/:id — admin ou próprio usuário
router.patch('/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  if (req.user.role !== 'admin' && req.user.id !== id) {
    return res.status(403).json({ error: 'Permissão insuficiente.' });
  }

  const allowed = ['name'];
  if (req.user.role === 'admin') allowed.push('role', 'active');

  const fields = Object.keys(req.body).filter(k => allowed.includes(k));
  if (!fields.length) return res.status(400).json({ error: 'Nenhum campo válido para atualizar.' });

  const sets = fields.map(f => `${f} = ?`).join(', ');
  const vals = fields.map(f => req.body[f]);
  db.prepare(`UPDATE users SET ${sets}, updated_at = datetime('now') WHERE id = ?`)
    .run(...vals, id);

  res.json({ message: 'Usuário atualizado.' });
});

// DELETE /api/users/:id — admin only (soft delete)
router.delete('/:id', requireAuth, requireRole('admin'), (req, res) => {
  db.prepare(`UPDATE users SET active = 0, updated_at = datetime('now') WHERE id = ?`)
    .run(req.params.id);
  res.json({ message: 'Usuário desativado.' });
});

module.exports = router;
