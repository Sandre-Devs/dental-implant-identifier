import { useEffect, useState, useCallback } from 'react'
import api from '../services/api'
import Spinner from '../components/ui/Spinner'
import Empty from '../components/ui/Empty'
import Modal from '../components/ui/Modal'
import toast from 'react-hot-toast'
import { Building2, Plus, ChevronRight, ChevronDown, Loader2 } from 'lucide-react'

function SystemRow({ mfr }) {
  const [open, setOpen]       = useState(false)
  const [systems, setSystems] = useState([])
  const [loading, setLoading] = useState(false)
  const [sysModal, setSysModal] = useState(false)
  const [form, setForm] = useState({ name:'', connection_type:'cone_morse', platform:'' })
  const [saving, setSaving]   = useState(false)

  const loadSystems = () => {
    if (!open) { setLoading(true); api.get(`/manufacturers/${mfr.id}/systems`).then(r=>setSystems(r.data)).finally(()=>setLoading(false)) }
    setOpen(!open)
  }

  const handleAddSystem = async () => {
    if (!form.name) return toast.error('Nome obrigatório.')
    setSaving(true)
    try { await api.post(`/manufacturers/${mfr.id}/systems`,form); toast.success('Sistema adicionado!'); setSysModal(false); api.get(`/manufacturers/${mfr.id}/systems`).then(r=>setSystems(r.data)) }
    catch {} finally { setSaving(false) }
  }

  return (
    <>
      <div className="card">
        <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-800/50 rounded-xl transition-colors" onClick={loadSystems}>
          <div className="flex items-center gap-3">
            {open?<ChevronDown size={16} className="text-gray-400"/>:<ChevronRight size={16} className="text-gray-400"/>}
            <div>
              <p className="font-medium text-gray-200">{mfr.name}</p>
              <p className="text-xs text-gray-500">{mfr.country} · {mfr.system_count} sistema(s)</p>
            </div>
          </div>
          <button className="btn-ghost text-xs gap-1 z-10" onClick={e=>{e.stopPropagation();setSysModal(true)}}><Plus size={13}/> Sistema</button>
        </div>
        {open && (
          <div className="border-t border-gray-800 px-4 pb-4">
            {loading?<div className="flex justify-center py-4"><Spinner size="sm"/></div>
            :systems.length===0?<p className="text-gray-600 text-xs py-4 text-center">Nenhum sistema cadastrado.</p>
            :<div className="mt-3 space-y-2">
              {systems.map(s=>(
                <div key={s.id} className="flex items-center justify-between p-3 bg-gray-800 rounded-lg text-sm">
                  <div><p className="text-gray-200 font-medium">{s.name}</p><p className="text-xs text-gray-500">{s.connection_type}{s.platform&&` · ${s.platform}`}</p></div>
                  <span className="text-xs text-gray-500">{s.component_count} comp.</span>
                </div>
              ))}
            </div>}
          </div>
        )}
      </div>
      <Modal open={sysModal} onClose={()=>setSysModal(false)} title={`Novo Sistema — ${mfr.name}`} size="sm">
        <div className="p-5 space-y-4">
          <div><label className="label">Nome</label><input className="input" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="ex: Titamax CM"/></div>
          <div>
            <label className="label">Tipo de Conexão</label>
            <select className="input" value={form.connection_type} onChange={e=>setForm({...form,connection_type:e.target.value})}>
              {['cone_morse','hex_interno','hex_externo','trilobe','octogono','spline','desconhecido'].map(c=><option key={c} value={c}>{c.replace('_',' ')}</option>)}
            </select>
          </div>
          <div><label className="label">Plataforma (opcional)</label><input className="input" value={form.platform} onChange={e=>setForm({...form,platform:e.target.value})} placeholder="ex: CM"/></div>
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={()=>setSysModal(false)}>Cancelar</button>
            <button className="btn-primary" disabled={saving} onClick={handleAddSystem}>
              {saving?<Loader2 size={14} className="animate-spin"/>:<><Plus size={14}/> Adicionar</>}
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}

export default function ManufacturersPage() {
  const [manufacturers, setManufacturers] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState(false)
  const [saving, setSaving]   = useState(false)
  const [form, setForm] = useState({ name:'', country:'Brasil', website:'' })

  const load = useCallback(()=>{ setLoading(true); api.get('/manufacturers').then(r=>setManufacturers(r.data)).finally(()=>setLoading(false)) },[])
  useEffect(()=>{load()},[load])

  const handleCreate = async () => {
    if (!form.name) return toast.error('Nome obrigatório.')
    setSaving(true)
    try { await api.post('/manufacturers',form); toast.success('Fabricante cadastrado!'); setModal(false); load() }
    catch {} finally { setSaving(false) }
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="page-header">
        <div><h2 className="page-title">Fabricantes & Sistemas</h2><p className="text-sm text-gray-500 mt-0.5">{manufacturers.length} fabricantes</p></div>
        <button className="btn-primary" onClick={()=>setModal(true)}><Plus size={16}/> Fabricante</button>
      </div>
      {loading?<div className="flex justify-center py-20"><Spinner size="lg"/></div>
      :manufacturers.length===0?<Empty icon={Building2} title="Nenhum fabricante" description="Adicione fabricantes e seus sistemas de implante." action={<button className="btn-primary" onClick={()=>setModal(true)}><Plus size={16}/> Adicionar</button>}/>
      :<div className="space-y-3">{manufacturers.map(m=><SystemRow key={m.id} mfr={m}/>)}</div>}
      <Modal open={modal} onClose={()=>setModal(false)} title="Novo Fabricante" size="sm">
        <div className="p-5 space-y-4">
          <div><label className="label">Nome</label><input className="input" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="ex: Neodent"/></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">País</label><input className="input" value={form.country} onChange={e=>setForm({...form,country:e.target.value})}/></div>
            <div><label className="label">Website</label><input className="input" value={form.website} onChange={e=>setForm({...form,website:e.target.value})} placeholder="neodent.com.br"/></div>
          </div>
          <div className="flex justify-end gap-3">
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
