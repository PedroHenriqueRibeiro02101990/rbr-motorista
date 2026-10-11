import { useState } from 'react'
import type { Database } from '@rbr/shared/database.types'
import { dbNovo, novos } from '@rbr/shared/dbNovo'

// Tarefa 10.6: o próprio motorista autoriza (ou retira a autorização) a consulta de antecedentes. Só o aceite e a data
// ficam registrados; a consulta em si NÃO está implementada.
type Pessoa = Database['public']['Tables']['pessoas']['Row']

export default function ConsentimentoAntecedentes({ pessoa, onMudou }: { pessoa: Pessoa; onMudou?: () => void }) {
  const n = novos(pessoa)
  const [aceito, setAceito] = useState(!!n.consentimento_consulta_antecedentes)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const [enviando, setEnviando] = useState(false)
  // Coluna ainda não existe no banco (migration não aplicada): não mostra.
  if (n.consentimento_consulta_antecedentes === undefined) return null

  async function mudar(v: boolean) {
    setEnviando(true)
    setMsg(null)
    const { error } = await dbNovo.rpc('registrar_consentimento_antecedentes', { p_aceito: v })
    setEnviando(false)
    if (error) return setMsg({ ok: false, t: '✗ ' + error.message })
    setAceito(v)
    setMsg({ ok: true, t: v ? '✓ Autorização registrada.' : '✓ Autorização retirada.' })
    onMudou?.()
  }

  return (
    <div className="bg-white border rounded-[20px] p-[18px] flex flex-col gap-2" style={{ borderColor: 'var(--rbr-border)' }}>
      <div className="text-sm font-bold text-[color:var(--rbr-navy-dark)]">Consulta de antecedentes</div>
      <label className="flex gap-3 items-start text-sm">
        <input type="checkbox" className="mt-1 w-5 h-5" checked={aceito} disabled={enviando} onChange={(e) => void mudar(e.target.checked)} />
        <span>Autorizo a RBR Cargo a consultar meus antecedentes para fins de gerenciamento de risco das cargas.</span>
      </label>
      {aceito && n.consentimento_antecedentes_em && (
        <div className="text-[11px] text-[color:var(--rbr-muted)]">Autorizado em {new Date(n.consentimento_antecedentes_em).toLocaleString('pt-BR')}.</div>
      )}
      {msg && <div className="text-xs font-semibold" style={{ color: msg.ok ? 'var(--rbr-positive)' : 'var(--rbr-danger)' }}>{msg.t}</div>}
    </div>
  )
}
