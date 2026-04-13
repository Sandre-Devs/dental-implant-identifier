import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../services/api'
import Badge from '../components/ui/Badge'
import Spinner from '../components/ui/Spinner'
import toast from 'react-hot-toast'
import { ArrowLeft, Save, Trash2, Plus, Loader2 } from 'lucide-react'

const COLORS = ['#01696f','#3b82f6','#a855f7','#f59e0b','#ef4444','#10b981','#f97316','#06b6d4']

export default function AnnotatorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const canvasRef = useRef(null)
  const [image, setImage]               = useState(null)
  const [imgEl, setImgEl]               = useState(null)
  const [imgLoaded, setImgLoaded]       = useState(false)
  const [annotations, setAnnotations]   = useState([])
  const [manufacturers, setManufacturers] = useState([])
  const [systems, setSystems]           = useState([])
  const [loading, setLoading]           = useState(true)
  const [selected, setSelected]         = useState(null)
  const [drawing, setDrawing]           = useState(false)
  const [startPt, setStartPt]           = useState(null)
  const [currentBox, setCurrentBox]     = useState(null)
  const [saving, setSaving]             = useState(false)
  const [form, setForm] = useState({
    manufacturer_id:'', system_id:'', confidence:'low',
    position_fdi:'', diameter_mm:'', length_mm:'',
    osseointegrated:false, notes:''
  })

  const load = useCallback(() => {
    Promise.all([
      api.get(`/images/${id}`),
      api.get('/annotations', { params:{ image_id:id } }),
      api.get('/manufacturers'),
    ]).then(([img, ann, mfr]) => {
      setImage(img.data)
      setAnnotations(ann.data)
      setManufacturers(mfr.data)
    }).finally(() => setLoading(false))
  }, [id])

  useEffect(() => { load() }, [load])

  // Carrega imagem via fetch (envia JWT no header, evita CORS/401 em <img>)
  useEffect(() => {
    if (!id) return
    api.get(`/images/${id}/file`, { responseType: 'blob' })
      .then(r => {
        const url = URL.createObjectURL(r.data)
        const img = new Image()
        img.onload = () => {
          setImgEl(img)
          setImgLoaded(true)
        }
        img.onerror = () => toast.error('Erro ao renderizar imagem.')
        img.src = url
      })
      .catch(() => toast.error('Erro ao carregar imagem.'))
  }, [id])

  useEffect(() => {
    if (form.manufacturer_id)
      api.get(`/manufacturers/${form.manufacturer_id}/systems`).then(r => setSystems(r.data))
    else setSystems([])
  }, [form.manufacturer_id])

  const getPos = e => {
    const c = canvasRef.current, r = c.getBoundingClientRect()
    return {
      x: (e.clientX - r.left) * (c.width  / r.width),
      y: (e.clientY - r.top)  * (c.height / r.height)
    }
  }

  const drawAll = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !imgEl || !imgLoaded) return
    const ctx = canvas.getContext('2d')
    canvas.width  = imgEl.naturalWidth
    canvas.height = imgEl.naturalHeight
    ctx.drawImage(imgEl, 0, 0)

    annotations.forEach((ann, i) => {
      if (ann.bbox_x == null) return
      const color = COLORS[i % COLORS.length]
      ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.setLineDash([])
      ctx.strokeRect(ann.bbox_x, ann.bbox_y, ann.bbox_w, ann.bbox_h)
      ctx.fillStyle = color + 'cc'
      ctx.fillRect(ann.bbox_x, ann.bbox_y - 20, 130, 20)
      ctx.fillStyle = '#fff'; ctx.font = '13px Inter,sans-serif'
      ctx.fillText((`#${i+1} ${ann.manufacturer_name || '?'}`).slice(0, 18), ann.bbox_x + 4, ann.bbox_y - 5)
      if (selected === ann.id) {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.setLineDash([5, 3])
        ctx.strokeRect(ann.bbox_x - 2, ann.bbox_y - 2, ann.bbox_w + 4, ann.bbox_h + 4)
        ctx.setLineDash([])
      }
    })

    if (currentBox) {
      ctx.strokeStyle = '#01696f'; ctx.lineWidth = 3; ctx.setLineDash([8, 4])
      ctx.strokeRect(currentBox.x, currentBox.y, currentBox.w, currentBox.h)
      ctx.setLineDash([])
    }
  }, [annotations, selected, currentBox, imgLoaded, imgEl])

  useEffect(() => { drawAll() }, [drawAll])

  const onMouseDown = e => {
    if (e.button !== 0) return
    const p = getPos(e)
    setDrawing(true); setStartPt(p)
    setCurrentBox({ x:p.x, y:p.y, w:0, h:0 })
  }
  const onMouseMove = e => {
    if (!drawing || !startPt) return
    const p = getPos(e)
    setCurrentBox({ x:Math.min(startPt.x,p.x), y:Math.min(startPt.y,p.y), w:Math.abs(p.x-startPt.x), h:Math.abs(p.y-startPt.y) })
  }
  const onMouseUp = () => {
    if (!drawing || !currentBox) return
    setDrawing(false)
    if (currentBox.w > 20 && currentBox.h > 20) setSelected('new')
    else setCurrentBox(null)
  }

  const handleSave = async () => {
    if (!currentBox) return
    setSaving(true)
    try {
      await api.post('/annotations', {
        image_id: id,
        bbox_x: Math.round(currentBox.x), bbox_y: Math.round(currentBox.y),
        bbox_w: Math.round(currentBox.w), bbox_h: Math.round(currentBox.h),
        ...form,
        diameter_mm: form.diameter_mm || null,
        length_mm:   form.length_mm   || null,
      })
      toast.success('Anotação salva!')
      setCurrentBox(null); setSelected(null)
      setForm({ manufacturer_id:'', system_id:'', confidence:'low', position_fdi:'', diameter_mm:'', length_mm:'', osseointegrated:false, notes:'' })
      load()
    } catch {} finally { setSaving(false) }
  }

  const handleDelete = async annId => {
    try { await api.delete(`/annotations/${annId}`); toast.success('Removida.'); setSelected(null); load() } catch {}
  }

  const handleSubmitAll = async () => {
    const drafts = annotations.filter(a => a.status === 'draft')
    if (!drafts.length) return toast.error('Nenhum rascunho para enviar.')
    try {
      await Promise.all(drafts.map(a => api.patch(`/annotations/${a.id}`, { status:'submitted' })))
      toast.success(`${drafts.length} anotação(ões) enviada(s) para revisão!`)
      load()
    } catch {}
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg"/></div>

  return (
    <div className="flex flex-col h-full space-y-4 max-w-full">
      <div className="flex items-center gap-4">
        <button className="btn-ghost" onClick={() => navigate('/images')}><ArrowLeft size={16}/> Voltar</button>
        <div className="flex-1 min-w-0">
          <h2 className="page-title truncate">{image?.original_name}</h2>
          <p className="text-xs text-gray-500">{image?.width}×{image?.height}px · <Badge value={image?.type}/></p>
        </div>
        {annotations.some(a => a.status === 'draft') && (
          <button className="btn-primary text-sm" onClick={handleSubmitAll}>
            <Save size={14}/> Enviar para Revisão ({annotations.filter(a => a.status==='draft').length})
          </button>
        )}
      </div>

      <div className="flex gap-4 flex-1 min-h-0" style={{ minHeight:'500px' }}>
        {/* Canvas */}
        <div className="flex-1 card overflow-auto flex items-start justify-center p-2">
          {!imgLoaded && <div className="flex justify-center py-20"><Spinner size="lg"/></div>}
          <canvas
            ref={canvasRef}
            className="max-w-full cursor-crosshair"
            style={{ display: imgLoaded ? 'block' : 'none' }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
          />
        </div>

        {/* Painel lateral */}
        <div className="w-80 flex flex-col gap-4 flex-shrink-0">
          <div className="card p-4 flex-shrink-0">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">
              Anotações ({annotations.length})
            </p>
            <div className="space-y-2 max-h-52 overflow-y-auto">
              {annotations.length === 0 && (
                <p className="text-gray-600 text-xs text-center py-4">Nenhuma. Desenhe um bbox na imagem.</p>
              )}
              {annotations.map((ann, i) => (
                <div key={ann.id}
                  className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer border transition-all text-xs ${selected===ann.id?'border-primary-500 bg-primary-500/10':'border-gray-700 hover:border-gray-600'}`}
                  onClick={() => setSelected(selected === ann.id ? null : ann.id)}>
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }}/>
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-200 font-medium truncate">#{i+1} {ann.manufacturer_name || 'Sem fabricante'}</p>
                    <p className="text-gray-500">{ann.position_fdi || '—'} · <Badge value={ann.status}/></p>
                  </div>
                  {ann.status === 'draft' && (
                    <button className="text-gray-500 hover:text-red-400 flex-shrink-0"
                      onClick={e => { e.stopPropagation(); handleDelete(ann.id) }}>
                      <Trash2 size={13}/>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {selected === 'new' && currentBox && (
            <div className="card p-4 overflow-y-auto flex-1">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                <Plus size={13}/> Nova Anotação
              </p>
              <div className="space-y-3">
                <div>
                  <label className="label">Fabricante</label>
                  <select className="input" value={form.manufacturer_id}
                    onChange={e => setForm({...form, manufacturer_id:e.target.value, system_id:''})}>
                    <option value="">Selecionar...</option>
                    {manufacturers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                {systems.length > 0 && (
                  <div>
                    <label className="label">Sistema</label>
                    <select className="input" value={form.system_id}
                      onChange={e => setForm({...form, system_id:e.target.value})}>
                      <option value="">Selecionar...</option>
                      {systems.map(s => <option key={s.id} value={s.id}>{s.name} ({s.connection_type})</option>)}
                    </select>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label">Confiança</label>
                    <select className="input" value={form.confidence} onChange={e => setForm({...form, confidence:e.target.value})}>
                      <option value="low">Baixa</option>
                      <option value="medium">Média</option>
                      <option value="high">Alta</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Posição FDI</label>
                    <input className="input" placeholder="ex: 36" value={form.position_fdi}
                      onChange={e => setForm({...form, position_fdi:e.target.value})}/>
                  </div>
                  <div>
                    <label className="label">Diâmetro (mm)</label>
                    <input className="input" type="number" step="0.1" placeholder="4.0" value={form.diameter_mm}
                      onChange={e => setForm({...form, diameter_mm:e.target.value})}/>
                  </div>
                  <div>
                    <label className="label">Comprimento (mm)</label>
                    <input className="input" type="number" step="0.5" placeholder="11.5" value={form.length_mm}
                      onChange={e => setForm({...form, length_mm:e.target.value})}/>
                  </div>
                </div>
                <div>
                  <label className="label">Notas</label>
                  <textarea className="input resize-none h-16" value={form.notes}
                    onChange={e => setForm({...form, notes:e.target.value})} placeholder="Observações opcionais..."/>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="osso" checked={form.osseointegrated}
                    onChange={e => setForm({...form, osseointegrated:e.target.checked})}
                    className="w-4 h-4 accent-primary-500"/>
                  <label htmlFor="osso" className="text-xs text-gray-400">Osseointegrado</label>
                </div>
                <div className="flex gap-2">
                  <button className="btn-secondary flex-1 text-xs"
                    onClick={() => { setCurrentBox(null); setSelected(null) }}>Cancelar</button>
                  <button className="btn-primary flex-1 text-xs" disabled={saving} onClick={handleSave}>
                    {saving ? <Loader2 size={13} className="animate-spin"/> : <><Save size={13}/> Salvar</>}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
