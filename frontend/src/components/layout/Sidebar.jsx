import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import {
  LayoutDashboard, Images, CheckSquare, Database,
  BrainCircuit, Building2, Users, Microscope,
  ChevronLeft, ChevronRight, X
} from 'lucide-react'
import clsx from 'clsx'

const nav = [
  { to:'/',              label:'Dashboard',    icon:LayoutDashboard, roles:['admin','reviewer','annotator','viewer'] },
  { to:'/images',        label:'Radiografias', icon:Images,          roles:['admin','reviewer','annotator','viewer'] },
  { to:'/review',        label:'Revisão',      icon:CheckSquare,     roles:['admin','reviewer'] },
  { to:'/datasets',      label:'Datasets',     icon:Database,        roles:['admin','reviewer'] },
  { to:'/models',        label:'Modelos ML',   icon:BrainCircuit,    roles:['admin'] },
  { to:'/manufacturers', label:'Fabricantes',  icon:Building2,       roles:['admin'] },
  { to:'/users',         label:'Usuários',     icon:Users,           roles:['admin'] },
]

export default function Sidebar({ open, onClose }) {
  const { user } = useAuthStore()
  const [collapsed, setCollapsed] = useState(false)
  const filtered = nav.filter(n => n.roles.includes(user?.role))

  return (
    <aside className={clsx(
      // Mobile: drawer fixo, controlado por `open`
      // Desktop (lg+): sempre visível, largura controlada por `collapsed`
      'fixed inset-y-0 left-0 z-30 bg-gray-900 border-r border-gray-800 flex flex-col transition-all duration-200',
      'lg:relative lg:translate-x-0 lg:z-auto',
      open ? 'translate-x-0' : '-translate-x-full',
      collapsed ? 'lg:w-16 w-64' : 'w-64 lg:w-60'
    )}>
      {/* Logo */}
      <div className={clsx(
        'h-14 flex items-center border-b border-gray-800 flex-shrink-0',
        collapsed ? 'lg:justify-center lg:px-0 px-5 gap-3' : 'gap-3 px-5'
      )}>
        <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center flex-shrink-0">
          <Microscope size={18} className="text-white" />
        </div>
        <div className={clsx(collapsed && 'lg:hidden')}>
          <p className="text-sm font-semibold text-white leading-none">DII</p>
          <p className="text-xs text-gray-500 leading-none mt-0.5">Implant Identifier</p>
        </div>
        {/* Fechar no mobile */}
        <button
          onClick={onClose}
          className="ml-auto btn-ghost p-1 lg:hidden"
          aria-label="Fechar menu"
        >
          <X size={18} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {filtered.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to} to={to} end={to === '/'}
            title={collapsed ? label : undefined}
            onClick={onClose}
            className={({ isActive }) => clsx(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
              collapsed && 'lg:justify-center lg:px-0',
              isActive
                ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
            )}>
            <Icon size={17} className="flex-shrink-0" />
            <span className={clsx(collapsed && 'lg:hidden')}>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* User + Toggle */}
      <div className="p-2 border-t border-gray-800 space-y-1">
        <div className={clsx('flex items-center gap-3 px-2 py-2', collapsed && 'lg:hidden')}>
          <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-200 truncate">{user?.name}</p>
            <p className="text-xs text-gray-500 truncate capitalize">{user?.role}</p>
          </div>
        </div>
        {/* Collapse toggle — só desktop */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Expandir' : 'Recolher'}
          className={clsx(
            'hidden lg:flex w-full items-center gap-2 px-3 py-2 rounded-lg text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-all',
            collapsed && 'justify-center'
          )}>
          {collapsed ? <ChevronRight size={15}/> : <><ChevronLeft size={15}/> Recolher</>}
        </button>
      </div>
    </aside>
  )
}
