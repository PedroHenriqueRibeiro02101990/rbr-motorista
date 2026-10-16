import { useState } from 'react'
import { formatMoney } from '@rbr/shared/format'
import {
  PRAZOS,
  ROTULO_PRAZO,
  avaliarDesconto,
  corMargem,
  descontoMaximo,
  escadaDePrazos,
  margem as calcularMargem,
  negociacao,
  type CorMargem,
  type PoliticaPrazo,
  type PrazoPagamento,
} from '@rbr/shared/precoPrazo'

// Política de prazo e desconto (decisão do Pedro, 2026-10-16) no painel de preço. Só informa e sugere: nada aqui
// impede gravar. Abaixo do piso de 26% continua valendo o registro no log de auditoria que já existe.
// Uso interno da RBR: estas regras não vão para o PDF do cliente, a LP nem anúncios.

const inputClass = 'border rounded-lg px-3 py-2 text-sm outline-none'
const inputStyle = { borderColor: 'var(--rbr-border)', background: '#fff' }

const COR: Record<CorMargem, { bg: string; color: string }> = {
  verde: { bg: '#E7F5EC', color: '#15803D' },
  amarelo: { bg: '#FDF1DC', color: '#7A4F00' },
  vermelho: { bg: '#FBE9E9', color: '#B91C1C' },
}

function pct(v: number | null | undefined, casas = 1): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return `${(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas })}%`
}

function ajusteTxt(v: number): string {
  if (v === 0) return '0'
  return `${v > 0 ? '+' : '−'}${pct(Math.abs(v))}`
}

function ChipMargem({ m, politica }: { m: number | null; politica: PoliticaPrazo }) {
  const c = corMargem(m, politica)
  const s = c ? COR[c] : { bg: 'var(--rbr-muted-bg)', color: 'var(--rbr-muted)' }
  return (
    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full tabular-nums whitespace-nowrap" style={{ background: s.bg, color: s.color }}>
      {pct(m)}
    </span>
  )
}

const numPct = (s: string): number | null => {
  const t = s.trim().replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n / 100 : null
}

export interface PrazoDescontoProps {
  politica: PoliticaPrazo
  prazo: '' | PrazoPagamento
  ajustePct: string
  descontoPct: string
  descontoPrazo: '' | PrazoPagamento
  motivo: string
  // Preço a 7 DDL, preço do prazo cotado (com ajuste) e valor final (com desconto), já arredondados.
  valorTabela: number | null
  valorPrazo: number | null
  valorFinal: number | null
  custo: number | null // custo sem imposto
  aliquota: number
  valorFinalManual: boolean
  onEscolherPrazo: (p: '' | PrazoPagamento) => void
  onAjuste: (pctTexto: string) => void
  onDesconto: (pctTexto: string, para: '' | PrazoPagamento) => void
  onMotivo: (texto: string) => void
}

export default function PrazoDesconto(p: PrazoDescontoProps) {
  const [degrausVisiveis, setDegrausVisiveis] = useState(1)
  const [prazoDosDegraus, setPrazoDosDegraus] = useState(p.prazo)
  if (prazoDosDegraus !== p.prazo) {
    setPrazoDosDegraus(p.prazo)
    setDegrausVisiveis(1)
  }

  const custo = p.custo
  const a = p.aliquota
  const sugerido = p.prazo ? p.politica.ajustePorPrazo[p.prazo] : 0
  const ajuste = numPct(p.ajustePct) ?? 0
  const desconto = numPct(p.descontoPct) ?? 0
  const valorCotado = p.valorFinalManual ? p.valorFinal : p.valorPrazo
  const m0 = valorCotado != null && custo != null ? calcularMargem(valorCotado, custo, a) : null
  const dMax = m0 != null ? descontoMaximo(m0, a, p.politica.margemPiso) : null
  const escada = p.valorTabela != null && custo != null && !p.valorFinalManual ? escadaDePrazos(p.valorTabela, custo, a, p.politica) : []
  const neg =
    p.prazo && valorCotado != null && custo != null && !p.valorFinalManual
      ? negociacao(p.prazo, valorCotado, custo, a, p.politica, p.valorTabela)
      : null
  const aval = desconto > 0 && valorCotado != null && custo != null ? avaliarDesconto(desconto, valorCotado, custo, a, p.politica) : null

  return (
    <div className="rounded-lg border p-3.5 flex flex-col gap-3" style={{ borderColor: 'var(--rbr-border)' }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-sm font-bold text-[color:var(--rbr-navy-dark)]">Prazo de pagamento e desconto</span>
        <span className="text-[11px] text-[color:var(--rbr-muted)]">Uso interno · não vai para o PDF do cliente</span>
      </div>

      <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Prazo de pagamento do cliente">
        {PRAZOS.map((x) => {
          const ativo = p.prazo === x
          return (
            <button
              key={x}
              type="button"
              aria-pressed={ativo}
              onClick={() => p.onEscolherPrazo(ativo ? '' : x)}
              className="text-xs font-semibold px-3 rounded-full border"
              style={{
                minHeight: 36,
                borderColor: ativo ? 'var(--rbr-navy)' : 'var(--rbr-border)',
                background: ativo ? 'var(--rbr-navy)' : '#fff',
                color: ativo ? '#fff' : 'var(--rbr-navy-dark)',
              }}
            >
              {ROTULO_PRAZO[x]}
            </button>
          )
        })}
      </div>
      <div className="text-[11px] text-[color:var(--rbr-muted)]">
        DDL conta da emissão do boleto, na liberação do motorista. À vista = Pix na entrega. Antecipado = Pix confirmado antes de
        liberar. {p.prazo ? 'O prazo escolhido vira a regra de recebimento desta cotação.' : 'Sem prazo escolhido: preço da cotação e recebimento no padrão (30 dias após a entrega).'}
      </div>

      {p.valorFinalManual ? (
        <div className="text-xs rounded-lg px-3 py-2" style={{ background: 'var(--rbr-muted-bg)', color: 'var(--rbr-navy-dark)' }}>
          Valor final digitado à mão: ele já é o preço final, sem ajuste de prazo nem desconto por cima. O prazo escolhido fica
          registrado.
        </div>
      ) : (
        p.prazo && (
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <label htmlFor="ajuste-prazo" className="font-semibold text-[color:var(--rbr-navy-dark)]">
              Ajuste pelo prazo (sugerido {ajusteTxt(sugerido)})
            </label>
            <input
              id="ajuste-prazo"
              inputMode="decimal"
              value={p.ajustePct}
              onChange={(e) => p.onAjuste(e.target.value.replace(/[^\d,.-]/g, ''))}
              className={inputClass}
              style={{ ...inputStyle, width: 80, textAlign: 'right' }}
            />
            <span>%</span>
            {ajuste !== 0 && (
              <button type="button" onClick={() => p.onAjuste('0')} className="font-semibold underline text-[color:var(--rbr-navy)]">
                Remover ajuste
              </button>
            )}
            {Math.abs(ajuste - sugerido) > 1e-9 && (
              <button type="button" onClick={() => p.onAjuste(String(Number((sugerido * 100).toFixed(4))))} className="font-semibold underline text-[color:var(--rbr-navy)]">
                Voltar ao sugerido
              </button>
            )}
          </div>
        )
      )}

      {escada.length > 0 && (
        <details>
          <summary className="text-[11px] font-bold cursor-pointer text-[color:var(--rbr-muted)]">Preço em cada prazo (tabela)</summary>
          <div className="mt-2 flex flex-col">
            {escada.map((l) => (
              <div
                key={l.prazo}
                className="grid gap-2 text-xs py-1 items-center"
                style={{
                  gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,.7fr) minmax(0,1fr) auto',
                  fontWeight: l.prazo === p.prazo ? 700 : 400,
                }}
              >
                <span>
                  {ROTULO_PRAZO[l.prazo]}
                  {l.prazo === '7ddl' ? ' (preço da cotação)' : ''}
                </span>
                <span className="text-right tabular-nums">{ajusteTxt(l.ajuste)}</span>
                <span className="text-right tabular-nums">{formatMoney(l.valor)}</span>
                <ChipMargem m={l.margem} politica={p.politica} />
              </div>
            ))}
          </div>
        </details>
      )}

      {m0 != null && (
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="font-semibold">Margem {p.valorFinalManual ? '' : 'no prazo cotado'}</span>
          <ChipMargem m={m0} politica={p.politica} />
          <span className="font-semibold">Desconto máximo até o piso de {pct(p.politica.margemPiso, 0)}</span>
          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full tabular-nums" style={{ background: 'var(--rbr-muted-bg)' }}>
            {pct(dMax)}
          </span>
        </div>
      )}

      {neg && (
        <div className="flex flex-col gap-2">
          {neg.mensagem && (
            <div className="text-xs font-semibold rounded-lg px-3 py-2" style={{ background: '#FDF1DC', color: '#5C3B00' }}>
              {neg.mensagem}
            </div>
          )}
          {neg.degraus.length === 0 ? (
            <div className="text-[11px] text-[color:var(--rbr-muted)]">
              Nenhuma troca de prazo por desconto definida para {ROTULO_PRAZO[p.prazo as PrazoPagamento]} (Financeiro › Configurações).
            </div>
          ) : (
            <>
              <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">
                Se o cliente pedir desconto · ofereça primeiro o degrau menor
              </div>
              {neg.degraus.slice(0, degrausVisiveis).map((d) => (
                <div key={d.para} className="rounded-lg border px-3 py-2 flex flex-col gap-1.5" style={{ borderColor: 'var(--rbr-border)' }}>
                  <div className="flex justify-between gap-2 flex-wrap text-xs">
                    <span className="font-semibold text-[color:var(--rbr-navy-dark)]">
                      Cliente paga {ROTULO_PRAZO[d.para]} · desconto de {pct(d.sugerido)}
                      {d.maximo > d.sugerido ? ` (até ${pct(d.maximo)})` : ''}
                      {d.raro ? ' · exceção' : ''}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="tabular-nums font-bold">{formatMoney(d.valorSugerido)}</span>
                      <ChipMargem m={d.margemSugerido} politica={p.politica} />
                    </span>
                  </div>
                  <div className="flex justify-between gap-2 flex-wrap text-[11px] text-[color:var(--rbr-muted)]">
                    <span>
                      {d.valorTabelaDestino != null ? `Tabela ${ROTULO_PRAZO[d.para]}: ${formatMoney(d.valorTabelaDestino)} (referência)` : ''}
                      {!d.dentroDaFaixaDeValor ? ' · valor do frete abaixo da faixa: não sugerido' : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => p.onDesconto(String(Number((d.sugerido * 100).toFixed(4))), d.para)}
                      className="font-bold underline text-[color:var(--rbr-navy)]"
                    >
                      Aplicar este degrau
                    </button>
                  </div>
                </div>
              ))}
              {degrausVisiveis < neg.degraus.length && (
                <button
                  type="button"
                  onClick={() => setDegrausVisiveis((n) => n + 1)}
                  className="self-start text-xs font-semibold px-3 rounded-lg border"
                  style={{ minHeight: 36, borderColor: 'var(--rbr-border)', color: 'var(--rbr-navy)' }}
                >
                  Cliente pediu mais: ver próximo degrau
                </button>
              )}
            </>
          )}

          <div className="flex items-center gap-2 flex-wrap text-xs pt-1">
            <label htmlFor="desconto-pct" className="font-semibold text-[color:var(--rbr-navy-dark)]">
              Desconto negociado
            </label>
            <input
              id="desconto-pct"
              inputMode="decimal"
              value={p.descontoPct}
              placeholder="0"
              onChange={(e) => p.onDesconto(e.target.value.replace(/[^\d,.]/g, ''), p.descontoPrazo)}
              className={inputClass}
              style={{ ...inputStyle, width: 80, textAlign: 'right' }}
            />
            <span>%</span>
            <label htmlFor="desconto-prazo" className="sr-only">
              Prazo aceito em troca
            </label>
            <select
              id="desconto-prazo"
              value={p.descontoPrazo}
              onChange={(e) => p.onDesconto(p.descontoPct, e.target.value as '' | PrazoPagamento)}
              className={inputClass}
              style={inputStyle}
            >
              <option value="">em troca de…</option>
              {PRAZOS.filter((x) => x !== p.prazo).map((x) => (
                <option key={x} value={x}>
                  {ROTULO_PRAZO[x]}
                </option>
              ))}
            </select>
            {desconto > 0 && (
              <button type="button" onClick={() => p.onDesconto('', '')} className="font-semibold underline text-[color:var(--rbr-navy)]">
                Tirar desconto
              </button>
            )}
          </div>
          <div className="text-[11px] text-[color:var(--rbr-muted)]">
            O sugerido é ponto de partida: dá para digitar mais, até o desconto máximo até o piso ({pct(dMax)}); nunca acima de{' '}
            {pct(p.politica.tetoDesconto, 0)}. Um desconto por frete, sem acumular. Vale só com pagamento no prazo combinado; atrasou,
            volta ao preço cheio.
          </div>
          {aval && (
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span>
                Com desconto: <strong className="tabular-nums">{formatMoney(aval.valor)}</strong>
              </span>
              <ChipMargem m={aval.margem} politica={p.politica} />
              {!aval.permitido && (
                <span className="font-semibold" style={{ color: '#B91C1C' }}>
                  Acima do teto da política ({pct(p.politica.tetoDesconto, 0)}) — reduza o desconto.
                </span>
              )}
              {aval.permitido && aval.acimaDoMaximo && (
                <span className="font-semibold" style={{ color: '#B91C1C' }}>
                  Passa do desconto máximo: margem abaixo de {pct(p.politica.margemPiso, 0)} (gravação permitida, fica no log de auditoria).
                </span>
              )}
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label htmlFor="desconto-motivo" className="text-xs font-semibold text-[color:var(--rbr-navy-dark)]">
              Motivo do desconto (opcional)
            </label>
            <textarea
              id="desconto-motivo"
              rows={2}
              value={p.motivo}
              onChange={(e) => p.onMotivo(e.target.value)}
              className={inputClass}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
