// Prospeccao, Etapas 5 e 6: contas puras do painel (funil, jornada, taxa por toque e segmento, gasto de IA, pesos). Sem banco, sem tela. Testes em gestor/test/prospeccaoPainel.test.ts.

export type Funil = { qualificadas: number; aprovadas: number; enviadas: number; respondidas: number; cotacoes: number; assumidas: number }
export const ETAPAS_FUNIL: { chave: keyof Funil; rotulo: string }[] = [
  { chave: 'qualificadas', rotulo: 'Qualificadas (A e B)' }, { chave: 'aprovadas', rotulo: 'Aprovadas' }, { chave: 'enviadas', rotulo: 'Enviadas' },
  { chave: 'respondidas', rotulo: 'Respondidas' }, { chave: 'cotacoes', rotulo: 'Cotações' }, { chave: 'assumidas', rotulo: 'Assumidas' },
]
/** Largura da barra em %: proporcional ao MAIOR valor do funil (escala correta, nunca estoura 100 e nunca some quando ha valor). */
export function larguraBarra(valor: number, maximo: number): number {
  if (!(maximo > 0) || !(valor > 0)) return 0
  return Math.max(2, Math.min(100, Math.round((valor / maximo) * 100)))
}
export const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0)
export const funilVazio = (f: Funil) => Object.values(f).every((v) => v === 0)
export const FUNIL_EXEMPLO: Funil = { qualificadas: 120, aprovadas: 80, enviadas: 60, respondidas: 9, cotacoes: 4, assumidas: 3 }

export type EnvioLinha = { toque: number; segmento: string }
export type RespostaLinha = { toque: number; segmento: string; classificacao: string | null }
const UTEIS = new Set(['cotacao', 'preco_prazo', 'preco_prazo_negociacao', 'nao_sou_eu', 'indicacao'])
export type TaxaLinha = { chave: string; enviados: number; respostas: number; uteis: number; taxa: number; taxaUtil: number }
function agrupar(envios: EnvioLinha[], respostas: RespostaLinha[], por: 'toque' | 'segmento'): TaxaLinha[] {
  const m = new Map<string, TaxaLinha>()
  const get = (k: string) => { let x = m.get(k); if (!x) { x = { chave: k, enviados: 0, respostas: 0, uteis: 0, taxa: 0, taxaUtil: 0 }; m.set(k, x) } return x }
  for (const e of envios) get(por === 'toque' ? `Toque ${e.toque}` : e.segmento).enviados++
  for (const r of respostas) { const x = get(por === 'toque' ? `Toque ${r.toque}` : r.segmento); x.respostas++; if (r.classificacao && UTEIS.has(r.classificacao)) x.uteis++ }
  return [...m.values()].map((x) => ({ ...x, taxa: pct(x.respostas, x.enviados), taxaUtil: pct(x.uteis, x.enviados) })).sort((a, b) => a.chave.localeCompare(b.chave))
}
export const taxaPorToque = (e: EnvioLinha[], r: RespostaLinha[]) => agrupar(e, r, 'toque')
export const taxaPorSegmento = (e: EnvioLinha[], r: RespostaLinha[]) => agrupar(e, r, 'segmento')

// ---- gasto de IA -------------------------------------------------------------------------------------
export type UsoLinha = { data: string; custo_brl: number }
export function gastoDoDiaEDoMes(uso: UsoLinha[], hojeYmd: string): { dia: number; mes: number } {
  const mes = hojeYmd.slice(0, 7)
  let dia = 0, m = 0
  for (const u of uso) { const v = Number(u.custo_brl) || 0; if (u.data === hojeYmd) dia += v; if (u.data.startsWith(mes)) m += v }
  return { dia: Math.round(dia * 100) / 100, mes: Math.round(m * 100) / 100 }
}
export function situacaoGasto(gasto: number, teto: number): { pct: number; tom: 'ok' | 'atencao' | 'parada' } {
  const p = teto > 0 ? gasto / teto : 1
  return { pct: Math.round(p * 100), tom: p >= 1 ? 'parada' : p >= 0.7 ? 'atencao' : 'ok' }
}

// ---- pesos da pontuacao --------------------------------------------------------------------------------
export type PesoEdit = { criterio: string; rotulo: string; peso: number }
export function validarPesos(pesos: PesoEdit[]): string | null {
  if (pesos.some((p) => !Number.isInteger(p.peso) || p.peso < 0 || p.peso > 100)) return 'Cada peso precisa ser um número inteiro de 0 a 100.'
  const soma = pesos.reduce((s, p) => s + p.peso, 0)
  if (soma !== 100) return `Os pesos somam ${soma}; precisam somar exatamente 100.`
  return null
}
export function pesosAlterados(antes: PesoEdit[], depois: PesoEdit[]): { criterio: string; rotulo: string; de: number; para: number }[] {
  const a = new Map(antes.map((p) => [p.criterio, p.peso]))
  return depois.filter((p) => a.has(p.criterio) && a.get(p.criterio) !== p.peso).map((p) => ({ criterio: p.criterio, rotulo: p.rotulo, de: a.get(p.criterio)!, para: p.peso }))
}
export const DESCRICAO_PESO: Record<string, string> = {
  funcionarios: 'Quanto mais funcionários, mais carga a empresa costuma despachar.', segmento_cnae: 'O ramo da empresa (CNAE) combina com as cargas que a RBR atende.',
  email_logistica: 'Existe um e-mail de logística, compras ou expedição (mais direto ao assunto).', vende_b2b: 'A empresa vende para outras empresas (gera frete).',
  vagas_logistica: 'Tem vaga aberta de expedição, logística ou motorista (sinal de movimento).', mais_de_uma_unidade: 'Tem mais de uma unidade (mais rotas).',
  interestadual: 'Vende para outros estados ou exporta (viagens longas).', capital_porte: 'Capital social e porte compatíveis com contratar frete regularmente.',
  perto_rodovia: 'Fica perto de rodovia ou polo industrial.', frota_propria: 'Tem frota própria (menos chance de terceirizar, mas pode ter picos).',
  cnpj_3_anos: 'CNPJ com mais de 3 anos (empresa estabelecida).', nome_responsavel: 'Sabemos o nome de quem decide.', telefone_whatsapp: 'Tem telefone ou WhatsApp para o plano B.', site_ativo: 'O site está no ar.',
}

// ---- faixa de saude ----------------------------------------------------------------------------------------
export type CorSaude = 'verde' | 'amarelo' | 'vermelho'
export function corDaCaixa(c: { ativa: boolean; parada_motivo: string | null; ultimo_diagnostico_resumo: CorSaude | null; temSenha: boolean }): CorSaude | 'cinza' {
  if (!c.ativa) return 'cinza'
  if (c.parada_motivo) return 'vermelho'
  if (!c.temSenha) return 'amarelo'
  return c.ultimo_diagnostico_resumo ?? 'amarelo'
}
