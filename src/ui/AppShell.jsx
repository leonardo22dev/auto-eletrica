import { NavLink, Outlet } from 'react-router-dom'
import { House, FileText, Settings } from 'lucide-react'

const ABAS = [
  { para: '/', rotulo: 'Início', Icone: House, exata: true },
  { para: '/os', rotulo: 'Histórico', Icone: FileText },
  { para: '/configuracoes', rotulo: 'Ajustes', Icone: Settings },
]

function classeAba({ isActive }) {
  return [
    'flex flex-1 flex-col items-center gap-0.5 py-2 text-[9.5px] font-semibold',
    isActive ? 'text-red' : 'text-mute',
  ].join(' ')
}

function classeLateral({ isActive }) {
  return [
    'flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold',
    isActive ? 'bg-red text-white' : 'text-[#B5AFAB] hover:bg-white/5',
  ].join(' ')
}

export default function AppShell() {
  return (
    <div className="min-h-dvh md:flex">
      {/* Desktop: barra lateral */}
      <aside className="hidden w-52 shrink-0 bg-ink p-3 md:block">
        <div className="mb-6 flex items-center gap-2.5 px-1">
          <img
            src="/logo-mizuho.png"
            alt=""
            className="h-8 rounded-md bg-white p-px"
          />
          <div>
            <span className="block font-marca text-sm leading-tight font-bold text-white">
              Mizuho II
            </span>
            <span className="text-[8.5px] tracking-[0.13em] text-[#9A9490] uppercase">
              Ordens de Serviço
            </span>
          </div>
        </div>
        <nav className="flex flex-col gap-1">
          {ABAS.map(({ para, rotulo, Icone, exata }) => (
            <NavLink key={para} to={para} end={exata} className={classeLateral}>
              <Icone size={18} aria-hidden="true" />
              {rotulo}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-h-dvh flex-1 flex-col">
        {/* Celular: barra superior */}
        <header className="flex items-center gap-2.5 bg-ink px-4 pt-4 pb-3 md:hidden">
          <img
            src="/logo-mizuho.png"
            alt=""
            className="h-7 rounded-[5px] bg-white p-px"
          />
          <div>
            <span className="block font-marca text-[15px] leading-tight font-bold text-white">
              Mizuho II
            </span>
            <span className="text-[9.5px] tracking-[0.12em] text-[#9A9490] uppercase">
              Ordens de Serviço
            </span>
          </div>
        </header>

        <main className="flex-1 pb-20 md:pb-0">
          <Outlet />
        </main>

        {/* Celular: barra de abas no alcance do polegar */}
        <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-linha bg-paper pb-1.5 md:hidden">
          {ABAS.map(({ para, rotulo, Icone, exata }) => (
            <NavLink key={para} to={para} end={exata} className={classeAba}>
              <Icone size={20} aria-hidden="true" />
              {rotulo}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
