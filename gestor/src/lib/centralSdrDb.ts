// Fila do SDR: chamadas ao banco. Quem decide é o banco (central_eh_sdr em cada função); a tela só pergunta.
import { db } from './prospeccaoDb'
import { falhou, gravarParametroCentral, registrar } from './centralDb'
import type { ItemFila } from './centralSdr'

export async function encherFila(): Promise<{ entraram_por_resposta: number; entraram_por_nota: number; corte_definido: boolean } | null> {
  const { data, error } = await db.rpc('central_sdr_encher')
  if (error) return null // função ainda não aplicada ou sem permissão: a lista abaixo mostra o erro real
  return data as { entraram_por_resposta: number; entraram_por_nota: number; corte_definido: boolean }
}
export async function listarFila(): Promise<ItemFila[]> {
  const { data, error } = await db.rpc('central_sdr_lista')
  falhou(error)
  return (data ?? []) as ItemFila[]
}
export async function assumir(id: string, quem: string): Promise<{ ok: boolean; assumido_por_nome?: string }> {
  const { data, error } = await db.rpc('central_sdr_assumir', { p_id: id, p_quem: quem })
  falhou(error)
  return data as { ok: boolean; assumido_por_nome?: string }
}
export async function devolver(id: string) { falhou((await db.rpc('central_sdr_devolver', { p_id: id })).error) }
export async function concluir(id: string, resultado: string, obs: string) {
  falhou((await db.rpc('central_sdr_concluir', { p_id: id, p_resultado: resultado, p_obs: obs || null })).error)
}
export async function pessoasDaFila(): Promise<{ id: string; nome: string }[]> {
  const { data: p } = await db.from('parametros_sistema').select('chave, valor').in('chave', ['PROSPECCAO_ADMIN_PESSOA_ID', 'CENTRAL_SDR_PESSOAS'])
  const ids = new Set<string>()
  for (const x of (p ?? []) as { chave: string; valor: unknown }[]) {
    if (typeof x.valor === 'string' && x.valor) ids.add(x.valor)
    if (Array.isArray(x.valor)) for (const v of x.valor) if (typeof v === 'string') ids.add(v)
  }
  if (ids.size === 0) return []
  const { data, error } = await db.from('pessoas').select('id, nome').in('id', [...ids])
  falhou(error)
  return (data ?? []) as { id: string; nome: string }[]
}
export async function lerAjustesFila(): Promise<{ corte: string; max: string }> {
  const { data } = await db.from('parametros_sistema').select('chave, valor').in('chave', ['CENTRAL_SDR_CORTE_NOTA', 'CENTRAL_SDR_MAX_DIA'])
  const m = Object.fromEntries(((data ?? []) as { chave: string; valor: unknown }[]).map((x) => [x.chave, x.valor == null ? '' : String(x.valor)]))
  return { corte: m.CENTRAL_SDR_CORTE_NOTA ?? '', max: m.CENTRAL_SDR_MAX_DIA ?? '10' }
}
// Só o Pedro (o banco recusa os outros). Cada mudança vai para o Registro.
export async function salvarAjusteFila(chave: 'CENTRAL_SDR_CORTE_NOTA' | 'CENTRAL_SDR_MAX_DIA', antes: string, valor: number) {
  await gravarParametroCentral(chave, valor)
  await registrar(chave === 'CENTRAL_SDR_CORTE_NOTA' ? 'Mudou a nota mínima da Fila do SDR' : 'Mudou o máximo de novos por dia na Fila do SDR',
    { tipo: 'param', chave, valor: antes === '' ? '' : Number(antes) }, { tipo: 'param', chave, valor })
}
