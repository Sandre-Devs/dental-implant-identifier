/**
 * inferenceService.js
 * Pipeline de detecção com suporte a dois modelos independentes:
 *   - Modelo "manufacturer"      → detecta bbox + identifica fabricante
 *   - Modelo "connection_type"   → detecta bbox + identifica CM/HI/HE
 * Os dois rodam em paralelo; os resultados são mesclados por IoU nas bboxes.
 */
const { spawn }     = require('child_process')
const PYTHON = (() => {
  const venv = require('path').resolve(__dirname, '../venv-ml/bin/python3')
  return require('fs').existsSync(venv) ? venv : 'python3'
})()
const path              = require('path')
const fs                = require('fs')
const { v4: uuidv4 }    = require('uuid')
const db                = require('../database/db')
const detectionLogger   = require('../utils/detectionLogger')

// Mapa de connection_type curto → coluna do banco
const CONN_LABEL_MAP = { CM:'cone_morse', HI:'hex_interno', HE:'hex_externo', TR:'trilobe' }

/** Retorna todos os modelos deployed, agrupados por task */
function getDeployedModels() {
  const rows = db.prepare(
    `SELECT * FROM ml_models WHERE status = 'deployed' ORDER BY updated_at DESC`
  ).all()
  // Por task, pega o mais recente
  const byTask = {}
  for (const r of rows) {
    const task = r.task || 'manufacturer'
    if (!byTask[task]) byTask[task] = r
  }
  return byTask   // { manufacturer: model, connection_type: model }
}

/** Executa YOLOv8 e retorna detecções normalizadas */
function runYolo(imagePath, modelPath, conf = 0.25) {
  return new Promise((resolve, reject) => {
    const script = path.resolve(__dirname, '../scripts/detect.py')
    const proc   = spawn(PYTHON, [script, imagePath, modelPath, String(conf)])
    let out = '', err = ''
    proc.stdout.on('data', d => { out += d })
    proc.stderr.on('data', d => {
      err += d
      d.toString().split('\n').filter(Boolean).forEach(l =>
        detectionLogger.debug(`[Python] ${l.trim()}`)
      )
    })
    proc.on('close', code => {
      if (code !== 0) return reject(new Error(`detect.py falhou: ${err}`))
      try { resolve(JSON.parse(out)) }
      catch(e) { reject(new Error(`JSON inválido: ${out.slice(0,200)}`)) }
    })
  })
}

/** IoU entre duas bboxes (formato xywh normalizado) */
function iou(a, b) {
  const ax2 = a.bbox_x + a.bbox_w, ay2 = a.bbox_y + a.bbox_h
  const bx2 = b.bbox_x + b.bbox_w, by2 = b.bbox_y + b.bbox_h
  const ix  = Math.max(0, Math.min(ax2,bx2) - Math.max(a.bbox_x,b.bbox_x))
  const iy  = Math.max(0, Math.min(ay2,by2) - Math.max(a.bbox_y,b.bbox_y))
  const inter = ix * iy
  if (!inter) return 0
  return inter / (a.bbox_w*a.bbox_h + b.bbox_w*b.bbox_h - inter)
}

/**
 * Carrega o mapa class_name → manufacturer_id de um modelo
 * a partir do classes.json gerado na exportação.
 */
function loadClassMap(model) {
  try {
    const dsId = model.dataset_id
    if (!dsId) return {}
    const ds   = db.prepare('SELECT export_path FROM datasets WHERE id=?').get(dsId)
    if (!ds?.export_path) return {}
    const cjPath = path.join(ds.export_path, 'classes.json')
    if (!fs.existsSync(cjPath)) return {}
    return JSON.parse(fs.readFileSync(cjPath, 'utf8'))
  } catch { return {} }
}

/**
 * Pipeline principal — dois modelos em cascata:
 * 1. Roda ambos os modelos deployed em paralelo
 * 2. Usa detecções do modelo "manufacturer" como base (bboxes de referência)
 *    Se não houver modelo de fabricante, usa o de connection_type
 * 3. Para cada bbox base, procura bbox correspondente (IoU > 0.4) no outro modelo
 * 4. Persiste annotation com manufacturer_id + connection_type preenchidos
 */
async function detectAndSave({ imageId, imagePath, uploadedBy }) {
  const models = getDeployedModels()

  if (!models.manufacturer && !models.connection_type) {
    detectionLogger.warn('Nenhum modelo deployed — detecção ignorada', { imageId })
    return { detected: 0, model_id: null, skipped: true }
  }

  // ── Roda os modelos em paralelo ───────────────────────────────
  const runIfExists = async (model) => {
    if (!model || !model.model_path || !fs.existsSync(model.model_path)) return []
    try { return await runYolo(imagePath, model.model_path) }
    catch(e) {
      detectionLogger.error(`Erro YOLOv8 [${model.task}]: ${e.message}`)
      return []
    }
  }

  const t0 = Date.now()
  const [mfrDets, connDets] = await Promise.all([
    runIfExists(models.manufacturer),
    runIfExists(models.connection_type),
  ])
  detectionLogger.info(`YOLOv8 em ${Date.now()-t0}ms — mfr:${mfrDets.length} conn:${connDets.length}`, { imageId })

  // ── Carrega mapas de classes ──────────────────────────────────
  const mfrClassMap  = models.manufacturer    ? loadClassMap(models.manufacturer)   : {}
  const connClassMap = models.connection_type ? loadClassMap(models.connection_type) : {}

  // class_name → manufacturer_id
  const classToMfr = {}
  if (mfrClassMap.classes) {
    mfrClassMap.classes.forEach(name => {
      const row = db.prepare('SELECT id FROM manufacturers WHERE name=? COLLATE NOCASE').get(name)
      if (row) classToMfr[name] = row.id
    })
  }

  // ── Base de detecções — prefere modelo de fabricante ─────────
  const baseDets = mfrDets.length ? mfrDets : connDets
  const auxDets  = mfrDets.length ? connDets : []

  // ── Mescla: para cada base, acha a aux com melhor IoU ────────
  const merged = baseDets.map(base => {
    let bestConn = null, bestIou = 0
    for (const aux of auxDets) {
      const score = iou(base, aux)
      if (score > 0.4 && score > bestIou) { bestIou = score; bestConn = aux }
    }
    return { base, aux: bestConn }
  })

  // ── Insere annotations ────────────────────────────────────────
  const usedModelId = models.manufacturer?.id || models.connection_type?.id

  const insertAnn = db.prepare(`
    INSERT INTO annotations
      (id, image_id, annotator_id,
       bbox_x, bbox_y, bbox_w, bbox_h,
       confidence, auto_detected, ai_model_id, ai_confidence,
       manufacturer_id, system_id, status)
    VALUES (?,?,?,?,?,?,?,?,1,?,?,?,?,'draft')
  `)

  const insertMany = db.transaction(items => {
    for (const { base, aux } of items) {
      // Fabricante: vem do modelo manufacturer (base) ou nulo
      const mfrName = mfrDets.length ? base.class_name : null
      const mfrId   = mfrName ? (classToMfr[mfrName] || null) : null

      // Tipo de conexão: vem do modelo connection_type (aux se base=mfr, ou base se base=conn)
      const connDet   = mfrDets.length ? aux : base
      const connLabel = connDet?.class_name   // ex: "CM", "HI", "HE"
      const connType  = connLabel ? (CONN_LABEL_MAP[connLabel] || null) : null

      // Tenta achar system_id que case com fabricante + connection_type
      let systemId = null
      if (mfrId && connType) {
        const sys = db.prepare(`
          SELECT id FROM implant_systems
          WHERE manufacturer_id=? AND connection_type=? AND active=1
          LIMIT 1
        `).get(mfrId, connType)
        systemId = sys?.id || null
      }

      insertAnn.run(
        uuidv4(), imageId, uploadedBy,
        base.bbox_x, base.bbox_y, base.bbox_w, base.bbox_h,
        'low',
        usedModelId, base.confidence,
        mfrId, systemId
      )
    }
  })
  insertMany(merged)

  if (merged.length > 0) {
    db.prepare(`UPDATE images SET status='annotating', updated_at=datetime('now') WHERE id=?`)
      .run(imageId)
  }

  db.prepare(`
    INSERT INTO inferences (id, image_id, model_id, detections, created_at)
    VALUES (?,?,?,?,datetime('now'))
  `).run(uuidv4(), imageId, usedModelId, JSON.stringify(baseDets))

  detectionLogger.success('✅ Pipeline concluído', { imageId, detected: merged.length })
  return { detected: merged.length, model_id: usedModelId, skipped: false }
}

module.exports = { detectAndSave, getDeployedModels }
