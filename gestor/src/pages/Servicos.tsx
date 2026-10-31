import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@rbr/shared/supabaseClient'
import { formatMoney, STATUS_OPERACAO_LABEL } from '@rbr/shared/format'
import { haQuanto } from '../components/inicio/util'
import { faixaDaMargem } from '../components/cotacao/PrecoVisual'

// Serviços (visuais aprovados "Servicos", "Margem" e "Funil"): uma lista só com o que está andando, separada por etapa.
// Cada linha leva à tela de verdade (Cotação, Operações ou Fiscal); a lógica de cada uma continua lá.
// Margem, lucro e para onde vai o dinheiro só aparecem para o gestor.
type Etapa = 'cotacao' | 'operacao' | 'fiscal'
type Dot = 'feito' | 'andamento' | 'travado' | 'fazer'
type Cot = {
  id: string
  status: string
  cidade_origem: string | null
  cidade_destino: string | null
  origem: string
  valor_total: number | null
  valor_frete_motorista: number | null
  pedagio: number | null
  valor_imposto: number | null
  custo_financeiro: number | null
  lucro_rbr: number | null
  margem_ajustada: number | null
  nf_chave_acesso: string | null
  cliente_id: string | null
  eh_teste: boolean
  created_at: string
  updated_at: string
}
type Op = { id: string; status: string; cotacao_id: string | null; cliente_id: string | null; eh_teste: boolean; updated_at: string }
type Cli = { id: string; razao_social: string | null; nome_fantasia: string | null }
type Doc = { operacao_id: string; tipo: string; status: string }
type Linha = { id: string; etapa: Etapa; cliente: string; rota: string; nota: string; valor: number | null; teste: boolean; para: string; cot?: Cot; dots: Dot[] }

const ROTULO: Record<Etapa, string> = { cotacao: 'Cotação', operacao: 'Operação', fiscal: 'Fiscal' }
const COR: Record<Etapa, { bg: string; fg: string }> = {
  cotacao: { bg: '#fff0d6', fg: '#7a5200' },
  operacao: { bg: '#d6ecdf', fg: '#1a6b3c' },
  fiscal: { bg: '#dfe3f5', fg: '#1c2559' },
}
const FISCAL = new Set(['aguardando_liberacao_fiscal', 'em_emissao', 'devolvida_pelo_fiscal'])
const ENCERRADAS = ['fechada', 'cancelada', 'finalizada', 'entregue']
const COLS_COT = 'id, status, cidade_origem, cidade_destino, origem, valor_total, valor_frete_motorista, pedagio, valor_imposto, custo_financeiro, lucro_rbr, margem_ajustada, nf_chave_acesso, cliente_id, eh_teste, created_at, updated_at'
const ESTEIRA = ['Notas', 'CT-e', 'Averbação', 'Pedágio', 'CIOT', 'MDF-e']
const COR_DOT: Record<Dot, string> = { feito: '#1a9b57', andamento: '#e0a21c', travado: '#d64545', fazer: '#cfd5e6' }

const dotDoc = (docs: Doc[], tipo: string): Dot => {
  const d = docs.find((x) => x.tipo === tipo)
  if (!d) return 'fazer'
  if (d.status === 'emitido') return 'feito'
  if (d.status === 'erro' || d.status === 'bloqueado') return 'travado'
  return 'andamento'
}

function PilulaMargem({ m }: { m: number | null }) {
  const f = faixaDaMargem(m)
  if (m == null) return <span style={{ color: '#8a91ad' }}>—</span>
  return (
    <span className="text-[12px] font-extrabold rounded-full px-2.5 py-1 whitespace-nowrap" style={{ background: f.fundo, color: f.cor }}>
      {f.nome === 'vermelho' ? '▼ ' : f.nome === 'verde' ? '▲ ' : '● '}
      {(m * 100).toFixed(1).replace('.', ',')}%
    </span>
  )
}

type CardFunil = { id: string; status: string; cliente: string; rota: string; valor: number; idade: string; margem: number | null }
const COLUNAS: { status: string; rotulo: string; cor: string; vazio?: string }[] = [
  { status: 'rascunho', rotulo: 'RASCUNHO', cor: '#8a93a6' },
  { status: 'aguardando_gestor', rotulo: 'AGUARDANDO GESTOR', cor: '#e0a21c', vazio: 'Ainda não disponível: o pedido de aprovação de preço não existe no sistema.' },
  { status: 'enviada', rotulo: 'ENVIADA', cor: '#1c2559' },
  { status: 'convertida', rotulo: 'APROVADA', cor: '#1a9b57' },
  { status: 'perdida', rotulo: 'PERDIDA OU EXPIRADA', cor: '#d64545' },
]

function Funil({ gestor }: { gestor: boolean }) {
  const nav = useNavigate()
  const [cards, setCards] = useState<CardFunil[] | null>(null)
  useEffect(() => {
    let vivo = true
    void (async () => {
      const { data } = await supabase.from('cotacoes').select(COLS_COT).in('status', ['rascunho', 'enviada', 'convertida', 'perdida']).is('cancelada_em', null).eq('eh_teste', false).order('updated_at', { ascending: false }).limit(300)
      const cots = (data ?? []) as unknown as Cot[]
      const ids = [...new Set(cots.map((k) => k.cliente_id).filter((x): x is string => !!x))]
      const clis = ids.length ? (((await supabase.from('clientes').select('id, razao_social, nome_fantasia').in('id', ids)).data ?? []) as unknown as Cli[]) : []
      const nome = new Map(clis.map((k) => [k.id, k.nome_fantasia || k.razao_social || 'Cliente']))
      if (vivo)
        setCards(
          cots.map((k) => ({
            id: k.id,
            status: k.status,
            cliente: nome.get(k.cliente_id ?? '') ?? 'Cliente',
            rota: `${k.cidade_origem ?? k.origem} → ${k.cidade_destino ?? '—'}`,
            valor: Number(k.valor_total ?? 0),
            idade: haQuanto(k.updated_at).replace(/^há /, ''),
            margem: k.margem_ajustada,
          })),
        )
    })()
    return () => {
      vivo = false
    }
  }, [])
  if (cards === null) return <div className="p-8 text-center text-sm text-[color:var(--rbr-muted)]">Carregando…</div>
  const aberto = cards.filter((c) => c.status === 'rascunho' || c.status === 'enviada').reduce((a, c) => a + c.valor, 0)
  const aprov = cards.filter((c) => c.status === 'convertida').length
  const decididas = aprov + cards.filter((c) => c.status === 'perdida').length
  const taxa = decididas ? Math.round((aprov / decididas) * 100) : null
  return (
    <>
      <div className="text-[13px]" style={{ color: '#4a5275' }}>
        Funil das cotações · <b style={{ color: 'var(--rbr-navy-dark)' }}>{formatMoney(aberto)}</b> em aberto
        {taxa != null ? (
          <>
            {' '}
            · aprovação de <b style={{ color: 'var(--rbr-navy-dark)' }}>{taxa}%</b>
          </>
        ) : (
          ''
        )}
      </div>
      <div className="flex p-1 rounded-xl self-start" style={{ background: '#e9ecf4' }} role="group" aria-label="De quem">
        {['Minhas', 'Equipe', 'Por vendedor ▾'].map((l, i) => (
          <button key={l} type="button" disabled title="Ainda não disponível: a cotação não guarda quem é o vendedor" className="text-[13px] font-bold px-4 py-1.5 rounded-lg cursor-not-allowed" style={i === 1 ? { background: '#1c2559', color: '#fff', opacity: 0.55 } : { color: '#8a91ad' }}>
            {l}
          </button>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5 items-start">
        {COLUNAS.map((col) => {
          const doCol = cards.filter((c) => c.status === col.status)
          return (
            <div key={col.status} className="rounded-2xl p-2.5 flex flex-col gap-2 min-h-[200px]" style={{ background: '#e9ecf4' }}>
              <div className="flex items-center justify-between px-1.5 pt-1 text-[11px] font-extrabold" style={{ color: '#4a5275' }}>
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: col.cor }} />
                  {col.rotulo}
                </span>
                <span>{doCol.length}</span>
              </div>
              {col.vazio && <div className="text-[11px] px-1.5" style={{ color: '#8a91ad' }}>{col.vazio}</div>}
              {doCol.slice(0, 6).map((c) => {
                const f = faixaDaMargem(c.margem)
                return (
                  <button key={c.id} type="button" onClick={() => nav('/cotacao')} className="text-left bg-white rounded-xl px-3 py-2.5 shadow-[0_1px_2px_rgba(28,37,89,0.08)]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-extrabold truncate">{c.cliente}</span>
                      {gestor && c.margem != null && <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" title={`Margem ${(c.margem * 100).toFixed(1)}%`} style={{ background: f.nome === 'verde' ? '#1a9b57' : f.nome === 'amarelo' ? '#e0a21c' : '#d64545' }} />}
                    </div>
                    <div className="text-[11px] truncate" style={{ color: 'var(--rbr-muted)' }}>
                      {c.rota}
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[14px] font-extrabold tabular-nums">{formatMoney(c.valor)}</span>
                      <span className="flex items-center gap-1.5 text-[10px]" style={{ color: '#8a91ad' }}>
                        {c.idade}
                        <span className="w-5 h-5 rounded-full inline-flex items-center justify-center text-[9px] font-extrabold" title="Vendedor ainda não registrado na cotação" style={{ background: '#e9ecf4', color: '#8a91ad' }}>
                          ?
                        </span>
                      </span>
                    </div>
                  </button>
                )
              })}
              {doCol.length > 6 && (
                <div className="text-[12px] px-1.5" style={{ color: '#8a91ad' }}>
                  + {doCol.length - 6} cotações
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="text-[11px]" style={{ color: '#8a91ad' }}>
        Bolinha: cor da margem (gestor). Arrastar o cartão para mudar de etapa ainda não está disponível: a etapa muda dentro da cotação. Testes ficam de fora.
      </div>
    </>
  )
}

function ParaOndeVai({ l, onAbrir }: { l: Linha; onAbrir: () => void }) {
  const k = l.cot
  const total = Number(k?.valor_total ?? 0)
  const motorista = Number(k?.valor_frete_motorista ?? 0)
  const impostos = Number(k?.valor_imposto ?? 0)
  const pedagio = Number(k?.pedagio ?? 0)
  const capital = Number(k?.custo_financeiro ?? 0)
  const lucro = Number(k?.lucro_rbr ?? 0)
  const fatias = [
    { rotulo: 'Motorista', v: motorista, cor: '#7f86bd' },
    { rotulo: 'Impostos', v: impostos, cor: '#b8863b' },
    { rotulo: 'Pedágio (VPO)', v: pedagio, cor: '#dcbf85' },
    { rotulo: 'Custo do capital', v: capital, cor: '#9aa0bd' },
  ]
  const m = k?.margem_ajustada ?? null
  const f = faixaDaMargem(m)
  // Estimativa simples: se o frete do motorista subir 10%, o lucro cai esse valor (o imposto não é recalculado aqui).
  const sobe = motorista * 0.1
  const mSimul = total > 0 ? (lucro - sobe) / total : null
  return (
    <aside className="bg-white border rounded-2xl p-5 flex flex-col gap-3 lg:sticky lg:top-4 self-start" style={{ borderColor: 'var(--rbr-border)' }}>
      <div className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: 'var(--rbr-muted)' }}>
        PARA ONDE VAI O DINHEIRO
      </div>
      <div className="text-[15px] font-extrabold">
        {l.cliente} · {l.rota}
      </div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-[34px] font-extrabold leading-none tabular-nums" style={{ color: f.cor }}>
          {formatMoney(lucro)}
        </span>
        {m != null && (
          <span className="text-[13px] font-extrabold" style={{ color: f.cor }}>
            {(m * 100).toFixed(1).replace('.', ',')}% de margem
          </span>
        )}
      </div>
      {total > 0 && (
        <div className="flex h-8 rounded-md overflow-hidden" aria-hidden>
          {[...fatias, { rotulo: 'Margem', v: lucro, cor: '#1a9b57' }].map((x) => (
            <span key={x.rotulo} style={{ width: `${Math.max(0, (x.v / total) * 100)}%`, background: x.cor }} />
          ))}
        </div>
      )}
      <div className="flex flex-col gap-1.5 text-[13px]">
        {fatias.map((x) => (
          <div key={x.rotulo} className="flex items-center justify-between">
            <span className="flex items-center gap-2" style={{ color: '#4a5275' }}>
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: x.cor }} />
              {x.rotulo}
            </span>
            <span className="font-extrabold tabular-nums">{formatMoney(x.v)}</span>
          </div>
        ))}
        <div className="flex items-center justify-between pt-1.5 border-t" style={{ borderColor: '#eef0f5' }}>
          <span className="flex items-center gap-2 font-extrabold">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#1a9b57' }} />
            Margem da RBR
          </span>
          <span className="font-extrabold tabular-nums" style={{ color: '#1a6b3c' }}>
            {formatMoney(lucro)}
          </span>
        </div>
      </div>
      {mSimul != null && sobe > 0 && (
        <div className="text-[12px] rounded-xl px-3 py-2.5" style={{ background: '#f3f5f9', color: '#4a5275' }}>
          Se o motorista subir 10% (para {formatMoney(motorista + sobe)}), a margem cai para <b style={{ color: faixaDaMargem(mSimul).cor }}>{(mSimul * 100).toFixed(1).replace('.', ',')}%</b> (estimativa, sem refazer o imposto).
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onAbrir} className="text-[13px] font-bold px-4 py-2.5 rounded-xl text-white" style={{ background: '#1c2559' }}>
          Abrir serviço
        </button>
        <button type="button" disabled title="Ainda não disponível" className="text-[13px] font-bold px-4 py-2.5 rounded-xl border opacity-50 cursor-not-allowed" style={{ borderColor: 'var(--rbr-border)', color: '#1c2559' }}>
          Simular preço
        </button>
      </div>
    </aside>
  )
}

export default function Servicos() {
  const nav = useNavigate()
  const [linhas, setLinhas] = useState<Linha[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<'todos' | Etapa>('todos')
  const [busca, setBusca] = useState('')
  const [testes, setTestes] = useState(false)
  const [pagina, setPagina] = useState(0)
  const [visao, setVisao] = useState<'lista' | 'funil'>('lista')
  const [papel, setPapel] = useState<string | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const gestor = papel === 'gestor_rbr'

  useEffect(() => {
    void supabase.rpc('current_papel').then(({ data }) => setPapel((data as unknown as string) ?? null))
  }, [])

  useEffect(() => {
    let vivo = true
    void (async () => {
      const [c, o] = await Promise.all([
        supabase.from('cotacoes').select(COLS_COT).in('status', ['rascunho', 'enviada']).is('cancelada_em', null).order('updated_at', { ascending: false }).limit(200),
        supabase.from('operacoes').select('id, status, cotacao_id, cliente_id, eh_teste, updated_at').not('status', 'in', `(${ENCERRADAS.join(',')})`).is('deleted_at', null).order('updated_at', { ascending: false }).limit(200),
      ])
      if (!vivo) return
      if (c.error || o.error) {
        setErro('Não consegui carregar os serviços agora. Tente de novo em instantes.')
        return setLinhas([])
      }
      const cots = (c.data ?? []) as unknown as Cot[]
      const ops = (o.data ?? []) as unknown as Op[]
      const idsCot = [...new Set(ops.map((x) => x.cotacao_id).filter((x): x is string => !!x && !cots.some((k) => k.id === x)))]
      const extra = idsCot.length ? (((await supabase.from('cotacoes').select(COLS_COT).in('id', idsCot)).data ?? []) as unknown as Cot[]) : []
      const porCot = new Map([...cots, ...extra].map((k) => [k.id, k]))
      const idsCli = [...new Set([...cots, ...extra].map((k) => k.cliente_id).concat(ops.map((x) => x.cliente_id)).filter((x): x is string => !!x))]
      const clis = idsCli.length ? (((await supabase.from('clientes').select('id, razao_social, nome_fantasia').in('id', idsCli)).data ?? []) as unknown as Cli[]) : []
      const nomeCli = new Map(clis.map((k) => [k.id, k.nome_fantasia || k.razao_social || 'Cliente']))
      const docs = ops.length ? (((await supabase.from('documentacao_operacao').select('operacao_id, tipo, status').in('operacao_id', ops.map((x) => x.id))).data ?? []) as unknown as Doc[]) : []
      const rota = (k?: Cot) => (k ? `${k.cidade_origem ?? k.origem} → ${k.cidade_destino ?? '—'}` : '—')
      const saida: Linha[] = [
        ...ops.map((x): Linha => {
          const k = x.cotacao_id ? porCot.get(x.cotacao_id) : undefined
          const fiscal = FISCAL.has(x.status)
          const d = docs.filter((y) => y.operacao_id === x.id)
          return {
            id: x.id,
            etapa: fiscal ? 'fiscal' : 'operacao',
            cliente: nomeCli.get(x.cliente_id ?? k?.cliente_id ?? '') ?? 'Cliente',
            rota: rota(k),
            nota: STATUS_OPERACAO_LABEL[x.status] ?? x.status,
            valor: k?.valor_total ?? null,
            teste: x.eh_teste,
            para: fiscal ? '/fiscal' : '/operacoes',
            cot: k,
            dots: [k?.nf_chave_acesso ? 'feito' : 'fazer', dotDoc(d, 'cte'), dotDoc(d, 'atm'), 'fazer', dotDoc(d, 'ciot'), dotDoc(d, 'mdfe')],
          }
        }),
        ...cots
          .filter((k) => !ops.some((x) => x.cotacao_id === k.id))
          .map(
            (k): Linha => ({
              id: k.id,
              etapa: 'cotacao',
              cliente: nomeCli.get(k.cliente_id ?? '') ?? 'Cliente',
              rota: rota(k),
              nota: `${k.status === 'rascunho' ? 'rascunho' : 'enviada'} ${haQuanto(k.updated_at)}`,
              valor: k.valor_total,
              teste: k.eh_teste,
              para: '/cotacao',
              cot: k,
              dots: ['fazer', 'fazer', 'fazer', 'fazer', 'fazer', 'fazer'],
            }),
          ),
      ]
      setLinhas(saida)
    })()
    return () => {
      vivo = false
    }
  }, [])

  const visiveis = useMemo(() => (linhas ?? []).filter((l) => testes || !l.teste), [linhas, testes])
  const cont = (e: Etapa) => visiveis.filter((l) => l.etapa === e).length
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return visiveis.filter((l) => (filtro === 'todos' || l.etapa === filtro) && (!q || `${l.cliente} ${l.rota}`.toLowerCase().includes(q)))
  }, [visiveis, filtro, busca])
  const POR_PAGINA = 12
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA))
  const atual = Math.min(pagina, paginas - 1)
  const fatia = lista.slice(atual * POR_PAGINA, (atual + 1) * POR_PAGINA)
  const selecionada = lista.find((l) => `${l.etapa}-${l.id}` === sel) ?? null

  // Números do topo (só gestor): somam o que está na lista de serviços ativos.
  const comMargem = visiveis.filter((l) => l.cot?.margem_ajustada != null)
  const margemMedia = comMargem.length ? comMargem.reduce((a, l) => a + (l.cot?.margem_ajustada ?? 0), 0) / comMargem.length : null
  const vermelhos = comMargem.filter((l) => (l.cot?.margem_ajustada ?? 1) < 0.29).length
  const faturamento = visiveis.reduce((a, l) => a + (l.valor ?? 0), 0)

  const chip = (id: 'todos' | Etapa, rotulo: string, n: number) => (
    <button
      key={id}
      type="button"
      onClick={() => {
        setFiltro(id)
        setPagina(0)
      }}
      aria-pressed={filtro === id}
      className="text-[13px] font-bold px-3.5 py-1.5 rounded-full border"
      style={filtro === id ? { background: '#1c2559', color: '#fff', borderColor: '#1c2559' } : { background: '#fff', color: '#1c2559', borderColor: 'var(--rbr-border)' }}
    >
      {rotulo} · {n}
    </button>
  )

  const kpi = (rotulo: string, valor: string, perigo?: boolean) => (
    <div className="border rounded-2xl px-4 py-2.5 flex-1 min-w-[160px]" style={{ borderColor: perigo ? '#f2c4c0' : 'var(--rbr-border)', background: perigo ? '#fdeceb' : '#fff' }}>
      <div className="text-[11px] font-semibold" style={{ color: perigo ? '#b42318' : 'var(--rbr-muted)' }}>
        {perigo ? '▼ ' : ''}
        {rotulo}
      </div>
      <div className="text-[24px] font-extrabold leading-tight tabular-nums" style={{ color: perigo ? '#b42318' : 'var(--rbr-navy-dark)' }}>
        {valor}
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-[30px] leading-tight text-[color:var(--rbr-navy-dark)]">Serviços</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex p-1 rounded-xl" style={{ background: '#e9ecf4' }} role="group" aria-label="Forma de ver">
            {(['lista', 'funil'] as const).map((v) => (
              <button key={v} type="button" onClick={() => setVisao(v)} aria-pressed={visao === v} className="text-[13px] font-bold px-4 py-1.5 rounded-lg" style={visao === v ? { background: '#1c2559', color: '#fff' } : { color: '#4a5275' }}>
                {v === 'lista' ? 'Lista' : 'Funil'}
              </button>
            ))}
          </div>
          <input
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value)
              setPagina(0)
            }}
            placeholder="Buscar…"
            aria-label="Buscar serviços"
            className="text-[13px] bg-white border rounded-xl px-3 py-2 w-[200px]"
            style={{ borderColor: 'var(--rbr-border)' }}
          />
          <button type="button" onClick={() => nav('/cotacao')} className="text-[13px] font-bold px-4 py-2 rounded-xl text-white" style={{ background: '#1c2559' }}>
            + Novo serviço
          </button>
        </div>
      </div>

      {visao === 'funil' ? (
        <Funil gestor={gestor} />
      ) : (
        <>
          {gestor && linhas !== null && (
            <div className="flex gap-3 flex-wrap">
              {kpi('Valor dos serviços ativos', formatMoney(faturamento))}
              {kpi('Margem média', margemMedia == null ? '—' : `${(margemMedia * 100).toFixed(1).replace('.', ',')}%`)}
              {kpi('Margem na faixa vermelha', `${vermelhos} ${vermelhos === 1 ? 'serviço' : 'serviços'}`, vermelhos > 0)}
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            {chip('todos', 'Todos', visiveis.length)}
            {chip('cotacao', 'Cotação', cont('cotacao'))}
            {chip('operacao', 'Operação', cont('operacao'))}
            {chip('fiscal', 'Fiscal', cont('fiscal'))}
            <label className="ml-2 flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: 'var(--rbr-muted)' }}>
              <input type="checkbox" checked={testes} onChange={(e) => setTestes(e.target.checked)} />
              Mostrar testes
            </label>
          </div>

          {erro && <div className="text-xs text-[color:var(--rbr-danger)]">{erro}</div>}

          <div className={gestor && selecionada ? 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] items-start' : ''}>
            <div className="flex flex-col gap-3 min-w-0">
              <div className="bg-white border rounded-2xl overflow-hidden" style={{ borderColor: 'var(--rbr-border)' }}>
                <div className="hidden md:flex items-center gap-4 px-4 py-2.5 text-[10px] font-extrabold tracking-[0.08em] uppercase" style={{ background: '#f7f8fc', color: 'var(--rbr-muted)' }}>
                  <span className="w-[92px] flex-shrink-0">Etapa</span>
                  <span className="flex-1">Serviço</span>
                  <span className="w-[120px] flex-shrink-0">Esteira</span>
                  {gestor && <span className="w-[90px] flex-shrink-0">Margem</span>}
                  <span className="w-[96px] text-right flex-shrink-0">Frete</span>
                </div>
                {linhas === null ? (
                  <div className="p-8 text-center text-sm text-[color:var(--rbr-muted)]">Carregando…</div>
                ) : fatia.length === 0 ? (
                  <div className="p-8 text-center text-sm text-[color:var(--rbr-muted)]">Nada por aqui.</div>
                ) : (
                  fatia.map((l, i) => {
                    const chave = `${l.etapa}-${l.id}`
                    return (
                      <button
                        key={chave}
                        type="button"
                        onClick={() => (gestor ? setSel(chave) : nav(l.para))}
                        className="w-full text-left flex items-center gap-4 px-4 py-3.5 hover:bg-[#f7f8fc]"
                        style={{ borderTop: i ? '1px solid #eef0f5' : undefined, background: sel === chave ? '#f0f3fb' : undefined }}
                      >
                        <span className="text-[11px] font-extrabold tracking-wide rounded-full px-3 py-1.5 w-[92px] text-center flex-shrink-0" style={{ background: COR[l.etapa].bg, color: COR[l.etapa].fg }}>
                          {ROTULO[l.etapa].toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-extrabold truncate">
                            {l.cliente}
                            {l.teste && <span className="ml-2 text-[10px] font-bold uppercase" style={{ color: 'var(--rbr-danger)' }}>teste</span>}
                          </span>
                          <span className="block text-[12px] truncate" style={{ color: 'var(--rbr-muted)' }}>
                            {l.rota} · {l.nota}
                          </span>
                        </span>
                        <span className="hidden md:flex items-center gap-1.5 w-[120px] flex-shrink-0" title={ESTEIRA.map((n, k) => `${n}: ${l.dots[k]}`).join(' · ')}>
                          {l.dots.map((d, k) => (
                            <span key={k} className="w-2.5 h-2.5 rounded-full" style={{ background: COR_DOT[d] }} />
                          ))}
                        </span>
                        {gestor && (
                          <span className="hidden md:block w-[90px] flex-shrink-0">
                            <PilulaMargem m={l.cot?.margem_ajustada ?? null} />
                          </span>
                        )}
                        <span className="text-[14px] font-extrabold tabular-nums w-[96px] text-right flex-shrink-0">{l.valor != null ? formatMoney(l.valor) : '—'}</span>
                      </button>
                    )
                  })
                )}
              </div>
              <div className="flex items-center gap-4 flex-wrap text-[11px]" style={{ color: 'var(--rbr-muted)' }}>
                <span className="font-semibold">Esteira: {ESTEIRA.join(' · ')}</span>
                {[
                  ['feito', 'feito'],
                  ['andamento', 'em andamento'],
                  ['travado', 'travado'],
                  ['fazer', 'a fazer'],
                ].map(([d, t]) => (
                  <span key={d} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: COR_DOT[d as Dot] }} />
                    {t}
                  </span>
                ))}
                <span>Pedágio ainda não entra na esteira (sem dado).</span>
              </div>
              <div className="flex items-center justify-between text-[13px] font-semibold" style={{ color: 'var(--rbr-muted)' }}>
                <button type="button" disabled={atual === 0} onClick={() => setPagina(atual - 1)} className="disabled:opacity-40">
                  ← anterior
                </button>
                <span>
                  {atual + 1} de {paginas}
                </span>
                <button type="button" disabled={atual >= paginas - 1} onClick={() => setPagina(atual + 1)} className="disabled:opacity-40">
                  próximo →
                </button>
              </div>
            </div>
            {gestor && selecionada && <ParaOndeVai l={selecionada} onAbrir={() => nav(selecionada.para)} />}
          </div>
        </>
      )}
    </div>
  )
}
