// Prova de renderização do modo de demonstração na aba Fiscal (componente REAL, build com as variáveis de PRODUÇÃO do gestor).
// Sobe o build local (vite preview em http://localhost:4173), troca as chamadas ao Supabase por dados fixos da operação DEMO
// (nada vai à rede real) e confere o que aparece e o que NÃO aparece. Fixa parametros_fiscais.ambiente = 'producao', como no gestor real.
//
// Como rodar (da pasta gestor/):
//   VITE_EFRETE_CIOT_HABILITADO=true VITE_NSPEDAGIO_HABILITADO=true npx vite build
//   npx vite preview --port 4173 --strictPort        (em outro terminal)
//   npm i --no-save playwright && npx playwright install chromium
//   node e2e/prova-modo-demonstracao.cjs             (PW_MODULE=<caminho do playwright> se instalado fora daqui)
// Saída: docs/captura-modo-demonstracao-aba-fiscal.png e código de saída 1 se alguma verificação falhar.

const path = require('path')
const { chromium } = require(process.env.PW_MODULE || 'playwright')

const BASE = process.env.BASE_URL || 'http://localhost:4173'
const OP = '70cdfc53-2911-43d4-adb0-98e12d3cbd3d'
const USER = '11111111-1111-4111-8111-111111111111'
const agora = '2026-11-11T17:00:00+00:00'

const doc = (tipo, status, extra = {}) => ({
  id: `doc-${tipo}`, operacao_id: OP, tipo, status, referencia: null, numero_documento: null, chave_acesso: null, url_pdf: null, emitido_em: null,
  disponivel_para_agenciador: false, mensagem_erro: null, atualizado_em: agora, provedor: null, ambiente: 'homologacao', encerrado_em: null,
  encerramento_origem: null, encerramento_erro: null, exigido: false, dispensa_motivo: 'Operação de teste (eh_teste)', ...extra,
})
const DOCS = [
  doc('cte', 'pendente', { dispensa_motivo: 'Fora do roteiro da demonstração (só CIOT e vale-pedágio)' }),
  doc('mdfe', 'pendente', { dispensa_motivo: 'Fora do roteiro da demonstração (só CIOT e vale-pedágio)' }),
  doc('ciot', 'cancelado', { provedor: 'efrete', numero_documento: '560000618710/0563' }),
  doc('atm', 'pendente'), doc('wialon', 'pendente'), doc('vpo', 'pendente'), doc('gr', 'pendente'), doc('aet', 'pendente'),
]
const operacao = (modo) => ({
  id: OP, cotacao_id: 'cot-1', cliente_id: 'cli-1', status: 'aguardando_liberacao_fiscal', eh_teste: true, modo_demonstracao: modo,
  tipo_documento_cliente: 'cte_mdfe', tipo_documento_aviso: null, veiculo_id: 'v-1', pessoa_alocada_id: 'p-1', numero_vpo: 100008, ncm: '39231090',
  coleta_prevista: '2026-11-20T13:00:00+00:00', entrega_prevista: '2026-11-21T13:00:00+00:00', created_at: agora, updated_at: agora, deleted_at: null,
  entregue_em: null, liberada_em: null, sequencia: 1, bloqueio_fiscal: false,
  clientes: { razao_social: 'RBR CARGO TRANSPORTE DE CARGA E LOGISTICA LTDA', nome_fantasia: 'RBR Cargo' },
  cotacoes: { valor_total: 1, cidade_origem: 'SAO PAULO', uf_origem: 'SP', cidade_destino: 'CAMPINAS', uf_destino: 'SP', nf_chave_acesso: '35261069115969000104550010000009991123456783' },
})
const FIXTURES = (modo) => ({
  pessoas: [
    { id: 'pes-1', auth_user_id: USER, nome: 'Gestor Teste', papel: 'gestor_rbr', status: 'ativo', cpf: null },
    { id: 'p-1', nome: 'TESTE HOMOLOGACAO - MOTORISTA FICTICIO EFRETE (apagar depois)', cpf: '12026102422', cnh_numero_registro: '22026102403', papel: 'condutor' },
    { id: 'tit-1', nome: 'TESTE MASSA ANTT - TRANSPORTADOR EFRETE (apagar depois)', cpf: null, cnpj: '48386492000121', rntrc_numero: '56802388', pix: '48386492000121', papel: 'titular_motorista' },
  ],
  operacoes: [operacao(modo)],
  documentacao_operacao: DOCS,
  parametros_fiscais: [{ ambiente: 'producao', ativo: true, razao_social: 'RBR CARGO TRANSPORTE DE CARGA E LOGISTICA LTDA', cnpj: '69115969000104' }],
  operacao_ciot_vpo: [{ operacao_id: OP, ciot: '560000618710', ciot_verificador: '0563', ciot_status: 'cancelado', ciot_protocolo: '6183548', ciot_emitido_em: agora, ciot_cancelado_em: agora, vpo_idvpo: null, vpo_valor: null, ciot_origem: 'efrete' }],
  cotacoes: [{ id: 'cot-1', cidade_origem: 'SAO PAULO', uf_origem: 'SP', cidade_destino: 'CAMPINAS', uf_destino: 'SP', ibge_origem: '3550308', ibge_destino: '3509502', distancia_km: 100, peso_bruto_kg: 1000, ncms_produtos: ['39231090'] }],
  condicoes_pagamento_operacao: [{ valor_total_contrato: 8000, valor_adiantamento: 3000 }],
  veiculos: [{ id: 'v-1', placa: 'RQW4D58', quantidade_eixos: 3, titular_id: 'tit-1' }],
  operacao_reboques: [{ ordem: 1, veiculos: { placa: 'RRD5B39', quantidade_eixos: 3 } }],
})
const FUNCOES = {
  'efrete-ciot-operacao': (b) =>
    b.acao === 'status'
      ? { ok: true, ambiente: 'homologacao', pedido: { id: 'ped-1', status: 'cancelado', ciot: '560000618710', ciot_verificador: '0563', protocolo: '6183548', valor_frete: 8000, piso_minimo: 1407.4, cancelado_em: agora, cancelamento_protocolo: 'C16000000131816', confirmado_por_nome: 'Ensaio automatizado (Claude), homologação', confirmado_em: agora, data_inicio_viagem: '2026-11-20T13:00:00+00:00' }, pagamentos: [] }
      : { ok: true, ambiente: 'homologacao', piso: { ok: true, piso: 1407.4, tabela: 'A', tipoCarga: 'Carga Geral', eixos: 6, distanciaKm: 100 }, bloqueios: [], avisos: [], pedido: { referencia: 'RBR-HML-OP-70CDFC532911', frete: 8000, pagamentos: [{ categoria: 'Adiantamento', valor: 3000, liberacao: '2026-11-20T10:00:00' }, { categoria: 'Quitacao', valor: 5000, liberacao: '2026-11-21T10:00:00' }], pix: 'CpfOuCnpj', placas: ['RQW4D58', 'RRD5B39'], notas: 1, pesoKg: 1000, ncm: '3923', distanciaKm: 100 } },
  'nspedagio-vpo': () => ({ ok: true, simulado: false, ambiente: 'homologacao', dados: [] }),
}

async function rodar(browser, modo, captura, largura = 1366, altura = 768) {
  const ctx = await browser.newContext({ viewport: { width: largura, height: altura } })
  const exp = Math.floor(Date.now() / 1000) + 86400
  const jwt = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: USER, role: 'authenticated', exp })).toString('base64url')}.assinatura`
  const sessao = { access_token: jwt, refresh_token: 'r', expires_in: 86400, expires_at: exp, token_type: 'bearer', user: { id: USER, aud: 'authenticated', email: 'gestor@teste', app_metadata: {}, user_metadata: {} } }
  await ctx.addInitScript((s) => { try { localStorage.setItem('sb-kwscmegsfbtvlnyxougt-auth-token', JSON.stringify(s)) } catch { /* sem storage */ } }, sessao)
  const fx = FIXTURES(modo)
  await ctx.route(/supabase\.co\//, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const json = (corpo, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(corpo) })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } })
    if (url.pathname.startsWith('/auth/v1/user')) return json(sessao.user)
    if (url.pathname.startsWith('/auth/v1/')) return json(sessao)
    if (url.pathname.startsWith('/functions/v1/')) {
      const nome = url.pathname.split('/').pop()
      const corpo = JSON.parse(req.postData() || '{}')
      return json(FUNCOES[nome] ? FUNCOES[nome](corpo) : { ok: true })
    }
    if (url.pathname.startsWith('/rest/v1/rpc/')) return json(null)
    if (url.pathname.startsWith('/rest/v1/')) {
      const tabela = url.pathname.split('/').pop()
      // filtros simples do PostgREST (coluna=eq.valor), para devolver a linha certa de cada tabela
      let linhas = fx[tabela] ?? []
      for (const [coluna, valor] of url.searchParams) {
        if (typeof valor === 'string' && valor.startsWith('eq.') && (coluna === 'id' || coluna === 'auth_user_id')) linhas = linhas.filter((l) => String(l[coluna]) === valor.slice(3))
      }
      if ((req.headers()['accept'] ?? '').includes('vnd.pgrst.object')) {
        return linhas.length ? json(linhas[0]) : json({ code: 'PGRST116', details: null, hint: null, message: 'sem linhas' }, 406)
      }
      return json(linhas)
    }
    return json({})
  })
  const pagina = await ctx.newPage()
  const erros = []
  pagina.on('pageerror', (e) => erros.push(String(e)))
  await pagina.goto(`${BASE}/fiscal?op=${OP}`, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(1500)
  // innerText respeita o CSS (text-transform: uppercase); compara sem diferenciar maiúsculas
  let texto = (await pagina.evaluate(() => document.body.innerText)).toLowerCase().replace(/ /g, ' ')
  // Vale e CIOT agora são abas: lê também o texto do quadro do CIOT e volta para o vale antes das capturas.
  if (await pagina.locator('#aba-demo-ciot').count()) {
    await pagina.locator('#aba-demo-ciot').click()
    await pagina.waitForTimeout(2000)
    texto += '\n' + (await pagina.evaluate(() => document.body.innerText)).toLowerCase().replace(/ /g, ' ')
    await pagina.locator('#aba-demo-vpo').click()
    await pagina.waitForTimeout(400)
  }
  if (captura) await pagina.screenshot({ path: captura, fullPage: true })
  // O painel da operação rola por dentro: mede o maior contêiner rolável e tira uma segunda captura no fim dele.
  const medida = await pagina.evaluate(() => {
    let melhor = null
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el)
      if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight && (!melhor || el.scrollHeight > melhor.scrollHeight)) melhor = el
    }
    return melhor ? { total: melhor.scrollHeight, visivel: melhor.clientHeight } : { total: document.documentElement.scrollHeight, visivel: window.innerHeight }
  })
  if (captura) {
    await pagina.evaluate(() => {
      let melhor = null
      for (const el of document.querySelectorAll('*')) {
        const cs = getComputedStyle(el)
        if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight && (!melhor || el.scrollHeight > melhor.scrollHeight)) melhor = el
      }
      if (melhor) melhor.scrollTop = melhor.scrollHeight
    })
    await pagina.waitForTimeout(400)
    await pagina.screenshot({ path: captura.replace('.png', '-fim.png') })
  }
  // Rolagem horizontal: em qualquer contêiner rolável e na página; "De onde vem" inteiro (etiquetas dentro da caixa do cartão)
  const geometria = await pagina.evaluate(() => {
    const horizontais = []
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el)
      if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1) horizontais.push(el.tagName + '.' + String(el.className).slice(0, 40))
    }
    const cortadas = []
    for (const td of document.querySelectorAll('td')) {
      if (!td.classList.contains('text-right')) continue
      const caixa = td.closest('section')?.getBoundingClientRect()
      const r = td.getBoundingClientRect()
      if (caixa && (r.right > caixa.right + 1 || td.scrollWidth > td.clientWidth + 1)) cortadas.push(td.innerText)
    }
    // o cabeçalho do modal NÃO fica fixo: depois de rolar o painel, o topo dele sai da tela
    let cabecalhoSticky = null
    const rotulo = Array.from(document.querySelectorAll('div')).find((d) => d.children.length && /^OP-/.test(d.innerText.trim()))
    if (rotulo) {
      let el = rotulo
      while (el && el !== document.body) {
        if (getComputedStyle(el).position === 'sticky') { cabecalhoSticky = true; break }
        el = el.parentElement
      }
      cabecalhoSticky = cabecalhoSticky === true
    }
    return { paginaLarga: document.documentElement.scrollWidth > window.innerWidth + 1, horizontais, cortadas, cabecalhoSticky }
  })
  await ctx.close()
  return { texto, erros, medida, geometria }
}

const AUSENTES = ['apagar depois', 'TESTE MASSA', 'TESTE HOMOLOGACAO', 'Ensaio automatizado', 'NÃO SIMULADO', 'não simulado', 'SIMULADO, não é real', 'window.confirm', 'Desfazer e prazos', 'Troca de motorista', 'DOCUMENTOS REAIS NA SEFAZ', 'Emitir NF-e de teste', 'Finalizar viagem', 'Emitir CT-e', 'Emitir MDF-e', 'Cancelar tudo do teste', 'Esteira de emissão']
const PRESENTES = ['Tentativas anteriores (1)', 'Ainda sem simulação', 'Fiscal (tabela ANTT)', 'R$ 1.407,40', 'a emitir', 'cancelado em', 'Baixar recibo (PDF)', 'TRANSPORTADOR EFRETE', 'MOTORISTA FICTICIO EFRETE', 'De onde vem', 'Fora desta demonstração', 'Dado enviado', '1. Vale-pedágio (NSPEDAGIO)', '2. CIOT (efrete)', '0 de 2', 'Demonstração em homologação: CIOT (efrete) e Vale-pedágio (NSPEDAGIO)', 'Dados do sistema']

;(async () => {
  const browser = await chromium.launch()
  let falhas = 0
  const confere = (ok, msg) => { console.log(`${ok ? 'OK    ' : 'FALHOU'} ${msg}`); if (!ok) falhas++ }

  const demo = await rodar(browser, true, path.join(__dirname, '..', '..', 'docs', 'captura-modo-demonstracao-aba-fiscal.png'))
  if (process.env.DEPURAR) console.log('ERROS', demo.erros, 'TEXTO', demo.texto.slice(0, 700))
  for (const t of AUSENTES) confere(!demo.texto.includes(t.toLowerCase()), `modo ligado: NÃO aparece "${t}"`)
  for (const t of PRESENTES) confere(demo.texto.includes(t.toLowerCase()), `modo ligado: aparece "${t}"`)
  confere(!demo.geometria.paginaLarga && demo.geometria.horizontais.length === 0, `modo ligado 1366x768: sem rolagem horizontal${demo.geometria.horizontais.length ? ' -> ' + demo.geometria.horizontais.join(', ') : ''}`)
  confere(demo.geometria.cortadas.length === 0, `modo ligado 1366x768: coluna "De onde vem" inteira${demo.geometria.cortadas.length ? ' -> cortada: ' + demo.geometria.cortadas.join(' | ') : ''}`)
  confere(demo.geometria.cabecalhoSticky === false, 'modo ligado: o cabeçalho do modal não é fixo (rola junto)')
  const grande = await rodar(browser, true, path.join(__dirname, '..', '..', 'docs', 'captura-modo-demonstracao-1920.png'), 1920, 1080)
  confere(!grande.geometria.paginaLarga && grande.geometria.horizontais.length === 0 && grande.geometria.cortadas.length === 0, 'modo ligado 1920x1080: sem rolagem horizontal e "De onde vem" inteira')
  const telas = demo.medida.total / demo.medida.visivel
  console.log(`INFO   painel com ${demo.medida.total}px de conteúdo para ${demo.medida.visivel}px visíveis = ${telas.toFixed(1)} telas a 1366x768`)
  confere(telas <= 3, 'modo ligado: o conteúdo cabe em no máximo 3 telas (duas rolagens)')
  confere(demo.erros.length === 0, `modo ligado: sem erro de JavaScript${demo.erros.length ? ' -> ' + demo.erros[0] : ''}`)

  // Controle: com a marca desligada a tela antiga continua igual (prova que o teste discrimina e que operação comum não muda).
  const comum = await rodar(browser, false, null)
  confere(comum.geometria.cabecalhoSticky === false, 'modo desligado: o cabeçalho do modal também não é fixo (vale para o modal inteiro)')
  confere(comum.texto.includes('desfazer e prazos') && comum.texto.includes('troca de motorista'), 'modo desligado: a tela antiga continua aparecendo')
  confere(!comum.texto.includes('fora desta demonstração'), 'modo desligado: nada do modo de demonstração aparece')

  await browser.close()
  console.log(falhas ? `\n${falhas} verificação(ões) falharam` : '\nTodas as verificações passaram')
  process.exit(falhas ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
