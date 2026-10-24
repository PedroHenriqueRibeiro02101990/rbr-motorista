import { supabase } from '@rbr/shared/supabaseClient'
import { useCallback, useEffect, useState } from 'react'
import { Card } from './financeiro/ui'

export type ModuloPainel = 'cotacoes' | 'operacoes' | 'fiscal' | 'financeiro' | 'risco' | 'cadastros'

type Item = { modulo: string; ref_id: string; ref_tipo: string; titulo: string; grupo: string | null; gravidade: 'bloqueia' | 'atencao' }

// Painel "O que fazer agora" no topo de cada módulo. Fonte: view v_pendencias_painel.
// `acao` recebe a pendência e devolve o botão/link de ação (cada módulo sabe abrir a sua tela).
export default function PainelPendencias({
  modulo,
  acao,
  recarregarKey,
}: {
  modulo: ModuloPainel
  acao?: (p: Item) => React.ReactNode
  recarregarKey?: number
}) {
  const [itens, setItens] = useState<Item[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [todas, setTodas] = useState(false)
  const [filtro, setFiltro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from('v_pendencias_painel').select('*').eq('modulo', modulo)
    if (error) {
      setErro(error.message)
      return
    }
    setErro(null)
    const lista = (data ?? []) as Item[]
    lista.sort((a, b) => (a.gravidade === b.gravidade ? 0 : a.gravidade === 'bloqueia' ? -1 : 1))
    setItens(lista)
  }, [modulo])

  useEffect(() => {
    carregar()
  }, [carregar, recarregarKey])

  if (erro) return null
  if (itens === null) return null

  // Filtro por tipo (grupo): só aparece quando há mais de um tipo pendente.
  const grupos = [...new Set(itens.map((i) => i.grupo).filter((g): g is string => !!g))]
  const doFiltro = filtro ? itens.filter((i) => i.grupo === filtro) : itens
  const visiveis = todas || filtro ? doFiltro : doFiltro.slice(0, 4)

  return (
    <Card titulo="O que fazer agora" acao={itens.length > 0 ? <span className="text-xs text-[color:var(--rbr-muted)]">{itens.length} pendente(s)</span> : undefined}>
      {itens.length === 0 ? (
        <div className="text-sm text-[color:var(--rbr-positive)] font-semibold">✓ Tudo em dia.</div>
      ) : (
        <>
        {grupos.length > 1 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {[null, ...grupos].map((g) => (
              <button
                key={g ?? 'todos'}
                type="button"
                onClick={() => setFiltro(g)}
                className="text-xs font-semibold px-2.5 py-1 rounded-full border"
                style={
                  filtro === g
                    ? { background: 'var(--rbr-navy)', color: '#fff', borderColor: 'var(--rbr-navy)' }
                    : { borderColor: 'var(--rbr-border)', color: 'var(--rbr-navy)' }
                }
              >
                {g ?? 'Todos'}
              </button>
            ))}
          </div>
        )}
        <ul className="flex flex-col divide-y" style={{ borderColor: 'var(--rbr-border)' }}>
          {visiveis.map((p) => (
            <li key={`${p.ref_tipo}-${p.ref_id}-${p.titulo}`} className="py-2 flex items-center justify-between gap-3 flex-wrap" style={{ borderColor: 'var(--rbr-border)' }}>
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="inline-block w-2 h-2 rounded-full shrink-0"
                  style={{ background: p.gravidade === 'bloqueia' ? 'var(--rbr-danger)' : '#D99A1C' }}
                  title={p.gravidade === 'bloqueia' ? 'Bloqueia' : 'Atenção'}
                />
                <span className="text-sm">{p.titulo}</span>
              </div>
              {acao?.(p)}
            </li>
          ))}
        </ul>
        {doFiltro.length > 4 && !filtro && (
          <button type="button" className="text-xs font-bold mt-2 text-[color:var(--rbr-navy)]" onClick={() => setTodas((v) => !v)}>
            {todas ? 'Mostrar menos' : `Ver todas (${doFiltro.length})`}
          </button>
        )}
        </>
      )}
    </Card>
  )
}
