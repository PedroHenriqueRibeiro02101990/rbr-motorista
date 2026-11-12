// Prova de renderização do seletor de fornecedor (CIOT e vale-pedágio) e do texto do fornecedor na esteira/pré-voo. Dados de exemplo, nada vai à rede real.
// Build com a flag:  VITE_SELETOR_FORNECEDOR=true VITE_EFRETE_CIOT_HABILITADO=true VITE_NSPEDAGIO_HABILITADO=true npx vite build  (sem a flag: FLAG=desligada node e2e/prova-seletor-fornecedor.cjs)
// vite preview --port 4173 --strictPort (outro terminal); PW_MODULE=<caminho do playwright>; node e2e/prova-seletor-fornecedor.cjs
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

// ---- Cenários do seletor de fornecedor (dados de exemplo; nada vai à rede real) ----
const CATALOGO = [
  { id: 'nstech', nome: 'NSTech', capacidades: ['ciot', 'vpo'], ativo: true, disponivel_emissao: true, ordem: 10, padrao_ciot: true, padrao_vpo: true },
  { id: 'repom', nome: 'Repom', capacidades: ['ciot', 'vpo'], ativo: true, disponivel_emissao: false, ordem: 20, padrao_ciot: false, padrao_vpo: false },
]

async function cenario(browser, { nome, demo, emitido, papel = 'gestor_rbr' }, captura) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } })
  const exp = Math.floor(Date.now() / 1000) + 86400
  const jwt = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: USER, role: 'authenticated', exp })).toString('base64url')}.assinatura`
  const sessao = { access_token: jwt, refresh_token: 'r', expires_in: 86400, expires_at: exp, token_type: 'bearer', user: { id: USER, aud: 'authenticated', email: 'gestor@teste', app_metadata: {}, user_metadata: {} } }
  await ctx.addInitScript((s) => { try { localStorage.setItem('sb-kwscmegsfbtvlnyxougt-auth-token', JSON.stringify(s)) } catch { /* sem storage */ } }, sessao)
  const fx = FIXTURES(demo)
  fx.fornecedores_fiscais = CATALOGO
  fx.pessoas[0].papel = papel
  fx.documentacao_operacao = DOCS.map((d) => (d.tipo === 'ciot' ? { ...d, status: emitido ? 'emitido' : 'pendente' } : d))
  fx.operacao_ciot_vpo = [{ operacao_id: OP, ciot: emitido ? '560000618710' : null, ciot_verificador: emitido ? '0563' : null, ciot_status: emitido ? 'emitido' : null, vpo_idvpo: emitido ? '669' : null, vpo_valor: emitido ? 140.64 : null, ciot_fornecedor: null, vpo_fornecedor: null, fornecedor_escolhido_em: null }]
  const funcoes = { ...FUNCOES, 'efrete-ciot-operacao': () => ({ ok: true, ambiente: 'homologacao', pedido: null, pagamentos: [] }) }
  await ctx.route(/supabase\.co\//, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const json = (corpo, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(corpo) })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } })
    if (url.pathname.startsWith('/auth/v1/user')) return json(sessao.user)
    if (url.pathname.startsWith('/auth/v1/')) return json(sessao)
    if (url.pathname.startsWith('/functions/v1/')) {
      const f = url.pathname.split('/').pop()
      return json(funcoes[f] ? funcoes[f](JSON.parse(req.postData() || '{}')) : { ok: true })
    }
    if (url.pathname === '/rest/v1/rpc/current_papel') return json(papel)
    if (url.pathname.startsWith('/rest/v1/rpc/')) return json(null)
    if (url.pathname.startsWith('/rest/v1/')) {
      const tabela = url.pathname.split('/').pop()
      let linhas = fx[tabela] ?? []
      for (const [coluna, valor] of url.searchParams) {
        if (typeof valor === 'string' && valor.startsWith('eq.') && (coluna === 'id' || coluna === 'auth_user_id')) linhas = linhas.filter((l) => String(l[coluna]) === valor.slice(3))
      }
      if ((req.headers()['accept'] ?? '').includes('vnd.pgrst.object')) return linhas.length ? json(linhas[0]) : json({ code: 'PGRST116', details: null, hint: null, message: 'sem linhas' }, 406)
      return json(linhas)
    }
    return json({})
  })
  const pagina = await ctx.newPage()
  const erros = []
  pagina.on('pageerror', (e) => erros.push(String(e)))
  await pagina.goto(`${BASE}/fiscal?op=${OP}`, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(1800)
  const texto = (await pagina.evaluate(() => document.body.innerText)).toLowerCase().replace(/ /g, ' ')
  const seletores = await pagina.evaluate(() => Array.from(document.querySelectorAll('select[id^="forn-"]')).map((s) => ({ id: s.id, desabilitado: s.disabled, opcoes: Array.from(s.options).map((o) => ({ texto: o.text, desabilitada: o.disabled, selecionada: o.selected })) })))
  if (captura) {
    const alvo = pagina.locator('select[id^="forn-"]').first()
    if (await alvo.count()) await alvo.scrollIntoViewIfNeeded()
    await pagina.waitForTimeout(300)
    await pagina.screenshot({ path: captura })
    const esteira = pagina.getByText('ESTEIRA DE EMISSÃO', { exact: false }).first()
    if (await esteira.count()) {
      await esteira.scrollIntoViewIfNeeded()
      await pagina.waitForTimeout(300)
      await pagina.screenshot({ path: captura.replace('.png', '-esteira.png') })
    }
  }
  await ctx.close()
  return { nome, texto, seletores, erros }
}

;(async () => {
  const browser = await chromium.launch()
  let falhas = 0
  const confere = (ok, msg) => { console.log(`${ok ? 'OK ' : 'FALHOU'}  ${msg}`); if (!ok) falhas++ }
  const docs = path.join(__dirname, '..', '..', 'docs')
  const ligada = process.env.FLAG === 'desligada' ? false : true

  const livre = await cenario(browser, { nome: 'não-demo, nada emitido', demo: false, emitido: false }, path.join(docs, 'captura-fornecedor-seletor.png'))
  const emitido = await cenario(browser, { nome: 'não-demo, emitido', demo: false, emitido: true }, path.join(docs, 'captura-fornecedor-bloqueado.png'))
  const demoCen = await cenario(browser, { nome: 'demonstração', demo: true, emitido: false }, path.join(docs, 'captura-fornecedor-demo.png'))
  const semPapel = await cenario(browser, { nome: 'papel sem permissão', demo: false, emitido: false, papel: 'gestor_rbr' }, null)

  if (ligada) {
    confere(livre.seletores.length === 2, 'flag ligada, não-demo: seletor nos dois cartões (CIOT e vale)')
    const s = livre.seletores[0]
    confere(!s.desabilitado && s.opcoes.some((o) => /nstech/i.test(o.texto) && o.selecionada), 'seletor com nstech marcado e habilitado')
    confere(s.opcoes.some((o) => /repom/i.test(o.texto) && o.desabilitada && /em implantação/i.test(o.texto)), 'repom desabilitado "em implantação"')
    confere(livre.texto.includes('vpo: nspedagio (padrão)') && livre.texto.includes('ciot: efrete (padrão)'), 'esteira mostra o fornecedor de cada etapa, com "(padrão)" sem escolha feita')
    confere(emitido.seletores.length === 2 && emitido.seletores.every((x) => x.desabilitado), 'depois de emitir: seletores bloqueados')
    confere(emitido.texto.includes('cancele antes de trocar a empresa'), 'mensagem "cancele antes de trocar a empresa"')
    confere(emitido.texto.includes('emitido por nstech'), 'documento emitido mostra o fornecedor que emitiu')
    confere(demoCen.seletores.length === 0 && !demoCen.texto.includes('empresa que emite') && !demoCen.texto.includes('(padrão)') && !demoCen.texto.includes('emitido por nstech'), 'demonstração, flag ligada: nada novo na tela')
  } else {
    for (const c of [livre, emitido, demoCen]) confere(c.seletores.length === 0 && !c.texto.includes('empresa que emite') && !c.texto.includes('(padrão)'), `flag desligada (${c.nome}): nada novo`)
  }
  for (const c of [livre, emitido, demoCen]) confere(c.erros.length === 0, `sem erro de script (${c.nome})${c.erros.length ? ' -> ' + c.erros.join(' | ') : ''}`)
  void semPapel
  await browser.close()
  process.exit(falhas ? 1 : 0)
})()
