// B17: tabela única de prazos fiscais e de transporte. Um só lugar; as telas e as funções consultam aqui.
// Datas em milissegundos (UTC). Sem rede, sem segredos.

const H = 3_600_000
const DIA = 24 * H

export const PRAZOS = {
  cte: { cancelarDias: 7, substituicaoDias: 60 },
  mdfe: { cancelarHoras: 24, encerrarDias: 30 },
  ciot: { cancelarHorasAntesDoInicio: 24, encerrarDiasAposFimPrevisto: 5, encerrarDiasAposFimPrevistoTacAgregado: 30, operacaoDiasMax: 90 },
  vpo: { validadeDiasMax: 15 },
  // Rejeição 684: CIOT exigido no MDF-e em produção a partir de 23/11/2026 (00:00, Brasília).
  ciotObrigatorioNoMdfeEm: Date.UTC(2026, 10, 23, 3, 0, 0),
} as const

export type Veredito = { pode: boolean; motivo?: string }

const ok: Veredito = { pode: true }
const nao = (motivo: string): Veredito => ({ pode: false, motivo })

export function podeCancelarCte(emitidoEm: number, agora: number, mdfeAtivo: boolean): Veredito {
  if (mdfeAtivo) return nao('Há MDF-e ativo: cancele ou encerre o MDF-e antes.')
  if (agora - emitidoEm > PRAZOS.cte.cancelarDias * DIA) return nao('Passaram 7 dias da emissão: use o CT-e de substituição (até 60 dias).')
  return ok
}

export function podeSubstituirCte(emitidoEm: number, agora: number): Veredito {
  return agora - emitidoEm > PRAZOS.cte.substituicaoDias * DIA ? nao('Passaram 60 dias da emissão do CT-e.') : ok
}

export function podeCancelarMdfe(emitidoEm: number, agora: number, viagemIniciada: boolean): Veredito {
  if (viagemIniciada) return nao('A viagem já começou: encerre o MDF-e e emita outro.')
  if (agora - emitidoEm > PRAZOS.mdfe.cancelarHoras * H) return nao('Passaram 24 horas da emissão: encerre o MDF-e e emita outro.')
  return ok
}

export function podeEncerrarMdfe(emitidoEm: number, agora: number): Veredito {
  return agora - emitidoEm > PRAZOS.mdfe.encerrarDias * DIA ? nao('Passaram 30 dias da emissão do MDF-e.') : ok
}

export function podeCancelarCiot(inicioPrevisto: number, agora: number): Veredito {
  return inicioPrevisto - agora < PRAZOS.ciot.cancelarHorasAntesDoInicio * H
    ? nao('O CIOT só cancela até 24 horas antes do início da viagem: encerre e emita outro.')
    : ok
}

export function podeEncerrarCiot(fimPrevisto: number, agora: number, tacAgregado = false): Veredito {
  const dias = tacAgregado ? PRAZOS.ciot.encerrarDiasAposFimPrevistoTacAgregado : PRAZOS.ciot.encerrarDiasAposFimPrevisto
  return agora - fimPrevisto > dias * DIA ? nao(`Passaram ${dias} dias do fim previsto da viagem.`) : ok
}

export function vigenciaVpoValida(inicio: number, fim: number): Veredito {
  if (fim < inicio) return nao('A vigência termina antes de começar.')
  return fim - inicio > PRAZOS.vpo.validadeDiasMax * DIA ? nao('O vale-pedágio vale no máximo 15 dias.') : ok
}

export function ciotObrigatorioNoMdfe(agora: number): boolean {
  return agora >= PRAZOS.ciotObrigatorioNoMdfeEm
}

export function diasParaCiotObrigatorio(agora: number): number {
  return Math.ceil((PRAZOS.ciotObrigatorioNoMdfeEm - agora) / DIA)
}
