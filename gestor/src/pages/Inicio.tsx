import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@rbr/shared/supabaseClient'
import { formatMoney, MOTIVO_PERDA_LABEL, STATUS_OPERACAO_LABEL } from '@rbr/shared/format'
import { linkWhatsApp } from '@rbr/shared/documento'
import FrotaMap, { type FrotaMapPonto } from '@rbr/shared/FrotaMap'

type Alerta = {
  nivel: 'vermelho' | 'amarelo'
  tipo: string
  titulo: string
  detalhe?: string | null
  link?: string | null
  qtd?: number
  valor?: number
  whatsapp?: string | null
}
type Painel = {
  gerado_em: string
  hoje: string
  alertas: Alerta[]
  operacao: {
    por_status: Record<string, number>
    ativas: number
    coletas_hoje: number
    entregas_hoje: number
    fechadas_mes: number
    motoristas_online: number
  }
  mapa: { id: string; lat: number; lng: number; capturado_em: string; fonte: string; nome: string; subtitulo: string }[]
  comercial: {
    cotacoes_mes: number
    convertidas_mes: number
    perdidas_mes: number
    abertas: number
    valor_aberto: number
    cotacoes_ant: number
    convertidas_ant: number
    motivo_perda_top: string | null
    receita_mes: number
    lucro_mes: number
    receita_ant: number
    lucro_ant: number
    operacoes_mes: number
  }
  caixa: {
    saldo_contas: number
    contas: number
    receber_7: number
    receber_30: number
    pagar_7: number
    pagar_30: number
    receber_vencido: number
    saldo_minimo: number | null
  }
}

const cardStyle = {
  borderColor: 'var(--rbr-border)',
  boxShadow: '0 1px 2px rgba(18,23,61,0.03), 0 6px 18px rgba(18,23,61,0.05)',
}
const ETAPAS = ['alocando_motorista', 'aguardando_liberacao_fiscal', 'liberada_coleta', 'carregando', 'em_transito', 'entregue'] as const
const ETAPA_CURTA: Record<string, string> = {
  alocando_motorista: 'Sem motorista',
  aguardando_liberacao_fiscal: 'Aguardando documentos',
  liberada_coleta: 'Liberada p/ coleta',
  carregando: 'Carregando',
  em_transito: 'Em trânsito',
  entregue: 'Entregue, sem fechar',
}
const ATUALIZAR_A_CADA_MS = 60_000

function n(v: unknown): number {
  const x = Number(v ?? 0)
  return Number.isFinite(x) ? x : 0
}
function variacao(atual: number, anterior: number): string | null {
  if (!anterior) return null
  const p = Math.round(((atual - anterior) / Math.abs(anterior)) * 100)
  return `${p >= 0 ? '+' : ''}${p}% vs mês passado`
}
function haQuanto(iso: string, agora: number): string {
  const s = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'agora'
  const m = Math.round(s / 60)
  return m < 60 ? `há ${m} min` : `há ${Math.round(m / 60)} h`
}

function Card({ titulo, acao, children }: { titulo: string; acao?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-white border rounded-[20px] p-[18px] flex flex-col gap-3" style={cardStyle}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">{titulo}</div>
        {acao}
      </div>
      {children}
    </section>
  )
}

function Numero({
  label,
  valor,
  sub,
  tom,
  to,
}: {
  label: string
  valor: string
  sub?: string | null
  tom?: 'ruim' | 'bom' | 'atencao'
  to?: string
}) {
  const cor = tom === 'ruim' ? 'var(--rbr-danger)' : tom === 'bom' ? '#137A45' : tom === 'atencao' ? '#B7791F' : 'var(--rbr-navy-dark)'
  const conteudo = (
    <div className="rounded-[14px] px-3.5 py-3 h-full" style={{ background: 'var(--rbr-muted-bg)' }}>
      <div className="text-[11px] font-semibold text-[color:var(--rbr-muted)]">{label}</div>
      <div className="text-xl font-bold mt-0.5 tabular-nums" style={{ color: cor }}>
        {valor}
      </div>
      {sub && <div className="text-[11px] text-[color:var(--rbr-muted)] mt-0.5">{sub}</div>}
    </div>
  )
  return to ? (
    <Link to={to} className="block hover:opacity-85 transition-opacity">
      {conteudo}
    </Link>
  ) : (
    conteudo
  )
}

export default function Inicio() {
  const [painel, setPainel] = useState<Painel | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [agora, setAgora] = useState(Date.now())
  const [resumo, setResumo] = useState<{ texto: string; em: string } | null>(null)
  const [gerandoResumo, setGerandoResumo] = useState(false)
  const [erroResumo, setErroResumo] = useState<string | null>(null)
  const [verTodos, setVerTodos] = useState(false)
  const carregando = useRef(false)

  const carregar = useCallback(async () => {
    if (carregando.current) return
    carregando.current = true
    const { data, error } = await supabase.rpc('painel_inicio')
    carregando.current = false
    if (error) {
      setErro(error.message)
      return
    }
    setErro(null)
    setPainel(data as unknown as Painel)
    setAgora(Date.now())
  }, [])

  // Atualiza sozinho a cada minuto enquanto a aba está visível (e ao voltar para ela).
  useEffect(() => {
    carregar()
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') carregar()
      else setAgora(Date.now())
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

  if (!painel) {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="rbr-display font-bold text-2xl md:text-3xl text-[color:var(--rbr-navy-dark)]">Início</h1>
        {erro ? (
          <div className="text-xs text-[color:var(--rbr-danger)] bg-white border rounded-[14px] p-3" style={{ borderColor: 'var(--rbr-border)' }}>
            {erro}
          </div>
        ) : (
          <div className="text-sm text-[color:var(--rbr-muted)] py-6 text-center">Carregando…</div>
        )}
      </div>
    )
  }

  const { alertas, operacao: op, comercial: com, caixa } = painel
  const ordenados = [...alertas].sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === 'vermelho' ? -1 : 1))
  const visiveis = verTodos ? ordenados : ordenados.slice(0, 8)
  const vermelhos = alertas.filter((a) => a.nivel === 'vermelho').length

  const conversao = com.cotacoes_mes ? Math.round((com.convertidas_mes / com.cotacoes_mes) * 100) : null
  const conversaoAnt = com.cotacoes_ant ? Math.round((com.convertidas_ant / com.cotacoes_ant) * 100) : null
  const margem = com.receita_mes ? Math.round((n(com.lucro_mes) / n(com.receita_mes)) * 1000) / 10 : null
  const saldo = n(caixa.saldo_contas)
  const projecao30 = saldo + n(caixa.receber_30) - n(caixa.pagar_30)
  const minimo = caixa.saldo_minimo != null ? n(caixa.saldo_minimo) : null

  const pontos: FrotaMapPonto[] = (painel.mapa ?? []).map((p) => ({
    id: p.id,
    lat: Number(p.lat),
    lng: Number(p.lng),
    nome: p.nome,
    subtitulo: p.subtitulo,
    capturadoEm: p.capturado_em,
    fonte: p.fonte === 'wialon' ? 'wialon' : 'app_celular',
  }))

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="rbr-display font-bold text-2xl md:text-3xl text-[color:var(--rbr-navy-dark)]">Início</h1>
          <div className="text-xs text-[color:var(--rbr-muted)] mt-0.5">
            {new Date(painel.hoje + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })} · atualizado{' '}
            {haQuanto(painel.gerado_em, agora)}
          </div>
        </div>
        <button onClick={carregar} className="text-xs font-bold px-3 py-1.5 rounded-lg border" style={{ borderColor: 'var(--rbr-border)', color: 'var(--rbr-navy)' }}>
          Atualizar agora
        </button>
      </div>

      {erro && (
        <div className="text-xs text-[color:var(--rbr-danger)] bg-white border rounded-[14px] p-3" style={{ borderColor: 'var(--rbr-border)' }}>
          Não foi possível atualizar: {erro}
        </div>
      )}

      {/* Resumo pela IA */}
      <section className="rounded-[20px] p-[18px] flex flex-col gap-2.5" style={{ background: 'var(--rbr-navy)', color: '#fff' }}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'rgba(255,255,255,.7)' }}>
            Resumo do dia
          </div>
          <button
            onClick={gerarResumo}
            disabled={gerandoResumo}
            className="text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-60"
            style={{ background: 'var(--rbr-gold)', color: 'var(--rbr-navy-dark)' }}
          >
            {gerandoResumo ? 'Escrevendo…' : resumo ? 'Gerar de novo' : 'Gerar resumo com IA'}
          </button>
        </div>
        {resumo ? (
          <>
            <p className="text-sm leading-relaxed">{resumo.texto}</p>
            <div className="text-[11px]" style={{ color: 'rgba(255,255,255,.6)' }}>
              Gerado {haQuanto(resumo.em, agora)} com base nos números abaixo.
            </div>
          </>
        ) : (
          <p className="text-sm" style={{ color: 'rgba(255,255,255,.85)' }}>
            {vermelhos > 0
              ? `${vermelhos} ponto(s) urgente(s) e ${alertas.length - vermelhos} para acompanhar hoje.`
              : alertas.length > 0
                ? `Nada urgente. ${alertas.length} ponto(s) para acompanhar.`
                : 'Dia tranquilo: nada pendente.'}{' '}
            Toque no botão para a IA resumir o dia em poucas linhas.
          </p>
        )}
        {erroResumo && <p className="text-xs" style={{ color: '#FFD2D2' }}>{erroResumo}</p>}
      </section>

      {/* Precisa de você agora */}
      <Card
        titulo={`Precisa de você agora${alertas.length ? ` (${alertas.length})` : ''}`}
        acao={
          alertas.length > 8 && (
            <button className="text-xs font-bold underline text-[color:var(--rbr-navy)]" onClick={() => setVerTodos((v) => !v)}>
              {verTodos ? 'Mostrar menos' : `Ver todos (${alertas.length})`}
            </button>
          )
        }
      >
        {alertas.length === 0 && (
          <div className="text-sm rounded-[14px] px-4 py-3" style={{ background: '#E7F6EE', color: '#137A45' }}>
            ✓ Nada pendente agora.
          </div>
        )}
        <div className="flex flex-col gap-2">
          {visiveis.map((a, i) => {
            const vermelho = a.nivel === 'vermelho'
            const corpo = (
              <div className="flex items-start gap-3 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5" style={{ background: vermelho ? 'var(--rbr-danger)' : '#D9A400' }} />
                <div className="min-w-0">
                  <div className="text-sm font-bold text-[color:var(--rbr-navy-dark)]">
                    {a.titulo}
                    {a.valor ? <span className="font-semibold text-[color:var(--rbr-muted)]"> · {formatMoney(a.valor)}</span> : null}
                  </div>
                  {a.detalhe && <div className="text-xs text-[color:var(--rbr-muted)] break-words">{a.detalhe}</div>}
                </div>
              </div>
            )
            return (
              <div
                key={a.tipo + i}
                className="flex items-center justify-between gap-3 rounded-[14px] px-3.5 py-2.5 border"
                style={{ borderColor: vermelho ? '#F4C9C9' : 'var(--rbr-border)', background: vermelho ? '#FDF3F3' : '#fff' }}
              >
                {a.link ? (
                  <Link to={a.link} className="flex-1 min-w-0 hover:opacity-80">
                    {corpo}
                  </Link>
                ) : (
                  <div className="flex-1 min-w-0">{corpo}</div>
                )}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {a.whatsapp && (
                    <a
                      href={linkWhatsApp(a.whatsapp, 'Olá! Aqui é da RBR Cargo. Não estamos recebendo sua localização no app — pode abrir o app da RBR, por favor?')}
                      target="_blank"
                      rel="noopener"
                      className="text-xs font-bold px-2.5 py-1 rounded-lg border"
                      style={{ borderColor: 'var(--rbr-border)', color: 'var(--rbr-navy)' }}
                    >
                      WhatsApp
                    </a>
                  )}
                  {a.link && (
                    <Link to={a.link} className="text-xs font-bold text-[color:var(--rbr-navy)]">
                      Abrir →
                    </Link>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Operação do dia */}
      <Card titulo="Operação" acao={<Link to="/operacoes" className="text-xs font-bold text-[color:var(--rbr-navy)]">Ver operações →</Link>}>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
          {ETAPAS.map((s) => {
            const q = n(op.por_status?.[s])
            return (
              <Numero
                key={s}
                label={ETAPA_CURTA[s] ?? STATUS_OPERACAO_LABEL[s]}
                valor={String(q)}
                to={`/operacoes?status=${s}`}
                tom={q > 0 && (s === 'alocando_motorista' || s === 'entregue') ? 'atencao' : undefined}
              />
            )
          })}
        </div>
        <div className="text-xs text-[color:var(--rbr-muted)] flex flex-wrap gap-x-5 gap-y-1">
          <span>
            <b className="text-[color:var(--rbr-navy-dark)]">{op.ativas}</b> em andamento
          </span>
          <span>
            <b className="text-[color:var(--rbr-navy-dark)]">{op.coletas_hoje}</b> coleta(s) hoje
          </span>
          <span>
            <b className="text-[color:var(--rbr-navy-dark)]">{op.entregas_hoje}</b> entrega(s) hoje
          </span>
          <span>
            <b className="text-[color:var(--rbr-navy-dark)]">{op.fechadas_mes}</b> fechada(s) no mês
          </span>
          <span>
            <b className="text-[color:var(--rbr-navy-dark)]">{op.motoristas_online}</b> motorista(s) online
          </span>
        </div>
        <div className="rounded-[14px] overflow-hidden border" style={{ borderColor: 'var(--rbr-border)' }}>
          {pontos.length > 0 ? (
            <FrotaMap pontos={pontos} height={260} />
          ) : (
            <div className="text-xs text-[color:var(--rbr-muted)] px-4 py-6 text-center">Nenhuma carga em andamento com posição recebida.</div>
          )}
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-5">
        {/* Comercial */}
        <Card titulo="Comercial do mês" acao={<Link to="/cotacao" className="text-xs font-bold text-[color:var(--rbr-navy)]">Cotações →</Link>}>
          <div className="grid grid-cols-2 gap-2.5">
            <Numero label="Cotações" valor={String(com.cotacoes_mes)} sub={variacao(com.cotacoes_mes, com.cotacoes_ant)} />
            <Numero
              label="Viraram carga"
              valor={conversao == null ? '—' : `${conversao}%`}
              sub={`${com.convertidas_mes} de ${com.cotacoes_mes}${conversaoAnt != null ? ` · mês passado ${conversaoAnt}%` : ''}`}
              tom={conversao != null && conversaoAnt != null ? (conversao >= conversaoAnt ? 'bom' : 'ruim') : undefined}
            />
            <Numero label="Faturamento" valor={formatMoney(n(com.receita_mes))} sub={variacao(n(com.receita_mes), n(com.receita_ant)) ?? `${com.operacoes_mes} operação(ões)`} />
            <Numero
              label="Lucro"
              valor={formatMoney(n(com.lucro_mes))}
              sub={[margem != null ? `margem ${margem}%` : null, variacao(n(com.lucro_mes), n(com.lucro_ant))].filter(Boolean).join(' · ')}
              tom={n(com.lucro_mes) < 0 ? 'ruim' : undefined}
            />
          </div>
          <div className="text-xs text-[color:var(--rbr-muted)] flex flex-col gap-1">
            <span>
              {com.abertas} cotação(ões) em aberto{n(com.valor_aberto) > 0 ? ` · ${formatMoney(n(com.valor_aberto))} enviados esperando resposta` : ''}
            </span>
            <span>
              {com.perdidas_mes} perdida(s) no mês
              {com.motivo_perda_top ? ` · principal motivo: ${MOTIVO_PERDA_LABEL[com.motivo_perda_top] ?? com.motivo_perda_top}` : ''}
            </span>
            <span className="text-[11px]">Faturamento e lucro das operações abertas no mês (previsto até fechar; real depois de fechada).</span>
          </div>
        </Card>

        {/* Caixa */}
        <Card titulo="Caixa" acao={<Link to="/financeiro" className="text-xs font-bold text-[color:var(--rbr-navy)]">Financeiro →</Link>}>
          <div className="grid grid-cols-2 gap-2.5">
            <Numero
              label="Saldo nas contas"
              valor={formatMoney(saldo)}
              sub={`${caixa.contas} conta(s)${minimo ? ` · mínimo ${formatMoney(minimo)}` : ''}`}
              tom={minimo != null && minimo > 0 && saldo < minimo ? 'ruim' : undefined}
              to="/financeiro"
            />
            <Numero
              label="Previsão em 30 dias"
              valor={formatMoney(projecao30)}
              sub="saldo + a receber − a pagar"
              tom={projecao30 < 0 || (minimo != null && minimo > 0 && projecao30 < minimo) ? 'ruim' : 'bom'}
              to="/financeiro"
            />
            <Numero label="A receber" valor={formatMoney(n(caixa.receber_7))} sub={`7 dias · 30 dias: ${formatMoney(n(caixa.receber_30))}`} to="/financeiro?aba=receber" />
            <Numero label="A pagar" valor={formatMoney(n(caixa.pagar_7))} sub={`7 dias · 30 dias: ${formatMoney(n(caixa.pagar_30))}`} to="/financeiro?aba=pagar" />
          </div>
          {n(caixa.receber_vencido) > 0 && (
            <Link to="/financeiro?aba=receber" className="text-xs font-bold" style={{ color: 'var(--rbr-danger)' }}>
              {formatMoney(n(caixa.receber_vencido))} vencido para receber →
            </Link>
          )}
        </Card>
      </div>
    </div>
  )
}
