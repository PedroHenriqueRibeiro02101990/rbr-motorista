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


// ---- Prova das ABAS Vale-pedágio / CIOT (componente real, build local, Supabase trocado por dados fixos) ----
// Como rodar (da pasta gestor/): ver o cabeçalho de prova-modo-demonstracao.cjs; depois: node e2e/prova-abas-demo.cjs
// Saída: prints docs/capturas/abas-demo-vpo-1366x768.png e abas-demo-ciot-1366x768.png; código 1 se algo falhar.

const PASTA_PRINTS = path.join(__dirname, '..', '..', 'docs', 'capturas')

const reqCompra = [
  { id: 'r1', acao: 'simular', ambiente: 'homologacao', http_status: 200, id_vpo_antt: null, numero_viagem: null, id_recibo: null, total_viagem: null, erro: null, criado_em: '2026-11-12T14:00:00Z', situacao: 'concluida', processando_desde: null },
  { id: 'r2', acao: 'comprar', ambiente: 'homologacao', http_status: 200, id_vpo_antt: '00043134980188081131', numero_viagem: '530338', id_recibo: 'rec1', total_viagem: 143.2, erro: null, criado_em: '2026-11-12T14:05:00Z', situacao: 'concluida', processando_desde: null },
]

async function abrir(browser, { cenario, nonDemo = false, hash = '', largura = 1366, altura = 768, antes } ) {
  const ctx = await browser.newContext({ viewport: { width: largura, height: altura } })
  const exp = Math.floor(Date.now() / 1000) + 86400
  const jwt = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: USER, role: 'authenticated', exp })).toString('base64url')}.assinatura`
  const sessao = { access_token: jwt, refresh_token: 'r', expires_in: 86400, expires_at: exp, token_type: 'bearer', user: { id: USER, aud: 'authenticated', email: 'gestor@teste', app_metadata: {}, user_metadata: {} } }
  await ctx.addInitScript((s) => { try { localStorage.setItem('sb-kwscmegsfbtvlnyxougt-auth-token', JSON.stringify(s)) } catch { /* sem storage */ } }, sessao)
  const fx = FIXTURES(!nonDemo)
  if (cenario === 'inicio') {
    fx.operacao_ciot_vpo = [{ operacao_id: OP, ciot: null, ciot_verificador: null, ciot_status: null, ciot_protocolo: null, ciot_emitido_em: null, ciot_cancelado_em: null, vpo_idvpo: null, vpo_valor: null, ciot_origem: null }]
    fx.vpo_requisicoes = []
  } else {
    fx.operacao_ciot_vpo = [{ operacao_id: OP, ciot: null, ciot_verificador: null, ciot_status: null, ciot_protocolo: null, ciot_emitido_em: null, ciot_cancelado_em: null, vpo_idvpo: '00043134980188081131', vpo_valor: 143.2, ciot_origem: null }]
    fx.vpo_requisicoes = reqCompra
  }
  fx.documentacao_operacao = DOCS_FIX_INICIO
  const statusCiot = null
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
      if (nome === 'efrete-ciot-operacao') {
        return json(corpo.acao === 'status' ? { ok: true, ambiente: 'homologacao', pedido: null, pagamentos: [] } : FUNCOES['efrete-ciot-operacao'](corpo))
      }
      return json(FUNCOES[nome] ? FUNCOES[nome](corpo) : { ok: true })
    }
    if (url.pathname.startsWith('/rest/v1/rpc/')) return json(null)
    if (url.pathname.startsWith('/rest/v1/')) {
      const tabela = url.pathname.split('/').pop()
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
  await pagina.goto(`${BASE}/fiscal?op=${OP}${hash}`, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(1200)
  if (antes) await antes(pagina)
  return { ctx, pagina, erros, statusCiot }
}

const DOCS_FIX_INICIO = FIXTURES(true).documentacao_operacao.map((d) => (d.tipo === 'ciot' ? { ...d, status: 'pendente', numero_documento: null } : d))

const textoPagina = async (pagina) => (await pagina.evaluate(() => document.body.innerText)).toLowerCase()
const abaSel = (pagina) => pagina.evaluate(() => document.querySelector('[role=tab][aria-selected=true]')?.id ?? null)
const alturas = (pagina) =>
  pagina.evaluate(() => {
    const painel = document.getElementById('painel-demo')
    const grade = painel?.querySelector('[data-aba]')
    if (!grade) return null
    const cartoes = Array.from(grade.children).map((c) => Math.round(c.getBoundingClientRect().height))
    return { cartoes, aba: grade.getAttribute('data-aba'), horizontal: document.documentElement.scrollWidth > window.innerWidth + 1 }
  })

;(async () => {
  const browser = await chromium.launch()
  let falhas = 0
  const confere = (ok, msg) => { console.log(`${ok ? 'OK    ' : 'FALHOU'} ${msg}`); if (!ok) falhas++ }
  require('fs').mkdirSync(PASTA_PRINTS, { recursive: true })

  // 1) Início: vale selecionado, só um quadro, CIOT acessível sem vale.
  {
    const { ctx, pagina, erros } = await abrir(browser, { cenario: 'inicio' })
    confere((await abaSel(pagina)) === 'aba-demo-vpo', 'abre com o Vale-pedágio selecionado')
    confere((await pagina.locator('[data-aba]').count()) === 1, 'só um quadro renderizado (vale)')
    confere((await pagina.locator('[data-aba=ciot]').count()) === 0, 'o quadro do CIOT NÃO está renderizado')
    confere((await pagina.locator('[role=tab]').count()) === 2, 'só 2 abas clicáveis (CT-e, Averbação e MDF-e ficam sem clique)')
    confere((await pagina.locator('[data-faixa=proximo-passo]').count()) === 0, 'sem faixa verde quando o vale não foi comprado')
    const t = await textoPagina(pagina)
    confere(t.includes('fora desta demonstração') && t.includes('0 de 2'), 'esteira: três caixas fora da demo e contador 0 de 2')
    const a1 = await alturas(pagina)
    confere(!!a1 && a1.cartoes.length === 2 && Math.abs(a1.cartoes[0] - a1.cartoes[1]) <= 1, `vale: os dois cartões têm a mesma altura (${a1?.cartoes})`)
    confere(!!a1 && !a1.horizontal, 'vale: sem rolagem horizontal')
    await pagina.screenshot({ path: path.join(PASTA_PRINTS, 'abas-demo-vpo-1366x768.png') })
    await pagina.locator('#aba-demo-ciot').click()
    await pagina.waitForTimeout(800)
    confere((await abaSel(pagina)) === 'aba-demo-ciot', 'clicar no CIOT alterna (CIOT abre sem ter comprado o vale)')
    confere((await pagina.locator('[data-aba=ciot]').count()) === 1 && (await pagina.locator('[data-aba=vpo]').count()) === 0, 'CIOT: só o quadro do CIOT existe')
    const a2 = await alturas(pagina)
    confere(!!a2 && a2.cartoes.length === 2 && Math.abs(a2.cartoes[0] - a2.cartoes[1]) <= 1, `CIOT: os dois cartões têm a mesma altura (${a2?.cartoes})`)
    confere(!!a2 && !a2.horizontal, 'CIOT: sem rolagem horizontal')
    confere((await pagina.evaluate(() => location.hash)) === '#ciot', 'hash da URL acompanha a aba (#ciot)')
    await pagina.screenshot({ path: path.join(PASTA_PRINTS, 'abas-demo-ciot-1366x768.png') })
    // teclado: Tab chega à aba e Enter/Espaço ativam
    await pagina.locator('#aba-demo-vpo').focus()
    await pagina.keyboard.press('Enter')
    await pagina.waitForTimeout(400)
    confere((await abaSel(pagina)) === 'aba-demo-vpo', 'Enter na aba do vale a seleciona')
    await pagina.locator('#aba-demo-ciot').focus()
    await pagina.keyboard.press('Space')
    await pagina.waitForTimeout(400)
    confere((await abaSel(pagina)) === 'aba-demo-ciot', 'Espaço na aba do CIOT a seleciona')
    // F5: lembra a aba
    await pagina.reload({ waitUntil: 'networkidle' })
    await pagina.waitForTimeout(1000)
    confere((await abaSel(pagina)) === 'aba-demo-ciot', 'depois do F5 a aba do CIOT continua')
    confere(erros.length === 0, `sem erro de JavaScript${erros.length ? ' -> ' + erros[0] : ''}`)
    await ctx.close()
  }

  // 2) Vale comprado e CIOT não emitido: faixa verde, botão Continuar e anel dourado no CIOT.
  {
    const { ctx, pagina } = await abrir(browser, { cenario: 'comprado', hash: '#vpo' })
    confere((await pagina.locator('[data-faixa=proximo-passo]').count()) === 1, 'vale comprado + CIOT a emitir: faixa verde aparece')
    const t = await textoPagina(pagina)
    confere(t.includes('comprado · r$') && t.includes('1 de 2'), 'esteira mostra "Comprado · R$ valor" e 1 de 2 concluídas')
    confere((await pagina.locator('#aba-demo-ciot[data-proximo=true]').count()) === 1, 'o botão do CIOT ganha o anel dourado')
    await pagina.getByRole('button', { name: /Continuar para o CIOT/ }).click()
    await pagina.waitForTimeout(600)
    confere((await abaSel(pagina)) === 'aba-demo-ciot', '"Continuar para o CIOT" troca para a aba do CIOT')
    confere((await pagina.locator('[data-faixa=proximo-passo]').count()) === 0, 'a faixa some fora da aba do vale')
    await ctx.close()
  }

  // 3) Operação que não é demonstração: sem abas.
  {
    const { ctx, pagina } = await abrir(browser, { cenario: 'inicio', nonDemo: true })
    confere((await pagina.locator('[role=tab]').count()) === 0, 'operação comum: sem abas')
    confere(!(await textoPagina(pagina)).includes('fora desta demonstração'), 'operação comum: nada do modo de demonstração')
    await ctx.close()
  }

  await browser.close()
  console.log(falhas ? `\n${falhas} verificação(ões) falharam` : '\nTodas as verificações passaram')
  process.exit(falhas ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
