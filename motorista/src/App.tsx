import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@rbr/shared/useAuth'
import AppShell from './components/AppShell'
import AuthScreen from './pages/AuthScreen'
import Inicio from './pages/Inicio'
import Cargas from './pages/Cargas'
import Caixa from './pages/Caixa'
import Pontos from './pages/Pontos'
import Perfil from './pages/Perfil'

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

  if (!auth.pessoa) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-[color:var(--rbr-navy-dark)] font-semibold">
          Sua conta está autenticada, mas ainda não tem um cadastro de motorista.
        </p>
        <p className="text-sm text-[color:var(--rbr-muted)]">
          Isso pode acontecer se o cadastro foi iniciado no site ou pelo gestor. Fale com a RBR
          para vincular seu acesso.
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

  if (!['titular_motorista', 'condutor'].includes(auth.pessoa.papel)) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-[color:var(--rbr-navy-dark)] font-semibold">
          Esta conta não é uma conta de motorista.
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
          <Route path="/" element={<Inicio pessoa={auth.pessoa} />} />
          <Route path="/cargas" element={<Cargas pessoa={auth.pessoa} />} />
          <Route path="/caixa" element={<Caixa pessoa={auth.pessoa} />} />
          <Route path="/pontos" element={<Pontos pessoa={auth.pessoa} />} />
          <Route path="/perfil" element={<Perfil pessoa={auth.pessoa} onSignOut={auth.signOut} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  )
}
