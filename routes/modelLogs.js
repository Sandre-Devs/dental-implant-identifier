// routes/modelLogs.js
// Rotas de logs SSE + redetecção manual
// Montado ANTES de routes/models para evitar conflito com /:id

const express         = require('express');
const path            = require('path');
const router          = express.Router();
const detectionLogger = require('../utils/detectionLogger');
const { requireAuth, requireRole } = require('../middleware/auth');
const db              = require('../database/db');
const { detectAndSave } = require('../services/inferenceService');

const UPLOADS_DIR = path.resolve(__dirname, '../uploads');

// GET /api/models/logs/stream — SSE em tempo real
// EventSource do browser não suporta headers, então aceitamos token via query param
router.get('/logs/stream', (req, res) => {
  const jwt = require('jsonwebtoken');
  const db  = require('../database/db');
  const JWT_SECRET = process.env.JWT_SECRET || 'change-this-in-production';

  // Aceita token via Authorization header OU query param ?token=
  const header = req.headers.authorization || '';
  const raw    = header.startsWith('Bearer ') ? header.slice(7) : (req.query.token || null);

  if (!raw) return res.status(401).json({ error: 'Token não fornecido.' });

  let user;
  try {
    const payload = jwt.verify(raw, JWT_SECRET);
    user = db.prepare('SELECT id, name, role, active FROM users WHERE id = ?').get(payload.sub);
    if (!user || !user.active) return res.status(401).json({ error: 'Usuário inativo.' });
  } catch {
    return res.status(401).json({ error: 'Token inválido.' });
  }

  detectionLogger.addClient(res);
  detectionLogger.info('Cliente conectado ao stream de logs', { userId: user.id, ip: req.ip });
});

// GET /api/models/logs — histórico recente
router.get('/logs', requireAuth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 150, 500);
  res.json({ logs: detectionLogger.getLogs(limit) });
});

// DELETE /api/models/logs — limpar logs
router.delete('/logs', requireAuth, requireRole('admin'), (req, res) => {
  detectionLogger.clear();
  res.json({ success: true });
});

// POST /api/models/rerun/:imageId — redetecção manual de uma imagem
router.post('/rerun/:imageId', requireAuth, requireRole('admin'), async (req, res) => {
  const { imageId } = req.params;

  detectionLogger.info('▶ Redetecção solicitada', { imageId, by: req.user?.id });

  try {
    const image = db.prepare('SELECT * FROM images WHERE id = ?').get(imageId);
    if (!image) {
      detectionLogger.error('Imagem não encontrada', { imageId });
      return res.status(404).json({ error: 'Imagem não encontrada' });
    }
    detectionLogger.info(`Imagem localizada: ${image.filename}`, { imageId });

    // Remove anotações automáticas anteriores
    const deleted = db.prepare(
      'DELETE FROM annotations WHERE image_id = ? AND auto_detected = 1'
    ).run(imageId);
    if (deleted.changes > 0) {
      detectionLogger.warn(`${deleted.changes} anotação(ões) automática(s) removida(s)`, { imageId });
    }

    // Reset status para pending
    db.prepare("UPDATE images SET status = 'pending', updated_at = datetime('now') WHERE id = ?")
      .run(imageId);

    // Construir caminho real do arquivo (coluna 'filename' + pasta uploads)
    const imagePath = path.join(UPLOADS_DIR, image.filename);
    detectAndSave({ imageId, imagePath, uploadedBy: req.user.id })
      .then(result => {
        detectionLogger.success('✅ Redetecção concluída', {
          imageId,
          detected: result.detected,
          skipped:  result.skipped
        });
      })
      .catch(err => {
        detectionLogger.error(`❌ Erro na redetecção: ${err.message}`, { imageId });
      });

    res.json({ success: true, message: 'Redetecção iniciada', imageId });

  } catch (err) {
    detectionLogger.error(`Erro inesperado: ${err.message}`, { imageId, stack: err.stack });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;