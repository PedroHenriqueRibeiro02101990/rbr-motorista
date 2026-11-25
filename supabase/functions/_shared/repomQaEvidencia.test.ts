// node --test supabase/functions/_shared/repomQaEvidencia.test.ts   (sem rede; tudo com mock)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { criarRepomFreteClient, interpretarDownload, type ClienteRepomFrete, type ResultadoFrete } from './repomFreteClient.ts'
import { ACOES_QA, EVIDENCIA, executarQaTeste, type DepsQaTeste } from './repomQaTeste.ts'

const ok = <T>(dados: T, http = 200): ResultadoFrete<T> => ({ ok: true, http, dados, bruto: dados })
const erro = (http: number, msg: string): ResultadoFrete<never> => ({ ok: false, http, erro: msg, codigoErro: null, bruto: null })
const PDF = new TextEncoder().encode('%PDF-1.4\n' + 'x'.repeat(300))
const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64')

function montar(o: { contrato?: ResultadoFrete<unknown>; baixar?: ResultadoFrete<unknown>; cancelar?: ResultadoFrete<unknown>; hist?: string[] } = {}) {
  const chamadas: string[] = []
  const frete = {
    verificarToken: async () => ({ ok: true }),
    consultarContratoPorViagem: async (id: unknown) => { chamadas.push(`viagem:${id}`); return o.contrato ?? ok({ ShippingId: id, Identifier: EVIDENCIA.identifier, Status: 'InTransit', CIOT: '123' }) },
    baixarComprovanteContrato: async (id: unknown) => { chamadas.push(`baixar:${id}`); return o.baixar ?? ok({ base64: b64(PDF), tamanho: PDF.length, pdf: true, origem: 'bruto' }) },
    cancelarContratoComMotivo: async (id: unknown, m: string) => { chamadas.push(`cancelar:${id}`); assert.ok(m.length > 3); return o.cancelar ?? ok({}) },
    cancelarContrato: async () => { chamadas.push('cancelar_sem_motivo'); return ok({}) },
  } as unknown as ClienteRepomFrete
  const linhas: string[] = []
  const deps = {
    ligado: true, ambiente: 'qa', frete, agora: () => new Date('2026-11-25T16:00:00Z'), hoje: () => '2026-11-25', amanha: () => '2026-11-26', espera: async () => {},
    historico: async () => o.hist ?? [], registrar: async (a: string) => { linhas.push(a); return String(linhas.length) }, concluir: async () => {},
  } as unknown as DepsQaTeste
  return { deps, chamadas, linhas }
}
const CONF = { confirmacao: { nome: 'Pedro' } }

test('ações novas estão na lista fechada e só mexem no shippingId 2167273', async () => {
  for (const a of ['baixar_comprovante', 'consultar_contrato_por_id', 'cancelar_contrato']) assert.ok((ACOES_QA as readonly string[]).includes(a))
  assert.equal(EVIDENCIA.shippingId, 2167273)
  for (const acao of ['baixar_comprovante', 'consultar_contrato_por_id', 'cancelar_contrato']) {
    const m = montar(); await executarQaTeste({ acao, shippingId: 2166947, id: 1, ...CONF }, m.deps)
    assert.ok(m.chamadas.every((c) => /:2167273$/.test(c)), `${acao}: ${m.chamadas}`)
  }
})

test('baixar_comprovante: devolve base64 do PDF, hora e caminho; só leitura (não cancela)', async () => {
  const m = montar(); const r = await executarQaTeste({ acao: 'baixar_comprovante' }, m.deps)
  assert.equal(r.status, 200); assert.equal(r.corpo.hora, '2026-11-25T16:00:00.000Z'); assert.equal(r.corpo.caminho, 'GET /Shipping/DownloadShippingFile/2167273')
  const a = r.corpo.arquivo as { base64: string; pdf: boolean; tamanho: number }
  assert.equal(a.pdf, true); assert.equal(Buffer.from(a.base64, 'base64').subarray(0, 4).toString(), '%PDF')
  assert.ok(!JSON.stringify(m.linhas).includes(a.base64)); assert.ok(!m.chamadas.some((c) => c.startsWith('cancelar')))
})

test('baixar_comprovante: recusa da Repom ou resposta sem arquivo param', async () => {
  const a = await executarQaTeste({ acao: 'baixar_comprovante' }, montar({ baixar: erro(404, 'Shipping not found') }).deps)
  assert.equal(a.corpo.parou, true); assert.equal(a.status, 422)
  const b = await executarQaTeste({ acao: 'baixar_comprovante' }, montar({ baixar: ok(null) }).deps)
  assert.equal(b.corpo.parou, true)
})

test('consultar_contrato_por_id: status, CIOT, hora; identificador diferente para', async () => {
  const r = await executarQaTeste({ acao: 'consultar_contrato_por_id' }, montar().deps)
  assert.equal(r.status, 200); assert.equal(r.corpo.status, 'InTransit'); assert.equal(r.corpo.ciot, '123'); assert.equal(r.corpo.hora, '2026-11-25T16:00:00.000Z')
  const o = await executarQaTeste({ acao: 'consultar_contrato_por_id' }, montar({ contrato: ok({ ShippingId: 1, Identifier: 'OUTRO', Status: 'InTransit' }) }).deps)
  assert.equal(o.corpo.parou, true)
})

test('cancelar_contrato: exige confirmação, uma única tentativa e confere identificador', async () => {
  const sem = montar(); assert.equal((await executarQaTeste({ acao: 'cancelar_contrato' }, sem.deps)).status, 400); assert.equal(sem.chamadas.length, 0)
  const ja = montar({ hist: ['erro'] }); const rj = await executarQaTeste({ acao: 'cancelar_contrato', ...CONF }, ja.deps)
  assert.equal(rj.corpo.parou, true); assert.ok(!ja.chamadas.some((c) => c.startsWith('cancelar')))
  const outro = montar({ contrato: ok({ ShippingId: 1, Identifier: 'OUTRO', Status: 'InTransit' }) }); await executarQaTeste({ acao: 'cancelar_contrato', ...CONF }, outro.deps)
  assert.ok(!outro.chamadas.some((c) => c.startsWith('cancelar')))
  const cancelado = montar({ contrato: ok({ ShippingId: 2167273, Identifier: EVIDENCIA.identifier, Status: 'Cancelled' }) }); const rc = await executarQaTeste({ acao: 'cancelar_contrato', ...CONF }, cancelado.deps)
  assert.equal(rc.corpo.ja_cancelado, true); assert.ok(!cancelado.chamadas.some((c) => c.startsWith('cancelar')))
})

test('cancelar_contrato: aceito -> 200; recusado -> para, mostra o erro e usa só o método com motivo', async () => {
  const a = montar(); const r = await executarQaTeste({ acao: 'cancelar_contrato', ...CONF }, a.deps)
  assert.equal(r.status, 200); assert.equal(r.corpo.cancelamento_aceito, true); assert.equal(r.corpo.caminho, 'PATCH /Shipping/Cancel/2167273'); assert.deepEqual(a.chamadas, ['viagem:2167273', 'cancelar:2167273'])
  const b = montar({ cancelar: erro(400, 'Shipping has movements') }); const rb = await executarQaTeste({ acao: 'cancelar_contrato', ...CONF }, b.deps)
  assert.equal(rb.corpo.parou, true); assert.equal(rb.status, 422)
  assert.ok(JSON.stringify(rb.corpo).includes('Shipping has movements') || JSON.stringify(rb.corpo).includes('recusou'))
})

test('interpretarDownload: PDF bruto, base64 puro em JSON, base64 em campo e JSON de erro', () => {
  const bruto = interpretarDownload('application/pdf', PDF) as { arquivo: { pdf: boolean; origem: string } }
  assert.equal(bruto.arquivo.pdf, true); assert.equal(bruto.arquivo.origem, 'bruto')
  const txt = interpretarDownload('application/json', new TextEncoder().encode(JSON.stringify(b64(PDF)))) as { arquivo: { pdf: boolean; origem: string; tamanho: number } }
  assert.equal(txt.arquivo.pdf, true); assert.equal(txt.arquivo.origem, 'json'); assert.equal(txt.arquivo.tamanho, PDF.length)
  const campo = interpretarDownload('application/json', new TextEncoder().encode(JSON.stringify({ Result: { FileName: 'a.pdf', FileContent: b64(PDF) } }))) as { arquivo: { pdf: boolean } }
  assert.equal(campo.arquivo.pdf, true)
  const err = interpretarDownload('application/json', new TextEncoder().encode(JSON.stringify({ Response: { StatusCode: 404, Message: 'Shipping not found' } }))) as { json: unknown }
  assert.ok('json' in err)
})

test('cliente: DownloadShippingFile lê bytes; Cancel envia { Reason }', async () => {
  const visto: { url: string; method?: string; body?: string }[] = []
  const fetchFn = (async (url: string, init?: { method?: string; body?: string }) => {
    visto.push({ url, method: init?.method, body: init?.body })
    if (url.endsWith('/Token')) return { ok: true, status: 200, json: async () => ({ access_token: 'T', expires_in: 3600 }) }
    if (url.includes('DownloadShippingFile')) return { ok: true, status: 200, headers: { get: () => 'application/pdf' }, arrayBuffer: async () => PDF.buffer.slice(PDF.byteOffset, PDF.byteOffset + PDF.byteLength), json: async () => { throw new Error('x') } }
    return { ok: true, status: 200, json: async () => ({ Message: 'canceled' }) }
  }) as never
  const c = criarRepomFreteClient({ ambiente: 'qa', urlBase: 'https://qa.repom.com.br/Repom.Frete.Webapi', urlToken: 'https://qa.repom.com.br/Repom.Frete.Webapi/Token', credenciais: { user: 'u', password: 'p', partner: 'x', version: '3' } } as never, fetchFn)
  const d = await c.baixarComprovanteContrato(2167273)
  assert.ok(d.ok && d.dados?.pdf && d.dados.tamanho === PDF.length)
  const k = await c.cancelarContratoComMotivo(2167273, 'motivo teste')
  assert.ok(k.ok)
  const p = visto.find((v) => v.method === 'PATCH')!
  assert.ok(p.url.endsWith('/Shipping/Cancel/2167273')); assert.deepEqual(JSON.parse(p.body!), { Reason: 'motivo teste' })
  assert.equal((await c.cancelarContratoComMotivo('abc', 'x')).ok, false)
})
