import { X } from 'lucide-react'
import clsx from 'clsx'
export default function Modal({ open, onClose, title, children, size='md' }) {
  if (!open) return null
  const sizes = { sm:'max-w-md', md:'max-w-lg', lg:'max-w-2xl', xl:'max-w-4xl' }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose}/>
      <div className={clsx('relative w-full bg-gray-900 border border-gray-700 rounded-xl shadow-2xl flex flex-col max-h-[90vh]', sizes[size])}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 flex-shrink-0">
          <h3 className="font-semibold text-gray-100">{title}</h3>
          <button onClick={onClose} className="btn-ghost p-1"><X size={18}/></button>
        </div>
        <div className="overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  )
}
