// node --test vercel/efrete-proxy/efrete.test.js   (sem rede: o envio à efrete é simulado)
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { tratar, caminhoPermitido, chaveConfere, montarDestino, cabecalhosEnvio, lerCorpo } = require('./api/efrete.js')

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

test('codificacao ascii: acentos viram \\uXXXX e o JSON continua igual depois de lido', () => {
  const corpo = { Nome: 'José da Conceição', Rua: 'Rua Fictícia' }
  const { dados } = montarDestino('https://dev.efrete.com.br', 'POST', '/services/motoristas/gravar', corpo, 'ascii')
  assert.ok(/^[\x00-\x7f]*$/.test(dados))
  assert.ok(dados.includes('Jos\\u00e9'))
  assert.deepEqual(JSON.parse(dados), corpo)
  const utf8 = montarDestino('https://dev.efrete.com.br', 'POST', '/services/motoristas/gravar', corpo).dados
  assert.ok(utf8.includes('José'))
})

test('codificacao inválida é recusada', async () => {
  const r = await tratar(
    { metodo: 'POST', cabecalhos: { 'x-rbr-proxy-key': 'k' }, corpoBruto: JSON.stringify({ metodoHttp: 'POST', caminho: '/services/motoristas/gravar', corpo: {}, codificacao: 'latin1' }) },
    { PROXY_CHAVE: 'k', EFRETE_BASE_URL: 'https://dev.efrete.com.br' },
    async () => ({ status: 200, corpo: '{}' }),
  )
  assert.equal(r.status, 400)
})

// Acentos (passo 4, item 3): "Rua Fictícia" voltou da efrete como "RUA FICT??CIA". O corpo que sai do proxy tem de
// estar em UTF-8 com o charset declarado (ou só ASCII, com \uXXXX). Nome de pessoa nunca é alterado pelo proxy.
const COM_ACENTO = { Nome: 'João Conceição', Endereco: { Rua: 'Rua São José', Bairro: 'Centro' } }

test('acentos: o corpo enviado à efrete leva "João Conceição" e "Rua São José" em UTF-8, com charset e tamanho em bytes', async () => {
  let destino
  const enc = async (d) => ((destino = d), { status: 200, corpo: '{}' })
  const r = await tratar({ metodo: 'POST', cabecalhos: cab(), corpoBruto: corpo({ caminho: '/services/motoristas/Gravar', corpo: COM_ACENTO }) }, ENV, enc)
  assert.equal(r.status, 200)
  assert.equal(destino.dados, '{"Nome":"João Conceição","Endereco":{"Rua":"Rua São José","Bairro":"Centro"}}')
  const bytes = Buffer.from(destino.dados, 'utf8')
  // "ã" = C3 A3 e "é" = C3 A9 em UTF-8 (em Latin-1 seriam E3 e E9, que a efrete leria como "??").
  assert.ok(bytes.includes(Buffer.from([0xc3, 0xa3])))
  assert.ok(bytes.includes(Buffer.from([0xc3, 0xa9])))
  assert.deepEqual(JSON.parse(bytes.toString('utf8')), COM_ACENTO)
  const h = cabecalhosEnvio(destino.dados)
  assert.equal(h['Content-Type'], 'application/json; charset=utf-8')
  assert.equal(h['Content-Length'], bytes.length)
  assert.equal(h['Content-Length'] - destino.dados.length, 5) // 5 letras acentuadas = 5 bytes a mais
})

test('acentos com codificacao ascii: só ASCII no fio, o JSON lido volta igual (nome intacto)', async () => {
  let destino
  const enc = async (d) => ((destino = d), { status: 200, corpo: '{}' })
  await tratar({ metodo: 'POST', cabecalhos: cab(), corpoBruto: corpo({ caminho: '/services/motoristas/Gravar', corpo: COM_ACENTO, codificacao: 'ascii' }) }, ENV, enc)
  assert.equal(destino.dados, '{"Nome":"Jo\\u00e3o Concei\\u00e7\\u00e3o","Endereco":{"Rua":"Rua S\\u00e3o Jos\\u00e9","Bairro":"Centro"}}')
  assert.ok(/^[\x00-\x7f]*$/.test(destino.dados))
  assert.equal(cabecalhosEnvio(destino.dados)['Content-Length'], destino.dados.length)
  assert.deepEqual(JSON.parse(destino.dados), COM_ACENTO)
})

test('acentos na entrada: "ã" partido entre dois pedaços da requisição não vira "??"', async () => {
  const bruto = Buffer.from(JSON.stringify({ metodoHttp: 'POST', caminho: '/services/motoristas/Gravar', corpo: COM_ACENTO }), 'utf8')
  const meio = bruto.indexOf(Buffer.from([0xc3, 0xa3])) + 1 // corta entre C3 e A3
  const req = new EventEmitter()
  const lido = lerCorpo(req)
  req.emit('data', bruto.subarray(0, meio))
  req.emit('data', bruto.subarray(meio))
  req.emit('end')
  assert.deepEqual(JSON.parse(await lido).corpo, COM_ACENTO)
})
