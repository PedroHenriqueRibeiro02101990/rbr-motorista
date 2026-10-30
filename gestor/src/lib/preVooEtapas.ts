// B13 · Botão por etapa do pré-voo: cada pendência leva à aba do painel onde ela se resolve.
// Item desconhecido cai em 'fiscal' (onde ficam os documentos), nunca some sem botão.
export type AbaDoPreVoo = 'fiscal' | 'motorista' | 'financeiro'

const ABA_POR_ITEM: Record<string, AbaDoPreVoo> = {
  motorista_veiculo: 'motorista',
  rntrc: 'motorista',
  rastreio: 'motorista',
  piso_antt: 'financeiro',
  valor: 'financeiro',
}

export function abaDaPendencia(item: string): AbaDoPreVoo {
  return ABA_POR_ITEM[item] ?? 'fiscal'
}

export const ROTULO_ABA: Record<AbaDoPreVoo, string> = {
  fiscal: 'Ir para Fiscal',
  motorista: 'Ir para Motorista',
  financeiro: 'Ir para Financeiro',
}
