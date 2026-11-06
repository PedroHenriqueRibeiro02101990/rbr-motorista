// Fluxo da função repom-pedagio-rota, separado do Deno para testar com mocks: normaliza -> cache -> (cadastra rota + consulta
// valor) -> grava cache -> devolve. "Repositório" injetado: em produção é o Supabase (service_role), nos testes um objeto em memória.
import { chaveCanonicaRota, codigoRoteiroDe, type ClienteRepom, type PedidoRotaRepom, type TipoRota } from './repomClient.ts'

export interface RotaCache { id: string; codigo_roteiro_repom: string; codigo_percurso_repom: string; descricao_percurso: string | null }
export interface PedagioCache { valor_total: number; valor_ida: number | null; valor_volta: number | null; consultado_em: string; validade_dias: number }

export interface Repositorio {
  buscarRota(chaveHash: string): Promise<RotaCache | null>
  gravarRota(r: { chave_hash: string; codigo_roteiro_repom: string; codigo_percurso_repom: string; distancia_km: number | null }): Promise<RotaCache>
  buscarPedagio(rotaId: string, eixos: number, susIda: number, susVolta: number): Promise<PedagioCache | null>
  gravarPedagio(p: { rota_id: string; eixos: number; eixos_suspensos_ida: number; eixos_suspensos_volta: number; valor_total: number; valor_ida: number | null; valor_volta: number | null }, descricao: string | null): Promise<void>
}

export interface EntradaPedagio {
  ibgeOrigem: string
  ufOrigem: string
  ibgeDestino: string
  ufDestino: string
  paradas?: { ibge: string; uf: string }[]
  idaVolta: boolean
  eixos: number
  eixosSuspensosIda?: number
  eixosSuspensosVolta?: number
  tipoRota?: TipoRota
}

export interface SaidaPedagio {
  ok: boolean
  valor?: number
  valorIda?: number | null
  valorVolta?: number | null
  descricaoPercurso?: string | null
  consultadoEm?: string
  doCache?: boolean
  erro?: string
}

export const validoNoCache = (consultadoEm: string, validadeDias: number, agora = Date.now()) => agora - new Date(consultadoEm).getTime() < validadeDias * 86_400_000

export async function sha256Hex(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function pedagioPorRota(e: EntradaPedagio, repo: Repositorio, repom: ClienteRepom, agora = Date.now()): Promise<SaidaPedagio> {
  if (!(e.eixos >= 2 && e.eixos <= 15)) return { ok: false, erro: 'Informe o número de eixos (de 2 a 15).' }
  const susIda = e.eixosSuspensosIda ?? 0
  const susVolta = e.eixosSuspensosVolta ?? 0
  let chave: string
  try {
    chave = chaveCanonicaRota({ origem: { ibge: e.ibgeOrigem, uf: e.ufOrigem }, destino: { ibge: e.ibgeDestino, uf: e.ufDestino }, paradas: e.paradas, idaVolta: e.idaVolta, tipoRota: e.tipoRota })
  } catch (x) {
    return { ok: false, erro: (x as Error).message }
  }
  const hash = await sha256Hex(chave)

  let rota = await repo.buscarRota(hash)
  if (rota) {
    const cache = await repo.buscarPedagio(rota.id, e.eixos, susIda, susVolta)
    if (cache && validoNoCache(cache.consultado_em, cache.validade_dias, agora))
      return { ok: true, valor: cache.valor_total, valorIda: cache.valor_ida, valorVolta: cache.valor_volta, descricaoPercurso: rota.descricao_percurso, consultadoEm: cache.consultado_em, doCache: true }
  }
  if (!rota) {
    const pedido: PedidoRotaRepom = { codigoRoteiroCliente: codigoRoteiroDe(hash), origem: { ibge: e.ibgeOrigem, uf: e.ufOrigem }, destino: { ibge: e.ibgeDestino, uf: e.ufDestino }, paradas: e.paradas, idaVolta: e.idaVolta, tipoRota: e.tipoRota }
    const r = await repom.cadastrarRota(pedido)
    if (!r.ok) return { ok: false, erro: r.erro }
    rota = await repo.gravarRota({ chave_hash: hash, codigo_roteiro_repom: r.dados.codigoRoteiroRepom, codigo_percurso_repom: r.dados.codigoPercursoRepom, distancia_km: r.dados.distanciaKm })
  }
  const p = await repom.consultarPedagio({ codigoRoteiro: rota.codigo_roteiro_repom, codigoPercurso: rota.codigo_percurso_repom, eixos: e.eixos, eixosSuspensosIda: susIda || undefined, eixosSuspensosVolta: susVolta || undefined })
  if (!p.ok) return { ok: false, erro: p.erro }
  await repo.gravarPedagio({ rota_id: rota.id, eixos: e.eixos, eixos_suspensos_ida: susIda, eixos_suspensos_volta: susVolta, valor_total: p.dados.valorTotal, valor_ida: p.dados.valorIda, valor_volta: p.dados.valorVolta }, p.dados.descricaoPercurso)
  return { ok: true, valor: p.dados.valorTotal, valorIda: p.dados.valorIda, valorVolta: p.dados.valorVolta, descricaoPercurso: p.dados.descricaoPercurso, consultadoEm: new Date(agora).toISOString(), doCache: false }
}
