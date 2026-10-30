import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@rbr/shared/supabaseClient'
import { formatMoney, STATUS_OPERACAO_LABEL } from '@rbr/shared/format'
import FrotaMap, { type FrotaMapLinha, type FrotaMapPonto } from '@rbr/shared/FrotaMap'
import { COR_SINAL, type CargaMapa, type MotoristaMapa } from '../components/mapa/MapaOperacional'
import { DetalheMotorista, DetalheViagem } from '../components/inicio/DetalheViagem'
import { haQuanto, previsaoChegada } from '../components/inicio/util'
import { blocosDaFuncao, FUNCOES_INICIO, funcaoInicial, type FuncaoInicio } from '../lib/inicioPorFuncao'

// Início = dashboard do dia ao vivo: mapa da frota, coluna "Hoje" e números pequenos de caixa e comercial.
// As pendências (alocação, fiscal, a pagar, radar) ficam nas telas de cada área, não aqui.

type Painel = {
  gerado_em: string
  hoje: string
  operacao: { ativas: number; coletas_hoje: number; entregas_hoje: number; motoristas_online: number }
  comercial: { cotacoes_mes: number; convertidas_mes: number; cotacoes_ant: number }
  caixa: { saldo_contas: number; receber_30: number; pagar_30: number; saldo_minimo: number | null }
}
type Aba = 'viagens' | 'motoristas' | 'coletas'
type Selecao = { tipo: 'viagem' | 'motorista'; id: string } | null

const ATUALIZAR_A_CADA_MS = 60_000
const ANTES_DA_COLETA = new Set(['aguardando_liberacao_fiscal', 'liberada_coleta', 'carregando'])
const COR_COLETA = '#E0B25C'
const COR_ENTREGA = '#4FC48A'
const COR_DISPONIVEL = '#6EA8FF'
const COR_MOTORISTA = '#C9D3FF'

const cardStyle = {
  borderColor: 'var(--rbr-border)',
  boxShadow: '0 1px 2px rgba(18,23,61,0.03), 0 10px 30px rgba(18,23,61,0.06)',
}

function n(v: unknown): number {
  const x = Number(v ?? 0)
  return Number.isFinite(x) ? x : 0
}
const coord = (c: [number, number] | null) => (c ? ([Number(c[0]), Number(c[1])] as [number, number]) : null)

function Mini({ titulo, para, itens }: { titulo: string; para: string; itens: { rotulo: string; valor: string; tom?: 'ruim' }[] }) {
  return (
    <Link to={para} className="bg-white border rounded-2xl px-5 py-3.5 flex items-center gap-6 hover:opacity-90 transition-opacity" style={cardStyle}>
      <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] w-20 flex-shrink-0">{titulo}</div>
      {itens.map((i) => (
        <div key={i.rotulo} className="min-w-0">
          <div className="text-base font-semibold tabular-nums truncate" style={{ color: i.tom === 'ruim' ? 'var(--rbr-danger)' : 'var(--rbr-navy-dark)' }}>
            {i.valor}
          </div>
          <div className="text-[11px] text-[color:var(--rbr-muted)]">{i.rotulo}</div>
        </div>
      ))}
    </Link>
  )
}

export default function Inicio({ nome }: { nome?: string }) {
  const [painel, setPainel] = useState<Painel | null>(null)
  const [naoLidos, setNaoLidos] = useState(0)
  useEffect(() => {
    void supabase
      .from('notificacoes')
      .select('id', { count: 'exact', head: true })
      .neq('status_entrega', 'confirmado_lido')
      .then(({ count }) => setNaoLidos(count ?? 0))
  }, [])
  // F05: visão por função. Começa pela função da pessoa (se tiver uma só) ou pela última escolha guardada neste navegador.
  const [visao, setVisao] = useState<FuncaoInicio>(() => {
    try {
      return funcaoInicial([], localStorage.getItem('rbr.inicio.visao'))
    } catch {
      return 'geral'
    }
  })
  useEffect(() => {
    let vivo = true
    void (async () => {
      try {
        if (localStorage.getItem('rbr.inicio.visao')) return
      } catch {
        /* sem armazenamento: segue */
      }
      const { data: eu } = await supabase.rpc('current_pessoa_id')
      if (!eu) return
      const { data } = await supabase.from('funcoes_pessoa' as never).select('funcao').eq('pessoa_id', eu).eq('ativo', true)
      if (vivo) setVisao(funcaoInicial(((data ?? []) as unknown as { funcao: string }[]).map((x) => x.funcao), null))
    })()
    return () => {
      vivo = false
    }
  }, [])
  const blocos = blocosDaFuncao(visao)
  function escolherVisao(v: FuncaoInicio) {
    setVisao(v)
    try {
      localStorage.setItem('rbr.inicio.visao', v)
    } catch {
      /* sem armazenamento: vale só nesta sessão */
    }
  }
  const [cargas, setCargas] = useState<CargaMapa[]>([])
  const [motoristas, setMotoristas] = useState<MotoristaMapa[]>([])
  const [carregado, setCarregado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [, setRelogio] = useState(0)
  const [aba, setAba] = useState<Aba>('viagens')
  const [sel, setSel] = useState<Selecao>(null)
  const [resumo, setResumo] = useState<{ texto: string; em: string } | null>(null)
  const [gerandoResumo, setGerandoResumo] = useState(false)
  const [erroResumo, setErroResumo] = useState<string | null>(null)
  const ocupado = useRef(false)

  const carregar = useCallback(async () => {
    if (ocupado.current) return
    ocupado.current = true
    const [p, m] = await Promise.all([supabase.rpc('painel_inicio'), supabase.rpc('mapa_operacional')])
    ocupado.current = false
    setCarregado(true)
    setErro(p.error?.message ?? m.error?.message ?? null)
    if (!p.error) setPainel(p.data as unknown as Painel)
    if (!m.error) {
      const d = m.data as unknown as { cargas: CargaMapa[]; motoristas: MotoristaMapa[] }
      setCargas(d.cargas ?? [])
      setMotoristas(d.motoristas ?? [])
    }
  }, [])

  // Atualiza sozinho a cada minuto enquanto a aba está visível (e ao voltar para ela).
  useEffect(() => {
    carregar()
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') carregar()
      else setRelogio((x) => x + 1)
    }, ATUALIZAR_A_CADA_MS)
    const vis = () => document.visibilityState === 'visible' && carregar()
    document.addEventListener('visibilitychange', vis)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', vis)
    }
  }, [carregar])

  async function gerarResumo() {
    setGerandoResumo(true)
    setErroResumo(null)
    const { data, error } = await supabase.functions.invoke('resumo-dia', { body: {} })
    setGerandoResumo(false)
    if (error || !data?.ok) {
      let texto = 'Não foi possível gerar o resumo agora.'
      try {
        texto = (await (error as unknown as { context: Response }).context.json())?.erro ?? texto
      } catch {
        texto = data?.erro ?? texto
      }
      return setErroResumo(texto)
    }
    setResumo({ texto: data.texto, em: data.gerado_em })
  }

  const viagens = useMemo(() => cargas.filter((c) => c.status !== 'alocando_motorista'), [cargas])
  const viagemSel = sel?.tipo === 'viagem' ? (viagens.find((c) => c.id === sel.id) ?? null) : null
  const motoristaSel = sel?.tipo === 'motorista' ? (motoristas.find((m) => m.id === sel.id) ?? null) : null

  // Pontos do mapa por aba. O prefixo do id diz o que foi clicado (c = caminhão, m = motorista livre, o/d = coleta/entrega).
  const pontos = useMemo<FrotaMapPonto[]>(() => {
    const caminhao = (c: CargaMapa, cor: string): FrotaMapPonto | null =>
      c.ultima
        ? {
            id: `c:${c.id}`,
            lat: Number(c.ultima.lat),
            lng: Number(c.ultima.lng),
            nome: c.motorista ?? `${c.origem} → ${c.destino}`,
            subtitulo: c.placa ?? undefined,
            capturadoEm: c.ultima.em,
            fonte: c.ultima.fonte === 'wialon' ? 'wialon' : 'app_celular',
            cor,
          }
        : null
    const livre = (m: MotoristaMapa, discreto: boolean): FrotaMapPonto => ({
      id: `m:${m.id}`,
      lat: Number(m.lat),
      lng: Number(m.lng),
      nome: m.nome,
      subtitulo: discreto ? 'parado' : 'disponível',
      capturadoEm: m.em,
      fonte: m.fonte === 'wialon' ? 'wialon' : 'app_celular',
      cor: discreto ? '#8A93A6' : COR_DISPONIVEL,
      discreto,
    })
    const out: (FrotaMapPonto | null)[] = []
    if (aba === 'viagens') {
      viagens.forEach((c) => out.push(caminhao(c, COR_SINAL[c.sinal ?? 'sem'] ?? COR_SINAL.sem)))
      motoristas.forEach((m) => out.push(livre(m, true)))
    } else if (aba === 'motoristas') {
      viagens.forEach((c) => out.push(caminhao(c, COR_MOTORISTA)))
      motoristas.forEach((m) => out.push(livre(m, false)))
    } else {
      viagens.forEach((c) => {
        const o = coord(c.origem_coord)
        const d = coord(c.destino_coord)
        if (ANTES_DA_COLETA.has(c.status) && o)
          out.push({ id: `o:${c.id}`, lat: o[0], lng: o[1], nome: `Coleta · ${c.origem}`, subtitulo: c.motorista ?? undefined, capturadoEm: c.coleta_em ?? new Date().toISOString(), fonte: 'app_celular', cor: COR_COLETA })
        if (c.status === 'em_transito' && d)
          out.push({ id: `d:${c.id}`, lat: d[0], lng: d[1], nome: `Entrega · ${c.destino}`, subtitulo: c.motorista ?? undefined, capturadoEm: new Date().toISOString(), fonte: 'app_celular', cor: COR_ENTREGA })
      })
    }
    return out.filter((p): p is FrotaMapPonto => !!p)
  }, [aba, viagens, motoristas])

  const { linhas, foco } = useMemo(() => {
    const c = viagemSel
    if (!c) return { linhas: [] as FrotaMapLinha[], foco: undefined }
    const atual = c.ultima ? ([Number(c.ultima.lat), Number(c.ultima.lng)] as [number, number]) : null
    const o = coord(c.origem_coord)
    const d = coord(c.destino_coord)
    const ls: FrotaMapLinha[] = []
    if (c.trilha.length > 1) ls.push({ id: 'trilha', pontos: c.trilha.map((t) => [Number(t[0]), Number(t[1])] as [number, number]) })
    const de = atual ?? o
    if (de && d) ls.push({ id: 'falta', pontos: [de, d], tracejada: true })
    return { linhas: ls, foco: [atual, o, d].filter((p): p is [number, number] => !!p) }
  }, [viagemSel])

  function clicarNoMapa(id: string) {
    const [tipo, real] = [id.slice(0, 1), id.slice(2)]
    setSel(tipo === 'm' ? { tipo: 'motorista', id: real } : { tipo: 'viagem', id: real })
  }
  const idSelecionadoNoMapa = viagemSel ? (aba === 'coletas' ? null : `c:${viagemSel.id}`) : motoristaSel ? `m:${motoristaSel.id}` : null

  const op = painel?.operacao
  const com = painel?.comercial
  const caixa = painel?.caixa
  const saldo = n(caixa?.saldo_contas)
  const projecao30 = saldo + n(caixa?.receber_30) - n(caixa?.pagar_30)
  const minimo = caixa?.saldo_minimo != null ? n(caixa.saldo_minimo) : null
  const conversao = com?.cotacoes_mes ? Math.round((n(com.convertidas_mes) / n(com.cotacoes_mes)) * 100) : null
  const semViagens = carregado && viagens.length === 0

  // "Agora": o que precisa de uma pessoa, tirado dos dados reais (sem motorista, sem sinal, avisos não lidos).
  const semMotorista = cargas.filter((c) => c.status === 'alocando_motorista')
  const semSinal = viagens.filter((c) => c.sinal === 'alerta')
  const precisam = semMotorista.length + semSinal.length + (naoLidos > 0 ? 1 : 0)
  const hora = new Date().getHours()
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'
  const primeiroNome = (nome ?? '').split(' ')[0]
  const destaque = semSinal[0] ? `A viagem para ${semSinal[0].destino} está sem sinal.` : null

  const botao = 'text-[12px] font-bold px-3.5 py-2 rounded-[10px] text-white self-start'
  const kpi = (rotulo: string, valor: string | number, nota?: string, perigo?: boolean) => (
    <div className="bg-white border rounded-2xl px-3.5 py-2.5" style={{ borderColor: perigo ? '#f2c4c0' : 'var(--rbr-border)', background: perigo ? '#fdeceb' : '#fff' }}>
      <div className="text-[11px] font-semibold" style={{ color: perigo ? '#b42318' : 'var(--rbr-muted)' }}>
        {perigo ? '▲ ' : ''}
        {rotulo}
      </div>
      <div className="text-[24px] leading-tight font-extrabold tabular-nums" style={{ color: perigo ? '#b42318' : 'var(--rbr-navy-dark)' }}>
        {valor}
      </div>
      {nota && (
        <div className="text-[11px]" style={{ color: 'var(--rbr-muted)' }}>
          {nota}
        </div>
      )}
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      {/* Cabeçalho */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[30px] leading-[1.1] text-[color:var(--rbr-navy-dark)]">
            {saudacao}
            {primeiroNome ? `, ${primeiroNome}` : ''}
          </h1>
          <div className="text-[13px] mt-1.5" style={{ color: '#4a5275' }}>
            {carregado ? (
              <>
                <b style={{ color: 'var(--rbr-navy-dark)' }}>{precisam === 0 ? 'Nada precisa de você agora.' : precisam === 1 ? '1 coisa precisa de você.' : `${precisam} coisas precisam de você.`}</b>
                {destaque ? ` ${destaque}` : painel ? ` Atualizado ${haQuanto(painel.gerado_em)}.` : ''}
              </>
            ) : (
              'Carregando…'
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5" role="group" aria-label="Ver o Início como">
            {FUNCOES_INICIO.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => escolherVisao(f.id)}
                aria-pressed={visao === f.id}
                className="text-[12px] font-bold px-3 py-1.5 rounded-full border"
                style={visao === f.id ? { background: '#fff', color: '#1c2559', borderColor: 'var(--rbr-border)', boxShadow: '0 1px 3px rgba(28,37,89,0.12)' } : { background: 'transparent', color: 'var(--rbr-muted)', borderColor: 'transparent' }}
              >
                {f.rotulo}
              </button>
            ))}
          </div>
          <button onClick={gerarResumo} disabled={gerandoResumo} className="text-xs font-bold px-4 py-2 rounded-xl border disabled:opacity-60 inline-flex items-center gap-2" style={{ borderColor: 'var(--rbr-border)', color: 'var(--rbr-navy)', background: '#fff' }}>
            <span style={{ color: 'var(--rbr-gold)' }}>✦</span>
            {gerandoResumo ? 'Escrevendo…' : 'Resumo do dia com IA'}
          </button>
        </div>
      </div>

      {blocos.atalhos.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {blocos.atalhos.map((a) => (
            <Link key={a.para} to={a.para} className="text-sm font-bold px-4 py-2 rounded-xl bg-white border" style={{ color: 'var(--rbr-navy-dark)', borderColor: 'var(--rbr-border)' }}>
              {a.rotulo}
            </Link>
          ))}
        </div>
      )}

      {(resumo || erroResumo) && (
        <section className="rounded-2xl px-5 py-4 flex items-start gap-4 bg-white border" style={{ borderColor: 'var(--rbr-border)' }}>
          <span className="text-lg leading-none mt-0.5" style={{ color: 'var(--rbr-gold)' }}>
            ✦
          </span>
          <div className="flex-1 min-w-0">
            {resumo && <p className="text-sm leading-relaxed text-[color:var(--rbr-navy-dark)]">{resumo.texto}</p>}
            {resumo && <div className="text-[11px] text-[color:var(--rbr-muted)] mt-1.5">Gerado {haQuanto(resumo.em)}</div>}
            {erroResumo && <p className="text-xs text-[color:var(--rbr-danger)]">{erroResumo}</p>}
          </div>
          <button
            onClick={() => {
              setResumo(null)
              setErroResumo(null)
            }}
            aria-label="Fechar resumo"
            className="text-[color:var(--rbr-muted)] text-sm"
          >
            ✕
          </button>
        </section>
      )}

      {erro && <div className="text-xs text-[color:var(--rbr-danger)]">Não foi possível atualizar: {erro}</div>}

      {/* Números do dia */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {kpi('Em andamento', op ? n(op.ativas) : '—', semSinal.length ? `${semSinal.length} sem sinal` : undefined)}
        {kpi('Motoristas online', op ? n(op.motoristas_online) : '—')}
        {kpi('Coletas hoje', op ? n(op.coletas_hoje) : '—')}
        {kpi('Entregas hoje', op ? n(op.entregas_hoje) : '—')}
        {kpi('Precisam de você', carregado ? precisam : '—', undefined, precisam > 0)}
      </div>

      {/* Mapa + Agora */}
      <div className={blocos.mapa ? 'grid lg:grid-cols-[minmax(0,1fr)_320px] gap-3.5' : 'grid gap-3.5'}>
        <section hidden={!blocos.mapa} className="relative rounded-[20px] overflow-hidden h-[400px] lg:h-[560px] border" style={{ background: '#e4e9f3', borderColor: 'var(--rbr-border)' }}>
          <FrotaMap pontos={pontos} tema="claro" height="100%" mostrarVazio rolagem selecionadoId={idSelecionadoNoMapa} onSelecionar={clicarNoMapa} linhas={linhas} foco={foco} />

          <div className="absolute top-4 left-4 z-[1000] flex gap-1 p-1 rounded-full" style={{ background: 'rgba(255,255,255,0.94)', boxShadow: '0 2px 10px rgba(28,37,89,0.12)' }}>
            {(
              [
                ['viagens', 'Viagens'],
                ['motoristas', 'Motoristas'],
                ['coletas', 'Coletas e entregas'],
              ] as [Aba, string][]
            ).map(([v, l]) => (
              <button key={v} onClick={() => setAba(v)} className="text-xs font-bold px-3.5 py-1.5 rounded-full transition-colors" style={aba === v ? { background: '#1c2559', color: '#fff' } : { color: '#4a5275' }}>
                {l}
              </button>
            ))}
          </div>

          <div className="absolute bottom-4 left-4 z-[1000] flex gap-3.5 px-3.5 py-2 rounded-full text-[11px] font-bold" style={{ background: 'rgba(255,255,255,0.94)', boxShadow: '0 2px 10px rgba(28,37,89,0.12)' }}>
            {(aba === 'viagens'
              ? [
                  [COR_SINAL.ok, 'Em dia'],
                  [COR_SINAL.atencao, 'Atrasado'],
                  [COR_SINAL.alerta, 'Sem sinal'],
                  ['#8A93A6', 'Parado'],
                ]
              : aba === 'motoristas'
                ? [
                    [COR_MOTORISTA, 'Em viagem'],
                    [COR_DISPONIVEL, 'Disponível'],
                  ]
                : [
                    [COR_COLETA, 'Coleta'],
                    [COR_ENTREGA, 'Entrega'],
                  ]
            ).map(([cor, t]) => (
              <span key={t} className="flex items-center gap-1.5" style={{ color: cor }}>
                <span className="w-2 h-2 rounded-full" style={{ background: cor }} />
                {t}
              </span>
            ))}
          </div>

          {semViagens && aba !== 'motoristas' && (
            <div className="absolute inset-0 z-[450] flex items-center justify-center pointer-events-none">
              <div className="text-center px-6 py-5 rounded-[20px]" style={{ background: 'rgba(255,255,255,0.92)', boxShadow: '0 2px 10px rgba(28,37,89,0.12)' }}>
                <div className="text-base font-semibold" style={{ color: 'var(--rbr-navy-dark)' }}>Nenhuma viagem em andamento hoje</div>
                <div className="text-xs mt-1" style={{ color: 'var(--rbr-muted)' }}>
                  {motoristas.length ? `${motoristas.length} motorista(s) parado(s) no mapa` : 'A frota aparece aqui assim que houver posição'}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Coluna "Agora" (ou detalhe do que foi clicado no mapa) */}
        <aside className="bg-white border rounded-[20px] flex flex-col lg:h-[560px] min-h-0 overflow-hidden" style={{ borderColor: 'var(--rbr-border)' }}>
          {viagemSel ? (
            <div className="p-5 flex flex-col gap-4 min-h-0 overflow-y-auto">
              <DetalheViagem c={viagemSel} onFechar={() => setSel(null)} />
            </div>
          ) : motoristaSel ? (
            <div className="p-5 flex flex-col gap-4 min-h-0 overflow-y-auto">
              <DetalheMotorista m={motoristaSel} onFechar={() => setSel(null)} />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-5 pt-4 pb-3">
                <div className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: 'var(--rbr-muted)' }}>
                  AGORA
                </div>
                {painel && (
                  <div className="text-[11px]" style={{ color: '#8a91ad' }}>
                    atualizado {haQuanto(painel.gerado_em)}
                  </div>
                )}
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto">
                {!carregado ? (
                  <div className="text-sm text-[color:var(--rbr-muted)] py-8 text-center">Carregando…</div>
                ) : precisam === 0 ? (
                  <div className="flex flex-col items-center justify-center text-center gap-1 py-12 px-6">
                    <div className="text-sm font-semibold text-[color:var(--rbr-navy-dark)]">Tudo em ordem agora</div>
                    <div className="text-xs text-[color:var(--rbr-muted)]">Quando algo precisar de você, aparece aqui.</div>
                  </div>
                ) : (
                  <>
                    {semSinal.map((c) => (
                      <div key={`s-${c.id}`} className="px-5 py-3 flex flex-col gap-1" style={{ borderTop: '1px solid #eef0f5' }}>
                        <div className="flex items-center gap-2 text-[14px] font-extrabold">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COR_SINAL.alerta }} />
                          Sem sinal{c.ultima ? ` ${haQuanto(c.ultima.em)}` : ''}
                        </div>
                        <div className="text-[12px]" style={{ color: 'var(--rbr-muted)' }}>
                          {c.origem} → {c.destino}
                          {c.motorista ? ` · ${c.motorista}` : ''}
                        </div>
                        <button type="button" onClick={() => setSel({ tipo: 'viagem', id: c.id })} className={botao} style={{ background: '#1c2559' }}>
                          Abrir serviço
                        </button>
                      </div>
                    ))}
                    {semMotorista.map((c) => (
                      <div key={`m-${c.id}`} className="px-5 py-3 flex flex-col gap-1" style={{ borderTop: '1px solid #eef0f5' }}>
                        <div className="flex items-center gap-2 text-[14px] font-extrabold">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COR_SINAL.alerta }} />
                          Sem motorista alocado
                        </div>
                        <div className="text-[12px]" style={{ color: 'var(--rbr-muted)' }}>
                          {c.origem} → {c.destino}
                        </div>
                        <Link to="/operacoes" className={botao} style={{ background: '#1c2559' }}>
                          Escolher motorista
                        </Link>
                      </div>
                    ))}
                    {naoLidos > 0 && (
                      <div className="px-5 py-3 flex flex-col gap-1" style={{ borderTop: '1px solid #eef0f5' }}>
                        <div className="flex items-center gap-2 text-[14px] font-extrabold">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COR_SINAL.atencao }} />
                          {naoLidos === 1 ? '1 aviso não lido' : `${naoLidos} avisos não lidos`}
                        </div>
                        <Link to="/avisos" className={botao} style={{ background: '#1c2559' }}>
                          Abrir central de avisos
                        </Link>
                      </div>
                    )}
                  </>
                )}
                {carregado && viagens.length > 0 && (
                  <div className="px-5 pt-4 pb-2" style={{ borderTop: '1px solid #eef0f5' }}>
                    <div className="text-[11px] font-extrabold tracking-[0.08em] mb-1" style={{ color: 'var(--rbr-muted)' }}>
                      VIAGENS EM ANDAMENTO
                    </div>
                    {viagens.map((c) => (
                      <button key={c.id} onClick={() => setSel({ tipo: 'viagem', id: c.id })} className="w-full text-left py-2 flex items-start gap-2.5">
                        <span className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: COR_SINAL[c.sinal ?? 'sem'] ?? COR_SINAL.sem }} />
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-bold text-[color:var(--rbr-navy-dark)] truncate">
                            {c.origem} → {c.destino}
                          </div>
                          <div className="text-[11px] truncate" style={{ color: 'var(--rbr-muted)' }}>
                            {c.motorista ?? 'Sem motorista'} · {STATUS_OPERACAO_LABEL[c.status] ?? c.status}
                          </div>
                        </div>
                        <div className="text-[11px] font-bold tabular-nums whitespace-nowrap">{previsaoChegada(c) ?? '—'}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Link to="/servicos" className="px-5 py-3.5 text-[12px] font-extrabold" style={{ color: '#1c2559' }}>
                Ver tudo em Serviços →
              </Link>
            </>
          )}
        </aside>
      </div>

      {/* Caixa e Comercial, pequenos */}
      <div className="grid md:grid-cols-2 gap-3.5">
        {blocos.caixa && <Mini
          titulo="Caixa"
          para="/financeiro"
          itens={[
            { rotulo: 'saldo nas contas', valor: caixa ? formatMoney(saldo) : '—', tom: minimo != null && minimo > 0 && saldo < minimo ? 'ruim' : undefined },
            { rotulo: 'previsão em 30 dias', valor: caixa ? formatMoney(projecao30) : '—', tom: projecao30 < 0 ? 'ruim' : undefined },
          ]}
        />}
        {blocos.comercial && <Mini
          titulo="Comercial"
          para="/cotacao"
          itens={[
            { rotulo: 'cotações no mês', valor: com ? String(n(com.cotacoes_mes)) : '—' },
            { rotulo: 'viraram carga', valor: conversao == null ? '—' : `${conversao}%` },
          ]}
        />}
      </div>
    </div>
  )
}
