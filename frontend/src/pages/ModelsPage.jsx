import { useEffect, useState, useCallback } from 'react'
import api from '../services/api'
import Badge from '../components/ui/Badge'
import Spinner from '../components/ui/Spinner'
import Empty from '../components/ui/Empty'
import Modal from '../components/ui/Modal'
import toast from 'react-hot-toast'
import { BrainCircuit, Plus, Rocket, Loader2 } from 'lucide-react'

export default function ModelsPage() {
  const [models, setModels]     = useState([])
  const [datasets, setDatasets] = useState([])
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(false)
  const [saving, setSaving]     = useState(false)
  const [form, setForm] = useState({ name:'', dataset_id:'', architecture:'yolov8m', epochs:100, notes:'' })

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([api.get('/models'),api.get('/datasets')]).then(([m,d])=>{
      setModels(m.data); setDatasets(d.data.filter(ds=>ds.status==='ready'))
    }).finally(()=>setLoading(false))
  },[])
  useEffect(()=>{load()},[load])

  const handleTrain = async () => {
    if (!form.name||!form.dataset_id) return toast.error('Nome e dataset obrigatórios.')
    setSaving(true)
    try { const r=await api.post('/models/train',form); toast.success(`Treino enfileirado! Job: ${r.data.job_id}`); setModal(false); load() }
    catch {} finally { setSaving(false) }
  }

  const handleDeploy = async id => {
    try { await api.post(`/models/${id}/deploy`); toast.success('Modelo deployado!'); load() } catch {}
  }

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="page-header">
        <div><h2 className="page-title">Modelos ML</h2><p className="text-sm text-gray-500 mt-0.5">{models.length} modelos</p></div>
        <button className="btn-primary" onClick={()=>setModal(true)}><Plus size={16}/> Novo Treino</button>
      </div>

      {loading ? <div className="flex justify-center py-20"><Spinner size="lg"/></div>
      : models.length===0 ? (
        <Empty icon={BrainCircuit} title="Nenhum modelo" description="Crie um dataset pronto e inicie o treino."
          action={<button className="btn-primary" onClick={()=>setModal(true)}><Plus size={16}/> Iniciar Treino</button>}/>
      ) : (
        <div className="grid gap-4">
          {models.map(m=>(
            <div key={m.id} className="card p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1 flex-wrap">
                    <h3 className="font-semibold text-gray-100">{m.name}</h3>
                    <Badge value={m.status}/>
                    <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">{m.architecture}</span>
                    <span className="text-xs text-gray-500">{m.version}</span>
                  </div>
                  {m.dataset_name && <p className="text-xs text-gray-500 mb-2">Dataset: {m.dataset_name} · {m.epochs} épocas</p>}
                  {m.map50!=null && (
                    <div className="flex gap-5 text-xs">
                      <span className="text-green-400 font-medium">mAP50: {(m.map50*100).toFixed(1)}%</span>
                      {m.map95!=null&&<span className="text-blue-400 font-medium">mAP95: {(m.map95*100).toFixed(1)}%</span>}
                      {m.precision!=null&&<span className="text-gray-400">Prec: {(m.precision*100).toFixed(1)}%</span>}
                      {m.recall!=null&&<span className="text-gray-400">Recall: {(m.recall*100).toFixed(1)}%</span>}
                    </div>
                  )}
                </div>
                {m.status==='completed' && (
                  <button className="btn-primary text-xs flex-shrink-0" onClick={()=>handleDeploy(m.id)}><Rocket size={13}/> Deploy</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modal} onClose={()=>setModal(false)} title="Novo Treino">
        <div className="p-5 space-y-4">
          <div><label className="label">Nome *</label><input className="input" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="ex: DII-v1"/></div>
          <div>
            <label className="label">Dataset *</label>
            <select className="input" value={form.dataset_id} onChange={e=>setForm({...form,dataset_id:e.target.value})}>
              <option value="">Selecionar...</option>
              {datasets.map(d=><option key={d.id} value={d.id}>{d.name} ({d.image_count} imgs)</option>)}
            </select>
            {datasets.length===0&&<p className="text-xs text-yellow-500 mt-1">Nenhum dataset "ready". Monte um dataset primeiro.</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Arquitetura</label>
              <select className="input" value={form.architecture} onChange={e=>setForm({...form,architecture:e.target.value})}>
                {['yolov8n','yolov8s','yolov8m','yolov8l','yolov8x'].map(a=><option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div><label className="label">Épocas</label><input className="input" type="number" min="1" max="300" value={form.epochs} onChange={e=>setForm({...form,epochs:+e.target.value})}/></div>
          </div>
          <div><label className="label">Notas</label><textarea className="input resize-none h-16" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></div>
          <div className="flex justify-end gap-3 pt-2">
            <button className="btn-secondary" onClick={()=>setModal(false)}>Cancelar</button>
            <button className="btn-primary" disabled={saving||!form.dataset_id} onClick={handleTrain}>
              {saving?<Loader2 size={14} className="animate-spin"/>:<><BrainCircuit size={14}/> Iniciar</>}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
