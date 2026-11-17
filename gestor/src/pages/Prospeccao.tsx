import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Chips } from '../components/financeiro/ui'
import Empresas from '../components/prospeccao/Empresas'
import FilaAprovacao from '../components/prospeccao/FilaAprovacao'
import Respostas from '../components/prospeccao/Respostas'
import SaudeEnvio from '../components/prospeccao/SaudeEnvio'
import Modelos from '../components/prospeccao/Modelos'
import LogAgente from '../components/prospeccao/LogAgente'
import CaixaEntrada from '../components/prospeccao/CaixaEntrada'
import { CHAVE_ENVIO, CHAVE_UI, db, lerFlag } from '../lib/prospeccaoDb'

type Aba = 'empresas' | 'caixa' | 'fila' | 'respostas' | 'jornada' | 'saude' | 'log'

// Prospeccao ativa (agente SDR). Atras da flag PROSPECCAO_UI_LIBERADA. Faixa vermelha quando o envio foi parado automaticamente.
export default function Prospeccao() {
  const [liberada, setLiberada] = useState<boolean | null>(null)
  const [parada, setParada] = useState<string | null>(null)
  const [aba, setAba] = useState<Aba>('empresas')
  useEffect(() => {
    void lerFlag(CHAVE_UI).then((v) => setLiberada(v === 'sim'))
    void Promise.all([lerFlag(CHAVE_ENVIO), db.from('prospeccao_estado').select('parada_motivo').eq('id', 1).maybeSingle()]).then(([envio, e]) => {
      const motivo = (e.data as { parada_motivo: string | null } | null)?.parada_motivo ?? null
      setParada(envio !== 'sim' && motivo ? motivo : null)
    })
  }, [])
  if (liberada === null) return <div className="text-sm text-[color:var(--rbr-muted)]">Carregando…</div>
  if (!liberada) return <Navigate to="/" replace />
  return (
    <div className="flex flex-col gap-4 max-w-[1500px]">
      {parada && (
        <div className="rounded-xl px-4 py-3 text-sm font-extrabold text-white" style={{ background: '#c0392b' }}>
          ENVIO PARADO AUTOMATICAMENTE: {parada}. Veja em Saúde do envio.
        </div>
      )}
      <div>
        <div className="rbr-display font-bold text-2xl text-[color:var(--rbr-navy-dark)]">Prospecção</div>
        <div className="text-xs text-[color:var(--rbr-muted)]">CRM · agente de SDR da RBR Cargo</div>
      </div>
      <Chips<Aba>
        valor={aba} onChange={setAba}
        opcoes={[
          { valor: 'empresas', label: 'Empresas' }, { valor: 'caixa', label: 'Caixa de entrada' }, { valor: 'fila', label: 'Fila de aprovação' }, { valor: 'respostas', label: 'Respostas' },
          { valor: 'jornada', label: 'Jornada e textos' }, { valor: 'saude', label: 'Saúde do envio' }, { valor: 'log', label: 'Log do agente' },
        ]}
      />
      {aba === 'empresas' && <Empresas />}
      {aba === 'caixa' && <CaixaEntrada />}
      {aba === 'fila' && <FilaAprovacao />}
      {aba === 'respostas' && <Respostas />}
      {aba === 'jornada' && <Modelos />}
      {aba === 'saude' && <SaudeEnvio />}
      {aba === 'log' && <LogAgente />}
    </div>
  )
}
