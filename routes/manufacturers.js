const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const db = require('../database/db');
const { requireAuth, requireRole } = require('../middleware/auth');

// GET /api/manufacturers
router.get('/', requireAuth, (req, res) => {
  const manufacturers = db.prepare(`
    SELECT m.*, COUNT(s.id) as system_count
    FROM manufacturers m
    LEFT JOIN implant_systems s ON s.manufacturer_id = m.id AND s.active = 1
    WHERE m.active = 1
    GROUP BY m.id
    ORDER BY m.name
  `).all();
  res.json(manufacturers);
});

// GET /api/manufacturers/:id/systems
router.get('/:id/systems', requireAuth, (req, res) => {
  const systems = db.prepare(`
    SELECT s.*, COUNT(c.id) as component_count
    FROM implant_systems s
    LEFT JOIN components c ON c.system_id = s.id AND c.active = 1
    WHERE s.manufacturer_id = ? AND s.active = 1
    GROUP BY s.id
    ORDER BY s.name
  `).all(req.params.id);
  res.json(systems);
});

// GET /api/manufacturers/systems/:systemId/components
router.get('/systems/:systemId/components', requireAuth, (req, res) => {
  const components = db.prepare(`
    SELECT * FROM components WHERE system_id = ? AND active = 1 ORDER BY type, name
  `).all(req.params.systemId);
  res.json(components);
});

// POST /api/manufacturers — admin only
router.post('/', requireAuth, requireRole('admin'),
  body('name').notEmpty().trim(),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, country, website } = req.body;
    const exists = db.prepare('SELECT id FROM manufacturers WHERE name = ?').get(name);
    if (exists) return res.status(409).json({ error: 'Fabricante já cadastrado.' });

    const id = uuidv4();
    db.prepare('INSERT INTO manufacturers (id,name,country,website) VALUES (?,?,?,?)').run(id,name,country,website);
    res.status(201).json({ id, name, country, website });
  }
);

// POST /api/manufacturers/:id/systems — admin only
router.post('/:id/systems', requireAuth, requireRole('admin'),
  body('name').notEmpty().trim(),
  body('connection_type').isIn(['cone_morse','hex_interno','hex_externo','trilobe','octogono','spline','desconhecido']),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, connection_type, platform, notes } = req.body;
    const id = uuidv4();
    db.prepare('INSERT INTO implant_systems (id,manufacturer_id,name,connection_type,platform,notes) VALUES (?,?,?,?,?,?)')
      .run(id, req.params.id, name, connection_type, platform, notes);
    res.status(201).json({ id, name, connection_type });
  }
);

// POST /api/manufacturers/systems/:systemId/components — admin only
router.post('/systems/:systemId/components', requireAuth, requireRole('admin'),
  body('name').notEmpty().trim(),
  body('type').isIn(['cicatrizador','munhao','pilar','pilar_angulado','pilar_estetico','protese','outro']),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, type, diameter, height, notes } = req.body;
    const id = uuidv4();
    db.prepare('INSERT INTO components (id,system_id,name,type,diameter,height,notes) VALUES (?,?,?,?,?,?,?)')
      .run(id, req.params.systemId, name, type, diameter, height, notes);
    res.status(201).json({ id, name, type });
  }
);

module.exports = router;
