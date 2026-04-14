import { useEffect, useState, useCallback } from 'react'
import api from '../services/api'
import Badge from '../components/ui/Badge'
import Spinner from '../components/ui/Spinner'
import Empty from '../components/ui/Empty'
import Modal from '../components/ui/Modal'
import toast from 'react-hot-toast'
import { Database, Plus, Play, Download, Loader2 } from 'lucide-react'

export default function DatasetsPage() {
  const [datasets, setDatasets] = useState([])
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(false)
  const [saving, setSaving]     = useState(false)
  const [form, setForm] = useState({ name:'', description:'', export_format:'yolo', split_train:0.7, split_val:0.2 })

  const load = useCallback(() => {
    setLoading(true)
    api.get('/datasets').then(r=>setDatasets(r.data)).finally(()=>setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const handleCreate = async () => {
    if (!form.name.trim()) return toast.error('Nome obrigatório.')
    setSaving(true)
    try { await api.post('/datasets',form); toast.success('Dataset criado!'); setModal(false); load() }
    catch {} finally { setSaving(false) }
  }

  const handleAddApproved = async id => {
    try {
      const r = await api.post(`/datasets/${id}/add-approved`)
      toast.success(`${r.data.added} imagens: ${r.data.train} train / ${r.data.val} val / ${r.data.test} test`)
      load()
    } catch {}
  }

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="page-header">
        <div><h2 className="page-title">Datasets de Treino</h2><p className="text-sm text-gray-500 mt-0.5">{datasets.length} datasets</p></div>
        <button className="btn-primary" onClick={()=>setModal(true)}><Plus size={16}/> Novo Dataset</button>
      </div>

      {loading ? <div className="flex justify-center py-20"><Spinner size="lg"/></div>
      : datasets.length===0 ? (
        <Empty icon={Database} title="Nenhum dataset" description="Crie um dataset com as anotações aprovadas."
          action={<button className="btn-primary" onClick={()=>setModal(true)}><Plus size={16}/> Criar</button>}/>
      ) : (
        <div className="grid gap-4">
          {datasets.map(d=>(
            <div key={d.id} className="card p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1 flex-wrap">
                    <h3 className="font-semibold text-gray-100">{d.name}</h3>
                    <Badge value={d.status}/>
                    <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">{d.export_format.toUpperCase()}</span>
                  </div>
                  {d.description && <p className="text-sm text-gray-400 mb-2">{d.description}</p>}
                  <div className="flex gap-5 text-xs text-gray-500">
                    <span>{d.image_count} imagens</span>
                    <span>Train {Math.round(d.split_train*100)}% · Val {Math.round(d.split_val*100)}% · Test {Math.round(d.split_test*100)}%</span>
                    <span>por {d.created_by_name}</span>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button className="btn-secondary text-xs" onClick={()=>handleAddApproved(d.id)}><Play size={13}/> Montar</button>
                  <button className="btn-secondary text-xs" disabled={d.image_count===0} onClick={()=>api.post(`/datasets/${d.id}/export`).then(r=>toast.success(`Job: ${r.data.job_id}`))}><Download size={13}/> Exportar</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modal} onClose={()=>setModal(false)} title="Novo Dataset">
        <div className="p-5 space-y-4">
          <div><label className="label">Nome *</label><input className="input" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="ex: Dataset v1"/></div>
          <div><label className="label">Descrição</label><textarea className="input resize-none h-20" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Formato</label>
              <select className="input" value={form.export_format} onChange={e=>setForm({...form,export_format:e.target.value})}>
                <option value="yolo">YOLO</option><option value="coco">COCO</option><option value="pascal_voc">Pascal VOC</option>
              </select>
            </div>
            <div>
              <label className="label">Train / Val split</label>
              <div className="flex gap-2">
                <input className="input" type="number" min="0.1" max="0.9" step="0.05" value={form.split_train} onChange={e=>setForm({...form,split_train:+e.target.value})}/>
                <input className="input" type="number" min="0.05" max="0.5" step="0.05" value={form.split_val} onChange={e=>setForm({...form,split_val:+e.target.value})}/>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button className="btn-secondary" onClick={()=>setModal(false)}>Cancelar</button>
            <button className="btn-primary" disabled={saving} onClick={handleCreate}>
              {saving?<Loader2 size={14} className="animate-spin"/>:<><Plus size={14}/> Criar</>}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
