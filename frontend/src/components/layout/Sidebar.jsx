import { NavLink } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { LayoutDashboard, Images, CheckSquare, Database, BrainCircuit, Building2, Users, Microscope } from 'lucide-react'
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
  const filtered = nav.filter(n => n.roles.includes(user?.role))
  return (
    <aside className="w-60 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
      <div className="h-16 flex items-center gap-3 px-5 border-b border-gray-800">
        <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center">
          <Microscope size={18} className="text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white leading-none">DII</p>
          <p className="text-xs text-gray-500 leading-none mt-0.5">Implant Identifier</p>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {filtered.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'}
            className={({ isActive }) => clsx(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
              isActive ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                       : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
            )}>
            <Icon size={17} />{label}
          </NavLink>
        ))}
      </nav>
      <div className="p-3 border-t border-gray-800">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-200 truncate">{user?.name}</p>
            <p className="text-xs text-gray-500 truncate capitalize">{user?.role}</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
