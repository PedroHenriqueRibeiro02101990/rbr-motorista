// node --test supabase/functions/_shared/repomQaTeste.test.ts   (sem rede; tudo com mock)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ClienteRepomFrete, ResultadoFrete } from './repomFreteClient.ts'
import { BASE_QA_FIXA, CONTRATO_QA, MOTIVO_EXCECAO, TOKEN_QA_FIXO, chaveLigada, executarQaTeste, lerContratoQa, type DepsQaTeste } from './repomQaTeste.ts'

const ok = <T>(dados: T, http = 200): ResultadoFrete<T> => ({ ok: true, http, dados, bruto: dados })
const erro = (http: number, msg: string, codigoErro: string | null = null, incerto?: boolean): ResultadoFrete<never> => ({ ok: false, http, erro: msg, codigoErro, incerto, bruto: { segredo: 'SENHA_SECRETA' } })

const contratoOk = { Identifier: 'RBRC4943103', Status: 'InTransit', BranchCode: '1', Documents: [{ Number: '660', Series: '1', BranchCode: '1', DocumentType: 'CTE' }] }

function montar(o: { contrato?: unknown; consulta?: ResultadoFrete<unknown>; quitar?: ResultadoFrete<unknown>; autorizar?: ResultadoFrete<unknown>; token?: boolean; hist?: { quitar?: string[]; autorizar?: string[] }; ligado?: boolean; ambiente?: 'qa' | 'prd' } = {}) {
  const chamadas: string[] = []
  const args: Record<string, unknown> = {}
  const frete = {
    verificarToken: async () => { chamadas.push('token'); return o.token === false ? { ok: false, erro: 'Token recusado' } : { ok: true } },
    consultarContratoPorViagem: async (id: unknown) => { chamadas.push('consultar'); args.consultar = id; return o.consulta ?? ok(o.contrato ?? contratoOk) },
    quitarViagem: async (p: unknown) => { chamadas.push('quitar'); args.quitar = p; return o.quitar ?? ok({}) },
    autorizarPagamento: async (p: unknown) => { chamadas.push('autorizar'); args.autorizar = p; return o.autorizar ?? ok({}) },
  } as unknown as ClienteRepomFrete
  const linhas: { acao: string; status?: string; resposta?: unknown }[] = []
  const deps: DepsQaTeste = {
    ligado: o.ligado ?? true, ambiente: o.ambiente ?? 'qa', frete, amanha: () => '2026-11-25',
    historico: async (a) => o.hist?.[a] ?? [],
    registrar: async (acao) => { linhas.push({ acao }); return String(linhas.length - 1) },
    concluir: async (id, r) => { Object.assign(linhas[Number(id)], { status: r.status, resposta: r.resposta }) },
  }
  return { deps, chamadas, args, linhas }
}
const SEQ = { acao: 'sequencia', confirmacao: { nome: 'Pedro Teste' } }

test('desligado: sem a chave, responde "desligado" e não toca na Repom nem no banco', async () => {
  const m = montar({ ligado: false })
  const r = await executarQaTeste(SEQ, m.deps)
  assert.equal(r.status, 503); assert.equal(r.corpo.erro, 'desligado'); assert.equal(m.chamadas.length, 0); assert.equal(m.linhas.length, 0)
  assert.equal(chaveLigada('sim'), true); assert.equal(chaveLigada('nao'), false); assert.equal(chaveLigada(null), false); assert.equal(chaveLigada('SIM '), true)
})

test('fora de QA ou ação desconhecida: recusa sem chamar nada', async () => {
  const prd = montar({ ambiente: 'prd' })
  assert.equal((await executarQaTeste(SEQ, prd.deps)).status, 403); assert.equal(prd.chamadas.length, 0)
  const m = montar()
  for (const acao of ['quitar', 'cancelar_contrato', '', 'emitir']) assert.equal((await executarQaTeste({ acao }, m.deps)).status, 400)
  assert.equal(m.chamadas.length, 0)
})

test('base e token de QA são fixos no código e são de qa.repom.com.br', () => {
  assert.equal(new URL(BASE_QA_FIXA).hostname, 'qa.repom.com.br'); assert.equal(new URL(TOKEN_QA_FIXO).hostname, 'qa.repom.com.br')
  assert.equal(CONTRATO_QA.shippingId, 2166947); assert.equal(CONTRATO_QA.identifier, 'RBRC4943103')
})

test('token: uma tentativa; falha para tudo', async () => {
  const a = montar({ token: false })
  const r = await executarQaTeste(SEQ, a.deps)
  assert.equal(r.status, 502); assert.deepEqual(a.chamadas, ['token'])
  const b = montar(); const rb = await executarQaTeste({ acao: 'token' }, b.deps)
  assert.equal(rb.status, 200); assert.deepEqual(b.chamadas, ['token'])
})

test('consultar_contrato: só leitura (nunca quita nem autoriza), sempre o contrato 2166947 mesmo que peçam outro', async () => {
  const m = montar()
  const r = await executarQaTeste({ acao: 'consultar_contrato', shippingId: 999, contrato: 1, url: 'https://www.repom.com.br' }, m.deps)
  assert.equal(r.status, 200); assert.deepEqual(m.chamadas, ['token', 'consultar']); assert.equal(m.args.consultar, 2166947)
})

test('sequência feliz: token, consulta, quitação (Delivered, documentos do contrato) e autorização; cada uma UMA vez, com registro', async () => {
  const m = montar()
  const r = await executarQaTeste(SEQ, m.deps)
  assert.equal(r.status, 200); assert.equal(r.corpo.ok, true)
  assert.deepEqual(m.chamadas, ['token', 'consultar', 'quitar', 'autorizar'])
  const q = m.args.quitar as { shippingId: number; branchCode: string; documentos: { status: string; numero: string }[] }
  assert.equal(q.shippingId, 2166947); assert.equal(q.branchCode, '1'); assert.equal(q.documentos[0].status, 'Delivered'); assert.equal(q.documentos[0].numero, '660')
  assert.deepEqual(m.args.autorizar, [{ shippingId: 2166947, identifier: 'RBRC4943103', branchCode: '1', dataPagamento: '2026-11-25' }])
  assert.deepEqual(m.linhas.map((l) => l.acao), ['qa-teste-token', 'qa-teste-consultar_contrato', 'qa-teste-quitar', 'qa-teste-autorizar'])
  assert.ok(m.linhas.every((l) => l.status === 'ok'))
})

test('quitação falha: para, NÃO autoriza e não repete', async () => {
  const m = montar({ quitar: erro(422, 'Documento inválido', '760') })
  const r = await executarQaTeste(SEQ, m.deps)
  assert.equal(r.status, 422); assert.equal(r.corpo.ok, false); assert.equal(r.corpo.parou, true)
  assert.deepEqual(m.chamadas, ['token', 'consultar', 'quitar'])
})

test('2768 na autorização: registra pendência externa (Karen), uma tentativa só', async () => {
  const m = montar({ autorizar: erro(400, 'Erro 2768: controle de saldo não configurado', '2768') })
  const r = await executarQaTeste(SEQ, m.deps)
  assert.equal(r.corpo.ok, false); assert.equal(m.chamadas.filter((x) => x === 'autorizar').length, 1)
  assert.deepEqual(r.corpo.pendencia_externa, { codigo: 2768, dono: 'Karen', nota: 'ControleSaldo não configurado; não tentar de novo.' })
  assert.equal(m.linhas.at(-1)?.status, 'erro')
})

test('2768 só na mensagem (sem código estruturado) também vira pendência da Karen', async () => {
  const m = montar({ quitar: erro(400, 'ControleSaldo não configurado (2768)') })
  const r = await executarQaTeste(SEQ, m.deps)
  assert.equal((r.corpo.pendencia_externa as { dono: string }).dono, 'Karen'); assert.ok(!m.chamadas.includes('autorizar'))
})

test('resultado incerto (5xx) na quitação: para e sinaliza; não autoriza', async () => {
  const m = montar({ quitar: erro(503, 'Serviço indisponível', null, true) })
  const r = await executarQaTeste(SEQ, m.deps)
  assert.equal(r.status, 502); assert.ok(!m.chamadas.includes('autorizar'))
  assert.equal(((r.corpo.etapas as { detalhe?: { incerto?: boolean } }[]).at(-1))?.detalhe?.incerto, true)
})

test('contrato fora de InTransit, de outro identificador, ou ilegível: NÃO quita', async () => {
  for (const c of [{ ...contratoOk, Status: 'Finished' }, { ...contratoOk, Identifier: 'OUTRO' }, { Identifier: 'RBRC4943103', Documents: contratoOk.Documents }, { ...contratoOk, Documents: [] }, { ...contratoOk, BranchCode: undefined, Documents: [{ Number: '1', DocumentType: 'CTE' }] }]) {
    const m = montar({ contrato: c })
    const r = await executarQaTeste(SEQ, m.deps)
    assert.equal(r.corpo.parou, true, JSON.stringify(c)); assert.ok(!m.chamadas.includes('quitar'), JSON.stringify(c))
  }
})

test('sem confirmação com nome: não quita', async () => {
  const m = montar()
  const r = await executarQaTeste({ acao: 'sequencia' }, m.deps)
  assert.equal(r.status, 400); assert.ok(!m.chamadas.includes('quitar'))
})

test('uma tentativa por ação: histórico de quitação ou de autorização barra a repetição', async () => {
  for (const hist of [{ quitar: ['erro'] }, { quitar: ['ok'] }, { autorizar: ['pendente'] }]) {
    const m = montar({ hist })
    const r = await executarQaTeste(SEQ, m.deps)
    assert.equal(r.status, 409); assert.ok(!m.chamadas.includes('quitar') && !m.chamadas.includes('autorizar'))
  }
})

test('status aceita variações de escrita (In Transit, in_transit)', async () => {
  for (const s of ['In Transit', 'in_transit', 'INTRANSIT']) {
    const m = montar({ contrato: { ...contratoOk, Status: s } })
    assert.equal((await executarQaTeste(SEQ, m.deps)).status, 200)
  }
})

test('a resposta e o registro nunca carregam credencial nem corpo bruto da Repom', async () => {
  const m = montar({ quitar: erro(422, 'Falha na quitação', '760') })
  const r = await executarQaTeste(SEQ, m.deps)
  const tudo = JSON.stringify([r.corpo, m.linhas])
  assert.ok(!tudo.includes('SENHA_SECRETA')); assert.ok(!/bruto/.test(tudo))
})

test('lerContratoQa: lê Documents em Result aninhado, array na raiz, e status em objeto', () => {
  assert.equal(lerContratoQa({ Shipping: { Documents: [{ Number: '1', DocumentType: 'CTE' }] }, Status: { Name: 'InTransit' } })?.documentos.length, 1)
  assert.equal(lerContratoQa([contratoOk])?.status, 'InTransit')
  assert.equal(lerContratoQa({ Status: { Name: 'InTransit' } })?.status, 'InTransit')
  assert.equal(lerContratoQa('x'), null)
})

test('autorizar (exceção, 3ª tentativa): contrato Paid + exatamente 2 recusas -> UMA tentativa SEM Branch/BranchCode, data do dia seguinte, motivo registrado, sem quitar', async () => {
  const m = montar({ contrato: { ...contratoOk, Status: 'Paid' }, hist: { quitar: ['ok'], autorizar: ['erro', 'erro'] } })
  const r = await executarQaTeste({ acao: 'autorizar', confirmacao: { nome: 'Pedro' } }, m.deps)
  assert.equal(r.status, 200); assert.equal(r.corpo.branch_e_branchcode_nao_vao_na_autorizacao, true)
  assert.deepEqual(m.chamadas, ['token', 'consultar', 'autorizar'])
  assert.deepEqual(m.args.autorizar, [{ shippingId: 2166947, identifier: 'RBRC4943103', dataPagamento: '2026-11-25' }])
  assert.ok(!('branchCode' in (m.args.autorizar as object[])[0]))
  assert.match(JSON.stringify(m.linhas.at(-1)), /autorizar/); assert.match(MOTIVO_EXCECAO, /sem Branch e sem BranchCode/)
})

test('consultar_contrato informa o BranchCode do contrato (usado na quitação; não é segredo)', async () => {
  const m = montar({ contrato: { ...contratoOk, Status: 'Paid' } })
  const r = await executarQaTeste({ acao: 'consultar_contrato' }, m.deps)
  const det = (r.corpo.etapas as { detalhe?: { branchCode?: string; branchCodeDocumentos?: string[] } }[])[1].detalhe
  assert.equal(det?.branchCode, '1'); assert.deepEqual(det?.branchCodeDocumentos, ['1'])
})

test('autorizar: 2768 vira pendência da Karen; qualquer outro erro para; sem nova tentativa', async () => {
  const m = montar({ contrato: { ...contratoOk, Status: 'Paid' }, hist: { autorizar: ['erro', 'erro'] }, autorizar: erro(400, 'Erro 2768', '2768') })
  const r = await executarQaTeste({ acao: 'autorizar', confirmacao: { nome: 'Pedro' } }, m.deps)
  assert.equal((r.corpo.pendencia_externa as { dono: string }).dono, 'Karen'); assert.equal(m.chamadas.filter((x) => x === 'autorizar').length, 1)
})

test('autorizar: não roda com 0, 1 ou 3 tentativas anteriores, com sucesso anterior, ou contrato fora de Paid; nunca quita', async () => {
  const casos = [{ contrato: { ...contratoOk, Status: 'Paid' }, hist: { autorizar: [] as string[] } }, { contrato: { ...contratoOk, Status: 'Paid' }, hist: { autorizar: ['erro'] } }, { contrato: { ...contratoOk, Status: 'Paid' }, hist: { autorizar: ['erro', 'erro', 'erro'] } }, { contrato: { ...contratoOk, Status: 'Paid' }, hist: { autorizar: ['erro', 'ok'] } }, { contrato: contratoOk, hist: { autorizar: ['erro', 'erro'] } }]
  for (const c of casos) {
    const m = montar(c)
    const r = await executarQaTeste({ acao: 'autorizar', confirmacao: { nome: 'Pedro' } }, m.deps)
    assert.equal(r.corpo.parou, true, JSON.stringify(c.hist)); assert.ok(!m.chamadas.includes('autorizar') && !m.chamadas.includes('quitar'))
  }
})
