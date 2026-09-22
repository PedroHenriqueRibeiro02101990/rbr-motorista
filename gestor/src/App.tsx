import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@rbr/shared/useAuth'
import AppShell from './components/AppShell'
import AuthScreen from './pages/AuthScreen'
import Inicio from './pages/Inicio'
import Cotacao from './pages/Cotacao'
import Operacoes from './pages/Operacoes'
import Pessoas from './pages/Pessoas'
import Financeiro from './pages/Financeiro'
import Mapa from './pages/Mapa'
import Fiscal from './pages/Fiscal'
import Risco from './pages/Risco'
import Cadastros from './pages/Cadastros'

export default function App() {
  const auth = useAuth()

  if (auth.loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center text-[color:var(--rbr-navy)]">
        Carregando…
      </div>
    )
  }

  if (!auth.session) {
    return <AuthScreen />
  }

  if (!auth.pessoa || auth.pessoa.papel !== 'gestor_rbr') {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-[color:var(--rbr-navy-dark)] font-semibold max-w-sm">
          Esta conta não tem acesso ao painel do gestor. Peça para um gestor liberar seu acesso.
        </p>
        <button
          className="mt-2 text-sm font-semibold text-[color:var(--rbr-navy)] underline"
          onClick={() => auth.signOut()}
        >
          Sair
        </button>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <AppShell pessoa={auth.pessoa} onSignOut={auth.signOut}>
        <Routes>
          <Route path="/" element={<Inicio />} />
          <Route path="/cotacao" element={<Cotacao />} />
          <Route path="/operacoes" element={<Operacoes gestor={auth.pessoa} />} />
          <Route path="/pessoas" element={<Pessoas />} />
          <Route path="/financeiro" element={<Financeiro />} />
          <Route path="/mapa" element={<Mapa />} />
          <Route path="/fiscal" element={<Fiscal />} />
          <Route path="/risco" element={<Risco />} />
          <Route path="/cadastros" element={<Cadastros />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  )
}
