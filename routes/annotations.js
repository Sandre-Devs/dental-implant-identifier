const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { requireAuth, requireRole } = require('../middleware/auth');

// GET /api/annotations?image_id=
router.get('/', requireAuth, (req, res) => {
  const { image_id } = req.query;
  if (!image_id) return res.status(400).json({ error: 'image_id obrigatório.' });

  const annotations = db.prepare(`
    SELECT a.*,
      m.name as manufacturer_name,
      s.name as system_name, s.connection_type,
      u.name as annotator_name,
      r.name as reviewer_name
    FROM annotations a
    LEFT JOIN manufacturers m  ON m.id = a.manufacturer_id
    LEFT JOIN implant_systems s ON s.id = a.system_id
    LEFT JOIN users u           ON u.id = a.annotator_id
    LEFT JOIN users r           ON r.id = a.reviewer_id
    WHERE a.image_id = ?
    ORDER BY a.created_at
  `).all(image_id);
  res.json(annotations);
});

// POST /api/annotations
router.post('/', requireAuth,
  body('image_id').notEmpty(),
  body('bbox_x').isFloat({ min: 0, max: 1 }).optional(),
  body('bbox_y').isFloat({ min: 0, max: 1 }).optional(),
  body('bbox_w').isFloat({ min: 0, max: 1 }).optional(),
  body('bbox_h').isFloat({ min: 0, max: 1 }).optional(),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { image_id, bbox_x, bbox_y, bbox_w, bbox_h,
            manufacturer_id, system_id, confidence,
            position_fdi, diameter_mm, length_mm,
            bone_level, osseointegrated, notes } = req.body;

    const image = db.prepare('SELECT id FROM images WHERE id = ?').get(image_id);
    if (!image) return res.status(404).json({ error: 'Imagem não encontrada.' });

    const id = uuidv4();
    db.prepare(`
      INSERT INTO annotations
        (id, image_id, annotator_id, bbox_x, bbox_y, bbox_w, bbox_h,
         manufacturer_id, system_id, confidence, position_fdi,
         diameter_mm, length_mm, bone_level, osseointegrated, notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(id, image_id, req.user.id, bbox_x, bbox_y, bbox_w, bbox_h,
           manufacturer_id, system_id, confidence || 'low', position_fdi,
           diameter_mm, length_mm, bone_level, osseointegrated ? 1 : 0, notes);

    // Atualiza status da imagem para 'annotating' se era pending
    db.prepare(`
      UPDATE images SET status = 'annotating', updated_at = datetime('now')
      WHERE id = ? AND status = 'pending'
    `).run(image_id);

    res.status(201).json({ id });
  }
);

// PATCH /api/annotations/:id
router.patch('/:id', requireAuth, (req, res) => {
  const annotation = db.prepare('SELECT * FROM annotations WHERE id = ?').get(req.params.id);
  if (!annotation) return res.status(404).json({ error: 'Anotação não encontrada.' });

  // Anotador só edita próprias anotações em rascunho
  if (req.user.role === 'annotator' && annotation.annotator_id !== req.user.id) {
    return res.status(403).json({ error: 'Você só pode editar suas próprias anotações.' });
  }
  if (req.user.role === 'annotator' && annotation.status !== 'draft') {
    return res.status(400).json({ error: 'Só é possível editar anotações em rascunho.' });
  }

  const EDITABLE = ['bbox_x','bbox_y','bbox_w','bbox_h','manufacturer_id','system_id',
                    'confidence','position_fdi','diameter_mm','length_mm',
                    'bone_level','osseointegrated','notes','status'];
  const fields = Object.keys(req.body).filter(k => EDITABLE.includes(k));
  if (!fields.length) return res.status(400).json({ error: 'Nenhum campo válido.' });

  const sets = fields.map(f => `${f} = ?`).join(', ');
  const vals = fields.map(f => req.body[f]);
  db.prepare(`UPDATE annotations SET ${sets}, updated_at = datetime('now') WHERE id = ?`)
    .run(...vals, req.params.id);

  res.json({ message: 'Anotação atualizada.' });
});

// POST /api/annotations/:id/review — reviewer aprova ou rejeita
router.post('/:id/review', requireAuth, requireRole('admin','reviewer'),
  body('status').isIn(['approved','rejected']),
  body('reject_reason').if(body('status').equals('rejected')).notEmpty(),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { status, reject_reason } = req.body;
    const annotation = db.prepare('SELECT * FROM annotations WHERE id = ?').get(req.params.id);
    if (!annotation) return res.status(404).json({ error: 'Anotação não encontrada.' });

    db.prepare(`
      UPDATE annotations
      SET status = ?, reviewer_id = ?, reject_reason = ?, reviewed_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(status, req.user.id, reject_reason || null, req.params.id);

    // Atualiza status da imagem se todas as anotações estão aprovadas
    const pending = db.prepare(`
      SELECT COUNT(*) as c FROM annotations WHERE image_id = ? AND status NOT IN ('approved','rejected')
    `).get(annotation.image_id).c;

    if (pending === 0) {
      db.prepare(`UPDATE images SET status = 'reviewed', updated_at = datetime('now') WHERE id = ?`)
        .run(annotation.image_id);
    }

    res.json({ message: `Anotação ${status}.` });
  }
);

// DELETE /api/annotations/:id
router.delete('/:id', requireAuth, (req, res) => {
  const annotation = db.prepare('SELECT * FROM annotations WHERE id = ?').get(req.params.id);
  if (!annotation) return res.status(404).json({ error: 'Anotação não encontrada.' });

  if (req.user.role !== 'admin' && annotation.annotator_id !== req.user.id) {
    return res.status(403).json({ error: 'Permissão insuficiente.' });
  }

  db.prepare('DELETE FROM annotations WHERE id = ?').run(req.params.id);
  res.json({ message: 'Anotação removida.' });
});

module.exports = router;
