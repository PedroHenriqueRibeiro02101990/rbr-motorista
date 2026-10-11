import { supabase } from '@rbr/shared/supabaseClient'
import { useEffect, useState } from 'react'

type Item = { doc: string; item: string; ok: boolean; motivo: string }

// Pré-voo: o que ainda falta na operação antes de emitir (função checar_pre_voo do banco).
// Mostra só o que interessa ao documento em emissão + itens gerais; ✓ quando tudo certo.
export default function PreVoo({ operacaoId, tipo }: { operacaoId: string; tipo: 'cte' | 'mdfe' | 'nfse' }) {
  const [itens, setItens] = useState<Item[] | null>(null)
  const [erro, setErro] = useState(false)

  useEffect(() => {
    let vivo = true
    supabase.rpc('checar_pre_voo', { p_operacao: operacaoId }).then(({ data, error }) => {
      if (!vivo) return
      if (error || !data) return setErro(true)
      setItens((data as { itens?: Item[] }).itens ?? [])
    })
    return () => {
      vivo = false
    }
  }, [operacaoId])

  if (erro || !itens) return null
  const doc = tipo === 'cte' ? 'CT-e' : tipo === 'mdfe' ? 'MDF-e' : null
  const relevantes = itens.filter((i) => i.doc === 'Geral' || (doc && i.doc === doc) || (tipo === 'mdfe' && i.doc === 'Risco'))
  const faltam = relevantes.filter((i) => !i.ok)

  return (
    <div className="rounded-lg px-3 py-2 text-xs" style={{ background: faltam.length ? '#FDF1DC' : '#E7F5EC', color: faltam.length ? '#8A5A00' : 'var(--rbr-positive)' }}>
      <div className="font-bold mb-1">{faltam.length ? `Pré-voo: ${faltam.length} pendência(s) antes de emitir` : '✓ Pré-voo completo: nada pendente'}</div>
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
