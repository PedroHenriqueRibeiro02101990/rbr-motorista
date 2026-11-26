// Precificação da cotação (funções puras, sem rede). É a MESMA conta que a tela de Cotação do gestor sempre fez
// (gestor/src/pages/Cotacao.tsx: calcularComposicao e calcularCustoDestino), extraída aqui para ser usada pela
// tela, pela função calcular-cotacao-rota e pela Calculadora RBR, sem duplicar:
//   fator = 1 + lucro; divisor = 1 - aliquota x fator; valor final = custo x fator / divisor.
// O imposto incide sobre o valor final e o lucro é o que sobra depois do custo e do imposto.
// Obs.: NÃO é custo x (1 + margem) / (1 - imposto); a cotação aplica a alíquota sobre o valor já com o lucro.

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export type ResultadoPreco =
  | { ok: true; valorFinal: number; imposto: number; lucro: number; margem: number; lucroPct: number }
  | { ok: false; erro: string }

export const MSG_MARGEM_ALTA = 'Margem alta demais pra essa alíquota de imposto — revise o %.'

/** Divisor da fórmula; <= 0 quer dizer que o preço não fecha. */
export const divisorPreco = (aliquota: number, lucroFrac: number) => 1 - aliquota * (1 + lucroFrac)

/**
 * custoPreco = custo que entra no preço (custo + parcela repassada do custo financeiro, quando houver);
 * custo = custo real da RBR; custoFin = custo financeiro (entra no lucro, não no preço, se não for repassado).
 */
export function precoPorLucro(p: { custo: number; lucroFrac: number; aliquota: number; custoPreco?: number; custoFin?: number }): ResultadoPreco {
  const custoPreco = p.custoPreco ?? p.custo
  const custoFin = p.custoFin ?? 0
  const fator = 1 + p.lucroFrac
  const divisor = 1 - p.aliquota * fator
  if (divisor <= 0) return { ok: false, erro: MSG_MARGEM_ALTA }
  const valorFinal = r2((custoPreco * fator) / divisor)
  const imposto = r2(valorFinal * p.aliquota)
  const lucro = r2(valorFinal - p.custo - custoFin - imposto)
  const custoComImposto = r2(p.custo + custoFin + imposto)
  return { ok: true, valorFinal, imposto, lucro, margem: valorFinal > 0 ? lucro / valorFinal : 0, lucroPct: custoComImposto > 0 ? lucro / custoComImposto : 0 }
}

// Mesma tolerância do gatilho trg_fn_cotacao_valida_margem (arredondamento em centavos).
export const abaixoDoPisoDeMargem = (margem: number, margemMin: number) => margem < margemMin - 0.0005

export interface OpcaoReferencia {
  lucroPct: number // 30, 40, 50
  valorFinal: number | null
  imposto: number | null
  lucro: number | null
  margem: number | null // lucro / valor final
  abaixoDoMinimo: boolean
  texto: string // "Margem 40% . imposto 6%"
  erro?: string
}

/** Referência de venda da Calculadora: custo = piso + pedágio; uma opção por lucro (padrão 30/40/50). */
export function referenciaDeVenda(custo: number, aliquota: number, margemMin: number, opcoes = [30, 40, 50]): OpcaoReferencia[] {
  return opcoes.map((pct) => {
    const r = precoPorLucro({ custo, lucroFrac: pct / 100, aliquota })
    const texto = `Margem ${pct}% . imposto ${r2(aliquota * 100).toString().replace('.', ',')}%`
    if (!r.ok) return { lucroPct: pct, valorFinal: null, imposto: null, lucro: null, margem: null, abaixoDoMinimo: false, texto, erro: r.erro }
    return { lucroPct: pct, valorFinal: r.valorFinal, imposto: r.imposto, lucro: r.lucro, margem: r.margem, abaixoDoMinimo: abaixoDoPisoDeMargem(r.margem, margemMin), texto }
  })
}
