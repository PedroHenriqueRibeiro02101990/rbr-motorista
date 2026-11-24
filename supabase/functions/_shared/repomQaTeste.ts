// Regras da função temporária repom-qa-teste (sem Deno, sem rede; testes em repomQaTeste.test.ts).
// Só QA, só o contrato 2166947 (RBRC4943103), ações FIXAS (token, consultar_contrato, sequencia), UMA tentativa por ação de dinheiro,
// para no primeiro problema. Só funciona com o segredo REPOM_QA_TESTE_LIBERADO=sim. A resposta nunca leva credencial nem corpo bruto.
import type { ClienteRepomFrete, ResultadoFrete } from './repomFreteClient.ts'

export const BASE_QA_FIXA = 'https://qa.repom.com.br/Repom.Frete.Webapi'
export const TOKEN_QA_FIXO = `${BASE_QA_FIXA}/Token`
export const CONTRATO_QA = { shippingId: 2166947, identifier: 'RBRC4943103', status: 'InTransit' } as const
export const ACOES_QA = ['token', 'consultar_contrato', 'sequencia'] as const

export const chaveLigada = (v: string | null | undefined) => String(v ?? '').trim().toLowerCase() === 'sim'

export interface DepsQaTeste {
  ligado: boolean
  ambiente: 'qa' | 'prd'
  frete: ClienteRepomFrete
  /** status das linhas anteriores de repom_requisicoes para esta ação ('quitar' | 'autorizar') */
  historico(acao: 'quitar' | 'autorizar'): Promise<string[]>
  registrar(acao: string, request: unknown): Promise<string | null>
  concluir(id: string | null, r: { status: 'ok' | 'erro'; http: number; resposta: unknown; erro: string | null }): Promise<void>
  hoje(): string // AAAA-MM-DD
}

export interface SaidaQa { status: number; corpo: Record<string, unknown> }
interface Etapa { etapa: string; ok: boolean; http: number; erro?: string; codigoErro?: string | null; detalhe?: Record<string, unknown> }

const curto = (v: unknown) => String(v ?? '').slice(0, 300)

// ---------- leitura tolerante da resposta do contrato (o formato exato não consta no guia) ----------
type Obj = Record<string, unknown>
const ehObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)
const primeiro = (o: Obj, chaves: string[]): unknown => {
  for (const k of chaves) {
    const f = Object.keys(o).find((x) => x.toLowerCase() === k.toLowerCase())
    if (f && o[f] != null && o[f] !== '') return o[f]
  }
  return undefined
}
const raiz = (dados: unknown): Obj | null => (Array.isArray(dados) ? (ehObj(dados[0]) ? dados[0] : null) : ehObj(dados) ? dados : null)

export interface ContratoLido { status: string | null; identifier: string | null; branchCode: string | null; documentos: { numero: string; serie: string; branchCode: string; tipo: string }[] }
export function lerContratoQa(dados: unknown): ContratoLido | null {
  const o = raiz(dados)
  if (!o) return null
  const s = primeiro(o, ['Status', 'ShippingStatus', 'StatusDescription', 'ShippingStatusDescription'])
  const status = typeof s === 'string' ? s : ehObj(s) ? String(primeiro(s, ['Name', 'Description', 'Status']) ?? '') || null : null
  const identifier = (primeiro(o, ['Identifier']) as string | undefined) ?? null
  const bc = primeiro(o, ['BranchCode'])
  const branchCode = bc != null ? String(bc) : null
  let docs: unknown[] = []
  const achar = (x: unknown, n: number) => {
    if (n > 3 || !ehObj(x)) return
    for (const [k, v] of Object.entries(x)) {
      if (/^documents?$/i.test(k) && Array.isArray(v)) docs = docs.concat(v)
      else achar(v, n + 1)
    }
  }
  achar(o, 0)
  const documentos = docs.filter(ehObj).map((d) => ({
    numero: String(primeiro(d, ['Number', 'DocumentNumber']) ?? ''),
    serie: String(primeiro(d, ['Series', 'DocumentSeries']) ?? ''),
    branchCode: String(primeiro(d, ['BranchCode']) ?? branchCode ?? ''),
    tipo: String(primeiro(d, ['DocumentType', 'Type']) ?? ''),
  })).filter((d) => d.numero && d.tipo)
  return { status, identifier, branchCode, documentos }
}

function etapaDe(nome: string, r: ResultadoFrete<unknown>, detalhe?: Record<string, unknown>): Etapa {
  return r.ok
    ? { etapa: nome, ok: true, http: r.http, detalhe }
    : { etapa: nome, ok: false, http: r.http, erro: curto(r.erro), codigoErro: r.codigoErro ?? null, detalhe: r.incerto ? { ...detalhe, incerto: true } : detalhe }
}
const ehSaldo2768 = (e: Etapa) => e.codigoErro === '2768' || /\b2768\b/.test(e.erro ?? '')
const pendenciaKaren = { codigo: 2768, dono: 'Karen', nota: 'ControleSaldo não configurado; não tentar de novo.' }

export async function executarQaTeste(corpo: Record<string, unknown>, d: DepsQaTeste): Promise<SaidaQa> {
  if (!d.ligado) return { status: 503, corpo: { ok: false, desligado: true, erro: 'desligado' } }
  if (d.ambiente !== 'qa') return { status: 403, corpo: { ok: false, erro: 'Esta função só roda em QA.' } }
  const acao = String(corpo.acao ?? '')
  if (!(ACOES_QA as readonly string[]).includes(acao)) return { status: 400, corpo: { ok: false, erro: `Ação inválida. Use: ${ACOES_QA.join(', ')}.` } }

  const etapas: Etapa[] = []
  const fim = (status: number, extra: Record<string, unknown> = {}): SaidaQa => ({ status, corpo: { ok: etapas.length > 0 && etapas.every((e) => e.ok) && !extra.parou, contrato: CONTRATO_QA.shippingId, etapas, ...extra } })
  const parar = (motivo: string, status = 409) => fim(status, { parou: true, motivo })
  const passo = async <T>(nome: string, req: unknown, fn: () => Promise<ResultadoFrete<T>>, resumir?: (dados: T) => Record<string, unknown>) => {
    const id = await d.registrar(`qa-teste-${nome}`, req)
    const r = await fn()
    const e = etapaDe(nome, r, r.ok && resumir ? resumir(r.dados) : undefined)
    await d.concluir(id, { status: e.ok ? 'ok' : 'erro', http: e.http, resposta: { ok: e.ok, http: e.http, erro: e.erro ?? null, codigoErro: e.codigoErro ?? null, detalhe: e.detalhe ?? null }, erro: e.ok ? null : (e.erro ?? null) })
    etapas.push(e)
    return { e, r }
  }

  // 1) token (UMA tentativa de login; não devolve o token)
  {
    const id = await d.registrar('qa-teste-token', { acao })
    const t = await d.frete.verificarToken()
    const e: Etapa = { etapa: 'token', ok: t.ok, http: t.ok ? 200 : 0, erro: t.ok ? undefined : curto(t.erro) }
    await d.concluir(id, { status: t.ok ? 'ok' : 'erro', http: e.http, resposta: { ok: t.ok }, erro: e.erro ?? null })
    etapas.push(e)
    if (!t.ok) return fim(502, { parou: true })
    if (acao === 'token') return fim(200)
  }

  // 2) consulta do contrato (só leitura)
  const c = await passo('consultar_contrato', { shippingId: CONTRATO_QA.shippingId }, () => d.frete.consultarContratoPorViagem(CONTRATO_QA.shippingId), (dados) => {
    const l = lerContratoQa(dados)
    return { status: l?.status ?? null, identifier: l?.identifier ?? null, documentos: l?.documentos.length ?? 0 }
  })
  if (!c.r.ok) return fim(502, { parou: true })
  if (acao === 'consultar_contrato') return fim(200)
  const lido = lerContratoQa(c.r.dados)

  // 3) travas antes de mexer em dinheiro
  if (!lido?.status) return parar('Não consegui ler o status do contrato; nada foi quitado.')
  if (lido.status.toLowerCase().replace(/[\s_-]/g, '') !== CONTRATO_QA.status.toLowerCase()) return parar(`O contrato não está mais em ${CONTRATO_QA.status} (status atual: ${curto(lido.status)}); nada foi quitado. Decidir antes de continuar.`)
  if (lido.identifier && lido.identifier !== CONTRATO_QA.identifier) return parar('O contrato consultado não é o RBRC4943103; nada foi quitado.')
  const branch = lido.branchCode ?? lido.documentos[0]?.branchCode ?? ''
  if (!branch) return parar('Não encontrei o BranchCode no contrato; nada foi quitado.')
  if (!lido.documentos.length) return parar('O contrato não traz documentos legíveis para a quitação; nada foi quitado. Preciso do formato da resposta.')
  const nome = String((corpo.confirmacao as Obj | undefined)?.nome ?? '').trim()
  if (nome.length < 3) return parar('Quitação e autorização exigem confirmacao.nome (quem autorizou o teste).', 400)
  if ((await d.historico('quitar')).length) return parar('Já houve uma tentativa de quitação deste contrato; não repito. Confira antes.')
  if ((await d.historico('autorizar')).length) return parar('Já houve uma tentativa de autorização; não repito.')

  // 4) quitação (UMA tentativa)
  const q = await passo('quitar', { shippingId: CONTRATO_QA.shippingId, documentos: lido.documentos.length, confirmado_por: nome }, () =>
    d.frete.quitarViagem({
      branchCode: branch,
      shippingId: CONTRATO_QA.shippingId,
      documentos: lido.documentos.map((x) => ({ numero: x.numero, serie: x.serie, branchCode: x.branchCode || branch, tipo: x.tipo as never, status: 'Delivered' as const })),
    }))
  if (!q.e.ok) return fim(q.e.http && q.e.http < 500 ? 422 : 502, { parou: true, pendencia_externa: ehSaldo2768(q.e) ? pendenciaKaren : undefined })

  // 5) autorização de pagamento (UMA tentativa, só depois da quitação ok)
  const a = await passo('autorizar', { shippingId: CONTRATO_QA.shippingId, identifier: CONTRATO_QA.identifier, confirmado_por: nome }, () =>
    d.frete.autorizarPagamento([{ shippingId: CONTRATO_QA.shippingId, identifier: CONTRATO_QA.identifier, branchCode: branch, dataPagamento: d.hoje() }]))
  if (!a.e.ok) return fim(a.e.http && a.e.http < 500 ? 422 : 502, { parou: true, pendencia_externa: ehSaldo2768(a.e) ? pendenciaKaren : undefined })
  return fim(200)
}
