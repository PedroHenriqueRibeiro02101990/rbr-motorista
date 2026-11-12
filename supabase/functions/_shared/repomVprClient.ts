// Repom VPR (API Vale-Pedágio v2.0, cliente 9501): ADAPTADOR ÚNICO, no mesmo padrão do efreteClient e do nspedagioClient.
// Cobre as DUAS APIs do manual: roteirização (token OAuth2, rota, consulta de rota, valor do pedágio) e vale-pedágio (token usuario/senha,
// TAG, emitir, cancelar, consultar). Especificação: docs/repom/ESPECIFICACAO-VPR.md.
// Sem dependências do Deno e SEM gravar em banco (testes em repomVprClient.test.ts, tudo com mock; nenhuma chamada real à Repom).
// Segredos entram por `config`, nunca são logados nem devolvidos. Os dois tokens são cacheados em memória e renovados antes de vencer;
// em 401 renova UMA vez e repete UMA vez. EMISSÃO NUNCA É REPETIDA DEPOIS DE TIMEOUT/5xx: o resultado vem com `incerto: true` e quem chama
// (repomOperacao.ts) confere antes de qualquer reenvio. Padrão de ambiente: qa.
import {
  lerErroRepom,
  lerPedagio,
  lerRota,
  mensagemErroHttp,
  montarCorpoPedagio,
  montarCorpoRota,
  urlsRepom,
  validarPedidoRota,
  type AmbienteRepom,
  type Fetch,
  type PedagioRepom,
  type PedidoPedagioRepom,
  type PedidoRotaRepom,
  type RotaRepom,
  type UrlsRepom,
} from './repomClient.ts'

export type ResultadoVpr<T> =
  | { ok: true; http: number; dados: T; bruto: unknown }
  | { ok: false; http: number; erro: string; numeroErro?: string | null; incerto?: boolean; bruto: unknown }

export interface ConfigRepomVpr {
  ambiente: AmbienteRepom
  roteirizacaoLogin: string // client_id
  roteirizacaoSenha: string // client_secret
  valePedagioLogin: string // usuario (credencial DIFERENTE da roteirização)
  valePedagioSenha: string
  limiteMs?: number // timeout de cada chamada (padrão 30 s)
  urls?: Partial<UrlsRepom> // sobrescrita (testes)
  verboConsultaVale?: 'GET' | 'POST' // o manual diz POST mas o curl não tem corpo (D-V02); padrão GET
}

export interface PedidoVale {
  processoCodigoCliente: string // até 20; chave de idempotência
  placa: string // tração, 7
  numeroEixos: number // tração
  carretaPlaca?: string
  carretaNumeroEixos?: number // com mais de uma carreta, a soma
  nomeTransportador: string // até 100
  documentoTransportador: string // CPF 11 ou CNPJ 14
  documentoSubcontratado?: string
  nomeMotorista: string // até 50
  documentoMotorista: string // CPF 11
  cnpjFilial: string // 14
  usuarioEmissao: string // até 50
  roteiro?: { roteiroCodigo: number; percursoCodigo: number } // não usamos praças próprias
  documentos?: { codigo: string; serie?: string }[] // CT-e, NF-e, OCC
  eixosSuspensosIda?: number
  eixosSuspensosVolta?: number
}

export interface PracaVale {
  id: number | null
  nomeConcessionaria: string | null
  nomePraca: string | null
  nomeRodovia: string | null
  ativa: boolean
  precos: { preco: number; quantidadeEixos: number }[]
}
export interface ValeRepom {
  codigoViagem: string
  codigoViagemRepom: string | null
  idvpo: string | null // idvpoAntt[0]
  valor: number | null
  tag: string | null
  tipoEmissao: string | null
  statusCarga: 'pendente' | 'carregado' | 'cancelado' | 'desconhecido'
  viagemAtiva: boolean
  pracas: PracaVale[]
}
export interface TagRepom {
  nomeTag: string
  numeroTag: string | null
  codigoStatusTag: number | null
  statusTag: string | null
  apto: boolean
  observacao: string | null
}
export interface RotaConsultada {
  codigoRoteiro: string
  codigoPercurso: string
  idaVolta: boolean
  descricao: string | null
  origem: string | null
  destino: string | null
}

// ---------- regras puras ----------

const soDigitos = (v: unknown) => String(v ?? '').replace(/\D/g, '')
export const normalizarPlaca = (p: unknown) => String(p ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()

/** Valida o pedido de emissão com os tamanhos do manual (4.3). Devolve a mensagem do primeiro problema, ou null. */
export function validarPedidoVale(p: PedidoVale): string | null {
  if (!p.processoCodigoCliente || p.processoCodigoCliente.length > 20) return 'Código do processo inválido (até 20 caracteres).'
  if (normalizarPlaca(p.placa).length !== 7) return 'Placa da tração inválida (7 caracteres).'
  if (!Number.isInteger(p.numeroEixos) || p.numeroEixos < 1 || p.numeroEixos > 15) return 'Eixos da tração inválidos.'
  if (p.carretaPlaca) {
    if (normalizarPlaca(p.carretaPlaca).length !== 7) return 'Placa da carreta inválida (7 caracteres).'
    if (!Number.isInteger(p.carretaNumeroEixos) || (p.carretaNumeroEixos as number) < 1 || (p.carretaNumeroEixos as number) > 15) return 'Informe os eixos da carreta (a soma, se houver mais de uma).'
  }
  if (!p.nomeTransportador.trim() || p.nomeTransportador.length > 100) return 'Nome do transportador inválido (até 100 caracteres).'
  if (![11, 14].includes(soDigitos(p.documentoTransportador).length)) return 'Documento do transportador inválido (CPF ou CNPJ).'
  if (p.documentoSubcontratado && ![11, 14].includes(soDigitos(p.documentoSubcontratado).length)) return 'Documento do subcontratado inválido.'
  if (!p.nomeMotorista.trim() || p.nomeMotorista.length > 50) return 'Nome do motorista inválido (até 50 caracteres).'
  if (soDigitos(p.documentoMotorista).length !== 11) return 'CPF do motorista inválido.'
  if (soDigitos(p.cnpjFilial).length !== 14) return 'CNPJ da filial inválido.'
  if (!p.usuarioEmissao.trim() || p.usuarioEmissao.length > 50) return 'Usuário de emissão inválido (até 50 caracteres).'
  if (!p.roteiro) return 'Informe o roteiro cadastrado na Repom (a RBR não usa praças próprias).'
  return null
}

/** Corpo do POST /api/RepomViagem/ValePedagio (4.3). Praças próprias NÃO são enviadas. */
export function montarCorpoVale(p: PedidoVale) {
  const comCarreta = Boolean(p.carretaPlaca)
  return {
    ProcessoCodigoCliente: p.processoCodigoCliente,
    Placa: normalizarPlaca(p.placa),
    NumeroEixos: p.numeroEixos,
    ...(comCarreta ? { CarretaPlaca: normalizarPlaca(p.carretaPlaca), CarretaNumeroEixos: p.carretaNumeroEixos } : {}),
    NomeTransportador: p.nomeTransportador.trim(),
    DocumentoTransportador: soDigitos(p.documentoTransportador),
    ...(p.documentoSubcontratado ? { DocumentoSubcontratado: soDigitos(p.documentoSubcontratado) } : {}),
    NomeMotorista: p.nomeMotorista.trim(),
    DocumentoMotorista: soDigitos(p.documentoMotorista),
    CnpjFilial: soDigitos(p.cnpjFilial),
    UsuarioEmissao: p.usuarioEmissao.trim(),
    ...(p.roteiro ? { Roteiro: { RoteiroCodigo: p.roteiro.roteiroCodigo, PercursoCodigo: p.roteiro.percursoCodigo } } : {}),
    ...(p.documentos?.length ? { documento: p.documentos.map((d) => ({ documentoCodigo: d.codigo, ...(d.serie ? { serie: d.serie } : {}) })) } : {}),
    Configuracao: { EixosSuspensosIda: p.eixosSuspensosIda ?? 0, EixosSuspensosVolta: p.eixosSuspensosVolta ?? 0 },
    ...(comCarreta ? { UtilizaCarreta: true } : {}),
  }
}

const num = (v: unknown): number | null => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v))
const txt = (v: unknown): string | null => (v == null || v === '' ? null : String(v))
const statusCargaDe = (v: unknown): ValeRepom['statusCarga'] => {
  const s = String(v ?? '').trim().toLowerCase()
  if (s === '1' || s === 'pendente') return 'pendente'
  if (s === '2' || s === 'carregado') return 'carregado'
  if (s === '3' || s === 'cancelado') return 'cancelado'
  return 'desconhecido'
}

/** Lê a resposta de sucesso da emissão/consulta. Devolve null se não houver result.status true e codigoViagem. */
export function lerVale(bruto: unknown): ValeRepom | null {
  const o = bruto as Record<string, unknown> | null
  if (!o || typeof o !== 'object') return null
  if ((o.result as Record<string, unknown> | undefined)?.status !== true) return null
  const cod = num(o.codigoViagem)
  if (cod == null || cod <= 0) return null
  const idvpoAntt = Array.isArray(o.idvpoAntt) ? o.idvpoAntt : []
  const pracas = (Array.isArray(o.pracas) ? o.pracas : []).map((x) => {
    const pr = x as Record<string, unknown>
    return {
      id: num(pr.id),
      nomeConcessionaria: txt(pr.nomeConcessionaria),
      nomePraca: txt(pr.nomePraca),
      nomeRodovia: txt(pr.nomeRodovia),
      ativa: pr.ativa === 1 || pr.ativa === true,
      precos: (Array.isArray(pr.pracaPreco) ? pr.pracaPreco : []).map((c) => ({ preco: Number((c as Record<string, unknown>).preco ?? 0), quantidadeEixos: Number((c as Record<string, unknown>).quantidadeEixos ?? 0) })),
    }
  })
  return {
    codigoViagem: String(cod),
    codigoViagemRepom: txt(o.codigoViagemRepom),
    idvpo: idvpoAntt.length ? String(idvpoAntt[0]) : null,
    valor: num(o.valor),
    tag: txt(o.tag),
    tipoEmissao: txt(o.tipoEmissao),
    statusCarga: statusCargaDe(o.statusCarga),
    viagemAtiva: o.viagemAtiva === true,
    pracas,
  }
}

export function lerTags(bruto: unknown): TagRepom[] | null {
  if (!Array.isArray(bruto)) return null
  return bruto.map((x) => {
    const t = x as Record<string, unknown>
    return { nomeTag: String(t.nomeTag ?? ''), numeroTag: txt(t.numeroTag), codigoStatusTag: num(t.codigoStatusTag), statusTag: txt(t.statusTag), apto: String(t.apto ?? '').trim().toLowerCase() === 'sim', observacao: txt(t.observacao) }
  })
}
/** A placa serve para o vale se ao menos uma administradora a tem ativa e apta. */
export const placaApta = (tags: TagRepom[]) => tags.some((t) => t.apto && t.codigoStatusTag === 1)

export function lerRotaConsultada(bruto: unknown): RotaConsultada | null {
  const r = (bruto as Record<string, unknown> | null)?.roteiro as Record<string, unknown> | undefined
  if (!r || typeof r !== 'object' || r.roteiroCodigo == null || r.percursoCodigo == null) return null
  return { codigoRoteiro: String(r.roteiroCodigo), codigoPercurso: String(r.percursoCodigo), idaVolta: Number(r.sentido) === 1, descricao: txt(r.percursoDescricao), origem: r.cidadeOrigem ? `${r.cidadeOrigem}/${r.estadoOrigem ?? ''}` : null, destino: r.cidadeDestino ? `${r.cidadeDestino}/${r.estadoDestino ?? ''}` : null }
}

const MENSAGENS_ERRO: Record<string, string> = {
  '347': 'A Repom recusou a placa informada.',
  '325': 'Esse vale-pedágio já está cancelado.',
  '205': 'A Repom não encontrou esse vale-pedágio.',
}
const msgDe = (e: { mensagem: string; numeroErro: string | null }) => (e.numeroErro && MENSAGENS_ERRO[e.numeroErro]) || e.mensagem

/** "AAAA-MM-DD HH:mm:ss" ou ISO -> milissegundos (mesmo fuso nas duas pontas; serve para calcular duração). */
const ms = (v: unknown) => new Date(String(v ?? '').replace(' ', 'T')).getTime()

// ---------- cliente ----------

export interface ClienteRepomVpr {
  readonly ambiente: AmbienteRepom
  criarRota(p: PedidoRotaRepom): Promise<ResultadoVpr<RotaRepom>>
  consultarRota(codigoRoteiroCliente: string): Promise<ResultadoVpr<RotaConsultada | null>>
  consultarPedagio(p: PedidoPedagioRepom): Promise<ResultadoVpr<PedagioRepom>>
  consultarTag(placa: string): Promise<ResultadoVpr<TagRepom[]>>
  emitirVale(p: PedidoVale): Promise<ResultadoVpr<ValeRepom>>
  cancelarVale(codigoViagem: string | number, usuario: string): Promise<ResultadoVpr<{ cancelado: true }>>
  consultarVale(codigoViagem: string | number): Promise<ResultadoVpr<ValeRepom>>
  /** UMA chamada de token da API pedida (não consulta nada). Só para o diagnóstico do repom-status. */
  verificarToken(api: 'roteirizacao' | 'vale'): Promise<boolean>
}

export function criarRepomVprClient(config: ConfigRepomVpr, fetchFn: Fetch = (u, i) => fetch(u, i) as never): ClienteRepomVpr {
  const urls = { ...urlsRepom(config.ambiente), ...(config.urls ?? {}) }
  const urlVale = urls.tokenValePedagio.replace(/\/api\/Token$/i, '')
  const limite = config.limiteMs ?? 30_000
  type Tok = { valor: string; expira: number } | null
  let tokRot: Tok = null
  let tokVale: Tok = null

  async function http(url: string, init: { method: string; headers: Record<string, string>; body?: string }) {
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), limite)
    try {
      return await fetchFn(url, { ...init, signal: ctl.signal })
    } catch (e) {
      throw new Error((e as Error)?.name === 'AbortError' ? 'TIMEOUT' : 'REDE')
    } finally {
      clearTimeout(t)
    }
  }
  const semCredRot = () => !config.roteirizacaoLogin || !config.roteirizacaoSenha
  const semCredVale = () => !config.valePedagioLogin || !config.valePedagioSenha

  async function tokenRoteirizacao(forcar = false): Promise<string> {
    if (!forcar && tokRot && tokRot.expira > Date.now() + 60_000) return tokRot.valor
    const corpo = new URLSearchParams({ grant_type: 'client_credentials', client_id: config.roteirizacaoLogin, client_secret: config.roteirizacaoSenha }).toString()
    const r = await http(urls.tokenRoteirizacao, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: corpo })
    const j = (await r.json().catch(() => null)) as { access_token?: string; expires_in?: number } | null
    if (!r.ok || !j?.access_token) throw new Error('TOKEN:' + r.status)
    // renova antes de vencer (manual: aos 55 min de 60); `expira` já desconta os 5 minutos
    tokRot = { valor: j.access_token, expira: Date.now() + ((Number(j.expires_in) || 3600) - 300) * 1000 }
    return tokRot.valor
  }
  async function tokenVale(forcar = false): Promise<string> {
    if (!forcar && tokVale && tokVale.expira > Date.now() + 60_000) return tokVale.valor
    const r = await http(urls.tokenValePedagio, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ usuario: config.valePedagioLogin, senha: config.valePedagioSenha }) })
    const j = (await r.json().catch(() => null)) as { authenticated?: boolean; created?: string; expiration?: string; accessToken?: string } | null
    if (!r.ok || !j?.accessToken || j.authenticated === false) throw new Error('TOKEN:' + r.status)
    const dur = ms(j.expiration) - ms(j.created)
    const ttl = Number.isFinite(dur) && dur > 0 ? dur : 12 * 3_600_000
    tokVale = { valor: j.accessToken, expira: Date.now() + ttl - 10 * 60_000 } // manual: renovar ~10 min antes
    return tokVale.valor
  }

  type Resp = { status: number; bruto: unknown }
  /** Uma chamada autenticada; em 401 renova o token UMA vez e repete UMA vez. Lança 'TIMEOUT' | 'REDE' | 'TOKEN:<http>'. */
  async function chamar(api: 'rot' | 'vale', metodo: string, url: string, corpo?: unknown): Promise<Resp> {
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const tk = api === 'rot' ? await tokenRoteirizacao(tentativa > 0) : await tokenVale(tentativa > 0)
      const headers: Record<string, string> = { authorization: `Bearer ${tk}`, accept: 'application/json' }
      if (corpo !== undefined) headers['content-type'] = 'application/json'
      const r = await http(url, { method: metodo, headers, body: corpo === undefined ? undefined : JSON.stringify(corpo) })
      if (r.status === 401 && tentativa === 0) continue
      return { status: r.status, bruto: await r.json().catch(() => null) }
    }
    throw new Error('TOKEN:401')
  }

  const falha = (e: unknown, emissao = false): { ok: false; http: number; erro: string; incerto?: boolean; bruto: null } => {
    const m = (e as Error)?.message ?? ''
    if (m === 'TIMEOUT') return { ok: false, http: 0, erro: emissao ? 'A Repom demorou para responder. Confira no portal da Repom antes de tentar de novo.' : 'A Repom demorou demais para responder.', incerto: emissao || undefined, bruto: null }
    if (m.startsWith('TOKEN:')) return { ok: false, http: Number(m.slice(6)) || 0, erro: mensagemErroHttp(Number(m.slice(6)) || 401), bruto: null }
    return { ok: false, http: 0, erro: emissao ? 'Não consegui falar com a Repom. Confira no portal antes de tentar de novo.' : 'Não consegui falar com a Repom agora.', incerto: emissao || undefined, bruto: null }
  }

  /** Erro depois de uma resposta HTTP. `emissao`: 5xx (e corpo ilegível em 200) deixam o resultado INCERTO. */
  function erroDaResposta(r: Resp, emissao = false): ResultadoVpr<never> {
    const e = lerErroRepom(r.bruto)
    const incerto = emissao && (r.status >= 500 || (r.status >= 200 && r.status < 300 && !e)) ? true : undefined
    if (e) return { ok: false, http: r.status, erro: msgDe(e), numeroErro: e.numeroErro, incerto, bruto: r.bruto }
    return { ok: false, http: r.status, erro: r.status >= 200 && r.status < 300 ? 'A Repom respondeu em formato inesperado.' : mensagemErroHttp(r.status), incerto, bruto: r.bruto }
  }
  const sucesso = (r: Resp) => r.status >= 200 && r.status < 300 && lerErroRepom(r.bruto) == null

  return {
    ambiente: config.ambiente,

    async verificarToken(api) {
      if (api === 'roteirizacao') return semCredRot() ? false : tokenRoteirizacao(true).then(() => true, () => false)
      return semCredVale() ? false : tokenVale(true).then(() => true, () => false)
    },

    async criarRota(p) {
      const inval = validarPedidoRota(p)
      if (inval) return { ok: false, http: 0, erro: inval, bruto: null }
      if (semCredRot()) return { ok: false, http: 0, erro: 'Credenciais da Repom não configuradas.', bruto: null }
      try {
        const r = await chamar('rot', 'POST', `${urls.roteirizacao}/Api/Rota`, montarCorpoRota(p))
        const dados = sucesso(r) ? lerRota(r.bruto) : null
        const st = (r.bruto as Record<string, unknown> | null)?.status
        if (!dados || (st != null && Number(st) !== 1)) return erroDaResposta(r)
        return { ok: true, http: r.status, dados, bruto: r.bruto }
      } catch (e) {
        return falha(e)
      }
    },

    async consultarRota(codigoRoteiroCliente) {
      if (!codigoRoteiroCliente || codigoRoteiroCliente.length > 10) return { ok: false, http: 0, erro: 'Código do roteiro inválido (até 10 caracteres).', bruto: null }
      if (semCredRot()) return { ok: false, http: 0, erro: 'Credenciais da Repom não configuradas.', bruto: null }
      try {
        const r = await chamar('rot', 'GET', `${urls.roteirizacao}/api/rota?codigoRoteiroCliente=${encodeURIComponent(codigoRoteiroCliente)}`)
        if (r.status === 204 || r.status === 404) return { ok: true, http: r.status, dados: null, bruto: r.bruto } // rota não existe: não é erro de comunicação
        const dados = r.status === 200 ? lerRotaConsultada(r.bruto) : null
        return dados ? { ok: true, http: r.status, dados, bruto: r.bruto } : erroDaResposta(r)
      } catch (e) {
        return falha(e)
      }
    },

    async consultarPedagio(p) {
      if (semCredRot()) return { ok: false, http: 0, erro: 'Credenciais da Repom não configuradas.', bruto: null }
      try {
        const r = await chamar('rot', 'POST', `${urls.roteirizacao}/Api/Roteiro`, montarCorpoPedagio(p))
        const dados = sucesso(r) ? lerPedagio(r.bruto) : null
        return dados ? { ok: true, http: r.status, dados, bruto: r.bruto } : erroDaResposta(r)
      } catch (e) {
        return falha(e)
      }
    },

    async consultarTag(placa) {
      const pl = normalizarPlaca(placa)
      if (pl.length !== 7) return { ok: false, http: 0, erro: 'Placa inválida (7 caracteres).', bruto: null }
      if (semCredVale()) return { ok: false, http: 0, erro: 'Credenciais da Repom não configuradas.', bruto: null }
      try {
        const r = await chamar('vale', 'GET', `${urlVale}/api/RepomVeiculo/tags/placa?placa=${encodeURIComponent(pl)}`)
        const dados = r.status === 200 ? lerTags(r.bruto) : null
        return dados ? { ok: true, http: r.status, dados, bruto: r.bruto } : erroDaResposta(r)
      } catch (e) {
        return falha(e)
      }
    },

    async emitirVale(p) {
      const inval = validarPedidoVale(p)
      if (inval) return { ok: false, http: 0, erro: inval, bruto: null }
      if (semCredVale()) return { ok: false, http: 0, erro: 'Credenciais da Repom não configuradas.', bruto: null }
      try {
        // UMA tentativa de emissão (o 401 só renova o token e repete: a Repom ainda não tinha processado nada). Sem retry em timeout/5xx.
        const r = await chamar('vale', 'POST', `${urlVale}/api/RepomViagem/ValePedagio`, montarCorpoVale(p))
        const dados = sucesso(r) ? lerVale(r.bruto) : null
        return dados ? { ok: true, http: r.status, dados, bruto: r.bruto } : erroDaResposta(r, true)
      } catch (e) {
        return falha(e, true)
      }
    },

    async cancelarVale(codigoViagem, usuario) {
      const cod = Number(codigoViagem)
      if (!Number.isInteger(cod) || cod <= 0) return { ok: false, http: 0, erro: 'Código da viagem inválido.', bruto: null }
      if (!usuario.trim() || usuario.length > 50) return { ok: false, http: 0, erro: 'Usuário de cancelamento inválido (até 50 caracteres).', bruto: null }
      if (semCredVale()) return { ok: false, http: 0, erro: 'Credenciais da Repom não configuradas.', bruto: null }
      try {
        const r = await chamar('vale', 'POST', `${urlVale}/api/RepomViagem/CancelaViagem`, { viagemCodigo: cod, usuario: usuario.trim() })
        const ok = r.status >= 200 && r.status < 300 && (r.bruto as { result?: { status?: unknown } } | null)?.result?.status === true
        return ok ? { ok: true, http: r.status, dados: { cancelado: true as const }, bruto: r.bruto } : erroDaResposta(r)
      } catch (e) {
        return falha(e)
      }
    },

    async consultarVale(codigoViagem) {
      const cod = Number(codigoViagem)
      if (!Number.isInteger(cod) || cod <= 0) return { ok: false, http: 0, erro: 'Código da viagem inválido.', bruto: null }
      if (semCredVale()) return { ok: false, http: 0, erro: 'Credenciais da Repom não configuradas.', bruto: null }
      try {
        const verbo = config.verboConsultaVale ?? 'GET'
        const r = await chamar('vale', verbo, `${urlVale}/api/RepomViagem/ID?ID=${cod}`, verbo === 'POST' ? {} : undefined)
        const dados = sucesso(r) ? lerVale(r.bruto) : null
        return dados ? { ok: true, http: r.status, dados, bruto: r.bruto } : erroDaResposta(r)
      } catch (e) {
        return falha(e)
      }
    },
  }
}
