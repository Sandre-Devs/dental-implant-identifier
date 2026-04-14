import { useEffect, useState } from 'react'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'
import Spinner from '../components/ui/Spinner'
import { Images, CheckSquare, Clock, AlertCircle, BrainCircuit, RefreshCw, Tag } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

export default function DashboardPage() {
  const { user } = useAuthStore()
  const [stats,   setStats]   = useState(null)
  const [models,  setModels]  = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = () => {
    setRefreshing(true)
    Promise.all([api.get('/images/stats'), api.get('/models')])
      .then(([s, m]) => { setStats(s.data); setModels(m.data.slice(0, 3)) })
      .finally(() => { setLoading(false); setRefreshing(false) })
  }

  useEffect(() => { load() }, [])

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg"/></div>

  const imgChartData = [
    { name:'Pendente',  value: stats?.pending     || 0, color:'#6b7280' },
    { name:'Anotando',  value: stats?.annotating  || 0, color:'#3b82f6' },
    { name:'Revisado',  value: stats?.reviewed    || 0, color:'#a855f7' },
    { name:'Aprovado',  value: stats?.approved    || 0, color:'#22c55e' },
    { name:'Rejeitado', value: stats?.rejected    || 0, color:'#ef4444' },
  ]

  const annChartData = [
    { name:'Rascunho', value: stats?.annotations_draft     || 0, color:'#6b7280' },
    { name:'Enviada',  value: stats?.annotations_submitted || 0, color:'#f59e0b' },
    { name:'Aprovada', value: stats?.annotations_approved  || 0, color:'#22c55e' },
    { name:'Rejeit.',  value: stats?.annotations_rejected  || 0, color:'#ef4444' },
  ]

  const kpis = [
    {
      label: 'Total de Imagens',
      value: stats?.total || 0,
      sub: `${stats?.panoramica||0} pan · ${stats?.periapical||0} peri · ${stats?.cbct||0} cbct`,
      icon: Images,
      color: 'text-primary-400',
    },
    {
      label: 'Imagens Aprovadas',
      value: stats?.approved || 0,
      sub: 'prontas para dataset',
      icon: CheckSquare,
      color: 'text-green-400',
    },
    {
      label: 'Anotações Aprovadas',
      value: stats?.annotations_approved || 0,
      sub: `de ${stats?.total_annotations||0} total`,
      icon: Tag,
      color: 'text-emerald-400',
    },
    {
      label: 'Aguardando Revisão',
      value: stats?.annotations_submitted || 0,
      sub: 'anotações submetidas',
      icon: AlertCircle,
      color: 'text-yellow-400',
    },
    {
      label: 'Para Anotar',
      value: (stats?.pending||0) + (stats?.annotating||0),
      sub: 'pendente + em progresso',
      icon: Clock,
      color: 'text-blue-400',
    },
  ]

  return (
    <div className="space-y-6 max-w-6xl">

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold text-white">
            Olá, {user?.name?.split(' ')[0]} 👋
          </h2>
          <p className="text-gray-500 text-sm mt-0.5">Painel de controle do DII</p>
        </div>
        <button
          onClick={load}
          disabled={refreshing}
          className="btn-ghost text-xs gap-1.5 mt-1"
          title="Atualizar métricas"
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''}/>
          <span className="hidden sm:inline">Atualizar</span>
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {kpis.map(({ label, value, sub, icon: Icon, color }) => (
          <div key={label} className="stat-card">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500 uppercase tracking-wide leading-tight">{label}</p>
              <Icon size={15} className={color}/>
            </div>
            <p className={`text-3xl font-bold mt-2 tabular-nums ${color}`}>{value}</p>
            <p className="text-xs text-gray-500 mt-1 leading-snug">{sub}</p>
          </div>
        ))}
      </div>

      {/* Charts + Models */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Imagens por status */}
        <div className="card p-4">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">
            Imagens por Status
          </p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={imgChartData} barSize={28}>
              <XAxis dataKey="name" tick={{ fill:'#6b7280', fontSize:10 }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fill:'#6b7280', fontSize:10 }} axisLine={false} tickLine={false} width={24}/>
              <Tooltip contentStyle={{ background:'#111827', border:'1px solid #374151', borderRadius:8, color:'#f3f4f6', fontSize:12 }}/>
              <Bar dataKey="value" radius={[4,4,0,0]}>
                {imgChartData.map((e,i) => <Cell key={i} fill={e.color}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Anotações por status */}
        <div className="card p-4">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">
            Anotações por Status
          </p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={annChartData} barSize={28}>
              <XAxis dataKey="name" tick={{ fill:'#6b7280', fontSize:10 }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fill:'#6b7280', fontSize:10 }} axisLine={false} tickLine={false} width={24}/>
              <Tooltip contentStyle={{ background:'#111827', border:'1px solid #374151', borderRadius:8, color:'#f3f4f6', fontSize:12 }}/>
              <Bar dataKey="value" radius={[4,4,0,0]}>
                {annChartData.map((e,i) => <Cell key={i} fill={e.color}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Modelos recentes */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Modelos Recentes</p>
            <BrainCircuit size={14} className="text-primary-400"/>
          </div>
          {models.length === 0
            ? <p className="text-gray-500 text-xs text-center py-8">Nenhum modelo ainda.</p>
            : <div className="space-y-2">
                {models.map(m => (
                  <div key={m.id} className="flex items-center justify-between p-2.5 bg-gray-800/60 rounded-lg">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-200 truncate">{m.name}</p>
                      <p className="text-xs text-gray-500">{m.architecture} · {m.version}</p>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      {m.map50 != null && (
                        <p className="text-xs font-semibold text-green-400">
                          {(m.map50*100).toFixed(1)}%
                        </p>
                      )}
                      <p className={`text-xs capitalize ${
                        m.status==='deployed'  ? 'text-primary-400' :
                        m.status==='completed' ? 'text-green-400' : 'text-yellow-400'
                      }`}>{m.status}</p>
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
