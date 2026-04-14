import { useEffect, useState, useCallback, useRef } from 'react'
import api from '../services/api'
import Badge from '../components/ui/Badge'
import Spinner from '../components/ui/Spinner'
import Empty from '../components/ui/Empty'
import Modal from '../components/ui/Modal'
import toast from 'react-hot-toast'
import {
  BrainCircuit, Plus, Rocket, Loader2, CheckCircle2,
  Terminal, BarChart3, ChevronRight, RefreshCw,
  Cpu, Archive, AlertCircle, Zap, Trash2, Upload, FileUp
} from 'lucide-react'
import clsx from 'clsx'

const POLL_MS = 4000

/* ── Barra de progresso animada ──────────────────── */
function ProgressBar({ value = 0, status }) {
  const color =
    status === 'completed' ? 'bg-green-500' :
    status === 'failed'    ? 'bg-red-500'   :
    status === 'running'   ? 'bg-primary-500' :
                             'bg-gray-600'
  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-gray-400">
          {status === 'queued'    ? 'Na fila...'     :
           status === 'running'   ? `Treinando... ${value}%` :
           status === 'completed' ? 'Concluído ✓'   :
           status === 'failed'    ? 'Falhou ✗'      : status}
        </span>
        <span className="text-xs font-mono text-gray-400">{value}%</span>
      </div>
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={clsx('h-full rounded-full transition-all duration-700', color,
            status === 'running' && value < 100 && 'animate-pulse'
          )}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  )
}

/* ── Console de log ──────────────────────────────── */
function LogConsole({ lines }) {
  const bottomRef = useRef(null)
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  if (!lines.length) return (
    <div className="flex flex-col items-center justify-center h-48 text-gray-600 gap-2">
      <Terminal size={24}/>
      <p className="text-sm">Nenhum log disponível ainda</p>
      <p className="text-xs">Os logs aparecerão aqui quando o treino iniciar</p>
    </div>
  )

  return (
    <div className="font-mono text-xs leading-relaxed space-y-0.5">
      {lines.map((line, i) => {
        const isError   = /error|failed|exception/i.test(line)
        const isWarn    = /warn|warning/i.test(line)
        const isSuccess = /completed|done|saved|best|epoch \d+\/\d+/i.test(line)
        return (
          <div key={i} className={clsx('px-1 rounded',
            isError   ? 'text-red-400'    :
            isWarn    ? 'text-yellow-400' :
            isSuccess ? 'text-green-400'  : 'text-gray-400'
          )}>
            {line}
          </div>
        )
      })}
      <div ref={bottomRef}/>
    </div>
  )
}

/* ── Card de métricas ────────────────────────────── */
function MetricBadge({ label, value, color = 'text-gray-300' }) {
  return (
    <div className="flex flex-col items-center px-3 py-2 bg-gray-800/60 rounded-lg min-w-16">
      <span className={clsx('text-base font-bold tabular-nums', color)}>{value}</span>
      <span className="text-xs text-gray-500 mt-0.5">{label}</span>
    </div>
  )
}

/* ── Modelo card ─────────────────────────────────── */
function ModelCard({ model, onDeploy, onUndeploy, onDelete, onRedeploy, onSelect, isSelected }) {
  const isDeployed  = model.status === 'deployed'
  const isTraining  = model.status === 'training'
  const isCompleted = model.status === 'completed'
  const isArchived  = model.status === 'archived'
  const isFailed    = model.status === 'failed'

  return (
    <div
      className={clsx(
        'card p-0 overflow-hidden transition-all cursor-pointer',
        isDeployed ? 'ring-2 ring-primary-500/60 shadow-lg shadow-primary-500/10' : 'hover:border-gray-600',
        isSelected && 'ring-2 ring-primary-400/40'
      )}
      onClick={() => onSelect(model.id === isSelected ? null : model.id)}
    >
      {/* Banner deployed */}
      {isDeployed && (
        <div className="flex items-center gap-2 px-4 py-2 bg-primary-500/15 border-b border-primary-500/20">
          <Zap size={13} className="text-primary-400"/>
          <span className="text-xs font-semibold text-primary-300 uppercase tracking-wide">
            Modelo em produção — sendo usado na detecção automática
          </span>
        </div>
      )}

      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          {/* Info principal */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 className="font-semibold text-gray-100 text-sm">{model.name}</h3>
              <Badge value={model.status}/>
              <span className="text-xs text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded font-mono">{model.architecture}</span>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              {model.dataset_name && <span>Dataset: <span className="text-gray-400">{model.dataset_name}</span> · </span>}
              {model.epochs} épocas · <span className="text-gray-600">{model.version}</span>
            </p>

            {/* Progress bar para modelos em treino */}
            {(isTraining || model.job_progress != null) && !isCompleted && !isFailed && (
              <div className="mb-3 max-w-sm">
                <ProgressBar value={model.job_progress || 0} status={model.job_status || 'queued'}/>
              </div>
            )}

            {/* Métricas para modelos completos */}
            {model.map50 != null && (
              <div className="flex gap-2 flex-wrap">
                <MetricBadge label="mAP50" value={`${(model.map50*100).toFixed(1)}%`} color="text-green-400"/>
                {model.map95    != null && <MetricBadge label="mAP95"      value={`${(model.map95*100).toFixed(1)}%`} color="text-blue-400"/>}
                {model.precision!= null && <MetricBadge label="Precisão"   value={`${(model.precision*100).toFixed(1)}%`}/>}
                {model.recall   != null && <MetricBadge label="Recall"     value={`${(model.recall*100).toFixed(1)}%`}/>}
              </div>
            )}
          </div>

          {/* Ações */}
          <div className="flex flex-col gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
            {isCompleted && (
              <button
                className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5"
                onClick={() => onDeploy(model.id)}
              >
                <Rocket size={13}/> Deploy
              </button>
            )}
            {isDeployed && (
              <button
                className="btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5 text-gray-400 hover:text-red-400"
                title="Arquivar modelo"
                onClick={() => onUndeploy(model.id)}
              >
                <Archive size={13}/> Arquivar
              </button>
            )}
            {isArchived && (
              <button
                className="btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5 text-primary-400 hover:text-primary-300"
                title="Colocar este modelo em produção novamente"
                onClick={() => onRedeploy(model.id)}
              >
                <Rocket size={13}/> Re-Deploy
              </button>
            )}
            {(isFailed || isArchived) && (
              <button
                className="btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5 text-red-500 hover:text-red-400"
                title="Deletar permanentemente"
                onClick={() => onDelete(model.id, model.name)}
              >
                <Trash2 size={13}/> Deletar
              </button>
            )}
            <button
              className={clsx(
                'btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5',
                isSelected ? 'text-primary-400' : 'text-gray-500'
              )}
              onClick={() => onSelect(isSelected ? null : model.id)}
            >
              <Terminal size={13}/>
              {isSelected ? 'Fechar' : 'Report'}
              <ChevronRight size={11} className={clsx('transition-transform', isSelected && 'rotate-90')}/>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Report drawer ───────────────────────────────── */
function ReportDrawer({ modelId, onClose }) {
  const [tab,      setTab]      = useState('progress')
  const [job,      setJob]      = useState(null)
  const [logLines, setLogLines] = useState([])
  const [loading,  setLoading]  = useState(true)
  const pollRef = useRef(null)

  const consoleRef = useRef(null)

  const fetchAll = useCallback(async () => {
    try {
      const [jobRes, logRes] = await Promise.all([
        api.get(`/models/${modelId}/job`),
        api.get(`/models/${modelId}/logs`)
      ])
      setJob(jobRes.data)
      const lines = (logRes.data.log || '').split('\n').filter(Boolean)
      setLogLines(lines)
    } catch(e) {
      // job pode não existir ainda
    } finally { setLoading(false) }
  }, [modelId])

  // Scroll automático no console quando chegam novos logs
  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight
    }
  }, [logLines])

  useEffect(() => {
    fetchAll()
    pollRef.current = setInterval(fetchAll, POLL_MS)
    return () => clearInterval(pollRef.current)
  }, [fetchAll])

  // Alias para compatibilidade com botão manual
  const fetch = fetchAll

  const isRunning = job?.status === 'running' || job?.status === 'queued'

  return (
    <div className="card p-0 overflow-hidden border-primary-500/20">
      {/* Header do drawer */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-800/50 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <button
            className={clsx('text-xs px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1.5',
              tab === 'progress' ? 'bg-primary-500/20 text-primary-300' : 'text-gray-400 hover:text-gray-200'
            )}
            onClick={() => setTab('progress')}
          >
            <BarChart3 size={12}/> Progresso
          </button>
          <button
            className={clsx('text-xs px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1.5',
              tab === 'logs' ? 'bg-primary-500/20 text-primary-300' : 'text-gray-400 hover:text-gray-200'
            )}
            onClick={() => setTab('logs')}
          >
            <Terminal size={12}/> Console
            {logLines.length > 0 && (
              <span className="bg-gray-700 text-gray-400 text-xs px-1.5 rounded-full">{logLines.length}</span>
            )}
          </button>
        </div>
        <div className="flex items-center gap-2">
          {isRunning && (
            <div className="flex items-center gap-1 text-xs text-primary-400 animate-pulse">
              <Loader2 size={11} className="animate-spin"/> ao vivo
            </div>
          )}
          <button className="btn-ghost p-1" onClick={fetch} title="Atualizar">
            <RefreshCw size={13} className="text-gray-500"/>
          </button>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="p-4">
        {loading ? (
          <div className="flex justify-center py-8"><Spinner/></div>
        ) : !job ? (
          <div className="flex flex-col items-center gap-2 py-8 text-gray-600">
            <AlertCircle size={20}/>
            <p className="text-sm">Nenhum job de treino encontrado para este modelo</p>
          </div>
        ) : tab === 'progress' ? (
          <div className="space-y-5">
            {/* Progress bar grande */}
            <div className="p-4 bg-gray-800/40 rounded-xl">
              <ProgressBar value={job.progress || 0} status={job.status}/>
            </div>

            {/* Timeline de status */}
            <div className="space-y-2">
              {[
                { label: 'Job criado',    time: job.created_at,   done: true },
                { label: 'Iniciado',      time: job.started_at,   done: !!job.started_at },
                { label: 'Concluído',     time: job.completed_at, done: !!job.completed_at },
              ].map((s, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className={clsx('w-2 h-2 rounded-full flex-shrink-0',
                    s.done ? 'bg-green-500' : 'bg-gray-700')}/>
                  <span className={clsx('text-xs', s.done ? 'text-gray-300' : 'text-gray-600')}>{s.label}</span>
                  {s.time && <span className="text-xs text-gray-600 ml-auto">{new Date(s.time).toLocaleString('pt-BR')}</span>}
                </div>
              ))}
            </div>

            {/* Payload */}
            {job.payload && (
              <div className="text-xs text-gray-500 bg-gray-800/40 rounded-lg p-3 space-y-1">
                {Object.entries(typeof job.payload === 'object' ? job.payload : {}).map(([k,v]) => (
                  <div key={k} className="flex gap-2">
                    <span className="text-gray-600 w-28 flex-shrink-0">{k}:</span>
                    <span className="text-gray-400 font-mono">{String(v)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Resultado/erro */}
            {job.result && (
              <div className={clsx('p-3 rounded-lg text-xs font-mono',
                job.status === 'failed' ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                        : 'bg-green-500/10 text-green-400 border border-green-500/20'
              )}>
                {typeof job.result === 'string' ? job.result : JSON.stringify(job.result, null, 2)}
              </div>
            )}
          </div>
        ) : (
          /* Console */
          <div className="bg-gray-950 rounded-xl p-3 max-h-80 overflow-y-auto">
            <LogConsole lines={logLines}/>
          </div>
        )}
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════
   PAGE PRINCIPAL
═══════════════════════════════════════════════════ */
export default function ModelsPage() {
  const [models,     setModels]     = useState([])
  const [datasets,   setDatasets]   = useState([])
  const [loading,    setLoading]    = useState(true)
  const [modal,       setModal]       = useState(false)
  const [uploadModal, setUploadModal] = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [uploading,   setUploading]   = useState(false)
  const [selectedId,  setSelectedId]  = useState(null)
  const [form, setForm] = useState({
    name: '', dataset_id: '', architecture: 'yolov8m', epochs: 100, notes: ''
  })
  const pollRef = useRef(null)

  /* Carrega modelos e enriquece com progress do job */
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const [mRes, dRes] = await Promise.all([
        api.get('/models'),
        api.get('/datasets')
      ])
      const mList = mRes.data
      // Para modelos em treino, busca progress
      const enriched = await Promise.all(mList.map(async m => {
        if (m.status === 'training') {
          try {
            const log = await api.get(`/models/${m.id}/logs`)
            return { ...m, job_progress: log.data.progress, job_status: log.data.status }
          } catch { return m }
        }
        return m
      }))
      setModels(enriched)
      setDatasets(dRes.data.filter(ds => ds.status === 'ready'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    // Polling contínuo enquanto há modelos em treino
    pollRef.current = setInterval(() => {
      setModels(prev => {
        if (prev.some(m => m.status === 'training')) { load(true) }
        return prev
      })
    }, POLL_MS)
    return () => clearInterval(pollRef.current)
  }, [load])

  const handleTrain = async () => {
    if (!form.name || !form.dataset_id) return toast.error('Nome e dataset obrigatórios.')
    setSaving(true)
    try {
      await api.post('/models/train', form)
      toast.success('Treino enfileirado!')
      setModal(false)
      load()
    } catch {} finally { setSaving(false) }
  }

  const handleUploadModel = async (formData) => {
    setUploading(true)
    try {
      await api.post('/models/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      toast.success('Modelo importado com sucesso!')
      setUploadModal(false)
      load()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Erro ao importar modelo.')
    } finally { setUploading(false) }
  }

  const handleDeploy = async id => {
    try {
      await api.post(`/models/${id}/deploy`)
      toast.success('✅ Modelo em produção! A IA usará este modelo nas próximas detecções.')
      load()
    } catch {}
  }

  const handleUndeploy = async id => {
    try {
      await api.patch(`/models/${id}`, { status: 'archived' })
      toast.success('Modelo arquivado.')
      load()
    } catch {}
  }

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Deletar permanentemente o modelo "${name}"?\nEsta ação não pode ser desfeita.`)) return
    try {
      await api.delete(`/models/${id}`)
      toast.success('Modelo removido.')
      load()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Erro ao deletar modelo.')
    }
  }

  const handleRedeploy = async id => {
    try {
      await api.post(`/models/${id}/redeploy`)
      toast.success('✅ Modelo redeployado! A IA voltará a usar este modelo.')
      load()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Erro ao redeploy.')
    }
  }

  const deployedModel  = models.find(m => m.status === 'deployed')
  const trainingModels = models.filter(m => m.status === 'training')
  const otherModels    = models.filter(m => !['deployed','training'].includes(m.status))

  return (
    <div className="space-y-5 max-w-4xl">

      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Modelos ML</h2>
          <p className="text-sm text-gray-500 mt-0.5">{models.length} modelos · {trainingModels.length > 0 && `${trainingModels.length} em treino`}</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-ghost text-xs" onClick={() => load()} title="Atualizar"><RefreshCw size={14}/></button>
          <button className="btn-ghost text-xs border border-gray-700 px-3 py-1.5 flex items-center gap-1.5" onClick={() => setUploadModal(true)}>
            <FileUp size={14}/> Importar .pt
          </button>
          <button className="btn-primary" onClick={() => setModal(true)}><Plus size={16}/> Novo Treino</button>
        </div>
      </div>

      {/* Banner — modelo em produção */}
      {deployedModel ? (
        <div className="flex items-center gap-3 p-3 bg-primary-500/10 border border-primary-500/30 rounded-xl">
          <div className="w-8 h-8 rounded-lg bg-primary-500/20 flex items-center justify-center flex-shrink-0">
            <Zap size={16} className="text-primary-400"/>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-primary-300">
              {deployedModel.name} <span className="font-normal text-primary-400/70">está em produção</span>
            </p>
            <p className="text-xs text-primary-400/60 mt-0.5">
              {deployedModel.architecture} · {deployedModel.dataset_name}
              {deployedModel.map50 && ` · mAP50: ${(deployedModel.map50*100).toFixed(1)}%`}
            </p>
          </div>
          <Cpu size={16} className="text-primary-400/40 flex-shrink-0"/>
        </div>
      ) : (
        <div className="flex items-center gap-3 p-3 bg-yellow-500/8 border border-yellow-500/20 rounded-xl">
          <AlertCircle size={16} className="text-yellow-500/60 flex-shrink-0"/>
          <p className="text-xs text-yellow-400/70">
            Nenhum modelo em produção — faça o deploy de um modelo treinado para ativar a detecção automática
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg"/></div>
      ) : models.length === 0 ? (
        <Empty icon={BrainCircuit} title="Nenhum modelo" description="Crie um dataset pronto e inicie o treino."
          action={<button className="btn-primary" onClick={() => setModal(true)}><Plus size={16}/> Iniciar Treino</button>}/>
      ) : (
        <div className="space-y-3">

          {/* Modelos em treino */}
          {trainingModels.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium px-1 flex items-center gap-1.5">
                <Loader2 size={11} className="animate-spin text-primary-400"/> Em treino
              </p>
              {trainingModels.map(m => (
                <div key={m.id} className="space-y-2">
                  <ModelCard
                    model={m}
                    onDeploy={handleDeploy}
                    onUndeploy={handleUndeploy}
                    onDelete={handleDelete}
                    onRedeploy={handleRedeploy}
                    onSelect={id => setSelectedId(prev => prev === id ? null : id)}
                    isSelected={selectedId === m.id}
                  />
                  {selectedId === m.id && (
                    <ReportDrawer modelId={m.id} onClose={() => setSelectedId(null)}/>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Modelo deployed */}
          {deployedModel && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium px-1 flex items-center gap-1.5">
                <Zap size={11} className="text-primary-400"/> Em produção
              </p>
              <ModelCard
                model={deployedModel}
                onDeploy={handleDeploy}
                onUndeploy={handleUndeploy}
                    onDelete={handleDelete}
                    onRedeploy={handleRedeploy}
                onSelect={id => setSelectedId(prev => prev === id ? null : id)}
                isSelected={selectedId === deployedModel.id}
              />
              {selectedId === deployedModel.id && (
                <ReportDrawer modelId={deployedModel.id} onClose={() => setSelectedId(null)}/>
              )}
            </div>
          )}

          {/* Outros modelos */}
          {otherModels.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium px-1">Histórico</p>
              {otherModels.map(m => (
                <div key={m.id} className="space-y-2">
                  <ModelCard
                    model={m}
                    onDeploy={handleDeploy}
                    onUndeploy={handleUndeploy}
                    onDelete={handleDelete}
                    onRedeploy={handleRedeploy}
                    onSelect={id => setSelectedId(prev => prev === id ? null : id)}
                    isSelected={selectedId === m.id}
                  />
                  {selectedId === m.id && (
                    <ReportDrawer modelId={m.id} onClose={() => setSelectedId(null)}/>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal Novo Treino */}
      <Modal open={modal} onClose={() => setModal(false)} title="Novo Treino">
        <div className="p-5 space-y-4">
          <div>
            <label className="label">Nome *</label>
            <input className="input" value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="ex: DII-v1"/>
          </div>
          <div>
            <label className="label">Dataset *</label>
            <select className="input" value={form.dataset_id}
              onChange={e => setForm({ ...form, dataset_id: e.target.value })}>
              <option value="">Selecionar...</option>
              {datasets.map(d => <option key={d.id} value={d.id}>{d.name} ({d.image_count} imgs)</option>)}
            </select>
            {datasets.length === 0 && (
              <p className="text-xs text-yellow-500 mt-1">⚠ Nenhum dataset "ready". Monte um dataset primeiro.</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Arquitetura</label>
              <select className="input" value={form.architecture}
                onChange={e => setForm({ ...form, architecture: e.target.value })}>
                {['yolov8n','yolov8s','yolov8m','yolov8l','yolov8x'].map(a =>
                  <option key={a} value={a}>{a}</option>
                )}
              </select>
            </div>
            <div>
              <label className="label">Épocas</label>
              <input className="input" type="number" min="1" max="300"
                value={form.epochs} onChange={e => setForm({ ...form, epochs: +e.target.value })}/>
            </div>
          </div>
          <div>
            <label className="label">Notas</label>
            <textarea className="input resize-none h-16" value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}/>
          </div>
          <div className="p-3 bg-gray-800/50 rounded-lg text-xs text-gray-400 space-y-1">
            <p className="font-medium text-gray-300">ℹ Como funciona</p>
            <p>1. O job entra na fila e o serviço ML inicia o treino</p>
            <p>2. Acompanhe o progresso em tempo real clicando em "Report"</p>
            <p>3. Após concluído, clique em "Deploy" para ativar em produção</p>
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button className="btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
            <button className="btn-primary" disabled={saving || !form.dataset_id || !form.name} onClick={handleTrain}>
              {saving
                ? <Loader2 size={14} className="animate-spin"/>
                : <><BrainCircuit size={14}/> Iniciar</>
              }
            </button>
          </div>
        </div>
      </Modal>
    </div>

      {/* Modal — Importar modelo .pt */}
      {uploadModal && (
        <Modal title="Importar Modelo Treinado" onClose={() => setUploadModal(false)}>
          <UploadModelForm
            onSubmit={handleUploadModel}
            loading={uploading}
            onCancel={() => setUploadModal(false)}
          />
        </Modal>
      )}
  
  )
}
/* ── Modal de importação de modelo .pt ─────────────────────── */
function UploadModelForm({ onSubmit, loading, onCancel }) {
  const [file,   setFile]   = useState(null)
  const [name,   setName]   = useState('')
  const [arch,   setArch]   = useState('yolov8s')
  const [epochs, setEpochs] = useState('')
  const [map50,  setMap50]  = useState('')
  const [notes,  setNotes]  = useState('Importado do Google Colab')
  const [drag,   setDrag]   = useState(false)
  const inputRef = useRef(null)

  const handleDrop = e => {
    e.preventDefault(); setDrag(false)
    const f = e.dataTransfer.files[0]
    if (f?.name.endsWith('.pt')) { setFile(f); if (!name) setName(f.name.replace('.pt','')) }
    else toast.error('Apenas arquivos .pt são aceitos.')
  }

  const handleFile = e => {
    const f = e.target.files[0]
    if (f) { setFile(f); if (!name) setName(f.name.replace('.pt','')) }
  }

  const handleSubmit = e => {
    e.preventDefault()
    if (!file) return toast.error('Selecione um arquivo .pt.')
    if (!name.trim()) return toast.error('Nome obrigatório.')
    const fd = new FormData()
    fd.append('model', file)
    fd.append('name', name.trim())
    fd.append('architecture', arch)
    if (epochs) fd.append('epochs', epochs)
    if (map50)  fd.append('map50', parseFloat(map50) / 100)
    if (notes)  fd.append('notes', notes)
    onSubmit(fd)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Drop zone */}
      <div
        className={clsx(
          'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
          drag ? 'border-primary-400 bg-primary-500/10' : 'border-gray-700 hover:border-gray-500',
          file && 'border-green-500/50 bg-green-500/5'
        )}
        onDragOver={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" accept=".pt" className="hidden" onChange={handleFile}/>
        {file ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
              <CheckCircle2 size={20} className="text-green-400"/>
            </div>
            <p className="text-sm font-medium text-green-400">{file.name}</p>
            <p className="text-xs text-gray-500">{(file.size/1024/1024).toFixed(1)} MB</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-gray-500">
            <Upload size={24}/>
            <p className="text-sm">Arraste o arquivo <span className="font-mono text-primary-400">best.pt</span> aqui</p>
            <p className="text-xs">ou clique para selecionar · máx 500 MB</p>
          </div>
        )}
      </div>

      {/* Campos */}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs text-gray-400 mb-1">Nome do modelo *</label>
          <input className="input w-full" value={name} onChange={e => setName(e.target.value)} placeholder="ex: DII-Colab-yolov8s-v1" required/>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Arquitetura</label>
          <select className="input w-full" value={arch} onChange={e => setArch(e.target.value)}>
            {['yolov8n','yolov8s','yolov8m','yolov8l','yolov8x'].map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Épocas treinadas</label>
          <input className="input w-full" type="number" value={epochs} onChange={e => setEpochs(e.target.value)} placeholder="ex: 50"/>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">mAP50 (%) — opcional</label>
          <input className="input w-full" type="number" step="0.1" value={map50} onChange={e => setMap50(e.target.value)} placeholder="ex: 72.5"/>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Notas</label>
          <input className="input w-full" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Origem do modelo"/>
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-1">
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="btn-primary flex items-center gap-2" disabled={loading}>
          {loading ? <Loader2 size={14} className="animate-spin"/> : <Upload size={14}/>}
          {loading ? 'Enviando...' : 'Importar Modelo'}
        </button>
      </div>
    </form>
  )
}
