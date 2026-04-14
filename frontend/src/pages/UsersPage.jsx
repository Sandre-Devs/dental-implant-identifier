import { useEffect, useState, useCallback } from 'react'
import api from '../services/api'
import Badge from '../components/ui/Badge'
import Spinner from '../components/ui/Spinner'
import Empty from '../components/ui/Empty'
import Modal from '../components/ui/Modal'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import toast from 'react-hot-toast'
import { Users, Plus, UserX, Loader2 } from 'lucide-react'

export default function UsersPage() {
  const [users, setUsers]     = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState(false)
  const [saving, setSaving]   = useState(false)
  const [deactivate, setDeactivate] = useState(null)
  const [form, setForm] = useState({ name:'', email:'', password:'', role:'annotator' })

  const load = useCallback(()=>{ setLoading(true); api.get('/users').then(r=>setUsers(r.data)).finally(()=>setLoading(false)) },[])
  useEffect(()=>{load()},[load])

  const handleCreate = async () => {
    if (!form.name||!form.email||!form.password) return toast.error('Preencha todos os campos obrigatórios.')
    setSaving(true)
    try { await api.post('/users',form); toast.success('Usuário criado!'); setModal(false); setForm({name:'',email:'',password:'',role:'annotator'}); load() }
    catch {} finally { setSaving(false) }
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="page-header">
        <div><h2 className="page-title">Usuários</h2><p className="text-sm text-gray-500 mt-0.5">{users.length} usuários</p></div>
        <button className="btn-primary" onClick={()=>setModal(true)}><Plus size={16}/> Novo Usuário</button>
      </div>
      {loading?<div className="flex justify-center py-20"><Spinner size="lg"/></div>
      :users.length===0?<Empty icon={Users} title="Nenhum usuário"/>
      :<div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-800">{['Nome','E-mail','Função','Status','Desde',''].map(h=><th key={h} className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wide font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {users.map(u=>(
              <tr key={u.id} className="table-row">
                <td className="px-4 py-3"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-full bg-primary-700 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">{u.name.charAt(0).toUpperCase()}</div><span className="text-gray-200 font-medium">{u.name}</span></div></td>
                <td className="px-4 py-3 text-gray-400">{u.email}</td>
                <td className="px-4 py-3"><Badge value={u.role}/></td>
                <td className="px-4 py-3"><span className={`text-xs ${u.active?'text-green-400':'text-red-400'}`}>{u.active?'Ativo':'Inativo'}</span></td>
                <td className="px-4 py-3 text-gray-500 text-xs">{new Date(u.created_at).toLocaleDateString('pt-BR')}</td>
                <td className="px-4 py-3">{u.active&&<button className="btn-ghost p-1.5 text-red-400 hover:text-red-300" onClick={()=>setDeactivate(u)}><UserX size={14}/></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>}
      <Modal open={modal} onClose={()=>setModal(false)} title="Novo Usuário" size="sm">
        <div className="p-5 space-y-4">
          <div><label className="label">Nome *</label><input className="input" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></div>
          <div><label className="label">E-mail *</label><input className="input" type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></div>
          <div><label className="label">Senha * (mín. 8)</label><input className="input" type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/></div>
          <div><label className="label">Função</label><select className="input" value={form.role} onChange={e=>setForm({...form,role:e.target.value})}><option value="annotator">Anotador</option><option value="reviewer">Revisor</option><option value="viewer">Visualizador</option><option value="admin">Admin</option></select></div>
          <div className="flex justify-end gap-3 pt-2">
            <button className="btn-secondary" onClick={()=>setModal(false)}>Cancelar</button>
            <button className="btn-primary" disabled={saving} onClick={handleCreate}>{saving?<Loader2 size={14} className="animate-spin"/>:<><Plus size={14}/> Criar</>}</button>
          </div>
        </div>
      </Modal>
      <ConfirmDialog open={!!deactivate} onClose={()=>setDeactivate(null)}
        onConfirm={async()=>{ try{await api.delete(`/users/${deactivate?.id}`);toast.success('Usuário desativado.');load()}catch{} }}
        title="Desativar Usuário" message={`Desativar "${deactivate?.name}"?`} confirmLabel="Desativar" danger/>
    </div>
  )
}
