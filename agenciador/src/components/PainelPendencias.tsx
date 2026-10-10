import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@rbr/shared/supabaseClient'

type Item = { ref_tipo: 'operacao' | 'cotacao' | 'motorista' | 'vinculo'; ref_id: string; titulo: string; gravidade: 'bloqueia' | 'atencao'; ordem: number }

const ROTA: Record<Item['ref_tipo'], { to: string; texto: string } | null> = {
  operacao: { to: '/cotacoes', texto: 'Ver carga' },
  cotacao: { to: '/cotacoes', texto: 'Abrir' },
  motorista: null,
  vinculo: null,
}

// Painel "O que fazer agora" do agenciador. Fonte: função pendencias_agenciador()
// (só devolve o que é dele; dados de motorista vêm mínimos, por causa da LGPD).
export default function PainelPendencias({ recarregarKey }: { recarregarKey?: number }) {
  const [itens, setItens] = useState<Item[] | null>(null)
  const [todas, setTodas] = useState(false)

  const carregar = useCallback(async () => {
    const cliente = supabase as unknown as { rpc: (n: string) => Promise<{ data: unknown; error: { message: string } | null }> }
    const { data, error } = await cliente.rpc('pendencias_agenciador')
    if (error) { setItens(null); return }
    const lista = ((data ?? []) as Item[]).slice().sort((a, b) => a.ordem - b.ordem)
    setItens(lista)
  }, [])

  useEffect(() => { void carregar() }, [carregar, recarregarKey])

  if (itens === null) return null
  const visiveis = todas ? itens : itens.slice(0, 4)

  return (
    <div
      className="bg-white border rounded-[16px] p-3.5 flex flex-col gap-2"
      style={{ borderColor: 'var(--rbr-border)', boxShadow: '0 1px 2px rgba(18,23,61,0.03), 0 6px 18px rgba(18,23,61,0.05)' }}
    >
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">O que fazer agora</div>
        {itens.length > 0 && <div className="text-xs text-[color:var(--rbr-muted)]">{itens.length} pendente(s)</div>}
      </div>
      {itens.length === 0 ? (
        <div className="text-sm font-semibold" style={{ color: 'var(--rbr-positive)' }}>✓ Tudo em dia. Nenhuma pendência.</div>
      ) : (
        <ul className="flex flex-col">
          {visiveis.map((p) => {
            const rota = ROTA[p.ref_tipo]
            return (
              <li key={`${p.ref_tipo}-${p.ref_id}-${p.titulo}`} className="py-2 flex items-center justify-between gap-3 border-t first:border-t-0" style={{ borderColor: 'var(--rbr-border)' }}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: p.gravidade === 'bloqueia' ? 'var(--rbr-danger)' : '#D99A1C' }} />
                  <span className="text-sm text-[color:var(--rbr-navy-dark)]">{p.titulo}</span>
                </div>
                {rota && <Link to={rota.to} className="text-xs font-bold text-[color:var(--rbr-navy)] shrink-0">{rota.texto}</Link>}
              </li>
            )
          })}
        </ul>
      )}
      {itens.length > 4 && (
        <button type="button" className="text-xs font-bold text-left text-[color:var(--rbr-navy)]" onClick={() => setTodas((v) => !v)}>
          {todas ? 'Mostrar menos' : `Ver todas (${itens.length})`}
        </button>
      )}
    </div>
  )
}
