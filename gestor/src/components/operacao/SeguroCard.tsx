import { useEffect, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { formatMoney } from '@rbr/shared/format'
import type { Apolice } from '../../lib/operacaoDetalhe'

// Painel "Seguro": apólice da operação e o aviso de teto por embarque (a mesma conta do pré-voo do banco, item 'seguro').
export default function SeguroCard({ operacaoId, apolice }: { operacaoId: string; apolice: Apolice | null }) {
  const [excede, setExcede] = useState<boolean>(false)

  useEffect(() => {
    let vivo = true
    supabase.rpc('checar_pre_voo', { p_operacao: operacaoId }).then(({ data, error }) => {
      if (!vivo || error || !data) return
      const itens = (data as { itens?: { item: string; ok: boolean }[] }).itens ?? []
      setExcede(itens.some((i) => i.item === 'seguro' && !i.ok))
    })
    return () => {
      vivo = false
    }
  }, [operacaoId])

  return (
    <div className="rounded-xl border p-3 flex flex-col gap-2" style={{ borderColor: 'var(--rbr-border)' }}>
      <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">Seguro</div>
      {!apolice ? (
        <div className="text-xs text-[color:var(--rbr-muted)]">Sem apólice cadastrada para esta operação.</div>
      ) : (
        <>
          <div className="text-sm font-semibold text-[color:var(--rbr-navy-dark)]">{apolice.seguradora_nome ?? 'Seguradora não informada'}</div>
          <div className="text-xs text-[color:var(--rbr-muted)]">
            Apólice {apolice.numero_apolice ?? '—'} · teto por embarque {formatMoney(apolice.teto_cobertura_por_embarque)}
          </div>
          {excede && (
            <div className="text-xs font-semibold rounded-lg px-2.5 py-1.5" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
              Valor da carga acima do teto da apólice.
            </div>
          )}
        </>
      )}
    </div>
  )
}
