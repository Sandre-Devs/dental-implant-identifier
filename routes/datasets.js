const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs   = require('fs');
const db   = require('../database/db');
const { requireAuth, requireRole } = require('../middleware/auth');

// GET /api/datasets
router.get('/', requireAuth, (req, res) => {
  const datasets = db.prepare(`
    SELECT d.*, u.name as created_by_name
    FROM datasets d
    LEFT JOIN users u ON u.id = d.created_by
    ORDER BY d.created_at DESC
  `).all();
  res.json(datasets);
});

// GET /api/datasets/:id
router.get('/:id', requireAuth, (req, res) => {
  const dataset = db.prepare(`
    SELECT d.*, u.name as created_by_name,
      (SELECT COUNT(*) FROM dataset_images di WHERE di.dataset_id = d.id) as image_count
    FROM datasets d
    LEFT JOIN users u ON u.id = d.created_by
    WHERE d.id = ?
  `).get(req.params.id);
  if (!dataset) return res.status(404).json({ error: 'Dataset não encontrado.' });
  res.json(dataset);
});

// GET /api/datasets/:id/images
router.get('/:id/images', requireAuth, (req, res) => {
  const images = db.prepare(`
    SELECT di.*, i.filename, i.type, i.width, i.height,
      a.bbox_x, a.bbox_y, a.bbox_w, a.bbox_h,
      m.name as manufacturer_name, s.name as system_name
    FROM dataset_images di
    JOIN images i       ON i.id = di.image_id
    JOIN annotations a  ON a.id = di.annotation_id
    LEFT JOIN manufacturers m   ON m.id = a.manufacturer_id
    LEFT JOIN implant_systems s ON s.id = a.system_id
    WHERE di.dataset_id = ?
    ORDER BY di.split, i.original_name
  `).all(req.params.id);
  res.json(images);
});

// POST /api/datasets
router.post('/', requireAuth, requireRole('admin','reviewer'),
  body('name').notEmpty().trim(),
  body('export_format').isIn(['yolo','coco','pascal_voc']).optional(),
  body('split_train').isFloat({ min: 0.1, max: 0.9 }).optional(),
  body('split_val').isFloat({ min: 0.05, max: 0.5 }).optional(),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, description, export_format = 'yolo',
            split_train = 0.7, split_val = 0.2 } = req.body;
    const split_test = +(1 - split_train - split_val).toFixed(2);
    if (split_test < 0) return res.status(400).json({ error: 'Splits somam mais que 1.0.' });

    const id = uuidv4();
    db.prepare(`
      INSERT INTO datasets (id,name,description,export_format,split_train,split_val,split_test,created_by)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(id, name, description, export_format, split_train, split_val, split_test, req.user.id);

    res.status(201).json({ id, name, export_format, split_train, split_val, split_test });
  }
);

// POST /api/datasets/:id/add-approved — adiciona todas as anotações aprovadas ainda não incluídas
router.post('/:id/add-approved', requireAuth, requireRole('admin','reviewer'), (req, res) => {
  const dataset = db.prepare('SELECT * FROM datasets WHERE id = ?').get(req.params.id);
  if (!dataset) return res.status(404).json({ error: 'Dataset não encontrado.' });

  const approved = db.prepare(`
    SELECT a.id as annotation_id, a.image_id
    FROM annotations a
    WHERE a.status = 'approved'
      AND a.image_id NOT IN (
        SELECT di.image_id FROM dataset_images di WHERE di.dataset_id = ?
      )
  `).all(req.params.id);

  const addMany = db.transaction((items) => {
    let train = 0, val = 0, test = 0;
    const total = items.length;
    items.forEach((item, i) => {
      const ratio = i / total;
      const split = ratio < dataset.split_train ? 'train'
                  : ratio < dataset.split_train + dataset.split_val ? 'val' : 'test';
      if (split === 'train') train++;
      else if (split === 'val') val++;
      else test++;
      db.prepare(`
        INSERT OR IGNORE INTO dataset_images (id,dataset_id,image_id,annotation_id,split)
        VALUES (?,?,?,?,?)
      `).run(uuidv4(), req.params.id, item.image_id, item.annotation_id, split);
    });
    const totalNow = db.prepare('SELECT COUNT(*) as c FROM dataset_images WHERE dataset_id = ?')
      .get(req.params.id).c;
    db.prepare(`UPDATE datasets SET image_count = ?, status = 'ready', updated_at = datetime('now') WHERE id = ?`)
      .run(totalNow, req.params.id);
    return { added: total, train, val, test };
  });

  const result = addMany(approved);
  res.json(result);
});

// POST /api/datasets/:id/export — cria job de exportação
router.post('/:id/export', requireAuth, requireRole('admin','reviewer'), (req, res) => {
  const dataset = db.prepare('SELECT * FROM datasets WHERE id = ?').get(req.params.id);
  if (!dataset) return res.status(404).json({ error: 'Dataset não encontrado.' });
  if (dataset.image_count === 0) return res.status(400).json({ error: 'Dataset vazio.' });

  const jobId = uuidv4();
  db.prepare(`
    INSERT INTO jobs (id,type,status,payload,requested_by)
    VALUES (?,?,?,?,?)
  `).run(jobId, 'export_dataset', 'queued',
         JSON.stringify({ dataset_id: req.params.id, format: dataset.export_format }),
         req.user.id);

  res.status(202).json({ job_id: jobId, message: 'Job de exportação enfileirado.' });
});

module.exports = router;
