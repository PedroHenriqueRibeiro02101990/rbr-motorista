// Regras puras da operação (sem rede, sem banco). Ligam-se às telas e funções em etapas seguintes.
// C08 limite da apólice, D01 fila por urgência, D12 alertas de prazo, B13 esteira de etapas.

const H = 3_600_000
const DIA = 24 * H

// C08: limite lido do cadastro das apólices (nunca fixo). Amarelo >= 80%, trava acima de 100% até o gestor liberar com a comunicação anexada.
export type SituacaoApolice = { nivel: 'ok' | 'amarelo' | 'travado'; percentual: number; pode_emitir: boolean; motivo?: string }
export function situacaoApolice(valorOperacao: number, outrosDoComboio: number, limite: number, liberadoComComunicacao = false): SituacaoApolice {
  if (!(limite > 0)) return { nivel: 'travado', percentual: 0, pode_emitir: false, motivo: 'Sem limite de apólice cadastrado.' }
  const percentual = ((valorOperacao + outrosDoComboio) / limite) * 100
  if (percentual > 100) {
    return liberadoComComunicacao
      ? { nivel: 'travado', percentual, pode_emitir: true, motivo: 'Acima do limite, liberado pelo gestor com a comunicação à seguradora.' }
      : { nivel: 'travado', percentual, pode_emitir: false, motivo: 'Acima do limite da apólice: o gestor libera com a comunicação à seguradora anexada.' }
  }
  if (percentual >= 80) return { nivel: 'amarelo', percentual, pode_emitir: true, motivo: 'Perto do limite da apólice (80% ou mais).' }
  return { nivel: 'ok', percentual, pode_emitir: true }
}

// D01: coleta mais próxima primeiro; menos de 24 h é urgente; espera amarela com 2 h, vermelha com 4 h.
export type ItemFila = { id: string; coletaEm: number | null; esperandoDesde: number }
export type ItemFilaClassificado = ItemFila & { urgente: boolean; espera: 'normal' | 'amarela' | 'vermelha' }
export function ordenarFila(itens: ItemFila[], agora: number): ItemFilaClassificado[] {
  return itens
    .map((i) => {
      const esperaH = (agora - i.esperandoDesde) / H
      return {
        ...i,
        urgente: i.coletaEm != null && i.coletaEm - agora < DIA,
        espera: (esperaH >= 4 ? 'vermelha' : esperaH >= 2 ? 'amarela' : 'normal') as ItemFilaClassificado['espera'],
      }
    })
    .sort((a, b) => (a.coletaEm ?? Infinity) - (b.coletaEm ?? Infinity))
}

// D12: passou da entrega prevista sem finalizar; CIOT perto de 5 dias do fim previsto; MDF-e perto de 30 dias.
export type DadosPrazoViagem = { entregaPrevista?: number | null; finalizada?: boolean; ciotFimPrevisto?: number | null; ciotEncerrado?: boolean; mdfeEmitidoEm?: number | null; mdfeEncerrado?: boolean }
export function alertasDePrazo(d: DadosPrazoViagem, agora: number): string[] {
  const a: string[] = []
  if (!d.finalizada && d.entregaPrevista != null && agora > d.entregaPrevista) a.push('Passou da entrega prevista e a viagem não foi finalizada.')
  if (!d.ciotEncerrado && d.ciotFimPrevisto != null && agora - d.ciotFimPrevisto > 4 * DIA) a.push('O CIOT está perto do prazo de 5 dias para encerrar.')
  if (!d.mdfeEncerrado && d.mdfeEmitidoEm != null && agora - d.mdfeEmitidoEm > 28 * DIA) a.push('O MDF-e está perto do prazo de 30 dias para encerrar.')
  return a
}

// B13: etapas da esteira, com 'não se aplica' e o motivo (sem pedágio: sem VPO; frota própria: sem CIOT).
export type EtapaEsteira = { etapa: 'cte' | 'averbacao' | 'vpo' | 'ciot' | 'mdfe' | 'rcv' | 'saida'; aplica: boolean; motivo?: string }
export function esteiraDaOperacao(o: { temPedagio: boolean; frotaPropria: boolean }): EtapaEsteira[] {
  return [
    { etapa: 'cte', aplica: true },
    { etapa: 'averbacao', aplica: true },
    o.temPedagio ? { etapa: 'vpo', aplica: true } : { etapa: 'vpo', aplica: false, motivo: 'Sem pedágio: sem vale-pedágio.' },
    o.frotaPropria ? { etapa: 'ciot', aplica: false, motivo: 'Frota própria: sem CIOT.' } : { etapa: 'ciot', aplica: true },
    { etapa: 'mdfe', aplica: true },
    { etapa: 'rcv', aplica: true },
    { etapa: 'saida', aplica: true },
  ]
}
