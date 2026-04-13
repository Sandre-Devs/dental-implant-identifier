const router = require('express').Router()
const db     = require('../database/db')
const { requireAuth, requireRole } = require('../middleware/auth')

// GET /api/jobs — lista jobs do usuário (admin vê todos)
router.get('/', requireAuth, (req, res) => {
  const { type, status } = req.query
  let where = [], params = []

  if (req.user.role !== 'admin') {
    where.push('j.requested_by = ?'); params.push(req.user.id)
  }
  if (type)   { where.push('j.type = ?');   params.push(type) }
  if (status) { where.push('j.status = ?'); params.push(status) }

  const clause = where.length ? 'WHERE ' + where.join(' AND ') : ''
  const jobs = db.prepare(`
    SELECT j.*, u.name as requested_by_name
    FROM jobs j LEFT JOIN users u ON u.id = j.requested_by
    ${clause}
    ORDER BY j.created_at DESC LIMIT 50
  `).all(...params)

  res.json(jobs)
})

// GET /api/jobs/:id
router.get('/:id', requireAuth, (req, res) => {
  const job = db.prepare(`
    SELECT j.*, u.name as requested_by_name
    FROM jobs j LEFT JOIN users u ON u.id = j.requested_by
    WHERE j.id = ?
  `).get(req.params.id)
  if (!job) return res.status(404).json({ error: 'Job não encontrado.' })
  if (req.user.role !== 'admin' && job.requested_by !== req.user.id)
    return res.status(403).json({ error: 'Permissão negada.' })
  if (job.result) try { job.result = JSON.parse(job.result) } catch {}
  if (job.payload) try { job.payload = JSON.parse(job.payload) } catch {}
  res.json(job)
})

module.exports = router
