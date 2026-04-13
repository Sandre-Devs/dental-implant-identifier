import { useEffect, useState } from 'react'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'
import Spinner from '../components/ui/Spinner'
import { Images, CheckSquare, Clock, AlertCircle, BrainCircuit } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

export default function DashboardPage() {
  const { user } = useAuthStore()
  const [stats, setStats]   = useState(null)
  const [models, setModels] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.get('/images/stats'), api.get('/models')])
      .then(([s,m]) => { setStats(s.data); setModels(m.data.slice(0,3)) })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg"/></div>

  const chartData = [
    { name:'Pendente',  value:stats?.pending    ||0, color:'#6b7280' },
    { name:'Anotando',  value:stats?.annotating ||0, color:'#3b82f6' },
    { name:'Revisado',  value:stats?.reviewed   ||0, color:'#a855f7' },
    { name:'Aprovado',  value:stats?.approved   ||0, color:'#22c55e' },
    { name:'Rejeitado', value:stats?.rejected   ||0, color:'#ef4444' },
  ]

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h2 className="text-2xl font-semibold text-white">Olá, {user?.name?.split(' ')[0]} 👋</h2>
        <p className="text-gray-500 text-sm mt-1">Painel de controle do sistema DII</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label:'Total de Imagens', value:stats?.total||0, sub:`${stats?.panoramica||0} pan · ${stats?.periapical||0} peri`, icon:Images, color:'text-primary-400' },
          { label:'Aprovadas',        value:stats?.approved||0, sub:'prontas para dataset', icon:CheckSquare, color:'text-green-400' },
          { label:'Pendentes',        value:(stats?.pending||0)+(stats?.annotating||0), sub:'aguardando anotação', icon:Clock, color:'text-yellow-400' },
          { label:'Para Revisar',     value:stats?.reviewed||0, sub:'aguardando revisão', icon:AlertCircle, color:'text-purple-400' },
        ].map(({ label,value,sub,icon:Icon,color }) => (
          <div key={label} className="stat-card">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
              <Icon size={16} className={color}/>
            </div>
            <p className={`text-3xl font-bold mt-2 ${color}`}>{value}</p>
            <p className="text-xs text-gray-500 mt-1">{sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <p className="text-sm font-medium text-gray-300 mb-4">Distribuição por Status</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} barSize={32}>
              <XAxis dataKey="name" tick={{ fill:'#6b7280', fontSize:11 }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fill:'#6b7280', fontSize:11 }} axisLine={false} tickLine={false}/>
              <Tooltip contentStyle={{ background:'#111827', border:'1px solid #374151', borderRadius:8, color:'#f3f4f6' }}/>
              <Bar dataKey="value" radius={[4,4,0,0]}>
                {chartData.map((e,i) => <Cell key={i} fill={e.color}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-medium text-gray-300">Modelos Recentes</p>
            <BrainCircuit size={16} className="text-primary-400"/>
          </div>
          {models.length === 0
            ? <p className="text-gray-500 text-sm text-center py-8">Nenhum modelo treinado ainda.</p>
            : <div className="space-y-3">
                {models.map(m => (
                  <div key={m.id} className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-200">{m.name}</p>
                      <p className="text-xs text-gray-500">{m.architecture} · {m.version}</p>
                    </div>
                    <div className="text-right">
                      {m.map50!=null && <p className="text-sm font-medium text-green-400">mAP50: {(m.map50*100).toFixed(1)}%</p>}
                      <p className={`text-xs capitalize ${m.status==='deployed'?'text-primary-400':m.status==='completed'?'text-green-400':'text-yellow-400'}`}>{m.status}</p>
                    </div>
                  </div>
                ))}
              </div>
          }
        </div>
      </div>
    </div>
  )
}
