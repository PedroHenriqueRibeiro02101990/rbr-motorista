// Motor de spread do agenciador (funcoes puras, sem rede).
// Preco ao cliente = (frete + pedagio + seguro/TAG + custo financeiro RBR + lucro minimo RBR + SPREAD) / (1 - aliquota).
// O imposto incide sobre o valor final (igual a cotacao da RBR), entao o spread sai liquido de imposto.
// O agenciador so enxerga: preco final, o proprio spread e a margem. Os custos ficam no servidor.

export interface ParametrosRbr {
  lucroMinPct: number // sobre o custo (0.15 = 15%)
  lucroMinValor: number // R$ por operacao; vale o MAIOR dos dois
  custoFinPctMes: number // ao mes (0.025 = 2,5%), proporcional ao prazo em dias
  taxaTecnologia: number // R$ fixos por carga fechada, descontada do spread
}

export interface EntradaCusto {
  frete: number
  pedagio: number
  seguroTag: number
  prazoDias: number
  aliquota: number // 0.06 = 6%
}

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export function custoBase(e: EntradaCusto) {
  return e.frete + e.pedagio + e.seguroTag
}

export function custoFinanceiro(e: EntradaCusto, p: ParametrosRbr) {
  return r2(custoBase(e) * p.custoFinPctMes * (Math.max(0, e.prazoDias) / 30))
}

export function lucroMinimoRbr(e: EntradaCusto, p: ParametrosRbr) {
  return r2(Math.max(custoBase(e) * p.lucroMinPct, p.lucroMinValor))
}

/** Tudo o que a RBR precisa cobrir ANTES do spread (lado servidor/gestor). */
export function custoRbrSemSpread(e: EntradaCusto, p: ParametrosRbr) {
  return r2(custoBase(e) + custoFinanceiro(e, p) + lucroMinimoRbr(e, p))
}

export interface Composicao {
  frete: number
  pedagio: number
  seguroTag: number
  custoFinanceiro: number
  lucroRbr: number
  spread: number
  imposto: number
  precoFinal: number
}

export function precoPorSpread(e: EntradaCusto, p: ParametrosRbr, spread: number): Composicao {
  const base = custoRbrSemSpread(e, p)
  const precoFinal = r2((base + spread) / (1 - e.aliquota))
  return {
    frete: e.frete,
    pedagio: e.pedagio,
    seguroTag: e.seguroTag,
    custoFinanceiro: custoFinanceiro(e, p),
    lucroRbr: lucroMinimoRbr(e, p),
    spread,
    imposto: r2(precoFinal * e.aliquota),
    precoFinal,
  }
}

/** Spread em % do PRECO FINAL: P = base / (1 - aliquota - pct). */
export function precoPorSpreadPct(e: EntradaCusto, p: ParametrosRbr, pct: number): Composicao {
  const base = custoRbrSemSpread(e, p)
  const den = 1 - e.aliquota - pct
  if (den <= 0) throw new Error('Percentual alto demais para fechar o preço.')
  const precoFinal = r2(base / den)
  return precoPorSpread(e, p, r2(precoFinal * (1 - e.aliquota) - base))
}

export function spreadPorPreco(e: EntradaCusto, p: ParametrosRbr, precoFinal: number): number {
  return r2(precoFinal * (1 - e.aliquota) - custoRbrSemSpread(e, p))
}

export interface Resultado {
  precoFinal: number
  spread: number
  margemPct: number // spread / preco final
  taxaTecnologia: number
  spreadLiquido: number
  erro: string | null // trava dura
  aviso: string | null // aviso amarelo
  spreadMinimo: number // menor spread aceito (piso ANTT / nao negativo)
}

export function avaliar(e: EntradaCusto, p: ParametrosRbr, pisoAntt: number, spread: number): Resultado {
  const spreadMinimo = Math.max(0, r2(pisoAntt * (1 - e.aliquota) - custoRbrSemSpread(e, p) + 0.005))
  const comp = precoPorSpread(e, p, spread)
  let erro: string | null = null
  let aviso: string | null = null
  if (spread < 0) erro = 'O spread não pode ser negativo.'
  else if (comp.precoFinal + 0.004 < pisoAntt)
    erro = `O preço não pode ficar abaixo do piso mínimo de frete (ANTT): ${pisoAntt.toFixed(2).replace('.', ',')}.`
  else if (comp.precoFinal - pisoAntt < 0.5 + 0.004) aviso = 'Você está no limite: o preço está no mínimo permitido pela tabela do frete.'
  else if (spread < p.taxaTecnologia) aviso = 'Com esse spread a taxa de tecnologia consome todo o seu ganho nesta carga.'
  return {
    precoFinal: comp.precoFinal,
    spread,
    margemPct: comp.precoFinal > 0 ? spread / comp.precoFinal : 0,
    taxaTecnologia: p.taxaTecnologia,
    spreadLiquido: r2(spread - p.taxaTecnologia),
    erro,
    aviso,
    spreadMinimo,
  }
}

/** Simulador rapido (agenciador): "se eu cobrar X, ganho Y" — sem custos internos, so o preco e o que ele colocou. */
export function simularRapido(precoFinal: number, aliquota: number, spread: number, taxa: number) {
  return { precoFinal, spread, spreadLiquido: r2(spread - taxa), margemPct: precoFinal > 0 ? spread / precoFinal : 0, impostoEstimado: r2(precoFinal * aliquota) }
}
