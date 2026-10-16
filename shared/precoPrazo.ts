// Política de preço por prazo de pagamento e de desconto na negociação (decidida pelo Pedro em 2026-10-16).
// Só contas, sem I/O: o cotador lê a política da configuração e chama estas funções; os testes ficam em
// precoPrazo.test.ts (node --test shared/precoPrazo.test.ts).
//
// Definições (as mesmas do cotador e do gatilho trg_fn_cotacao_calcula_preco):
//   L = lucro% sobre o custo com imposto; a = alíquota; V = custo × (1 + L) / (1 − a × (1 + L)).
//   margem = lucro ÷ V = (V × (1 − a) − custo) ÷ V. Com o V da fórmula, margem = L ÷ (1 + L), qualquer que seja a.
//   Ajuste x sobre V (prazo ou desconto): V' = V × (1 + x); o imposto acompanha (a × V').
// O preço da cotação (V) é o preço a 7 DDL. Nada aqui altera V quando nenhum prazo nem desconto é escolhido.

export type PrazoPagamento = 'antecipado' | 'a_vista' | '7ddl' | '14ddl' | '21ddl' | '28ddl'

// Do mais curto ao mais longo. "antecipado" = Pix confirmado antes de liberar o motorista;
// "a_vista" = Pix no fim da viagem (entrega); DDL = dias contados da emissão do boleto, na liberação do motorista.
export const PRAZOS: PrazoPagamento[] = ['antecipado', 'a_vista', '7ddl', '14ddl', '21ddl', '28ddl']

export const ROTULO_PRAZO: Record<PrazoPagamento, string> = {
  antecipado: 'Antecipado',
  a_vista: 'À vista',
  '7ddl': '7 DDL',
  '14ddl': '14 DDL',
  '21ddl': '21 DDL',
  '28ddl': '28 DDL',
}

// Dias da emissão do boleto até o vencimento (null = não é boleto: Pix antes da liberação ou na entrega).
export const DIAS_PRAZO: Record<PrazoPagamento, number | null> = {
  antecipado: null,
  a_vista: null,
  '7ddl': 7,
  '14ddl': 14,
  '21ddl': 21,
  '28ddl': 28,
}

export interface Concessao {
  de: PrazoPagamento[] // prazo em que o frete foi cotado
  para: PrazoPagamento // prazo que o cliente aceita em troca do desconto
  min: number // desconto sugerido (fração sobre o preço cotado)
  max: number // teto desta concessão
  faixa?: 'antecipado' | 'a_vista' // só é sugerida a partir do custo mínimo dessa faixa
  raro?: boolean // aparece por último e marcada como exceção
}

export interface FaixaValor {
  custoMinimo: number // R$ de custo (sem imposto) a partir do qual o desconto é sugerido
}

export interface PoliticaPrazo {
  ajustePorPrazo: Record<PrazoPagamento, number> // sugestão ao cotar, sobre o preço a 7 DDL
  concessoes: Concessao[]
  faixas: Record<'antecipado' | 'a_vista', FaixaValor>
  tetoDesconto: number // nenhum desconto acima disto
  margemPiso: number // 26%: abaixo disso a cotação sai da faixa de aprovação
  margemConfortavel: number // 30%: acima disso a margem aparece em verde
  descontoMinimoUtil: number // abaixo disso não vale oferecer desconto ("sem espaço")
}

// Valores iniciais; o cotador sobrescreve com parametros_sistema (tudo editável na configuração).
export const POLITICA_PADRAO: PoliticaPrazo = {
  ajustePorPrazo: { antecipado: -0.02, a_vista: -0.01, '7ddl': 0, '14ddl': 0.015, '21ddl': 0.03, '28ddl': 0.04 },
  concessoes: [
    { de: ['28ddl'], para: '14ddl', min: 0.03, max: 0.03 },
    { de: ['28ddl'], para: '7ddl', min: 0.04, max: 0.04 },
    { de: ['21ddl'], para: '14ddl', min: 0.02, max: 0.02 },
    { de: ['21ddl'], para: '7ddl', min: 0.03, max: 0.03 },
    { de: ['14ddl'], para: 'a_vista', min: 0.02, max: 0.03, faixa: 'a_vista' },
    { de: ['14ddl'], para: 'antecipado', min: 0.04, max: 0.05, faixa: 'antecipado' },
    { de: ['7ddl'], para: 'antecipado', min: 0.02, max: 0.02, faixa: 'antecipado' },
    { de: ['21ddl', '28ddl'], para: 'antecipado', min: 0.05, max: 0.05, faixa: 'antecipado', raro: true },
  ],
  faixas: { antecipado: { custoMinimo: 10000 }, a_vista: { custoMinimo: 5000 } },
  tetoDesconto: 0.05,
  margemPiso: 0.26,
  margemConfortavel: 0.3,
  descontoMinimoUtil: 0.02,
}

// Mesma tolerância do cotador e de trg_fn_cotacao_valida_margem (arredondamento em centavos).
const TOLERANCIA = 0.0005

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// V = custo × (1 + L) / (1 − a × (1 + L)). null quando a alíquota não fecha com esse lucro.
export function valorFinal(custo: number, lucroPct: number, aliquota: number): number | null {
  const fator = 1 + lucroPct
  const divisor = 1 - aliquota * fator
  if (divisor <= 0) return null
  return round2((custo * fator) / divisor)
}

// margem = (V × (1 − a) − custo) ÷ V. custo = tudo menos o imposto (frete, pedágio, seguro, adicionais, giro).
export function margem(valor: number, custo: number, aliquota: number): number | null {
  if (!(valor > 0)) return null
  return (valor * (1 - aliquota) - custo) / valor
}

// V' = V × (1 + x). x > 0 é acréscimo; x < 0 é desconto (ex.: −0,03 = 3% de desconto).
export function aplicarAjuste(valor: number, ajuste: number): number {
  return round2(valor * (1 + ajuste))
}

export function margemAposAjuste(valor: number, ajuste: number, custo: number, aliquota: number): number | null {
  return margem(aplicarAjuste(valor, ajuste), custo, aliquota)
}

// Desconto máximo sobre o preço atual para a margem não passar do piso:
//   d_max = 1 − (1 − a − m0) ÷ (1 − a − piso). Nunca negativo (margem já abaixo do piso = 0).
export function descontoMaximo(margemAtual: number, aliquota: number, piso = POLITICA_PADRAO.margemPiso): number {
  const d = 1 - (1 - aliquota - margemAtual) / (1 - aliquota - piso)
  return Math.max(0, d)
}

export type CorMargem = 'verde' | 'amarelo' | 'vermelho'

// Verde acima de 30%, amarelo entre 26% e 30%, vermelho abaixo de 26%. Só informa: nunca bloqueia.
export function corMargem(m: number | null, politica: PoliticaPrazo = POLITICA_PADRAO): CorMargem | null {
  if (m == null) return null
  if (m < politica.margemPiso - TOLERANCIA) return 'vermelho'
  if (m > politica.margemConfortavel + TOLERANCIA) return 'verde'
  return 'amarelo'
}

// Preço por prazo, a partir do preço da cotação (7 DDL). Sem prazo escolhido = preço da cotação.
export function ajusteDoPrazo(prazo: PrazoPagamento | null | undefined, politica: PoliticaPrazo = POLITICA_PADRAO): number {
  return prazo ? politica.ajustePorPrazo[prazo] ?? 0 : 0
}

export interface LinhaPrazo {
  prazo: PrazoPagamento
  ajuste: number
  valor: number
  margem: number | null
  cor: CorMargem | null
}

// A escada inteira, para o painel de preço mostrar quanto cada prazo custa ao cliente e quanto sobra de margem.
export function escadaDePrazos(
  valorBase: number,
  custo: number,
  aliquota: number,
  politica: PoliticaPrazo = POLITICA_PADRAO,
): LinhaPrazo[] {
  return PRAZOS.map((prazo) => {
    const ajuste = ajusteDoPrazo(prazo, politica)
    const valor = aplicarAjuste(valorBase, ajuste)
    const m = margem(valor, custo, aliquota)
    return { prazo, ajuste, valor, margem: m, cor: corMargem(m, politica) }
  })
}

export interface Degrau {
  para: PrazoPagamento
  sugerido: number // desconto oferecido primeiro (fração)
  maximo: number // teto desta concessão, já limitado ao teto geral
  valorSugerido: number
  margemSugerido: number | null
  corSugerido: CorMargem | null
  margemMaximo: number | null
  corMaximo: CorMargem | null
  dentroDaFaixaDeValor: boolean // false = valor do frete abaixo da faixa: aparece, mas não é sugerido
  passaDoPiso: boolean // o desconto sugerido leva a margem abaixo do piso
  raro: boolean
}

export interface Negociacao {
  margemAtual: number | null
  descontoMaximo: number // até onde dá para descer sem passar do piso
  semEspaco: boolean // d_max abaixo do desconto mínimo útil
  mensagem: string | null
  degraus: Degrau[] // do menor desconto para o maior; a tela mostra o primeiro e libera o seguinte
}

// Degraus de desconto a partir do prazo em que o frete foi cotado.
//   valorCotado = preço já com o ajuste do prazo cotado (o que o cliente viu).
//   custo = custo sem imposto (base do valor do frete para as faixas e da margem).
export function negociacao(
  prazoCotado: PrazoPagamento,
  valorCotado: number,
  custo: number,
  aliquota: number,
  politica: PoliticaPrazo = POLITICA_PADRAO,
): Negociacao {
  const m0 = margem(valorCotado, custo, aliquota)
  const dMax = m0 == null ? 0 : descontoMaximo(m0, aliquota, politica.margemPiso)
  const semEspaco = dMax < politica.descontoMinimoUtil
  const degraus = politica.concessoes
    .filter((c) => c.de.includes(prazoCotado))
    .map((c): Degrau => {
      const maximo = Math.min(c.max, politica.tetoDesconto)
      const sugerido = Math.min(c.min, maximo)
      const valorSugerido = aplicarAjuste(valorCotado, -sugerido)
      const mSug = margem(valorSugerido, custo, aliquota)
      const mMax = margem(aplicarAjuste(valorCotado, -maximo), custo, aliquota)
      const faixa = c.faixa ? politica.faixas[c.faixa] : null
      return {
        para: c.para,
        sugerido,
        maximo,
        valorSugerido,
        margemSugerido: mSug,
        corSugerido: corMargem(mSug, politica),
        margemMaximo: mMax,
        corMaximo: corMargem(mMax, politica),
        dentroDaFaixaDeValor: !faixa || custo >= faixa.custoMinimo,
        passaDoPiso: mSug != null && mSug < politica.margemPiso - TOLERANCIA,
        raro: c.raro === true,
      }
    })
    .sort((x, y) => Number(x.raro) - Number(y.raro) || x.sugerido - y.sugerido)
  return {
    margemAtual: m0,
    descontoMaximo: dMax,
    semEspaco,
    mensagem: semEspaco ? 'Sem espaço para desconto. Sugerir pagamento à vista ou antecipado sem desconto.' : null,
    degraus,
  }
}

// Primeiro degrau a oferecer: o de menor desconto que está na faixa de valor do frete e não é exceção.
// null = nenhum desconto sugerido (a tela ainda deixa o usuário escolher um degrau à mão).
export function degrauSugerido(n: Negociacao): Degrau | null {
  if (n.semEspaco) return null
  return n.degraus.find((d) => d.dentroDaFaixaDeValor && !d.raro) ?? null
}

// Um desconto por frete, sem acumular, até o teto.
export function descontoValido(d: number, politica: PoliticaPrazo = POLITICA_PADRAO): boolean {
  return d >= 0 && d <= politica.tetoDesconto + 1e-9
}

export interface DescontoCondicional {
  dataLimite: string // AAAA-MM-DD, sem ajuste de dia útil (a tela confere com sugerir_vencimento)
  dias: number
  desconto: number
  valor: number
}

function somarDias(iso: string, dias: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

// Boleto com valor cheio no vencimento do prazo contratado e desconto condicional se pago antes (até 3 datas).
// Só datas de boleto (DDL) mais curtas que o contratado entram; antecipado e à vista não são boleto.
export function descontosCondicionaisBoleto(
  valorCheio: number,
  emissao: string,
  prazoContratado: PrazoPagamento,
  descontos: Array<{ para: PrazoPagamento; desconto: number }>,
  politica: PoliticaPrazo = POLITICA_PADRAO,
): { vencimento: string | null; condicoes: DescontoCondicional[] } {
  const diasContrato = DIAS_PRAZO[prazoContratado]
  if (diasContrato == null) return { vencimento: null, condicoes: [] }
  const condicoes = descontos
    .filter((x) => {
      const dias = DIAS_PRAZO[x.para]
      return dias != null && dias < diasContrato && descontoValido(x.desconto, politica) && x.desconto > 0
    })
    .map((x) => {
      const dias = DIAS_PRAZO[x.para] as number
      return { dataLimite: somarDias(emissao, dias), dias, desconto: x.desconto, valor: aplicarAjuste(valorCheio, -x.desconto) }
    })
    .sort((a, b) => a.dias - b.dias)
    .slice(0, 3)
  return { vencimento: somarDias(emissao, diasContrato), condicoes }
}
