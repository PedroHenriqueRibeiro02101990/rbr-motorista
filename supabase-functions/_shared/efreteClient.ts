// Cliente da efrete (NSTech) — CIOT e pagamento ao motorista. Passo 2: só conexão (login/logout) e consulta de situação.
//
// Tudo passa pela interface ProvedorCiot, para o resto do ERP não depender do fornecedor (mesmo espírito do repomClient).
// Regras de segurança:
// - usuário, senha, hash do integrador e URL vêm do Vault (public.efrete_segredo, só service_role); nada fica no código;
// - nunca loga usuário, senha, hash nem o token (do token, no máximo os 4 primeiros caracteres);
// - o token fica só na memória do isolate, com validade conservadora (20 min), e é refeito uma vez se o servidor disser
//   que a sessão caiu.
// - se o Vault tiver EFRETE_PROXY_URL e EFRETE_PROXY_CHAVE, TODAS as chamadas passam pelo proxy na Vercel
//   (vercel/efrete-proxy): a efrete derruba conexões vindas do Supabase. Sem os dois, fala direto (modo "direto").
//   O proxy só repassa; as credenciais da efrete continuam só aqui (Vault do Supabase).
// Sem dependências do Deno: roda nas Edge Functions e nos testes do Node (efreteClient.test.ts, com fetch simulado).

export interface ConfigEfrete {
  baseUrl: string // ex.: https://dev.efrete.com.br  (sem /services)
  usuario: string
  senha: string
  integrador: string
  proxyUrl?: string | null // https://…/api/efrete (proxy na Vercel)
  proxyChave?: string | null // segredo compartilhado (cabeçalho x-rbr-proxy-key)
}

export type ModoConexao = 'proxy' | 'direto'
export const modoConexao = (c: Pick<ConfigEfrete, 'proxyUrl' | 'proxyChave'>): ModoConexao => (c.proxyUrl && c.proxyChave ? 'proxy' : 'direto')

export interface ErroEfrete {
  codigo: string // código da efrete (Excecao.Codigo) ou nosso: HTTP_<n>, TIMEOUT, REDE, LOGIN_NULO, RESPOSTA_INVALIDA, CONFIG,
  //                PROXY_RECUSOU (chave/endereço), PROXY_PEDIDO (caminho/formato), EFRETE_CONEXAO, EFRETE_TIMEOUT
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

export interface CiotEmitido {
  ciot: string
  protocolo: string | null
}

export interface CiotPorReferencia {
  ciot: string
  estado: string | null // EmViagem | Encerrado | Cancelado
  protocolo: string | null
}

// Interface única do ERP para o provedor de CIOT/pagamento.
export interface ProvedorCiot {
  login(opcoes?: { usuario?: string; forcar?: boolean }): Promise<Resultado<{ tokenPrefixo: string }>>
  logout(): Promise<Resultado<null>>
  chamar<T = Record<string, unknown>>(servico: string, metodo: string, verbo: Verbo, corpo: Record<string, unknown>): Promise<Resultado<T>>
  consultarSituacaoTransportador(c: ConsultaSituacao): Promise<Resultado<SituacaoTransportador>>
  // Passo 3 (CIOT). O corpo da emissão é montado por _shared/ciotEfrete.ts (montarCorpoOperacaoPadrao).
  consultarTiposCarga(): Promise<Resultado<{ codigo: number; descricao: string }[]>>
  gravarCadastro(tipo: 'proprietarios' | 'veiculos' | 'motoristas', corpo: Record<string, unknown>): Promise<Resultado<Record<string, unknown>>>
  emitirOperacaoTransporte(corpo: Record<string, unknown>): Promise<Resultado<CiotEmitido>>
  // ok com null = a efrete diz que não existe operação com essa referência (pode emitir).
  obterCiotPorReferencia(matrizCnpj: string, idOperacaoCliente: string): Promise<Resultado<CiotPorReferencia | null>>
  obterPdfOperacao(ciot: string): Promise<Resultado<{ pdfBase64: string }>>
  obterTransacoes(ciots: string[], dataInicial: string): Promise<Resultado<Record<string, unknown>[]>>
  cancelarOperacaoTransporte(ciot: string, motivo: string): Promise<Resultado<{ protocolo: string | null; data: string | null }>>
}

// "Não encontrado" na consulta por referência (texto da efrete varia; sem certeza, NÃO é tratado como inexistente).
export function ehNaoEncontrado(mensagem: string | null | undefined): boolean {
  return /n[aã]o\s+(foi\s+)?encontrad|inexistente|n[aã]o\s+existe|nenhuma\s+opera[cç][aã]o/i.test(mensagem ?? '')
}

export interface DepsEfrete {
  carregarConfig: () => Promise<ConfigEfrete>
  fetch?: typeof fetch
  agora?: () => number
  timeoutMs?: number
  validadeTokenMs?: number
  log?: (msg: string) => void
  // Verbo do login e do logout. O manual diz GET no login, mas o servidor real só aceita POST com JSON (24/10).
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

export const caminhoServico = (servico: string, metodo: string) => `/services/${servico}/${metodo}`

// Pedido ao proxy: o proxy monta a URL no host fixo dele (EFRETE_BASE_URL da Vercel) e repassa.
export function montarPedidoProxy(c: ConfigEfrete, servico: string, metodo: string, verbo: Verbo, corpo: Record<string, unknown>) {
  return {
    url: String(c.proxyUrl),
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-rbr-proxy-key': String(c.proxyChave) },
      body: JSON.stringify({ metodoHttp: verbo, caminho: caminhoServico(servico, metodo), corpo }),
    } as RequestInit,
  }
}

// Resposta do proxy -> mesma interpretação de uma resposta direta da efrete.
export function interpretarRespostaProxy(http: number, texto: string): Resultado<Record<string, unknown>> {
  let j: { status?: number; corpo?: string; erro?: string; codigo?: string } | null = null
  try {
    j = texto ? JSON.parse(texto) : null
  } catch {
    j = null
  }
  if (http === 200 && j && typeof j.status === 'number') return interpretarResposta(j.status, String(j.corpo ?? ''))
  if (http === 404) return { ok: false, erro: { codigo: 'PROXY_RECUSOU', mensagem: 'O proxy recusou o pedido (chave ou endereço do proxy errado).', http } }
  if (http === 400 || http === 405 || http === 413) return { ok: false, erro: { codigo: 'PROXY_PEDIDO', mensagem: `O proxy recusou o formato do pedido: ${j?.erro ?? `HTTP ${http}`}`, http } }
  if (http === 502 || http === 504) {
    const codigo = j?.codigo === 'EFRETE_TIMEOUT' || http === 504 ? 'EFRETE_TIMEOUT' : 'EFRETE_CONEXAO'
    return { ok: false, erro: { codigo, mensagem: j?.erro ?? 'A efrete não respondeu ao proxy.', http } }
  }
  return { ok: false, erro: { codigo: `PROXY_HTTP_${http}`, mensagem: (j?.erro ?? texto ?? '').slice(0, 200) || `HTTP ${http}`, http } }
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

// Apaga credenciais e token de qualquer texto que volte do servidor (uma página de erro pode ecoar a URL do login).
export function limparSegredos(texto: string, valores: (string | null | undefined)[]): string {
  let t = texto
  for (const v of valores) {
    if (!v || v.length < 4) continue
    t = t.split(v).join('[oculto]')
    const codificado = encodeURIComponent(v)
    if (codificado !== v) t = t.split(codificado).join('[oculto]')
    const comMais = codificado.replace(/%20/g, '+')
    if (comMais !== codificado) t = t.split(comMais).join('[oculto]')
  }
  return t
}

// Variantes do campo Usuario para o teste de login (o manual pede CPF; a NSTech mandou "usuario@empresa" com espaço).
export function varianteUsuario(usuario: string, variante: 'original' | 'sem_espaco' | 'cnpj', cnpj?: string): string {
  if (variante === 'sem_espaco') return usuario.replace(/\s+/g, '')
  if (variante === 'cnpj') return soDigitos(cnpj ?? '')
  return usuario
}

export function criarClienteEfrete(deps: DepsEfrete): ProvedorCiot & { tokenPrefixo(): string; modo(): Promise<ModoConexao> } {
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
    const viaProxy = modoConexao(c) === 'proxy'
    const { url, init } = viaProxy ? montarPedidoProxy(c, servico, metodo, verbo, corpo) : montarRequisicao(c.baseUrl, servico, metodo, verbo, corpo)
    const segredos = [c.usuario, c.senha, c.integrador, c.proxyChave, token, String(corpo.Usuario ?? '')]
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const r = await f(url, { ...init, signal: ctrl.signal })
      const texto = await r.text()
      const res = viaProxy ? interpretarRespostaProxy(r.status, texto) : interpretarResposta(r.status, texto)
      if (!res.ok) res.erro.mensagem = limparSegredos(res.erro.mensagem, segredos)
      return res
    } catch (e) {
      const abortado = (e as { name?: string })?.name === 'AbortError'
      // O erro de rede do Deno traz a URL inteira (no GET do login, com a senha): passa pela mesma limpeza.
      const msg = abortado ? `Sem resposta em ${timeoutMs / 1000}s` : limparSegredos(String((e as Error)?.message ?? e), segredos)
      return { ok: false, erro: { codigo: abortado ? 'TIMEOUT' : 'REDE', mensagem: msg } }
    } finally {
      clearTimeout(t)
    }
  }

  async function login(opcoes: { usuario?: string; forcar?: boolean } = {}): Promise<Resultado<{ tokenPrefixo: string }>> {
    if (!opcoes.forcar && !opcoes.usuario && token && agora() < tokenAte) return { ok: true, dados: { tokenPrefixo: prefixoToken(token) } }
    const c = await cfg()
    const r = await http('Logon', 'Login', deps.verboLogin ?? 'POST', { Usuario: opcoes.usuario ?? c.usuario, Senha: c.senha, Integrador: c.integrador, Versao: VERSAO })
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
      // Versao vem do corpo quando o método pede outra (emissão = 8, motorista = 2, proprietário = 4); padrão 1.
      const r = await http(servico, metodo, verbo, { Versao: VERSAO, ...corpo, Integrador: c.integrador, Token: token })
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

  // ---- Passo 3: CIOT. Todos os métodos vão por POST com JSON (o servidor real recusa GET, ao contrário da lista de URLs).
  async function consultarTiposCarga(): Promise<Resultado<{ codigo: number; descricao: string }[]>> {
    const r = await chamar('Pef', 'ConsultarTipoCarga', 'POST', {})
    if (!r.ok) return r
    const bruto = r.dados.TipoCargas as unknown
    const lista = (Array.isArray(bruto) ? bruto : ((bruto as { TipoCarga?: unknown })?.TipoCarga ?? [])) as Record<string, unknown>[]
    return { ok: true, dados: (Array.isArray(lista) ? lista : []).map((x) => ({ codigo: Number(x.CodigoTipoCarga), descricao: String(x.DescricaoTipoCarga ?? '') })) }
  }

  async function gravarCadastro(tipo: 'proprietarios' | 'veiculos' | 'motoristas', corpo: Record<string, unknown>) {
    return await chamar(tipo, tipo === 'proprietarios' ? 'gravarV2' : 'gravar', 'POST', corpo)
  }

  async function emitirOperacaoTransporte(corpo: Record<string, unknown>): Promise<Resultado<CiotEmitido>> {
    const r = await chamar('Pef', 'AdicionarOperacaoTransporteV2', 'POST', corpo)
    if (!r.ok) return r
    const ciot = String(r.dados.CodigoIdentificacaoOperacao ?? '')
    if (!ciot) return { ok: false, erro: { codigo: 'SEM_CIOT', mensagem: 'A efrete respondeu sucesso sem CodigoIdentificacaoOperacao.' } }
    return { ok: true, dados: { ciot, protocolo: r.dados.ProtocoloServico != null ? String(r.dados.ProtocoloServico) : null } }
  }

  async function obterCiotPorReferencia(matrizCnpj: string, idOperacaoCliente: string): Promise<Resultado<CiotPorReferencia | null>> {
    const r = await chamar('Pef', 'ObterCodigoIdentificacaoOperacaoTransportePorIdOperacaoCliente', 'POST', {
      MatrizCNPJ: soDigitos(matrizCnpj),
      IdOperacaoCliente: idOperacaoCliente,
    })
    if (!r.ok) return ehNaoEncontrado(r.erro.mensagem) ? { ok: true, dados: null } : r
    const ciot = String(r.dados.CodigoIdentificacaoOperacao ?? '')
    if (!ciot) return { ok: true, dados: null }
    return {
      ok: true,
      dados: { ciot, estado: r.dados.EstadoCiot != null ? String(r.dados.EstadoCiot) : null, protocolo: r.dados.ProtocoloServico != null ? String(r.dados.ProtocoloServico) : null },
    }
  }

  async function obterPdfOperacao(ciot: string): Promise<Resultado<{ pdfBase64: string }>> {
    const r = await chamar('Pef', 'ObterOperacaoTransportePdf', 'POST', { CodigoIdentificacaoOperacao: ciot })
    if (!r.ok) return r
    return { ok: true, dados: { pdfBase64: String(r.dados.Pdf ?? '') } }
  }

  async function obterTransacoes(ciots: string[], dataInicial: string): Promise<Resultado<Record<string, unknown>[]>> {
    const r = await chamar('Pef', 'ObterTransacoes', 'POST', { DataInicial: dataInicial, CIOTs: ciots })
    if (!r.ok) return r
    const t = r.dados.Transacoes as unknown
    return { ok: true, dados: (Array.isArray(t) ? t : []) as Record<string, unknown>[] }
  }

  async function cancelarOperacaoTransporte(ciot: string, motivo: string): Promise<Resultado<{ protocolo: string | null; data: string | null }>> {
    const r = await chamar('Pef', 'CancelarOperacaoTransporte', 'POST', { CodigoIdentificacaoOperacao: ciot, Motivo: motivo })
    if (!r.ok) return r
    return { ok: true, dados: { protocolo: r.dados.Protocolo != null ? String(r.dados.Protocolo) : null, data: r.dados.Data != null ? String(r.dados.Data) : null } }
  }

  async function modo(): Promise<ModoConexao> {
    return modoConexao(await cfg())
  }

  return {
    login,
    logout,
    chamar,
    consultarSituacaoTransportador,
    consultarTiposCarga,
    gravarCadastro,
    emitirOperacaoTransporte,
    obterCiotPorReferencia,
    obterPdfOperacao,
    obterTransacoes,
    cancelarOperacaoTransporte,
    tokenPrefixo: () => prefixoToken(token),
    modo,
  }
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

// Leitura da configuração no servidor: segredos pelo efrete_segredo (só service_role). Proxy é opcional.
export async function carregarConfigDoVault(rpc: (nome: string) => Promise<string | null>): Promise<ConfigEfrete> {
  const [baseUrl, usuario, senha, integrador, proxyUrl, proxyChave] = await Promise.all(
    ['EFRETE_BASE_URL', 'EFRETE_USUARIO', 'EFRETE_SENHA', 'EFRETE_HASH_INTEGRADOR', 'EFRETE_PROXY_URL', 'EFRETE_PROXY_CHAVE'].map(rpc),
  )
  return {
    baseUrl: (baseUrl ?? '').trim(),
    usuario: usuario ?? '',
    senha: senha ?? '',
    integrador: (integrador ?? '').trim(),
    proxyUrl: (proxyUrl ?? '').trim() || null,
    proxyChave: (proxyChave ?? '').trim() || null,
  }
}
