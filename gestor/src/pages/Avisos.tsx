import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@rbr/shared/supabaseClient'
import { formatDateTime } from '@rbr/shared/format'
import { Aviso, Botao, Card, Carregando, Vazio } from '../components/financeiro/ui'
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="rbr-display font-bold text-2xl md:text-3xl text-[color:var(--rbr-navy-dark)]">Avisos</h1>
        {naoLidos > 0 && <Botao onClick={() => void marcar(null)}>Marcar todos como lidos</Botao>}
      </div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {itens === null ? (
        <Carregando />
      ) : itens.length === 0 ? (
        <Vazio>Nenhum aviso por enquanto.</Vazio>
      ) : (
        <div className="flex flex-col gap-2">
          {itens.map((i) => {
            const lido = i.status_entrega === 'confirmado_lido'
            return (
              <Card key={i.id}>
                <div className="flex items-start justify-between gap-3 flex-wrap" style={{ opacity: lido ? 0.65 : 1 }}>
                  <div className="min-w-0 flex flex-col gap-1">
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full self-start" style={{ background: 'var(--rbr-muted-bg)', color: 'var(--rbr-navy)' }}>
                      {ROTULO[i.tipo] ?? i.tipo}
                    </span>
                    <div className="text-sm text-[color:var(--rbr-navy-dark)]">{i.conteudo}</div>
                    <div className="text-xs text-[color:var(--rbr-muted)]">{formatDateTime(i.criado_em)}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    {i.referencia_id && (
                      <Link to={`/operacoes?op=${i.referencia_id}`} className="text-xs font-bold text-[color:var(--rbr-navy)] underline">
                        Abrir operação
                      </Link>
                    )}
                    {!lido && (
                      <button onClick={() => void marcar(i.id)} className="text-xs font-bold text-[color:var(--rbr-muted)] underline">
                        Marcar como lido
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
