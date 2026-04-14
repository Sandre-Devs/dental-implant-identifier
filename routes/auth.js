const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db     = require('../database/db');
const { generateTokens, requireAuth } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-in-production';

// POST /api/auth/login
router.post('/login',
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }
    if (!user.active) {
      return res.status(403).json({ error: 'Conta desativada. Contate o administrador.' });
    }

    const { access, refresh } = generateTokens(user.id);
    res.json({
      token: access,
      refresh_token: refresh,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  }
);

// POST /api/auth/refresh
router.post('/refresh', (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) return res.status(400).json({ error: 'refresh_token obrigatório.' });

  try {
    const payload = jwt.verify(refresh_token, JWT_SECRET);
    if (payload.type !== 'refresh') throw new Error('tipo inválido');

    const user = db.prepare('SELECT id, active FROM users WHERE id = ?').get(payload.sub);
    if (!user || !user.active) return res.status(401).json({ error: 'Usuário inativo.' });

    const { access, refresh } = generateTokens(user.id);
    res.json({ token: access, refresh_token: refresh });
  } catch {
    res.status(401).json({ error: 'Refresh token inválido ou expirado.' });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth,
  body('current_password').notEmpty(),
  body('new_password').isLength({ min: 8 }),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { current_password, new_password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

    if (!bcrypt.compareSync(current_password, user.password)) {
      return res.status(400).json({ error: 'Senha atual incorreta.' });
    }

    const hashed = bcrypt.hashSync(new_password, 12);
    db.prepare('UPDATE users SET password = ?, updated_at = datetime("now") WHERE id = ?')
      .run(hashed, req.user.id);

    res.json({ message: 'Senha alterada com sucesso.' });
  }
);

module.exports = router;
