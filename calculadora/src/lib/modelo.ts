// Regras puras da Calculadora RBR (sem React, sem rede). A conta de piso, pedágio e preço vem TODA da função
// calcular-cotacao-rota (mesma da tela de Cotações); aqui só se escolhe, formata e se monta texto.
import type { SaidaCotacaoRota } from '../../../supabase/functions/_shared/cotacaoRota.ts'
import type { OpcaoReferencia } from '../../../supabase/functions/_shared/precoCotacao.ts'

export const TABELA_CALCULADORA = 'A' // lotação, composição completa: a Calculadora usa SEMPRE a Tabela A
export const EIXOS_PADRAO = [2, 3, 4, 5, 6, 7, 9]
export const MARGENS = [30, 40, 50]

// Valor = texto exato de piso_antt_coeficientes.tipo_carga.
export const TIPOS_CARGA: { valor: string; rotulo: string }[] = [
  { valor: 'Carga Geral', rotulo: 'Carga geral' },
  { valor: 'Granel solido', rotulo: 'Granel sólido' },
  { valor: 'Granel liquido', rotulo: 'Granel líquido' },
  { valor: 'Frigorificada ou Aquecida', rotulo: 'Frigorificada ou aquecida' },
  { valor: 'Conteinerizada', rotulo: 'Conteinerizada' },
  { valor: 'Neogranel', rotulo: 'Neogranel' },
  { valor: 'Carga Granel Pressurizada', rotulo: 'Granel pressurizada' },
  { valor: 'Perigosa (carga geral)', rotulo: 'Perigosa · carga geral' },
  { valor: 'Perigosa (granel solido)', rotulo: 'Perigosa · granel sólido' },
  { valor: 'Perigosa (granel liquido)', rotulo: 'Perigosa · granel líquido' },
  { valor: 'Perigosa (frigorificada ou aquecida)', rotulo: 'Perigosa · frigorificada' },
  { valor: 'Perigosa (conteinerizada)', rotulo: 'Perigosa · conteinerizada' },
]

export interface Cidade { cidade: string; uf: string; ibge?: string | null }
export interface Entrada { origem: Cidade; destino: Cidade; tipoCarga: string; eixos: number; incluirVolta: boolean }
export interface Resposta extends SaidaCotacaoRota {
  parametrosReferencia?: { aliquota: number; margemMin: number }
  desligado?: boolean
  demo?: boolean // dados de DEMONSTRAÇÃO (função real ainda não ligada)
}
export interface Consulta { quando: string; entrada: Entrada; resposta: Resposta }

export const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const km = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`

/** Eixos que existem na Tabela A para o tipo de carga (a tabela não tem todas as combinações). */
export function eixosValidos(linhas: { tipo_carga: string; eixos: number }[], tipoCarga: string): number[] {
  const v = [...new Set(linhas.filter((l) => l.tipo_carga === tipoCarga).map((l) => Number(l.eixos)))].sort((a, b) => a - b)
  return v.length ? v : EIXOS_PADRAO
}
/** Ao trocar a carga, se o eixo escolhido ficar inválido, vai para o válido mais próximo (empate: o maior). */
export function eixoMaisProximo(eixo: number, validos: number[]): number {
  if (validos.includes(eixo)) return eixo
  return [...validos].sort((a, b) => Math.abs(a - eixo) - Math.abs(b - eixo) || b - a)[0]
}

export const papelPermitido = (papel: string | null | undefined) => papel === 'gestor_rbr'

export type TipoFalha = 'sessao' | 'desligado' | 'offline' | 'indisponivel'
/** Classifica a falha da chamada para a mensagem certa (login expirado, desligado, sem internet...). */
export function classificarFalha(e: { status?: number; message?: string; online?: boolean } | null | undefined): TipoFalha {
  if (e?.online === false) return 'offline'
  if (e?.status === 401 || /jwt|não autenticado|nao autenticado|expired/i.test(e?.message ?? '')) return 'sessao'
  if (e?.status === 503) return 'desligado'
  if (/failed to fetch|network|load failed/i.test(e?.message ?? '')) return 'offline'
  return 'indisponivel'
}
export const MENSAGEM_FALHA: Record<TipoFalha, string> = {
  sessao: 'Sua sessão expirou. Entre de novo.',
  desligado: 'O cálculo está desligado no momento.',
  offline: 'Sem internet. Mostrando a última consulta salva.',
  indisponivel: 'Não consegui calcular agora. Tente de novo em instantes.',
}

/** Chips de margem: escolhe a opção que a função JÁ devolveu (sem nova consulta e sem refazer a conta aqui). */
export function opcaoDaMargem(r: Resposta, pct: number): OpcaoReferencia | null {
  return r.referencia?.find((o) => o.lucroPct === pct) ?? null
}

export function nomeRota(e: Entrada) { return `${e.origem.cidade}/${e.origem.uf} → ${e.destino.cidade}/${e.destino.uf}` }
export const rotuloCarga = (valor: string) => TIPOS_CARGA.find((t) => t.valor === valor)?.rotulo ?? valor
const dataBr = (iso: string) => new Date(iso).toLocaleDateString('pt-BR')

/** Linhas da "Ver conta": tudo que entrou no cálculo. */
export function linhasConta(e: Entrada, r: Resposta, o: OpcaoReferencia | null): [string, string][] {
  const l: [string, string][] = [['Rota', nomeRota(e)], ['Carga', `${rotuloCarga(e.tipoCarga)} · ${e.eixos} eixos · ${e.incluirVolta ? 'ida e volta' : 'só ida'}`]]
  if (r.km != null) l.push(['Distância', km(r.km)])
  if (r.piso) l.push([`Piso ANTT (Tabela ${r.piso.tabela})`, `${brl(r.piso.valor)} = ${brl(r.piso.ccFixo)} + ${r.piso.ccdPorKm.toLocaleString('pt-BR', { minimumFractionDigits: 4 })}/km x ${r.km} km`])
  if (r.pedagio) {
    l.push(['Pedágio', brl(r.pedagio.total)])
    if (r.incluirVolta) l.push(['Pedágio ida / volta', `${r.pedagio.ida != null ? brl(r.pedagio.ida) : '—'} / ${r.pedagio.volta != null ? brl(r.pedagio.volta) : '—'}`])
    if (r.pedagio.rodovias) l.push(['Rodovias', r.pedagio.rodovias])
  }
  if (r.custo != null) l.push(['Custo (piso + pedágio)', brl(r.custo)])
  if (o && o.valorFinal != null && o.imposto != null && o.lucro != null) {
    l.push(['Imposto', brl(o.imposto)], [`Referência de venda (lucro ${o.lucroPct}%)`, brl(o.valorFinal)], ['Lucro', brl(o.lucro)])
    if (o.margem != null) l.push(['Margem sobre o preço', `${(o.margem * 100).toFixed(1).replace('.', ',')}%`])
  }
  return l
}

/** Texto para uso INTERNO (copiar e WhatsApp). Sem linguagem de proposta ao cliente. */
export function textoInterno(e: Entrada, r: Resposta, o: OpcaoReferencia | null, quando: string): string {
  const t: string[] = [`Calculadora RBR${r.demo ? ' (EXEMPLO)' : ''}${r.emTeste && !r.demo ? ' (valor de teste)' : ''}`, `Rota: ${nomeRota(e)}`, `Carga: ${rotuloCarga(e.tipoCarga)}, ${e.eixos} eixos, ${e.incluirVolta ? 'ida e volta' : 'só ida'}`]
  t.push(`Distância: ${r.km != null ? km(r.km) : 'não calculada'}`)
  t.push(`Piso ANTT: ${r.piso ? brl(r.piso.valor) : 'não calculado'}`)
  t.push(`Pedágio: ${r.pedagio ? brl(r.pedagio.total) : 'não calculado'}`)
  if (r.custo != null) t.push(`Custo (piso + pedágio): ${brl(r.custo)}`)
  if (o && o.valorFinal != null && o.lucro != null) t.push(`Referência de venda: ${brl(o.valorFinal)} (${o.texto} · lucro ${brl(o.lucro)}). Só referência, não é cotação.`)
  t.push(`Consulta de ${dataBr(quando)}`)
  return t.join('\n')
}
export const linkWhatsApp = (texto: string) => `https://wa.me/?text=${encodeURIComponent(texto)}`
