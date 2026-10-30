import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@rbr/shared/useAuth'
import AppShell from './components/AppShell'
import { TelaEntrada, TelaNovaSenha } from '@rbr/shared/AuthTelas'
import { BiometriaGate } from '@rbr/shared/biometria'
import Inicio from './pages/Inicio'
import Cotacao from './pages/Cotacao'
import FilaDoDia from './pages/FilaDoDia'
import PreCotacao from './pages/PreCotacao'
import NotasParceiros from './pages/NotasParceiros'
import Conformidade from './pages/Conformidade'
import Operacoes from './pages/Operacoes'
import Financeiro from './pages/Financeiro'
import Mapa from './pages/Mapa'
import Fiscal from './pages/Fiscal'
import Risco from './pages/Risco'
import Cadastros from './pages/Cadastros'
import DemoCiot from './pages/DemoCiot'
import SaudeFiscal from './pages/SaudeFiscal'
import Avisos from './pages/Avisos'
import Busca from './pages/Busca'
import PropostaPublica from './pages/PropostaPublica'

// Demonstração sem login, só no build de preview (VITE_DEMO_CIOT=true); em produção a rota nem é montada.
const DEMO_CIOT = import.meta.env.VITE_DEMO_CIOT === 'true'

export default function App() {
  const auth = useAuth()
  if (DEMO_CIOT && window.location.pathname === '/demo-ciot') return <DemoCiot />

  // E04: link público de aceite (/p/<código>), antes do login; o cliente não tem conta.
  const mProposta = window.location.pathname.match(/^\/p\/([0-9a-z]{1,64})\/?$/)
  if (mProposta) return <PropostaPublica codigo={mProposta[1]} />

  if (auth.loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center text-[color:var(--rbr-navy)]">
        Carregando…
      </div>
    )
  }

  if (!auth.session) return <TelaEntrada app="gestor" auth={auth} />

  if (auth.recuperandoSenha) {
    return <TelaNovaSenha auth={auth} dados={{ nome: auth.pessoa?.nome, documento: auth.pessoa?.cpf ?? undefined, email: auth.session.user.email }} />
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
    <BiometriaGate userId={auth.session.user.id} onUsarSenha={auth.signOut}>
    <BrowserRouter>
      <AppShell pessoa={auth.pessoa} onSignOut={auth.signOut}>
        <Routes>
          <Route path="/" element={<Inicio />} />
          <Route path="/cotacao" element={<Cotacao />} />
          <Route path="/fila-do-dia" element={<FilaDoDia />} />
          <Route path="/pre-cotacao" element={<PreCotacao />} />
          <Route path="/notas-parceiros" element={<NotasParceiros />} />
          <Route path="/conformidade" element={<Conformidade />} />
          <Route path="/operacoes" element={<Operacoes gestor={auth.pessoa} />} />
          <Route path="/pessoas" element={<Navigate to="/cadastros?aba=motoristas" replace />} />
          <Route path="/financeiro" element={<Financeiro />} />
          <Route path="/mapa" element={<Mapa />} />
          <Route path="/fiscal" element={<Fiscal />} />
          <Route path="/saude-fiscal" element={<SaudeFiscal />} />
          <Route path="/avisos" element={<Avisos />} />
          <Route path="/busca" element={<Busca />} />
          <Route path="/risco" element={<Risco />} />
          <Route path="/cadastros" element={<Cadastros />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
    </BiometriaGate>
  )
}
