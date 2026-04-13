/**
 * inferenceService.js
 * Executa YOLOv8 para detecção automática de implantes via Python subprocess.
 * Se nenhum modelo estiver deployed, retorna detecções vazias graciosamente.
 */
const { spawn } = require('child_process')
const path      = require('path')
const fs        = require('fs')
const { v4: uuidv4 } = require('uuid')
const db        = require('../database/db')

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
    const proc = spawn('python3', [script, imagePath, modelPath, String(conf)])
    let out = '', err = ''
    proc.stdout.on('data', d => out += d)
    proc.stderr.on('data', d => err += d)
    proc.on('close', code => {
      if (code !== 0) return reject(new Error(`detect.py falhou: ${err}`))
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
    // Nenhum modelo deployed — imagem fica pending, sem anotações automáticas
    return { detected: 0, model_id: null, skipped: true }
  }

  if (!fs.existsSync(model.model_path)) {
    console.warn(`[inference] model_path não encontrado: ${model.model_path}`)
    return { detected: 0, model_id: model.id, skipped: true }
  }

  let detections = []
  try {
    detections = await runYolo(imagePath, model.model_path)
  } catch (e) {
    console.error('[inference] Erro no YOLOv8:', e.message)
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

  return { detected: detections.length, model_id: model.id, skipped: false }
}

module.exports = { detectAndSave, getDeployedModel }
