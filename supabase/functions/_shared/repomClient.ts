// Repom (API VPR, cliente 9501): roteirização de pedágio/distância para a COTAÇÃO e base do plano B de VPO.
// Adaptador único, sem dependências do Deno (testes em repomClient.test.ts). NÃO grava em banco: quem chama grava a linha
// em repom_requisicoes ANTES de interpretar a resposta. Segredos são lidos do Vault por quem chama e passados em `config`;
// nunca são logados nem devolvidos. Token cacheado em memória (validade 1 h) e renovado em 401; nunca um token por chamada.
// Formatos: manual v2.0 (nov/2025) conforme o resumo do pedido. Pontos marcados "CONFIRMAR" não constavam no resumo
// e devem ser conferidos no manual/QA antes de ligar a flag.

export type AmbienteRepom = 'qa' | 'prd'

export function ambienteRepom(valor: string | null | undefined): AmbienteRepom {
  return String(valor ?? '').trim().toLowerCase() === 'prd' ? 'prd' : 'qa' // padrão qa
}

export interface UrlsRepom {
  tokenRoteirizacao: string
  roteirizacao: string
  tokenValePedagio: string
}
export function urlsRepom(amb: AmbienteRepom): UrlsRepom {
  return amb === 'prd'
    ? {
        tokenRoteirizacao: 'https://www.repom.com.br/Repom.IdentityServer/connect/token',
        roteirizacao: 'https://roteirizacao.repom.com.br',
        tokenValePedagio: 'https://www.repom.com.br/Repom.ValePedagio.WebAPI/api/Token',
      }
    : {
        tokenRoteirizacao: 'https://qa.repom.com.br/Repom.IdentityServer/connect/token',
        roteirizacao: 'https://roteirizacaoa.repom.com.br',
        tokenValePedagio: 'https://qa.repom.com.br/Repom.ValePedagio.WebAPI/api/Token',
      }
}

export interface ConfigRepom {
  ambiente: AmbienteRepom
  codigoCliente: string // REPOM_VPR_CODIGO_CLIENTE
  roteirizacaoLogin: string
  roteirizacaoSenha: string
  valePedagioLogin: string
  valePedagioSenha: string
  limiteMs?: number // timeout de cada chamada (padrão 30 s)
  urls?: Partial<UrlsRepom> // sobrescrita opcional (testes)
}

export type Fetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text?(): Promise<string> }>

export type ResultadoRepom<T> = { ok: true; http: number; dados: T; bruto: unknown } | { ok: false; http: number; erro: string; bruto: unknown }

// ---------- regras puras ----------

/** IBGE de 7 dígitos -> código Repom: tira os 2 primeiros (UF) e os zeros à esquerda. 1801012 -> 1012; 3550308 -> 50308. */
export function ibgeParaRepom(ibge: string | number | null | undefined): string {
  const d = String(ibge ?? '').replace(/\D/g, '')
  if (d.length !== 7) throw new Error('Código IBGE inválido: precisa ter 7 dígitos.')
  const resto = d.slice(2).replace(/^0+/, '')
  if (!resto) throw new Error('Código IBGE inválido.')
  return resto
}

export type TipoRota = 'mais_rapida' | 'mais_curta' | 'curta' | 'economica'
export const TIPO_ROTA_CODIGO: Record<TipoRota, number> = { mais_rapida: 1, mais_curta: 2, curta: 3, economica: 4 } // CONFIRMAR códigos no manual

export interface PontoRepom {
  ibge: string // 7 dígitos
  uf: string
}
export interface PedidoRotaRepom {
  codigoRoteiroCliente: string // até 10 caracteres
  origem: PontoRepom
  destino: PontoRepom
  paradas?: PontoRepom[] // até 23, sem repetir origem/destino
  idaVolta: boolean
  tipoRota?: TipoRota
  tipoVeiculo?: number // CONFIRMAR
}

export function validarPedidoRota(p: PedidoRotaRepom): string | null {
  if (!p.codigoRoteiroCliente || p.codigoRoteiroCliente.length > 10) return 'Código do roteiro inválido (até 10 caracteres).'
  const paradas = p.paradas ?? []
  if (paradas.length > 23) return 'No máximo 23 paradas.'
  if (p.origem.ibge === p.destino.ibge) return 'Origem e destino não podem ser a mesma cidade.'
  if (paradas.some((x) => x.ibge === p.origem.ibge || x.ibge === p.destino.ibge)) return 'As paradas não podem repetir a origem nem o destino.'
  return null
}

export function montarCorpoRota(p: PedidoRotaRepom) {
  const ponto = (x: PontoRepom) => ({ CodigoIBGE: ibgeParaRepom(x.ibge), Estado: x.uf.toUpperCase() })
  return {
    IdaVolta: p.idaVolta,
    CodigoRoteiroCliente: p.codigoRoteiroCliente,
    Origem: ponto(p.origem),
    Destino: ponto(p.destino),
    Paradas: (p.paradas ?? []).map(ponto),
    TipoRota: TIPO_ROTA_CODIGO[p.tipoRota ?? 'mais_rapida'], // CONFIRMAR nome do campo
    ...(p.tipoVeiculo != null ? { TipoVeiculo: p.tipoVeiculo } : {}), // CONFIRMAR nome do campo
  }
}

export interface PedidoPedagioRepom {
  codigoRoteiro: string
  codigoPercurso: string
  eixos: number
  eixosSuspensosIda?: number
  eixosSuspensosVolta?: number
}
export function montarCorpoPedagio(p: PedidoPedagioRepom) {
  return {
    CodigoRoteiro: p.codigoRoteiro,
    CodigoPercurso: p.codigoPercurso,
    NumeroEixos: String(p.eixos), // a API pede texto
    ...(p.eixosSuspensosIda != null ? { NumeroEixosSuspensosIda: String(p.eixosSuspensosIda) } : {}),
    ...(p.eixosSuspensosVolta != null ? { NumeroEixosSuspensosVolta: String(p.eixosSuspensosVolta) } : {}),
  }
}

export interface RotaRepom {
  codigoRoteiroRepom: string
  codigoPercursoRepom: string
  distanciaKm: number | null
}
export interface PedagioRepom {
  valorTotal: number
  valorIda: number | null
  valorVolta: number | null
  descricaoPercurso: string | null
}

const num = (v: unknown): number | null => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v))
const pick = (o: Record<string, unknown>, ...nomes: string[]) => {
  for (const n of nomes) for (const k of Object.keys(o)) if (k.toLowerCase() === n.toLowerCase() && o[k] != null) return o[k]
  return undefined
}

export function lerRota(bruto: unknown): RotaRepom | null {
  const o = (Array.isArray(bruto) ? bruto[0] : bruto) as Record<string, unknown> | null
  if (!o || typeof o !== 'object') return null
  const r = pick(o, 'codigoRoteiroRepom')
  const p = pick(o, 'codigoPercursoRepom')
  if (r == null || p == null) return null
  return { codigoRoteiroRepom: String(r), codigoPercursoRepom: String(p), distanciaKm: num(pick(o, 'distancia', 'distanciaKm', 'distanciaTotal')) } // CONFIRMAR nome da distância
}
export function lerPedagio(bruto: unknown): PedagioRepom | null {
  const o = (Array.isArray(bruto) ? bruto[0] : bruto) as Record<string, unknown> | null
  if (!o || typeof o !== 'object') return null
  const total = num(pick(o, 'valorTotalVpr'))
  if (total == null) return null
  return { valorTotal: total, valorIda: num(pick(o, 'valorVprIda')), valorVolta: num(pick(o, 'valorVprVolta')), descricaoPercurso: (pick(o, 'descricaoPercurso') as string | undefined) ?? null }
}

/** Remove qualquer coisa que pareça segredo/token antes de gravar ou devolver. */
export function higienizar(obj: unknown): unknown {
  const proibidas = /(senha|password|secret|token|authorization|login|client_?id)/i
  const rec = (v: unknown, nivel: number): unknown => {
    if (nivel > 6 || v == null || typeof v !== 'object') return v
    if (Array.isArray(v)) return v.map((x) => rec(x, nivel + 1))
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, proibidas.test(k) ? '[oculto]' : rec(x, nivel + 1)]))
  }
  return rec(obj, 0)
}

export function mensagemErroHttp(status: number): string {
  if (status === 401 || status === 403) return 'A Repom recusou o acesso. Confira as credenciais.'
  if (status === 404) return 'A Repom não encontrou a rota consultada.'
  if (status === 429) return 'Muitas consultas à Repom. Tente novamente em instantes.'
  if (status >= 500) return 'A Repom está indisponível agora. Informe o pedágio manualmente.'
  return `A Repom não aceitou a consulta (HTTP ${status}).`
}

// ---------- cliente ----------

export interface ClienteRepom {
  readonly ambiente: AmbienteRepom
  cadastrarRota(p: PedidoRotaRepom): Promise<ResultadoRepom<RotaRepom>>
  consultarPedagio(p: PedidoPedagioRepom): Promise<ResultadoRepom<PedagioRepom>>
}

function credenciaisCompletas(c: Partial<ConfigRepom>): c is ConfigRepom {
  return Boolean(c.roteirizacaoLogin && c.roteirizacaoSenha)
}

export function criarRepomClient(config: ConfigRepom, fetchFn: Fetch = (u, i) => fetch(u, i) as never): ClienteRepom {
  const urls = { ...urlsRepom(config.ambiente), ...(config.urls ?? {}) }
  const limite = config.limiteMs ?? 30_000
  let token: { valor: string; expira: number } | null = null

  async function http(url: string, init: { method: string; headers: Record<string, string>; body?: string }) {
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), limite)
    try {
      return await fetchFn(url, { ...init, signal: ctl.signal })
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') throw new Error('A Repom demorou demais para responder. Informe o pedágio manualmente.')
      throw new Error('Não consegui falar com a Repom agora. Informe o pedágio manualmente.')
    } finally {
      clearTimeout(t)
    }
  }

  async function obterToken(forcar = false): Promise<string> {
    if (!forcar && token && token.expira > Date.now() + 60_000) return token.valor
    // OAuth2 client_credentials. CONFIRMAR no QA: login/senha como client_id/client_secret e o escopo exigido.
    const corpo = new URLSearchParams({ grant_type: 'client_credentials', client_id: config.roteirizacaoLogin, client_secret: config.roteirizacaoSenha }).toString()
    const r = await http(urls.tokenRoteirizacao, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: corpo })
    const j = (await r.json().catch(() => null)) as { access_token?: string; expires_in?: number } | null
    if (!r.ok || !j?.access_token) throw new Error(mensagemErroHttp(r.status))
    token = { valor: j.access_token, expira: Date.now() + (Number(j.expires_in) || 3600) * 1000 }
    return token.valor
  }

  async function chamar(caminho: string, corpo: unknown): Promise<{ status: number; bruto: unknown }> {
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const t = await obterToken(tentativa > 0)
      const r = await http(`${urls.roteirizacao}${caminho}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${t}` }, body: JSON.stringify(corpo) })
      if (r.status === 401 && tentativa === 0) continue // token vencido: renova e tenta uma vez
      return { status: r.status, bruto: await r.json().catch(() => null) }
    }
    throw new Error(mensagemErroHttp(401))
  }

  return {
    ambiente: config.ambiente,
    async cadastrarRota(p) {
      const inval = validarPedidoRota(p)
      if (inval) return { ok: false, http: 0, erro: inval, bruto: null }
      if (!credenciaisCompletas(config)) return { ok: false, http: 0, erro: 'Credenciais da Repom não configuradas.', bruto: null }
      try {
        const { status, bruto } = await chamar('/Api/Rota', montarCorpoRota(p))
        const dados = status >= 200 && status < 300 ? lerRota(bruto) : null
        if (!dados) return { ok: false, http: status, erro: status >= 200 && status < 300 ? 'A Repom respondeu em formato inesperado.' : mensagemErroHttp(status), bruto }
        return { ok: true, http: status, dados, bruto }
      } catch (e) {
        return { ok: false, http: 0, erro: (e as Error).message, bruto: null }
      }
    },
    async consultarPedagio(p) {
      if (!credenciaisCompletas(config)) return { ok: false, http: 0, erro: 'Credenciais da Repom não configuradas.', bruto: null }
      try {
        const { status, bruto } = await chamar('/Api/Roteiro', montarCorpoPedagio(p))
        const dados = status >= 200 && status < 300 ? lerPedagio(bruto) : null
        if (!dados) return { ok: false, http: status, erro: status >= 200 && status < 300 ? 'A Repom respondeu em formato inesperado.' : mensagemErroHttp(status), bruto }
        return { ok: true, http: status, dados, bruto }
      } catch (e) {
        return { ok: false, http: 0, erro: (e as Error).message, bruto: null }
      }
    },
  }
}

/** Chave estável da rota para o cache (hash feito por quem chama; aqui só a string canônica). */
export function chaveCanonicaRota(p: Pick<PedidoRotaRepom, 'origem' | 'destino' | 'paradas' | 'idaVolta' | 'tipoRota'>): string {
  const pts = [p.origem, ...(p.paradas ?? []), p.destino].map((x) => ibgeParaRepom(x.ibge) + x.uf.toUpperCase()).join('>')
  return `${pts}|${p.idaVolta ? 'iv' : 'i'}|${p.tipoRota ?? 'mais_rapida'}`
}

/** Código de roteiro do cliente (até 10 caracteres) derivado do hash da chave. */
export function codigoRoteiroDe(hashHex: string): string {
  return ('R' + hashHex.replace(/[^0-9a-f]/gi, '').toUpperCase()).slice(0, 10)
}

const UF_POR_CODIGO: Record<string, string> = { '11': 'RO', '12': 'AC', '13': 'AM', '14': 'RR', '15': 'PA', '16': 'AP', '17': 'TO', '21': 'MA', '22': 'PI', '23': 'CE', '24': 'RN', '25': 'PB', '26': 'PE', '27': 'AL', '28': 'SE', '29': 'BA', '31': 'MG', '32': 'ES', '33': 'RJ', '35': 'SP', '41': 'PR', '42': 'SC', '43': 'RS', '50': 'MS', '51': 'MT', '52': 'GO', '53': 'DF' }
/** UF a partir dos 2 primeiros dígitos do IBGE (a Repom exige o Estado junto do código). */
export function ufDoIbge(ibge: string | number | null | undefined): string | null {
  const d = String(ibge ?? '').replace(/\D/g, '')
  return d.length === 7 ? (UF_POR_CODIGO[d.slice(0, 2)] ?? null) : null
}
