import { useEffect, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import type { DetalheOperacao } from '../../lib/operacaoDetalhe'
import { doInput, paraInput, validarDatasPrevistas } from '../../lib/datasPrevistas'

// Datas previstas da viagem: o CIOT da efrete usa a coleta como início e a entrega como fim.
type Executar = (fn: () => Promise<void>, sucesso?: string) => Promise<void>

const inputClass = 'border rounded-lg px-3 py-2 text-sm outline-none bg-white'

export default function DatasPrevistas({ d, salvando, executar }: { d: DetalheOperacao; salvando: boolean; executar: Executar }) {
  const o = d.operacao
  const [coleta, setColeta] = useState(paraInput(o.coleta_prevista))
  const [entrega, setEntrega] = useState(paraInput(o.entrega_prevista))
  useEffect(() => {
    setColeta(paraInput(o.coleta_prevista))
    setEntrega(paraInput(o.entrega_prevista))
  }, [o.coleta_prevista, o.entrega_prevista])
  const erro = validarDatasPrevistas(coleta, entrega)
  const mudou = coleta !== paraInput(o.coleta_prevista) || entrega !== paraInput(o.entrega_prevista)

  async function salvar() {
    await executar(async () => {
      const { error } = await supabase.from('operacoes').update({ coleta_prevista: doInput(coleta), entrega_prevista: doInput(entrega) }).eq('id', o.id)
      if (error) throw error
    }, 'Datas previstas salvas.')
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">Datas previstas da viagem</div>
      <div className="flex gap-2 flex-wrap items-end">
        <label className="text-xs flex flex-col gap-1">
          Coleta
          <input type="datetime-local" value={coleta} onChange={(e) => setColeta(e.target.value)} className={inputClass} style={{ borderColor: 'var(--rbr-border)' }} />
        </label>
        <label className="text-xs flex flex-col gap-1">
          Entrega
          <input type="datetime-local" value={entrega} onChange={(e) => setEntrega(e.target.value)} className={inputClass} style={{ borderColor: 'var(--rbr-border)' }} />
        </label>
        <button type="button" disabled={salvando || !mudou || !!erro} onClick={() => void salvar()} className="text-xs font-bold px-3.5 py-2 rounded-lg disabled:opacity-50" style={{ background: 'var(--rbr-navy)', color: '#fff' }}>
          Salvar datas
        </button>
      </div>
      {erro && mudou && <div className="text-xs" style={{ color: 'var(--rbr-danger)' }}>{erro}</div>}
      {!o.coleta_prevista && !mudou && <div className="text-xs text-[color:var(--rbr-muted)]">Sem datas previstas: o CIOT vai com início daqui a 15 minutos e fim em 24 horas.</div>}
    </div>
  )
}
