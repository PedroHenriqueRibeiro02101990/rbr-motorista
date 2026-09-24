import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@rbr/shared/useAuth'
import { TelaEntrada, TelaConcluirCadastro, TelaNovaSenha } from '@rbr/shared/AuthTelas'
import { BiometriaGate } from '@rbr/shared/biometria'
import AppShell from './components/AppShell'
import Inicio from './pages/Inicio'
import Cargas from './pages/Cargas'
import Caixa from './pages/Caixa'
import Pontos from './pages/Pontos'
import Perfil from './pages/Perfil'

export default function App() {
  const auth = useAuth()

  if (auth.loading || (auth.registrando && auth.session)) {
    return <div className="min-h-dvh flex items-center justify-center text-[color:var(--rbr-navy)]">Carregando…</div>
  }

  if (!auth.session) return <TelaEntrada app="motorista" auth={auth} />

  if (auth.recuperandoSenha) {
    return (
      <TelaNovaSenha
        auth={auth}
        dados={{ nome: auth.pessoa?.nome, documento: auth.pessoa?.cpf ?? auth.pessoa?.cnpj ?? undefined, email: auth.session.user.email }}
      />
    )
  }

  if (!auth.pessoa) return <TelaConcluirCadastro app="motorista" auth={auth} email={auth.session.user.email ?? null} />

  if (!['titular_motorista', 'condutor'].includes(auth.pessoa.papel)) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-[color:var(--rbr-navy-dark)] font-semibold">Esta conta não é uma conta de motorista.</p>
        <button className="mt-2 text-sm font-semibold text-[color:var(--rbr-navy)] underline" onClick={() => auth.signOut()}>
          Sair
        </button>
      </div>
    )
  }

  const pessoa = auth.pessoa
  return (
    <BiometriaGate userId={auth.session.user.id} onUsarSenha={auth.signOut}>
      <BrowserRouter>
        <AppShell pessoa={pessoa} onSignOut={auth.signOut}>
          <Routes>
            <Route path="/" element={<Inicio pessoa={pessoa} onRecarregar={auth.recarregar} />} />
            <Route path="/cargas" element={<Cargas pessoa={pessoa} />} />
            <Route path="/caixa" element={<Caixa pessoa={pessoa} />} />
            <Route path="/pontos" element={<Pontos pessoa={pessoa} />} />
            <Route path="/perfil" element={<Perfil pessoa={pessoa} onSignOut={auth.signOut} onRecarregar={auth.recarregar} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppShell>
      </BrowserRouter>
    </BiometriaGate>
  )
}
