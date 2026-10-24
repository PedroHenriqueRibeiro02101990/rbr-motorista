import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@rbr/shared/supabaseClient'
import { formatMoney, STATUS_OPERACAO_LABEL } from '@rbr/shared/format'
import FrotaMap, { type FrotaMapLinha, type FrotaMapPonto } from '@rbr/shared/FrotaMap'
import { COR_SINAL, type CargaMapa, type MotoristaMapa } from '../components/mapa/MapaOperacional'
import { DetalheMotorista, DetalheViagem } from '../components/inicio/DetalheViagem'
import { haQuanto, previsaoChegada } from '../components/inicio/util'

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

function NumeroDia({ valor, rotulo }: { valor: number | string; rotulo: string }) {
  return (
    <div>
      <div className="rbr-display text-[28px] leading-none font-semibold tabular-nums text-[color:var(--rbr-navy-dark)]">{valor}</div>
      <div className="text-[11px] text-[color:var(--rbr-muted)] mt-1.5">{rotulo}</div>
    </div>
  )
}

function Mini({ titulo, para, itens }: { titulo: string; para: string; itens: { rotulo: string; valor: string; tom?: 'ruim' }[] }) {
  return (
    <Link to={para} className="bg-white border rounded-[20px] px-5 py-4 flex items-center gap-6 hover:opacity-90 transition-opacity" style={cardStyle}>
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

export default function Inicio() {
  const [painel, setPainel] = useState<Painel | null>(null)
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

  return (
    <div className="flex flex-col gap-6">
      {/* Cabeçalho */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="rbr-display font-bold text-2xl md:text-3xl text-[color:var(--rbr-navy-dark)]">Início</h1>
          <div className="text-xs text-[color:var(--rbr-muted)] mt-1 flex items-center gap-2">
            <span className="relative flex w-2 h-2">
              <span className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping" style={{ background: 'var(--rbr-positive)' }} />
              <span className="relative inline-flex w-2 h-2 rounded-full" style={{ background: 'var(--rbr-positive)' }} />
            </span>
            {painel
              ? `${new Date(painel.hoje + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })} · ao vivo, atualizado ${haQuanto(painel.gerado_em)}`
              : 'ao vivo'}
          </div>
        </div>
        <button
          onClick={gerarResumo}
          disabled={gerandoResumo}
          className="text-xs font-bold px-4 py-2 rounded-xl border disabled:opacity-60 inline-flex items-center gap-2"
          style={{ borderColor: 'var(--rbr-border)', color: 'var(--rbr-navy)', background: '#fff' }}
        >
          <span style={{ color: 'var(--rbr-gold)' }}>✦</span>
          {gerandoResumo ? 'Escrevendo…' : 'Resumo do dia com IA'}
        </button>
      </div>

      {(resumo || erroResumo) && (
        <section className="rounded-[20px] px-5 py-4 flex items-start gap-4" style={{ background: 'var(--rbr-navy-tint)' }}>
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

      {/* Mapa + Hoje */}
      <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] gap-5">
        <section className="relative rounded-[24px] overflow-hidden h-[400px] lg:h-[620px] border" style={{ background: '#F7F8FB', borderColor: 'var(--rbr-border)', boxShadow: '0 12px 40px rgba(30,39,97,0.10)' }}>
          <FrotaMap
            pontos={pontos}
            tema="claro"
            height="100%"
            mostrarVazio
            rolagem
            selecionadoId={idSelecionadoNoMapa}
            onSelecionar={clicarNoMapa}
            linhas={linhas}
            foco={foco}
          />

          {/* Abas por cima do mapa */}
          <div className="absolute top-4 left-4 z-[1000] flex gap-1 p-1 rounded-full" style={{ background: 'rgba(255,255,255,0.92)', boxShadow: '0 2px 10px rgba(30,39,97,0.12)', backdropFilter: 'blur(8px)' }}>
            {(
              [
                ['viagens', 'Viagens'],
                ['motoristas', 'Motoristas'],
                ['coletas', 'Coletas e entregas'],
              ] as [Aba, string][]
            ).map(([v, l]) => (
              <button
                key={v}
                onClick={() => setAba(v)}
                className="text-xs font-semibold px-3.5 py-1.5 rounded-full transition-colors"
                style={aba === v ? { background: 'var(--rbr-navy)', color: '#fff' } : { color: 'var(--rbr-muted)' }}
              >
                {l}
              </button>
            ))}
          </div>

          {/* Legenda discreta */}
          <div className="absolute bottom-4 left-4 z-[1000] flex gap-3.5 px-3.5 py-2 rounded-full text-[11px]" style={{ background: 'rgba(255,255,255,0.92)', color: 'var(--rbr-muted)', boxShadow: '0 2px 10px rgba(30,39,97,0.12)', backdropFilter: 'blur(8px)' }}>
            {(aba === 'viagens'
              ? [
                  [COR_SINAL.ok, 'Sinal em dia'],
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
              <span key={t} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: cor }} />
                {t}
              </span>
            ))}
          </div>

          {semViagens && aba !== 'motoristas' && (
            <div className="absolute inset-0 z-[450] flex items-center justify-center pointer-events-none">
              <div className="text-center px-6 py-5 rounded-[20px]" style={{ background: 'rgba(255,255,255,0.92)', boxShadow: '0 2px 10px rgba(30,39,97,0.12)', backdropFilter: 'blur(6px)' }}>
                <div className="text-base font-semibold" style={{ color: 'var(--rbr-navy-dark)' }}>Nenhuma viagem em andamento hoje</div>
                <div className="text-xs mt-1" style={{ color: 'var(--rbr-muted)' }}>
                  {motoristas.length ? `${motoristas.length} motorista(s) parado(s) no mapa` : 'A frota aparece aqui assim que houver posição'}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Coluna Hoje (ou detalhe do que foi clicado) */}
        <aside className="bg-white border rounded-[24px] p-6 flex flex-col gap-6 lg:h-[620px] min-h-0" style={cardStyle}>
          {viagemSel ? (
            <DetalheViagem c={viagemSel} onFechar={() => setSel(null)} />
          ) : motoristaSel ? (
            <DetalheMotorista m={motoristaSel} onFechar={() => setSel(null)} />
          ) : (
            <>
              <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] -mb-2">Hoje</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-5">
                <NumeroDia valor={op ? n(op.ativas) : '—'} rotulo="em andamento" />
                <NumeroDia valor={op ? n(op.motoristas_online) : '—'} rotulo="motoristas online" />
                <NumeroDia valor={op ? n(op.coletas_hoje) : '—'} rotulo="coletas hoje" />
                <NumeroDia valor={op ? n(op.entregas_hoje) : '—'} rotulo="entregas hoje" />
              </div>

              <div className="h-px" style={{ background: 'var(--rbr-border)' }} />

              <div className="flex flex-col gap-1 min-h-0 flex-1">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">Viagens em andamento</div>
                  <Link to="/mapa" className="text-[11px] font-semibold text-[color:var(--rbr-navy)]">
                    Mapa completo →
                  </Link>
                </div>
                {!carregado ? (
                  <div className="text-sm text-[color:var(--rbr-muted)] py-8 text-center">Carregando…</div>
                ) : viagens.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 py-10">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl" style={{ background: 'var(--rbr-navy-tint)', color: 'var(--rbr-navy)' }}>
                      ⛟
                    </div>
                    <div className="text-sm font-semibold text-[color:var(--rbr-navy-dark)]">Nenhuma viagem em andamento hoje</div>
                    <div className="text-xs text-[color:var(--rbr-muted)]">Quando uma carga sair, ela aparece aqui.</div>
                  </div>
                ) : (
                  <div className="flex flex-col -mx-2 overflow-y-auto min-h-0">
                    {viagens.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setSel({ tipo: 'viagem', id: c.id })}
                        className="text-left px-2 py-3 rounded-xl hover:bg-[color:var(--rbr-navy-tint)] transition-colors flex items-start gap-3"
                      >
                        <span className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: COR_SINAL[c.sinal ?? 'sem'] ?? COR_SINAL.sem }} />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-[color:var(--rbr-navy-dark)] truncate">
                            {c.origem} → {c.destino}
                          </div>
                          <div className="text-xs text-[color:var(--rbr-muted)] truncate">
                            {c.motorista ?? 'Sem motorista'} · {STATUS_OPERACAO_LABEL[c.status] ?? c.status}
                          </div>
                        </div>
                        <div className="text-xs font-semibold text-[color:var(--rbr-navy-dark)] tabular-nums whitespace-nowrap">{previsaoChegada(c) ?? '—'}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </aside>
      </div>

      {/* Caixa e Comercial, pequenos */}
      <div className="grid md:grid-cols-2 gap-5">
        <Mini
          titulo="Caixa"
          para="/financeiro"
          itens={[
            { rotulo: 'saldo nas contas', valor: caixa ? formatMoney(saldo) : '—', tom: minimo != null && minimo > 0 && saldo < minimo ? 'ruim' : undefined },
            { rotulo: 'previsão em 30 dias', valor: caixa ? formatMoney(projecao30) : '—', tom: projecao30 < 0 ? 'ruim' : undefined },
          ]}
        />
        <Mini
          titulo="Comercial"
          para="/cotacao"
          itens={[
            { rotulo: 'cotações no mês', valor: com ? String(n(com.cotacoes_mes)) : '—' },
            { rotulo: 'viraram carga', valor: conversao == null ? '—' : `${conversao}%` },
          ]}
        />
      </div>
    </div>
  )
}
