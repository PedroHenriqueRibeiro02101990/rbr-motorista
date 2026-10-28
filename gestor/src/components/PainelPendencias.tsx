import { supabase } from '@rbr/shared/supabaseClient'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from './financeiro/ui'

export type ModuloPainel = 'cotacoes' | 'operacoes' | 'fiscal' | 'financeiro' | 'risco' | 'cadastros'

type Item = { modulo: string; ref_id: string; ref_tipo: string; titulo: string; grupo: string | null; gravidade: 'bloqueia' | 'atencao' }
type Contato = { nome: string; whatsapp: string }

// Tela que abre cada tipo de pendência (cada módulo lê o próprio parâmetro na URL).
function destinoDaPendencia(p: Item): string | null {
  switch (p.ref_tipo) {
    case 'operacao':
      return `/operacoes?op=${p.ref_id}`
    case 'cotacao':
      return `/cotacao?cotacao=${p.ref_id}`
    case 'fatura':
      return '/financeiro?aba=faturas'
    case 'pessoa':
    case 'veiculo':
      return '/cadastros?aba=pendencias'
    case 'indicacao':
      return '/operacoes'
    default:
      return null
  }
}

// Painel "O que fazer agora" no topo de cada módulo. Fonte: view v_pendencias_painel.
// `acao` recebe a pendência e devolve o botão/link próprio do módulo; sem ele, vale o "Abrir" padrão.
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
  const [contatos, setContatos] = useState<Record<string, Contato>>({})

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

    // "Com quem falar": só os motoristas pendentes têm telefone conhecido na própria pendência.
    const idsPessoa = lista.filter((i) => i.ref_tipo === 'pessoa').map((i) => i.ref_id)
    if (idsPessoa.length > 0) {
      const { data: pessoas } = await supabase.from('pessoas').select('id, nome, celular').in('id', idsPessoa)
      const mapa: Record<string, Contato> = {}
      for (const pe of pessoas ?? []) {
        const digitos = (pe.celular ?? '').replace(/\D/g, '')
        if (digitos) mapa[pe.id] = { nome: pe.nome, whatsapp: digitos.startsWith('55') ? digitos : `55${digitos}` }
      }
      setContatos(mapa)
    }
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
          {visiveis.map((p) => {
            const destino = destinoDaPendencia(p)
            return (
            <li key={`${p.ref_tipo}-${p.ref_id}-${p.titulo}`} className="py-2 flex items-center justify-between gap-3 flex-wrap" style={{ borderColor: 'var(--rbr-border)' }}>
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="inline-block w-2 h-2 rounded-full shrink-0"
                  style={{ background: p.gravidade === 'bloqueia' ? 'var(--rbr-danger)' : '#D99A1C' }}
                  title={p.gravidade === 'bloqueia' ? 'Bloqueia' : 'Atenção'}
                />
                <span className="text-sm">{p.titulo}</span>
              </div>
              <span className="flex items-center gap-3 shrink-0">
                {contatos[p.ref_id] && p.ref_tipo === 'pessoa' && (
                  <a
                    href={`https://wa.me/${contatos[p.ref_id].whatsapp}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-bold text-[color:var(--rbr-positive)]"
                  >
                    WhatsApp · {contatos[p.ref_id].nome}
                  </a>
                )}
                {acao?.(p) ??
                  (destino && (
                    <Link to={destino} className="text-xs font-bold text-[color:var(--rbr-navy)]">
                      Abrir
                    </Link>
                  ))}
              </span>
            </li>
            )
          })}
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
