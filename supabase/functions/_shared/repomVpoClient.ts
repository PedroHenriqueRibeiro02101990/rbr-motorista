// Repom Vale-Pedágio (VPR, cliente 9501) como provedor de VPO: PLANO B. NÃO está ligado a nada; o provedor padrão
// continua sendo o NSPEDAGIO (vpoProvedor.ts / nspedagioClient.ts não foram alterados).
// Implementado: token próprio (POST /api/Token) com cache e renovação em 401, e consulta de TAG por placa.
// NÃO IMPLEMENTADO: emitir VPR e cancelar (o manual do Vale-Pedágio não está em docs/). TODO: implementar quando o manual chegar.
// Sem dependências do Deno. Segredos entram por `config`; nada é logado.
import { mensagemErroHttp, urlsRepom, type AmbienteRepom, type Fetch, type ResultadoRepom } from './repomClient.ts'
import { VpoNaoImplementado, type PedidoVpo, type ProvedorVpo, type ResultadoVpo, type SituacaoVpoFornecedor, type VpoEmitido } from './vpoProvedor.ts'

export interface ConfigRepomVpo {
  ambiente: AmbienteRepom
  login: string // REPOM_VPR_VALEPEDAGIO_LOGIN
  senha: string // REPOM_VPR_VALEPEDAGIO_SENHA
  codigoCliente: string // REPOM_VPR_CODIGO_CLIENTE
  urlBase?: string // sobrescrita (testes)
  urlToken?: string
  limiteMs?: number
}

// CONFIRMAR no manual do Vale-Pedágio: caminho da consulta de TAG e formato do corpo do token.
export const CAMINHO_CONSULTA_TAG = '/api/Tag/Consultar'

export interface TagVeiculo {
  placa: string
  possuiTag: boolean
  operadora: string | null
}

export interface RepomVpoClient extends ProvedorVpo {
  consultarTag(placa: string): Promise<ResultadoRepom<TagVeiculo>>
}

export function criarRepomVpoClient(config: ConfigRepomVpo, fetchFn: Fetch = (u, i) => fetch(u, i) as never): RepomVpoClient {
  const urlToken = config.urlToken ?? urlsRepom(config.ambiente).tokenValePedagio
  const urlBase = config.urlBase ?? urlToken.replace(/\/api\/Token$/i, '')
  const limite = config.limiteMs ?? 30_000
  let token: { valor: string; expira: number } | null = null

  async function http(url: string, init: { method: string; headers: Record<string, string>; body?: string }) {
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), limite)
    try {
      return await fetchFn(url, { ...init, signal: ctl.signal })
    } catch {
      throw new Error('Não consegui falar com a Repom agora.')
    } finally {
      clearTimeout(t)
    }
  }
  async function obterToken(forcar = false): Promise<string> {
    if (!forcar && token && token.expira > Date.now() + 60_000) return token.valor
    const r = await http(urlToken, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ Login: config.login, Senha: config.senha, CodigoCliente: config.codigoCliente }) }) // CONFIRMAR campos
    const j = (await r.json().catch(() => null)) as { access_token?: string; token?: string; expires_in?: number } | null
    const valor = j?.access_token ?? j?.token
    if (!r.ok || !valor) throw new Error(mensagemErroHttp(r.status))
    token = { valor, expira: Date.now() + (Number(j?.expires_in) || 3600) * 1000 }
    return token.valor
  }

  return {
    fornecedor: 'repom',
    async consultarTag(placa) {
      if (!config.login || !config.senha) return { ok: false, http: 0, erro: 'Credenciais da Repom não configuradas.', bruto: null }
      try {
        for (let tentativa = 0; tentativa < 2; tentativa++) {
          const t = await obterToken(tentativa > 0)
          const r = await http(`${urlBase}${CAMINHO_CONSULTA_TAG}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${t}` }, body: JSON.stringify({ Placa: placa.replace(/[^A-Za-z0-9]/g, '').toUpperCase() }) })
          if (r.status === 401 && tentativa === 0) continue
          const bruto = await r.json().catch(() => null)
          if (!r.ok) return { ok: false, http: r.status, erro: mensagemErroHttp(r.status), bruto }
          const o = (bruto ?? {}) as Record<string, unknown>
          return { ok: true, http: r.status, bruto, dados: { placa, possuiTag: Boolean(o.possuiTag ?? o.PossuiTag ?? false), operadora: (o.operadora ?? o.Operadora ?? null) as string | null } } // CONFIRMAR campos
        }
        return { ok: false, http: 401, erro: mensagemErroHttp(401), bruto: null }
      } catch (e) {
        return { ok: false, http: 0, erro: (e as Error).message, bruto: null }
      }
    },
    // NÃO IMPLEMENTADO (TODO: manual do Vale-Pedágio): emissão e cancelamento do VPR.
    emitir: (_p: PedidoVpo): Promise<ResultadoVpo<VpoEmitido>> => Promise.reject(new VpoNaoImplementado('repom', 'emitir')),
    consultar: (_id: string): Promise<ResultadoVpo<SituacaoVpoFornecedor>> => Promise.reject(new VpoNaoImplementado('repom', 'consultar')),
    cancelar: (_id: string, _m: string): Promise<ResultadoVpo<{ protocolo: string | null }>> => Promise.reject(new VpoNaoImplementado('repom', 'cancelar')),
  }
}
