// Linha do tempo em palavras simples para o agenciador. Mapeia o status interno da operacao (sem expor detalhes).
export const ETAPAS_OPERACAO = ['Em análise pela RBR', 'Motorista confirmado', 'Coletado', 'Em viagem', 'Entregue'] as const

export function etapaDaOperacao(status: string): number {
  switch (status) {
    case 'alocando_motorista':
    case 'aguardando_liberacao_fiscal':
      return 0
    case 'liberada_coleta':
      return 1
    case 'carregando':
      return 2
    case 'em_transito':
      return 3
    case 'entregue':
    case 'fechada':
      return 4
    default:
      return 0
  }
}
