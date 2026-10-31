import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { dataBr } from '../lib/novoDb'
import { Botao, Aviso, Card, Chips, Vazio, Carregando } from '../components/financeiro/ui'
import EditarPreCotacao, { type ClienteOpt } from '../components/precotacao/EditarPreCotacao'
import DetalhePreCotacao from '../components/precotacao/DetalhePreCotacao'
import { STATUS_LABEL, diasParaVencer, nomeCliente, numeroFmt, validadeFim, type PreCotacao, type StatusPre } from '../components/precotacao/tipos'

type Filtro = 'todas' | StatusPre

export default function PreCotacaoPage() {
  const [lista, setLista] = useState<PreCotacao[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [clientes, setClientes] = useState<(ClienteOpt & { fone: string | null })[]>([])
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [editando, setEditando] = useState<PreCotacao | 'nova' | null>(null)
  const [aberta, setAberta] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from('pre_cotacoes').select('*, pre_cotacao_itens(*)').order('numero', { ascending: false }).limit(300)
    if (error) return setErro(error.message)
    setErro(null)
    const l = ((data ?? []) as PreCotacao[]).map((p) => ({ ...p, pre_cotacao_itens: [...(p.pre_cotacao_itens ?? [])].sort((a, b) => a.ordem - b.ordem) }))
    // vencidas viram "expirada" só na exibição (o banco não muda sozinho)
    setLista(l)
  }, [])

  useEffect(() => {
    carregar()
    supabase.from('clientes').select('id, razao_social, nome_fantasia, status, celular_whatsapp').order('razao_social').limit(1000).then(({ data }) => {
      setClientes((data ?? []).map((c) => ({ id: c.id, nome: c.nome_fantasia ?? c.razao_social ?? '(sem nome)', status: c.status, fone: c.celular_whatsapp })))
    })
  }, [carregar])

  const mapa = useMemo(() => new Map(clientes.map((c) => [c.id, c.nome])), [clientes])

  const pendencias = useMemo(() => {
    const r: { chave: string; titulo: string; grave: boolean; id: string }[] = []
    for (const p of lista ?? []) {
      const nome = `${numeroFmt(p.numero)} · ${nomeCliente(p, mapa)}`
      if (p.status === 'enviada') {
        const d = diasParaVencer(p)
        if (d != null && d < 0) r.push({ chave: `v${p.id}`, titulo: `${nome}: validade vencida há ${-d} dia(s)`, grave: true, id: p.id })
        else if (d != null && d <= 2) r.push({ chave: `v${p.id}`, titulo: `${nome}: vence ${d === 0 ? 'hoje' : `em ${d} dia(s)`} — cobrar retorno`, grave: false, id: p.id })
      }
      if ((p.status === 'aceita' || p.status === 'aceita_parcial') && (p.pre_cotacao_itens ?? []).some((i) => i.status === 'aceita'))
        r.push({ chave: `a${p.id}`, titulo: `${nome}: rotas aceitas ainda não convertidas em cotação`, grave: false, id: p.id })
    }
    return r.sort((a, b) => Number(b.grave) - Number(a.grave))
  }, [lista, mapa])

  const visiveis = (lista ?? []).filter((p) => filtro === 'todas' || p.status === filtro)
  const sel = lista?.find((p) => p.id === aberta) ?? null
  const clienteSel = sel?.cliente_id ? clientes.find((c) => c.id === sel.cliente_id) : null

  return (
    <div className="p-4 md:p-8 flex flex-col gap-4 max-w-6xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[11px] font-bold" style={{ color: 'var(--rbr-muted)' }}>Serviços / Nova cotação</div>
          <h1 className="text-[30px] leading-tight text-[color:var(--rbr-navy-dark)]">Cotação</h1>
        </div>
        <div className="flex p-1 rounded-xl" style={{ background: '#e9ecf4' }} role="group" aria-label="Tipo de cotação">
          <span className="text-[13px] font-extrabold px-4 py-2 rounded-lg text-white" style={{ background: '#1c2559' }}>Pré-cotação · várias rotas</span>
          <a href="/cotacao" className="text-[13px] font-bold px-4 py-2 rounded-lg" style={{ color: '#4a5275' }}>Cotação formal · uma carga</a>
        </div>
        <Botao onClick={() => setEditando('nova')}>Nova pré-cotação</Botao>
      </div>
      <Aviso tipo="info">Esta é uma pré-cotação. Os valores podem ser alterados de acordo com a necessidade dos itens informados.</Aviso>
      {msg && <Aviso tipo="ok" onFechar={() => setMsg(null)}>✓ {msg}</Aviso>}
      {erro && <Aviso tipo="erro">✗ {erro}</Aviso>}

      <Card titulo="O que fazer agora" acao={pendencias.length > 0 ? <span className="text-xs text-[color:var(--rbr-muted)]">{pendencias.length} pendente(s)</span> : undefined}>
        {pendencias.length === 0 ? (
          <div className="text-sm text-[color:var(--rbr-positive)] font-semibold">✓ Nada pendente nas pré-cotações.</div>
        ) : (
          <ul className="flex flex-col divide-y">
            {pendencias.map((p) => (
              <li key={p.chave} className="py-2 flex items-center justify-between gap-3 flex-wrap" style={{ borderColor: 'var(--rbr-border)' }}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: p.grave ? 'var(--rbr-danger)' : '#D99A1C' }} />
                  <span className="text-sm">{p.titulo}</span>
                </div>
                <Botao variante="secundario" onClick={() => setAberta(p.id)}>Abrir</Botao>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Chips
        valor={filtro}
        onChange={setFiltro}
        opcoes={[{ valor: 'todas', label: 'Todas', qtd: lista?.length }, ...(['rascunho', 'enviada', 'aceita_parcial', 'aceita', 'recusada', 'convertida'] as StatusPre[]).map((s) => ({ valor: s as Filtro, label: STATUS_LABEL[s], qtd: lista?.filter((p) => p.status === s).length }))]}
      />

      <Card>
        {lista === null ? <Carregando /> : visiveis.length === 0 ? <Vazio>Nenhuma pré-cotação por aqui.</Vazio> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-[color:var(--rbr-muted)]">
                  <th className="py-2 pr-3">Nº</th><th className="pr-3">Cliente</th><th className="pr-3">Rotas</th><th className="pr-3">Status</th><th>Validade</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((p) => {
                  const f = validadeFim(p)
                  const d = diasParaVencer(p)
                  return (
                    <tr key={p.id} className="border-t cursor-pointer hover:bg-[color:var(--rbr-muted-bg)]" style={{ borderColor: 'var(--rbr-border)' }} onClick={() => setAberta(p.id)}>
                      <td className="py-2.5 pr-3 font-bold">{numeroFmt(p.numero)}</td>
                      <td className="pr-3">{nomeCliente(p, mapa)}</td>
                      <td className="pr-3">{p.pre_cotacao_itens?.length ?? 0}</td>
                      <td className="pr-3">{STATUS_LABEL[p.status]}</td>
                      <td className={d != null && d < 0 && p.status === 'enviada' ? 'text-[color:var(--rbr-danger)] font-semibold' : ''}>
                        {f ? `${dataBr(f.toISOString())}${d != null && p.status === 'enviada' ? (d < 0 ? ' (vencida)' : ` (${d}d)`) : ''}` : `${p.validade_dias} dias após envio`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {sel && !editando && (
        <DetalhePreCotacao
          pre={sel}
          itens={sel.pre_cotacao_itens ?? []}
          cliente={nomeCliente(sel, mapa)}
          telefone={clienteSel?.fone ?? null}
          onFechar={() => setAberta(null)}
          onMudou={carregar}
          onEditar={() => setEditando(sel)}
        />
      )}
      {editando && (
        <EditarPreCotacao
          pre={editando === 'nova' ? null : editando}
          itens={editando === 'nova' ? [] : editando.pre_cotacao_itens ?? []}
          clientes={clientes}
          onFechar={() => setEditando(null)}
          onSalvo={(m) => { setMsg(m); setEditando(null); carregar() }}
        />
      )}
    </div>
  )
}
