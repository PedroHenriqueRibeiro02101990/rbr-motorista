import { useState } from 'react'
import { formatMoney } from '@rbr/shared/format'
import { faltamCaracteres, motivoValido, passoLibera, pendencias, type Corrigir, type Linha, type Passo, type Previa } from '../../lib/ciotCartao'

// Cartão visual do CIOT (4 estados). Só apresenta: quem chama a função é CiotEfrete; /demo-ciot usa o mesmo cartão com dados de mentira.

export type PedidoCiot = {
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
  cancelamento_motivo?: string | null
  confirmado_por_nome: string | null
  confirmado_em: string | null
  ultimo_erro: string | null
}
export type PagamentoCiot = { categoria: string; valor: number; status: string; data_liberacao: string }

const PAG_ROTULO: Record<string, string> = { Adiantamento: 'Adiantamento', Quitacao: 'Saldo', Estadia: 'Estadia', SemCategoria: 'Outro' }
const PAG_STATUS: Record<string, { rotulo: string; cor: string; fundo: string }> = {
  pendente: { rotulo: 'Pendente', cor: '#8A5A00', fundo: '#FDF1DC' },
  registrado: { rotulo: 'Registrado', cor: 'var(--rbr-navy)', fundo: 'var(--rbr-muted-bg)' },
  liquidado: { rotulo: 'Pago', cor: 'var(--rbr-positive)', fundo: '#E8F5EC' },
  estornado: { rotulo: 'Estornado', cor: 'var(--rbr-danger)', fundo: '#FBE9E9' },
  cancelado: { rotulo: 'Cancelado', cor: 'var(--rbr-muted)', fundo: 'var(--rbr-muted-bg)' },
  erro: { rotulo: 'Erro', cor: 'var(--rbr-danger)', fundo: '#FBE9E9' },
}
const dataHora = (v: string | null) => (v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')
const botao = 'text-xs font-bold px-3.5 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed'
const borda = { borderColor: 'var(--rbr-border)' }

function Pill({ children, cor, fundo }: { children: React.ReactNode; cor: string; fundo: string }) {
  return (
    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: fundo, color: cor }}>
      {children}
    </span>
  )
}

export function FaixaFixa({ texto }: { texto: string }) {
  return (
    <div className="fixed top-0 inset-x-0 z-[60] text-center text-xs font-bold py-1.5" style={{ background: '#8A5A00', color: '#fff' }} role="status">
      {texto}
    </div>
  )
}

function Modal({ titulo, children, onFechar }: { titulo: string; children: React.ReactNode; onFechar: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: 'rgba(18,23,61,.55)' }} role="dialog" aria-modal="true" aria-label={titulo} onKeyDown={(e) => e.key === 'Escape' && onFechar()}>
      <div className="bg-white rounded-xl p-4 w-full max-w-md flex flex-col gap-3">
        <div className="text-sm font-bold text-[color:var(--rbr-navy-dark)]">{titulo}</div>
        {children}
      </div>
    </div>
  )
}

export type PropsCartao = {
  rotuloCaminhao: string
  ambiente: string | null
  ehTeste: boolean
  demo?: boolean
  pedido: PedidoCiot | null
  pagamentos: PagamentoCiot[]
  previa: Previa | null
  linhas: Linha[]
  passos: Passo[]
  naoCancela: string | null
  ocupado: string | null
  erro: string | null
  erroOriginal: string | null
  info: string | null
  transacoes: Record<string, unknown>[] | null
  linkCorrigir: (c: Corrigir) => string | null
  onCorrigir?: (c: Corrigir) => void
  onEmitir: () => void
  onConsultar: () => void
  onPdf: () => void
  onTransacoes: () => void
  onCancelar: (motivo: string) => Promise<boolean>
}

export default function CartaoCiot(p: PropsCartao) {
  const [confirmando, setConfirmando] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const ped = p.pedido
  const emitido = ped?.status === 'emitido' || ped?.status === 'encerrado'
  const cancelado = ped?.status === 'cancelado'
  const comErro = ped?.status === 'erro'
  const faltam = pendencias(p.linhas)
  const passoPendente = p.passos.find((x) => !passoLibera(x.estado))
  const bloqueado = faltam > 0 || !!passoPendente || !p.previa?.pedido
  const ocupado = !!p.ocupado

  const rotuloEmitir = passoPendente
    ? `Falta: ${passoPendente.rotulo.toLowerCase()}`
    : faltam > 0
      ? `Faltam ${faltam} ${faltam === 1 ? 'item' : 'itens'} para emitir`
      : p.ocupado === 'emitir'
        ? 'Emitindo…'
        : comErro
          ? 'Tentar de novo'
          : 'Emitir CIOT'

  return (
    <div className="rounded-xl border p-3.5 flex flex-col gap-3 bg-white" style={borda}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-sm font-bold text-[color:var(--rbr-navy-dark)]">CIOT · {p.rotuloCaminhao}</div>
        <div className="flex gap-1.5 items-center">
          {p.ehTeste && <Pill cor="#8A5A00" fundo="#FDF1DC">Teste</Pill>}
          {p.ambiente === 'homologacao' && <Pill cor="#8A5A00" fundo="#FDF1DC">Homologação</Pill>}
        </div>
      </div>

      {/* Antes de emitir (ou depois de erro): conferência e botão */}
      {!emitido && !cancelado && (
        <div className="grid gap-3 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="rounded-lg border p-3 flex flex-col" style={borda}>
            <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] mb-1">Conferência antes de emitir</div>
            {p.passos.map((x) => (
              <div key={x.rotulo} className="flex items-center gap-2 py-1.5 border-b text-xs" style={borda}>
                <span className="font-bold" style={{ color: passoLibera(x.estado) ? 'var(--rbr-positive)' : 'var(--rbr-danger)' }}>{passoLibera(x.estado) ? '✓' : '!'}</span>
                <span className="flex-1">
                  <b className="block">{x.rotulo.replace(' autorizado', '').replace(' feita', '')}</b>
                  <span className="text-[color:var(--rbr-muted)]">
                    {x.estado === 'ok' ? 'Pronto' : x.estado === 'nao_exigido' ? 'Não exigido nesta operação' : x.estado === 'nao_exigido_teste' ? 'Não exigido no teste' : 'Emita antes do CIOT'}
                  </span>
                </span>
                <Pill cor="var(--rbr-navy)" fundo="var(--rbr-muted-bg)">Fiscal</Pill>
              </div>
            ))}
            {p.linhas.length === 0 && <div className="text-xs text-[color:var(--rbr-muted)] py-2">Conferindo os dados…</div>}
            {p.linhas.map((l) => {
              const href = l.corrigir ? p.linkCorrigir(l.corrigir) : null
              return (
                <div key={l.id} className="flex items-start gap-2 py-1.5 border-b last:border-b-0 text-xs" style={borda}>
                  <span className="font-bold" style={{ color: l.ok ? 'var(--rbr-positive)' : 'var(--rbr-danger)' }}>{l.ok ? '✓' : '!'}</span>
                  <span className="flex-1 min-w-0">
                    <b className="block">{l.titulo}</b>
                    <span style={{ color: l.ok ? 'var(--rbr-muted)' : 'var(--rbr-danger)' }}>{l.detalhe}</span>
                  </span>
                  {l.ok ? (
                    <Pill cor="var(--rbr-navy)" fundo="var(--rbr-muted-bg)">{l.origem}</Pill>
                  ) : l.corrigir && (href || p.onCorrigir) ? (
                    href ? (
                      <a href={href} className="font-bold underline text-[color:var(--rbr-navy)] whitespace-nowrap">Corrigir ›</a>
                    ) : (
                      <button type="button" className="font-bold underline text-[color:var(--rbr-navy)] whitespace-nowrap" onClick={() => p.onCorrigir?.(l.corrigir!)}>Corrigir ›</button>
                    )
                  ) : null}
                </div>
              )
            })}
            {(p.previa?.avisos ?? []).map((a) => (
              <div key={a} className="rounded px-2 py-1 mt-2 text-xs" style={{ background: '#FDF1DC', color: '#8A5A00' }}>{a}</div>
            ))}
          </div>

          <div className="rounded-lg border p-3 flex flex-col gap-2 content-start" style={borda}>
            <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">Emitir</div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs m-0">
              <dt className="text-[color:var(--rbr-muted)]">Ambiente</dt>
              <dd className="m-0 font-semibold">{p.ambiente === 'homologacao' ? 'Homologação' : (p.ambiente ?? '—')}</dd>
              <dt className="text-[color:var(--rbr-muted)]">{p.rotuloCaminhao.split(' · ')[0]}</dt>
              <dd className="m-0 font-semibold">{p.previa?.pedido?.placas[0] ?? '—'}</dd>
              <dt className="text-[color:var(--rbr-muted)]">Frete</dt>
              <dd className="m-0 font-semibold tabular-nums">{p.previa?.pedido ? formatMoney(p.previa.pedido.frete) : '—'}</dd>
              <dt className="text-[color:var(--rbr-muted)]">Pagamentos</dt>
              <dd className="m-0 font-semibold">{p.previa?.pedido ? `${p.previa.pedido.pagamentos.length} parcelas` : '—'}</dd>
            </dl>
            {comErro && (
              <div className="rounded-lg px-3 py-2 text-xs flex flex-col gap-1" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
                <b>A efrete recusou a emissão.</b>
                <span>{ped?.ultimo_erro ?? p.erro}</span>
                {p.erroOriginal && <span className="font-mono text-[11px] break-words">{p.erroOriginal}</span>}
                <span className="text-[color:var(--rbr-muted)]">Tentar de novo não gera outro CIOT: antes de emitir, o sistema pergunta à efrete se esta operação já tem um.</span>
              </div>
            )}
            <button type="button" disabled={bloqueado || ocupado} onClick={() => setConfirmando(true)} className={botao} style={{ background: 'var(--rbr-navy)', color: '#fff' }}>
              {rotuloEmitir}
            </button>
            <div className="text-[11px] text-[color:var(--rbr-muted)]">O protocolo é gravado antes de ler a resposta. Clicar de novo não gera outro CIOT.</div>
          </div>
        </div>
      )}

      {/* Emitido ou cancelado: dados */}
      {ped && (emitido || cancelado) && (
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">CIOT</div>
              <div className="text-xl font-bold tabular-nums text-[color:var(--rbr-navy-dark)]">
                {ped.ciot}
                {ped.ciot_verificador ? <span className="text-[color:var(--rbr-muted)]">-{ped.ciot_verificador}</span> : null}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">Situação</div>
              <div className="mt-1">
                {cancelado ? <Pill cor="var(--rbr-muted)" fundo="var(--rbr-muted-bg)">Cancelado</Pill> : ped.status === 'encerrado' ? <Pill cor="var(--rbr-navy)" fundo="var(--rbr-muted-bg)">Encerrado</Pill> : <Pill cor="var(--rbr-positive)" fundo="#E8F5EC">Emitido</Pill>}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">Protocolo</div>
              <div className="text-sm font-semibold break-all">{ped.protocolo ?? '—'}</div>
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">Emitido em</div>
              <div className="text-sm font-semibold">{dataHora(ped.emitido_em)}</div>
            </div>
          </div>
          <div className="text-xs text-[color:var(--rbr-muted)]">
            Frete {formatMoney(ped.valor_frete)} · piso ANTT {formatMoney(ped.piso_minimo)} · confirmado por {ped.confirmado_por_nome ?? '—'} em {dataHora(ped.confirmado_em)}
          </div>
          {cancelado && (
            <div className="rounded-lg px-3 py-2 text-xs" style={{ background: 'var(--rbr-muted-bg)' }}>
              Cancelado em {dataHora(ped.cancelado_em)} (protocolo {ped.cancelamento_protocolo ?? '—'}){ped.cancelamento_motivo ? `. Motivo: ${ped.cancelamento_motivo}` : ''}
            </div>
          )}
          {p.pagamentos.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-[color:var(--rbr-muted)]">
                    <th className="py-1.5 pr-3">Tipo</th>
                    <th className="py-1.5 pr-3 text-right">Valor</th>
                    <th className="py-1.5 pr-3">Situação</th>
                    <th className="py-1.5">Liberação</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {p.pagamentos.map((g, i) => {
                    const s = PAG_STATUS[g.status] ?? { rotulo: g.status, cor: 'var(--rbr-navy)', fundo: 'var(--rbr-muted-bg)' }
                    return (
                      <tr key={i} className="border-t" style={borda}>
                        <td className="py-1.5 pr-3">{PAG_ROTULO[g.categoria] ?? g.categoria}</td>
                        <td className="py-1.5 pr-3 text-right">{formatMoney(g.valor)}</td>
                        <td className="py-1.5 pr-3"><Pill cor={s.cor} fundo={s.fundo}>{s.rotulo}</Pill></td>
                        <td className="py-1.5">{dataHora(g.data_liberacao)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {p.transacoes && (
            <div className="text-xs">
              {p.transacoes.length === 0
                ? 'Nenhuma transação ainda (o Pix só aparece depois da data de liberação).'
                : p.transacoes.map((t, i) => (
                    <div key={i} className="tabular-nums">{String(t.TipoDeCobranca ?? t.Tipo ?? 'Transação')} · {String(t.Status ?? '')} · {formatMoney(Number(t.Valor ?? 0))}</div>
                  ))}
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            {!cancelado && (
              <button type="button" disabled={ocupado} onClick={p.onConsultar} className={`${botao} text-white`} style={{ background: 'var(--rbr-navy)' }}>
                {p.ocupado === 'consultar' ? 'Consultando…' : 'Consultar'}
              </button>
            )}
            <button type="button" disabled={ocupado} onClick={p.onPdf} className={`${botao} border`} style={{ borderColor: 'var(--rbr-navy)', color: 'var(--rbr-navy)' }}>
              {p.ocupado === 'pdf' ? 'Baixando…' : 'Baixar PDF'}
            </button>
            {!cancelado && (
              <button type="button" disabled={ocupado} onClick={p.onTransacoes} className={`${botao} border`} style={{ borderColor: 'var(--rbr-navy)', color: 'var(--rbr-navy)' }}>
                Transações (Pix)
              </button>
            )}
            {ped.status === 'emitido' && (
              <button type="button" disabled={ocupado || !!p.naoCancela} onClick={() => setCancelando(true)} className={`${botao} border`} style={{ borderColor: 'var(--rbr-danger)', color: 'var(--rbr-danger)' }}>
                Cancelar CIOT
              </button>
            )}
          </div>
          {p.naoCancela && ped.status === 'emitido' && <div className="text-xs rounded-lg px-3 py-2" style={{ background: '#FDF1DC', color: '#8A5A00' }}>{p.naoCancela}</div>}
          {ped.status === 'emitido' && <div className="text-xs rounded-lg px-3 py-2" style={{ background: '#EEF2FF', color: 'var(--rbr-navy)' }}>Próximo passo: <b>MDF-e</b>. É o último documento e leva o CIOT.</div>}
          {cancelado && <div className="text-xs text-[color:var(--rbr-muted)]">Para emitir outro CIOT desta operação, a efrete exige uma nova referência. Peça a liberação a um gestor.</div>}
        </div>
      )}

      {p.info && <div className="text-xs rounded-lg px-3 py-2" style={{ background: '#E8F5EC', color: 'var(--rbr-positive)' }}>{p.info}</div>}
      {p.erro && !comErro && !cancelando && !confirmando && (
        <div className="text-xs rounded-lg px-3 py-2" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
          {p.erro}
          {p.erroOriginal && <div className="font-mono text-[11px] mt-1 break-words">{p.erroOriginal}</div>}
        </div>
      )}
      <div className="text-[11px] text-[color:var(--rbr-muted)]">Se a efrete estiver fora do ar, digite o CIOT à mão no bloco "CIOT" da operação: o caminho manual continua valendo.</div>

      {confirmando && (
        <Modal titulo="Emitir o CIOT agora?" onFechar={() => setConfirmando(false)}>
          <div className="text-xs text-[color:var(--rbr-muted)]">
            Frete {p.previa?.pedido ? formatMoney(p.previa.pedido.frete) : '—'} · {p.previa?.pedido?.placas.join(' + ')}. Seu nome e a hora ficam registrados como confirmação.
            {p.ambiente === 'homologacao' && <b className="block mt-1">Homologação: nenhum CIOT real.</b>}
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setConfirmando(false)} className={`${botao} border`} style={borda}>Voltar</button>
            <button type="button" onClick={() => { setConfirmando(false); p.onEmitir() }} className={botao} style={{ background: 'var(--rbr-navy)', color: '#fff' }}>Confirmar e emitir</button>
          </div>
        </Modal>
      )}

      {cancelando && (
        <Modal titulo={`Cancelar CIOT ${ped?.ciot ?? ''}`} onFechar={() => setCancelando(false)}>
          <div className="text-xs text-[color:var(--rbr-muted)]">O cancelamento não pode ser desfeito. Conte o motivo (mínimo 15 caracteres).</div>
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} className="border rounded-lg px-3 py-2 text-sm w-full" style={borda} placeholder="Motivo do cancelamento" autoFocus />
          <div className="text-[11px] text-[color:var(--rbr-muted)]">{motivoValido(motivo) ? 'Motivo suficiente.' : `Faltam ${faltamCaracteres(motivo)} caracteres.`}</div>
          {p.erro && <div className="text-xs" style={{ color: 'var(--rbr-danger)' }}>{p.erro}</div>}
          <div className="flex gap-2 justify-end">
            <button type="button" disabled={ocupado} onClick={() => { setCancelando(false); setMotivo('') }} className={`${botao} border`} style={borda}>Voltar</button>
            <button
              type="button"
              disabled={ocupado || !motivoValido(motivo)}
              onClick={async () => {
                if (await p.onCancelar(motivo.trim())) {
                  setCancelando(false)
                  setMotivo('')
                }
              }}
              className={botao}
              style={{ background: 'var(--rbr-danger)', color: '#fff' }}
            >
              {p.ocupado === 'cancelar' ? 'Cancelando…' : 'Confirmar cancelamento'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
