import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@rbr/shared/supabaseClient'

type Item = { ref_tipo: 'operacao' | 'indicacao' | 'cotacao' | 'motorista' | 'vinculo'; ref_id: string; titulo: string; gravidade: 'bloqueia' | 'atencao'; ordem: number }

const ROTA: Record<Item['ref_tipo'], { to: string; texto: string } | null> = {
  operacao: null,
  cotacao: { to: '/cotacoes', texto: 'Abrir' },
  indicacao: null,
  motorista: null,
  vinculo: null,
}

// Painel "O que fazer agora" do agenciador. Fonte: função pendencias_agenciador()
// (só devolve o que é dele; dados de motorista vêm mínimos, por causa da LGPD).
type BaseItem = { motorista_id: string; nome: string; veiculo_id: string | null; placa: string | null; tipo_veiculo: string | null }

// Janela cinza: escolhe motorista (e veículo) da base própria e envia a indicação para a RBR confirmar.
function IndicarMotorista({ operacaoId, onFechar, onFeito }: { operacaoId: string; onFechar: () => void; onFeito: (msg: string) => void }) {
  const [base, setBase] = useState<BaseItem[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  useEffect(() => {
    void supabase.rpc('base_motoristas_agenciador').then(({ data, error }) => {
      if (error) setErro(error.message)
      else setBase((data ?? []) as BaseItem[])
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function enviar(b: BaseItem) {
    setEnviando(true); setErro(null)
    const { error } = await supabase.rpc('indicar_motorista', { p_operacao: operacaoId, p_motorista: b.motorista_id, p_veiculo: b.veiculo_id ?? undefined })
    setEnviando(false)
    if (error) { setErro(error.message); return }
    onFeito(`Indicação de ${b.nome.split(' ')[0]} enviada. A RBR confirma.`)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-3" style={{ background: 'rgba(60,60,60,0.55)' }} onClick={onFechar}>
      <div className="bg-white rounded-[20px] w-full max-w-md max-h-[80vh] overflow-auto p-4 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="font-bold text-[color:var(--rbr-navy-dark)]">Indicar motorista da sua base</div>
          <button type="button" className="text-sm font-bold text-[color:var(--rbr-muted)]" onClick={onFechar}>Fechar</button>
        </div>
        {erro && <div className="text-xs font-semibold" style={{ color: 'var(--rbr-danger)' }}>✗ {erro}</div>}
        {base === null && !erro && <div className="text-sm text-[color:var(--rbr-muted)]">Carregando…</div>}
        {base !== null && base.length === 0 && (
          <div className="text-sm text-[color:var(--rbr-muted)]">Você ainda não tem motorista confirmado na base. Peça à RBR para indicar.</div>
        )}
        {base?.map((b) => (
          <button
            key={`${b.motorista_id}-${b.veiculo_id ?? 'sem'}`}
            type="button"
            disabled={enviando}
            onClick={() => enviar(b)}
            className="text-left border rounded-[14px] p-3 disabled:opacity-50"
            style={{ borderColor: 'var(--rbr-border)' }}
          >
            <div className="text-sm font-semibold text-[color:var(--rbr-navy-dark)]">{b.nome}</div>
            <div className="text-xs text-[color:var(--rbr-muted)]">{b.placa ? `${b.placa} · ${b.tipo_veiculo ?? 'veículo'}` : 'Sem veículo cadastrado'}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

export default function PainelPendencias({ recarregarKey }: { recarregarKey?: number }) {
  const [itens, setItens] = useState<Item[] | null>(null)
  const [todas, setTodas] = useState(false)
  const [indicando, setIndicando] = useState<string | null>(null)
  const [recarga, setRecarga] = useState(0)
  const [aviso, setAviso] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('pendencias_agenciador')
    if (error) { setItens(null); return }
    const lista = ((data ?? []) as Item[]).slice().sort((a, b) => a.ordem - b.ordem)
    setItens(lista)
  }, [])

  useEffect(() => { void carregar() }, [carregar, recarregarKey, recarga])

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
                {p.ref_tipo === 'operacao' && (
                  <button type="button" className="text-xs font-bold text-[color:var(--rbr-navy)] shrink-0" onClick={() => setIndicando(p.ref_id)}>Indicar motorista</button>
                )}
                {rota && <Link to={rota.to} className="text-xs font-bold text-[color:var(--rbr-navy)] shrink-0">{rota.texto}</Link>}
              </li>
            )
          })}
        </ul>
      )}
      {aviso && <div className="text-xs font-semibold" style={{ color: 'var(--rbr-positive)' }}>✓ {aviso}</div>}
      {indicando && (
        <IndicarMotorista
          operacaoId={indicando}
          onFechar={() => setIndicando(null)}
          onFeito={(m) => { setIndicando(null); setAviso(m); setRecarga((r) => r + 1) }}
        />
      )}
      {itens.length > 4 && (
        <button type="button" className="text-xs font-bold text-left text-[color:var(--rbr-navy)]" onClick={() => setTodas((v) => !v)}>
          {todas ? 'Mostrar menos' : `Ver todas (${itens.length})`}
        </button>
      )}
    </div>
  )
}
