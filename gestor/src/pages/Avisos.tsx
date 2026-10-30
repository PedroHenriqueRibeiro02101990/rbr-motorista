import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@rbr/shared/supabaseClient'
import { formatDateTime } from '@rbr/shared/format'
import { Aviso, Botao, Carregando, Vazio } from '../components/financeiro/ui'
import { mensagemClara } from '../lib/mensagemClara'

// F01/F02 · Central de avisos: o que o sistema avisou a esta pessoa (hoje: operação em finalização). O sino do menu conta os não lidos.

type Item = { id: string; tipo: string; referencia_id: string | null; conteudo: string | null; status_entrega: string; criado_em: string }

const ROTULO: Record<string, string> = { finalizando: 'Finalização' }

type ChamaRpc = (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>

export default function Avisos() {
  const [itens, setItens] = useState<Item[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from('notificacoes')
      .select('id, tipo, referencia_id, conteudo, status_entrega, criado_em')
      .order('criado_em', { ascending: false })
      .limit(100)
    setErro(error ? `Não consegui ler os avisos. ${mensagemClara(error, '')}`.trim() : null)
    setItens(error ? [] : ((data ?? []) as Item[]))
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  async function marcar(id: string | null) {
    const rpc = supabase.rpc as unknown as ChamaRpc
    const { error } = await rpc.call(supabase, 'marcar_aviso_lido', id ? { p_aviso: id } : {})
    if (error) setErro(`Não consegui marcar como lido. ${mensagemClara(error, '')}`.trim())
    await carregar()
    window.dispatchEvent(new Event('avisos-atualizados'))
  }

  const naoLidos = (itens ?? []).filter((i) => i.status_entrega !== 'confirmado_lido').length
  const [aba, setAba] = useState<'pendentes' | 'resolvidas'>('pendentes')
  const lista = (itens ?? []).filter((i) => (i.status_entrega === 'confirmado_lido') === (aba === 'resolvidas'))

  return (
    <div className="flex flex-col gap-4 max-w-[920px]">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[30px] leading-tight text-[color:var(--rbr-navy-dark)]">Central de avisos</h1>
          <div className="text-[13px] mt-1" style={{ color: '#4a5275' }}>
            Tudo o que pede uma ação, com o caminho para resolver.
          </div>
        </div>
        {naoLidos > 0 && <Botao onClick={() => void marcar(null)}>Marcar todos como lidos</Botao>}
      </div>
      <div className="flex p-1 rounded-xl self-start" style={{ background: '#e9ecf4' }} role="group" aria-label="Avisos">
        {(
          [
            ['pendentes', `Pendentes · ${naoLidos}`],
            ['resolvidas', 'Resolvidas'],
          ] as const
        ).map(([v, l]) => (
          <button key={v} type="button" onClick={() => setAba(v)} aria-pressed={aba === v} className="text-[13px] font-bold px-4 py-1.5 rounded-lg" style={aba === v ? { background: '#1c2559', color: '#fff' } : { color: '#4a5275' }}>
            {l}
          </button>
        ))}
      </div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {itens === null ? (
        <Carregando />
      ) : lista.length === 0 ? (
        <Vazio>{aba === 'pendentes' ? 'Nenhum aviso pendente.' : 'Nada resolvido ainda.'}</Vazio>
      ) : (
        <div className="bg-white border rounded-2xl overflow-hidden" style={{ borderColor: 'var(--rbr-border)' }}>
          {lista.map((i, k) => {
            const lido = i.status_entrega === 'confirmado_lido'
            return (
              <div key={i.id} className="flex items-start gap-3.5 px-4 py-3.5" style={{ borderTop: k ? '1px solid #eef0f5' : undefined }}>
                <span className="text-[11px] font-extrabold uppercase tracking-wide rounded-full px-3 py-1.5 w-[104px] text-center flex-shrink-0" style={lido ? { background: '#d6ecdf', color: '#1a6b3c' } : { background: '#fbe3e1', color: '#b42318' }}>
                  {ROTULO[i.tipo] ?? i.tipo}
                </span>
                <div className="min-w-0 flex-1 flex flex-col gap-1">
                  <div className="text-[15px] font-extrabold text-[color:var(--rbr-navy-dark)]">{i.conteudo}</div>
                  <div className="text-[12px]" style={{ color: 'var(--rbr-muted)' }}>
                    {formatDateTime(i.criado_em)}
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    {i.referencia_id && (
                      <Link to={`/operacoes?op=${i.referencia_id}`} className="text-[13px] font-bold px-4 py-2 rounded-[10px] text-white" style={{ background: '#1c2559' }}>
                        Abrir operação →
                      </Link>
                    )}
                    {!lido && (
                      <button onClick={() => void marcar(i.id)} className="text-[12px] font-bold text-[color:var(--rbr-muted)] underline">
                        Marcar como lido
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
