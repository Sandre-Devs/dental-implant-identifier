/**
 * worker.js — DII Job Worker
 * Processa a fila de jobs: export_dataset e train_model
 * Roda como processo separado: node worker.js
 */

'use strict'

const path   = require('path')
const fs     = require('fs')
const { spawn } = require('child_process')

// Python com ultralytics instalado (venv-ml)
// Fallback para python3 global se o venv não existir
const PYTHON = (() => {
  const venv = require('path').resolve(__dirname, 'venv-ml/bin/python3')
  return require('fs').existsSync(venv) ? venv : 'python3'
})()

const { v4: uuidv4 } = require('uuid')
const db     = require('./database/db')

const POLL_INTERVAL = 5000          // checar fila a cada 5s
const EXPORTS_DIR   = path.resolve(__dirname, 'exports')
const UPLOADS_DIR   = path.resolve(__dirname, 'uploads')

fs.mkdirSync(EXPORTS_DIR, { recursive: true })

// ─────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────

function setJobRunning(jobId) {
  db.prepare(`UPDATE jobs SET status='running', started_at=datetime('now'), progress=0 WHERE id=?`).run(jobId)
}

function setJobDone(jobId, result = {}) {
  db.prepare(`UPDATE jobs SET status='completed', completed_at=datetime('now'), progress=100, result=? WHERE id=?`)
    .run(JSON.stringify(result), jobId)
}

function setJobFailed(jobId, error) {
  db.prepare(`UPDATE jobs SET status='failed', completed_at=datetime('now'), result=? WHERE id=?`)
    .run(JSON.stringify({ error: String(error) }), jobId)
  console.error(`[worker] Job ${jobId} FAILED:`, error)
}

function setProgress(jobId, progress, logLine = null) {
  const fields = []
  const vals   = []
  // Só atualiza progress se for um número válido
  if (progress != null) {
    fields.push('progress = ?')
    vals.push(Math.min(100, Math.max(0, progress)))
  }
  if (logLine) {
    const current = db.prepare('SELECT log_output FROM jobs WHERE id=?').get(jobId)
    const lines   = (current?.log_output || '').split('\n')
    lines.push(`[${new Date().toISOString()}] ${logLine}`)
    const trimmed = lines.slice(-500).join('\n')
    fields.push('log_output = ?')
    vals.push(trimmed)
  }
  if (fields.length === 0) return
  db.prepare(`UPDATE jobs SET ${fields.join(', ')} WHERE id=?`).run(...vals, jobId)
}

function appendLog(jobId, line) {
  setProgress(jobId, null, line)  // progress=null => só appenda log, não zera progresso
}

// ─────────────────────────────────────────────────
// EXPORT DATASET (formato YOLO)
// ─────────────────────────────────────────────────

async function exportDataset(job) {
  const { dataset_id } = JSON.parse(job.payload)
  setJobRunning(job.id)
  setProgress(job.id, 5, `Iniciando exportação do dataset ${dataset_id}`)

  const dataset = db.prepare('SELECT * FROM datasets WHERE id=?').get(dataset_id)
  if (!dataset) throw new Error('Dataset não encontrado')

  // Cria estrutura de diretórios YOLO
  const outDir = path.join(EXPORTS_DIR, `dataset_${dataset_id}`)
  for (const split of ['train','val','test']) {
    fs.mkdirSync(path.join(outDir, 'images', split), { recursive: true })
    fs.mkdirSync(path.join(outDir, 'labels', split), { recursive: true })
  }

  const items = db.prepare(`
    SELECT di.split, di.image_id, di.annotation_id,
           i.filename, i.width, i.height,
           a.bbox_x, a.bbox_y, a.bbox_w, a.bbox_h
    FROM dataset_images di
    JOIN images i      ON i.id = di.image_id
    JOIN annotations a ON a.id = di.annotation_id
    WHERE di.dataset_id = ?
  `).all(dataset_id)

  setProgress(job.id, 15, `${items.length} itens para exportar`)

  // Agrupa por imagem para juntar múltiplas annotations numa label
  const byImage = {}
  for (const item of items) {
    const key = `${item.split}|${item.image_id}`
    if (!byImage[key]) byImage[key] = { ...item, boxes: [] }
    byImage[key].boxes.push({ bbox_x: item.bbox_x, bbox_y: item.bbox_y, bbox_w: item.bbox_w, bbox_h: item.bbox_h })
  }

  let done = 0, total = Object.keys(byImage).length
  for (const [key, item] of Object.entries(byImage)) {
    const [split] = key.split('|')
    const src = path.join(UPLOADS_DIR, item.filename)
    const ext = path.extname(item.filename)
    const stem = path.basename(item.filename, ext)

    // Copia imagem
    const imgDst = path.join(outDir, 'images', split, item.filename)
    if (fs.existsSync(src)) fs.copyFileSync(src, imgDst)

    // Escreve label YOLO (class cx cy w h — classe 0 = implant)
    const labelLines = item.boxes.map(b => {
      const cx = (b.bbox_x + b.bbox_w / 2).toFixed(6)
      const cy = (b.bbox_y + b.bbox_h / 2).toFixed(6)
      return `0 ${cx} ${cy} ${b.bbox_w.toFixed(6)} ${b.bbox_h.toFixed(6)}`
    })
    fs.writeFileSync(path.join(outDir, 'labels', split, `${stem}.txt`), labelLines.join('\n'))

    done++
    if (done % 10 === 0) {
      const pct = 15 + Math.round((done / total) * 70)
      setProgress(job.id, pct, `Exportado ${done}/${total}`)
    }
  }

  // data.yaml
  const yaml = [
    `path: ${outDir}`,
    `train: images/train`,
    `val: images/val`,
    `test: images/test`,
    ``,
    `nc: 1`,
    `names: ['implant']`
  ].join('\n')
  const yamlPath = path.join(outDir, 'data.yaml')
  fs.writeFileSync(yamlPath, yaml)

  // Atualiza dataset no banco
  db.prepare(`UPDATE datasets SET status='ready', export_path=?, updated_at=datetime('now') WHERE id=?`)
    .run(outDir, dataset_id)

  setProgress(job.id, 100, `Exportação concluída em ${outDir}`)
  setJobDone(job.id, { export_path: outDir, yaml: yamlPath, total_images: total })
  console.log(`[worker] Dataset exportado: ${outDir}`)
}

// ─────────────────────────────────────────────────
// TRAIN MODEL (YOLOv8)
// ─────────────────────────────────────────────────

function trainModel(job) {
  return new Promise((resolve, reject) => {
    const { model_id, dataset_id, epochs, architecture } = JSON.parse(job.payload)
    setJobRunning(job.id)
    setProgress(job.id, 1, `Iniciando treino — ${architecture}, ${epochs} épocas`)

    const model = db.prepare('SELECT * FROM ml_models WHERE id=?').get(model_id)
    if (!model) return reject(new Error('Modelo não encontrado'))

    const dataset = db.prepare('SELECT * FROM datasets WHERE id=?').get(dataset_id)
    if (!dataset || !dataset.export_path) return reject(new Error('Dataset não exportado. Execute a exportação primeiro.'))

    const yamlPath  = path.join(dataset.export_path, 'data.yaml')
    if (!fs.existsSync(yamlPath)) return reject(new Error(`data.yaml não encontrado: ${yamlPath}`))

    const runDir    = path.join(EXPORTS_DIR, `run_${model_id}`)
    fs.mkdirSync(runDir, { recursive: true })

    // Script Python inline para treino
    const trainScript = path.join(runDir, 'train.py')
    fs.writeFileSync(trainScript, `
import sys, json, os
sys.stdout.reconfigure(line_buffering=True)

try:
    from ultralytics import YOLO
except ImportError:
    print("ERROR: ultralytics não instalado. Execute: pip3 install ultralytics")
    sys.exit(1)

model_path = '${architecture}.pt'
data_yaml  = '${yamlPath.replace(/\\/g, '/')}'
epochs     = ${epochs}
project    = '${runDir.replace(/\\/g, '/')}'
name       = 'train'

print(f"INIT: Carregando modelo base {model_path}")
model = YOLO(model_path)

print(f"INIT: Iniciando treino — {epochs} épocas")
results = model.train(
    data=data_yaml,
    epochs=epochs,
    project=project,
    name=name,
    exist_ok=True,
    verbose=True,
    plots=True,
    patience=20,
    batch=8,
    imgsz=640,
    device='cpu',
)

# Métricas finais
metrics_path = os.path.join(project, name, 'results.json')
try:
    box = results.results_dict
    print(f"METRICS:{json.dumps(box)}")
except:
    pass

best_pt = os.path.join(project, name, 'weights', 'best.pt')
print(f"BEST_MODEL:{best_pt}")
print("DONE")
`)

    setProgress(job.id, 2, `Script de treino gerado, iniciando Python...`)

    const proc = spawn(PYTHON, [trainScript], { cwd: runDir })
    let epochsDone = 0

    proc.stdout.on('data', chunk => {
      const text = chunk.toString()
      const lines = text.split('\n').filter(Boolean)

      for (const line of lines) {
        console.log(`[train] ${line}`)
        appendLog(job.id, line)

        // Detecta progresso de época: "Epoch X/Y" ou linha com números da época
        const epochMatch = line.match(/[Ee]poch[\s:]+(\d+)\/(\d+)/i)
        if (epochMatch) {
          epochsDone = parseInt(epochMatch[1])
          const total  = parseInt(epochMatch[2])
          const pct    = Math.round(2 + (epochsDone / total) * 90)
          db.prepare(`UPDATE jobs SET progress=? WHERE id=?`).run(pct, job.id)
        }

        // Métricas finais
        if (line.startsWith('METRICS:')) {
          try {
            const metrics = JSON.parse(line.replace('METRICS:', ''))
            const map50   = metrics['metrics/mAP50(B)']   || null
            const map95   = metrics['metrics/mAP50-95(B)']|| null
            const prec    = metrics['metrics/precision(B)']|| null
            const recall  = metrics['metrics/recall(B)']  || null
            db.prepare(`
              UPDATE ml_models SET map50=?, map95=?, precision=?, recall=?, updated_at=datetime('now') WHERE id=?
            `).run(map50, map95, prec, recall, model_id)
            appendLog(job.id, `Métricas: mAP50=${map50?.toFixed ? (map50*100).toFixed(1)+'%' : map50}`)
          } catch(e) { console.error('[train] Erro ao parsear métricas:', e) }
        }

        // Caminho do melhor modelo
        if (line.startsWith('BEST_MODEL:')) {
          const bestPt = line.replace('BEST_MODEL:', '').trim()
          if (fs.existsSync(bestPt)) {
            db.prepare(`UPDATE ml_models SET model_path=?, updated_at=datetime('now') WHERE id=?`)
              .run(bestPt, model_id)
            appendLog(job.id, `Modelo salvo em: ${bestPt}`)
          }
        }
      }
    })

    proc.stderr.on('data', chunk => {
      const text = chunk.toString().trim()
      if (text) {
        // YOLOv8 usa stderr para progress normal, filtrar só erros reais
        const isRealError = /error|exception|traceback|no module/i.test(text)
        appendLog(job.id, (isRealError ? 'ERROR: ' : '') + text.slice(0, 300))
        if (isRealError) console.error('[train stderr]', text)
      }
    })

    proc.on('close', code => {
      if (code === 0) {
        db.prepare(`UPDATE ml_models SET status='completed', updated_at=datetime('now') WHERE id=?`).run(model_id)
        setJobDone(job.id, { model_id, epochs_done: epochsDone })
        setProgress(job.id, 100, 'Treino concluído com sucesso! ✓')
        console.log(`[worker] Treino concluído — modelo ${model_id}`)
        resolve()
      } else {
        db.prepare(`UPDATE ml_models SET status='failed', updated_at=datetime('now') WHERE id=?`).run(model_id)
        setJobFailed(job.id, `Processo Python encerrou com código ${code}`)
        reject(new Error(`exit code ${code}`))
      }
    })

    proc.on('error', err => {
      db.prepare(`UPDATE ml_models SET status='failed', updated_at=datetime('now') WHERE id=?`).run(model_id)
      setJobFailed(job.id, err.message)
      reject(err)
    })
  })
}

// ─────────────────────────────────────────────────
// LOOP PRINCIPAL
// ─────────────────────────────────────────────────

let running = false

async function processNext() {
  if (running) return
  const job = db.prepare(`
    SELECT * FROM jobs WHERE status='queued' ORDER BY created_at ASC LIMIT 1
  `).get()
  if (!job) return

  running = true
  console.log(`[worker] Processando job ${job.id} (${job.type})`)
  try {
    if (job.type === 'export_dataset') await exportDataset(job)
    else if (job.type === 'train_model')  await trainModel(job)
    else {
      setJobFailed(job.id, `Tipo de job desconhecido: ${job.type}`)
    }
  } catch (e) {
    setJobFailed(job.id, e.message)
  } finally {
    running = false
  }
}

console.log('[worker] DII Worker iniciado — aguardando jobs...')
setInterval(processNext, POLL_INTERVAL)
processNext() // processa imediatamente ao iniciar
