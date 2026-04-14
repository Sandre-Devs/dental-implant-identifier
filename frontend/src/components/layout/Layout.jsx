import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950">

      {/* Overlay mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar: no mobile é absolute (fora do fluxo), no desktop é relative (ocupa espaço) */}
      <div className="hidden lg:flex flex-shrink-0">
        <Sidebar open={true} onClose={() => {}} />
      </div>

      {/* Drawer mobile — fixed, fora do fluxo */}
      <div className={`
        fixed inset-y-0 left-0 z-30 lg:hidden
        transition-transform duration-200
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Conteúdo principal — ocupa 100% da largura no mobile */}
      <div className="flex flex-col flex-1 overflow-hidden min-w-0 w-full">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
          <Outlet />
        </main>
      </div>

    </div>
  )
}
