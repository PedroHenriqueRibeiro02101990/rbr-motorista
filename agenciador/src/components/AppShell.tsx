import { NavLink } from 'react-router-dom'
import type { Database } from '@rbr/shared/database.types'
import { IconHome, IconQuote, IconWallet, IconUsers, IconUser, IconLogOut } from '@rbr/shared/icons'
import { initials } from '@rbr/shared/format'
import AjudaFlutuante from '@rbr/shared/AjudaFlutuante'

type Pessoa = Database['public']['Tables']['pessoas']['Row']

const NAV = [
  { to: '/', label: 'Início', Icon: IconHome, end: true },
  { to: '/cotacoes', label: 'Cotações', Icon: IconQuote, end: false },
  { to: '/financeiro', label: 'Financeiro', Icon: IconWallet, end: false },
  { to: '/clientes', label: 'Clientes', Icon: IconUsers, end: false },
  { to: '/perfil', label: 'Perfil', Icon: IconUser, end: false },
]

export default function AppShell({
  pessoa,
  onSignOut,
  children,
}: {
  pessoa: Pessoa
  onSignOut: () => void
  children: React.ReactNode
}) {
  return (
    <div className="min-h-dvh flex bg-white">
      {/* Desktop sidebar (md and up) */}
      <aside
        className="hidden md:flex md:flex-col md:w-60 md:flex-shrink-0 border-r"
        style={{ borderColor: 'var(--rbr-border)' }}
      >
        <div className="px-5 pt-6 pb-5 flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-white text-sm flex-shrink-0"
            style={{ background: 'var(--rbr-navy)' }}
          >
            RBR
          </div>
          <div>
            <div className="rbr-display font-bold text-[15px] leading-tight text-[color:var(--rbr-navy-dark)]">
              RBR Cargo
            </div>
            <div className="text-[11px] text-[color:var(--rbr-muted)]">Agenciador</div>
          </div>
        </div>

        <nav className="flex-1 px-3 flex flex-col gap-1">
          {NAV.map(({ to, label, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold"
            >
              {({ isActive }) => (
                <>
                  <span
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: isActive ? 'var(--rbr-muted-bg)' : 'transparent' }}
                  >
                    <Icon width={17} height={17} style={{ color: isActive ? 'var(--rbr-navy)' : '#9CA3AF' }} />
                  </span>
                  <span style={{ color: isActive ? 'var(--rbr-navy-dark)' : '#6B7280' }}>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 pb-5 pt-3 border-t flex flex-col gap-1" style={{ borderColor: 'var(--rbr-border)' }}>
          <div className="flex items-center gap-2.5 px-3 py-2">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{ background: 'var(--rbr-muted-bg)', color: 'var(--rbr-navy)' }}
            >
              {initials(pessoa.nome)}
            </div>
            <div className="text-[13px] font-semibold text-[color:var(--rbr-navy-dark)] truncate">
              {pessoa.nome.split(' ')[0]}
            </div>
          </div>
          <button
            onClick={onSignOut}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-[color:var(--rbr-muted)] hover:text-[color:var(--rbr-danger)]"
          >
            <IconLogOut width={17} height={17} />
            Sair
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col min-h-dvh">
        <main className="flex-1 overflow-y-auto pb-24 md:pb-10 mx-auto w-full max-w-[480px] md:max-w-none md:mx-0 md:px-10 md:py-8">
          {children}
        </main>

        {/* Mobile bottom tab bar (below md) */}
        <nav
          className="md:hidden fixed bottom-0 left-0 right-0 mx-auto w-full max-w-[480px] h-20 bg-white border-t flex items-center justify-around"
          style={{ borderColor: 'var(--rbr-border)' }}
        >
          {NAV.map(({ to, label, Icon, end }) => (
            <NavLink key={to} to={to} end={end} className="flex flex-col items-center gap-1 px-2">
              {({ isActive }) => (
                <>
                  <div
                    className="w-9 h-7 rounded-xl flex items-center justify-center"
                    style={{ background: isActive ? 'var(--rbr-muted-bg)' : 'transparent' }}
                  >
                    <Icon width={18} height={18} style={{ color: isActive ? 'var(--rbr-navy)' : '#9CA3AF' }} />
                  </div>
                  <span
                    className="text-[10px] font-semibold"
                    style={{ color: isActive ? 'var(--rbr-navy)' : '#9CA3AF' }}
                  >
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      <AjudaFlutuante app="agenciador" />
    </div>
  )
}
