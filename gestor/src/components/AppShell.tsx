import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import type { Database } from '@rbr/shared/database.types'
import { IconHome, IconBox, IconWallet, IconMapPin, IconLogOut, IconQuote } from '@rbr/shared/icons'
import { initials } from '@rbr/shared/format'
import { IconMenu, IconX, IconFileText, IconAlertTriangle, IconClipboard } from '../icons-local'
import AjudaFlutuante from '@rbr/shared/AjudaFlutuante'
import { BiometriaToggle } from '@rbr/shared/biometria'

type Pessoa = Database['public']['Tables']['pessoas']['Row']

const NAV = [
  { to: '/', label: 'Início', Icon: IconHome, end: true },
  { to: '/cotacao', label: 'Cotação', Icon: IconQuote, end: false },
  { to: '/operacoes', label: 'Operações', Icon: IconBox, end: false },
  { to: '/financeiro', label: 'Financeiro', Icon: IconWallet, end: false },
  { to: '/mapa', label: 'Mapa', Icon: IconMapPin, end: false },
  { to: '/fiscal', label: 'Fiscal', Icon: IconFileText, end: false },
  { to: '/risco', label: 'Risco', Icon: IconAlertTriangle, end: false },
  { to: '/cadastros', label: 'Cadastros', Icon: IconClipboard, end: false },
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
  const [menuAberto, setMenuAberto] = useState(false)

  return (
    <div className="min-h-dvh flex flex-col md:flex-row bg-white">
      {/* Top bar — visível apenas abaixo de md, já que o painel é desktop-first */}
      <div
        className="md:hidden flex items-center justify-between px-4 py-3 border-b sticky top-0 bg-white z-20"
        style={{ borderColor: 'var(--rbr-border)' }}
      >
        <div className="flex items-center gap-2.5">
          <img src="/logo-192.png" alt="RBR Cargo" className="w-8 h-8 rounded-lg flex-shrink-0" />
          <div className="rbr-display font-bold text-sm text-[color:var(--rbr-navy-dark)]">Painel Gestor</div>
        </div>
        <button
          onClick={() => setMenuAberto((v) => !v)}
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ background: 'var(--rbr-muted-bg)', color: 'var(--rbr-navy)' }}
          aria-label="Abrir menu"
        >
          {menuAberto ? <IconX width={18} height={18} /> : <IconMenu width={18} height={18} />}
        </button>
      </div>

      {menuAberto && (
        <nav
          className="md:hidden flex flex-col gap-1 px-3 py-3 border-b"
          style={{ borderColor: 'var(--rbr-border)' }}
        >
          {NAV.map(({ to, label, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setMenuAberto(false)}
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
          <button
            onClick={onSignOut}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-[color:var(--rbr-muted)]"
          >
            <IconLogOut width={17} height={17} />
            Sair
          </button>
        </nav>
      )}

      {/* Sidebar persistente — md e acima */}
      <aside
        className="hidden md:flex md:flex-col md:w-64 md:flex-shrink-0 md:h-dvh md:sticky md:top-0 border-r"
        style={{ borderColor: 'var(--rbr-border)' }}
      >
        <div className="px-5 pt-6 pb-5 flex items-center gap-2.5">
          <img src="/logo-192.png" alt="RBR Cargo" className="w-9 h-9 rounded-xl flex-shrink-0" />
          <div>
            <div className="rbr-display font-bold text-[15px] leading-tight text-[color:var(--rbr-navy-dark)]">
              RBR Cargo
            </div>
            <div className="text-[11px] text-[color:var(--rbr-muted)]">Painel do gestor</div>
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
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-[color:var(--rbr-navy-dark)] truncate">
                {pessoa.nome.split(' ')[0]}
              </div>
              <div className="text-[11px] text-[color:var(--rbr-muted)] truncate">Gestor RBR</div>
            </div>
          </div>
          <div className="px-3 py-1.5">
            <BiometriaToggle userId={pessoa.auth_user_id ?? pessoa.id} nome={pessoa.nome} email={pessoa.email} />
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

      {/* Coluna principal — largura total no desktop (não é um app limitado à largura de celular) */}
      <div className="flex-1 flex flex-col min-h-dvh min-w-0">
        <main className="flex-1 w-full px-4 py-5 md:px-10 md:py-8">{children}</main>
      </div>

      <AjudaFlutuante app="gestor" />
    </div>
  )
}
