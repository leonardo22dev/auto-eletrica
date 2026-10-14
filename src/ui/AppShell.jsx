import { NavLink, Outlet } from 'react-router-dom'
import { House, FileText, Settings, Users, LogOut } from 'lucide-react'
import { useAuth } from '../auth/contexto.js'
import { abasDoMenu, rotuloPapel } from '../auth/perfil.js'

const ICONES = {
  inicio: House,
  historico: FileText,
  usuarios: Users,
  ajustes: Settings,
}

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
  const { perfil, sair } = useAuth()
  const abas = abasDoMenu(perfil)

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
          {abas.map(({ id, para, rotulo, exata }) => {
            const Icone = ICONES[id]
            return (
              <NavLink key={para} to={para} end={exata} className={classeLateral}>
                <Icone size={18} aria-hidden="true" />
                {rotulo}
              </NavLink>
            )
          })}
        </nav>

        <div className="mt-6 border-t border-white/10 px-1 pt-3">
          <p className="truncate text-sm font-bold text-white">{perfil?.nome}</p>
          <p className="text-[10px] tracking-[0.1em] text-[#9A9490] uppercase">
            {rotuloPapel(perfil?.papel)}
          </p>
          <button
            type="button"
            onClick={sair}
            className="mt-2 flex items-center gap-2 text-sm font-semibold text-[#B5AFAB]"
          >
            <LogOut size={16} aria-hidden="true" />
            Sair
          </button>
        </div>
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
          <div className="ml-auto flex items-center gap-2">
            <div className="text-right leading-tight">
              <span className="block max-w-28 truncate text-[12px] font-bold text-white">
                {perfil?.nome}
              </span>
              <span className="text-[9.5px] tracking-[0.1em] text-[#9A9490] uppercase">
                {rotuloPapel(perfil?.papel)}
              </span>
            </div>
            <button
              type="button"
              onClick={sair}
              aria-label="Sair"
              className="grid h-11 w-11 place-items-center rounded-lg text-[#B5AFAB]"
            >
              <LogOut size={18} aria-hidden="true" />
            </button>
          </div>
        </header>

        <main className="flex-1 pb-20 md:pb-0">
          <Outlet />
        </main>

        {/* Celular: barra de abas no alcance do polegar */}
        <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-linha bg-paper pb-1.5 md:hidden">
          {abas.map(({ id, para, rotulo, exata }) => {
            const Icone = ICONES[id]
            return (
              <NavLink key={para} to={para} end={exata} className={classeAba}>
                <Icone size={20} aria-hidden="true" />
                {rotulo}
              </NavLink>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
