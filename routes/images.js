const router  = require('express').Router();
const path    = require('path');
const fs      = require('fs');
const sharp   = require('sharp');
const { v4: uuidv4 } = require('uuid');
const db      = require('../database/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { upload, handleUploadError } = require('../middleware/upload');
const { detectAndSave }  = require('../services/inferenceService');

// GET /api/images — lista com filtros + controle por role
router.get('/', requireAuth, (req, res) => {
  const { status, type, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  const user   = req.user;

  let where  = [];
  let params = [];

  if (status) { where.push('i.status = ?'); params.push(status); }
  if (type)   { where.push('i.type = ?');   params.push(type); }

  // Admin vê tudo; demais roles veem apenas imagens de usuários da mesma role
  if (user.role !== 'admin') {
    where.push(`u.role = ?`);
    params.push(user.role);
  }

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const rows = db.prepare(`
    SELECT i.*, u.name as uploader_name, u.role as uploader_role,
      (SELECT COUNT(*) FROM annotations a WHERE a.image_id = i.id) as annotation_count
    FROM images i
    LEFT JOIN users u ON u.id = i.uploaded_by
    ${whereClause}
    ORDER BY i.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, +limit, +offset);

  // Remove extensão do nome exibido
  const stripExt = name => name ? name.replace(/\.[^.]+$/, '') : name;
  const images = rows.map(img => ({ ...img, original_name: stripExt(img.original_name) }));

  const total = db.prepare(`
    SELECT COUNT(*) as c FROM images i
    LEFT JOIN users u ON u.id = i.uploaded_by
    ${whereClause}
  `).get(...params).c;

  res.json({ images, total, page: +page, limit: +limit, pages: Math.ceil(total / limit) });
});

// GET /api/images/stats
router.get('/stats', requireAuth, (req, res) => {
  const stats = db.prepare(`
    SELECT
      COUNT(*)                                                         AS total,
      SUM(CASE WHEN type='panoramica'  THEN 1 ELSE 0 END)             AS panoramica,
      SUM(CASE WHEN type='periapical'  THEN 1 ELSE 0 END)             AS periapical,
      SUM(CASE WHEN type='cbct'        THEN 1 ELSE 0 END)             AS cbct,
      SUM(CASE WHEN status='pending'   THEN 1 ELSE 0 END)             AS pending,
      SUM(CASE WHEN status='annotating' THEN 1 ELSE 0 END)            AS annotating,
      SUM(CASE WHEN status='reviewed'  THEN 1 ELSE 0 END)             AS reviewed,
      SUM(CASE WHEN status='approved'  THEN 1 ELSE 0 END)             AS approved,
      SUM(CASE WHEN status='rejected'  THEN 1 ELSE 0 END)             AS rejected
    FROM images
  `).get();

  // Contagens de anotações por status (para o dashboard)
  const annStats = db.prepare(`
    SELECT
      COUNT(*)                                                          AS total_annotations,
      SUM(CASE WHEN status='draft'     THEN 1 ELSE 0 END)              AS annotations_draft,
      SUM(CASE WHEN status='submitted' THEN 1 ELSE 0 END)              AS annotations_submitted,
      SUM(CASE WHEN status='approved'  THEN 1 ELSE 0 END)              AS annotations_approved,
      SUM(CASE WHEN status='rejected'  THEN 1 ELSE 0 END)              AS annotations_rejected
    FROM annotations
  `).get();

  res.json({ ...stats, ...annStats });
});

// POST /api/images/upload
router.post('/upload', requireAuth,
  upload.array('files', 20),
  handleUploadError,
  async (req, res) => {
    const { type = 'panoramica' } = req.body;
    const VALID_TYPES = ['panoramica','periapical','oclusal','outro'];
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: 'Tipo de imagem inválido.' });
    }
    if (!req.files?.length) {
      return res.status(400).json({ error: 'Nenhuma imagem enviada.' });
    }

    const inserted = [];

    for (const file of req.files) {
      let width = null, height = null;
      try {
        const meta = await sharp(file.path).metadata();
        width  = meta.width;
        height = meta.height;
      } catch {}

      const id = uuidv4();
      db.prepare(`
        INSERT INTO images (id,filename,original_name,mime_type,size,width,height,type,uploaded_by)
        VALUES (?,?,?,?,?,?,?,?,?)
      // Gerar hash anônimo — nunca persistir nome do paciente
      const _ext      = require('path').extname(file.originalname).toLowerCase() || '.jpg';
      const _anonName = require('crypto').createHash('sha256')
                          .update(id + file.originalname + Date.now().toString())
                          .digest('hex').slice(0, 12) + _ext;
      `).run(id, file.filename, _anonName, file.mimetype, file.size, width, height, type, req.user.id);

      inserted.push({ id, filename: file.filename, original_name: _anonName.replace(/\.[^.]+$/, ''), width, height, type });
    }

    // Responde imediatamente — detecção roda em background
    res.status(201).json({ uploaded: inserted.length, images: inserted });

    // Background: roda inferência em cada imagem (não bloqueia a resposta)
    setImmediate(async () => {
      for (const img of inserted) {
        try {
          const filePath = path.resolve(__dirname, '../uploads', img.filename);
          const result   = await detectAndSave({
            imageId:    img.id,
            imagePath:  filePath,
            uploadedBy: req.user.id,
          });
          if (!result.skipped) {
            console.log(`[inference] ${img.original_name}: ${result.detected} implante(s) detectado(s)`);
          }
        } catch(e) {
          console.error(`[inference] Erro em ${img.original_name}:`, e.message);
        }
      }
    });
  }
);

// GET /api/images/:id
router.get('/:id', requireAuth, (req, res) => {
  const image = db.prepare(`
    SELECT i.*, u.name as uploader_name, u.role as uploader_role
    FROM images i
    LEFT JOIN users u ON u.id = i.uploaded_by
    WHERE i.id = ?
  `).get(req.params.id);
  if (!image) return res.status(404).json({ error: 'Imagem não encontrada.' });

  // Controle de acesso: não-admin só acessa imagens da mesma role
  if (req.user.role !== 'admin' && image.uploader_role !== req.user.role)
    return res.status(403).json({ error: 'Acesso negado.' });

  // Remove extensão do nome exibido
  image.original_name = image.original_name?.replace(/\.[^.]+$/, '') || image.original_name;
  res.json(image);
});

// GET /api/images/:id/file — serve o arquivo físico
router.get('/:id/file', requireAuth, (req, res) => {
  const image = db.prepare(`
    SELECT i.filename, i.mime_type, u.role as uploader_role
    FROM images i LEFT JOIN users u ON u.id = i.uploaded_by
    WHERE i.id = ?
  `).get(req.params.id);
  if (!image) return res.status(404).json({ error: 'Imagem não encontrada.' });

  // Controle de acesso por role
  if (req.user.role !== 'admin' && image.uploader_role !== req.user.role)
    return res.status(403).json({ error: 'Acesso negado.' });

  const filePath = path.resolve(__dirname, '../uploads', image.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Arquivo não encontrado no disco.' });

  res.setHeader('Content-Type', image.mime_type);
  res.sendFile(filePath);
});

// PATCH /api/images/:id/status
router.patch('/:id/status', requireAuth, requireRole('admin','reviewer'), (req, res) => {
  const VALID = ['pending','annotating','annotated','reviewed','approved','rejected'];
  const { status } = req.body;
  if (!VALID.includes(status)) return res.status(400).json({ error: 'Status inválido.' });

  db.prepare(`UPDATE images SET status = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(status, req.params.id);
  res.json({ message: 'Status atualizado.' });
});

// DELETE /api/images/:id — admin only
router.delete('/:id', requireAuth, requireRole('admin'), (req, res) => {
  const image = db.prepare('SELECT filename FROM images WHERE id = ?').get(req.params.id);
  if (!image) return res.status(404).json({ error: 'Imagem não encontrada.' });

  db.prepare('DELETE FROM images WHERE id = ?').run(req.params.id);

  const filePath = path.resolve(__dirname, '../uploads', image.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  res.json({ message: 'Imagem excluída.' });
});

module.exports = router;