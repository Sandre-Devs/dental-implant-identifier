const jwt = require('jsonwebtoken');
const db  = require('../database/db');

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-in-production';

/**
 * Verifica Bearer token e injeta req.user
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Token não fornecido.' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, name, email, role, active FROM users WHERE id = ?').get(payload.sub);

    if (!user || !user.active) {
      return res.status(401).json({ error: 'Usuário inativo ou não encontrado.' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}

/**
 * Restringe acesso por roles. Uso: requireRole('admin') ou requireRole(['admin','reviewer'])
 */
function requireRole(...roles) {
  const allowed = roles.flat();
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({ error: 'Permissão insuficiente.' });
    }
    next();
  };
}

/**
 * Gera access token (1h) + refresh token (7d)
 */
function generateTokens(userId) {
  const access = jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '1h' });
  const refresh = jwt.sign({ sub: userId, type: 'refresh' }, JWT_SECRET, { expiresIn: '7d' });
  return { access, refresh };
}

module.exports = { requireAuth, requireRole, generateTokens };
