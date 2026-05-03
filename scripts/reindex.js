#!/usr/bin/env node
/**
 * scripts/reindex.js
 * ------------------------------------------------------------------
 * 1. REINDEX    -- registra no banco arquivos de uploads/ nao catalogados
 * 2. ANONIMIZAR -- renomeia arquivos com dados pessoais no nome
 * 3. INFERENCIA -- roda deteccao automatica em imagens sem anotacoes
 *
 * Uso:
 *   node scripts/reindex.js              # executa tudo
 *   node scripts/reindex.js --reindex    # so sincronizar banco
 *   node scripts/reindex.js --rename     # so anonimizar nomes
 *   node scripts/reindex.js --infer      # so inferencia
 *   node scripts/reindex.js --dry-run    # simula, sem alterar nada
 */
'use strict'

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })

const path   = require('path')
const fs     = require('fs')
const crypto = require('crypto')
const { v4: uuidv4 } = require('uuid')
const db             = require('../database/db')
const { detectAndSave } = require('../services/inferenceService')

const UPLOADS_DIR = path.resolve(__dirname, '../uploads')
const SALT        = process.env.ANON_SALT || 'dii-reindex-2026'
const SUPPORTED   = new Set(['.jpg','.jpeg','.png','.webp','.bmp','.tiff','.tif'])

const args    = new Set(process.argv.slice(2))
const DRY_RUN = args.has('--dry-run')
const RUN_ALL = args.size === 0 || (args.size === 1 && DRY_RUN)

const DO_REINDEX = RUN_ALL || args.has('--reindex')
const DO_RENAME  = RUN_ALL || args.has('--rename')
const DO_INFER   = RUN_ALL || args.has('--infer')

// --- log helpers ---
const ok     = m => console.log('\x1b[32m' + '✅  ' + m + '\x1b[0m')
const warn   = m => console.log('\x1b[33m' + '⚠️   ' + m + '\x1b[0m')
const info   = m => console.log('\x1b[34m' + 'ℹ️   ' + m + '\x1b[0m')
const skip   = m => console.log('\x1b[90m' + '⏭️   ' + m + '\x1b[0m')
const drylog = m => console.log('\x1b[36m' + '🔍  [DRY] ' + m + '\x1b[0m')
const fatal  = m => console.log('\x1b[31m' + '❌  ' + m + '\x1b[0m')
const head   = m => console.log('\n\x1b[1m\x1b[34m' + m + '\x1b[0m')

function prog(cur, total, label) {
  const pct = Math.round(cur / total * 100)
  const bar = '█'.repeat(Math.floor(pct/5)) + '░'.repeat(20 - Math.floor(pct/5))
  process.stdout.write('\r  [' + bar + '] ' + pct + '% (' + cur + '/' + total + ') ' + (label||'').slice(0,30).padEnd(30))
}

function anonFilename(id, original) {
  const ext = path.extname(original).toLowerCase() || '.jpg'
  return crypto.createHash('sha256').update(id + original + SALT).digest('hex').slice(0,12) + ext
}

function hasPersonalData(filename) {
  const base = path.basename(filename, path.extname(filename))
  if (/^\d{10,}-[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(base)) return false
  if (/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(base)) return false
  if (/^[0-9a-f]{12,64}$/i.test(base)) return false
  if (/^[\d\-]+$/.test(base)) return false
  return true
}

async function getDims(filePath) {
  try {
    const m = await require('sharp')(filePath).metadata()
    return { w: m.width || 0, h: m.height || 0 }
  } catch { return { w: 0, h: 0 } }
}

// ================================================================
// ETAPA 1 -- REINDEX
// ================================================================
async function reindex() {
  head('📂  ETAPA 1 -- REINDEX')

  if (!fs.existsSync(UPLOADS_DIR)) { warn('Diretorio uploads nao encontrado: ' + UPLOADS_DIR); return }

  const files  = fs.readdirSync(UPLOADS_DIR).filter(f => SUPPORTED.has(path.extname(f).toLowerCase()))
  const inDB   = new Map(db.prepare('SELECT filename, id FROM images').all().map(r => [r.filename, r.id]))
  const toAdd  = files.filter(f => !inDB.has(f))

  info(files.length + ' arquivo(s) fisicos em uploads/')
  info(inDB.size + ' no banco   |   ' + toAdd.length + ' novos para registrar')

  if (toAdd.length > 0) {
    if (DRY_RUN) {
      toAdd.slice(0,5).forEach(f => drylog('Registraria: ' + f))
      if (toAdd.length > 5) drylog('... e mais ' + (toAdd.length-5))
    } else {
      // Passo 1 (async): coletar metadados
      info('Lendo metadados...')
      const metas = []
      const adminId = db.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").get()?.id || null
      for (let i = 0; i < toAdd.length; i++) {
        prog(i+1, toAdd.length, toAdd[i])
        const fp   = path.join(UPLOADS_DIR, toAdd[i])
        const stat = fs.statSync(fp)
        const dims = await getDims(fp)
        const id   = uuidv4()
        const ext  = path.extname(toAdd[i]).toLowerCase()
        const mime = ext==='.png' ? 'image/png' : ext==='.webp' ? 'image/webp' : 'image/jpeg'
        metas.push({ id, file:toAdd[i], mime, size:stat.size, w:dims.w, h:dims.h,
                     orig: anonFilename(id, toAdd[i]).replace(/\.[^.]+$/, ''), adminId })
      }
      console.log('')

      // Passo 2 (sync): inserir em transacao
      const ins = db.prepare(
        'INSERT OR IGNORE INTO images (id,filename,original_name,mime_type,size,width,height,type,uploaded_by,status) ' +
        "VALUES (?,?,?,?,?,?,?,'panoramica',?,'pending')"
      )
      db.transaction(items => items.forEach(m => ins.run(m.id, m.file, m.orig, m.mime, m.size, m.w, m.h, m.adminId)))(metas)
      ok('+' + metas.length + ' imagens registradas no banco')
    }
  }

  // Registros sem arquivo -> missing
  const physSet = new Set(files)
  const missing = db.prepare('SELECT id, filename FROM images').all().filter(r => !physSet.has(r.filename))
  if (missing.length > 0) {
    if (!DRY_RUN) {
      const upd = db.prepare("UPDATE images SET status='missing', updated_at=datetime('now') WHERE id=?")
      db.transaction(rows => rows.forEach(r => upd.run(r.id)))(missing)
    }
    warn(missing.length + ' registro(s) sem arquivo fisico -> status=missing')
  }

  ok('Reindex: +' + (DRY_RUN ? toAdd.length : toAdd.length) + ' | missing: ' + missing.length)
}

// ================================================================
// ETAPA 2 -- ANONIMIZAR
// ================================================================
async function anonymizeNames() {
  head('🔒  ETAPA 2 -- ANONIMIZAR NOMES')

  const rows     = db.prepare('SELECT id, filename, original_name FROM images').all()
  const toRename = rows.filter(r => hasPersonalData(r.filename))

  info(rows.length + ' imagem(ns) verificadas  |  ' + toRename.length + ' com dados pessoais  |  ' + (rows.length - toRename.length) + ' ja seguras')

  if (toRename.length === 0) { ok('Todos os nomes ja estao anonimizados'); return }

  if (DRY_RUN) {
    toRename.slice(0,5).forEach(r => drylog(r.filename.slice(0,50) + '  -->  ' + anonFilename(r.id, r.filename)))
    if (toRename.length > 5) drylog('... e mais ' + (toRename.length-5))
    return
  }

  let renamed=0, notFound=0, errors=0
  const updStmt = db.prepare("UPDATE images SET filename=?, original_name=?, updated_at=datetime('now') WHERE id=?")
  const pairs   = []

  for (let i=0; i<toRename.length; i++) {
    const r       = toRename[i]
    const newFile = anonFilename(r.id, r.filename)
    const newOrig = newFile.replace(/\.[^.]+$/, '')
    const src     = path.join(UPLOADS_DIR, r.filename)
    const dst     = path.join(UPLOADS_DIR, newFile)
    prog(i+1, toRename.length, r.filename)

    if (fs.existsSync(src)) {
      try { fs.renameSync(src, dst); renamed++ }
      catch(e) { errors++; warn('\nErro ao renomear ' + r.filename + ': ' + e.message); continue }
    } else {
      notFound++
    }
    pairs.push({ r, newFile, newOrig })
  }
  console.log('')

  db.transaction(ps => ps.forEach(p => updStmt.run(p.newFile, p.newOrig, p.r.id)))(pairs)
  ok('Anonimizacao: ' + renamed + ' renomeados  |  ' + notFound + ' ausentes  |  ' + errors + ' erros')
}

// ================================================================
// ETAPA 3 -- INFERENCIA
// ================================================================
async function runInference() {
  head('🤖  ETAPA 3 -- INFERENCIA AUTOMATICA')

  const model = db.prepare("SELECT id,name,task FROM ml_models WHERE status='deployed' LIMIT 1").get()
  if (!model) {
    warn('Nenhum modelo deployed')
    warn('Acesse Modelos na plataforma e faca o deploy de um modelo treinado para ativar a deteccao')
    return
  }
  info('Modelo ativo: ' + model.name + ' [' + (model.task||'manufacturer') + ']')

  const targets = db.prepare(
    'SELECT i.id, i.filename, i.uploaded_by FROM images i ' +
    "WHERE i.status NOT IN ('missing') " +
    'AND i.id NOT IN (SELECT DISTINCT image_id FROM annotations WHERE auto_detected=1) ' +
    'ORDER BY i.created_at ASC'
  ).all()

  info(targets.length + ' imagem(ns) sem deteccao automatica')
  if (targets.length === 0) { skip('Nada a processar'); return }

  if (DRY_RUN) {
    targets.slice(0,5).forEach(t => drylog('Processaria: ' + t.filename))
    if (targets.length > 5) drylog('... e mais ' + (targets.length-5))
    return
  }

  const adminId = db.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").get()?.id
  let success=0, failed=0, noFile=0

  for (let i=0; i<targets.length; i++) {
    const img = targets[i]
    prog(i+1, targets.length, img.filename)
    const fp = path.join(UPLOADS_DIR, img.filename)
    if (!fs.existsSync(fp)) { noFile++; continue }
    try {
      const r = await detectAndSave({ imageId:img.id, imagePath:fp, uploadedBy:img.uploaded_by||adminId })
      r.skipped ? failed++ : success++
    } catch(e) { warn('\nErro em ' + img.filename + ': ' + e.message); failed++ }
  }
  console.log('')
  ok('Inferencia: ' + success + ' detectadas  |  ' + failed + ' sem resultado  |  ' + noFile + ' arquivo ausente')
}

// ================================================================
// MAIN
// ================================================================
async function main() {
  const steps = [DO_REINDEX&&'reindex', DO_RENAME&&'rename', DO_INFER&&'infer'].filter(Boolean)
  console.log('\n\x1b[1m🦷  DII -- Reindex · Anonymize · Inference\x1b[0m')
  console.log('    Modo:   ' + (DRY_RUN ? '🔍 DRY-RUN (sem alteracoes)' : '✏️  REAL'))
  console.log('    Etapas: ' + steps.join(' + '))
  console.log('    Dir:    ' + UPLOADS_DIR)
  const t0 = Date.now()
  try {
    if (DO_REINDEX) await reindex()
    if (DO_RENAME)  await anonymizeNames()
    if (DO_INFER)   await runInference()
  } catch(e) {
    fatal('Erro fatal: ' + e.message)
    console.error(e.stack)
    process.exit(1)
  }
  console.log('\n\x1b[1m\x1b[32m✨  Concluido em ' + ((Date.now()-t0)/1000).toFixed(1) + 's\x1b[0m\n')
}

main()
