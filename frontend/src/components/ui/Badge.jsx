import clsx from 'clsx'
const variants = {
  pending:'bg-gray-700 text-gray-300', annotating:'bg-blue-900/50 text-blue-300 border border-blue-700/50',
  annotated:'bg-yellow-900/50 text-yellow-300 border border-yellow-700/50', reviewed:'bg-purple-900/50 text-purple-300 border border-purple-700/50',
  approved:'bg-green-900/50 text-green-300 border border-green-700/50', rejected:'bg-red-900/50 text-red-300 border border-red-700/50',
  draft:'bg-gray-700 text-gray-300', submitted:'bg-blue-900/50 text-blue-300',
  training:'bg-yellow-900/50 text-yellow-300', completed:'bg-green-900/50 text-green-300',
  deployed:'bg-primary-900/50 text-primary-300 border border-primary-700/50',
  failed:'bg-red-900/50 text-red-300', archived:'bg-gray-700 text-gray-400',
  ready:'bg-green-900/50 text-green-300', building:'bg-yellow-900/50 text-yellow-300',
  panoramica:'bg-blue-900/50 text-blue-300', periapical:'bg-purple-900/50 text-purple-300',
  admin:'bg-red-900/50 text-red-300', reviewer:'bg-purple-900/50 text-purple-300',
  annotator:'bg-blue-900/50 text-blue-300', viewer:'bg-gray-700 text-gray-400',
  low:'bg-gray-700 text-gray-300', medium:'bg-yellow-900/50 text-yellow-300', high:'bg-green-900/50 text-green-300',
}
const labels = {
  pending:'Pendente', annotating:'Anotando', annotated:'Anotado', reviewed:'Revisado',
  approved:'Aprovado', rejected:'Rejeitado', draft:'Rascunho', submitted:'Enviado',
  training:'Treinando', completed:'Concluído', deployed:'Deployado', failed:'Falhou',
  archived:'Arquivado', ready:'Pronto', building:'Montando',
  panoramica:'Panorâmica', periapical:'Periapical',
  admin:'Admin', reviewer:'Revisor', annotator:'Anotador', viewer:'Visualizador',
  low:'Baixa', medium:'Média', high:'Alta',
}
export default function Badge({ value, className }) {
  return <span className={clsx('badge', variants[value] || 'bg-gray-700 text-gray-300', className)}>{labels[value] || value}</span>
}
