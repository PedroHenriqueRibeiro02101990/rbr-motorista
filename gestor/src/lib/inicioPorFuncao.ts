// F05 · Início por função: o que cada função vê primeiro. Regra pura; o gestor pode trocar a visão (a segurança de dados é das políticas do banco, não daqui).
export type FuncaoInicio = 'geral' | 'comercial' | 'operacao' | 'fiscal' | 'financeiro'

export const FUNCOES_INICIO: { id: FuncaoInicio; rotulo: string }[] = [
  { id: 'geral', rotulo: 'Geral' },
  { id: 'comercial', rotulo: 'Comercial' },
  { id: 'operacao', rotulo: 'Operação' },
  { id: 'fiscal', rotulo: 'Fiscal' },
  { id: 'financeiro', rotulo: 'Financeiro' },
]

export type BlocosInicio = { mapa: boolean; caixa: boolean; comercial: boolean; atalhos: { rotulo: string; para: string }[] }

const ATALHOS: Record<FuncaoInicio, { rotulo: string; para: string }[]> = {
  geral: [],
  comercial: [
    { rotulo: 'Cotação', para: '/cotacao' },
    { rotulo: 'Pré-cotação', para: '/pre-cotacao' },
    { rotulo: 'Cadastros', para: '/cadastros' },
  ],
  operacao: [
    { rotulo: 'Operações', para: '/operacoes' },
    { rotulo: 'Fila do dia', para: '/fila-do-dia' },
    { rotulo: 'Mapa', para: '/mapa' },
  ],
  fiscal: [
    { rotulo: 'Fiscal', para: '/fiscal' },
    { rotulo: 'Saúde fiscal', para: '/saude-fiscal' },
    { rotulo: 'Avisos', para: '/avisos' },
  ],
  financeiro: [
    { rotulo: 'Financeiro', para: '/financeiro' },
    { rotulo: 'Notas parceiros', para: '/notas-parceiros' },
  ],
}

export function blocosDaFuncao(f: FuncaoInicio): BlocosInicio {
  return {
    mapa: f === 'geral' || f === 'operacao',
    caixa: f === 'geral' || f === 'financeiro',
    comercial: f === 'geral' || f === 'comercial',
    atalhos: ATALHOS[f],
  }
}

// Visão inicial: a única função ativa da pessoa; com várias ou nenhuma, Geral. A escolha guardada vence, se for válida.
export function funcaoInicial(funcoesAtivas: string[], guardada: string | null): FuncaoInicio {
  const valida = (v: string | null): v is FuncaoInicio => FUNCOES_INICIO.some((x) => x.id === v)
  if (valida(guardada)) return guardada
  const unicas = [...new Set(funcoesAtivas)].filter(valida).filter((f) => f !== 'geral')
  return unicas.length === 1 ? unicas[0] : 'geral'
}
