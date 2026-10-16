import type { Json } from '@rbr/shared/database.types'

// Estado da averbação RC-V (Sompo) do MDF-e, lido de operacao_ciot_vpo.averbacao_rcv_* (gravado pela função
// enviar-averbacao-rcv, chamada sozinha pelo gatilho trg_averbar_automatico_ao_emitir quando o MDF-e é autorizado).

export interface AverbacaoRcv {
  averbacao_rcv_status: string | null
  averbacao_rcv_numero: string | null
  averbacao_rcv_erro: string | null
  averbacao_rcv_resposta: Json | null
  averbacao_rcv_em: string | null
}

export const COLUNAS_AVERBACAO_RCV = 'operacao_id, averbacao_rcv_status, averbacao_rcv_numero, averbacao_rcv_erro, averbacao_rcv_resposta, averbacao_rcv_em'

export type DocMin = { status: string; ambiente?: string | null; emitido_em?: string | null; atualizado_em?: string | null } | null | undefined

export type EstadoSompo = 'pendente' | 'homologacao' | 'processando' | 'averbado' | 'erro' | 'bloqueado'

export function estadoSompo(mdfe: DocMin, rcv: AverbacaoRcv | null | undefined): EstadoSompo {
  const st = rcv?.averbacao_rcv_status
  if (st === 'emitido') return 'averbado'
  if (st === 'erro') return 'erro'
  if (st === 'bloqueado') return 'bloqueado'
  if (mdfe?.status !== 'emitido') return 'pendente'
  if (mdfe.ambiente === 'homologacao') return 'homologacao'
  return 'processando'
}

// Para a releitura automática: MDF-e emitido em produção e a averbação ainda sem resultado.
export function sompoProcessando(mdfe: DocMin, rcv: AverbacaoRcv | null | undefined): boolean {
  return estadoSompo(mdfe, rcv) === 'processando'
}

// Aviso de orientação (não bloqueia): MDF-e emitido e Sompo ainda não averbada.
export function precisaAvisoSompo(mdfe: DocMin, rcv: AverbacaoRcv | null | undefined): boolean {
  return mdfe?.status === 'emitido' && mdfe.ambiente !== 'homologacao' && rcv?.averbacao_rcv_status !== 'emitido'
}

