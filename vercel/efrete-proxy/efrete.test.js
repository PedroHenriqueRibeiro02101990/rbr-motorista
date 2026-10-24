// node --test vercel/efrete-proxy/efrete.test.js   (sem rede: o envio à efrete é simulado)
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { tratar, caminhoPermitido, chaveConfere, montarDestino } = require('./api/efrete.js')

const ENV = { PROXY_CHAVE: 'chave-de-teste-123', EFRETE_BASE_URL: 'https://dev.efrete.com.br' }
const cab = (k = ENV.PROXY_CHAVE) => ({ 'x-rbr-proxy-key': k })
const corpo = (o) => JSON.stringify({ metodoHttp: 'POST', caminho: '/services/Logon/Login', corpo: {}, ...o })
const efreteOk = async () => ({ status: 200, corpo: '{"Sucesso":false,"Excecao":{"Mensagem":"Integrador não cadastrado"}}' })

test('sem chave ou com chave errada: 404 genérico, sem chamar a efrete', async () => {
  let chamou = false
  const enc = async () => ((chamou = true), { status: 200, corpo: '' })
  for (const c of [{}, cab('errada'), cab('')]) {
    const r = await tratar({ metodo: 'POST', cabecalhos: c, corpoBruto: corpo() }, ENV, enc)
    assert.deepEqual(r, { status: 404, json: { erro: 'Não encontrado.' } })
  }
  // mesmo com a chave certa, se o proxy não tiver chave configurada, recusa
  const r2 = await tratar({ metodo: 'POST', cabecalhos: cab(), corpoBruto: corpo() }, { ...ENV, PROXY_CHAVE: '' }, enc)
  assert.equal(r2.status, 404)
  assert.equal(chamou, false)
})

test('caminho fora da allowlist: 400', async () => {
  for (const c of ['/services/Admin/Usuarios', '/services/Logon/', '/services/../Logon/Login', 'https://evil.com/services/Logon/Login', '/services/Logon/Login?x=1', '//evil.com/services/Pef/X']) {
    const r = await tratar({ metodo: 'POST', cabecalhos: cab(), corpoBruto: corpo({ caminho: c }) }, ENV, efreteOk)
    assert.equal(r.status, 400, c)
  }
  for (const c of ['/services/Logon/Login', '/services/pef/ConsultaSituacaoTransportador', '/services/MOTORISTAS/Gravar', '/services/proprietarios/X', '/services/veiculos/Y']) {
    assert.equal(caminhoPermitido(c), true, c)
  }
})

test('só POST, corpo até 256 KB, JSON válido e metodoHttp GET/POST', async () => {
  assert.equal((await tratar({ metodo: 'GET', cabecalhos: cab(), corpoBruto: '' }, ENV, efreteOk)).status, 405)
  assert.equal((await tratar({ metodo: 'POST', cabecalhos: cab(), corpoBruto: 'x'.repeat(256 * 1024 + 1) }, ENV, efreteOk)).status, 413)
  assert.equal((await tratar({ metodo: 'POST', cabecalhos: cab(), corpoBruto: '{nao json' }, ENV, efreteOk)).status, 400)
  assert.equal((await tratar({ metodo: 'POST', cabecalhos: cab(), corpoBruto: corpo({ metodoHttp: 'DELETE' }) }, ENV, efreteOk)).status, 400)
  assert.equal((await tratar({ metodo: 'POST', cabecalhos: cab(), corpoBruto: corpo({ corpo: [1] }) }, ENV, efreteOk)).status, 400)
})

test('repasse: host fixo do ambiente, nunca da requisição; devolve status, corpo e duração', async () => {
  let destino
  const enc = async (d) => ((destino = d), { status: 200, corpo: '{"ok":1}' })
  let t = 1000
  const r = await tratar({ metodo: 'POST', cabecalhos: cab(), corpoBruto: corpo({ corpo: { Usuario: 'u' } }) }, ENV, enc, () => (t += 50))
  assert.equal(r.status, 200)
  assert.deepEqual(r.json, { status: 200, corpo: '{"ok":1}', duracaoMs: 50 })
  assert.equal(destino.url.host, 'dev.efrete.com.br')
  assert.equal(destino.url.pathname, '/services/Logon/Login')
  assert.equal(destino.dados, '{"Usuario":"u"}')
  // GET leva os campos na query
  const g = montarDestino('https://dev.efrete.com.br', 'GET', '/services/Pef/X', { A: 1, Veiculos: [{ Placa: 'ABC1D23' }] })
  assert.equal(g.url.search, '?A=1&Veiculos=%5B%7B%22Placa%22%3A%22ABC1D23%22%7D%5D')
  assert.equal(g.dados, null)
})

test('efrete derruba a conexão ou demora: erro estruturado sem detalhe interno', async () => {
  const reset = async () => {
    throw Object.assign(new Error('read ECONNRESET 10.0.0.1:443'), { code: 'ECONNRESET' })
  }
  const r = await tratar({ metodo: 'POST', cabecalhos: cab(), corpoBruto: corpo() }, ENV, reset)
  assert.equal(r.status, 502)
  assert.equal(r.json.codigo, 'EFRETE_CONEXAO')
  assert.ok(!JSON.stringify(r.json).includes('10.0.0.1'))
  const lento = async () => {
    throw Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })
  }
  const t = await tratar({ metodo: 'POST', cabecalhos: cab(), corpoBruto: corpo() }, ENV, lento)
  assert.equal(t.status, 504)
  assert.equal(t.json.codigo, 'EFRETE_TIMEOUT')
})

test('comparação da chave', () => {
  assert.equal(chaveConfere('abc', 'abc'), true)
  assert.equal(chaveConfere('abc', 'abd'), false)
  assert.equal(chaveConfere(undefined, 'abc'), false)
})
