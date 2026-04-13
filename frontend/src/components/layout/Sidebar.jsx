import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import {
  LayoutDashboard, Images, CheckSquare, Database,
  BrainCircuit, Building2, Users, Microscope, ChevronLeft, ChevronRight
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

export default function Sidebar() {
  const { user } = useAuthStore()
  const [collapsed, setCollapsed] = useState(false)
  const filtered = nav.filter(n => n.roles.includes(user?.role))

  return (
    <aside className={clsx(
      'flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col transition-all duration-200',
      collapsed ? 'w-16' : 'w-60'
    )}>
      {/* Logo */}
      <div className={clsx(
        'h-16 flex items-center border-b border-gray-800 flex-shrink-0',
        collapsed ? 'justify-center' : 'gap-3 px-5'
      )}>
        <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center flex-shrink-0">
          <Microscope size={18} className="text-white" />
        </div>
        {!collapsed && (
          <div>
            <p className="text-sm font-semibold text-white leading-none">DII</p>
            <p className="text-xs text-gray-500 leading-none mt-0.5">Implant Identifier</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {filtered.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to} to={to} end={to === '/'}
            title={collapsed ? label : undefined}
            className={({ isActive }) => clsx(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
              collapsed && 'justify-center px-0',
              isActive
                ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
            )}>
            <Icon size={17} className="flex-shrink-0" />
            {!collapsed && label}
          </NavLink>
        ))}
      </nav>

      {/* User + Toggle */}
      <div className="p-2 border-t border-gray-800 space-y-1">
        {!collapsed && (
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-200 truncate">{user?.name}</p>
              <p className="text-xs text-gray-500 truncate capitalize">{user?.role}</p>
            </div>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Expandir' : 'Recolher'}
          className={clsx(
            'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-all',
            collapsed && 'justify-center'
          )}>
          {collapsed ? <ChevronRight size={15}/> : <><ChevronLeft size={15}/> Recolher</>}
        </button>
      </div>
    </aside>
  )
}
