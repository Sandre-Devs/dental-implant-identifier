import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../services/api'
import Badge from '../components/ui/Badge'
import Spinner from '../components/ui/Spinner'
import Modal from '../components/ui/Modal'
import toast from 'react-hot-toast'
import { ArrowLeft, Save, Trash2, Plus, Loader2, List, ChevronDown, ChevronUp } from 'lucide-react'

const COLORS = ['#01696f','#3b82f6','#a855f7','#f59e0b','#ef4444','#10b981','#f97316','#06b6d4']

export default function AnnotatorPage() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const canvasRef     = useRef(null)
  const containerRef  = useRef(null)

  const [image, setImage]             = useState(null)
  const [imgEl, setImgEl]             = useState(null)
  const [imgLoaded, setImgLoaded]     = useState(false)
  const [annotations, setAnnotations] = useState([])
  const [manufacturers, setManufacturers] = useState([])
  const [systems, setSystems]         = useState([])
  const [loading, setLoading]         = useState(true)
  const [selected, setSelected]       = useState(null)
  const [drawing, setDrawing]         = useState(false)
  const [startPt, setStartPt]         = useState(null)
  const [currentBox, setCurrentBox]   = useState(null)
  const [saving, setSaving]           = useState(false)
  const [listOpen, setListOpen]       = useState(false)
  const [formOpen, setFormOpen]       = useState(false)
  const [panelOpen, setPanelOpen]     = useState(false) // accordion desktop
  const [form, setForm] = useState({
    manufacturer_id:'', system_id:'', confidence:'low',
    position_fdi:'', diameter_mm:'', length_mm:'',
    osseointegrated:false, notes:''
  })

  /* ─── Load ─────────────────────────────────────── */
  const load = useCallback(() => {
    Promise.all([
      api.get(`/images/${id}`),
      api.get('/annotations', { params:{ image_id:id } }),
      api.get('/manufacturers'),
    ]).then(([img, ann, mfr]) => {
      setImage(img.data); setAnnotations(ann.data); setManufacturers(mfr.data)
    }).finally(() => setLoading(false))
  }, [id])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!id) return
    api.get(`/images/${id}/file`, { responseType:'blob' })
      .then(r => {
        const url = URL.createObjectURL(r.data)
        const img = new Image()
        img.onload  = () => { setImgEl(img); setImgLoaded(true) }
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

  /* ─── Draw ─────────────────────────────────────── */
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
      // Valores normalizados (0–1) → pixels do canvas
      const bx = ann.bbox_x * canvas.width
      const by = ann.bbox_y * canvas.height
      const bw = ann.bbox_w * canvas.width
      const bh = ann.bbox_h * canvas.height
      ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.setLineDash([])
      ctx.strokeRect(bx, by, bw, bh)
      ctx.fillStyle = color + 'cc'
      ctx.fillRect(bx, by - 20, 130, 20)
      ctx.fillStyle = '#fff'; ctx.font = '13px Inter,sans-serif'
      ctx.fillText((`#${i+1} ${ann.manufacturer_name||'?'}`).slice(0,18), bx+4, by-5)
      if (selected === ann.id) {
        ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.setLineDash([5,3])
        ctx.strokeRect(bx-2, by-2, bw+4, bh+4)
        ctx.setLineDash([])
      }
    })

    if (currentBox) {
      ctx.strokeStyle='#01696f'; ctx.lineWidth=3; ctx.setLineDash([8,4])
      ctx.strokeRect(currentBox.x, currentBox.y, currentBox.w, currentBox.h)
      ctx.setLineDash([])
    }
  }, [annotations, selected, currentBox, imgLoaded, imgEl])

  useEffect(() => { drawAll() }, [drawAll])

  /* ─── Coordenada relativa ao canvas ────────────── */
  const getPos = (clientX, clientY) => {
    const c = canvasRef.current, r = c.getBoundingClientRect()
    return {
      x: (clientX - r.left) * (c.width  / r.width),
      y: (clientY - r.top)  * (c.height / r.height)
    }
  }

  /* ─── Mouse ─────────────────────────────────────── */
  const onMouseDown = e => {
    if (e.button !== 0) return
    const p = getPos(e.clientX, e.clientY)
    setDrawing(true); setStartPt(p)
    setCurrentBox({ x:p.x, y:p.y, w:0, h:0 })
  }
  const onMouseMove = e => {
    if (!drawing || !startPt) return
    const p = getPos(e.clientX, e.clientY)
    setCurrentBox({ x:Math.min(startPt.x,p.x), y:Math.min(startPt.y,p.y), w:Math.abs(p.x-startPt.x), h:Math.abs(p.y-startPt.y) })
  }
  const onMouseUp = () => {
    if (!drawing || !currentBox) return
    setDrawing(false)
    if (currentBox.w > 20 && currentBox.h > 20) { setSelected('new'); setFormOpen(true) }
    else setCurrentBox(null)
  }

  /* ─── Touch ─────────────────────────────────────── */
  const onTouchStart = e => {
    e.preventDefault()
    const t = e.touches[0], p = getPos(t.clientX, t.clientY)
    setDrawing(true); setStartPt(p)
    setCurrentBox({ x:p.x, y:p.y, w:0, h:0 })
  }
  const onTouchMove = e => {
    e.preventDefault()
    if (!drawing || !startPt) return
    const t = e.touches[0], p = getPos(t.clientX, t.clientY)
    setCurrentBox({ x:Math.min(startPt.x,p.x), y:Math.min(startPt.y,p.y), w:Math.abs(p.x-startPt.x), h:Math.abs(p.y-startPt.y) })
  }
  const onTouchEnd = e => {
    e.preventDefault()
    if (!drawing || !currentBox) return
    setDrawing(false)
    if (currentBox.w > 20 && currentBox.h > 20) { setSelected('new'); setFormOpen(true) }
    else setCurrentBox(null)
  }

  /* ─── Actions ───────────────────────────────────── */
  const handleSave = async () => {
    if (!currentBox) return
    setSaving(true)
    try {
      const W = imgEl?.naturalWidth  || 1
      const H = imgEl?.naturalHeight || 1
      await api.post('/annotations', {
        image_id: id,
        bbox_x: parseFloat((currentBox.x / W).toFixed(6)),
        bbox_y: parseFloat((currentBox.y / H).toFixed(6)),
        bbox_w: parseFloat((currentBox.w / W).toFixed(6)),
        bbox_h: parseFloat((currentBox.h / H).toFixed(6)),
        ...form,
        diameter_mm: form.diameter_mm || null,
        length_mm:   form.length_mm   || null,
      })
      toast.success('Anotação salva!')
      setCurrentBox(null); setSelected(null); setFormOpen(false)
      setForm({ manufacturer_id:'', system_id:'', confidence:'low', position_fdi:'', diameter_mm:'', length_mm:'', osseointegrated:false, notes:'' })
      load()
    } catch {} finally { setSaving(false) }
  }

  const handleDelete = async annId => {
    try { await api.delete(`/annotations/${annId}`); toast.success('Removida.'); setSelected(null); load() } catch {}
  }

  const handleSubmitAll = async () => {
    const drafts = annotations.filter(a => a.status === 'draft')
    if (!drafts.length) return toast.error('Nenhum rascunho.')
    try {
      await Promise.all(drafts.map(a => api.patch(`/annotations/${a.id}`, { status:'submitted' })))
      toast.success(`${drafts.length} enviada(s) para revisão!`)
      load()
    } catch {}
  }

  /* ─── Form (reutilizado desktop + modal mobile) ─── */
  const FormContent = (
    <div className="space-y-3 p-4">
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
      <div className="flex gap-2 pt-1">
        <button className="btn-secondary flex-1 text-sm"
          onClick={() => { setCurrentBox(null); setSelected(null); setFormOpen(false) }}>
          Cancelar
        </button>
        <button className="btn-primary flex-1 text-sm" disabled={saving} onClick={handleSave}>
          {saving ? <Loader2 size={14} className="animate-spin"/> : <><Save size={14}/> Salvar</>}
        </button>
      </div>
    </div>
  )

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg"/></div>

  const draftCount = annotations.filter(a => a.status==='draft').length

  return (
    /*
      Layout mobile: coluna única — toolbar → canvas full-width → barra de ações fixada embaixo
      Layout desktop (lg+): toolbar → [canvas | painel lateral]
    */
    <div className="flex flex-col h-full gap-2">

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
        <button className="btn-ghost px-2 py-1.5" onClick={() => navigate('/images')}>
          <ArrowLeft size={16}/>
          <span className="hidden sm:inline ml-1">Voltar</span>
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-100 text-sm truncate">{image?.original_name}</p>
          <p className="text-xs text-gray-500">{image?.width}×{image?.height}px · <Badge value={image?.type}/></p>
        </div>
        {draftCount > 0 && (
          <button className="btn-primary text-xs px-3 py-1.5" onClick={handleSubmitAll}>
            <Save size={13}/> Enviar ({draftCount})
          </button>
        )}
      </div>

      {/* ── Área principal ── */}
      <div className="flex gap-3 flex-1 min-h-0">

        {/* Canvas — ocupa toda a largura no mobile */}
        <div
          ref={containerRef}
          className="flex-1 card overflow-auto bg-gray-950 min-w-0"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {!imgLoaded && (
            <div className="flex flex-col items-center justify-center h-full min-h-48 gap-3">
              <Spinner size="lg"/>
              <p className="text-xs text-gray-500">Carregando imagem...</p>
            </div>
          )}
          <canvas
            ref={canvasRef}
            className="touch-none block"
            style={{
              display: imgLoaded ? 'block' : 'none',
              width: '100%',        /* escala para caber na tela */
              height: 'auto',
              cursor: 'crosshair',
            }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          />
        </div>

        {/* Painel lateral — só desktop (lg+) */}
        <div className="hidden lg:flex w-72 xl:w-80 flex-col gap-3 flex-shrink-0">

          {/* Lista de anotações */}
          <div className="card p-4 flex-shrink-0">
            <button
              className="flex items-center justify-between w-full text-xs font-medium text-gray-400 uppercase tracking-wide mb-2"
              onClick={() => setPanelOpen(!panelOpen)}>
              <span>Anotações ({annotations.length})</span>
              {panelOpen ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
            </button>
            {panelOpen && (
              <AnnotationList
                annotations={annotations}
                selected={selected}
                setSelected={setSelected}
                handleDelete={handleDelete}
              />
            )}
            {!panelOpen && annotations.length > 0 && (
              <p className="text-xs text-gray-600">{annotations.length} anotação(ões)</p>
            )}
          </div>

          {/* Form inline (desktop) */}
          {selected === 'new' && currentBox && (
            <div className="card overflow-y-auto flex-1">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide px-4 pt-4 flex items-center gap-2">
                <Plus size={13}/> Nova Anotação
              </p>
              {FormContent}
            </div>
          )}
        </div>
      </div>

      {/* ── Barra de ações flutuante — só mobile ── */}
      <div className="flex gap-2 flex-shrink-0 lg:hidden">
        <button
          className="btn-secondary flex-1 text-sm relative"
          onClick={() => setListOpen(true)}>
          <List size={15}/> Anotações
          {annotations.length > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-primary-500 text-white text-xs flex items-center justify-center font-bold">
              {annotations.length}
            </span>
          )}
        </button>
        {draftCount > 0 && (
          <button className="btn-primary flex-1 text-sm" onClick={handleSubmitAll}>
            <Save size={15}/> Enviar ({draftCount})
          </button>
        )}
      </div>

      {/* Dica mobile */}
      <p className="text-xs text-gray-600 text-center flex-shrink-0 lg:hidden pb-1">
        ✦ Arraste o dedo na imagem para marcar um implante
      </p>

      {/* ── Modal: lista mobile ── */}
      <Modal open={listOpen} onClose={() => setListOpen(false)} title={`Anotações (${annotations.length})`} size="sm">
        <div className="p-4 space-y-3">
          <AnnotationList
            annotations={annotations}
            selected={selected}
            setSelected={setSelected}
            handleDelete={handleDelete}
          />
          {draftCount > 0 && (
            <button className="btn-primary w-full justify-center text-sm" onClick={() => { handleSubmitAll(); setListOpen(false) }}>
              <Save size={14}/> Enviar {draftCount} rascunho(s) para revisão
            </button>
          )}
        </div>
      </Modal>

      {/* ── Modal: form mobile ── */}
      <Modal
        open={formOpen && selected === 'new'}
        onClose={() => { setFormOpen(false); setCurrentBox(null); setSelected(null) }}
        title="Nova Anotação"
        size="sm"
      >
        {FormContent}
      </Modal>
    </div>
  )
}

function AnnotationList({ annotations, selected, setSelected, handleDelete }) {
  if (!annotations.length)
    return <p className="text-gray-600 text-xs text-center py-4">Nenhuma anotação ainda.</p>
  return (
    <div className="space-y-1.5 max-h-60 overflow-y-auto">
      {annotations.map((ann, i) => (
        <div key={ann.id}
          className={`flex items-center gap-2 p-2.5 rounded-lg cursor-pointer border transition-all text-xs
            ${selected===ann.id ? 'border-primary-500 bg-primary-500/10' : 'border-gray-700 hover:border-gray-600'}`}
          onClick={() => setSelected(selected === ann.id ? null : ann.id)}>
          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }}/>
          <div className="flex-1 min-w-0">
            <p className="text-gray-200 font-medium truncate">#{i+1} {ann.manufacturer_name || 'Sem fabricante'}</p>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-gray-500">{ann.position_fdi || '—'}</span>
              <span className="text-gray-700">·</span>
              <Badge value={ann.status}/>
            </div>
          </div>
          {ann.status === 'draft' && (
            <button className="text-gray-500 hover:text-red-400 p-1 flex-shrink-0"
              onClick={e => { e.stopPropagation(); handleDelete(ann.id) }}>
              <Trash2 size={13}/>
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
