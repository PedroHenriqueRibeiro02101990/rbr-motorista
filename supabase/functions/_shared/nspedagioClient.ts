// NSPEDAGIO (vale-pedágio, conta única): cliente da API da NSTech, sem dependências do Deno (testes em nspedagioClient.test.ts).
// Dois provedores com a mesma interface: o REAL (OAuth2 client_credentials; credenciais lidas do Vault por quem chama e
// passadas em `config`, nunca gravadas aqui) e o SIMULADO (desenvolvimento, marcado "SIMULADO, não é real", usado só
// quando a configuração real está ausente). Este arquivo não grava em banco: quem chama grava a linha em vpo_requisicoes
// ANTES de interpretar a resposta. Formatos conferidos na coleção Postman do kit e nos testes de homologação de 29/10/2026.

export type AcaoVpo = 'simular' | 'consultar-tag' | 'comprar' | 'cancelar' | 'recibo' | 'trocar-placa' | 'status'

export interface ConfigNsPedagio {
  baseUrl: string // NSPEDAGIO_BASE_URL
  authUrl: string // NSPEDAGIO_AUTH_URL
  clientId: string // NSPEDAGIO_CLIENT_ID
  clientSecret: string // NSPEDAGIO_CLIENT_SECRET
  cnpj: string // NSPEDAGIO_CNPJ (unidade que compra)
  // Compra real fica travada até alguém ligar de propósito (a homologação também gera movimento no meio de pagamento).
  compraLiberada?: boolean
  limiteMs?: number // tempo máximo de cada chamada ao NSPEDAGIO (padrão 60 s)
}

export interface PontoRota {
  codIbge?: string
  state?: string
  city?: string
  eixoSuspenso?: boolean
}

export interface PedidoSimulacao {
  pontos: PontoRota[]
}
export interface PedidoCompra {
  idDocumentoTransporte: number // operacoes.numero_vpo
  placa: string
  nEixos: number // cavalo + carreta
  inicioVigencia: string // AAAAMMDD
  fimVigencia: string // AAAAMMDD
  cnpjTransportadora: string
  cnpjCpfSubcontratado: string
  pontos: PontoRota[]
  meioPagamento?: string
}

export interface RespostaHttp {
  status: number
  corpo: unknown
}
export type ResultadoNs<T> = { ok: true; http: number; dados: T; bruto: unknown } | { ok: false; http: number; erro: string; bruto: unknown }

export interface ProvedorNsPedagio {
  readonly simulado: boolean
  readonly ambiente: 'homologacao'
  simular(p: PedidoSimulacao): Promise<ResultadoNs<ResumoSimulacao>>
  consultarTag(placa: string): Promise<ResultadoNs<MeioPagamentoVeiculo[]>>
  comprar(p: PedidoCompra): Promise<ResultadoNs<CompraVpo>>
  cancelar(idDocumentoTransporte: number, motivo: string): Promise<ResultadoNs<{ mensagem: string }>>
  recibo(idDocumentoTransporte: number): Promise<ResultadoNs<CompraVpo>>
  trocarPlaca(idDocumentoTransporte: number, novaPlaca: string, motivo: string): Promise<ResultadoNs<CompraVpo>>
}

export interface ResumoSimulacao {
  origem: string
  destino: string
  distanciaKm: number
  valorPorEixos: Record<number, number> // 2..15
}
export interface MeioPagamentoVeiculo {
  meio: string
  ativo: boolean
  tag: string | null
  eixos: number | null
  descricao: string
}
export interface CompraVpo {
  idVpoAntt: string | null
  numeroViagem: string | null
  idRecibo: string | null
  totalViagem: number | null
}

// ---------- regras e montagem de corpo (puras, testáveis) ----------

const soDigitos = (v: unknown) => String(v ?? '').replace(/\D/g, '')
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || String(v).trim() === '') return null
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export function chaveIdempotencia(operacaoId: string, placa: string, inicioVigencia: string): string {
  return `vpo:${operacaoId}:${String(placa).toUpperCase().replace(/[^A-Z0-9]/g, '')}:${soDigitos(inicioVigencia)}`
}

function dataDeAAAAMMDD(v: string): Date | null {
  const d = soDigitos(v)
  if (d.length !== 8) return null
  const dt = new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(4, 6)) - 1, Number(d.slice(6, 8))))
  return Number.isNaN(dt.getTime()) ? null : dt
}

export function validarPontos(pontos: PontoRota[]): string | null {
  if (!Array.isArray(pontos) || pontos.length < 2) return 'Informe pelo menos origem e destino da rota.'
  for (const p of pontos) {
    const porIbge = /^\d{7}$/.test(soDigitos(p.codIbge))
    const porCidade = !!String(p.city ?? '').trim() && /^[A-Za-z]{2}$/.test(String(p.state ?? '').trim())
    if (!porIbge && !porCidade) return 'Cada ponto da rota precisa do código IBGE (7 dígitos) ou de cidade e UF.'
  }
  return null
}

// Validações feitas ANTES de chamar a compra. `tagAtiva` vem de consultarTag para a placa do cavalo.
export function validarCompra(p: PedidoCompra, tagAtiva: boolean): string | null {
  if (!Number.isSafeInteger(p.idDocumentoTransporte) || p.idDocumentoTransporte <= 0) return 'Número da operação inválido para o vale-pedágio.'
  if (!/^[A-Za-z]{3}\d[A-Za-z0-9]\d{2}$/.test(String(p.placa).trim())) return 'Placa inválida.'
  if (!tagAtiva) return 'A tag do veículo não está ativa em nenhum meio de pagamento.'
  if (!(p.nEixos >= 2 && p.nEixos <= 15)) return 'Quantidade de eixos inválida (use a soma de cavalo e carreta).'
  const ini = dataDeAAAAMMDD(p.inicioVigencia)
  const fim = dataDeAAAAMMDD(p.fimVigencia)
  if (!ini || !fim) return 'Datas de vigência inválidas (use AAAAMMDD).'
  const dias = (fim.getTime() - ini.getTime()) / 86400000
  if (dias < 0) return 'O fim da vigência é anterior ao início.'
  if (dias > 15) return 'A vigência do vale-pedágio pode ter no máximo 15 dias.'
  return validarPontos(p.pontos)
}

const posicoes = (pontos: PontoRota[]) => ({
  position: pontos.map((p) =>
    /^\d{7}$/.test(soDigitos(p.codIbge))
      ? { codIbge: soDigitos(p.codIbge), eixoSuspenso: !!p.eixoSuspenso }
      : { country: 'BR', state: String(p.state).toUpperCase(), city: String(p.city).toUpperCase(), eixoSuspenso: !!p.eixoSuspenso },
  ),
})

export function corpoSimulacao(p: PedidoSimulacao) {
  return { positions: posicoes(p.pontos) }
}

export function corpoCompra(p: PedidoCompra, cnpjUnidade: string) {
  const rota = {
    idDocumentoTransporte: p.idDocumentoTransporte,
    cnpj: soDigitos(cnpjUnidade),
    cnpjTransportadora: soDigitos(p.cnpjTransportadora),
    cnpjCpfSubcontratado: soDigitos(p.cnpjCpfSubcontratado),
    placa: String(p.placa).toUpperCase(),
    neixos: String(p.nEixos),
    inicioVigencia: soDigitos(p.inicioVigencia),
    fimVigencia: soDigitos(p.fimVigencia),
    positions: posicoes(p.pontos),
  }
  return { ...(p.meioPagamento ? { meansOfPayment: p.meioPagamento } : {}), routes: [{ route: [rota] }] }
}

// ---------- interpretação das respostas (defensiva: a resposta bruta sempre vai para vpo_requisicoes) ----------

export function lerSimulacao(corpo: unknown): ResumoSimulacao | null {
  const c = corpo as Record<string, unknown> | null
  if (!c || typeof c !== 'object' || !('distancia' in c)) return null
  const valorPorEixos: Record<number, number> = {}
  for (let e = 2; e <= 15; e++) {
    const v = num(c[`valor${String(e).padStart(2, '0')}Eixos`])
    if (v !== null) valorPorEixos[e] = v
  }
  return { origem: String(c.origem ?? ''), destino: String(c.destino ?? ''), distanciaKm: num(c.distancia) ?? 0, valorPorEixos }
}

export function lerMeiosPagamento(corpo: unknown): MeioPagamentoVeiculo[] {
  if (!Array.isArray(corpo)) return []
  return corpo.map((x) => {
    const o = x as { status?: { messageKey?: string; descricao?: string }; tag?: unknown; nroEixo?: unknown; meansOfPayment?: unknown }
    return {
      meio: String(o.meansOfPayment ?? ''),
      ativo: o.status?.messageKey === 'STATUS_VEICULO_SUCESSO',
      tag: o.tag ? String(o.tag) : null,
      eixos: num(o.nroEixo),
      descricao: String(o.status?.descricao ?? ''),
    }
  })
}

// Procura recursivamente o primeiro valor de uma das chaves (a resposta da compra vem aninhada).
function achar(o: unknown, chaves: string[]): unknown {
  if (!o || typeof o !== 'object') return undefined
  const rec = o as Record<string, unknown>
  for (const k of chaves) if (rec[k] !== undefined && rec[k] !== null && rec[k] !== '') return rec[k]
  for (const v of Object.values(rec)) {
    const r = achar(v, chaves)
    if (r !== undefined) return r
  }
  return undefined
}
export function lerCompra(corpo: unknown): CompraVpo {
  const t = (v: unknown) => (v === undefined ? null : String(v))
  return {
    idVpoAntt: t(achar(corpo, ['idVpoAntt', 'idVpoANTT', 'idVPOAntt'])),
    numeroViagem: t(achar(corpo, ['numeroViagem', 'nroViagem'])),
    idRecibo: t(achar(corpo, ['idRecibo', 'recibo'])),
    totalViagem: num(achar(corpo, ['totalViagem', 'valorTotal', 'total'])),
  }
}

// ---------- provedor REAL ----------

type Fetch = (url: string, init?: RequestInit) => Promise<Response>

export function criarNsPedagioReal(config: ConfigNsPedagio, fetchFn: Fetch = (u, i) => fetch(u, i)): ProvedorNsPedagio {
  const base = config.baseUrl.replace(/\/+$/, '')
  let token: { valor: string; expira: number } | null = null

  async function obterToken(forcar = false): Promise<string> {
    if (!forcar && token && token.expira > Date.now() + 30_000) return token.valor
    const corpo = new URLSearchParams({ grant_type: 'client_credentials', scope: 'dclogg-internal', client_id: config.clientId, client_secret: config.clientSecret })
    const r = await fetchFn(config.authUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: corpo })
    const j = (await r.json().catch(() => null)) as { access_token?: string; expires_in?: number } | null
    if (!r.ok || !j?.access_token) throw new Error(`Falha ao autenticar no NSPEDAGIO (HTTP ${r.status}).`)
    token = { valor: j.access_token, expira: Date.now() + (Number(j.expires_in) || 300) * 1000 }
    return token.valor
  }

  async function chamar(metodo: string, caminho: string, corpo?: unknown): Promise<RespostaHttp> {
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const t = await obterToken(tentativa > 0)
      // Limite de tempo: sem ele a chamada pode ficar pendurada e a linha de vpo_requisicoes fica sem resposta.
      const r = await fetchFn(`${base}/${caminho}`, {
        signal: AbortSignal.timeout(config.limiteMs ?? 60_000),
        method: metodo,
        headers: { authorization: `Bearer ${t}`, accept: 'application/json', ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}) },
        body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      })
      if (r.status === 401 && tentativa === 0) continue // token vencido: renova e tenta uma vez
      const texto = await r.text()
      let json: unknown = texto
      try { json = JSON.parse(texto) } catch { /* corpo não-JSON fica como texto */ }
      return { status: r.status, corpo: json }
    }
    throw new Error('NSPEDAGIO recusou o token duas vezes.')
  }

  function resultado<T>(r: RespostaHttp, ler: (c: unknown) => T | null): ResultadoNs<T> {
    if (r.status >= 200 && r.status < 300) {
      const dados = ler(r.corpo)
      if (dados !== null) return { ok: true, http: r.status, dados, bruto: r.corpo }
      return { ok: false, http: r.status, erro: 'Resposta do NSPEDAGIO em formato inesperado.', bruto: r.corpo }
    }
    const msg = typeof r.corpo === 'string' && r.corpo ? r.corpo.slice(0, 300) : `NSPEDAGIO respondeu HTTP ${r.status}.`
    return { ok: false, http: r.status, erro: msg, bruto: r.corpo }
  }

  const travaCompra = <T>(): ResultadoNs<T> | null =>
    config.compraLiberada ? null : { ok: false, http: 0, erro: 'Compra real travada: a homologação precisa ser liberada de propósito.', bruto: null }

  return {
    simulado: false,
    ambiente: 'homologacao',
    async simular(p) {
      const erro = validarPontos(p.pontos)
      if (erro) return { ok: false, http: 0, erro, bruto: null }
      return resultado(await chamar('POST', 'valePedagio/simulacao', corpoSimulacao(p)), lerSimulacao)
    },
    async consultarTag(placa) {
      return resultado(await chamar('GET', `veiculo/meioPagamento/${encodeURIComponent(placa.toUpperCase())}/${soDigitos(config.cnpj)}`), lerMeiosPagamento)
    },
    async comprar(p) {
      const trava = travaCompra<CompraVpo>()
      if (trava) return trava
      return resultado(await chamar('POST', 'valePedagio/', corpoCompra(p, config.cnpj)), lerCompra)
    },
    async cancelar(id, motivo) {
      const trava = travaCompra<{ mensagem: string }>()
      if (trava) return trava
      void motivo // a API só recebe o número do documento; o motivo fica em vpo_requisicoes
      return resultado(await chamar('DELETE', 'valePedagio/', [String(id)]), (c) => ({ mensagem: typeof c === 'string' ? c : JSON.stringify(c).slice(0, 300) }))
    },
    async recibo(id) {
      // O NSPEDAGIO responde HTTP 200 mesmo quando não há viagem ("Recibo ... não foi localizado"): sem dados, é falha.
      const r = await chamar('POST', 'valePedagio/recibo', [id])
      const res = resultado(r, lerCompra)
      if (res.ok && !res.dados.idVpoAntt && !res.dados.numeroViagem && !res.dados.idRecibo) {
        const desc = achar(r.corpo, ['descricao'])
        return { ok: false, http: r.status, erro: typeof desc === 'string' ? desc : 'Recibo não localizado.', bruto: r.corpo }
      }
      return res
    },
    async trocarPlaca(id, novaPlaca, motivo) {
      const trava = travaCompra<CompraVpo>()
      if (trava) return trava
      const corpo = [{ idDocumentoTransporte: String(id), placa: novaPlaca.toUpperCase(), nroEixo: 0, meansOfPayment: '', numeroCartao: '', motivoAlteracao: motivo, tipoRodagem: '' }]
      return resultado(await chamar('POST', 'valePedagio/reemissao', corpo), lerCompra)
    },
  }
}

// ---------- provedor SIMULADO (desenvolvimento) ----------

export const AVISO_SIMULADO = 'SIMULADO, não é real'

export function criarNsPedagioSimulado(): ProvedorNsPedagio {
  const ok = <T>(dados: T): ResultadoNs<T> => ({ ok: true, http: 200, dados, bruto: { simulado: true, aviso: AVISO_SIMULADO } })
  const compra = (id: number): CompraVpo => ({ idVpoAntt: `SIM${String(id).padStart(12, '0')}`, numeroViagem: `SIM-${id}`, idRecibo: `SIM-REC-${id}`, totalViagem: 140.64 })
  return {
    simulado: true,
    ambiente: 'homologacao',
    async simular(p) {
      const erro = validarPontos(p.pontos)
      if (erro) return { ok: false, http: 0, erro, bruto: null }
      const valorPorEixos: Record<number, number> = {}
      for (let e = 2; e <= 15; e++) valorPorEixos[e] = Math.round(28.16 * e * 100) / 100
      return ok({ origem: `${AVISO_SIMULADO}`, destino: `${AVISO_SIMULADO}`, distanciaKm: 600, valorPorEixos })
    },
    async consultarTag() {
      return ok([{ meio: 'CONECTCAR', ativo: true, tag: 'SIMULADO', eixos: 2, descricao: AVISO_SIMULADO }])
    },
    async comprar(p) {
      return ok(compra(p.idDocumentoTransporte))
    },
    async cancelar() {
      return ok({ mensagem: `${AVISO_SIMULADO}: viagem cancelada` })
    },
    async recibo(id) {
      return ok(compra(id))
    },
    async trocarPlaca(id) {
      return ok(compra(id))
    },
  }
}

// Escolha do provedor: configuração real completa = real; qualquer campo faltando = simulado (nunca chama a rede).
export function criarNsPedagio(config: Partial<ConfigNsPedagio> | null | undefined, fetchFn?: Fetch): ProvedorNsPedagio {
  const c = config ?? {}
  const completa = !!(c.baseUrl && c.authUrl && c.clientId && c.clientSecret && c.cnpj)
  return completa ? criarNsPedagioReal(c as ConfigNsPedagio, fetchFn) : criarNsPedagioSimulado()
}
