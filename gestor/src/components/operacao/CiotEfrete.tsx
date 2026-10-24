import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { formatMoney } from '@rbr/shared/format'
import { CIOT_EFRETE_HABILITADO } from '../../lib/efreteFlags'

// Passo 4: CIOT pela efrete ligado à operação (Edge Function efrete-ciot-operacao). Prévia com o piso mínimo da ANTT,
// confirmação humana (o nome do gestor e a hora ficam no pedido), estado, PDF, transações, encerrar e cancelar.
// Nesta fase a função só roda na HOMOLOGAÇÃO da efrete. Se a efrete cair, o CIOT continua podendo ser digitado à mão
// no bloco "CIOT" da operação.

type Piso = { ok: true; piso: number; tabela: string; tipoCarga: string; eixos: number; distanciaKm: number } | { ok: false; motivo: string }
type Previa = {
  ok: boolean
  motivo?: string
  piso?: Piso
  diferencaPiso?: number | null
  bloqueios?: string[]
  avisos?: string[]
  pedido?: {
    referencia: string
    inicio: string
    fim: string
    frete: number
    pagamentos: { categoria: string; valor: number; liberacao: string }[]
    pix: string
    placas: string[]
    notas: number
    pesoKg: number
    ncm: string
    distanciaKm: number
  } | null
}
type Pedido = {
  status: 'pendente' | 'emitido' | 'erro' | 'cancelado' | 'encerrado'
  ciot: string | null
  ciot_verificador: string | null
  protocolo: string | null
  valor_frete: number | null
  piso_minimo: number | null
  emitido_em: string | null
  cancelado_em: string | null
  encerrado_em: string | null
  cancelamento_protocolo: string | null
  encerramento_protocolo: string | null
  confirmado_por_nome: string | null
  confirmado_em: string | null
  ultimo_erro: string | null
}
type Resposta = { ok: boolean; motivo?: string; mensagem?: string; protocolo?: string | null; [k: string]: unknown }

const STATUS: Record<Pedido['status'], { rotulo: string; cor: string }> = {
  pendente: { rotulo: 'Pendente', cor: '#8A5A00' },
  emitido: { rotulo: 'Emitido', cor: 'var(--rbr-positive)' },
  erro: { rotulo: 'Erro', cor: 'var(--rbr-danger)' },
  cancelado: { rotulo: 'Cancelado', cor: 'var(--rbr-muted)' },
  encerrado: { rotulo: 'Encerrado', cor: 'var(--rbr-navy)' },
}
const dataHora = (v: string | null) => (v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—')
const botao = 'text-xs font-bold px-3.5 py-2 rounded-lg disabled:opacity-60'

async function chamar(body: Record<string, unknown>): Promise<Resposta> {
  const { data, error } = await supabase.functions.invoke<Resposta>('efrete-ciot-operacao', { body })
  if (error) {
    // Erro HTTP: a função devolve {motivo} no corpo.
    const ctx = (error as { context?: Response }).context
    const corpo = ctx ? await ctx.json().catch(() => null) : null
    return { ok: false, motivo: (corpo as Resposta | null)?.motivo ?? error.message }
  }
  return data ?? { ok: false, motivo: 'Sem resposta da função.' }
}

// Com a flag desligada não renderiza nada e não chama a efrete (o CIOT manual é o caminho principal).
export default function CiotEfrete(props: { operacaoId: string; onMudou?: () => void }) {
  if (!CIOT_EFRETE_HABILITADO) return null
  return <CiotEfreteAtivo {...props} />
}

function CiotEfreteAtivo({ operacaoId, onMudou }: { operacaoId: string; onMudou?: () => void }) {
  const [pedido, setPedido] = useState<Pedido | null | undefined>(undefined)
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [transacoes, setTransacoes] = useState<Record<string, unknown>[] | null>(null)

  const carregar = useCallback(async () => {
    const r = await chamar({ acao: 'status', operacao_id: operacaoId })
    setPedido(r.ok ? ((r.pedido as Pedido | null) ?? null) : null)
  }, [operacaoId])
  useEffect(() => {
    void carregar()
  }, [carregar])

  async function acao(nome: string, body: Record<string, unknown>, sucesso?: (r: Resposta) => string | null) {
    setOcupado(nome)
    setErro(null)
    setInfo(null)
    try {
      const r = await chamar({ ...body, operacao_id: operacaoId })
      if (!r.ok) {
        const msg = r.mensagem ?? r.motivo ?? 'A efrete recusou.'
        setErro(r.protocolo ? `${msg} (protocolo ${r.protocolo})` : msg)
      } else if (sucesso) setInfo(sucesso(r))
      await carregar()
      onMudou?.()
      return r
    } finally {
      setOcupado(null)
    }
  }

  async function verPrevia() {
    setOcupado('previa')
    setErro(null)
    try {
      setPrevia((await chamar({ acao: 'previa', operacao_id: operacaoId })) as unknown as Previa)
    } finally {
      setOcupado(null)
    }
  }

  async function emitir() {
    if (!previa?.pedido) return
    const agora = new Date().toLocaleString('pt-BR')
    if (!window.confirm(`Emitir o CIOT na efrete agora (${agora})?\nFrete ${formatMoney(previa.pedido.frete)}, ${previa.pedido.placas.join(' + ')}.\nSeu nome e a hora ficam registrados como confirmação.`)) return
    const r = await acao('emitir', { acao: 'emitir', confirmar: true }, (x) => `CIOT ${String(x.ciot ?? '')} emitido${x.jaExistia ? ' (já existia na efrete; nada foi emitido de novo)' : ''}.`)
    if (r?.ok) setPrevia(null)
  }

  async function baixarPdf() {
    const r = await acao('pdf', { acao: 'pdf' })
    if (!r?.ok || typeof r.pdfBase64 !== 'string') return
    const bytes = Uint8Array.from(atob(r.pdfBase64), (c) => c.charCodeAt(0))
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
    const a = document.createElement('a')
    a.href = url
    a.download = String(r.nomeArquivo ?? 'CIOT.pdf')
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  async function verTransacoes() {
    const r = await acao('transacoes', { acao: 'transacoes' })
    if (r?.ok) setTransacoes((r.transacoes as Record<string, unknown>[]) ?? [])
  }

  async function cancelar() {
    const motivo = window.prompt('Motivo do cancelamento do CIOT (mín. 15 caracteres):')
    if (!motivo) return
    if (!window.confirm('Cancelar este CIOT na efrete? Não tem volta.')) return
    await acao('cancelar', { acao: 'cancelar', motivo }, (x) => `CIOT cancelado (protocolo ${String(x.protocolo ?? '—')}).`)
  }

  async function encerrar() {
    if (!window.confirm('Encerrar a viagem na efrete (declara que o transporte foi feito)?')) return
    await acao('encerrar', { acao: 'encerrar' }, (x) => `Viagem encerrada (protocolo ${String(x.protocolo ?? '—')}).`)
  }

  if (pedido === undefined) return null
  const st = pedido ? STATUS[pedido.status] : null
  const ativo = pedido?.status === 'emitido'

  return (
    <div className="rounded-xl border p-3.5 flex flex-col gap-3" style={{ borderColor: 'var(--rbr-border)' }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-sm font-bold text-[color:var(--rbr-navy-dark)]">CIOT pela efrete</div>
        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full" style={{ background: '#FDF1DC', color: '#8A5A00' }}>
          homologação
        </span>
      </div>

      {pedido && st && (
        <div className="text-xs flex flex-col gap-1">
          <div className="flex gap-2 items-center flex-wrap">
            <b style={{ color: st.cor }}>{st.rotulo}</b>
            {pedido.ciot && (
              <span className="tabular-nums">
                CIOT <b>{pedido.ciot}</b>
                {pedido.ciot_verificador ? `/${pedido.ciot_verificador}` : ''}
              </span>
            )}
            {pedido.protocolo && <span className="text-[color:var(--rbr-muted)]">protocolo {pedido.protocolo}</span>}
          </div>
          <div className="text-[color:var(--rbr-muted)]">
            Frete {formatMoney(pedido.valor_frete)} · piso ANTT {formatMoney(pedido.piso_minimo)} · confirmado por {pedido.confirmado_por_nome ?? '—'} em {dataHora(pedido.confirmado_em)}
          </div>
          {pedido.status === 'cancelado' && <div>Cancelado em {dataHora(pedido.cancelado_em)} (protocolo {pedido.cancelamento_protocolo ?? '—'})</div>}
          {pedido.status === 'encerrado' && <div>Encerrado em {dataHora(pedido.encerrado_em)} (protocolo {pedido.encerramento_protocolo ?? '—'})</div>}
          {pedido.status === 'erro' && pedido.ultimo_erro && <div style={{ color: 'var(--rbr-danger)' }}>{pedido.ultimo_erro}</div>}
        </div>
      )}

      {(!pedido || pedido.status === 'erro') && (
        <button type="button" disabled={!!ocupado} onClick={() => void verPrevia()} className={`${botao} self-start border`} style={{ borderColor: 'var(--rbr-navy)', color: 'var(--rbr-navy)' }}>
          {ocupado === 'previa' ? 'Montando…' : 'Prévia do CIOT'}
        </button>
      )}

      {previa && (
        <div className="flex flex-col gap-2 rounded-lg p-2.5 text-xs" style={{ background: 'var(--rbr-muted-bg)' }}>
          {previa.motivo && <div style={{ color: 'var(--rbr-danger)' }}>{previa.motivo}</div>}
          {previa.piso && (
            <div>
              {previa.piso.ok ? (
                <>
                  Piso mínimo ANTT <b className="tabular-nums">{formatMoney(previa.piso.piso)}</b> (tabela {previa.piso.tabela}, {previa.piso.tipoCarga}, {previa.piso.eixos} eixos,{' '}
                  {previa.piso.distanciaKm} km)
                  {previa.diferencaPiso != null && (
                    <span style={{ color: previa.diferencaPiso < 0 ? 'var(--rbr-danger)' : 'var(--rbr-positive)' }}>
                      {' '}
                      · diferença {formatMoney(previa.diferencaPiso)}
                    </span>
                  )}
                </>
              ) : (
                <span style={{ color: 'var(--rbr-danger)' }}>Piso: {previa.piso.motivo}</span>
              )}
            </div>
          )}
          {previa.pedido && (
            <div className="tabular-nums">
              {previa.pedido.placas.join(' + ')} · {previa.pedido.notas} NF-e · {previa.pedido.pesoKg.toLocaleString('pt-BR')} kg · NCM {previa.pedido.ncm} · {previa.pedido.distanciaKm} km
              <br />
              Frete {formatMoney(previa.pedido.frete)}: {previa.pedido.pagamentos.map((g) => `${g.categoria} ${formatMoney(g.valor)} (libera ${g.liberacao.replace('T', ' ').slice(0, 16)})`).join(' · ')} · Pix ({previa.pedido.pix})
            </div>
          )}
          {(previa.bloqueios ?? []).map((b) => (
            <div key={b} className="rounded px-2 py-1" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
              {b}
            </div>
          ))}
          {(previa.avisos ?? []).map((a) => (
            <div key={a} className="rounded px-2 py-1" style={{ background: '#FDF1DC', color: '#8A5A00' }}>
              {a}
            </div>
          ))}
          {previa.pedido && !(previa.bloqueios ?? []).length && (
            <button type="button" disabled={!!ocupado} onClick={() => void emitir()} className={`${botao} self-start`} style={{ background: 'var(--rbr-navy)', color: '#fff' }}>
              {ocupado === 'emitir' ? 'Emitindo…' : 'Confirmar e emitir CIOT'}
            </button>
          )}
        </div>
      )}

      {pedido?.ciot && (
        <div className="flex gap-2 flex-wrap">
          <button type="button" disabled={!!ocupado} onClick={() => void baixarPdf()} className={`${botao} border`} style={{ borderColor: 'var(--rbr-navy)', color: 'var(--rbr-navy)' }}>
            {ocupado === 'pdf' ? 'Baixando…' : 'Baixar PDF do CIOT'}
          </button>
          <button type="button" disabled={!!ocupado} onClick={() => void verTransacoes()} className={`${botao} border`} style={{ borderColor: 'var(--rbr-navy)', color: 'var(--rbr-navy)' }}>
            Transações (Pix)
          </button>
          {ativo && (
            <>
              <button type="button" disabled={!!ocupado} onClick={() => void encerrar()} className={`${botao} border`} style={{ borderColor: 'var(--rbr-navy)', color: 'var(--rbr-navy)' }}>
                Encerrar viagem
              </button>
              <button type="button" disabled={!!ocupado} onClick={() => void cancelar()} className={`${botao} border`} style={{ borderColor: 'var(--rbr-danger)', color: 'var(--rbr-danger)' }}>
                Cancelar CIOT
              </button>
            </>
          )}
        </div>
      )}

      {transacoes && (
        <div className="text-xs">
          {transacoes.length === 0
            ? 'Nenhuma transação ainda (o Pix só aparece depois da data de liberação).'
            : transacoes.map((t, i) => (
                <div key={i} className="tabular-nums">
                  {String(t.TipoDeCobranca ?? t.Tipo ?? 'Transação')} · {String(t.Status ?? '')} · {formatMoney(Number(t.Valor ?? 0))}
                </div>
              ))}
        </div>
      )}

      {info && (
        <div className="text-xs rounded-lg px-3 py-2" style={{ background: '#E8F5EC', color: 'var(--rbr-positive)' }}>
          {info}
        </div>
      )}
      {erro && (
        <div className="text-xs rounded-lg px-3 py-2" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
          {erro}
        </div>
      )}
      <div className="text-[11px] text-[color:var(--rbr-muted)]">Se a efrete estiver fora do ar, digite o CIOT à mão no bloco "CIOT" da operação: o caminho manual continua valendo.</div>
    </div>
  )
}
