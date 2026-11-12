// node --test supabase/functions/_shared/repomVprClient.test.ts   (sem rede: tudo com mock)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ibgeParaRepom, lerErroRepom, montarCorpoRota, type Fetch } from './repomClient.ts'
import { criarRepomVprClient, lerVale, montarCorpoVale, validarPedidoVale, type ConfigRepomVpr, type PedidoVale } from './repomVprClient.ts'

const cfg: ConfigRepomVpr = { ambiente: 'qa', roteirizacaoLogin: 'LOGIN_ROT_SECRETO', roteirizacaoSenha: 'SENHA_ROT_SECRETA', valePedagioLogin: 'USUARIO_VALE_SECRETO', valePedagioSenha: 'SENHA_VALE_SECRETA' }
type Chamada = { url: string; init: { method?: string; headers?: Record<string, string>; body?: string } }
const tokenVale = (n = 1) => ({ authenticated: true, created: '2025-11-12 17:00:19', expiration: '2025-11-13 17:00:18', accessToken: 'tv' + n })
function mock(resp: (c: Chamada, n: number) => { status: number; corpo: unknown } | 'timeout') {
  const chamadas: Chamada[] = []
  const fetchFn: Fetch = async (url, init) => {
    const c = { url, init: init ?? {} }
    chamadas.push(c)
    const x = resp(c, chamadas.length)
    if (x === 'timeout') { const e = new Error('abortado'); e.name = 'AbortError'; throw e }
    return { ok: x.status >= 200 && x.status < 300, status: x.status, json: async () => x.corpo }
  }
  return { chamadas, fetchFn }
}
const ehTokenRot = (c: Chamada) => c.url.includes('/connect/token')
const ehTokenVale = (c: Chamada) => c.url.endsWith('/api/Token')

const pedido: PedidoVale = {
  processoCodigoCliente: 'V123', placa: 'abc-1d23', numeroEixos: 2, carretaPlaca: 'DEF4G56', carretaNumeroEixos: 4,
  nomeTransportador: 'Transportadora Teste', documentoTransportador: '00.000.000/0001-00', nomeMotorista: 'Motorista Teste', documentoMotorista: '000.000.000-00',
  cnpjFilial: '00000000000100', usuarioEmissao: 'Usuario Teste', roteiro: { roteiroCodigo: 140476, percursoCodigo: 334 }, documentos: [{ codigo: '141506', serie: '2' }],
}
const valeOk = { result: { status: true }, numeroEixosCavalo: 2, statusCarga: 'Carregado', viagemAtiva: true, codigoViagem: 10164586, codigoViagemRepom: 100, idvpoAntt: ['53281139708594652971'], veiculo: 'ABC1D23', tipoEmissao: 'Pedágio Eletrônico', valor: 50.4, tag: '8990100000080419', pracas: [{ id: 256, nomeConcessionaria: 'PLANALTO SUL', nomePraca: 'SANTA CECILIA SUL', nomeRodovia: 'BR 116', ativa: 1, pracaPreco: [{ preco: 50.4, quantidadeEixos: 6 }], result: { status: true } }] }

test('IBGE: 3550308 -> 50308, 3304557 -> 4557, 3524709 -> 24709, 1801012 -> 1012', () => {
  assert.equal(ibgeParaRepom('3550308'), '50308')
  assert.equal(ibgeParaRepom('3304557'), '4557')
  assert.equal(ibgeParaRepom('3524709'), '24709')
  assert.equal(ibgeParaRepom('1801012'), '1012')
})
test('corpo da rota segue o manual: TipoRoteiro (não TipoRota) com 1 curto, 2 rápido, 3 mais curto, 4 econômico', () => {
  const base = { codigoRoteiroCliente: 'R1', origem: { ibge: '3550308', uf: 'SP' }, destino: { ibge: '3304557', uf: 'RJ' }, idaVolta: true }
  const c = montarCorpoRota({ ...base, tipoRota: 'mais_rapida' }) as Record<string, unknown>
  assert.equal(c.TipoRoteiro, 2)
  assert.equal('TipoRota' in c, false)
  assert.equal((montarCorpoRota({ ...base, tipoRota: 'curta' }) as Record<string, unknown>).TipoRoteiro, 1)
  assert.equal((montarCorpoRota({ ...base, tipoRota: 'mais_curta' }) as Record<string, unknown>).TipoRoteiro, 3)
  assert.equal((montarCorpoRota({ ...base, tipoRota: 'economica', tipoVeiculo: 2 }) as Record<string, unknown>).TipoRoteiro, 4)
})
test('os quatro formatos de erro da Repom são lidos', () => {
  assert.equal(lerErroRepom({ isValid: false, errors: [{ descricao: 'Express: IBGE inválido' }] })?.mensagem, 'Express: IBGE inválido')
  assert.match(lerErroRepom({ type: 'x', title: 'One or more validation errors occurred.', status: 400, errors: { '$.destino.codigoIBGE': ['The JSON value could not be converted.'] } })?.mensagem ?? '', /destino\.codigoIBGE/)
  const c = lerErroRepom({ result: { status: false, descricao: 'Placa: Placa informada invalida.', numeroErro: '347' } })
  assert.equal(c?.numeroErro, '347')
  assert.match(lerErroRepom({ NumeroEixos: ['The input was not valid.'] })?.mensagem ?? '', /NumeroEixos/)
  assert.equal(lerErroRepom({ Message: 'Unexpected error', Description: 'Unexpected error' })?.mensagem, 'Unexpected error')
  assert.equal(lerErroRepom({ result: { status: true } }), null)
  assert.equal(lerErroRepom([{ nomeTag: 'x' }]), null)
})

test('token da roteirização e do vale são cacheados: duas consultas, um token de cada', async () => {
  const m = mock((c) => (ehTokenRot(c) ? { status: 200, corpo: { access_token: 'tr', expires_in: 3600 } } : ehTokenVale(c) ? { status: 200, corpo: tokenVale() } : c.url.includes('/Api/Roteiro') ? { status: 200, corpo: { valorTotalVpr: 100 } } : { status: 200, corpo: [] }))
  const cli = criarRepomVprClient(cfg, m.fetchFn)
  await cli.consultarPedagio({ codigoRoteiro: '1', codigoPercurso: '2', eixos: 5 })
  await cli.consultarPedagio({ codigoRoteiro: '1', codigoPercurso: '2', eixos: 5 })
  await cli.consultarTag('ABC1D23')
  await cli.consultarTag('ABC1D23')
  assert.equal(m.chamadas.filter(ehTokenRot).length, 1)
  assert.equal(m.chamadas.filter(ehTokenVale).length, 1)
  const tk = m.chamadas.find(ehTokenRot)!
  assert.match(tk.init.body!, /grant_type=client_credentials/)
  assert.equal(JSON.parse(m.chamadas.find(ehTokenVale)!.init.body!).usuario, 'USUARIO_VALE_SECRETO')
})
test('401 renova o token UMA vez e repete UMA vez (sem loop)', async () => {
  let tokens = 0
  const m = mock((c) => {
    if (ehTokenRot(c)) return { status: 200, corpo: { access_token: 'tok' + ++tokens, expires_in: 3600 } }
    return c.init.headers?.authorization === 'Bearer tok1' ? { status: 401, corpo: null } : { status: 200, corpo: { valorTotalVpr: 250.5 } }
  })
  const r = await criarRepomVprClient(cfg, m.fetchFn).consultarPedagio({ codigoRoteiro: '1', codigoPercurso: '2', eixos: 5 })
  assert.equal(r.ok, true)
  assert.equal(tokens, 2)
  // 401 permanente: tenta duas vezes e para
  const m2 = mock((c) => (ehTokenRot(c) ? { status: 200, corpo: { access_token: 't', expires_in: 3600 } } : { status: 401, corpo: null }))
  const r2 = await criarRepomVprClient(cfg, m2.fetchFn).consultarPedagio({ codigoRoteiro: '1', codigoPercurso: '2', eixos: 5 })
  assert.equal(r2.ok, false)
  assert.equal(m2.chamadas.filter((c) => c.url.includes('/Api/Roteiro')).length, 2)
})
test('criar rota: corpo com IBGE normalizado; status 1 = sucesso; isValid:false vira erro em português da Repom', async () => {
  const m = mock((c) => (ehTokenRot(c) ? { status: 200, corpo: { access_token: 't', expires_in: 3600 } } : { status: 200, corpo: { codigoRoteiroExterno: 'RT321', codigoRoteiroRepom: '140476', codigoPercurso: '334', status: 1, descricaoErro: null } }))
  const r = await criarRepomVprClient(cfg, m.fetchFn).criarRota({ codigoRoteiroCliente: 'RT321', origem: { ibge: '3550308', uf: 'SP' }, destino: { ibge: '3304557', uf: 'RJ' }, idaVolta: true })
  assert.equal(r.ok && r.dados.codigoRoteiroRepom, '140476')
  const corpo = JSON.parse(m.chamadas.find((c) => c.url.endsWith('/Api/Rota'))!.init.body!)
  assert.deepEqual(corpo.Origem, { CodigoIBGE: '50308', Estado: 'SP' })
  assert.equal(corpo.Destino.CodigoIBGE, '4557')
  const m2 = mock((c) => (ehTokenRot(c) ? { status: 200, corpo: { access_token: 't' } } : { status: 200, corpo: { isValid: false, errors: [{ descricao: 'Express: IBGE e/ou CEP da cidade de destino inválido' }] } }))
  const r2 = await criarRepomVprClient(cfg, m2.fetchFn).criarRota({ codigoRoteiroCliente: 'RT321', origem: { ibge: '3550308', uf: 'SP' }, destino: { ibge: '3304557', uf: 'RJ' }, idaVolta: false })
  assert.equal(r2.ok, false)
  if (!r2.ok) assert.match(r2.erro, /destino inválido/)
})
test('consultar rota: 204 e 404 não são erro de comunicação', async () => {
  const m = mock((c) => (ehTokenRot(c) ? { status: 200, corpo: { access_token: 't' } } : { status: 404, corpo: null }))
  const r = await criarRepomVprClient(cfg, m.fetchFn).consultarRota('RT321')
  assert.equal(r.ok && r.dados, null)
  assert.match(m.chamadas.at(-1)!.url, /\/api\/rota\?codigoRoteiroCliente=RT321$/)
})

test('emitir vale: corpo do manual (tração + carreta somada, sem praças próprias) e resposta lida', async () => {
  assert.equal(validarPedidoVale(pedido), null)
  const corpo = montarCorpoVale(pedido) as Record<string, unknown>
  assert.equal(corpo.Placa, 'ABC1D23')
  assert.equal(corpo.DocumentoTransportador, '00000000000100')
  assert.equal(corpo.UtilizaCarreta, true)
  assert.equal('Pracas' in corpo || 'pracas' in corpo, false)
  const m = mock((c) => (ehTokenVale(c) ? { status: 200, corpo: tokenVale() } : { status: 200, corpo: valeOk }))
  const r = await criarRepomVprClient(cfg, m.fetchFn).emitirVale(pedido)
  assert.ok(r.ok)
  if (r.ok) {
    assert.equal(r.dados.codigoViagem, '10164586')
    assert.equal(r.dados.idvpo, '53281139708594652971')
    assert.equal(r.dados.valor, 50.4)
    assert.equal(r.dados.statusCarga, 'carregado')
    assert.equal(r.dados.pracas[0]!.precos[0]!.quantidadeEixos, 6)
  }
  assert.match(m.chamadas.at(-1)!.url, /^https:\/\/qa\.repom\.com\.br\/Repom\.ValePedagio\.WebAPI\/api\/RepomViagem\/ValePedagio$/)
  assert.equal(lerVale({ result: { status: false } }), null)
})
test('emitir vale: validações do manual recusam antes de chamar a Repom', async () => {
  const m = mock(() => ({ status: 200, corpo: {} }))
  const cli = criarRepomVprClient(cfg, m.fetchFn)
  for (const ruim of [{ ...pedido, placa: 'ABC' }, { ...pedido, documentoMotorista: '123' }, { ...pedido, cnpjFilial: '1' }, { ...pedido, processoCodigoCliente: 'X'.repeat(21) }, { ...pedido, roteiro: undefined }, { ...pedido, carretaNumeroEixos: undefined }]) {
    const r = await cli.emitirVale(ruim)
    assert.equal(r.ok, false)
  }
  assert.equal(m.chamadas.length, 0)
})
test('emitir vale: erro de negócio (347) e erro de tipo de campo são definitivos, não incertos', async () => {
  const m = mock((c) => (ehTokenVale(c) ? { status: 200, corpo: tokenVale() } : { status: 200, corpo: { result: { status: false, descricao: 'Placa: Placa informada invalida.', numeroErro: '347' }, codigoViagem: 0 } }))
  const r = await criarRepomVprClient(cfg, m.fetchFn).emitirVale(pedido)
  assert.equal(r.ok, false)
  if (!r.ok) { assert.equal(r.numeroErro, '347'); assert.equal(r.incerto, undefined); assert.match(r.erro, /placa/i) }
  const m2 = mock((c) => (ehTokenVale(c) ? { status: 200, corpo: tokenVale() } : { status: 400, corpo: { NumeroEixos: ['The input was not valid.'] } }))
  const r2 = await criarRepomVprClient(cfg, m2.fetchFn).emitirVale(pedido)
  assert.equal(r2.ok === false && r2.incerto, undefined)
})
test('emitir vale: timeout e 5xx NÃO reenviam e voltam como INCERTO (uma única emissão)', async () => {
  const m = mock((c) => (ehTokenVale(c) ? { status: 200, corpo: tokenVale() } : 'timeout'))
  const r = await criarRepomVprClient(cfg, m.fetchFn).emitirVale(pedido)
  assert.equal(r.ok === false && r.incerto, true)
  assert.equal(m.chamadas.filter((c) => c.url.endsWith('/ValePedagio')).length, 1)
  const m2 = mock((c) => (ehTokenVale(c) ? { status: 200, corpo: tokenVale() } : { status: 500, corpo: null }))
  const r2 = await criarRepomVprClient(cfg, m2.fetchFn).emitirVale(pedido)
  assert.equal(r2.ok === false && r2.incerto, true)
  assert.equal(m2.chamadas.filter((c) => c.url.endsWith('/ValePedagio')).length, 1)
})
test('cancelar vale: sucesso, 325 já cancelada e usuário obrigatório', async () => {
  const m = mock((c) => (ehTokenVale(c) ? { status: 200, corpo: tokenVale() } : { status: 200, corpo: { result: { status: true } } }))
  const cli = criarRepomVprClient(cfg, m.fetchFn)
  const r = await cli.cancelarVale(10164586, 'Teste Integração')
  assert.equal(r.ok, true)
  assert.deepEqual(JSON.parse(m.chamadas.at(-1)!.init.body!), { viagemCodigo: 10164586, usuario: 'Teste Integração' })
  const m2 = mock((c) => (ehTokenVale(c) ? { status: 200, corpo: tokenVale() } : { status: 200, corpo: { result: { status: false, descricao: 'Viagem já se encontra cancelada.', numeroErro: '325' } } }))
  const r2 = await criarRepomVprClient(cfg, m2.fetchFn).cancelarVale('10164586', 'x')
  assert.equal(r2.ok === false && r2.numeroErro, '325')
  assert.equal((await cli.cancelarVale(0, 'x')).ok, false)
})
test('consultar vale: GET por padrão (D-V02), POST se configurado; 205 = não encontrada', async () => {
  const m = mock((c) => (ehTokenVale(c) ? { status: 200, corpo: tokenVale() } : { status: 200, corpo: valeOk }))
  const r = await criarRepomVprClient(cfg, m.fetchFn).consultarVale(10164586)
  assert.equal(r.ok, true)
  assert.equal(m.chamadas.at(-1)!.init.method, 'GET')
  assert.match(m.chamadas.at(-1)!.url, /\/api\/RepomViagem\/ID\?ID=10164586$/)
  const m2 = mock((c) => (ehTokenVale(c) ? { status: 200, corpo: tokenVale() } : { status: 200, corpo: valeOk }))
  await criarRepomVprClient({ ...cfg, verboConsultaVale: 'POST' }, m2.fetchFn).consultarVale(1)
  assert.equal(m2.chamadas.at(-1)!.init.method, 'POST')
  const m3 = mock((c) => (ehTokenVale(c) ? { status: 200, corpo: tokenVale() } : { status: 200, corpo: { result: { status: false, descricao: 'Viagem não Encontrada.', numeroErro: '205' } } }))
  const r3 = await criarRepomVprClient(cfg, m3.fetchFn).consultarVale(1)
  assert.equal(r3.ok === false && r3.numeroErro, '205')
})
test('sem credenciais não chama nada; ambiente padrão qa; prd usa o host www', async () => {
  const m = mock(() => ({ status: 200, corpo: {} }))
  const vazio = criarRepomVprClient({ ...cfg, roteirizacaoLogin: '', roteirizacaoSenha: '', valePedagioLogin: '', valePedagioSenha: '' }, m.fetchFn)
  assert.equal((await vazio.consultarPedagio({ codigoRoteiro: '1', codigoPercurso: '2', eixos: 5 })).ok, false)
  assert.equal((await vazio.emitirVale(pedido)).ok, false)
  assert.equal(m.chamadas.length, 0)
  const m2 = mock((c) => (ehTokenVale(c) ? { status: 200, corpo: tokenVale() } : { status: 200, corpo: valeOk }))
  await criarRepomVprClient({ ...cfg, ambiente: 'prd' }, m2.fetchFn).emitirVale(pedido)
  assert.match(m2.chamadas.at(-1)!.url, /^https:\/\/www\.repom\.com\.br\/Repom\.ValePedagio\.WebAPI\//)
})
test('verificarToken faz UMA chamada e só ao token da API pedida', async () => {
  const m = mock((c) => (ehTokenRot(c) ? { status: 200, corpo: { access_token: 't', expires_in: 3600 } } : { status: 200, corpo: tokenVale() }))
  assert.equal(await criarRepomVprClient(cfg, m.fetchFn).verificarToken('roteirizacao'), true)
  assert.equal(m.chamadas.length, 1)
  assert.equal(await criarRepomVprClient(cfg, m.fetchFn).verificarToken('vale'), true)
  assert.equal(m.chamadas.length, 2)
})
test('nenhum segredo em erro, resposta ou corpo devolvido', async () => {
  const m = mock((c) => (ehTokenVale(c) ? { status: 401, corpo: { accessToken: 'TOKEN_VAZADO', senha: 'SENHA_VALE_SECRETA' } } : { status: 200, corpo: {} }))
  const r = await criarRepomVprClient(cfg, m.fetchFn).emitirVale(pedido)
  const texto = JSON.stringify(r)
  for (const s of ['SENHA_VALE_SECRETA', 'USUARIO_VALE_SECRETO', 'TOKEN_VAZADO', 'SENHA_ROT_SECRETA', 'LOGIN_ROT_SECRETO']) assert.ok(!texto.includes(s), s)
})
