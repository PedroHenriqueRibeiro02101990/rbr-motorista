import { supabase } from '@rbr/shared/supabaseClient'
import { useEffect, useState } from 'react'
import { resumoNfes } from './NfesCliente'
import { situacaoApolice, type SituacaoApolice } from '@rbr/shared/regrasOperacao'

type Item = { doc: string; item: string; ok: boolean; motivo: string }

// Pré-voo: o que ainda falta na operação antes de emitir (função checar_pre_voo do banco).
// Mostra só o que interessa ao documento em emissão + itens gerais; ✓ quando tudo certo.
export default function PreVoo({ operacaoId, tipo }: { operacaoId: string; tipo: 'cte' | 'mdfe' | 'nfse' }) {
  const [itens, setItens] = useState<Item[] | null>(null)
  const [erro, setErro] = useState(false)
  const [nfes, setNfes] = useState<{ quantidade: number; valor_total: number } | null>(null)
  // C08: limite da apólice RCTR-C lido do cadastro (nunca fixo no código).
  const [teto, setTeto] = useState<number | null>(null)

  useEffect(() => {
    let vivo = true
    supabase.rpc('checar_pre_voo', { p_operacao: operacaoId }).then(({ data, error }) => {
      if (!vivo) return
      if (error || !data) return setErro(true)
      setItens((data as { itens?: Item[] }).itens ?? [])
      setNfes((data as { nfes_cliente?: { quantidade: number; valor_total: number } }).nfes_cliente ?? null)
    })
    return () => {
      vivo = false
    }
  }, [operacaoId])

  useEffect(() => {
    const hoje = new Date().toISOString().slice(0, 10)
    supabase
      .from('apolices_seguro')
      .select('teto_cobertura_por_embarque')
      .eq('tipo', 'RCTR-C')
      .lte('vigencia_inicio', hoje)
      .gte('vigencia_fim', hoje)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setTeto(data?.teto_cobertura_por_embarque != null ? Number(data.teto_cobertura_por_embarque) : null))
  }, [])

  if (erro || !itens) return null
  const apolice: SituacaoApolice | null = nfes && teto ? situacaoApolice(Number(nfes.valor_total), 0, teto) : null
  const doc = tipo === 'cte' ? 'CT-e' : tipo === 'mdfe' ? 'MDF-e' : null
  const relevantes = itens.filter((i) => i.doc === 'Geral' || (doc && i.doc === doc) || (tipo === 'mdfe' && i.doc === 'Risco'))
  const faltam = relevantes.filter((i) => !i.ok)

  return (
    <div className="rounded-lg px-3 py-2 text-xs" style={{ background: faltam.length ? '#FDF1DC' : '#E7F5EC', color: faltam.length ? '#8A5A00' : 'var(--rbr-positive)' }}>
      <div className="font-bold mb-1">{faltam.length ? `Pré-voo: ${faltam.length} pendência(s) antes de emitir` : '✓ Pré-voo completo: nada pendente'}</div>
      {nfes && tipo !== 'nfse' && <div className="mb-1 tabular-nums">{resumoNfes(Number(nfes.quantidade), Number(nfes.valor_total))}</div>}
      {apolice && apolice.nivel !== 'ok' && tipo !== 'nfse' && (
        <div className="mb-1 font-bold" style={{ color: apolice.nivel === 'travado' ? 'var(--rbr-danger)' : '#8A5A00' }}>
          Apólice: {apolice.percentual.toFixed(0)}% do limite. {apolice.motivo}
        </div>
      )}
      {faltam.length > 0 && (
        <ul className="list-disc pl-4">
          {faltam.map((i) => (
            <li key={i.doc + i.item}>
              {i.doc}: {i.motivo}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
