import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { LogOut, Menu } from 'lucide-react'

const titles = {
  '/':'Dashboard', '/images':'Radiografias', '/review':'Revisão',
  '/datasets':'Datasets', '/models':'Modelos ML',
  '/manufacturers':'Fabricantes', '/users':'Usuários'
}

export default function Header({ onMenuClick }) {
  const { logout } = useAuthStore()
  const navigate   = useNavigate()
  const { pathname } = useLocation()
  const title = pathname.includes('/annotate') ? 'Anotador' : (titles[pathname] || 'DII')

  return (
    <header className="h-14 flex items-center justify-between px-4 border-b border-gray-800 bg-gray-900 flex-shrink-0">
      <div className="flex items-center gap-3">
        {/* hamburger — só no mobile */}
        <button
          className="btn-ghost p-2 lg:hidden"
          onClick={onMenuClick}
          aria-label="Abrir menu"
        >
          <Menu size={20} />
        </button>
        <h1 className="text-base font-semibold text-gray-100">{title}</h1>
      </div>
      <button
        onClick={() => { logout(); navigate('/login') }}
        className="btn-ghost text-sm gap-1.5"
      >
        <LogOut size={15}/> <span className="hidden sm:inline">Sair</span>
      </button>
    </header>
  )
}
