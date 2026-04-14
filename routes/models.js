const router  = require('express').Router();
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const path    = require('path');
const fs      = require('fs');
const multer  = require('multer');
const db      = require('../database/db');
const { requireAuth, requireRole } = require('../middleware/auth');

// Multer para upload de modelos .pt
const MODELS_DIR = path.resolve(__dirname, '../models');
fs.mkdirSync(MODELS_DIR, { recursive: true });
const modelUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, MODELS_DIR),
    filename:    (req, file, cb) => cb(null, `${uuidv4()}.pt`)
  }),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
  fileFilter: (req, file, cb) => {
    const ok = file.originalname.endsWith('.pt') || file.mimetype === 'application/octet-stream'
    cb(ok ? null : new Error('Apenas arquivos .pt são aceitos.'), ok)
  }
});

// GET /api/models
router.get('/', requireAuth, (req, res) => {
  const models = db.prepare(`
    SELECT m.*, u.name as created_by_name, d.name as dataset_name
    FROM ml_models m
    LEFT JOIN users u ON u.id = m.created_by
    LEFT JOIN datasets d ON d.id = m.dataset_id
    ORDER BY m.created_at DESC
  `).all();
  res.json(models);
});

// GET /api/models/:id
router.get('/:id', requireAuth, (req, res) => {
  const model = db.prepare(`
    SELECT m.*, u.name as created_by_name, d.name as dataset_name
    FROM ml_models m
    LEFT JOIN users u ON u.id = m.created_by
    LEFT JOIN datasets d ON d.id = m.dataset_id
    WHERE m.id = ?
  `).get(req.params.id);
  if (!model) return res.status(404).json({ error: 'Modelo não encontrado.' });
  if (model.metrics_json) model.metrics = JSON.parse(model.metrics_json);
  res.json(model);
});

// POST /api/models/train — cria job de treino
router.post('/train', requireAuth, requireRole('admin'),
  body('name').notEmpty().trim(),
  body('dataset_id').notEmpty(),
  body('epochs').isInt({ min: 1, max: 300 }).optional(),
  body('architecture').isIn(['yolov8n','yolov8s','yolov8m','yolov8l','yolov8x']).optional(),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, dataset_id, epochs = 100, architecture = 'yolov8m', notes } = req.body;

    const dataset = db.prepare(`SELECT * FROM datasets WHERE id = ? AND status = 'ready'`).get(dataset_id);
    if (!dataset) return res.status(404).json({ error: 'Dataset não encontrado ou não está pronto.' });

    // Cria entrada do modelo
    const modelId = uuidv4();
    const version = `v${Date.now()}`;
    db.prepare(`
      INSERT INTO ml_models (id,name,version,dataset_id,architecture,epochs,status,notes,created_by)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(modelId, name, version, dataset_id, architecture, epochs, 'training', notes, req.user.id);

    // Cria job de treino
    const jobId = uuidv4();
    db.prepare(`
      INSERT INTO jobs (id,type,status,payload,requested_by)
      VALUES (?,?,?,?,?)
    `).run(jobId, 'train_model', 'queued',
           JSON.stringify({ model_id: modelId, dataset_id, epochs, architecture }),
           req.user.id);

    res.status(202).json({ model_id: modelId, job_id: jobId, message: 'Treino enfileirado.' });
  }
);

// PATCH /api/models/:id — atualiza métricas e status (chamado pelo serviço ML)
router.patch('/:id', requireAuth, requireRole('admin'), (req, res) => {
  const FIELDS = ['status','map50','map95','precision','recall','model_path','metrics_json','notes'];
  const fields = Object.keys(req.body).filter(k => FIELDS.includes(k));
  if (!fields.length) return res.status(400).json({ error: 'Nenhum campo válido.' });

  const sets = fields.map(f => `${f} = ?`).join(', ');
  const vals = fields.map(f => req.body[f]);
  db.prepare(`UPDATE ml_models SET ${sets}, updated_at = datetime('now') WHERE id = ?`)
    .run(...vals, req.params.id);

  res.json({ message: 'Modelo atualizado.' });
});

// POST /api/models/:id/deploy — marca como deployed
// POST /api/models/upload — recebe modelo .pt treinado externamente (ex: Colab)
router.post('/upload', requireAuth, requireRole('admin'), modelUpload.single('model'), (req, res) => {
  const { name, architecture, epochs, map50, map95, precision, recall, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'name obrigatório.' });

router.post('/:id/deploy', requireAuth, requireRole('admin'), (req, res) => {
  const model = db.prepare('SELECT * FROM ml_models WHERE id = ?').get(req.params.id);
  if (!model) return res.status(404).json({ error: 'Modelo não encontrado.' });
  if (model.status !== 'completed') {
    return res.status(400).json({ error: 'Apenas modelos concluídos podem ser deployados.' });
  }

  // Arquiva outros modelos deployed
  db.prepare(`UPDATE ml_models SET status = 'archived' WHERE status = 'deployed'`).run();
  db.prepare(`UPDATE ml_models SET status = 'deployed', updated_at = datetime('now') WHERE id = ?`)
    .run(req.params.id);

res.json({ message: 'Modelo deployado com sucesso.' });
});

// GET /api/models/:id/job — retorna job de treino + progress do modelo
router.get('/:id/job', requireAuth, (req, res) => {
  // Busca o job mais recente de train_model para este modelo
  // Usa LIKE no payload para evitar dependência de json_extract (compatibilidade SQLite)
  const job = db.prepare(`
    SELECT j.* FROM jobs j
    WHERE j.type = 'train_model'
      AND j.payload LIKE ?
    ORDER BY j.created_at DESC LIMIT 1
  `).get(`%${req.params.id}%`);
  if (!job) return res.status(404).json({ error: 'Job não encontrado.' });
  if (job.result)  try { job.result  = JSON.parse(job.result)  } catch {}
  if (job.payload) try { job.payload = JSON.parse(job.payload) } catch {}
  res.json(job);
});

// GET /api/models/:id/status — endpoint leve só para polling de progress (sem log_output)
router.get('/:id/status', requireAuth, (req, res) => {
  const row = db.prepare(`
    SELECT j.id, j.status, j.progress, j.started_at, j.completed_at
    FROM jobs j
    WHERE j.type = 'train_model' AND j.payload LIKE ?
    ORDER BY j.created_at DESC LIMIT 1
  `).get(`%${req.params.id}%`);
  if (!row) return res.status(404).json({ progress: 0, status: 'unknown' });
  res.json(row);
});

// GET /api/models/:id/logs — retorna log_output do job de treino
router.get('/:id/logs', requireAuth, (req, res) => {
  const row = db.prepare(`
    SELECT j.log_output, j.progress, j.status FROM jobs j
    WHERE j.type = 'train_model'
      AND j.payload LIKE ?
    ORDER BY j.created_at DESC LIMIT 1
  `).get(`%${req.params.id}%`);
  if (!row) return res.status(404).json({ log: '', progress: 0, status: 'unknown' });
  res.json({ log: row.log_output || '', progress: row.progress || 0, status: row.status });
});

// PATCH /api/jobs/:jobId/progress — atualiza progress + appenda log (chamado pelo serviço ML)
router.patch('/jobs/:jobId/progress', requireAuth, requireRole('admin'), (req, res) => {
  const { progress, log_line, status } = req.body;
  const job = db.prepare('SELECT id FROM jobs WHERE id = ?').get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job não encontrado.' });

  const fields = [];
  const vals   = [];

  if (progress != null) { fields.push('progress = ?'); vals.push(Math.min(100, Math.max(0, +progress))); }
  if (status)           { fields.push('status = ?');   vals.push(status); }
  if (log_line) {
    // Append ao log existente (máx 500 linhas para não explodir o DB)
    const current = db.prepare('SELECT log_output FROM jobs WHERE id = ?').get(req.params.jobId);
    const lines   = (current.log_output || '').split('\n');
    lines.push(`[${new Date().toISOString()}] ${log_line}`);
    const trimmed = lines.slice(-500).join('\n');
    fields.push('log_output = ?'); vals.push(trimmed);
  }
  if (!fields.length) return res.status(400).json({ error: 'Nada para atualizar.' });

  db.prepare(`UPDATE jobs SET ${fields.join(', ')} WHERE id = ?`).run(...vals, req.params.jobId);
  res.json({ ok: true });
});

// GET /api/models/jobs — lista jobs
router.get('/jobs/list', requireAuth, (req, res) => {
  const { status } = req.query;
  const where = status ? 'WHERE j.status = ?' : '';
  const params = status ? [status] : [];

  const jobs = db.prepare(`
    SELECT j.*, u.name as requested_by_name
    FROM jobs j
    LEFT JOIN users u ON u.id = j.requested_by
    ${where}
    ORDER BY j.created_at DESC
    LIMIT 50
  `).all(...params);
  res.json(jobs);
});




  // O arquivo vem via multipart (mesmo middleware de imagens)
  if (!req.file) return res.status(400).json({ error: 'Arquivo .pt não recebido.' });

  const modelId = req.file.filename.replace('.pt',''); // uuid já no filename
  const version = `v${new Date().toISOString().slice(0,10)}`;
  const dest    = req.file.path;

  db.prepare(`
    INSERT INTO ml_models
      (id,name,version,architecture,status,epochs,map50,map95,precision,recall,model_path,notes,created_by)
    VALUES (?,?,?,?,  'completed',  ?,    ?,    ?,    ?,        ?,      ?,         ?,    ?)
  `).run(modelId, name, version, architecture || 'yolov8s',
         epochs   ? +epochs   : null,
         map50    ? +map50    : null,
         map95    ? +map95    : null,
         precision? +precision: null,
         recall   ? +recall   : null,
         dest, notes || 'Modelo treinado externamente (Colab)', req.user.id);

  res.status(201).json({ model_id: modelId, model_path: dest, message: 'Modelo importado com sucesso.' });
});

// DELETE /api/models/:id — remove modelo e seu job (só failed/archived)
router.delete('/:id', requireAuth, requireRole('admin'), (req, res) => {
  const model = db.prepare('SELECT * FROM ml_models WHERE id = ?').get(req.params.id);
  if (!model) return res.status(404).json({ error: 'Modelo não encontrado.' });
  if (model.status === 'deployed')
    return res.status(400).json({ error: 'Não é possível deletar o modelo em produção. Arquive-o primeiro.' });

  // Remove jobs associados
  db.prepare(`DELETE FROM jobs WHERE type='train_model' AND payload LIKE ?`)
    .run(`%${req.params.id}%`);

  db.prepare('DELETE FROM ml_models WHERE id = ?').run(req.params.id);
  res.json({ message: 'Modelo removido.' });
});

// POST /api/models/:id/redeploy — redeploya modelo arquivado
router.post('/:id/redeploy', requireAuth, requireRole('admin'), (req, res) => {
  const model = db.prepare('SELECT * FROM ml_models WHERE id = ?').get(req.params.id);
  if (!model) return res.status(404).json({ error: 'Modelo não encontrado.' });
  if (!['archived', 'completed'].includes(model.status))
    return res.status(400).json({ error: 'Apenas modelos arquivados ou concluídos podem ser redeployados.' });
  if (!model.model_path) 
    return res.status(400).json({ error: 'Modelo não possui arquivo .pt salvo.' });

  // Arquiva o atual deployed
  db.prepare(`UPDATE ml_models SET status='archived', updated_at=datetime('now') WHERE status='deployed'`).run();
  db.prepare(`UPDATE ml_models SET status='deployed', updated_at=datetime('now') WHERE id=?`).run(req.params.id);
  res.json({ message: 'Modelo redeployado com sucesso.' });
});

module.exports = router;
