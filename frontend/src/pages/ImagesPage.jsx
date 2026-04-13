import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import api from '../services/api'
import Badge from '../components/ui/Badge'
import Spinner from '../components/ui/Spinner'
import Empty from '../components/ui/Empty'
import Modal from '../components/ui/Modal'
import toast from 'react-hot-toast'
import { Upload, Images, Loader2, X, CheckCircle, SlidersHorizontal, Edit3 } from 'lucide-react'
import clsx from 'clsx'

export default function ImagesPage() {
  const navigate = useNavigate()
  const [images, setImages]   = useState([])
  const [total, setTotal]     = useState(0)
  const [page, setPage]       = useState(1)
  const [pages, setPages]     = useState(1)
  const [loading, setLoading] = useState(true)
  const [status, setStatus]   = useState('')
  const [type, setType]       = useState('')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadType, setUploadType] = useState('panoramica')
  const [files, setFiles]     = useState([])
  const [uploading, setUploading] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    const params = { page, limit:20 }
    if (status) params.status = status
    if (type)   params.type   = type
    api.get('/images', { params }).then(r => {
      setImages(r.data.images); setTotal(r.data.total); setPages(r.data.pages)
    }).finally(() => setLoading(false))
  }, [page, status, type])

  useEffect(() => { load() }, [load])

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
      const r = await api.post('/images/upload', fd, { headers: { 'Content-Type':'multipart/form-data' } })
      toast.success(`${r.data.uploaded} imagem(ns) enviada(s)!`)
      setUploadOpen(false); setFiles([]); load()
    } catch {} finally { setUploading(false) }
  }

  return (
    <div className="space-y-5 max-w-7xl">
      <div className="page-header">
        <div>
          <h2 className="page-title">Radiografias</h2>
          <p className="text-sm text-gray-500 mt-0.5">{total} imagens no total</p>
        </div>
        <button className="btn-primary" onClick={() => setUploadOpen(true)}><Upload size={16}/> Upload</button>
      </div>

      <div className="card p-4 flex flex-wrap gap-3 items-center">
        <SlidersHorizontal size={15} className="text-gray-500"/>
        <select className="input w-44" value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}>
          <option value="">Todos os status</option>
          {['pending','annotating','annotated','reviewed','approved','rejected'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="input w-44" value={type} onChange={e => { setType(e.target.value); setPage(1) }}>
          <option value="">Todos os tipos</option>
          {['panoramica','periapical','oclusal','outro'].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        {(status||type) && <button className="btn-ghost text-xs" onClick={() => { setStatus(''); setType(''); setPage(1) }}><X size={13}/> Limpar</button>}
      </div>

      <div className="card overflow-hidden">
        {loading ? <div className="flex justify-center py-16"><Spinner size="lg"/></div>
        : images.length === 0 ? (
          <Empty icon={Images} title="Nenhuma imagem encontrada" description="Faça upload de radiografias para começar."
            action={<button className="btn-primary" onClick={() => setUploadOpen(true)}><Upload size={16}/> Upload</button>}/>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {['Nome','Tipo','Status','Anotações','Enviado por','Data',''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wide font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {images.map(img => (
                <tr key={img.id} className="table-row cursor-pointer" onClick={(e) => { e.stopPropagation(); navigate(`/images/${img.id}/annotate`) }}>
                  <td className="px-4 py-3 text-gray-200 max-w-xs truncate">{img.original_name}</td>
                  <td className="px-4 py-3"><Badge value={img.type}/></td>
                  <td className="px-4 py-3"><Badge value={img.status}/></td>
                  <td className="px-4 py-3 text-gray-400">{img.annotation_count}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{img.uploader_name}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{new Date(img.created_at).toLocaleDateString('pt-BR')}</td>
                  <td className="px-4 py-3">
                    <button className="btn-ghost p-1.5" title="Anotar" onClick={(e) => { e.stopPropagation(); navigate(`/images/${img.id}/annotate`) }}>
                      <Edit3 size={14}/>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button className="btn-secondary text-xs" disabled={page<=1} onClick={() => setPage(p=>p-1)}>Anterior</button>
          <span className="text-gray-500 text-sm">{page} / {pages}</span>
          <button className="btn-secondary text-xs" disabled={page>=pages} onClick={() => setPage(p=>p+1)}>Próxima</button>
        </div>
      )}

      <Modal open={uploadOpen} onClose={() => { setUploadOpen(false); setFiles([]) }} title="Upload de Radiografias">
        <div className="p-5 space-y-4">
          <div>
            <label className="label">Tipo</label>
            <select className="input" value={uploadType} onChange={e => setUploadType(e.target.value)}>
              <option value="panoramica">Panorâmica</option>
              <option value="periapical">Periapical</option>
              <option value="oclusal">Oclusal</option>
              <option value="outro">Outro</option>
            </select>
          </div>
          <div {...getRootProps()} className={clsx('border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all',
            isDragActive ? 'border-primary-500 bg-primary-500/10' : 'border-gray-700 hover:border-gray-500')}>
            <input {...getInputProps()}/>
            <Upload size={24} className="mx-auto text-gray-500 mb-2"/>
            <p className="text-sm text-gray-400">Arraste ou <span className="text-primary-400">clique para selecionar</span></p>
            <p className="text-xs text-gray-600 mt-1">JPG, PNG, WebP, TIFF · Máx 50MB</p>
          </div>
          {files.length > 0 && (
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {files.map((f,i) => (
                <div key={i} className="flex items-center justify-between p-2 bg-gray-800 rounded-lg text-xs">
                  <span className="text-gray-300 truncate max-w-xs">{f.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">{(f.size/1024/1024).toFixed(1)}MB</span>
                    <button onClick={() => setFiles(files.filter((_,j)=>j!==i))}><X size={13} className="text-gray-500 hover:text-red-400"/></button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button className="btn-secondary" onClick={() => { setUploadOpen(false); setFiles([]) }}>Cancelar</button>
            <button className="btn-primary" disabled={!files.length||uploading} onClick={handleUpload}>
              {uploading ? <><Loader2 size={14} className="animate-spin"/> Enviando...</> : <><CheckCircle size={14}/> Enviar {files.length>0?`(${files.length})`:''}</>}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
