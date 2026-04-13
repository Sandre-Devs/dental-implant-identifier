const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { requireAuth, requireRole } = require('../middleware/auth');

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

n  res.json({ message: 'Modelo deployado com sucesso.' });
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

module.exports = router;
