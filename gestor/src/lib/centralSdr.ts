// Regras puras da Fila do SDR (sem tela e sem banco): ordem, próxima ação sugerida, alertas.
export type ItemFila = {
  id: string; status: string; motivo: 'respondeu' | 'nota_alta'; nota: number | null; telefone: string | null; observacao: string | null
  criado_em: string; assumido_por: string | null; assumido_por_nome: string | null; resultado_em: string | null; lead_id: string | null
  empresa_id: string; empresa: string; cidade: string | null; uf: string | null; segmento: string | null
  contato_nome: string | null; contato_cargo: string | null; contato_email: string | null; resumo: string | null; quente: boolean
}
export const RESULTADOS = [
  { id: 'ligou', rotulo: 'Atendeu' },
  { id: 'pediu_cotacao', rotulo: 'Pediu cotação' },
  { id: 'sem_resposta', rotulo: 'Sem resposta' },
  { id: 'sem_interesse', rotulo: 'Sem interesse' },
  { id: 'telefone_errado', rotulo: 'Telefone errado' },
] as const
export const ROTULO_STATUS: Record<string, string> = { na_fila: 'Na fila', assumido: 'Assumido', ligou: 'Atendeu', sem_resposta: 'Sem resposta', pediu_cotacao: 'Pediu cotação', sem_interesse: 'Sem interesse', telefone_errado: 'Telefone errado', encerrado: 'Encerrado' }

export const aberto = (i: ItemFila) => i.status === 'na_fila' || i.status === 'assumido'
// Quente primeiro, depois quem respondeu, depois maior nota; mais antigo antes.
export function ordenarFila(l: ItemFila[]): ItemFila[] {
  const peso = (i: ItemFila) => (i.quente ? 0 : i.motivo === 'respondeu' ? 1 : 2)
  return [...l].sort((a, b) => peso(a) - peso(b) || (b.nota ?? 0) - (a.nota ?? 0) || Date.parse(a.criado_em) - Date.parse(b.criado_em))
}
export function motivoTexto(i: ItemFila): string {
  return i.motivo === 'respondeu' ? (i.quente ? 'Respondeu o e-mail pedindo cotação ou preço' : 'Respondeu o e-mail') : `Nota alta (${i.nota ?? '—'}) e telefone válido, ainda sem resposta`
}
export function proximaAcao(i: ItemFila): string {
  if (!i.telefone) return 'Sem telefone: procure o número antes de ligar.'
  if (i.quente) return 'Ligar agora: a empresa já pediu cotação ou preço.'
  if (i.motivo === 'respondeu') return 'Ligar e descobrir quem cuida de frete e a próxima carga.'
  return 'Primeira ligação: apresentar a RBR e pedir o contato de quem cota frete.'
}
// Lead quente sem ninguém assumir há mais de 1 hora vira aviso urgente.
export function quentesSemDono(l: ItemFila[], agora: Date, limiteMin = 60): ItemFila[] {
  return l.filter((i) => i.status === 'na_fila' && i.quente && agora.getTime() - Date.parse(i.criado_em) > limiteMin * 60000)
}
// Quente: sugerir José Carlos (como já é no fluxo), com o Pedro em cópia.
export function sugestaoDeDono(i: ItemFila, pessoas: { id: string; nome: string }[], eu: string): string {
  if (i.quente) { const jc = pessoas.find((p) => /jos[eé] carlos/i.test(p.nome)); if (jc) return jc.id }
  return eu
}
export function ligacaoLink(tel: string | null): string | null {
  const d = (tel ?? '').replace(/\D/g, '')
  return d.length >= 10 ? `tel:+${d.startsWith('55') ? d : '55' + d}` : null
}
export function validarCorte(txt: string): number | null {
  const n = Number(txt.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null
}
export function validarMaxDia(txt: string): number | null {
  const n = Number(txt)
  return Number.isInteger(n) && n >= 0 && n <= 500 ? n : null
}
