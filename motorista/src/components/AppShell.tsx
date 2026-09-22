import { NavLink } from 'react-router-dom'
import type { Database } from '@rbr/shared/database.types'
import { IconHome, IconBox, IconWallet, IconStar, IconUser } from '@rbr/shared/icons'
import AjudaFlutuante from '@rbr/shared/AjudaFlutuante'

type Pessoa = Database['public']['Tables']['pessoas']['Row']

const TABS = [
  { to: '/', label: 'Início', Icon: IconHome, end: true },
  { to: '/cargas', label: 'Cargas', Icon: IconBox, end: false },
  { to: '/caixa', label: 'Caixa', Icon: IconWallet, end: false },
  { to: '/pontos', label: 'Pontos', Icon: IconStar, end: false },
  { to: '/perfil', label: 'Perfil', Icon: IconUser, end: false },
]

export default function AppShell({
  children,
}: {
  pessoa: Pessoa
  onSignOut: () => void
  children: React.ReactNode
}) {
  return (
    <div className="min-h-dvh flex flex-col bg-white">
      <div className="mx-auto w-full max-w-[480px] flex-1 flex flex-col min-h-dvh">
        <main className="flex-1 overflow-y-auto pb-24">{children}</main>

        <nav className="fixed bottom-0 left-0 right-0 mx-auto w-full max-w-[480px] h-20 bg-white border-t border-[color:var(--rbr-border)] flex items-center justify-around">
          {TABS.map(({ to, label, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className="flex flex-col items-center gap-1 px-2"
            >
              {({ isActive }) => (
                <>
                  <div
                    className="w-9 h-7 rounded-xl flex items-center justify-center"
                    style={{ background: isActive ? 'var(--rbr-muted-bg)' : 'transparent' }}
                  >
                    <Icon
                      width={18}
                      height={18}
                      style={{ color: isActive ? 'var(--rbr-navy)' : '#9CA3AF' }}
                    />
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

      <AjudaFlutuante app="motorista" />
    </div>
  )
}
