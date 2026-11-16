import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Chips } from '../components/financeiro/ui'
import Empresas from '../components/prospeccao/Empresas'
import FilaAprovacao from '../components/prospeccao/FilaAprovacao'
import Respostas from '../components/prospeccao/Respostas'
import SaudeEnvio from '../components/prospeccao/SaudeEnvio'
import { CHAVE_UI, lerFlag } from '../lib/prospeccaoDb'

type Aba = 'empresas' | 'fila' | 'respostas' | 'saude'

// Prospeccao ativa (agente SDR). Atras da flag PROSPECCAO_UI_LIBERADA; Parte A: nada envia nem le e-mail.
export default function Prospeccao() {
  const [liberada, setLiberada] = useState<boolean | null>(null)
  const [aba, setAba] = useState<Aba>('empresas')
  useEffect(() => { void lerFlag(CHAVE_UI).then((v) => setLiberada(v === 'sim')) }, [])
  if (liberada === null) return <div className="text-sm text-[color:var(--rbr-muted)]">Carregando…</div>
  if (!liberada) return <Navigate to="/" replace />
  return (
    <div className="flex flex-col gap-4 max-w-6xl">
      <div>
        <div className="rbr-display font-bold text-2xl text-[color:var(--rbr-navy-dark)]">Prospecção</div>
        <div className="text-xs text-[color:var(--rbr-muted)]">CRM · agente de SDR da RBR Cargo</div>
      </div>
      <Chips<Aba>
        valor={aba} onChange={setAba}
        opcoes={[
          { valor: 'empresas', label: 'Empresas' }, { valor: 'fila', label: 'Fila de aprovação' },
          { valor: 'respostas', label: 'Respostas' }, { valor: 'saude', label: 'Saúde do envio' },
        ]}
      />
      {aba === 'empresas' && <Empresas />}
      {aba === 'fila' && <FilaAprovacao />}
      {aba === 'respostas' && <Respostas />}
      {aba === 'saude' && <SaudeEnvio />}
    </div>
  )
}
