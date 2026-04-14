/**
 * scripts/bootstrap-dataset.js
 *
 * Baixa dataset público de implantes do Roboflow,
 * organiza em formato YOLO e registra no banco pronto para treino.
 *
 * Uso:
 *   node scripts/bootstrap-dataset.js <ROBOFLOW_API_KEY>
 *   node scripts/bootstrap-dataset.js <ROBOFLOW_API_KEY> --train
 */

'use strict'

const fs      = require('fs')
const path    = require('path')
const https   = require('https')
const http    = require('http')
const { execSync } = require('child_process')
const { v4: uuidv4 } = require('uuid')
const db      = require('../database/db')

const args       = process.argv.slice(2)
const API_KEY    = args.find(a => !a.startsWith('--'))
const AUTO_TRAIN = args.includes('--train')

if (!API_KEY) {
  console.error(`
  Uso: node scripts/bootstrap-dataset.js <ROBOFLOW_API_KEY> [--train]

  Como obter a API key:
    1. Crie conta gratuita em https://roboflow.com
    2. Settings -> Roboflow API -> Private API Key

  --train   Enfileira o treino automaticamente após o download
  `)
  process.exit(1)
}

const DATASET_META = {
  workspace:   'yosafat_chandra05-yahoo-com',
  project:     'dental-implants-2.0',
  version:     1,
  name:        'Dental Implants 2.0 (Roboflow Public)',
  description: 'Dataset público de radiografias com implantes dentários anotados. Fonte: Roboflow Universe.',
}

const ROOT        = path.resolve(__dirname, '..')
const EXPORTS_DIR = path.join(ROOT, 'exports')
const TMP_DIR     = path.join(ROOT, 'tmp', 'bootstrap')
fs.mkdirSync(EXPORTS_DIR, { recursive: true })
fs.mkdirSync(TMP_DIR, { recursive: true })

const log = msg => console.log(`[bootstrap] ${msg}`)
const ok  = msg => console.log(`[bootstrap] OK: ${msg}`)
const err = msg => console.error(`[bootstrap] ERRO: ${msg}`)

function get(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http
    mod.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location)
        return get(res.headers.location).then(resolve).catch(reject)
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => { try { resolve(JSON.parse(data)) } catch { resolve(data) } })
    }).on('error', reject)
  })
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http
    mod.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location)
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject)
      const file = fs.createWriteStream(dest)
      let downloaded = 0
      res.on('data', chunk => {
        downloaded += chunk.length
        if (downloaded % (1024*1024*5) < chunk.length)
          process.stdout.write(`\r[bootstrap] Baixando... ${(downloaded/1024/1024).toFixed(1)} MB`)
      })
      res.pipe(file)
      file.on('finish', () => { process.stdout.write('\n'); file.close(resolve) })
      file.on('error', reject)
    }).on('error', reject)
  })
}

async function getDownloadLink() {
  const { workspace, project, version } = DATASET_META
  const url = `https://api.roboflow.com/${workspace}/${project}/${version}/yolov8?api_key=${API_KEY}`
  log(`Consultando Roboflow: ${project} v${version}...`)
  const info = await get(url)
  if (info.error) throw new Error(`Roboflow: ${info.error}`)
  if (!info.export?.link) throw new Error('Link de download não disponível. Verifique a API key.')
  return info.export.link
}

function extractZip(zipPath, dest) {
  log(`Extraindo ${path.basename(zipPath)}...`)
  fs.mkdirSync(dest, { recursive: true })
  try {
    execSync(`unzip -q "${zipPath}" -d "${dest}"`, { stdio: 'pipe' })
  } catch {
    execSync(`python3 -c "import zipfile; zipfile.ZipFile('${zipPath}').extractall('${dest}')"`)
  }
}

function organizeDataset(srcDir, dstDir) {
  const splitMap = { train: 'train', valid: 'val', val: 'val', test: 'test' }
  let total = 0
  const classes = ['implant']

  for (const split of Object.keys(splitMap)) {
    const imgSrc = path.join(srcDir, split, 'images')
    const lblSrc = path.join(srcDir, split, 'labels')
    const dst    = splitMap[split]
    if (!fs.existsSync(imgSrc)) continue

    fs.mkdirSync(path.join(dstDir, 'images', dst), { recursive: true })
    fs.mkdirSync(path.join(dstDir, 'labels', dst), { recursive: true })

    const imgs = fs.readdirSync(imgSrc).filter(f => /\.(jpg|jpeg|png|bmp)$/i.test(f))
    log(`  ${split} -> ${dst}: ${imgs.length} imagens`)

    for (const img of imgs) {
      fs.copyFileSync(path.join(imgSrc, img), path.join(dstDir, 'images', dst, img))
      const stem = img.replace(/\.[^.]+$/, '')
      const lbl  = path.join(lblSrc, `${stem}.txt`)
      fs.writeFileSync(
        path.join(dstDir, 'labels', dst, `${stem}.txt`),
        fs.existsSync(lbl) ? fs.readFileSync(lbl) : ''
      )
    }
    total += imgs.length
  }

  // Ler classes do data.yaml original se houver
  const yamlFile = fs.readdirSync(srcDir).find(f => f.endsWith('.yaml'))
  if (yamlFile) {
    const yaml = fs.readFileSync(path.join(srcDir, yamlFile), 'utf8')
    const m = yaml.match(/names:\s*\[([^\]]+)\]/)
    if (m) m[1].split(',').map(s => s.trim().replace(/['"]/g,'')).filter(Boolean).forEach(c => {
      if (!classes.includes(c)) classes.push(c)
    })
  }

  return { total, classes }
}

function writeYaml(dstDir, classes) {
  const yaml = [
    `path: ${dstDir}`,
    `train: images/train`,
    `val: images/val`,
    `test: images/test`,
    ``,
    `nc: ${classes.length}`,
    `names: [${classes.map(c => `'${c}'`).join(', ')}]`
  ].join('\n')
  fs.writeFileSync(path.join(dstDir, 'data.yaml'), yaml)
}

function getAdmin() {
  const a = db.prepare(`SELECT id FROM users WHERE role='admin' ORDER BY created_at ASC LIMIT 1`).get()
  if (!a) throw new Error('Nenhum admin encontrado. Crie um com: node scripts/create-admin.js')
  return a.id
}

function registerDataset(adminId, datasetId, dstDir, total) {
  db.prepare(`
    INSERT OR IGNORE INTO datasets
      (id,name,description,export_format,split_train,split_val,split_test,
       status,image_count,export_path,created_by,updated_at)
    VALUES (?,?,?,'yolo',0.7,0.2,0.1,'ready',?,?,?,datetime('now'))
  `).run(datasetId, DATASET_META.name, DATASET_META.description, total, dstDir, adminId)
  ok(`Dataset registrado no banco (${total} imagens)`)
}

function enqueueTraining(adminId, datasetId) {
  const modelId = uuidv4()
  const jobId   = uuidv4()
  db.prepare(`
    INSERT INTO ml_models
      (id,name,version,dataset_id,architecture,status,epochs,notes,created_by)
    VALUES (?,?,?,?,'yolov8m','training',50,?,?)
  `).run(modelId, 'DII-Bootstrap-v1', 'v1.0', datasetId,
    'Treino inicial com dataset público Roboflow. Fine-tune após com suas radiografias.', adminId)
  db.prepare(`
    INSERT INTO jobs (id,type,status,payload,requested_by)
    VALUES (?,'train_model','queued',?,?)
  `).run(jobId, JSON.stringify({ model_id: modelId, dataset_id: datasetId, epochs: 50, architecture: 'yolov8m' }), adminId)
  ok(`Job de treino enfileirado!`)
  ok(`Model ID : ${modelId}`)
  ok(`Job ID   : ${jobId}`)
  log(`Acompanhe em tempo real: painel -> Modelos -> Report`)
}

async function main() {
  console.log('\nDII Bootstrap Dataset\n')
  const adminId   = getAdmin()
  const datasetId = uuidv4()
  const dstDir    = path.join(EXPORTS_DIR, `dataset_${datasetId}`)

  // 1. Download link
  const link = await getDownloadLink()
  log(`Link de download obtido`)

  // 2. Baixar ZIP
  const zipPath = path.join(TMP_DIR, 'dataset.zip')
  await downloadFile(link, zipPath)
  const mb = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(1)
  ok(`Download concluido (${mb} MB)`)

  // 3. Extrair
  const extractDir = path.join(TMP_DIR, 'extracted')
  extractZip(zipPath, extractDir)
  ok(`Extraido em ${extractDir}`)

  // 4. Organizar
  for (const s of ['train','val','test']) {
    fs.mkdirSync(path.join(dstDir, 'images', s), { recursive: true })
    fs.mkdirSync(path.join(dstDir, 'labels', s), { recursive: true })
  }
  const { total, classes } = organizeDataset(extractDir, dstDir)
  if (total === 0) { err('Nenhuma imagem encontrada. Verifique o dataset.'); process.exit(1) }

  // 5. data.yaml
  writeYaml(dstDir, classes)
  ok(`data.yaml gerado — classes: ${classes.join(', ')} | imagens: ${total}`)

  // 6. Registrar no banco
  registerDataset(adminId, datasetId, dstDir, total)

  // 7. Limpar tmp
  fs.rmSync(TMP_DIR, { recursive: true, force: true })

  // 8. Treino
  if (AUTO_TRAIN) {
    enqueueTraining(adminId, datasetId)
  } else {
    console.log(`
+----------------------------------------------------------+
|  Dataset pronto! Proximos passos:                        |
|                                                          |
|  1. Painel -> Modelos -> Novo Treino                     |
|  2. Selecione: "${DATASET_META.name.slice(0,25)}..."     |
|  3. Arquitetura: yolov8m | Epocas: 50                    |
|  4. Iniciar -> acompanhe em Report                       |
|                                                          |
|  Ou rode com --train para enfileirar automaticamente:    |
|  node scripts/bootstrap-dataset.js <KEY> --train         |
+----------------------------------------------------------+
    `)
  }
}

main().catch(e => { err(e.message); process.exit(1) })
