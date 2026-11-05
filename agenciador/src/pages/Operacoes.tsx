import { useEffect, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import type { Database } from '@rbr/shared/database.types'
import { Aviso, Cartao, Esqueleto, Selo, Titulo, Vazio } from '../components/ui'
import { etapaDaOperacao, ETAPAS_OPERACAO } from '../lib/etapas'

type Pessoa = Database['public']['Tables']['pessoas']['Row']
interface Linha { id: string; sequencia: number | null; status: string; cliente: string; rota: string; cotacao: string | null }

// Somente leitura: o agenciador acompanha, quem opera e a RBR. Sem motorista, sem valores internos.
export default function Operacoes({ pessoa }: { pessoa: Pessoa }) {
  const [linhas, setLinhas] = useState<Linha[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [sel, setSel] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    supabase
      .from('operacoes')
      .select('id, sequencia, status, cotacao_id, clientes(razao_social, nome_fantasia)')
      .eq('agenciador_id', pessoa.id)
      .order('updated_at', { ascending: false })
      .then(async ({ data, error }) => {
        if (!vivo) return
        if (error) return setErro('Não foi possível carregar as operações agora.')
        const ids = (data ?? []).map((o) => o.cotacao_id).filter(Boolean) as string[]
        const rotas = new Map<string, string>()
        if (ids.length) {
          const { data: cs } = await supabase.from('agenciador_cotacoes_v' as never).select('id, cidade_origem, uf_origem, cidade_destino, uf_destino').in('id', ids)
          for (const c of (cs ?? []) as unknown as Record<string, string>[]) rotas.set(c.id, `${c.cidade_origem ?? '—'}/${c.uf_origem ?? ''} → ${c.cidade_destino ?? '—'}/${c.uf_destino ?? ''}`)
        }
        if (!vivo) return
        setLinhas(
          (data ?? []).map((o) => {
            const cli = (o as unknown as { clientes?: { razao_social: string; nome_fantasia: string | null } }).clientes
            return { id: o.id, sequencia: o.sequencia, status: o.status, cliente: cli?.nome_fantasia ?? cli?.razao_social ?? '—', rota: rotas.get(o.cotacao_id ?? '') ?? '—', cotacao: o.cotacao_id }
          }),
        )
      })
    return () => { vivo = false }
  }, [pessoa.id])

  const atual = linhas?.find((l) => l.id === sel)
  if (atual) {
    const idx = etapaDaOperacao(atual.status)
    return (
      <div className="px-5 pt-8 md:px-0 md:pt-0 flex flex-col gap-4">
        <button onClick={() => setSel(null)} className="text-sm font-semibold text-[color:var(--rbr-navy)] self-start">← Voltar às operações</button>
        <Titulo sub={atual.rota}>{atual.cliente}</Titulo>
        <Cartao>
          <ol className="flex flex-col gap-3">
            {ETAPAS_OPERACAO.map((e, i) => (
              <li key={e} className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: i <= idx ? 'var(--rbr-positive)' : 'var(--rbr-muted-bg)', color: i <= idx ? '#fff' : 'var(--rbr-muted)' }}>{i <= idx ? '✔' : i + 1}</span>
                <span className="text-sm" style={{ fontWeight: i === idx ? 800 : 500, color: i <= idx ? 'var(--rbr-navy-dark)' : 'var(--rbr-muted)' }}>{e}</span>
              </li>
            ))}
          </ol>
        </Cartao>
        <Aviso tom="azul">Quem cuida da operação é a RBR. Aqui você só acompanha.</Aviso>
      </div>
    )
  }
  return (
    <div className="px-5 pt-8 md:px-0 md:pt-0 flex flex-col gap-4">
      <Titulo sub="Quem cuida da operação é a RBR. Aqui você só acompanha.">Operações</Titulo>
      {erro && <Aviso tom="vermelho">{erro}</Aviso>}
      {!linhas && !erro && <Esqueleto />}
      {linhas && linhas.length === 0 && <Vazio titulo="Nenhuma operação ainda" texto="Quando você enviar uma cotação aceita para a operação, ela aparece aqui com a linha do tempo." />}
      {linhas?.map((l) => (
        <button key={l.id} onClick={() => setSel(l.id)} className="rbr-card p-4 text-left flex flex-wrap items-center justify-between gap-3">
          <div><div className="font-bold">{l.cliente}</div><div className="text-[13px] text-[color:var(--rbr-muted)]">{l.rota}</div></div>
          <Selo texto={ETAPAS_OPERACAO[etapaDaOperacao(l.status)]!} bg="var(--rbr-muted-bg)" cor="var(--rbr-navy)" />
        </button>
      ))}
    </div>
  )
}
