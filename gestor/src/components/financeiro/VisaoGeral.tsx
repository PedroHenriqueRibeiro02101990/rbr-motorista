import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { type Apoio, type Lancamento, addDias, brl, brlCurto, erroMsg, fmtData, hojeISO, invocarIA, lerParametro } from '../../lib/financeiro'
import { Aviso, Botao, Card, Carregando, Chips, Kpi, Pill } from './ui'
import { BaixaModal, DetalheLancamento } from './LancamentoModais'

interface DiaFluxo {
  dia: string
  entradas_realizadas: number
  saidas_realizadas: number
  entradas_previstas: number
  saidas_previstas: number
  vencidos_receber: number
  vencidos_pagar: number
  saldo: number
}
interface Analise {
  id: string
  created_at: string
  resultado: {
    saude: 'boa' | 'atencao' | 'critica'
    resumo: string
    alertas: { nivel: string; titulo: string; detalhe: string }[]
    acoes: { prioridade: string; acao: string; impacto: string }[]
  }
}
interface Pendencias {
  docs: number
  extrato: number
  semContraparte: number
  pagosEmCancelada: number
  assinaturas: { id: string; valor_atual: number; motorista: string | null; placa: string | null }[]
  comissoes: { id: string; valor_calculado: number; agenciador: string | null }[]
}

export default function VisaoGeral({ apoio, versao, ir, onMudou }: { apoio: Apoio; versao: number; ir: (aba: string, filtro?: string) => void; onMudou: () => void }) {
  const hoje = hojeISO()
  const [horizonte, setHorizonte] = useState<'30' | '60' | '90'>('60')
  const [fluxo, setFluxo] = useState<DiaFluxo[] | null>(null)
  const [proximos, setProximos] = useState<Lancamento[]>([])
  const [saldoMin, setSaldoMin] = useState(0)
  const [incluirVencidos, setIncluirVencidos] = useState(false)
  const [analise, setAnalise] = useState<Analise | null>(null)
  const [analisando, setAnalisando] = useState(false)
  const [pend, setPend] = useState<Pendencias | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [baixa, setBaixa] = useState<Lancamento | null>(null)
  const [detalhe, setDetalhe] = useState<string | null>(null)

  useEffect(() => {
    const ate = addDias(hoje, 90)
    Promise.all([
      supabase.rpc('fluxo_caixa', { p_de: addDias(hoje, -30), p_ate: ate }),
      Promise.all([
        supabase.from('v_lancamentos').select('*').eq('status', 'aberto').lt('data_vencimento', hoje).order('data_vencimento').limit(20),
        supabase.from('v_lancamentos').select('*').in('status', ['aberto', 'previsto']).gte('data_vencimento', hoje).lte('data_vencimento', addDias(hoje, 7)).order('data_vencimento').limit(60),
      ]).then(([v, pr]) => ({ data: [...(v.data ?? []), ...(pr.data ?? [])] })),
      lerParametro<number>('saldo_minimo_alerta'),
      supabase.from('analises_financeiras_ia').select('id, created_at, resultado').order('created_at', { ascending: false }).limit(1),
      supabase.from('documentos_financeiros').select('id', { count: 'exact', head: true }).eq('revisado', false),
      supabase.from('extrato_itens').select('id', { count: 'exact', head: true }).eq('status', 'pendente'),
      supabase.from('lancamentos_financeiros').select('id', { count: 'exact', head: true }).in('status', ['aberto', 'previsto']).in('contraparte_nome', ['Motorista a definir', 'Fornecedor a definir']),
      supabase.from('v_lancamentos').select('id, operacao_id, valor_pago').eq('tipo', 'pagar').gt('valor_pago', 0).not('operacao_id', 'is', null).limit(500),
      supabase
        .from('assinaturas_motorista')
        .select('id, valor_atual, pessoas!assinaturas_motorista_motorista_titular_id_fkey(nome), veiculos!assinaturas_motorista_veiculo_id_fkey(placa)')
        .eq('status', 'aguardando_confirmacao'),
      supabase.from('comissoes_agenciador').select('id, valor_calculado, pessoas(nome)').eq('status', 'pendente'),
    ]).then(async ([f, p, s, a, d, e, sc, pagos, ass, com]) => {
      if (f.error) setErro(f.error.message)
      setFluxo(((f.data ?? []) as DiaFluxo[]).map((x) => ({ ...x, saldo: Number(x.saldo) })))
      setProximos(p.data ?? [])
      setSaldoMin(Number(s ?? 0))
      setAnalise(((a.data ?? [])[0] as unknown as Analise) ?? null)
      let pagosEmCancelada = 0
      const opsPagas = [...new Set((pagos.data ?? []).map((x) => x.operacao_id!))]
      if (opsPagas.length) {
        const { count } = await supabase.from('operacoes').select('id', { count: 'exact', head: true }).in('id', opsPagas).eq('status', 'cancelada')
        pagosEmCancelada = count ?? 0
      }
      setPend({
        docs: d.count ?? 0,
        extrato: e.count ?? 0,
        semContraparte: sc.count ?? 0,
        pagosEmCancelada,
        assinaturas: (ass.data ?? []).map((x) => {
          const r = x as unknown as { id: string; valor_atual: number; pessoas: { nome: string } | null; veiculos: { placa: string } | null }
          return { id: r.id, valor_atual: Number(r.valor_atual), motorista: r.pessoas?.nome ?? null, placa: r.veiculos?.placa ?? null }
        }),
        comissoes: (com.data ?? []).map((x) => {
          const r = x as unknown as { id: string; valor_calculado: number; pessoas: { nome: string } | null }
          return { id: r.id, valor_calculado: Number(r.valor_calculado), agenciador: r.pessoas?.nome ?? null }
        }),
      })
    })
  }, [hoje, versao])

  // Série: realizado até hoje; projetado depois (opcionalmente contando os vencidos como se entrassem/saíssem hoje)
  const serie = useMemo(() => {
    if (!fluxo) return []
    const limite = addDias(hoje, Number(horizonte))
    const ajusteHoje = fluxo.find((d) => d.dia === hoje)
    const extra = incluirVencidos && ajusteHoje ? Number(ajusteHoje.vencidos_receber) - Number(ajusteHoje.vencidos_pagar) : 0
    return fluxo.filter((d) => d.dia <= limite).map((d) => ({ ...d, saldo: d.dia >= hoje ? d.saldo + extra : d.saldo }))
  }, [fluxo, horizonte, incluirVencidos, hoje])

  const saldoHoje = apoio.contas.filter((c) => c.ativa).reduce((s, c) => s + Number(c.saldo_atual ?? 0), 0)
  const futuro = serie.filter((d) => d.dia >= hoje)
  const menor = futuro.reduce<DiaFluxo | null>((m, d) => (!m || d.saldo < m.saldo ? d : m), null)
  const primeiroAbaixo = futuro.find((d) => d.saldo < saldoMin)
  const fim = futuro[futuro.length - 1]
  const somaFut = (campo: 'entradas_previstas' | 'saidas_previstas') => futuro.reduce((s, d) => s + Number(d[campo]), 0)
  const hojeLinha = fluxo?.find((d) => d.dia === hoje)
  const vencReceber = Number(hojeLinha?.vencidos_receber ?? 0)
  const vencPagar = Number(hojeLinha?.vencidos_pagar ?? 0)

  async function analisar() {
    setAnalisando(true)
    setErro(null)
    try {
      const r = await invocarIA<{ analise: Analise }>('analisar')
      setAnalise(r.analise)
    } catch (e) {
      setErro(erroMsg(e))
    } finally {
      setAnalisando(false)
    }
  }

  async function confirmarAssinatura(id: string) {
    const { error } = await supabase.rpc('confirmar_pagamento_assinatura', { p_assinatura: id })
    if (error) return setErro(error.message)
    onMudou()
  }
  async function creditarComissao(id: string) {
    const { error } = await supabase.from('comissoes_agenciador').update({ status: 'creditado', creditado_em: new Date().toISOString() }).eq('id', id)
    if (error) return setErro(error.message)
    onMudou()
  }

  if (!fluxo || !pend) return <Carregando />

  const alertas: { tom: 'erro' | 'atencao' | 'info'; texto: string; acao?: () => void; rotulo?: string }[] = []
  if (primeiroAbaixo)
    alertas.push({
      tom: primeiroAbaixo.saldo < 0 ? 'erro' : 'atencao',
      texto: `O caixa projetado fica ${primeiroAbaixo.saldo < 0 ? 'negativo' : 'abaixo do mínimo de segurança'} em ${fmtData(primeiroAbaixo.dia)} (${brl(primeiroAbaixo.saldo)}). Menor saldo: ${brl(menor?.saldo)} em ${fmtData(menor?.dia)}.`,
      acao: () => ir('pagar', 'mes'),
      rotulo: 'Ver contas a pagar',
    })
  if (vencReceber > 0) alertas.push({ tom: 'erro', texto: `${brl(vencReceber)} a receber já vencido.`, acao: () => ir('receber', 'vencidos'), rotulo: 'Cobrar' })
  if (vencPagar > 0) alertas.push({ tom: 'atencao', texto: `${brl(vencPagar)} a pagar vencido (juros correndo).`, acao: () => ir('pagar', 'vencidos'), rotulo: 'Ver' })
  if (pend.docs > 0) alertas.push({ tom: 'info', texto: `${pend.docs} documento(s) esperando revisão.`, acao: () => ir('documentos'), rotulo: 'Revisar' })
  if (pend.extrato > 0) alertas.push({ tom: 'info', texto: `${pend.extrato} movimentação(ões) do extrato para conciliar.`, acao: () => ir('conciliacao'), rotulo: 'Conciliar' })
  if (pend.semContraparte > 0)
    alertas.push({ tom: 'info', texto: `${pend.semContraparte} lançamento(s) com motorista/fornecedor “a definir” (defina na operação ou no custo adicional da cotação).` })
  if (pend.pagosEmCancelada > 0)
    alertas.push({ tom: 'atencao', texto: `${pend.pagosEmCancelada} operação(ões) cancelada(s) com pagamento já feito — confira se precisa pedir devolução.`, acao: () => ir('pagar', 'pagos'), rotulo: 'Ver' })
  if (apoio.contas.every((c) => Number(c.saldo_inicial) === 0))
    alertas.push({ tom: 'info', texto: 'Informe o saldo inicial das contas bancárias para o fluxo de caixa partir do valor real.', acao: () => ir('config'), rotulo: 'Configurar' })

  return (
    <div className="flex flex-col gap-4">
      {erro && (
        <Aviso onFechar={() => setErro(null)}>
          {erro}
        </Aviso>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
        <Kpi label="Saldo em contas hoje" valor={brlCurto(saldoHoje)} sub={`${apoio.contas.filter((c) => c.ativa).length} conta(s)`} tom={saldoHoje < 0 ? 'ruim' : undefined} />
        <Kpi label={`Entra em ${horizonte} dias`} valor={brlCurto(somaFut('entradas_previstas'))} sub={vencReceber > 0 ? `+ ${brlCurto(vencReceber)} vencido` : 'previsto'} tom="bom" />
        <Kpi label={`Sai em ${horizonte} dias`} valor={brlCurto(somaFut('saidas_previstas'))} sub={vencPagar > 0 ? `+ ${brlCurto(vencPagar)} vencido` : 'previsto'} />
        <Kpi label={`Saldo projetado em ${fmtData(fim?.dia).slice(0, 5)}`} valor={brlCurto(fim?.saldo ?? 0)} tom={(fim?.saldo ?? 0) < saldoMin ? 'ruim' : undefined} />
        <Kpi
          label="Menor saldo no período"
          valor={brlCurto(menor?.saldo ?? 0)}
          sub={menor ? `em ${fmtData(menor.dia)}` : undefined}
          tom={(menor?.saldo ?? 0) < 0 ? 'ruim' : (menor?.saldo ?? 0) < saldoMin ? 'atencao' : undefined}
        />
      </div>

      <Card
        titulo="Fluxo de caixa"
        acao={
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-1.5 text-[11px]">
              <input type="checkbox" checked={incluirVencidos} onChange={(e) => setIncluirVencidos(e.target.checked)} /> Contar vencidos como se fossem pagos hoje
            </label>
            <Chips
              opcoes={[
                { valor: '30', label: '30 dias' },
                { valor: '60', label: '60 dias' },
                { valor: '90', label: '90 dias' },
              ]}
              valor={horizonte}
              onChange={setHorizonte}
            />
          </div>
        }
      >
        <GraficoFluxo serie={serie} hoje={hoje} saldoMin={saldoMin} />
        <div className="flex gap-4 flex-wrap text-[11px] text-[color:var(--rbr-muted)] mt-2">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-0.5" style={{ background: 'var(--rbr-navy)' }} /> realizado (últimos 30 dias)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-0.5 border-t-2 border-dashed" style={{ borderColor: 'var(--rbr-gold)' }} /> projetado
          </span>
          {saldoMin > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 h-0.5" style={{ background: '#E8A6A6' }} /> mínimo de segurança {brl(saldoMin)}
            </span>
          )}
        </div>
        <TabelaSemanal serie={futuro} />
      </Card>

      {alertas.length > 0 && (
        <div className="flex flex-col gap-2">
          {alertas.map((a, i) => (
            <Aviso key={i} tipo={a.tom}>
              <span className="flex items-center justify-between gap-2 flex-wrap">
                <span>{a.texto}</span>
                {a.acao && (
                  <button type="button" onClick={a.acao} className="text-[11px] font-bold underline">
                    {a.rotulo}
                  </button>
                )}
              </span>
            </Aviso>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card
          titulo="Próximos 7 dias e vencidos"
          acao={
            <div className="flex gap-2">
              <Botao variante="fantasma" onClick={() => ir('receber', 'semana')}>
                A receber
              </Botao>
              <Botao variante="fantasma" onClick={() => ir('pagar', 'semana')}>
                A pagar
              </Botao>
            </div>
          }
        >
          {proximos.length === 0 ? (
            <div className="text-sm text-[color:var(--rbr-muted)] py-3">Nada vencendo nos próximos 7 dias.</div>
          ) : (
            <div className="flex flex-col divide-y" style={{ borderColor: 'var(--rbr-border)' }}>
              {proximos.map((l) => (
                <div key={l.id} className="flex items-center gap-2 py-2 cursor-pointer" onClick={() => setDetalhe(l.id!)}>
                  <span className="w-12 text-[11px] tabular-nums text-[color:var(--rbr-muted)]">{fmtData(l.data_vencimento).slice(0, 5)}</span>
                  <span className="text-[11px] font-bold w-4" style={{ color: l.tipo === 'receber' ? 'var(--rbr-positive)' : 'var(--rbr-danger)' }}>
                    {l.tipo === 'receber' ? '+' : '−'}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-semibold truncate">{l.contraparte ?? '—'}</span>
                    <span className="block text-[11px] text-[color:var(--rbr-muted)] truncate">{l.descricao}</span>
                  </span>
                  <span className="text-[13px] tabular-nums font-semibold">{brl(l.saldo_aberto)}</span>
                  <Pill situacao={l.situacao ?? ''} />
                  {l.status === 'aberto' && (
                    <span onClick={(e) => e.stopPropagation()}>
                      <Botao variante="secundario" onClick={() => setBaixa(l)}>
                        {l.tipo === 'pagar' ? 'Pagar' : 'Receber'}
                      </Botao>
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card
          titulo="Análise da IA"
          acao={
            <Botao variante="ouro" onClick={analisar} disabled={analisando}>
              {analisando ? 'Analisando…' : analise ? 'Analisar de novo' : 'Analisar agora'}
            </Botao>
          }
        >
          {!analise ? (
            <div className="text-sm text-[color:var(--rbr-muted)]">
              A IA lê o caixa projetado, inadimplência, concentração de clientes, margem real × prevista e despesas, e devolve um diagnóstico com ações práticas.
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <Pill
                  situacao={analise.resultado.saude === 'boa' ? 'pago' : analise.resultado.saude === 'critica' ? 'vencido' : 'vence_hoje'}
                  texto={analise.resultado.saude === 'boa' ? 'Saudável' : analise.resultado.saude === 'critica' ? 'Crítico' : 'Atenção'}
                />
                <span className="text-[11px] text-[color:var(--rbr-muted)]">{new Date(analise.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
              </div>
              <p className="text-[13px] leading-relaxed">{analise.resultado.resumo}</p>
              {analise.resultado.alertas.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {analise.resultado.alertas.map((a, i) => (
                    <div key={i} className="text-xs">
                      <b style={{ color: a.nivel === 'critico' ? 'var(--rbr-danger)' : a.nivel === 'atencao' ? '#8A5A00' : 'var(--rbr-navy-dark)' }}>{a.titulo}.</b> {a.detalhe}
                    </div>
                  ))}
                </div>
              )}
              {analise.resultado.acoes.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] mb-1">O que fazer</div>
                  <ol className="flex flex-col gap-1 list-decimal pl-4">
                    {analise.resultado.acoes.map((a, i) => (
                      <li key={i} className="text-xs">
                        {a.acao} <span className="text-[color:var(--rbr-muted)]">— {a.impacto}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {(pend.assinaturas.length > 0 || pend.comissoes.length > 0) && (
        <Card titulo="Confirmações pendentes">
          <div className="flex flex-col gap-2">
            {pend.assinaturas.map((a) => (
              <div key={a.id} className="flex items-center gap-3 text-sm flex-wrap">
                <span className="flex-1">
                  Assinatura do app · {a.motorista ?? '—'} {a.placa ? `(${a.placa})` : ''} · {brl(a.valor_atual)}
                </span>
                <Botao variante="secundario" onClick={() => confirmarAssinatura(a.id)}>
                  Pix recebido — ativar
                </Botao>
              </div>
            ))}
            {pend.comissoes.map((c) => (
              <div key={c.id} className="flex items-center gap-3 text-sm flex-wrap">
                <span className="flex-1">
                  Comissão · {c.agenciador ?? '—'} · {brl(c.valor_calculado)}
                </span>
                <Botao variante="secundario" onClick={() => creditarComissao(c.id)}>
                  Marcar creditado
                </Botao>
              </div>
            ))}
          </div>
        </Card>
      )}

      {baixa && <BaixaModal lancamentos={[baixa]} apoio={apoio} onFechar={() => setBaixa(null)} onFeito={onMudou} />}
      {detalhe && <DetalheLancamento id={detalhe} apoio={apoio} onFechar={() => setDetalhe(null)} onMudou={onMudou} />}
    </div>
  )
}

function GraficoFluxo({ serie, hoje, saldoMin }: { serie: DiaFluxo[]; hoje: string; saldoMin: number }) {
  const W = 760
  const H = 220
  const pad = { l: 64, r: 12, t: 12, b: 26 }
  if (serie.length < 2) return <div className="text-sm text-[color:var(--rbr-muted)]">Sem dados ainda.</div>
  const valores = serie.map((d) => d.saldo).concat([0, saldoMin])
  let min = Math.min(...valores)
  let max = Math.max(...valores)
  if (max === min) {
    max += 1000
    min -= 1000
  }
  const folga = (max - min) * 0.08
  min -= folga
  max += folga
  const x = (i: number) => pad.l + (i / (serie.length - 1)) * (W - pad.l - pad.r)
  const y = (v: number) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b)
  const iHoje = Math.max(0, serie.findIndex((d) => d.dia >= hoje))
  const caminho = (de: number, ate: number) =>
    serie
      .slice(de, ate + 1)
      .map((d, k) => `${k === 0 ? 'M' : 'L'}${x(de + k).toFixed(1)},${y(d.saldo).toFixed(1)}`)
      .join(' ')
  const area = `${caminho(iHoje, serie.length - 1)} L${x(serie.length - 1).toFixed(1)},${y(Math.max(min, 0)).toFixed(1)} L${x(iHoje).toFixed(1)},${y(Math.max(min, 0)).toFixed(1)} Z`
  const ticks = 4
  const passos = Array.from({ length: ticks + 1 }, (_, i) => min + ((max - min) * i) / ticks)
  const marcasX = serie.map((d, i) => ({ d, i })).filter(({ d, i }) => i === 0 || i === serie.length - 1 || d.dia === hoje || d.dia.endsWith('-01'))
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[520px] h-auto" role="img" aria-label="Saldo de caixa realizado e projetado por dia">
        {passos.map((v, i) => (
          <g key={i}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="#EEF0F5" />
            <text x={pad.l - 6} y={y(v) + 3.5} textAnchor="end" fontSize="10" fill="#6B7280">
              {brlCurto(v)}
            </text>
          </g>
        ))}
        {min < 0 && <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="#9CA3AF" strokeWidth="1" />}
        {saldoMin > 0 && <line x1={pad.l} x2={W - pad.r} y1={y(saldoMin)} y2={y(saldoMin)} stroke="#E8A6A6" strokeDasharray="3 3" />}
        <path d={area} fill="rgba(184,134,59,0.10)" />
        <path d={caminho(0, iHoje)} fill="none" stroke="var(--rbr-navy)" strokeWidth="2" />
        <path d={caminho(iHoje, serie.length - 1)} fill="none" stroke="var(--rbr-gold)" strokeWidth="2" strokeDasharray="5 4" />
        <line x1={x(iHoje)} x2={x(iHoje)} y1={pad.t} y2={H - pad.b} stroke="#C9CDDA" strokeDasharray="2 3" />
        <circle cx={x(iHoje)} cy={y(serie[iHoje].saldo)} r="3.5" fill="var(--rbr-navy)" />
        {marcasX.map(({ d, i }) => (
          <text key={d.dia} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === serie.length - 1 ? 'end' : 'middle'} fontSize="10" fill={d.dia === hoje ? '#12173D' : '#6B7280'} fontWeight={d.dia === hoje ? 700 : 400}>
            {d.dia === hoje ? 'hoje' : fmtData(d.dia).slice(0, 5)}
          </text>
        ))}
        {serie.map((d, i) =>
          d.saldo < 0 && d.dia >= hoje ? <circle key={d.dia} cx={x(i)} cy={y(d.saldo)} r="1.6" fill="var(--rbr-danger)" /> : null,
        )}
      </svg>
    </div>
  )
}

function TabelaSemanal({ serie }: { serie: DiaFluxo[] }) {
  const semanas: { ini: string; fim: string; ent: number; sai: number; saldo: number }[] = []
  for (let i = 0; i < serie.length; i += 7) {
    const bloco = serie.slice(i, i + 7)
    if (!bloco.length) continue
    semanas.push({
      ini: bloco[0].dia,
      fim: bloco[bloco.length - 1].dia,
      ent: bloco.reduce((s, d) => s + Number(d.entradas_previstas), 0),
      sai: bloco.reduce((s, d) => s + Number(d.saidas_previstas), 0),
      saldo: bloco[bloco.length - 1].saldo,
    })
  }
  if (!semanas.length) return null
  return (
    <div className="overflow-x-auto mt-3">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-[10.5px] uppercase tracking-wide text-[color:var(--rbr-muted)]">
            <th className="text-left py-1.5 pr-3">Semana</th>
            <th className="text-right py-1.5 px-2">Entra</th>
            <th className="text-right py-1.5 px-2">Sai</th>
            <th className="text-right py-1.5 pl-2">Saldo no fim</th>
          </tr>
        </thead>
        <tbody>
          {semanas.map((s) => (
            <tr key={s.ini} className="border-t" style={{ borderColor: 'var(--rbr-border)' }}>
              <td className="py-1.5 pr-3 whitespace-nowrap">
                {fmtData(s.ini).slice(0, 5)} – {fmtData(s.fim).slice(0, 5)}
              </td>
              <td className="py-1.5 px-2 text-right tabular-nums" style={{ color: 'var(--rbr-positive)' }}>
                {s.ent ? brl(s.ent) : '—'}
              </td>
              <td className="py-1.5 px-2 text-right tabular-nums" style={{ color: 'var(--rbr-danger)' }}>
                {s.sai ? brl(s.sai) : '—'}
              </td>
              <td className="py-1.5 pl-2 text-right tabular-nums font-semibold" style={{ color: s.saldo < 0 ? 'var(--rbr-danger)' : undefined }}>
                {brl(s.saldo)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
