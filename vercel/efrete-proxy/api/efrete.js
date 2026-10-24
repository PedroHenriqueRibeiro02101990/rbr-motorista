// Proxy efrete (Vercel, região iad1): única peça que fala com a efrete. A efrete derruba conexões vindas do Supabase,
// mas aceita as da Vercel (sonda de 24/10). O proxy NÃO guarda credencial da efrete: o Supabase manda o corpo pronto
// (Usuario/Senha/Integrador/Token) e o proxy só repassa ao host fixo EFRETE_BASE_URL.
// Proteção: segredo compartilhado no cabeçalho x-rbr-proxy-key (PROXY_CHAVE), comparado em tempo constante; sem chave
// certa => 404 genérico. Só POST; corpo até 256 KB; allowlist de caminhos; nunca loga corpo, cabeçalho nem resposta.
// Testes: vercel/efrete-proxy/efrete.test.js (node --test).
const https = require('node:https')
const crypto = require('node:crypto')

const LIMITE_BYTES = 256 * 1024
const TIMEOUT_MS = 25_000
const PERMITIDOS = ['/services/logon/', '/services/pef/', '/services/motoristas/', '/services/proprietarios/', '/services/veiculos/']

function chaveConfere(recebida, esperada) {
  if (typeof recebida !== 'string' || typeof esperada !== 'string' || !recebida || !esperada) return false
  const a = crypto.createHash('sha256').update(recebida).digest()
  const b = crypto.createHash('sha256').update(esperada).digest()
  return crypto.timingSafeEqual(a, b)
}

function caminhoPermitido(c) {
  if (typeof c !== 'string' || c.length > 200) return false
  if (!/^\/services\/[A-Za-z0-9_\-/]+$/.test(c)) return false // sem query, sem "..", sem host
  if (c.includes('//') || c.includes('..')) return false
  const minusc = c.toLowerCase()
  return PERMITIDOS.some((p) => minusc.startsWith(p) && minusc.length > p.length)
}

// JSON só com ASCII: acentos viram \uXXXX (a efrete devolveu "??" para "í" mandado em UTF-8 cru, 24/10).
function jsonAscii(obj) {
  return JSON.stringify(obj).replace(/[\u007f-\uffff]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))
}

// Monta a requisição para a efrete. GET: campos na query (listas/objetos em JSON); POST: JSON no corpo (UTF-8; com
// codificacao 'ascii', acentos escapados).
function montarDestino(baseUrl, metodoHttp, caminho, corpo, codificacao) {
  const base = new URL(baseUrl)
  const url = new URL(caminho, `${base.protocol}//${base.host}`)
  let dados = null
  if (metodoHttp === 'GET') {
    for (const [k, v] of Object.entries(corpo || {})) {
      if (v === undefined || v === null) continue
      url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v))
    }
  } else {
    dados = codificacao === 'ascii' ? jsonAscii(corpo || {}) : JSON.stringify(corpo || {})
  }
  return { url, dados }
}

// Cabeçalhos do envio: corpo sempre em UTF-8, com o charset declarado e o tamanho em BYTES (acento ocupa 2).
function cabecalhosEnvio(dados) {
  return dados
    ? { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(dados, 'utf8'), Accept: 'application/json' }
    : { Accept: 'application/json' }
}

// Envia à efrete por HTTP/1.1 (módulo https do Node) e devolve {status, corpo} ou lança erro com .code.
function encaminharHttps({ url, metodoHttp, dados }) {
  return new Promise((ok, falha) => {
    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: metodoHttp,
        headers: cabecalhosEnvio(dados),
        timeout: TIMEOUT_MS,
      },
      (res) => {
        let t = ''
        res.setEncoding('utf8')
        res.on('data', (c) => {
          t += c
          if (t.length > 2 * LIMITE_BYTES) req.destroy(Object.assign(new Error('resposta grande demais'), { code: 'RESPOSTA_GRANDE' }))
        })
        res.on('end', () => ok({ status: res.statusCode || 0, corpo: t }))
      },
    )
    req.on('timeout', () => req.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })))
    req.on('error', falha)
    if (dados) req.write(dados, 'utf8')
    req.end()
  })
}

const naoEncontrado = { status: 404, json: { erro: 'Não encontrado.' } }

// Lógica pura (testável): recebe método, cabeçalhos e corpo bruto; devolve {status, json}.
async function tratar({ metodo, cabecalhos, corpoBruto }, env, encaminhar = encaminharHttps, agora = Date.now) {
  const chave = cabecalhos['x-rbr-proxy-key']
  if (!chaveConfere(Array.isArray(chave) ? chave[0] : chave, env.PROXY_CHAVE)) return naoEncontrado
  if (metodo !== 'POST') return { status: 405, json: { erro: 'Use POST.' } }
  if (!env.EFRETE_BASE_URL) return { status: 500, json: { erro: 'Proxy sem destino configurado.' } }
  if (Buffer.byteLength(corpoBruto || '') > LIMITE_BYTES) return { status: 413, json: { erro: 'Corpo maior que 256 KB.' } }
  let pedido
  try {
    pedido = JSON.parse(corpoBruto || '')
  } catch {
    return { status: 400, json: { erro: 'Corpo não é JSON.' } }
  }
  const metodoHttp = pedido && pedido.metodoHttp
  if (metodoHttp !== 'GET' && metodoHttp !== 'POST') return { status: 400, json: { erro: 'metodoHttp deve ser GET ou POST.' } }
  if (!caminhoPermitido(pedido.caminho)) return { status: 400, json: { erro: 'Caminho não permitido.' } }
  if (pedido.corpo !== undefined && (typeof pedido.corpo !== 'object' || pedido.corpo === null || Array.isArray(pedido.corpo))) {
    return { status: 400, json: { erro: 'corpo deve ser um objeto JSON.' } }
  }
  if (pedido.codificacao !== undefined && pedido.codificacao !== 'utf8' && pedido.codificacao !== 'ascii') {
    return { status: 400, json: { erro: "codificacao deve ser 'utf8' ou 'ascii'." } }
  }
  const { url, dados } = montarDestino(env.EFRETE_BASE_URL, metodoHttp, pedido.caminho, pedido.corpo, pedido.codificacao)
  const inicio = agora()
  try {
    const r = await encaminhar({ url, metodoHttp, dados })
    return { status: 200, json: { status: r.status, corpo: r.corpo, duracaoMs: agora() - inicio }, log: { metodoHttp, caminho: pedido.caminho, statusEfrete: r.status } }
  } catch (e) {
    const codigo = e && e.code === 'ETIMEDOUT' ? 'EFRETE_TIMEOUT' : 'EFRETE_CONEXAO'
    return {
      status: codigo === 'EFRETE_TIMEOUT' ? 504 : 502,
      json: { erro: codigo === 'EFRETE_TIMEOUT' ? 'A efrete não respondeu a tempo.' : 'A efrete fechou a conexão.', codigo, duracaoMs: agora() - inicio },
      log: { metodoHttp, caminho: pedido.caminho, statusEfrete: codigo },
    }
  }
}

function lerCorpo(req) {
  return new Promise((ok, falha) => {
    if (typeof req.body === 'string') return ok(req.body)
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return ok(JSON.stringify(req.body))
    if (Buffer.isBuffer(req.body)) return ok(req.body.toString('utf8'))
    // Junta os pedaços em bytes antes de decodificar: um acento (2 bytes em UTF-8) pode cair entre dois pedaços.
    const partes = []
    let tam = 0
    req.on('data', (c) => {
      tam += c.length
      if (tam > LIMITE_BYTES + 1) {
        req.destroy()
        return ok('x'.repeat(LIMITE_BYTES + 1))
      }
      partes.push(Buffer.isBuffer(c) ? c : Buffer.from(c))
    })
    req.on('end', () => ok(Buffer.concat(partes).toString('utf8')))
    req.on('error', falha)
  })
}

async function handler(req, res) {
  const inicio = Date.now()
  let r
  try {
    const corpoBruto = req.method === 'POST' ? await lerCorpo(req) : ''
    r = await tratar({ metodo: req.method, cabecalhos: req.headers || {}, corpoBruto }, process.env)
  } catch {
    r = { status: 500, json: { erro: 'Erro no proxy.' } }
  }
  // Só método, caminho, status e duração. Nunca corpo, cabeçalhos ou resposta.
  if (r.log) console.log(`[efrete-proxy] ${r.log.metodoHttp} ${r.log.caminho} -> ${r.log.statusEfrete} ${Date.now() - inicio}ms`)
  res.statusCode = r.status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(r.json))
}

module.exports = handler
module.exports.tratar = tratar
module.exports.caminhoPermitido = caminhoPermitido
module.exports.chaveConfere = chaveConfere
module.exports.montarDestino = montarDestino
module.exports.cabecalhosEnvio = cabecalhosEnvio
module.exports.lerCorpo = lerCorpo
