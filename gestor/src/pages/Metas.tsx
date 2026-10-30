import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { Aviso, Card, Carregando, Vazio } from '../components/financeiro/ui'
import { mensagemClara } from '../lib/mensagemClara'

// F06 · Metas por função. Só o gestor vê (política da tabela). Vendas ligadas; Operação e Fiscal vêm desligadas com indicadores de exemplo:
// o gestor liga uma meta quando quiser que ela passe a valer.
type Meta = { id: string; funcao: string; indicador: string; descricao: string | null; valor_meta: number | null; ativa: boolean }
const ROTULO: Record<string, string> = { comercial: 'Comercial', operacao: 'Operação', fiscal: 'Fiscal', financeiro: 'Financeiro', vendas: 'Vendas' }

export default function Metas() {
  const [metas, setMetas] = useState<Meta[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from('metas' as never).select('id, funcao, indicador, descricao, valor_meta, ativa').order('funcao')
    setErro(error ? `Não consegui ler as metas. ${mensagemClara(error, '')}`.trim() : null)
    setMetas(error ? [] : ((data ?? []) as unknown as Meta[]))
  }, [])
  useEffect(() => {
    void carregar()
  }, [carregar])

  async function alternar(m: Meta) {
    const tabela = supabase.from as unknown as (t: string) => { update: (v: { ativa: boolean }) => { eq: (c: string, v: string) => Promise<{ error: { message: string } | null }> } }
    const { error } = await tabela.call(supabase, 'metas').update({ ativa: !m.ativa }).eq('id', m.id)
    if (error) setErro(`Não consegui mudar a meta. ${mensagemClara(error, '')}`.trim())
    await carregar()
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="rbr-display font-bold text-2xl md:text-3xl text-[color:var(--rbr-navy-dark)]">Metas</h1>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {metas === null ? (
        <Carregando />
      ) : metas.length === 0 ? (
        <Vazio>Nenhuma meta cadastrada.</Vazio>
      ) : (
        <div className="flex flex-col gap-2">
          {metas.map((m) => (
            <Card key={m.id}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase text-[color:var(--rbr-muted)]">{ROTULO[m.funcao] ?? m.funcao}</div>
                  <div className="text-sm font-bold text-[color:var(--rbr-navy-dark)]">{m.descricao ?? m.indicador}</div>
                  <div className="text-xs text-[color:var(--rbr-muted)] tabular-nums">Meta: {m.valor_meta ?? '—'}</div>
                </div>
                <button
                  type="button"
                  onClick={() => void alternar(m)}
                  aria-pressed={m.ativa}
                  className="text-xs font-bold px-3 py-1.5 rounded-full border"
                  style={m.ativa ? { background: 'var(--rbr-navy)', color: '#fff', borderColor: 'var(--rbr-navy)' } : { background: '#fff', color: 'var(--rbr-muted)', borderColor: 'var(--rbr-border)' }}
                >
                  {m.ativa ? 'Ligada' : 'Desligada'}
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
