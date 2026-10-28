import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Obrig } from '@rbr/shared/camposObrigatorios'
import { supabase } from '@rbr/shared/supabaseClient'
import type { Database } from '@rbr/shared/database.types'
import { formatMoney, formatDate, formatDateTime, STATUS_OPERACAO_LABEL, TIPO_DOC_LABEL } from '@rbr/shared/format'
import { IconCheck } from '@rbr/shared/icons'
import {
  carregarDetalhe,
  camposFaltando,
  montarFicha,
  textoFicha,
  type AssessoriaContato,
  type DetalheOperacao,
  type Documento,
  type Pessoa,
  type Veiculo,
} from '../../lib/operacaoDetalhe'
import CiotOperacao from './CiotOperacao'
import DatasPrevistas from './DatasPrevistas'
import NfesCliente from './NfesCliente'
import CiotEfrete from './CiotEfrete'
import { CIOT_EFRETE_HABILITADO } from '../../lib/efreteFlags'
import RetencaoInss from './RetencaoInss'
import ConformidadeOperacao, { type PedidoConformidade } from './ConformidadeOperacao'
import BaixarDocumentoFiscal from './BaixarDocumentoFiscal'
import PreVoo from './PreVoo'
import BotaoAcao from './BotaoAcao'
import CartaoGr from './CartaoGr'
import SeguroCard from './SeguroCard'
import { dadosMotoristaVeiculo, textoCopia } from '../../lib/copiaOperacao'
import SeloProcessando from '../SeloProcessando'
import { Modal } from '../financeiro/ui'
import { useDocumentosAoVivo } from '../../lib/useDocumentosAoVivo'
import { LinhaAverbacaoSompo } from './AverbacaoSompo'
import { sompoProcessando } from '../../lib/averbacaoSompo'
import {
  ciotAplicavel,
  docPor,
  documentoComProblema,
  documentoCumprido,
  documentoProcessando,
  etapasDaOperacao,
  pendenciasLiberacao,
  proximoPasso,
  rotuloAcaoDocumento,
  separarEtapas,
  vpoAplicavel,
  visualEtapa,
  type Etapa,
  type IdEtapa,
} from '../../lib/etapasOperacao'

// Detalhe da operação — painel enxuto (2026-10-16): uma linha "Próximo passo", uma linha do tempo só com as etapas que
// se aplicam a esta operação (etapa concluída = uma linha; atual ou com problema = aberta; futura = cinza) e o resto
// no menu "Mais ações". Quais etapas aparecem: lib/etapasOperacao.ts (lá estão as fontes de cada regra).

type StatusOperacao = Database['public']['Enums']['status_operacao']
type Executar = (fn: () => Promise<void>, sucesso?: string) => Promise<void>

const inputClass = 'border rounded-lg px-3 py-2 text-sm outline-none w-full bg-white'
const inputStyle = { borderColor: 'var(--rbr-border)' }
const labelClass = 'text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] mb-1.5 block'
const linkPequeno = 'text-[11px] font-semibold underline'

const STATUS_ORDEM: StatusOperacao[] = [
  'alocando_motorista',
  'aguardando_liberacao_fiscal',
  'liberada_coleta',
  'carregando',
  'em_transito',
  'entregue',
  'fechada',
  'cancelada',
]

// Data local (Brasília), não UTC — depois das 21h o toISOString já seria "amanhã".
const hoje = () => new Date().toLocaleDateString('sv-SE')

// Aceita "5000", "5.000", "5.000,50", "5000,50" e "5000.50".
export function parseBRL(v: string): number {
  const t = v.trim()
  if (!t) return NaN
  const normal = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : t
  return Number(normal)
}

// Tira a mensagem de erro de verdade de dentro da resposta da Edge Function (supabase-js só diz "non-2xx").
async function erroDaFuncao(error: unknown, data: unknown): Promise<string> {
  const d = data as { erro?: string } | null
  if (d?.erro) return d.erro
  const ctx = (error as { context?: { json?: () => Promise<unknown> } } | null)?.context
  if (ctx?.json) {
    try {
      const corpo = (await ctx.json()) as { erro?: string } | null
      if (corpo?.erro) return corpo.erro
    } catch {
      /* corpo não era JSON */
    }
  }
  return (error as { message?: string } | null)?.message ?? 'erro desconhecido'
}
const digitos = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')

function SeloVermelho({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
      ✕ {children}
    </span>
  )
}

// ---------------------------------------------------------------------------
export default function OperacaoFluxo({
  operacaoId,
  gestor,
  assessoria,
  onChanged,
  onCancelar,
  extras,
}: {
  operacaoId: string
  gestor: Pessoa
  assessoria: AssessoriaContato
  onChanged: () => void
  onCancelar?: () => void
  // Blocos que a página Operações já mantém e que entram dentro de uma etapa (AET, seguro excedente, avisar
  // motoristas, finalizar viagem) e o rodapé discreto (pagamento pós-entrega).
  extras?: Partial<Record<'motorista' | 'aet' | 'averbacao_allianz' | 'viagem' | 'rodape', React.ReactNode>>
}) {
  const [d, setD] = useState<DetalheOperacao | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [pedido, setPedido] = useState<PedidoConformidade>(null)
  const [fichaAberta, setFichaAberta] = useState(false)
  const [corrigindo, setCorrigindo] = useState(false)
  const [resumoAberto, setResumoAberto] = useState(false)

  const recarregar = useCallback(async () => {
    try {
      setD(await carregarDetalhe(operacaoId))
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar a operação.')
    }
  }, [operacaoId])

  useEffect(() => {
    recarregar()
  }, [recarregar])

  // Status fiscal ao vivo (robô do banco + Realtime / releitura a cada 10 s enquanto algo processa).
  useDocumentosAoVivo(
    operacaoId,
    !!d && (d.documentos.some(documentoProcessando) || sompoProcessando(docPor(d, 'mdfe'), d.averbacaoRcv)),
    () => void recarregar(),
  )

  async function executar(fn: () => Promise<void>, sucesso?: string) {
    setErro(null)
    setOk(null)
    setSalvando(true)
    try {
      await fn()
      if (sucesso) setOk(sucesso)
      await recarregar()
      onChanged()
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? String(e)
      setErro(msg)
      await recarregar()
    } finally {
      setSalvando(false)
    }
  }

  const atendido = useCallback(() => setPedido(null), [])

  if (!d) return <div className="text-xs text-[color:var(--rbr-muted)]">{erro ?? 'Carregando detalhes…'}</div>

  const o = d.operacao
  const etapas = etapasDaOperacao(d)
  const passo = proximoPasso(d, etapas)
  const { principais, recolhidas, abrirRecolhidas } = separarEtapas(etapas)
  const linha = (e: Etapa, i: number, lista: Etapa[]) => {
    const c = conteudo(e)
    return (
      <EtapaLinha key={e.id} etapa={e} ultima={i === lista.length - 1} compacto={c.compacto} aberto={c.aberto} destaque={passo.etapa === e.id} />
    )
  }
  const editavelAlocacao = o.status === 'alocando_motorista' || o.status === 'aguardando_liberacao_fiscal'
  const agenciador = o.origem === 'agenciador' || !!o.agenciador_id

  const conteudo = (e: Etapa): { compacto?: React.ReactNode; aberto?: React.ReactNode } => {
    switch (e.id) {
      case 'motorista':
        return { compacto: <MotoristaCompacto d={d} />, aberto: <Alocacao d={d} editavel={editavelAlocacao} salvando={salvando} executar={executar} extra={extras?.motorista} /> }
      case 'gr': {
        const doc = docEtapa('gr')
        return { compacto: doc.compacto, aberto: <div className="flex flex-col gap-3"><CartaoGr d={d} />{doc.aberto}</div> }
      }
      case 'rastreio':
        return docEtapa('wialon')
      case 'aet':
        return { ...docEtapa('aet'), aberto: extras?.aet ?? docEtapa('aet').aberto }
      case 'documento':
        return fiscalEtapa(docPor(d, 'nfse') && !docPor(d, 'cte') ? 'nfse' : o.tipo_documento_cliente === 'nfse' ? 'nfse' : 'cte')
      case 'mdfe':
        return fiscalEtapa('mdfe')
      case 'averbacao_allianz':
        return { compacto: <AllianzCompacto d={d} />, aberto: <EtapaAllianz d={d} executar={executar} salvando={salvando} extra={extras?.averbacao_allianz} /> }
      case 'averbacao_sompo':
        return {
          compacto: <LinhaAverbacaoSompo operacaoId={o.id} mdfe={docPor(d, 'mdfe')} rcv={d.averbacaoRcv} onMudou={() => void recarregar()} rotulo="" />,
          aberto:
            e.estado === 'concluida' ? undefined : (
              <LinhaAverbacaoSompo operacaoId={o.id} mdfe={docPor(d, 'mdfe')} rcv={d.averbacaoRcv} onMudou={() => void recarregar()} rotulo="" />
            ),
        }
      case 'ciot':
        return {
          compacto: <CiotCompacto d={d} />,
          aberto: (
            <div className="flex flex-col gap-3">
              <EtapaCiot d={d} salvando={salvando} executar={executar} />
              <div className="rounded-xl border p-3 flex flex-col gap-2" style={{ borderColor: 'var(--rbr-border)' }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: 'var(--rbr-navy-tint)', color: 'var(--rbr-navy-dark)' }}>
                    manual
                  </span>
                  <span className="text-xs text-[color:var(--rbr-muted)]">Alternativa se a efrete estiver fora do ar</span>
                </div>
                <BotaoAcao rotulo="Dados para a Repom" fazer={() => navigator.clipboard.writeText(textoCopia(dadosMotoristaVeiculo(d))).then(() => 'Dados copiados.')} />
                {docEtapa('ciot').aberto}
              </div>
            </div>
          ),
        }
      case 'pagamento':
        return { compacto: <PagamentoCompacto d={d} />, aberto: <Pagamento d={d} salvando={salvando} executar={executar} /> }
      case 'liberar':
        return { compacto: o.liberada_em ? <span>em {formatDateTime(o.liberada_em)}</span> : undefined, aberto: <EtapaLiberar d={d} salvando={salvando} executar={executar} /> }
      case 'viagem':
        return { compacto: <ViagemCompacta d={d} />, aberto: <EtapaViagem d={d} salvando={salvando} executar={executar} extra={extras?.viagem} /> }
    }
  }

  function docEtapa(tipo: string) {
    const doc = docPor(d!, tipo) as Documento | undefined
    return {
      compacto: doc ? <DocResumo doc={doc} /> : undefined,
      aberto: doc ? <AcoesDocumento d={d!} doc={doc} gestor={gestor} salvando={salvando} executar={executar} recarregar={recarregar} /> : undefined,
    }
  }

  function fiscalEtapa(tipo: 'cte' | 'mdfe' | 'nfse') {
    const doc = docPor(d!, tipo) as Documento | undefined
    return {
      compacto: doc ? <FiscalCompacto operacaoId={o.id} doc={doc} d={d!} gestor={gestor} salvando={salvando} executar={executar} recarregar={recarregar} /> : undefined,
      aberto:
        tipo === 'cte' ? (
          <div className="flex flex-col gap-3">
            <NfesCliente operacaoId={o.id} onMudou={() => void recarregar()} />
            <FiscalAberto doc={doc} tipo={tipo} />
          </div>
        ) : (
          <FiscalAberto doc={doc} tipo={tipo} />
        ),
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] items-start">
    <div className="flex flex-col gap-3 min-w-0">
      {erro && (
        <div className="text-xs rounded-xl px-3 py-2.5" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
          {erro}
        </div>
      )}
      {ok && (
        <div className="text-xs rounded-xl px-3 py-2.5 flex items-center gap-2" style={{ background: '#E7F5EC', color: 'var(--rbr-positive)' }}>
          <IconCheck width={13} height={13} />
          {ok}
        </div>
      )}

      {/* Próximo passo (uma ação) + Mais ações */}
      <div
        className="rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2 flex-wrap"
        style={passo.pronto ? { background: '#E7F5EC', color: '#137A45' } : { background: 'var(--rbr-navy-tint)', color: 'var(--rbr-navy-dark)' }}
      >
        <div className="text-sm">
          <span className="text-[11px] font-bold uppercase tracking-wide mr-2" style={{ opacity: 0.75 }}>
            Próximo passo
          </span>
          <b>{passo.texto}</b>
          {passo.etapa && passo.etapa !== 'liberar' && passo.etapa !== 'viagem' && ['documento', 'mdfe'].includes(passo.etapa) && (
            <Link to="/fiscal" className="ml-2 text-xs underline font-semibold">
              Emitir na Fiscal
            </Link>
          )}
        </div>
        {passo.etapa && (
          <button
            type="button"
            onClick={() => document.getElementById(`etapa-${passo.etapa}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            className="text-xs font-bold px-3.5 py-1.5 rounded-lg"
            style={passo.pronto ? { background: '#137A45', color: '#fff' } : { background: 'var(--rbr-navy)', color: '#fff' }}
          >
            {passo.pronto ? 'Liberar para coleta' : 'Ir para a etapa'}
          </button>
        )}
        <MaisAcoes
          agenciador={agenciador}
          podeCancelar={!!onCancelar && o.status !== 'cancelada' && o.status !== 'fechada'}
          onAcao={(a) => {
            if (a === 'ficha') setFichaAberta(true)
            else if (a === 'corrigir') setCorrigindo((v) => !v)
            else if (a === 'cancelar') onCancelar?.()
            else setPedido(a)
          }}
        />
      </div>
      {o.tipo_documento_mudou_em && (
        <div className="text-xs rounded-xl px-3 py-2 font-semibold" style={{ background: 'var(--rbr-warning-bg)', color: 'var(--rbr-navy-dark)' }}>
          A origem ou o destino mudou em {formatDateTime(o.tipo_documento_mudou_em)} e o documento ao cliente foi recalculado. Confira antes de emitir.
        </div>
      )}
      {corrigindo && <CorrigirStatus d={d} salvando={salvando} executar={executar} />}

      <ConformidadeOperacao
        operacaoId={o.id}
        congeladaMotivo={o.congelada_motivo}
        onMudou={() => void recarregar().then(onChanged)}
        pedido={pedido}
        onPedidoAtendido={atendido}
      />

      <ol className="flex flex-col list-none m-0 p-0" aria-label="Etapas da operação">
        {principais.map((e, i) => linha(e, i, principais))}
      </ol>
      {recolhidas.length > 0 && (
        <details open={abrirRecolhidas} className="rounded-xl border px-3 py-2" style={{ borderColor: 'var(--rbr-border)' }}>
          <summary className="text-xs font-bold cursor-pointer text-[color:var(--rbr-muted)]">Outras etapas ({recolhidas.length})</summary>
          <ol className="flex flex-col list-none m-0 p-0 mt-3" aria-label="Outras etapas da operação">
            {recolhidas.map((e, i) => linha(e, i, recolhidas))}
          </ol>
        </details>
      )}

      <Dispensados d={d} executar={executar} />
      {extras?.rodape}

      {fichaAberta && (
        <Modal titulo="Ficha para a assessoria" onFechar={() => setFichaAberta(false)} largura="max-w-2xl">
          <FichaAssessoria d={d} assessoria={assessoria} />
        </Modal>
      )}
    </div>

    {/* Painel lateral: motorista e veículo, resumo da cotação, seguro e pré-voo */}
    <aside className="flex flex-col gap-3">
      <div className="rounded-xl border p-3 flex flex-col gap-2" style={{ borderColor: 'var(--rbr-border)' }}>
        <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">Motorista e veículo</div>
        <MotoristaCompacto d={d} />
      </div>
      <ResumoLinha d={d} aberto={resumoAberto} onAlternar={() => setResumoAberto((v) => !v)} />
      <SeguroCard operacaoId={o.id} apolice={d.apolice} />
      <PreVoo operacaoId={o.id} tipo={o.tipo_documento_cliente === 'nfse' ? 'nfse' : 'cte'} />
    </aside>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Uma etapa da linha do tempo. Concluída = uma linha; atual/problema = aberta; processando = selo; futura = cinza.
function EtapaLinha({
  etapa,
  ultima,
  compacto,
  aberto,
  destaque,
}: {
  etapa: Etapa
  ultima: boolean
  compacto?: React.ReactNode
  aberto?: React.ReactNode
  destaque: boolean
}) {
  const [expandida, setExpandida] = useState(false)
  const { estado } = etapa
  const abrir = estado === 'atual' || estado === 'problema' || expandida
  const { cor, marca, anel } = visualEtapa(estado)
  return (
    <li id={`etapa-${etapa.id}`} className="flex gap-3">
      <div className="flex flex-col items-center" aria-hidden="true">
        <span
          className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0 mt-0.5"
          style={{ background: estado === 'futura' ? '#fff' : cor, border: `2px solid ${cor}`, boxShadow: anel ? '0 0 0 3px rgba(30,39,97,0.2)' : undefined }}
        >
          {marca}
        </span>
        {!ultima && <span className="w-0.5 flex-1 min-h-3" style={{ background: 'var(--rbr-border)' }} />}
      </div>
      <div className={`flex-1 min-w-0 flex flex-col gap-2 ${ultima ? '' : 'pb-3'}`}>
        <div className="flex items-center gap-2 flex-wrap min-h-6">
          <span
            className="text-sm font-bold"
            style={{ color: estado === 'futura' ? 'var(--rbr-muted)' : estado === 'problema' ? 'var(--rbr-danger)' : 'var(--rbr-navy-dark)' }}
          >
            {etapa.titulo}
          </span>
          {estado === 'processando' && (
            <SeloProcessando texto={etapa.id === 'averbacao_allianz' || etapa.id === 'averbacao_sompo' ? 'Processando na Averba…' : 'Processando na SEFAZ…'} />
          )}
          {(estado === 'concluida' || estado === 'processando') && compacto && <span className="text-xs text-[color:var(--rbr-muted)] flex items-center gap-2 flex-wrap">{compacto}</span>}
          {estado === 'concluida' && aberto && (
            <button type="button" onClick={() => setExpandida((v) => !v)} className={linkPequeno} style={{ color: 'var(--rbr-navy)' }} aria-expanded={expandida}>
              {expandida ? 'fechar' : 'detalhes'}
            </button>
          )}
          {destaque && estado !== 'concluida' && (
            <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: 'var(--rbr-navy)', color: '#fff' }}>
              agora
            </span>
          )}
        </div>
        {abrir && aberto && <div className="rounded-xl border p-3 flex flex-col gap-3" style={{ borderColor: estado === 'problema' ? '#F4C9C9' : 'var(--rbr-border)' }}>{aberto}</div>}
      </div>
    </li>
  )
}

// ---------------------------------------------------------------------------
type AcaoMenu = 'reter' | 'incidente' | 'declaracao' | 'ficha' | 'corrigir' | 'cancelar'

function MaisAcoes({ agenciador, podeCancelar, onAcao }: { agenciador: boolean; podeCancelar: boolean; onAcao: (a: AcaoMenu) => void }) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!aberto) return
    const fora = (ev: MouseEvent) => {
      if (ref.current && !ref.current.contains(ev.target as Node)) setAberto(false)
    }
    const esc = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setAberto(false)
    }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('keydown', esc)
    }
  }, [aberto])
  const item = 'w-full text-left text-xs font-semibold px-3 py-2.5 hover:bg-[color:var(--rbr-muted-bg)]'
  const escolher = (a: AcaoMenu) => {
    setAberto(false)
    onAcao(a)
  }
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        className="text-xs font-bold px-3 rounded-lg border bg-white"
        style={{ minHeight: 36, borderColor: 'var(--rbr-border)', color: 'var(--rbr-navy-dark)' }}
      >
        ⋯ Mais ações
      </button>
      {aberto && (
        <div role="menu" className="absolute right-0 mt-1 z-20 w-60 bg-white border rounded-xl shadow-lg py-1 flex flex-col" style={{ borderColor: 'var(--rbr-border)' }}>
          <button role="menuitem" type="button" className={item} onClick={() => escolher('reter')}>
            Reter para apuração
          </button>
          <button role="menuitem" type="button" className={item} onClick={() => escolher('incidente')}>
            Registrar incidente
          </button>
          {agenciador && (
            <button role="menuitem" type="button" className={item} onClick={() => escolher('declaracao')}>
              Declaração da carga
            </button>
          )}
          <button role="menuitem" type="button" className={item} onClick={() => escolher('ficha')}>
            Ficha para a assessoria
          </button>
          <Link role="menuitem" to="/financeiro?aba=receber" className={item} onClick={() => setAberto(false)}>
            Ver no Financeiro
          </Link>
          <button role="menuitem" type="button" className={item} onClick={() => escolher('corrigir')}>
            Corrigir status
          </button>
          {podeCancelar && (
            <button role="menuitem" type="button" className={item} style={{ color: 'var(--rbr-danger)' }} onClick={() => escolher('cancelar')}>
              Cancelar operação
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Resumo da cotação em uma linha (sem margem): preço, a pagar ao motorista e lucro previsto. Detalhe sob clique.
function ResumoLinha({ d, aberto, onAlternar }: { d: DetalheOperacao; aberto: boolean; onAlternar: () => void }) {
  const c = d.cotacao
  if (!c) return null
  const motorista = c.valor_total_motorista ?? c.valor_frete_motorista
  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs flex items-center gap-x-4 gap-y-1 flex-wrap">
        <span>
          Cliente paga <b className="tabular-nums">{formatMoney(c.valor_total ?? null)}</b>
        </span>
        <span>
          Motorista <b className="tabular-nums">{formatMoney(motorista ?? null)}</b>
        </span>
        <span>
          Lucro previsto <b className="tabular-nums">{formatMoney(c.lucro_rbr ?? null)}</b>
        </span>
        <button type="button" onClick={onAlternar} className={linkPequeno} style={{ color: 'var(--rbr-navy)' }} aria-expanded={aberto}>
          {aberto ? 'esconder detalhe' : 'detalhe'}
        </button>
        <Link to="/cotacao" className={linkPequeno} style={{ color: 'var(--rbr-navy)' }}>
          abrir cotação
        </Link>
      </div>
      {aberto && (
        <div className="rounded-xl p-3 text-xs flex flex-col gap-1" style={{ background: 'var(--rbr-muted-bg)' }}>
          {(
            [
              ['Pedágio', c.pedagio],
              ['TAG seguro', c.valor_seguro_tag],
              ['Custos adicionais', c.custos_adicionais_total],
              ['Imposto (estimado)', c.valor_imposto],
            ] as [string, number | null | undefined][]
          ).map(([k, v]) => (
            <div key={k} className="flex justify-between">
              <span>{k}</span>
              <span className="tabular-nums">{formatMoney(v ?? null)}</span>
            </div>
          ))}
          {d.custos.map((x) => (
            <div key={x.id} className="flex justify-between text-[color:var(--rbr-muted)]">
              <span>
                {x.tipos_custo_adicional?.nome ?? 'Custo'} → {x.recebedor === 'motorista' ? 'motorista' : x.fornecedores?.nome ?? x.fornecedores?.razao_social ?? x.recebedor}
              </span>
              <span className="tabular-nums">{formatMoney(x.valor_total)}</span>
            </div>
          ))}
          <div className="text-[color:var(--rbr-muted)] pt-1">
            {c.cidade_origem}/{c.uf_origem} → {c.cidade_destino}/{c.uf_destino}
            {c.tipo_carga ? ` · ${c.tipo_carga}` : ''}
            {c.eixos ? ` · ${c.eixos} eixos` : ''}
            {c.peso_bruto_kg ? ` · ${c.peso_bruto_kg.toLocaleString('pt-BR')} kg` : ''}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Motorista e veículo
interface Candidato {
  veiculo: Veiculo
  pessoa: Pessoa
  titular: Pessoa | null
  faltas: string[] // o que impede (vermelho)
  ocupado: boolean
  pontos: number
  saldo: number | null
}

function faltasDoCadastro(v: Veiculo, p: Pessoa, titular: Pessoa | null, precisaSatelite: boolean): string[] {
  const f: string[] = []
  if (p.aprovacao_status !== 'aprovado') f.push('cadastro do motorista não aprovado')
  if (v.aprovacao_status !== 'aprovado') f.push('veículo não aprovado')
  if ((v.rntrc_status ?? '').toLowerCase() !== 'ativo') f.push('RNTRC do veículo')
  if (titular && (titular.rntrc_status ?? '').toLowerCase() !== 'ativo') f.push('RNTRC do transportador')
  if (!p.cnh_validade || p.cnh_validade < hoje()) f.push('CNH vencida ou sem data')
  if (!p.cpf) f.push('CPF do motorista')
  if (!p.data_nascimento) f.push('data de nascimento')
  if (!p.pix) f.push('PIX do motorista')
  if (v.tara_kg == null || v.capacidade_carga == null) f.push('tara e capacidade do veículo')
  if (!v.crlv_exercicio || v.crlv_exercicio < new Date().getFullYear() - 1) f.push('CRLV do exercício')
  if (v.seguro_veiculo_vencimento && v.seguro_veiculo_vencimento < hoje()) f.push('seguro do veículo vencido')
  if (precisaSatelite && !(v.rastreador_tipo === 'wialon' && v.rastreador_ativo)) f.push('rastreador por satélite')
  return f
}

const ehCavalo = (v: Veiculo | null | undefined) => /cavalo/i.test(v?.tipo_veiculo ?? '')

function MotoristaCompacto({ d }: { d: DetalheOperacao }) {
  if (!d.veiculo || !d.motorista) return null
  return (
    <>
      <span className="text-[color:var(--rbr-navy-dark)] font-semibold">{d.motorista.nome}</span>
      <span>
        {d.veiculo.placa}
        {d.veiculo.tipo_veiculo ? ` · ${d.veiculo.tipo_veiculo}` : ''}
        {d.reboques.length ? ` + ${d.reboques.map((r) => r.placa).join(', ')}` : ''}
      </span>
    </>
  )
}

function Alocacao({
  d,
  editavel,
  salvando,
  executar,
  extra,
}: {
  d: DetalheOperacao
  editavel: boolean
  salvando: boolean
  executar: Executar
  extra?: React.ReactNode
}) {
  const o = d.operacao
  const alocado = !!(d.veiculo && d.motorista)
  const [trocando, setTrocando] = useState(!alocado)
  const [veiculos, setVeiculos] = useState<Veiculo[]>([])
  const [pessoas, setPessoas] = useState<Pessoa[]>([])
  const [ocupados, setOcupados] = useState<Set<string>>(new Set())
  const [saldos, setSaldos] = useState<Record<string, number>>({})
  const [veiculoSel, setVeiculoSel] = useState(o.veiculo_id ?? '')
  const [pessoaSel, setPessoaSel] = useState(o.pessoa_alocada_id ?? '')
  const [reboqueAdd, setReboqueAdd] = useState('')
  const [verTodos, setVerTodos] = useState(false)
  const [verPendentes, setVerPendentes] = useState(false)
  const [querCarreta, setQuerCarreta] = useState(false)

  const precisaSatelite = !!(o.carga_complexa_eixo1_perigosa || o.carga_complexa_eixo3_seguro_excedido)
  const cargaComplexa = !!(o.carga_complexa_eixo1_perigosa || o.carga_complexa_eixo2_superdimensionada || o.carga_complexa_eixo3_seguro_excedido)
  const precisaListas = editavel && (trocando || ehCavalo(d.veiculo) || querCarreta)

  useEffect(() => {
    setVeiculoSel(o.veiculo_id ?? '')
    setPessoaSel(o.pessoa_alocada_id ?? '')
  }, [o.veiculo_id, o.pessoa_alocada_id])

  useEffect(() => {
    if (!precisaListas) return
    Promise.all([
      supabase.from('veiculos').select('*').eq('ativo', true).is('deleted_at', null).order('placa'),
      supabase.from('pessoas').select('*').in('papel', ['titular_motorista', 'condutor']).eq('status', 'ativo').order('nome'),
      supabase
        .from('operacoes')
        .select('id, veiculo_id, pessoa_alocada_id')
        .in('status', ['aguardando_liberacao_fiscal', 'liberada_coleta', 'carregando', 'em_transito'])
        .neq('id', o.id),
      supabase.from('pontuacao_saldo').select('pessoa_id, saldo'),
    ]).then(([v, p, ops, pts]) => {
      setVeiculos(v.data ?? [])
      setPessoas(p.data ?? [])
      const s = new Set<string>()
      for (const x of ops.data ?? []) {
        if (x.veiculo_id) s.add(x.veiculo_id)
        if (x.pessoa_alocada_id) s.add(x.pessoa_alocada_id)
      }
      setOcupados(s)
      const m: Record<string, number> = {}
      for (const x of (pts.data ?? []) as { pessoa_id: string | null; saldo: number | null }[]) if (x.pessoa_id) m[x.pessoa_id] = x.saldo ?? 0
      setSaldos(m)
    })
  }, [precisaListas, o.id])

  const candidatos = useMemo<Candidato[]>(() => {
    const porId = new Map(pessoas.map((p) => [p.id, p]))
    const lista: Candidato[] = []
    for (const v of veiculos.filter((x) => !x.e_reboque)) {
      const titular = porId.get(v.titular_id) ?? null
      for (const p of pessoas.filter((x) => x.id === v.titular_id || (x.papel === 'condutor' && x.titular_id === v.titular_id))) {
        const faltas = faltasDoCadastro(v, p, titular, precisaSatelite)
        const ocupado = ocupados.has(v.id) || ocupados.has(p.id)
        if (ocupado) faltas.push('ocupado em outra carga')
        const saldo = saldos[p.id] ?? null
        const pontos = (p.status_online ? 2 : 0) + (cargaComplexa ? Math.min(saldo ?? 0, 50) / 10 : 0) - faltas.length * 20
        lista.push({ veiculo: v, pessoa: p, titular, faltas, ocupado, pontos, saldo })
      }
    }
    return lista.sort((a, b) => b.pontos - a.pontos)
  }, [veiculos, pessoas, ocupados, saldos, precisaSatelite, cargaComplexa])

  const aptos = candidatos.filter((c) => c.faltas.length === 0)
  const comPendencia = candidatos.filter((c) => c.faltas.length > 0)
  const faltasAlocado = alocado ? faltasDoCadastro(d.veiculo!, d.motorista!, d.titular, precisaSatelite) : []

  async function alocar(veiculoId: string, pessoaId: string) {
    await executar(async () => {
      const { error } = await supabase.from('operacoes').update({ veiculo_id: veiculoId, pessoa_alocada_id: pessoaId }).eq('id', o.id)
      if (error) throw error
      setTrocando(false)
    }, 'Motorista e veículo alocados.')
  }

  async function adicionarReboque() {
    if (!reboqueAdd) return
    await executar(async () => {
      const { error } = await supabase.from('operacao_reboques').insert({ operacao_id: o.id, veiculo_id: reboqueAdd, ordem: d.reboques.length + 1 })
      if (error) throw error
      setReboqueAdd('')
    })
  }

  async function removerReboque(veiculoId: string) {
    await executar(async () => {
      const { error } = await supabase.from('operacao_reboques').delete().eq('operacao_id', o.id).eq('veiculo_id', veiculoId)
      if (error) throw error
    })
  }

  const reboquesDisponiveis = veiculos.filter((v) => v.e_reboque && !d.reboques.some((r) => r.id === v.id))
  const motoristasDoVeiculo = (() => {
    const v = veiculos.find((x) => x.id === veiculoSel)
    if (!v) return pessoas
    return pessoas.filter((p) => p.id === v.titular_id || (p.papel === 'condutor' && p.titular_id === v.titular_id))
  })()
  const mostrarCarretas = !!o.veiculo_id && (ehCavalo(d.veiculo) || d.reboques.length > 0 || querCarreta)

  const linhaCandidato = (c: Candidato) => {
    const atual = c.veiculo.id === o.veiculo_id && c.pessoa.id === o.pessoa_alocada_id
    return (
      <div key={`${c.veiculo.id}-${c.pessoa.id}`} className="rounded-lg border px-2.5 py-2 flex flex-col gap-1.5" style={{ borderColor: atual ? 'var(--rbr-positive)' : 'var(--rbr-border)' }}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-xs font-bold">
            {c.pessoa.nome} · {c.veiculo.placa}
            {c.veiculo.tipo_veiculo ? ` · ${c.veiculo.tipo_veiculo}` : ''}
            {c.pessoa.papel === 'condutor' && <span className="font-normal text-[color:var(--rbr-muted)]"> (condutor de {c.titular?.nome})</span>}
            {cargaComplexa && <span className="font-normal text-[color:var(--rbr-muted)]"> · pontuação {c.saldo ?? 0}</span>}
          </div>
          {atual ? (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#E7F5EC', color: 'var(--rbr-positive)' }}>
              alocado
            </span>
          ) : (
            <button
              type="button"
              disabled={salvando}
              onClick={() => alocar(c.veiculo.id, c.pessoa.id)}
              className="text-[11px] font-bold px-3 py-1 rounded-lg disabled:opacity-60"
              style={c.faltas.length ? { border: '1px solid var(--rbr-danger)', color: 'var(--rbr-danger)' } : { background: 'var(--rbr-navy)', color: '#fff' }}
            >
              {c.faltas.length ? 'Alocar mesmo assim' : 'Alocar'}
            </button>
          )}
        </div>
        {c.faltas.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {c.faltas.map((f) => (
              <SeloVermelho key={f}>{f}</SeloVermelho>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {alocado && (
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span>
            <b>{d.motorista!.nome}</b> {d.motorista!.papel === 'condutor' ? '(condutor)' : ''} · {d.veiculo!.placa}
            {d.veiculo!.tipo_veiculo ? ` · ${d.veiculo!.tipo_veiculo}` : ''}
            {d.titular && d.titular.id !== d.motorista!.id ? ` · transportador ${d.titular.nome}` : ''}
          </span>
          {faltasAlocado.length === 0 ? (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#E7F5EC', color: 'var(--rbr-positive)' }}>
              Cadastro completo
            </span>
          ) : (
            faltasAlocado.map((f) => <SeloVermelho key={f}>{f}</SeloVermelho>)
          )}
          {editavel && !trocando && (
            <button type="button" onClick={() => setTrocando(true)} className={linkPequeno} style={{ color: 'var(--rbr-navy)' }}>
              Trocar
            </button>
          )}
        </div>
      )}

      {extra}

      {editavel && trocando && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">
              Aptos ({aptos.length}) · quem decide é você
            </div>
            {alocado && (
              <button type="button" onClick={() => setTrocando(false)} className={linkPequeno}>
                fechar
              </button>
            )}
          </div>
          {(verTodos ? aptos : aptos.slice(0, 5)).map(linhaCandidato)}
          {aptos.length === 0 && <div className="text-xs text-[color:var(--rbr-muted)]">Nenhum motorista apto agora.</div>}
          {aptos.length > 5 && (
            <button type="button" onClick={() => setVerTodos((v) => !v)} className={`self-start ${linkPequeno}`}>
              {verTodos ? 'ver só os 5 primeiros' : `ver todos os aptos (${aptos.length})`}
            </button>
          )}
          {comPendencia.length > 0 && (
            <button type="button" onClick={() => setVerPendentes((v) => !v)} className={`self-start ${linkPequeno}`} aria-expanded={verPendentes}>
              {verPendentes ? 'esconder os com pendência' : `Ver outros (${comPendencia.length} com pendência)`}
            </button>
          )}
          {verPendentes && comPendencia.map(linhaCandidato)}
          <details className="rounded-lg p-2.5" style={{ background: 'var(--rbr-muted-bg)' }}>
            <summary className="text-[11px] font-bold cursor-pointer">Escolher manualmente</summary>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2">
              <select aria-label="Veículo" value={veiculoSel} onChange={(e) => { setVeiculoSel(e.target.value); setPessoaSel('') }} className={inputClass} style={inputStyle}>
                <option value="">Veículo (cavalo/tração)…</option>
                {veiculos.filter((v) => !v.e_reboque).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.placa} · {v.tipo_veiculo ?? v.marca_modelo ?? 'veículo'}
                  </option>
                ))}
              </select>
              <select aria-label="Motorista" value={pessoaSel} onChange={(e) => setPessoaSel(e.target.value)} className={inputClass} style={inputStyle}>
                <option value="">Motorista da frota desse veículo…</option>
                {motoristasDoVeiculo.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome} {p.papel === 'condutor' ? '(condutor)' : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={salvando || !veiculoSel || !pessoaSel}
                onClick={() => alocar(veiculoSel, pessoaSel)}
                className="text-xs font-bold px-3 py-2 rounded-lg disabled:opacity-50"
                style={{ background: 'var(--rbr-navy)', color: '#fff' }}
              >
                Alocar
              </button>
            </div>
          </details>
          {o.veiculo_id && !mostrarCarretas && (
            <button type="button" onClick={() => setQuerCarreta(true)} className={`self-start ${linkPequeno}`}>
              Adicionar carreta
            </button>
          )}
        </div>
      )}

      {mostrarCarretas && (
        <div className="flex flex-col gap-1.5">
          <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">Carretas</div>
          {d.reboques.length === 0 && <div className="text-xs" style={{ color: 'var(--rbr-danger)' }}>Cavalo mecânico sem carreta: o MDF-e exige o implemento.</div>}
          {d.reboques.map((r) => (
            <div key={r.id} className="flex items-center justify-between text-xs">
              <span>
                {r.placa} · {r.tipo_carroceria ?? r.tipo_veiculo ?? 'carreta'} {r.renavam ? `· RENAVAM ${r.renavam}` : ''}
              </span>
              {editavel && (
                <button type="button" onClick={() => removerReboque(r.id)} className="underline font-semibold" style={{ color: 'var(--rbr-danger)' }}>
                  remover
                </button>
              )}
            </div>
          ))}
          {editavel && (
            <div className="flex gap-2">
              <select aria-label="Adicionar carreta" value={reboqueAdd} onChange={(e) => setReboqueAdd(e.target.value)} className={inputClass} style={{ ...inputStyle, maxWidth: 320 }}>
                <option value="">+ Adicionar carreta…</option>
                {reboquesDisponiveis.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.placa} · {v.tipo_carroceria ?? v.tipo_veiculo ?? 'carreta'}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!reboqueAdd || salvando}
                onClick={adicionarReboque}
                className="text-xs font-bold px-3 py-2 rounded-lg disabled:opacity-50"
                style={{ background: 'var(--rbr-navy)', color: '#fff' }}
              >
                Adicionar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Documentos (fiscal e de apoio)
function horaDoc(doc: Documento): string | null {
  const t = doc.emitido_em ?? doc.atualizado_em
  return t ? formatDateTime(t) : null
}

function DocResumo({ doc }: { doc: Documento }) {
  return (
    <>
      {doc.numero_documento && <span className="tabular-nums">nº {doc.numero_documento}</span>}
      {doc.conferencia_status === 'aceito_manual' && <span>aceito manualmente</span>}
      {horaDoc(doc) && <span>{horaDoc(doc)}</span>}
    </>
  )
}

function FiscalCompacto({
  operacaoId,
  doc,
  d,
  gestor,
  salvando,
  executar,
  recarregar,
}: {
  operacaoId: string
  doc: Documento
  d: DetalheOperacao
  gestor: Pessoa
  salvando: boolean
  executar: Executar
  recarregar: () => Promise<void>
}) {
  return (
    <>
      <DocResumo doc={doc} />
      {(doc.tipo === 'cte' || doc.tipo === 'mdfe') && doc.status === 'emitido' && doc.referencia && (
        <BaixarDocumentoFiscal operacaoId={operacaoId} tipo={doc.tipo} chave={doc.chave_acesso} />
      )}
      {doc.status === 'emitido' && <ArquivoManual d={d} doc={doc} gestor={gestor} salvando={salvando} executar={executar} recarregar={recarregar} />}
    </>
  )
}

function FiscalAberto({ doc, tipo }: { doc: Documento | undefined; tipo: 'cte' | 'mdfe' | 'nfse' }) {
  const rotulo = tipo === 'cte' ? 'CT-e' : tipo === 'mdfe' ? 'MDF-e' : 'NFS-e'
  return (
    <div className="flex flex-col gap-2 text-xs">
      {doc && documentoComProblema(doc) && doc.mensagem_erro && (
        <div className="rounded-lg px-3 py-2" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
          {doc.status === 'bloqueado' ? 'Bloqueado' : 'Rejeitado'}: {doc.mensagem_erro}
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[color:var(--rbr-muted)]">
          {documentoProcessando(doc) ? 'Enviado; o status atualiza sozinho.' : `A emissão do ${rotulo} é feita na tela Fiscal.`}
        </span>
        {!documentoProcessando(doc) && (
          <Link to="/fiscal" className="font-bold underline" style={{ color: 'var(--rbr-navy)' }}>
            Emitir na Fiscal
          </Link>
        )}
      </div>
    </div>
  )
}

// Segurança manual: subir/trocar o arquivo de um documento (a IA confere com a operação). Link pequeno.
function ArquivoManual({
  d,
  doc,
  gestor,
  salvando,
  executar,
  recarregar,
}: {
  d: DetalheOperacao
  doc: Documento
  gestor: Pessoa
  salvando: boolean
  executar: Executar
  recarregar: () => Promise<void>
}) {
  return <AcoesDocumento d={d} doc={doc} gestor={gestor} salvando={salvando} executar={executar} recarregar={recarregar} soArquivo />
}

function AcoesDocumento({
  d,
  doc,
  gestor,
  salvando,
  executar,
  recarregar,
  soArquivo = false,
}: {
  d: DetalheOperacao
  doc: Documento
  gestor: Pessoa
  salvando: boolean
  executar: Executar
  recarregar: () => Promise<void>
  soArquivo?: boolean
}) {
  const [enviando, setEnviando] = useState(false)
  const [modo, setModo] = useState<'aceitar' | 'dispensar' | null>(null)
  const [motivo, setMotivo] = useState('')
  const [verConf, setVerConf] = useState(doc.conferencia_status === 'divergente')
  const input = useRef<HTMLInputElement | null>(null)
  const res = doc.conferencia_resultado as { checks?: { item: string; esperado: string; encontrado: string; ok: boolean; critico: boolean }[]; erro?: string } | null

  async function enviar(file: File) {
    setEnviando(true)
    await executar(async () => {
      const nomeLimpo = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${d.operacao.id}/${doc.tipo}/${Date.now()}-${nomeLimpo}`
      const { error: upErr } = await supabase.storage.from('operacao-documentos').upload(path, file, { upsert: false })
      if (upErr) throw upErr
      const { error: updErr } = await supabase
        .from('documentacao_operacao')
        .update({
          arquivo_path: path,
          arquivo_nome: file.name,
          arquivo_enviado_em: new Date().toISOString(),
          conferencia_status: 'conferindo',
          conferencia_resultado: null,
          aceite_manual_motivo: null,
        })
        .eq('id', doc.id)
      if (updErr) throw updErr
      await recarregar()
      const { data, error } = await supabase.functions.invoke('conferir-documento-operacao', { body: { documento_id: doc.id } })
      if (error || !data?.sucesso) {
        throw new Error(`Arquivo salvo, mas a conferência automática falhou: ${await erroDaFuncao(error, data)}. Você pode tentar de novo ou aceitar manualmente.`)
      }
    }, 'Arquivo enviado e conferido.')
    setEnviando(false)
    setVerConf(true)
  }

  async function verArquivo() {
    if (!doc.arquivo_path) return
    const { data, error } = await supabase.storage.from('operacao-documentos').createSignedUrl(doc.arquivo_path, 300)
    if (error || !data) return
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  async function confirmar() {
    await executar(async () => {
      if (!motivo.trim()) throw new Error(modo === 'aceitar' ? 'Explique por que está aceitando manualmente.' : 'Explique por que esse documento não é necessário nesta operação.')
      const patch =
        modo === 'aceitar'
          ? {
              conferencia_status: 'aceito_manual',
              aceite_manual_motivo: `${motivo.trim()} — ${gestor.nome}`,
              conferido_por: gestor.id,
              conferido_em: new Date().toISOString(),
              status: 'emitido' as const,
            }
          : { exigido: false, dispensa_motivo: `${motivo.trim()} — ${gestor.nome}` }
      const { error } = await supabase.from('documentacao_operacao').update(patch).eq('id', doc.id)
      if (error) throw error
    }, modo === 'aceitar' ? 'Documento aceito manualmente.' : 'Documento dispensado.')
    setModo(null)
    setMotivo('')
  }

  const botaoArquivo = (
    <>
      <input
        ref={input}
        type="file"
        accept=".pdf,.xml,image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void enviar(f)
        }}
      />
      <button type="button" disabled={salvando || enviando} onClick={() => input.current?.click()} className={`${linkPequeno} disabled:opacity-60`} style={{ color: 'var(--rbr-navy)' }}>
        {enviando ? 'enviando e conferindo…' : rotuloAcaoDocumento(doc.tipo, !!doc.arquivo_path)}
      </button>
    </>
  )

  if (soArquivo) return botaoArquivo

  return (
    <div className="flex flex-col gap-2 text-xs">
      {doc.motivo_exigencia && <div className="text-[color:var(--rbr-muted)]">{doc.motivo_exigencia}</div>}
      <div className="flex items-center gap-3 flex-wrap">
        {botaoArquivo}
        {doc.arquivo_path && (
          <button type="button" onClick={() => void verArquivo()} className={linkPequeno}>
            ver arquivo
          </button>
        )}
        {!documentoCumprido(doc) && (
          <button type="button" onClick={() => setModo('aceitar')} className={linkPequeno}>
            aceitar manualmente
          </button>
        )}
        <button type="button" onClick={() => setModo('dispensar')} className={linkPequeno} style={{ color: 'var(--rbr-muted)' }}>
          não se aplica
        </button>
        {res?.checks && (
          <button type="button" onClick={() => setVerConf((v) => !v)} className={linkPequeno}>
            {verConf ? 'esconder conferência' : 'ver conferência'}
          </button>
        )}
      </div>
      {res?.erro && <div style={{ color: 'var(--rbr-danger)' }}>{res.erro}</div>}
      {verConf && res?.checks && (
        <div className="flex flex-col gap-1 rounded-lg p-2" style={{ background: 'var(--rbr-muted-bg)' }}>
          {res.checks.map((ck, i) => (
            <div key={i} className="text-[11px] flex flex-wrap gap-x-2">
              <span style={{ color: ck.ok ? 'var(--rbr-positive)' : ck.critico ? 'var(--rbr-danger)' : 'var(--rbr-muted)', fontWeight: 700 }}>
                {ck.ok ? '✓' : '✕'} {ck.item}
              </span>
              <span className="text-[color:var(--rbr-muted)]">esperado: {ck.esperado}</span>
              <span className="text-[color:var(--rbr-muted)]">no documento: {ck.encontrado}</span>
            </div>
          ))}
        </div>
      )}
      {modo && (
        <div className="flex gap-2 flex-wrap">
          <input
            autoFocus
            aria-label={modo === 'aceitar' ? 'Motivo do aceite manual' : 'Por que não se aplica'}
            placeholder={modo === 'aceitar' ? 'Motivo do aceite manual (ex.: conferi o PDF)' : 'Por que não se aplica (ex.: rota sem pedágio)'}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            className={inputClass}
            style={{ ...inputStyle, maxWidth: 440 }}
          />
          <button type="button" disabled={salvando} onClick={() => void confirmar()} className="text-xs font-bold px-3 py-2 rounded-lg disabled:opacity-60" style={{ background: 'var(--rbr-gold)', color: 'var(--rbr-navy-dark)' }}>
            Confirmar
          </button>
          <button type="button" onClick={() => setModo(null)} className="text-xs underline">
            cancelar
          </button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Averbação Allianz (RCTR-C) do CT-e: automática (gatilho ao emitir em produção). Aqui resultado e reenvio em erro.
function AllianzCompacto({ d }: { d: DetalheOperacao }) {
  const atm = docPor(d, 'atm') as Documento | undefined
  if (!atm) return null
  return <DocResumo doc={atm} />
}

function EtapaAllianz({ d, executar, salvando, extra }: { d: DetalheOperacao; executar: Executar; salvando: boolean; extra?: React.ReactNode }) {
  const atm = docPor(d, 'atm') as Documento | undefined
  const cte = docPor(d, 'cte')
  const emErro = atm?.status === 'erro' || atm?.status === 'bloqueado'
  async function reenviar() {
    await executar(async () => {
      const { data, error } = await supabase.functions.invoke('enviar-averbacao', { body: { operacao_id: d.operacao.id } })
      if (error || data?.sucesso === false) throw new Error(await erroDaFuncao(error, data))
    }, 'Averbação reenviada.')
  }
  return (
    <div className="flex flex-col gap-2 text-xs">
      {emErro && atm?.mensagem_erro && (
        <div className="rounded-lg px-3 py-2" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
          {atm.mensagem_erro}
        </div>
      )}
      {!emErro && cte?.status !== 'emitido' && <div className="text-[color:var(--rbr-muted)]">Sai sozinha quando o CT-e for autorizado.</div>}
      {emErro && (
        <button type="button" disabled={salvando} onClick={() => void reenviar()} className="self-start text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-60" style={{ background: 'var(--rbr-navy)', color: '#fff' }}>
          Reenviar averbação Allianz
        </button>
      )}
      {extra}
    </div>
  )
}

// ---------------------------------------------------------------------------
// CIOT e vale-pedágio
function CiotCompacto({ d }: { d: DetalheOperacao }) {
  const v = d.ciotVpo
  return (
    <>
      {ciotAplicavel(d) && v?.ciot && (
        <span className="tabular-nums">
          CIOT {v.ciot}
          {v.ciot_origem === 'efrete' && ` · efrete${v.ciot_ambiente === 'homologacao' ? ' (homologação, sem validade)' : ''}`}
        </span>
      )}
      {vpoAplicavel(d) && v?.vpo_idvpo && <span>vale-pedágio {v.vpo_idvpo}</span>}
    </>
  )
}

function EtapaCiot({ d, salvando, executar }: { d: DetalheOperacao; salvando: boolean; executar: Executar }) {
  return (
    <div className="flex flex-col gap-3">
      {ciotAplicavel(d) && !CIOT_EFRETE_HABILITADO && (
        <div className="text-xs text-[color:var(--rbr-muted)]">CIOT pela efrete ainda não liberado (conta de produção pendente). Emita o CIOT na Repom e registre o número e o documento abaixo.</div>
      )}
      {ciotAplicavel(d) && <CiotEfrete operacaoId={d.operacao.id} ehTeste={d.operacao.eh_teste === true} docs={d.documentos} placa={d.veiculo?.placa} />}
      {ciotAplicavel(d) && <CiotOperacao d={d} salvando={salvando} executar={executar} />}
      {vpoAplicavel(d) && (
        <div className="text-xs">
          <b>Vale-pedágio:</b>{' '}
          {d.ciotVpo?.vpo_idvpo ? (
            `IDVPO ${d.ciotVpo.vpo_idvpo}`
          ) : (
            <>
              falta o IDVPO (rota com pedágio, Lei 10.209/2001). Preencha na conferência do MDF-e,{' '}
              <Link to="/fiscal" className="underline font-semibold">
                na tela Fiscal
              </Link>
              .
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pagamento ao motorista (parceiro; frota própria não tem esta etapa)
function PagamentoCompacto({ d }: { d: DetalheOperacao }) {
  const c = d.condicao
  if (!c) return null
  return (
    <>
      <span className="tabular-nums">contrato {formatMoney(c.valor_total_contrato)}</span>
      <span>{c.tipo === 'imediato' ? 'à vista' : `${Math.round((c.percentual_adiantamento ?? 0) * 100)}% de adiantamento`}</span>
      <span>{c.meio_pagamento === 'pix' ? 'PIX' : c.meio_pagamento === 'ipef' ? 'IPEF' : 'transferência'}</span>
    </>
  )
}

function Pagamento({ d, salvando, executar }: { d: DetalheOperacao; salvando: boolean; executar: Executar }) {
  const c = d.condicao
  const sugerido = d.cotacao?.valor_total_motorista ?? d.cotacao?.valor_frete_motorista ?? null
  const [total, setTotal] = useState(String(c?.valor_total_contrato ?? sugerido ?? ''))
  const [tipo, setTipo] = useState<'imediato' | 'diferido'>((c?.tipo as 'imediato' | 'diferido') ?? 'diferido')
  const [pct, setPct] = useState(String(c?.percentual_adiantamento != null ? Number((c.percentual_adiantamento * 100).toFixed(2)) : 80))
  const [meio, setMeio] = useState<'pix' | 'transferencia' | 'ipef'>((c?.meio_pagamento as 'pix' | 'transferencia' | 'ipef') ?? 'pix')
  const [saldoDias, setSaldoDias] = useState(String(c?.saldo_prazo_dias ?? 0))

  useEffect(() => {
    setTotal(String(d.condicao?.valor_total_contrato ?? sugerido ?? ''))
    setTipo((d.condicao?.tipo as 'imediato' | 'diferido') ?? 'diferido')
    setPct(String(d.condicao?.percentual_adiantamento != null ? Number((d.condicao.percentual_adiantamento * 100).toFixed(2)) : 80))
    setMeio((d.condicao?.meio_pagamento as 'pix' | 'transferencia' | 'ipef') ?? 'pix')
    setSaldoDias(String(d.condicao?.saldo_prazo_dias ?? 0))
  }, [d.condicao?.id, d.condicao?.updated_at, sugerido]) // eslint-disable-line react-hooks/exhaustive-deps

  const totalNum = parseBRL(total)
  const pctNum = parseBRL(pct)
  const adiant = tipo === 'diferido' && Number.isFinite(totalNum) && Number.isFinite(pctNum) ? Math.round(totalNum * pctNum) / 100 : 0
  const t = d.titular
  const semDadosBancarios = meio === 'pix' ? !t?.pix : !t?.banco_conta
  const abaixoPiso = d.cotacao?.piso_antt_calculado != null && Number.isFinite(totalNum) && totalNum < d.cotacao.piso_antt_calculado

  async function salvar() {
    await executar(async () => {
      if (!Number.isFinite(totalNum) || totalNum <= 0) throw new Error('Informe o valor total do contrato do motorista.')
      if (tipo === 'diferido' && (!Number.isFinite(pctNum) || pctNum < 0 || pctNum > 100)) throw new Error('% de adiantamento entre 0 e 100.')
      const dias = Number(saldoDias)
      if (!Number.isInteger(dias) || dias < 0 || dias > 120) throw new Error('Prazo do saldo: de 0 a 120 dias após a entrega.')
      const payload = {
        operacao_id: d.operacao.id,
        origem: d.operacao.origem,
        tipo,
        meio_pagamento: meio,
        valor_total_contrato: totalNum,
        valor_adiantamento: tipo === 'diferido' ? adiant : totalNum,
        percentual_adiantamento: tipo === 'diferido' ? pctNum / 100 : 1,
        saldo_prazo_dias: tipo === 'diferido' ? dias : 0,
      }
      const { error } = d.condicao
        ? await supabase.from('condicoes_pagamento_operacao').update(payload).eq('id', d.condicao.id)
        : await supabase.from('condicoes_pagamento_operacao').insert(payload)
      if (error) throw error
    }, 'Condição de pagamento salva.')
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <div>
          <label className={labelClass}>Total do contrato (R$)<Obrig entidade="condicoes_pagamento_operacao" campo="valor_total_contrato" /></label>
          <input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} className={inputClass} style={inputStyle} />
          {sugerido != null && parseBRL(total) !== sugerido && (
            <button type="button" onClick={() => setTotal(String(sugerido))} className="text-[11px] underline font-semibold mt-1">
              usar o da cotação ({formatMoney(sugerido)})
            </button>
          )}
        </div>
        <div>
          <label className={labelClass}>Forma</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as 'imediato' | 'diferido')} className={inputClass} style={inputStyle}>
            <option value="diferido">Adiantamento + saldo</option>
            <option value="imediato">À vista (tudo de uma vez)</option>
          </select>
        </div>
        {tipo === 'diferido' && (
          <div>
            <label className={labelClass}>Adiantamento (%)</label>
            <input inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} className={inputClass} style={inputStyle} />
            <div className="text-[11px] mt-1 text-[color:var(--rbr-muted)] tabular-nums">
              {formatMoney(adiant)} agora · {formatMoney(Number.isFinite(totalNum) ? totalNum - adiant : 0)} de saldo
            </div>
          </div>
        )}
        {tipo === 'diferido' && (
          <div>
            <label className={labelClass}>Saldo: dias após a entrega</label>
            <input inputMode="numeric" value={saldoDias} onChange={(e) => setSaldoDias(e.target.value)} className={inputClass} style={inputStyle} />
          </div>
        )}
        <div>
          <label className={labelClass}>Meio</label>
          <select value={meio} onChange={(e) => setMeio(e.target.value as 'pix' | 'transferencia' | 'ipef')} className={inputClass} style={inputStyle}>
            <option value="pix">PIX</option>
            <option value="transferencia">Transferência</option>
            <option value="ipef">IPEF (cartão/conta de frete)</option>
          </select>
        </div>
      </div>
      <div className="text-xs">
        <b>Recebe:</b> {t?.nome ?? '—'} · {meio === 'pix' ? `PIX: ${t?.pix ?? '—'}` : `Banco ${t?.banco_codigo ?? '—'} ag. ${t?.banco_agencia ?? '—'} conta ${t?.banco_conta ?? '—'}`}
      </div>
      <RetencaoInss operacaoId={d.operacao.id} frete={totalNum} />
      {semDadosBancarios && (
        <div className="text-xs rounded-lg px-3 py-2" style={{ background: 'var(--rbr-warning-bg)', color: 'var(--rbr-navy-dark)' }}>
          Faltam os dados de pagamento do transportador.{' '}
          <Link to="/cadastros" className="underline font-semibold">
            Completar em Cadastros
          </Link>
        </div>
      )}
      {abaixoPiso && (
        <div className="text-xs rounded-lg px-3 py-2" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
          Abaixo do piso mínimo ANTT da cotação ({formatMoney(d.cotacao?.piso_antt_calculado ?? null)}) — o CIOT é recusado.
        </div>
      )}
      <button type="button" disabled={salvando} onClick={() => void salvar()} className="self-start text-xs font-bold px-3.5 py-2 rounded-lg disabled:opacity-60" style={{ background: 'var(--rbr-navy)', color: '#fff' }}>
        {d.condicao ? 'Salvar condição' : 'Definir condição'}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Liberar para coleta (mesma conta do gatilho do banco; "Seguir mesmo assim" com motivo para regra da RBR)
function EtapaLiberar({ d, salvando, executar }: { d: DetalheOperacao; salvando: boolean; executar: Executar }) {
  const o = d.operacao
  const [seguindo, setSeguindo] = useState(false)
  const [motivoRessalva, setMotivoRessalva] = useState('')
  if (o.status !== 'aguardando_liberacao_fiscal') {
    return o.liberada_em ? null : <div className="text-xs text-[color:var(--rbr-muted)]">Depois de alocar o motorista e cumprir as etapas acima.</div>
  }
  const { bloqueiam, ressalvaveis } = pendenciasLiberacao(d)

  async function liberar() {
    await executar(async () => {
      const { error } = await supabase.from('operacoes').update({ status: 'liberada_coleta' }).eq('id', o.id)
      if (error) throw error
    }, 'Carga liberada para coleta.')
  }
  async function liberarComRessalva() {
    await executar(async () => {
      const { error } = await supabase.rpc('liberar_operacao_com_ressalva', { p_operacao: o.id, p_motivo: motivoRessalva.trim() })
      if (error) throw error
      setSeguindo(false)
      setMotivoRessalva('')
    }, 'Carga liberada para coleta com ressalva (motivo registrado).')
  }

  return (
    <div className="flex flex-col gap-2">
      {bloqueiam.length > 0 && (
        <div className="text-xs" style={{ color: 'var(--rbr-danger)' }}>
          Falta: {bloqueiam.join(', ')}.
        </div>
      )}
      {ressalvaveis.length > 0 && (
        <div className="text-xs rounded-lg px-3 py-2" style={{ background: '#FFF6E0', color: 'var(--rbr-navy-dark)' }}>
          <span className="inline-block mr-1.5 px-1.5 py-px rounded text-[10px] font-extrabold uppercase tracking-wide align-middle" style={{ border: '1px solid #9A6700', color: '#9A6700' }}>
            Regra da RBR
          </span>
          Pendente: {ressalvaveis.join(', ')}. {bloqueiam.length === 0 && 'Dá para seguir mesmo assim, informando o motivo.'}
        </div>
      )}
      {bloqueiam.length === 0 && ressalvaveis.length === 0 && (
        <div className="text-xs" style={{ color: 'var(--rbr-positive)' }}>
          Tudo cumprido. O motorista só vê a carga como liberada depois deste clique.
        </div>
      )}
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          disabled={salvando || bloqueiam.length > 0 || ressalvaveis.length > 0}
          onClick={() => void liberar()}
          className="text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-50"
          style={{ background: 'var(--rbr-positive)', color: '#fff', minHeight: 44 }}
        >
          Liberar para coleta
        </button>
        {bloqueiam.length === 0 && ressalvaveis.length > 0 && !seguindo && (
          <button type="button" disabled={salvando} onClick={() => setSeguindo(true)} className="text-sm font-bold px-4 py-2 rounded-xl border disabled:opacity-50" style={{ borderColor: '#9A6700', color: '#9A6700', background: '#fff', minHeight: 44 }}>
            Seguir mesmo assim…
          </button>
        )}
      </div>
      {seguindo && (
        <div className="flex flex-col gap-2 rounded-lg border px-3 py-2" style={{ borderColor: '#E7C66B' }}>
          <label htmlFor="motivo-ressalva" className="text-xs font-bold text-[color:var(--rbr-navy-dark)]">
            Motivo para liberar com pendência da RBR (obrigatório, fica na auditoria)
          </label>
          <textarea
            id="motivo-ressalva"
            value={motivoRessalva}
            onChange={(e) => setMotivoRessalva(e.target.value)}
            rows={2}
            className={inputClass}
            style={inputStyle}
            placeholder="Ex.: condição combinada por telefone"
          />
          <div className="flex gap-2">
            <button type="button" disabled={salvando || motivoRessalva.trim().length < 10} onClick={() => void liberarComRessalva()} className="text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-50" style={{ background: '#9A6700', color: '#fff' }}>
              Liberar com ressalva
            </button>
            <button type="button" onClick={() => setSeguindo(false)} className="text-sm font-bold px-3 py-2 text-[color:var(--rbr-muted)]">
              Voltar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Viagem e fechamento ("Finalizar viagem" continua vindo da página, em extras.viagem)
function ViagemCompacta({ d }: { d: DetalheOperacao }) {
  const o = d.operacao
  return (
    <>
      <span>{STATUS_OPERACAO_LABEL[o.status]}</span>
      {o.coleta_em && <span>coleta {formatDateTime(o.coleta_em)}</span>}
      {o.entregue_em && <span>entregue {formatDateTime(o.entregue_em)}</span>}
    </>
  )
}

function EtapaViagem({ d, salvando, executar, extra }: { d: DetalheOperacao; salvando: boolean; executar: Executar; extra?: React.ReactNode }) {
  const o = d.operacao
  const [motivoFechamento, setMotivoFechamento] = useState('')
  async function fechar() {
    await executar(async () => {
      const { error } = await supabase
        .from('operacoes')
        .update({ status: 'fechada', ...(motivoFechamento.trim() ? { fechamento_motivo: motivoFechamento.trim() } : {}) })
        .eq('id', o.id)
      if (error) throw error
    }, 'Operação fechada.')
  }
  return (
    <div className="flex flex-col gap-3">
      <DatasPrevistas d={d} salvando={salvando} executar={executar} />
      <div className="text-xs text-[color:var(--rbr-muted)]">
        <ViagemCompacta d={d} />
      </div>
      {extra}
      {o.status === 'entregue' && (
        <div className="flex flex-col gap-2">
          <div className="text-xs text-[color:var(--rbr-muted)]">Fecha quando cliente, motorista e fornecedores estiverem pagos. Se algo ficar pendente por decisão sua, informe o motivo.</div>
          <div className="flex gap-2 flex-wrap">
            <input
              aria-label="Motivo para fechar com valores em aberto"
              placeholder="Motivo para fechar com valores em aberto (opcional)"
              value={motivoFechamento}
              onChange={(e) => setMotivoFechamento(e.target.value)}
              className={inputClass}
              style={{ ...inputStyle, maxWidth: 420 }}
            />
            <button type="button" disabled={salvando} onClick={() => void fechar()} className="text-xs font-bold px-3 py-2 rounded-lg disabled:opacity-50" style={{ background: 'var(--rbr-navy)', color: '#fff' }}>
              Fechar operação
            </button>
          </div>
        </div>
      )}
      {o.status === 'fechada' && o.fechamento_motivo && <div className="text-xs text-[color:var(--rbr-muted)]">Fechada com pendência: {o.fechamento_motivo}</div>}
    </div>
  )
}

// Correção manual de status (menu "Mais ações"). Regras continuam valendo.
function CorrigirStatus({ d, salvando, executar }: { d: DetalheOperacao; salvando: boolean; executar: Executar }) {
  const o = d.operacao
  const [novo, setNovo] = useState<StatusOperacao>(o.status)
  return (
    <div className="rounded-xl border p-3 flex flex-col gap-2" style={{ borderColor: 'var(--rbr-border)' }}>
      <div className="text-xs font-bold">Corrigir status</div>
      <div className="text-[11px] text-[color:var(--rbr-muted)]">Correção manual (ex.: o app do motorista falhou). As regras de liberação continuam valendo.</div>
      <div className="flex gap-2 flex-wrap">
        <select aria-label="Novo status" value={novo} onChange={(e) => setNovo(e.target.value as StatusOperacao)} className={inputClass} style={{ ...inputStyle, maxWidth: 260 }}>
          {STATUS_ORDEM.filter((s) => s !== 'cancelada').map((s) => (
            <option key={s} value={s}>
              {STATUS_OPERACAO_LABEL[s]}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={salvando || novo === o.status}
          onClick={() =>
            void executar(async () => {
              const { error } = await supabase.from('operacoes').update({ status: novo }).eq('id', o.id)
              if (error) throw error
            }, `Status alterado para ${STATUS_OPERACAO_LABEL[novo]}.`)
          }
          className="text-xs font-bold px-3 py-2 rounded-lg disabled:opacity-50"
          style={{ background: 'var(--rbr-navy)', color: '#fff' }}
        >
          Aplicar
        </button>
      </div>
      {o.status === 'cancelada' && (
        <div className="text-xs" style={{ color: 'var(--rbr-danger)' }}>
          Cancelada {o.cancelada_em ? `em ${formatDate(o.cancelada_em)}` : ''} — {o.motivo_cancelamento}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Rodapé recolhido: documentos dispensados (operação de teste ou dispensa do gestor), sem lista na tela principal.
function Dispensados({ d, executar }: { d: DetalheOperacao; executar: Executar }) {
  const [aberto, setAberto] = useState(false)
  const lista = d.documentos.filter((x) => !x.exigido && x.dispensa_motivo && x.status !== 'emitido')
  if (lista.length === 0) return null
  const nome = (t: string) => TIPO_DOC_LABEL[t as keyof typeof TIPO_DOC_LABEL] ?? t
  return (
    <div className="text-[11px] text-[color:var(--rbr-muted)]">
      <button type="button" onClick={() => setAberto((v) => !v)} className="underline" aria-expanded={aberto}>
        Dispensados: {lista.map((x) => nome(x.tipo)).join(', ')}
      </button>
      {aberto && (
        <div className="flex flex-col gap-1 mt-1.5">
          {lista.map((x) => (
            <div key={x.id} className="flex items-center gap-2 flex-wrap">
              <span>
                <b>{nome(x.tipo)}</b>: {x.dispensa_motivo}
              </span>
              <button
                type="button"
                className="underline font-semibold"
                onClick={() =>
                  void executar(async () => {
                    const { error } = await supabase.from('documentacao_operacao').update({ exigido: true, dispensa_motivo: null }).eq('id', x.id)
                    if (error) throw error
                  })
                }
              >
                voltar a exigir
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Ficha para a assessoria (menu "Mais ações").
function FichaAssessoria({ d, assessoria }: { d: DetalheOperacao; assessoria: AssessoriaContato }) {
  const secoes = useMemo(() => montarFicha(d), [d])
  const faltando = useMemo(() => camposFaltando(secoes), [secoes])
  const [aviso, setAviso] = useState<string | null>(null)
  const [ver, setVer] = useState(false)
  const nomeArquivo = `ficha-emissao-${d.operacao.id.slice(0, 8)}.pdf`
  const rota = d.cotacao ? `${d.cotacao.cidade_origem}/${d.cotacao.uf_origem} → ${d.cotacao.cidade_destino}/${d.cotacao.uf_destino}` : ''
  const mensagem = `Olá${assessoria.nome ? `, ${assessoria.nome}` : ''}! Segue a ficha de emissão da operação ${d.operacao.id
    .slice(0, 8)
    .toUpperCase()} (${rota}) — documentos: ${d.documentos
    .filter((x) => x.exigido)
    .map((x) => TIPO_DOC_LABEL[x.tipo] ?? x.tipo)
    .join(', ')}. O PDF vai em anexo.`

  // jsPDF é pesado — carrega quando a ficha abre e já deixa o PDF pronto (o "Compartilhar" precisa ser logo no clique).
  const [pdfPronto, setPdfPronto] = useState<Blob | null>(null)
  useEffect(() => {
    let cancelado = false
    setPdfPronto(null)
    import('../../lib/fichaPdf')
      .then(({ gerarFichaPdf }) => {
        if (!cancelado) setPdfPronto(gerarFichaPdf(d, secoes))
      })
      .catch(() => {
        /* gera na hora do clique */
      })
    return () => {
      cancelado = true
    }
  }, [d, secoes])

  async function pdf(): Promise<Blob> {
    if (pdfPronto) return pdfPronto
    const { gerarFichaPdf } = await import('../../lib/fichaPdf')
    return gerarFichaPdf(d, secoes)
  }

  function salvarArquivo(blob: Blob) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = nomeArquivo
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  async function baixar() {
    try {
      salvarArquivo(await pdf())
    } catch (e) {
      setAviso(`Não consegui gerar o PDF: ${e instanceof Error ? e.message : String(e)}`)
      throw e
    }
  }

  async function compartilhar() {
    setAviso(null)
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean }
    try {
      const file = new File([pdfPronto ?? (await pdf())], nomeArquivo, { type: 'application/pdf' })
      if (nav.canShare && nav.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'Ficha de emissão', text: mensagem })
          return
        } catch (e) {
          if ((e as { name?: string })?.name === 'AbortError') return
        }
      }
      salvarArquivo(file)
      setAviso('Este navegador não compartilhou o arquivo direto — o PDF foi baixado; anexe no WhatsApp ou no e-mail.')
    } catch (e) {
      setAviso(`Não consegui gerar o PDF: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function whatsapp() {
    setAviso(null)
    const janela = window.open('about:blank', '_blank')
    try {
      await baixar()
    } catch {
      janela?.close()
      return
    }
    const numero = digitos(assessoria.whatsapp)
    const destino = numero ? `https://wa.me/${numero.length <= 11 ? `55${numero}` : numero}` : 'https://wa.me/'
    const url = `${destino}?text=${encodeURIComponent(mensagem)}`
    if (janela) janela.location.href = url
    else window.open(url, '_blank', 'noopener')
    setAviso('PDF baixado e WhatsApp aberto — anexe o arquivo na conversa.')
  }

  async function email() {
    setAviso(null)
    try {
      await baixar()
    } catch {
      return
    }
    const assunto = `Ficha de emissão — operação ${d.operacao.id.slice(0, 8).toUpperCase()} (${rota})`
    const corpo = `${mensagem}\n\n${textoFicha(d, secoes)}`
    window.location.href = `mailto:${assessoria.email}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo.slice(0, 1800))}`
    setAviso('PDF baixado e e-mail aberto (a ficha também vai no corpo) — anexe o PDF antes de enviar.')
  }

  return (
    <div className="flex flex-col gap-3">
      <span
        className="self-start text-[11px] font-bold px-2.5 py-1 rounded-full"
        style={faltando.length ? { background: '#FBE9E9', color: 'var(--rbr-danger)' } : { background: '#E7F5EC', color: 'var(--rbr-positive)' }}
      >
        {faltando.length ? `${faltando.length} campo(s) faltando` : 'completa'}
      </span>
      {faltando.length > 0 && (
        <div className="text-[11px] flex flex-wrap gap-1">
          {faltando.map((f) => (
            <span key={`${f.secao}-${f.campo}`} className="px-1.5 py-0.5 rounded" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
              {f.secao}: {f.campo}
            </span>
          ))}
        </div>
      )}
      {!assessoria.whatsapp && !assessoria.email && (
        <div className="text-[11px] text-[color:var(--rbr-muted)]">Cadastre o WhatsApp/e-mail da assessoria em “Dados de emissão”, no topo da página.</div>
      )}
      <div className="flex gap-2 flex-wrap">
        <button type="button" onClick={() => void whatsapp()} className="text-xs font-bold px-3.5 py-2 rounded-lg" style={{ background: '#1F8F4E', color: '#fff' }}>
          Enviar por WhatsApp
        </button>
        <button type="button" onClick={() => void email()} className="text-xs font-bold px-3.5 py-2 rounded-lg" style={{ background: 'var(--rbr-navy)', color: '#fff' }}>
          Enviar por e-mail
        </button>
        <button type="button" onClick={() => void compartilhar()} className="text-xs font-bold px-3.5 py-2 rounded-lg border" style={{ borderColor: 'var(--rbr-navy)', color: 'var(--rbr-navy)' }}>
          Compartilhar PDF
        </button>
        <button type="button" onClick={() => void baixar()} className="text-xs font-bold px-3.5 py-2 rounded-lg border" style={{ borderColor: 'var(--rbr-border)' }}>
          Baixar PDF
        </button>
        <button type="button" onClick={() => setVer((v) => !v)} className="text-xs underline font-semibold">
          {ver ? 'esconder ficha' : 'ver ficha'}
        </button>
      </div>
      {aviso && <div className="text-[11px] text-[color:var(--rbr-muted)]">{aviso}</div>}
      {ver && (
        <div className="flex flex-col gap-2">
          {secoes.map((s) => (
            <div key={s.titulo}>
              <div className="text-[10px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] mb-0.5">{s.titulo}</div>
              {s.linhas.map((ln) => (
                <div key={ln.campo} className="text-xs flex gap-2">
                  <span className="text-[color:var(--rbr-muted)] min-w-[170px]">{ln.campo}</span>
                  <span style={{ color: ln.faltando ? 'var(--rbr-danger)' : undefined, fontWeight: ln.faltando ? 700 : 400 }}>{ln.valor}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export type { IdEtapa }
