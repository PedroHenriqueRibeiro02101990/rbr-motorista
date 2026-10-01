// Custo financeiro do capital de giro (aporte do investidor) dentro da cotação.
//
// Regra (contrato de mútuo com remuneração):
//  - O investidor adianta o custo da operação (frete + pedágio + seguro + adicionais) × % financiado.
//  - O relógio corre da saída do veículo até o pagamento do cliente compensar:
//      relógio = dias de trânsito + dias de prazo da parcela + dias de compensação.
//  - A taxa vem da faixa do relógio (ex.: ≤21d 3%, ≤30d 4,5%, ≤45d 6%, acima = teto 7%), sobre o aporte.
//  - A RBR assume o IR (IRRF) da remuneração → custo financeiro = juros limpos ÷ (1 − IR).
//  - Parcelas diferentes têm relógios diferentes: cada uma financia sua fatia (% do prazo).
import type { RegraPrazo } from './financeiro'

export interface FaixaGiro {
  ate_dias: number
  taxa: number // fração (0.03 = 3%)
}

export interface GiroParams {
  ativo: boolean
  faixas: FaixaGiro[]
  taxaTeto: number
  irPct: number // fração (0.225)
  pctFinanciado: number // fração (1 = 100%)
  diasCompensacao: number
  kmPorDia: number
  diasCarga: number
  diasMes: number
}

export const GIRO_PARAMS_PADRAO: GiroParams = {
  ativo: true,
  faixas: [
    { ate_dias: 21, taxa: 0.03 },
    { ate_dias: 30, taxa: 0.045 },
    { ate_dias: 45, taxa: 0.06 },
  ],
  taxaTeto: 0.07,
  irPct: 0.225,
  pctFinanciado: 1,
  diasCompensacao: 1,
  kmPorDia: 500,
  diasCarga: 1,
  diasMes: 30,
}

const round2 = (n: number) => Math.round(n * 100) / 100

export interface ParcelaGiro {
  percentual: number
  diasRelogio: number
  taxa: number
  aporte: number
  jurosLimpos: number
}

export interface ResultadoGiro {
  aporte: number
  transitoDias: number
  parcelas: ParcelaGiro[]
  jurosLimpos: number // remuneração líquida pro investidor
  custoFinanceiro: number // com gross-up do IR (o que a RBR de fato paga)
  taxaEfetiva: number // jurosLimpos ÷ aporte
  diasMedios: number
}

export function taxaDaFaixa(dias: number, p: GiroParams): number {
  const faixas = [...p.faixas].sort((a, b) => a.ate_dias - b.ate_dias)
  for (const f of faixas) if (dias <= f.ate_dias) return f.taxa
  return p.taxaTeto
}

// Dias de trânsito: o que o gestor digitar, senão estimativa por distância (km ÷ km/dia + dia de carga).
export function diasTransito(manual: number | null, distanciaKm: number | null, p: GiroParams): number {
  if (manual != null && manual >= 0) return Math.round(manual)
  if (distanciaKm != null && distanciaKm > 0) return Math.ceil(distanciaKm / p.kmPorDia) + p.diasCarga
  return p.diasCarga
}

// Prazos do cliente em dias a partir da entrega (fechamento mensal vira meses × dias/mês).
function prazosDaRegra(regra: RegraPrazo | null): { dias: number; percentual: number }[] {
  if (!regra || !regra.parcelas?.length) return [{ dias: 0, percentual: 100 }]
  return regra.parcelas.map((p) => ({
    dias: regra.modo === 'fechamento_mensal' ? Math.max(p.dias ?? 1, 0) * 30 : Math.max(p.dias ?? 0, 0),
    percentual: Number(p.percentual) || 0,
  }))
}

export function calcularGiro(
  custoOperacao: number,
  regra: RegraPrazo | null,
  transitoDias: number,
  p: GiroParams,
): ResultadoGiro | null {
  if (!p.ativo || !(custoOperacao > 0)) return null
  const aporte = round2(custoOperacao * p.pctFinanciado)
  const prazos = prazosDaRegra(regra)
  const somaPct = prazos.reduce((s, x) => s + x.percentual, 0) || 100
  const parcelas: ParcelaGiro[] = prazos.map((x) => {
    const pct = x.percentual / somaPct
    const dias = transitoDias + x.dias + p.diasCompensacao
    const taxa = taxaDaFaixa(dias, p)
    const aporteParc = aporte * pct
    return { percentual: pct * 100, diasRelogio: dias, taxa, aporte: round2(aporteParc), jurosLimpos: aporteParc * taxa }
  })
  const jurosLimpos = parcelas.reduce((s, x) => s + x.jurosLimpos, 0)
  const divisor = 1 - p.irPct
  const custoFinanceiro = round2(divisor > 0 ? jurosLimpos / divisor : jurosLimpos)
  return {
    aporte,
    transitoDias,
    parcelas: parcelas.map((x) => ({ ...x, jurosLimpos: round2(x.jurosLimpos) })),
    jurosLimpos: round2(jurosLimpos),
    custoFinanceiro,
    taxaEfetiva: aporte > 0 ? jurosLimpos / aporte : 0,
    diasMedios: Math.round(parcelas.reduce((s, x) => s + x.diasRelogio * (x.percentual / 100), 0)),
  }
}

// Lê os parâmetros giro_* de parametros_sistema (linhas chave/valor) sobre o padrão.
export function giroParamsDeLinhas(rows: { chave: string; valor: unknown }[]): GiroParams {
  const p: GiroParams = { ...GIRO_PARAMS_PADRAO }
  const num = (v: unknown) => (typeof v === 'number' ? v : Number(v))
  for (const r of rows) {
    const v = r.valor
    if (v === null || v === undefined) continue
    switch (r.chave) {
      case 'giro_ativo':
        p.ativo = v === true || v === 'true'
        break
      case 'giro_faixas':
        if (Array.isArray(v)) {
          const f = (v as FaixaGiro[]).filter((x) => x && typeof x.ate_dias === 'number' && typeof x.taxa === 'number')
          if (f.length) p.faixas = f
        }
        break
      case 'giro_taxa_teto': if (Number.isFinite(num(v))) p.taxaTeto = num(v); break
      case 'giro_ir_pct': if (Number.isFinite(num(v))) p.irPct = num(v); break
      case 'giro_pct_financiado': if (Number.isFinite(num(v))) p.pctFinanciado = num(v); break
      case 'giro_dias_compensacao': if (Number.isFinite(num(v))) p.diasCompensacao = num(v); break
      case 'giro_km_por_dia': if (Number.isFinite(num(v)) && num(v) > 0) p.kmPorDia = num(v); break
      case 'giro_dias_carga': if (Number.isFinite(num(v))) p.diasCarga = num(v); break
      case 'giro_dias_mes': if (Number.isFinite(num(v))) p.diasMes = num(v); break
    }
  }
  return p
}
