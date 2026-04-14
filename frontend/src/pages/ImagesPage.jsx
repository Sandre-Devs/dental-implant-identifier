import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import api from '../services/api'
import Badge from '../components/ui/Badge'
import Spinner from '../components/ui/Spinner'
import Empty from '../components/ui/Empty'
import Modal from '../components/ui/Modal'
import toast from 'react-hot-toast'
import { Upload, Images, Loader2, X, CheckCircle, SlidersHorizontal, Edit3, BrainCircuit, RefreshCw } from 'lucide-react'
import clsx from 'clsx'

/* Tempo de polling após upload (ms) */
const POLL_INTERVAL = 3000
const POLL_TIMES    = 10   // máx 30s de polling

export default function ImagesPage() {
  const navigate  = useNavigate()
  const pollRef   = useRef(null)

  const [images,     setImages]     = useState([])
  const [total,      setTotal]      = useState(0)
  const [page,       setPage]       = useState(1)
  const [pages,      setPages]      = useState(1)
  const [loading,    setLoading]    = useState(true)
  const [status,     setStatus]     = useState('')
  const [type,       setType]       = useState('')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadType, setUploadType] = useState('panoramica')
  const [files,      setFiles]      = useState([])
  const [uploading,  setUploading]  = useState(false)
  const [uploadResult, setUploadResult] = useState(null)   // { uploaded, detected, ids }
  const [polling,    setPolling]    = useState(false)

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true)
    const params = { page, limit: 20 }
    if (status) params.status = status
    if (type)   params.type   = type
    return api.get('/images', { params }).then(r => {
      setImages(r.data.images); setTotal(r.data.total); setPages(r.data.pages)
    }).finally(() => setLoading(false))
  }, [page, status, type])

  useEffect(() => { load() }, [load])
  useEffect(() => () => clearInterval(pollRef.current), [])

  /* ── Polling pós-upload: atualiza silenciosamente até detecções chegarem ── */
  const startPolling = (uploadedIds) => {
    let count = 0
    setPolling(true)
    pollRef.current = setInterval(async () => {
      count++
      await load(true)
      // Verifica se alguma imagem agora tem annotation_count > 0
      const res = await api.get('/images', { params: { limit: 20, page: 1 } })
      const newlyDetected = res.data.images.filter(
        img => uploadedIds.includes(img.id) && img.annotation_count > 0
      )
      if (newlyDetected.length > 0 || count >= POLL_TIMES) {
        clearInterval(pollRef.current)
        setPolling(false)
        if (newlyDetected.length > 0) {
          const total = newlyDetected.reduce((s, i) => s + i.annotation_count, 0)
          toast.success(`🤖 IA detectou ${total} implante(s) automaticamente!`, { duration: 5000 })
          load(true)
        }
      }
    }, POLL_INTERVAL)
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'image/*': ['.jpg','.jpeg','.png','.webp','.tiff'] },
    onDrop: f => setFiles(prev => [...prev, ...f])
  })

  const handleUpload = async () => {
    if (!files.length) return
    setUploading(true)
    const fd = new FormData()
    files.forEach(f => fd.append('files', f))
    fd.append('type', uploadType)
    try {
      const r = await api.post('/images/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setUploadResult({ uploaded: r.data.uploaded, ids: r.data.images.map(i => i.id) })
      setFiles([])
      load(true)
      // Inicia polling para capturar resultado da IA
      startPolling(r.data.images.map(i => i.id))
    } catch {} finally { setUploading(false) }
  }

  const closeUpload = () => {
    setUploadOpen(false); setFiles([]); setUploadResult(null)
  }

  /* ── Contagem de imgs com detecção automática (para badge na lista) ── */
  const aiImageIds = new Set(
    images.filter(i => i.annotation_count > 0 && i.status === 'annotating').map(i => i.id)
  )

  return (
    <div className="space-y-5 max-w-7xl">

      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Radiografias</h2>
          <p className="text-sm text-gray-500 mt-0.5">{total} imagens no total</p>
        </div>
        <div className="flex items-center gap-2">
          {polling && (
            <div className="flex items-center gap-1.5 text-xs text-orange-400 animate-pulse">
              <BrainCircuit size={14}/> IA processando...
            </div>
          )}
          <button className="btn-ghost text-xs" onClick={() => load()} title="Atualizar">
            <RefreshCw size={14}/>
          </button>
          <button className="btn-primary" onClick={() => { setUploadResult(null); setUploadOpen(true) }}>
            <Upload size={16}/> Upload
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="card p-3 sm:p-4 flex flex-wrap gap-2 sm:gap-3 items-center">
        <SlidersHorizontal size={15} className="text-gray-500 hidden sm:block"/>
        <select className="input flex-1 min-w-32 sm:w-44 sm:flex-none" value={status}
          onChange={e => { setStatus(e.target.value); setPage(1) }}>
          <option value="">Todos os status</option>
          {['pending','annotating','annotated','reviewed','approved','rejected'].map(s =>
            <option key={s} value={s}>{s}</option>
          )}
        </select>
        <select className="input flex-1 min-w-32 sm:w-44 sm:flex-none" value={type}
          onChange={e => { setType(e.target.value); setPage(1) }}>
          <option value="">Todos os tipos</option>
          {['panoramica','periapical','oclusal','outro'].map(t =>
            <option key={t} value={t}>{t}</option>
          )}
        </select>
        {(status||type) && (
          <button className="btn-ghost text-xs" onClick={() => { setStatus(''); setType(''); setPage(1) }}>
            <X size={13}/> Limpar
          </button>
        )}
      </div>

      {/* Tabela */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg"/></div>
        ) : images.length === 0 ? (
          <Empty icon={Images} title="Nenhuma imagem encontrada"
            description="Faça upload de radiografias para começar."
            action={
              <button className="btn-primary" onClick={() => setUploadOpen(true)}>
                <Upload size={16}/> Upload
              </button>
            }/>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-gray-800">
                  {['Nome','Tipo','Status','Anotações','Data',''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wide font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {images.map(img => (
                  <tr
                    key={img.id}
                    className="table-row cursor-pointer"
                    onClick={() => navigate(`/images/${img.id}/annotate`)}
                  >
                    <td className="px-4 py-3 text-gray-200 max-w-[200px] truncate">
                      {img.original_name}
                    </td>
                    <td className="px-4 py-3"><Badge value={img.type}/></td>
                    <td className="px-4 py-3"><Badge value={img.status}/></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className={img.annotation_count > 0 ? 'text-gray-200 font-medium' : 'text-gray-600'}>
                          {img.annotation_count}
                        </span>
                        {/* Badge IA: imagem com anotações automáticas ainda não preenchidas */}
                        {img.annotation_count > 0 && img.status === 'annotating' && (
                          <span
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs bg-orange-500/20 text-orange-400 border border-orange-500/30"
                            title="Contém detecções automáticas da IA aguardando revisão"
                          >
                            <BrainCircuit size={10}/> IA
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {new Date(img.created_at).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        className="btn-ghost p-1.5"
                        title="Anotar"
                        onClick={e => { e.stopPropagation(); navigate(`/images/${img.id}/annotate`) }}
                      >
                        <Edit3 size={14}/>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Paginação */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button className="btn-secondary text-xs" disabled={page<=1} onClick={() => setPage(p=>p-1)}>Anterior</button>
          <span className="text-gray-500 text-sm">{page} / {pages}</span>
          <button className="btn-secondary text-xs" disabled={page>=pages} onClick={() => setPage(p=>p+1)}>Próxima</button>
        </div>
      )}

      {/* ── Modal Upload ── */}
      <Modal open={uploadOpen} onClose={closeUpload} title="Upload de Radiografias">
        <div className="p-5 space-y-4">

          {/* Resultado do upload (pós-envio) */}
          {uploadResult ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/30 rounded-xl">
                <CheckCircle size={20} className="text-green-400 flex-shrink-0"/>
                <div>
                  <p className="text-sm font-semibold text-green-300">
                    {uploadResult.uploaded} imagem(ns) enviada(s) com sucesso!
                  </p>
                  <p className="text-xs text-green-400/70 mt-0.5">
                    A IA está analisando as radiografias em segundo plano...
                  </p>
                </div>
              </div>

              {polling && (
                <div className="flex items-center gap-3 p-3 bg-orange-500/10 border border-orange-500/30 rounded-xl">
                  <BrainCircuit size={18} className="text-orange-400 animate-pulse flex-shrink-0"/>
                  <div>
                    <p className="text-sm font-medium text-orange-300">Detecção automática em andamento</p>
                    <p className="text-xs text-orange-400/70 mt-0.5">
                      A lista será atualizada automaticamente quando os implantes forem detectados.
                    </p>
                  </div>
                </div>
              )}

              <div className="bg-gray-800/60 rounded-xl p-4 space-y-2">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Como funciona</p>
                <Step n="1" text="Imagens salvas e processadas ✅"/>
                <Step n="2" text={polling ? 'IA detectando implantes... 🔄' : 'Detecção concluída ✅'}/>
                <Step n="3" text="Você revisa as marcações e preenche fabricante/sistema"/>
                <Step n="4" text="Envie para revisão da equipe"/>
              </div>

              <div className="flex gap-3">
                <button className="btn-secondary flex-1" onClick={closeUpload}>Fechar</button>
                <button className="btn-primary flex-1" onClick={() => {
                  closeUpload()
                  if (uploadResult.ids?.length === 1)
                    navigate(`/images/${uploadResult.ids[0]}/annotate`)
                }}>
                  <Edit3 size={14}/>
                  {uploadResult.ids?.length === 1 ? 'Anotar agora' : 'Ver radiografias'}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className="label">Tipo de radiografia</label>
                <select className="input" value={uploadType} onChange={e => setUploadType(e.target.value)}>
                  <option value="panoramica">Panorâmica</option>
                  <option value="periapical">Periapical</option>
                  <option value="oclusal">Oclusal</option>
                  <option value="outro">Outro</option>
                </select>
              </div>

              <div {...getRootProps()} className={clsx(
                'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all',
                isDragActive ? 'border-primary-500 bg-primary-500/10' : 'border-gray-700 hover:border-gray-500'
              )}>
                <input {...getInputProps()}/>
                <Upload size={28} className="mx-auto text-gray-500 mb-3"/>
                <p className="text-sm text-gray-400">
                  Arraste ou <span className="text-primary-400 font-medium">clique para selecionar</span>
                </p>
                <p className="text-xs text-gray-600 mt-1">JPG, PNG, WebP, TIFF · Múltiplos arquivos · Máx 50MB cada</p>
              </div>

              {/* Preview dos arquivos */}
              {files.length > 0 && (
                <div className="space-y-1.5 max-h-44 overflow-y-auto">
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center justify-between p-2.5 bg-gray-800 rounded-lg text-xs">
                      <span className="text-gray-300 truncate max-w-[200px]">{f.name}</span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-gray-500">{(f.size/1024/1024).toFixed(1)}MB</span>
                        <button onClick={() => setFiles(files.filter((_,j) => j!==i))}>
                          <X size={13} className="text-gray-500 hover:text-red-400"/>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Info sobre IA */}
              {files.length > 0 && (
                <div className="flex items-start gap-2 p-3 bg-primary-500/10 border border-primary-500/20 rounded-lg">
                  <BrainCircuit size={15} className="text-primary-400 flex-shrink-0 mt-0.5"/>
                  <p className="text-xs text-primary-300">
                    Após o upload, a IA irá detectar automaticamente os implantes nas radiografias
                    (se houver um modelo treinado ativo).
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-1">
                <button className="btn-secondary" onClick={closeUpload}>Cancelar</button>
                <button className="btn-primary" disabled={!files.length || uploading} onClick={handleUpload}>
                  {uploading
                    ? <><Loader2 size={14} className="animate-spin"/> Enviando...</>
                    : <><Upload size={14}/> Enviar {files.length > 0 ? `(${files.length})` : ''}</>
                  }
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  )
}

function Step({ n, text }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-5 h-5 rounded-full bg-primary-500/20 text-primary-400 text-xs font-bold flex items-center justify-center flex-shrink-0">
        {n}
      </div>
      <p className="text-xs text-gray-400">{text}</p>
    </div>
  )
}
