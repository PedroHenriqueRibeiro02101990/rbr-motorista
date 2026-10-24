// Cliente da efrete (NSTech) — CIOT e pagamento ao motorista. Passo 2: só conexão (login/logout) e consulta de situação.
//
// Tudo passa pela interface ProvedorCiot, para o resto do ERP não depender do fornecedor (mesmo espírito do repomClient).
// Regras de segurança:
// - usuário, senha, hash do integrador e URL vêm do Vault (public.efrete_segredo, só service_role); nada fica no código;
// - nunca loga usuário, senha, hash nem o token (do token, no máximo os 4 primeiros caracteres);
// - o token fica só na memória do isolate, com validade conservadora (20 min), e é refeito uma vez se o servidor disser
//   que a sessão caiu.
// Sem dependências do Deno: roda nas Edge Functions e nos testes do Node (efreteClient.test.ts, com fetch simulado).

export interface ConfigEfrete {
  baseUrl: string // ex.: https://dev.efrete.com.br  (sem /services)
  usuario: string
  senha: string
  integrador: string
}

export interface ErroEfrete {
  codigo: string // código da efrete (Excecao.Codigo) ou nosso: HTTP_<n>, TIMEOUT, REDE, LOGIN_NULO, RESPOSTA_INVALIDA, CONFIG
  mensagem: string
  http?: number
}

export type Resultado<T> = { ok: true; dados: T } | { ok: false; erro: ErroEfrete }
export type Verbo = 'GET' | 'POST'

export interface SituacaoTransportador {
  rntrcAtivo: boolean | null
  tacOuEquiparado: boolean | null
  rntrcAtivoAteFimViagem: boolean | null
  veiculos: { placa: string; fazParteDaFrota: boolean | null }[]
  bruto: Record<string, unknown> // resposta original, sem credenciais
}

export interface ConsultaSituacao {
  interessadoCpfCnpj: string
  transportadorCpfCnpj: string
  rntrc: string
  placas: string[]
  dataPrevistaFimViagem?: string // YYYY-MM-DD
}

// Interface única do ERP para o provedor de CIOT/pagamento.
export interface ProvedorCiot {
  login(opcoes?: { usuario?: string; forcar?: boolean }): Promise<Resultado<{ tokenPrefixo: string }>>
  logout(): Promise<Resultado<null>>
  chamar<T = Record<string, unknown>>(servico: string, metodo: string, verbo: Verbo, corpo: Record<string, unknown>): Promise<Resultado<T>>
  consultarSituacaoTransportador(c: ConsultaSituacao): Promise<Resultado<SituacaoTransportador>>
}

export interface DepsEfrete {
  carregarConfig: () => Promise<ConfigEfrete>
  fetch?: typeof fetch
  agora?: () => number
  timeoutMs?: number
  validadeTokenMs?: number
  log?: (msg: string) => void
  // Verbo do login e do logout (o manual diz GET no login e POST no logout; o servidor real decide).
  verboLogin?: Verbo
  verboLogout?: Verbo
  verboConsulta?: Verbo // ConsultaSituacaoTransportador (manual: GET)
}

const VERSAO = 1
const soDigitos = (s: string) => (s ?? '').replace(/\D/g, '')
export const prefixoToken = (t: string | null | undefined) => (t ? `${t.slice(0, 4)}…` : '(nulo)')

// Sessão caiu / token inválido → vale refazer o login uma vez.
export function ehErroDeSessao(mensagem: string | null | undefined): boolean {
  return /n[aã]o\s+(est[aá]\s+)?logad|token\s+n[aã]o\s+pode\s+ser\s+nulo|token\s+(inv[aá]lido|expirad)|sess[aã]o\s+(expirad|inv[aá]lid)/i.test(mensagem ?? '')
}

// Monta a URL e o init. GET leva os campos na query (listas/objetos como JSON); POST leva JSON no corpo.
export function montarRequisicao(baseUrl: string, servico: string, metodo: string, verbo: Verbo, corpo: Record<string, unknown>) {
  const base = baseUrl.replace(/\/+$/, '').replace(/\/services$/i, '')
  const url = new URL(`${base}/services/${servico}/${metodo}`)
  if (verbo === 'GET') {
    for (const [k, v] of Object.entries(corpo)) {
      if (v === undefined || v === null) continue
      url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v))
    }
    return { url: url.toString(), init: { method: 'GET', headers: { Accept: 'application/json' } } as RequestInit }
  }
  return {
    url: url.toString(),
    init: { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(corpo) } as RequestInit,
  }
}

// Interpreta a resposta: HTTP, JSON e o padrão Sucesso/Excecao da efrete.
export function interpretarResposta(http: number, texto: string): Resultado<Record<string, unknown>> {
  let json: unknown = null
  try {
    json = texto ? JSON.parse(texto) : null
  } catch {
    json = null
  }
  const obj = json && typeof json === 'object' ? (json as Record<string, unknown>) : null
  const exc = (obj?.Excecao ?? obj?.excecao) as { Mensagem?: string; Codigo?: unknown } | null | undefined
  if (http < 200 || http >= 300) {
    return {
      ok: false,
      erro: { codigo: exc?.Codigo != null ? String(exc.Codigo) : `HTTP_${http}`, mensagem: exc?.Mensagem ?? ((texto || '').slice(0, 300) || `HTTP ${http}`), http },
    }
  }
  if (!obj) return { ok: false, erro: { codigo: 'RESPOSTA_INVALIDA', mensagem: `Resposta não é JSON: ${(texto || '').slice(0, 200)}`, http } }
  const sucesso = obj.Sucesso ?? obj.sucesso
  if (sucesso === false || (exc && (exc.Mensagem || exc.Codigo != null))) {
    return { ok: false, erro: { codigo: exc?.Codigo != null ? String(exc.Codigo) : 'SEM_CODIGO', mensagem: exc?.Mensagem ?? 'A efrete recusou sem mensagem.', http } }
  }
  return { ok: true, dados: obj }
}

// Variantes do campo Usuario para o teste de login (o manual pede CPF; a NSTech mandou "usuario@empresa" com espaço).
export function varianteUsuario(usuario: string, variante: 'original' | 'sem_espaco' | 'cnpj', cnpj?: string): string {
  if (variante === 'sem_espaco') return usuario.replace(/\s+/g, '')
  if (variante === 'cnpj') return soDigitos(cnpj ?? '')
  return usuario
}

export function criarClienteEfrete(deps: DepsEfrete): ProvedorCiot & { tokenPrefixo(): string } {
  const f = deps.fetch ?? fetch
  const agora = deps.agora ?? (() => Date.now())
  const timeoutMs = deps.timeoutMs ?? 25_000
  const validade = deps.validadeTokenMs ?? 20 * 60_000
  const log = deps.log ?? (() => {})
  let config: ConfigEfrete | null = null
  let token: string | null = null
  let tokenAte = 0

  async function cfg(): Promise<ConfigEfrete> {
    if (!config) {
      const c = await deps.carregarConfig()
      if (!c.baseUrl || !c.usuario || !c.senha || !c.integrador) throw Object.assign(new Error('Configuração da efrete incompleta no Vault.'), { codigo: 'CONFIG' })
      config = c
    }
    return config
  }

  async function http(servico: string, metodo: string, verbo: Verbo, corpo: Record<string, unknown>): Promise<Resultado<Record<string, unknown>>> {
    const c = await cfg()
    const { url, init } = montarRequisicao(c.baseUrl, servico, metodo, verbo, corpo)
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const r = await f(url, { ...init, signal: ctrl.signal })
      const texto = await r.text()
      return interpretarResposta(r.status, texto)
    } catch (e) {
      const abortado = (e as { name?: string })?.name === 'AbortError'
      return { ok: false, erro: { codigo: abortado ? 'TIMEOUT' : 'REDE', mensagem: abortado ? `Sem resposta em ${timeoutMs / 1000}s` : String((e as Error)?.message ?? e) } }
    } finally {
      clearTimeout(t)
    }
  }

  async function login(opcoes: { usuario?: string; forcar?: boolean } = {}): Promise<Resultado<{ tokenPrefixo: string }>> {
    if (!opcoes.forcar && !opcoes.usuario && token && agora() < tokenAte) return { ok: true, dados: { tokenPrefixo: prefixoToken(token) } }
    const c = await cfg()
    const r = await http('Logon', 'Login', deps.verboLogin ?? 'GET', { Usuario: opcoes.usuario ?? c.usuario, Senha: c.senha, Integrador: c.integrador, Versao: VERSAO })
    if (!r.ok) return r
    const tk = (r.dados.Token ?? r.dados.token) as string | null | undefined
    if (!tk) {
      token = null
      return { ok: false, erro: { codigo: 'LOGIN_NULO', mensagem: 'A efrete devolveu Token nulo (usuário não encontrado ou bloqueado; o login não diz o motivo).' } }
    }
    token = tk
    tokenAte = agora() + validade
    log(`[efrete] login ok, token ${prefixoToken(tk)}`)
    return { ok: true, dados: { tokenPrefixo: prefixoToken(tk) } }
  }

  async function logout(): Promise<Resultado<null>> {
    if (!token) return { ok: true, dados: null }
    const c = await cfg()
    const r = await http('Logon', 'Logout', deps.verboLogout ?? 'POST', { Integrador: c.integrador, Versao: VERSAO, Token: token })
    token = null
    tokenAte = 0
    return r.ok ? { ok: true, dados: null } : r
  }

  async function chamar<T = Record<string, unknown>>(servico: string, metodo: string, verbo: Verbo, corpo: Record<string, unknown>): Promise<Resultado<T>> {
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const l = await login({ forcar: tentativa > 0 })
      if (!l.ok) return l
      const c = await cfg()
      const r = await http(servico, metodo, verbo, { ...corpo, Integrador: c.integrador, Versao: VERSAO, Token: token })
      if (!r.ok && tentativa === 0 && ehErroDeSessao(r.erro.mensagem)) {
        log('[efrete] sessão caiu; refazendo o login uma vez')
        token = null
        continue
      }
      return r as Resultado<T>
    }
    return { ok: false, erro: { codigo: 'SESSAO', mensagem: 'Sessão da efrete caiu de novo depois do novo login.' } }
  }

  async function consultarSituacaoTransportador(q: ConsultaSituacao): Promise<Resultado<SituacaoTransportador>> {
    const r = await chamar('Pef', 'ConsultaSituacaoTransportador', deps.verboConsulta ?? 'GET', {
      InteressadoCpfOuCnpj: soDigitos(q.interessadoCpfCnpj),
      TransportadorCpfOuCnpj: soDigitos(q.transportadorCpfCnpj),
      TransportadorRNTRC: soDigitos(q.rntrc),
      ...(q.dataPrevistaFimViagem ? { DataPrevistaFimViagem: q.dataPrevistaFimViagem } : {}),
      Veiculos: q.placas.map((p) => ({ Placa: p.toUpperCase().replace(/[^A-Z0-9]/g, '') })),
    })
    if (!r.ok) return r
    return { ok: true, dados: lerSituacao(r.dados) }
  }

  return { login, logout, chamar, consultarSituacaoTransportador, tokenPrefixo: () => prefixoToken(token) }
}

const bool = (v: unknown) => (typeof v === 'boolean' ? v : v === 'true' ? true : v === 'false' ? false : null)

export function lerSituacao(d: Record<string, unknown>): SituacaoTransportador {
  const vs = (Array.isArray(d.Veiculos) ? d.Veiculos : []) as Record<string, unknown>[]
  const bruto = { ...d }
  delete bruto.Token
  return {
    rntrcAtivo: bool(d.RNTRCAtivo),
    tacOuEquiparado: bool(d.TACouEquiparado),
    rntrcAtivoAteFimViagem: bool(d.RNTRCAtivoDataPrevistaFimViagem),
    veiculos: vs.map((v) => ({ placa: String(v.Placa ?? ''), fazParteDaFrota: bool(v.FazParteDaFrota) })),
    bruto,
  }
}

// Leitura da configuração no servidor: 4 segredos pelo efrete_segredo (só service_role).
export async function carregarConfigDoVault(rpc: (nome: string) => Promise<string | null>): Promise<ConfigEfrete> {
  const [baseUrl, usuario, senha, integrador] = await Promise.all(['EFRETE_BASE_URL', 'EFRETE_USUARIO', 'EFRETE_SENHA', 'EFRETE_HASH_INTEGRADOR'].map(rpc))
  return { baseUrl: (baseUrl ?? '').trim(), usuario: usuario ?? '', senha: senha ?? '', integrador: (integrador ?? '').trim() }
}
