import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import Badge from '../components/ui/Badge'
import Spinner from '../components/ui/Spinner'
import Empty from '../components/ui/Empty'
import Modal from '../components/ui/Modal'
import toast from 'react-hot-toast'
import { CheckSquare, CheckCircle, XCircle, Eye } from 'lucide-react'

export default function ReviewPage() {
  const navigate = useNavigate()
  const [items, setItems]     = useState([])
  const [loading, setLoading] = useState(true)
  const [rejectModal, setRejectModal] = useState(null)
  const [rejectReason, setRejectReason] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    api.get('/images', { params:{ status:'annotating', limit:100 } }).then(async r => {
      const imgs = r.data.images
      const results = await Promise.all(imgs.map(img => api.get('/annotations', { params:{ image_id:img.id } })))
      const combined = []
      imgs.forEach((img,i) => results[i].data.filter(a=>a.status==='submitted').forEach(a => combined.push({...a,image:img})))
      setItems(combined)
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const handleReview = async (id, status, reason) => {
    try {
      await api.post(`/annotations/${id}/review`, { status, reject_reason:reason||undefined })
      toast.success(status==='approved'?'Aprovada!':'Rejeitada.')
      load()
    } catch {}
  }

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="page-header">
        <div>
          <h2 className="page-title">Revisão de Anotações</h2>
          <p className="text-sm text-gray-500 mt-0.5">{items.length} aguardando revisão</p>
        </div>
      </div>

      {loading ? <div className="flex justify-center py-20"><Spinner size="lg"/></div>
      : items.length===0 ? <Empty icon={CheckSquare} title="Tudo revisado!" description="Nenhuma anotação aguardando revisão."/>
      : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {['Imagem','Fabricante','Sistema','FDI','Confiança','Anotador',''].map(h=>(
                  <th key={h} className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wide font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(ann=>(
                <tr key={ann.id} className="table-row">
                  <td className="px-4 py-3">
                    <p className="text-gray-200 text-xs max-w-xs truncate">{ann.image?.original_name}</p>
                    <Badge value={ann.image?.type}/>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{ann.manufacturer_name||<span className="text-gray-600">—</span>}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{ann.system_name||'—'}</td>
                  <td className="px-4 py-3 text-gray-400">{ann.position_fdi||'—'}</td>
                  <td className="px-4 py-3"><Badge value={ann.confidence}/></td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{ann.annotator_name}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button className="btn-ghost p-1.5" onClick={()=>navigate(`/images/${ann.image_id}/annotate`)}><Eye size={14}/></button>
                      <button className="btn-ghost p-1.5 text-green-400 hover:text-green-300" onClick={()=>handleReview(ann.id,'approved')}><CheckCircle size={16}/></button>
                      <button className="btn-ghost p-1.5 text-red-400 hover:text-red-300" onClick={()=>{setRejectModal(ann.id);setRejectReason('')}}><XCircle size={16}/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!rejectModal} onClose={()=>setRejectModal(null)} title="Motivo da Rejeição" size="sm">
        <div className="p-5 space-y-4">
          <div>
            <label className="label">Motivo (opcional)</label>
            <textarea className="input resize-none h-24" value={rejectReason} onChange={e=>setRejectReason(e.target.value)} placeholder="Descreva o problema..."/>
          </div>
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={()=>setRejectModal(null)}>Cancelar</button>
            <button className="btn-danger" onClick={()=>{handleReview(rejectModal,'rejected',rejectReason);setRejectModal(null)}}><XCircle size={14}/> Rejeitar</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
