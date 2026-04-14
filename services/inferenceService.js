/**
 * inferenceService.js
 * Executa YOLOv8 para detecção automática de implantes via Python subprocess.
 * Se nenhum modelo estiver deployed, retorna detecções vazias graciosamente.
 */
const { spawn } = require('child_process')

const PYTHON = (() => {
  const venv = require('path').resolve(__dirname, '../venv-ml/bin/python3')
  return require('fs').existsSync(venv) ? venv : 'python3'
})()
const path      = require('path')
const fs        = require('fs')
const { v4: uuidv4 } = require('uuid')
const db              = require('../database/db')
const detectionLogger = require('../utils/detectionLogger')

/** Retorna o modelo deployed ou null */
function getDeployedModel() {
  return db.prepare(
    `SELECT * FROM ml_models WHERE status = 'deployed' ORDER BY updated_at DESC LIMIT 1`
  ).get()
}

/**
 * Roda YOLOv8 numa imagem e retorna array de detecções:
 * [{ bbox_x, bbox_y, bbox_w, bbox_h, confidence, class_id, class_name }]
 * Coordenadas normalizadas 0-1 (formato YOLO).
 */
function runYolo(imagePath, modelPath, conf = 0.25) {
  return new Promise((resolve, reject) => {
    const script = path.resolve(__dirname, '../scripts/detect.py')
    const proc = spawn(PYTHON, [script, imagePath, modelPath, String(conf)])
    let out = '', err = ''
    proc.stdout.on('data', d => { out += d })
    proc.stderr.on('data', d => {
      err += d
      d.toString().split('\n').filter(Boolean).forEach(line =>
        detectionLogger.debug(`[Python] ${line.trim()}`)
      )
    })
    proc.on('close', code => {
      if (code !== 0) {
        detectionLogger.error(`detect.py falhou (código ${code})`, { stderr: err.slice(0, 500) })
        return reject(new Error(`detect.py falhou: ${err}`))
      }
      try { resolve(JSON.parse(out)) }
      catch(e) { reject(new Error(`JSON inválido: ${out}`)) }
    })
  })
}

/**
 * Pipeline principal:
 * 1. Busca modelo deployed
 * 2. Roda YOLOv8
 * 3. Salva detecções como annotations (draft, auto_detected=1)
 * 4. Atualiza status da imagem para 'annotating'
 * 5. Registra na tabela inferences
 *
 * @returns { detected: number, model_id: string|null, skipped: boolean }
 */
async function detectAndSave({ imageId, imagePath, uploadedBy }) {
  const model = getDeployedModel()

  if (!model || !model.model_path) {
    detectionLogger.warn('Nenhum modelo deployed — detecção ignorada', { imageId })
    return { detected: 0, model_id: null, skipped: true }
  }

  if (!fs.existsSync(model.model_path)) {
    detectionLogger.error('model_path não encontrado no disco', { path: model.model_path, modelId: model.id })
    return { detected: 0, model_id: model.id, skipped: true }
  }

  detectionLogger.info(`Modelo carregado: ${model.name}`, { modelId: model.id, path: model.model_path })

  detectionLogger.info('Executando YOLOv8...', { imageId, imagePath })
  let detections = []
  const t0 = Date.now()
  try {
    detections = await runYolo(imagePath, model.model_path)
    detectionLogger.success(`YOLOv8 concluído em ${Date.now()-t0}ms — ${detections.length} detecção(ões)`, { imageId })
  } catch (e) {
    detectionLogger.error(`Erro no YOLOv8: ${e.message}`, { imageId })
    return { detected: 0, model_id: model.id, skipped: true }
  }

  // Persiste detecções como anotações rascunho
  const insertAnn = db.prepare(`
    INSERT INTO annotations
      (id, image_id, annotator_id, bbox_x, bbox_y, bbox_w, bbox_h,
       confidence, auto_detected, ai_model_id, ai_confidence, status)
    VALUES (?,?,?,?,?,?,?,?,1,?,?,'draft')
  `)

  const insertMany = db.transaction(dets => {
    for (const d of dets) {
      insertAnn.run(
        uuidv4(), imageId, uploadedBy,
        d.bbox_x, d.bbox_y, d.bbox_w, d.bbox_h,
        'low',          // usuário preencherá depois
        model.id,
        d.confidence
      )
    }
  })
  insertMany(detections)

  // Status da imagem → annotating (tem detecções aguardando revisão humana)
  if (detections.length > 0) {
    db.prepare(`UPDATE images SET status='annotating', updated_at=datetime('now') WHERE id=?`)
      .run(imageId)
  }

  // Registra na tabela inferences
  db.prepare(`
    INSERT INTO inferences (id, image_id, model_id, detections, created_at)
    VALUES (?,?,?,?,datetime('now'))
  `).run(uuidv4(), imageId, model.id, JSON.stringify(detections))

  detectionLogger.success('✅ Pipeline concluído', { imageId, detected: detections.length })
  return { detected: detections.length, model_id: model.id, skipped: false }
}

module.exports = { detectAndSave, getDeployedModel }