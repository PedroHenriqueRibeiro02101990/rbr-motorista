// B11: próximo passo de cada serviço e QUEM faz (a função responsável). O sistema ainda não guarda o nome de quem
// assumiu cada passo, então mostra a função (Operação, Fiscal, Gestor, Comercial ou Motorista), não a pessoa.
export type QuemFaz = 'Comercial' | 'Operação' | 'Fiscal' | 'Gestor' | 'Motorista' | null

export function proximoPassoQuem(status: string, temMotorista = false): { passo: string; quem: QuemFaz } | null {
  switch (status) {
    case 'aguardando_assumir':
      return { passo: 'Assumir a operação', quem: 'Operação' }
    case 'alocando_motorista':
      return temMotorista ? { passo: 'Conferir a alocação e enviar o frete', quem: 'Operação' } : { passo: 'Alocar motorista e veículo', quem: 'Operação' }
    case 'aguardando_aceite_motorista':
      return { passo: 'Esperar o aceite do motorista', quem: 'Motorista' }
    case 'aguardando_liberacao_fiscal':
    case 'em_emissao':
      return { passo: 'Emitir os documentos fiscais', quem: 'Fiscal' }
    case 'devolvida_pelo_fiscal':
      return { passo: 'Corrigir o que o fiscal devolveu', quem: 'Operação' }
    case 'pausada_por_alteracao':
      return { passo: 'Decidir a alteração depois do aceite', quem: 'Gestor' }
    case 'aguardando_liberacao_gestor':
    case 'ordem_liberada':
      return { passo: 'Liberar a ordem de coleta', quem: 'Gestor' }
    case 'liberada_coleta':
      return { passo: 'Coleta pelo motorista', quem: 'Motorista' }
    case 'carregando':
    case 'em_transito':
    case 'em_viagem':
      return { passo: 'Acompanhar a viagem', quem: 'Operação' }
    case 'entregue':
    case 'finalizando':
      return { passo: 'Finalizar a viagem', quem: 'Operação' }
    default:
      return null
  }
}

export function textoProximoPasso(status: string, temMotorista = false): string {
  const r = proximoPassoQuem(status, temMotorista)
  return r ? `Próximo: ${r.passo}${r.quem ? ` (${r.quem})` : ''}` : ''
}
