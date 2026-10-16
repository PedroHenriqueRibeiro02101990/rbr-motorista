import type { Json } from '@rbr/shared/database.types'
import { brl, fmtData } from './financeiro'

// Desconto na fatura (política de prazo e desconto, 2026-10-16). Fase 1: só cálculo, registro e texto — o boleto do
// banco continua com o valor cheio até confirmarmos o que o provedor aceita.
//  - descontos condicionais: boleto com valor cheio no vencimento e desconto se pago até datas anteriores (até 3);
//  - desconto negociado: o preço já veio com desconto da cotação, que só vale com pagamento no prazo (valor_cheio).

export interface DescontoCondicionalFatura {
  data_limite: string // AAAA-MM-DD, já no dia útil
  dias: number
  desconto: number // fração
  valor: number
}

export interface DescontosDaFatura {
  valor_cheio: number | null
  desconto_negociado_pct: number | null
  descontos_condicionais: DescontoCondicionalFatura[]
  desconto_perdido_em: string | null
  desconto_perdido_obs: string | null
}

export const SEM_DESCONTO: DescontosDaFatura = {
  valor_cheio: null,
  desconto_negociado_pct: null,
  descontos_condicionais: [],
  desconto_perdido_em: null,
  desconto_perdido_obs: null,
}

export function lerDescontosCondicionais(json: Json | null | undefined): DescontoCondicionalFatura[] {
  if (!Array.isArray(json)) return []
  return json.flatMap((x) => {
    const o = (x && typeof x === 'object' && !Array.isArray(x) ? x : {}) as Record<string, unknown>
    const valor = Number(o.valor)
    const desconto = Number(o.desconto)
    const dias = Number(o.dias)
    return typeof o.data_limite === 'string' && Number.isFinite(valor) && Number.isFinite(desconto)
      ? [{ data_limite: o.data_limite, dias: Number.isFinite(dias) ? dias : 0, desconto, valor }]
      : []
  })
}

const pctTxt = (v: number) => `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`

// Linhas para o texto de envio e o PDF (o cliente vê estas condições; a política interna não aparece).
export function linhasDesconto(d: DescontosDaFatura, vencimento: string | null | undefined): string[] {
  const linhas: string[] = []
  for (const c of d.descontos_condicionais) {
    linhas.push(`Pagando até ${fmtData(c.data_limite)}: ${brl(c.valor)} (${pctTxt(c.desconto)} de desconto).`)
  }
  if (d.descontos_condicionais.length) linhas.push('Depois dessas datas vale o valor cheio.')
  if (d.desconto_negociado_pct && d.valor_cheio) {
    linhas.push(
      `Valor com ${pctTxt(d.desconto_negociado_pct)} de desconto, válido para pagamento até ${fmtData(vencimento)}. Após o vencimento, vale o valor cheio de ${brl(d.valor_cheio)}.`,
    )
  }
  return linhas
}
