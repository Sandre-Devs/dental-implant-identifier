import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { LogOut } from 'lucide-react'
const titles = { '/':'Dashboard','/images':'Radiografias','/review':'Revisão de Anotações','/datasets':'Datasets de Treino','/models':'Modelos ML','/manufacturers':'Fabricantes & Sistemas','/users':'Usuários' }
export default function Header() {
  const { logout } = useAuthStore()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const title = pathname.includes('/annotate') ? 'Anotador' : (titles[pathname] || 'DII')
  return (
    <header className="h-16 flex items-center justify-between px-6 border-b border-gray-800 bg-gray-900 flex-shrink-0">
      <h1 className="text-lg font-semibold text-gray-100">{title}</h1>
      <button onClick={() => { logout(); navigate('/login') }} className="btn-ghost text-sm gap-2">
        <LogOut size={16}/> Sair
      </button>
    </header>
  )
}
