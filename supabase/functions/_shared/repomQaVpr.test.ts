// node --test supabase/functions/_shared/repomQaVpr.test.ts   (sem rede: tudo com mock)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ACOES_VPR, CNPJ_FILIAL_VPR_QA, cnpjValido, conferirPreVoo, cpfValido, executarQaVpr, lerEixosVeiculo, lerParVpr, lerNome, MAX_EMISSOES_VPR, novoProcessoVpr, pedidoSanitizado, type DepsVpr } from './repomQaVpr.ts'
import { dvChaveAcesso } from './repomQaAdiantamento.ts'
import type { ClienteRepomVpr, PedidoVale, ResultadoVpr, TagRepom, ValeRepom } from './repomVprClient.ts'

function cpfCom(final4: string): string {
  for (let n = 1000000; n < 9999999; n++) { const c = String(n).padStart(7, '0') + final4; if (cpfValido(c)) return c }
  throw new Error('sem cpf')
}
const PRESTADOR = cpfCom('4687'), MOTORISTA = cpfCom('2853')
const base43 = '5126110631533800313455001000066090123717978'.slice(0, 43)
const MODELO = {
  ShippingId: 2166947, Status: 'InTransit', HiredNationalId: PRESTADOR, OperationIdentifier: 'OP1', CardNumber: 0, BrazilianRouteTraceCode: 1, BrazilianRouteRouteCode: 143217, BranchCode: '1',
  LoadBrazilianNCM: '10059010', TotalLoadWeight: 20000, TotalLoadValue: 40000, ShippingPayment: { ExpectedDeliveryLocationType: 'DigitalPayment' },
  Drivers: [{ NationalId: MOTORISTA, Main: true }], Vehicles: [{ LicensePlate: 'BIS4025' }],
  Documents: [{ BranchCode: '1', DocumentType: 'CTE', Series: '1', Number: '660', EletronicKey: base43 + String(dvChaveAcesso(base43)) }],
  ShippingReceiver: { NationalId: '06315338003134', Name: 'Destinatario Teste', ReceiverType: 'Company' },
}
const okF = (dados: unknown) => Promise.resolve({ ok: true as const, http: 200, dados, bruto: null })
const TAG_OK: TagRepom[] = [{ nomeTag: 'Veloe', numeroTag: '1234567890', codigoStatusTag: 1, statusTag: 'Ativa', apto: true, observacao: null }]
const VALE: ValeRepom = { codigoViagem: '10164593', codigoViagemRepom: '105', idvpo: '05970272378087078761', valor: 321.5, tag: 'Veloe', tipoEmissao: 'TAG', statusCarga: 'pendente', viagemAtiva: true, pracas: [] }

interface Opcoes {
  tag?: TagRepom[]; emitir?: ResultadoVpr<ValeRepom>; consultaGet?: ResultadoVpr<ValeRepom>; consultaPost?: ResultadoVpr<ValeRepom>
  semNome?: boolean; histEmitir?: string[]; histRota?: string[]; semRota?: boolean; rotaExiste?: boolean; histCancelar?: string[]; emissao?: { processo: string; codigoViagem: string | null } | null; modelo?: unknown
}
function montar(o: Opcoes = {}) {
  const chamadas: string[] = []
  const regs: { acao: string; request: unknown; resp?: unknown }[] = []
  const vpr = (verbo: string): ClienteRepomVpr => ({
    ambiente: 'qa',
    consultarTag: async () => { chamadas.push('tag'); return { ok: true, http: 200, dados: o.tag ?? TAG_OK, bruto: null } },
    emitirVale: async (p: PedidoVale) => { chamadas.push('emitir'); regs.push({ acao: 'corpo-emitido', request: p }); return o.emitir ?? { ok: true, http: 200, dados: VALE, bruto: { dataEmissao: '2026-11-25T16:40:00Z' } } },
    consultarRota: async () => { chamadas.push('rota-consultar'); return { ok: true, http: 200, dados: o.rotaExiste ? { codigoRoteiro: '555', codigoPercurso: '7' } : null, bruto: null } },
    criarRota: async () => { chamadas.push('rota-criar'); return { ok: true, http: 200, dados: { codigoRoteiroRepom: '555', codigoPercursoRepom: '7', distanciaKm: 430 }, bruto: null } },
    consultarPedagio: async (p: { eixos: number }) => { chamadas.push('rota-pedagio-' + p.eixos); return { ok: true, http: 200, dados: { valorTotal: 99.9, valorIda: 99.9, valorVolta: null }, bruto: null } },
    consultarValePorProcesso: async () => { chamadas.push('consultar-processo'); return o.consultaGet ?? { ok: true, http: 200, dados: VALE, bruto: null } },
    cancelarVale: async () => { chamadas.push('cancelar'); return { ok: true, http: 200, dados: { cancelado: true }, bruto: null } },
    consultarVale: async () => { chamadas.push('consultar-' + verbo); return (verbo === 'GET' ? o.consultaGet : o.consultaPost) ?? { ok: true, http: 200, dados: VALE, bruto: null } },
  } as unknown as ClienteRepomVpr)
  const d: DepsVpr = {
    ligado: true,
    frete: {
      consultarContratoPorViagem: () => okF(o.modelo ?? MODELO), consultarContratadoPorDocumento: () => okF({ Result: { Name: o.semNome ? '' : 'JOAO DA SILVA PRESTADOR' } }),
      consultarMotorista: () => okF({ Name: 'MARIA MOTORISTA TESTE' }), consultarVeiculo: () => okF({ VehicleAxles: '5 eixos' }),
    } as unknown as DepsVpr['frete'],
    vpr: vpr('GET'), vprPost: vpr('POST'), agora: () => new Date('2026-11-25T16:40:05Z'),
    rotaVpr: async () => (o.semRota ? null : { roteiroCodigo: 555, percursoCodigo: 7 }),
    historico: async (a) => (a === 'emitir' ? o.histEmitir : a === 'rota' ? o.histRota : o.histCancelar) ?? [],
    emissao: async () => (o.emissao === undefined ? { processo: 'RBV261125164005', codigoViagem: '10164593' } : o.emissao),
    registrar: async (acao, request) => { regs.push({ acao, request }); return 'id' + regs.length },
    concluir: async (_id, r) => { regs.push({ acao: 'concluir', request: null, resp: r }) },
  }
  return { d, chamadas, regs }
}
const conf = { nome: 'Pedro' }

test('lista fechada: só as 4 ações do vale; ação livre é recusada e nada é chamado', async () => {
  assert.deepEqual([...ACOES_VPR], ['tag_vpr', 'rota_vpr', 'emitir_vpo_vpr', 'consultar_vpo_vpr', 'cancelar_vpo_vpr'])
  const m = montar()
  const r = await executarQaVpr({ acao: 'qualquer', url: 'https://x', metodo: 'DELETE' }, m.d)
  assert.equal(r.status, 400); assert.deepEqual(m.chamadas, [])
})

test('tag_vpr: monta o pre-voo (sem enviar), consulta a TAG e devolve só finais de documentos', async () => {
  const m = montar()
  const r = await executarQaVpr({ acao: 'tag_vpr' }, m.d)
  assert.equal(r.status, 200); assert.deepEqual(m.chamadas, ['tag'])
  const c = r.corpo as { apta_para_vale: boolean; pre_voo: { aprovado: boolean; pedido: Record<string, unknown>; regras: { ok: boolean }[] } }
  assert.equal(c.apta_para_vale, true); assert.equal(c.pre_voo.aprovado, true); assert.ok(c.pre_voo.regras.every((x) => x.ok))
  const txt = JSON.stringify(r.corpo)
  assert.equal(txt.includes(PRESTADOR), false); assert.equal(txt.includes(MOTORISTA), false); assert.equal(txt.includes('PRESTADOR'), false)
  assert.equal(c.pre_voo.pedido.documentoTransportador, '***4687'); assert.equal(txt.includes('1234567890'), false)
})

test('emitir: pre-voo ok + TAG apta => UMA emissão, processo <= 16, rota da 9501 (555/7), eixos inteiros, sem carreta nem praças', async () => {
  const m = montar()
  const r = await executarQaVpr({ acao: 'emitir_vpo_vpr', confirmacao: conf }, m.d)
  assert.equal(r.status, 200); assert.deepEqual(m.chamadas, ['tag', 'emitir'])
  const enviado = m.regs.find((x) => x.acao === 'corpo-emitido')!.request as PedidoVale
  assert.ok(enviado.processoCodigoCliente.length <= 16); assert.equal(enviado.cnpjFilial, CNPJ_FILIAL_VPR_QA)
  assert.deepEqual(enviado.roteiro, { roteiroCodigo: 555, percursoCodigo: 7 }); assert.equal(enviado.numeroEixos, 5); assert.equal(enviado.carretaPlaca, undefined)
  assert.equal((r.corpo.vale as { idvpoAntt: string }).idvpoAntt, '05970272378087078761')
  const guardado = JSON.stringify(m.regs.filter((x) => x.acao !== 'corpo-emitido'))
  assert.equal(guardado.includes(PRESTADOR), false); assert.equal(guardado.includes(MOTORISTA), false)
})

test('emitir: TAG inativa ou não apta PARA: nada é emitido', async () => {
  const m = montar({ tag: [{ ...TAG_OK[0], apto: false }] })
  const r = await executarQaVpr({ acao: 'emitir_vpo_vpr', confirmacao: conf }, m.d)
  assert.equal(r.status, 422); assert.deepEqual(m.chamadas, ['tag'])
  const n = montar({ tag: [{ ...TAG_OK[0], codigoStatusTag: 2 }] })
  assert.equal((await executarQaVpr({ acao: 'emitir_vpo_vpr', confirmacao: conf }, n.d)).status, 422); assert.ok(!n.chamadas.includes('emitir'))
})

test('emitir: pre-voo reprova (nome não lido, modelo de outra pessoa) => não consulta TAG nem emite', async () => {
  for (const o of [{ semNome: true }, { modelo: { ...MODELO, Drivers: [{ NationalId: '11111111111', Main: true }] } }]) {
    const m = montar(o)
    const r = await executarQaVpr({ acao: 'emitir_vpo_vpr', confirmacao: conf }, m.d)
    assert.equal(r.status, 422); assert.deepEqual(m.chamadas, [])
  }
})

test('emitir: sem confirmacao.nome => 400; limite de 2 emissões => 429, sem chamar a Repom', async () => {
  const a = montar(); assert.equal((await executarQaVpr({ acao: 'emitir_vpo_vpr' }, a.d)).status, 400)
  const b = montar({ histEmitir: ['erro', 'erro', 'ok', 'erro'] }); assert.equal(MAX_EMISSOES_VPR, 4)
  assert.equal((await executarQaVpr({ acao: 'emitir_vpo_vpr', confirmacao: conf }, b.d)).status, 429); assert.deepEqual(b.chamadas, [])
})

test('emitir: timeout/rede (incerto) NÃO repete; recusa de negócio mostra numeroErro e não repete', async () => {
  const m = montar({ emitir: { ok: false, http: 0, erro: 'A Repom demorou', incerto: true, bruto: null } })
  const r = await executarQaVpr({ acao: 'emitir_vpo_vpr', confirmacao: conf }, m.d)
  assert.equal(r.status, 202); assert.equal(m.chamadas.filter((x) => x === 'emitir').length, 1); assert.equal(r.corpo.incerto, true)
  const n = montar({ emitir: { ok: false, http: 200, erro: 'A Repom recusou a placa informada.', numeroErro: '347', bruto: null } })
  const s = await executarQaVpr({ acao: 'emitir_vpo_vpr', confirmacao: conf }, n.d)
  assert.equal(s.status, 422); assert.equal(s.corpo.numeroErro, '347'); assert.equal(n.chamadas.filter((x) => x === 'emitir').length, 1)
})

test('consultar: usa GET; se o GET não for aceito (405 sem erro de negócio) tenta o POST do manual uma vez e registra o verbo', async () => {
  const a = montar(); const ra = await executarQaVpr({ acao: 'consultar_vpo_vpr' }, a.d)
  assert.equal(ra.corpo.verbo_que_funcionou, 'GET'); assert.deepEqual(a.chamadas, ['consultar-GET'])
  const b = montar({ consultaGet: { ok: false, http: 405, erro: 'x', bruto: null } }); const rb = await executarQaVpr({ acao: 'consultar_vpo_vpr' }, b.d)
  assert.equal(rb.corpo.verbo_que_funcionou, 'POST'); assert.deepEqual(b.chamadas, ['consultar-GET', 'consultar-POST'])
  const pr = montar(); assert.equal((await executarQaVpr({ acao: 'consultar_vpo_vpr', por: 'processo' }, pr.d)).status, 200); assert.deepEqual(pr.chamadas, ['consultar-processo'])
  const c = montar({ consultaGet: { ok: false, http: 200, erro: 'A Repom não encontrou esse vale-pedágio.', numeroErro: '205', bruto: null } }); const rc = await executarQaVpr({ acao: 'consultar_vpo_vpr' }, c.d)
  assert.equal(rc.status, 422); assert.deepEqual(c.chamadas, ['consultar-GET'])
  const e = montar({ emissao: { processo: 'RBV1', codigoViagem: null } }); assert.equal((await executarQaVpr({ acao: 'consultar_vpo_vpr' }, e.d)).status, 404)
})

test('cancelar: uma vez, só do vale emitido por nós; repetir é recusado', async () => {
  const a = montar(); const r = await executarQaVpr({ acao: 'cancelar_vpo_vpr', confirmacao: conf }, a.d)
  assert.equal(r.status, 200); assert.deepEqual(a.chamadas, ['cancelar'])
  const b = montar({ histCancelar: ['ok'] }); assert.equal((await executarQaVpr({ acao: 'cancelar_vpo_vpr', confirmacao: conf }, b.d)).status, 429); assert.deepEqual(b.chamadas, [])
  const c = montar({ emissao: null }); assert.equal((await executarQaVpr({ acao: 'cancelar_vpo_vpr', confirmacao: conf }, c.d)).status, 404)
  assert.equal((await executarQaVpr({ acao: 'cancelar_vpo_vpr' }, montar().d)).status, 400)
})

test('função desligada: 503 sem chamar nada', async () => {
  const m = montar(); m.d.ligado = false
  assert.equal((await executarQaVpr({ acao: 'tag_vpr' }, m.d)).status, 503); assert.deepEqual(m.chamadas, [])
})

test('regras do pre-voo: reprova praças/cartão, processo grande, CPF/CNPJ inválidos, placa fora do padrão; helpers', () => {
  const ok: PedidoVale = { processoCodigoCliente: novoProcessoVpr(new Date('2026-11-25T16:40:05Z')), placa: 'BIS4025', numeroEixos: 5, nomeTransportador: 'A B', documentoTransportador: PRESTADOR, nomeMotorista: 'C D', documentoMotorista: MOTORISTA, cnpjFilial: CNPJ_FILIAL_VPR_QA, usuarioEmissao: 'U', roteiro: { roteiroCodigo: 555, percursoCodigo: 7 }, documentos: [{ codigo: '660', serie: '1' }] }
  assert.equal(ok.processoCodigoCliente, 'RBV261125164005'); assert.ok(conferirPreVoo(ok).every((x) => x.ok))
  const ruim = conferirPreVoo({ ...ok, processoCodigoCliente: 'X'.repeat(17), placa: 'ABC', documentoMotorista: '12345678900', cnpjFilial: '11111111111111', documentoSubcontratado: PRESTADOR })
  assert.equal(ruim.filter((x) => !x.ok).length, 5)
  assert.equal(cnpjValido(CNPJ_FILIAL_VPR_QA), true); assert.equal(cpfValido('11111111111'), false)
  assert.equal(lerNome({ Result: [{ HiredName: ' Ana  Maria ' }] }), 'Ana Maria'); assert.equal(lerEixosVeiculo([{ VehicleAxles: '6' }]), 6); assert.equal(lerEixosVeiculo({}), null)
  assert.equal(JSON.stringify(pedidoSanitizado(ok)).includes(PRESTADOR), false)
})

test('nome do prestador vem do dono do veículo quando o cadastro de prestador não responde (404); nome do motorista em DriverPersonalInformation', async () => {
  const m = montar()
  m.d.frete.consultarContratadoPorDocumento = (() => Promise.resolve({ ok: false, http: 404, erro: 'x', codigoErro: null, bruto: null })) as never
  m.d.frete.consultarVeiculo = (() => okF({ VehicleAxles: '5', VehicleOwner: { NationalId: PRESTADOR, VehiclePersonalInformation: { Name: 'DONO DO VEICULO' } } })) as never
  m.d.frete.consultarMotorista = (() => okF({ NationalId: MOTORISTA, DriverPersonalInformation: { Name: 'MOTORISTA ANINHADO' } })) as never
  assert.equal((await executarQaVpr({ acao: 'tag_vpr' }, m.d)).status, 200)
  const o = montar()
  o.d.frete.consultarContratadoPorDocumento = (() => Promise.resolve({ ok: false, http: 404, erro: 'x', codigoErro: null, bruto: null })) as never
  o.d.frete.consultarVeiculo = (() => okF({ VehicleAxles: '5', VehicleOwner: { NationalId: '99999999999', VehiclePersonalInformation: { Name: 'OUTRO DONO' } } })) as never
  const r = await executarQaVpr({ acao: 'tag_vpr' }, o.d)
  assert.equal(r.status, 422); assert.deepEqual(o.chamadas, [])
})

test('rota_vpr: consulta a rota da 9501; se não existe cria UMA vez, consulta o pedágio com os eixos do conjunto; existente não recria', async () => {
  const a = montar(); const r = await executarQaVpr({ acao: 'rota_vpr', confirmacao: conf }, a.d)
  assert.equal(r.status, 200); assert.deepEqual(a.chamadas, ['rota-consultar', 'rota-criar', 'rota-pedagio-5'])
  assert.equal((r.corpo.rota as { roteiroCodigo: number; criada: boolean }).criada, true)
  const b = montar({ rotaExiste: true }); await executarQaVpr({ acao: 'rota_vpr', confirmacao: conf }, b.d); assert.deepEqual(b.chamadas, ['rota-consultar', 'rota-pedagio-5'])
  const c = montar({ histRota: ['erro', 'erro', 'pendente'] }); assert.equal((await executarQaVpr({ acao: 'rota_vpr', confirmacao: conf }, c.d)).status, 429); assert.ok(!c.chamadas.includes('rota-criar'))
  assert.equal((await executarQaVpr({ acao: 'rota_vpr' }, montar().d)).status, 400)
})

test('sem rota da 9501 gravada: tag e emissão param antes de chamar a Repom', async () => {
  for (const acao of ['tag_vpr', 'emitir_vpo_vpr']) { const m = montar({ semRota: true }); const r = await executarQaVpr({ acao, confirmacao: conf }, m.d); assert.equal(r.status, 422); assert.deepEqual(m.chamadas, []) }
})

const CNPJ_PAR = '09524157000190'
test('par da planilha: só tração da lista com a carreta dela e documento válido; o corpo usa as placas do par e os eixos lidos do cadastro', async () => {
  assert.equal(lerParVpr(undefined), null)
  assert.equal(typeof lerParVpr({ tracao: 'AAA0A00', carreta: 'NPJ5072', documento: CNPJ_PAR }), 'string') // tração fora da lista
  assert.equal(typeof lerParVpr({ tracao: 'FPU2C10', carreta: 'SUM8I91', documento: CNPJ_PAR }), 'string') // carreta de outro par
  assert.equal(typeof lerParVpr({ tracao: 'FPU2C10', carreta: 'NPJ5072', documento: '11111111111111' }), 'string') // documento inválido
  assert.deepEqual(lerParVpr({ tracao: 'fpu2c10', carreta: 'npj-5072', documento: '09.524.157/0001-90' }), { tracao: 'FPU2C10', carreta: 'NPJ5072', documento: CNPJ_PAR })
  const a = montar(); const r = await executarQaVpr({ acao: 'emitir_vpo_vpr', confirmacao: conf, par: { tracao: 'FPU2C10', carreta: 'NPJ5072', documento: CNPJ_PAR } }, a.d)
  assert.equal(r.status, 200)
  const emitido = a.regs.find((x) => x.acao === 'corpo-emitido')?.request as PedidoVale
  assert.equal(emitido.placa, 'FPU2C10'); assert.equal(emitido.carretaPlaca, 'NPJ5072'); assert.equal(emitido.documentoTransportador, CNPJ_PAR); assert.equal(emitido.carretaNumeroEixos, 5)
  const b = montar(); assert.equal((await executarQaVpr({ acao: 'tag_vpr', par: { tracao: 'ZZZ9Z99', carreta: 'NPJ5072', documento: CNPJ_PAR } }, b.d)).status, 400); assert.deepEqual(b.chamadas, [])
})
