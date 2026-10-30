// node --test supabase/functions/_shared/ciotEfrete.test.ts   (sem rede, sem segredos)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  calcularPisoAntt,
  codigoTipoCarga,
  dataEfrete,
  pedidoDaOperacao,
  tipoChavePix,
  type CoeficientePiso,
  type DadosOperacaoCiot,
  emitirComAntiDuplicidade,
  gerarChassi,
  gerarCnh,
  gerarCpf,
  gerarRenavam,
  juntarCiot,
  montarCorpoOperacaoPadrao,
  separarCiot,
  traduzirErroEfrete,
  validarPedidoPadrao,
  type PedidoCiotPadrao,
  type PedidoRegistrado,
  type RepositorioPedidos,
} from './ciotEfrete.ts'

const AGORA = new Date('2026-10-24T12:00:00Z') // 09:00 em Brasília
const h = (n: number) => new Date(AGORA.getTime() + n * 3600_000)
const END = { Bairro: 'Bela Vista', Rua: 'Av. Paulista', Numero: '777', CEP: '01311-914', CodigoMunicipio: 3550308 }

const pedido = (x: Partial<PedidoCiotPadrao> = {}): PedidoCiotPadrao => ({
  idOperacaoCliente: 'RBR-TESTE-0001',
  documentoViagem: 'TESTE-RBR-TESTE-0001',
  matrizCnpj: '69.115.969/0001-04',
  dataInicio: h(3),
  dataFim: h(48),
  ncm: '3923',
  pesoKg: 1000,
  tipoEmbalagem: 'Caixa',
  codigoTipoCarga: 5,
  origem: { lat: -23.561414, lon: -46.655881 },
  destino: { lat: -22.90556, lon: -47.06083 },
  distanciaKm: 100,
  valorFrete: 8000,
  pedagio: 0,
  pagamentos: [
    { idPagamentoCliente: 'RBR-TESTE-0001-AD', categoria: 'Adiantamento', valor: 3000, dataLiberacao: h(3) },
    { idPagamentoCliente: 'RBR-TESTE-0001-QT', categoria: 'Quitacao', valor: 5000, dataLiberacao: h(48) },
  ],
  pix: { tipo: 'CpfOuCnpj', valor: '48386492000121' },
  cpfCnpjCreditado: '48.386.492/0001-21',
  contratado: { cpfOuCnpj: '48386492000121', rntrc: '56802388' },
  motorista: { cpf: gerarCpf(123456789), cnh: gerarCnh(987654321), ddd: 11, numero: 912345678 },
  contratante: { cnpj: '69115969000104', nome: 'RBR CARGO TRANSPORTE DE CARGA E LOGISTICA LTDA', endereco: END },
  destinatario: { cnpj: '69115969000104', nome: 'RBR CARGO TRANSPORTE DE CARGA E LOGISTICA LTDA', endereco: END },
  placas: ['RQW4D58', 'rrd-5b39'],
  composicaoVeicular: true,
  notasFiscais: [{ numero: '1', serie: '1', valorTotal: 10000, valorPorUnidade: 10, quantidade: 1000 }],
  ...x,
})

test('data no formato da efrete, em horário de Brasília', () => {
  assert.equal(dataEfrete(AGORA), '2026-10-24T09:00:00')
})

test('corpo Padrão (Lotação) com Pix: versão 8, totais, pagamentos e Pix sem dados bancários', () => {
  const c = montarCorpoOperacaoPadrao(pedido()) as Record<string, any>
  assert.equal(c.TipoViagem, 'Padrao')
  assert.equal(c.Versao, 8)
  assert.ok(Array.isArray(c.Viagens) && c.Viagens.length === 1) // servidor exige lista (manual mostra objeto)
  assert.equal(c.MatrizCNPJ, '69115969000104')
  assert.equal(c.DataInicioViagem, '2026-10-24T12:00:00')
  assert.deepEqual(c.Viagens[0].Valores, { TotalOperacao: 8000, TotalViagem: 8000, TotalDeAdiantamento: 3000, TotalDeQuitacao: 5000, Combustivel: 0, Pedagio: 0, Seguro: 0 })
  assert.equal(c.Viagens[0].LatitudeOrigem, '-23.561414')
  assert.equal(c.Viagens[0].NotasFiscais[0].TipoDeCalculo, 'SemQuebra')
  assert.equal(c.Pagamentos.length, 2)
  for (const p of c.Pagamentos) {
    assert.equal(p.TipoChavePix, 'CpfOuCnpj')
    assert.equal(p.ValorChavePix, '48386492000121')
    assert.equal(p.CpfCnpjCreditado, '48386492000121')
    assert.equal(p.InformacoesBancarias, undefined) // Pix OU banco, nunca os dois
    assert.equal(p.IndicadorPagamento, 'AVista')
  }
  assert.deepEqual(c.Veiculos, [{ Placa: 'RQW4D58' }, { Placa: 'RRD5B39' }])
  assert.equal(c.ComposicaoVeicular, true)
  assert.deepEqual(c.Impostos, { IRRF: 0, SestSenat: 0, INSS: 0, ISSQN: 0 })
  assert.equal(c.Contratante.Endereco.CEP, '01311914')
  assert.equal(c.Contratante.ResponsavelPeloPagamento, true)
})

test('validação: datas no passado, fim antes do início, mais de 90 dias', () => {
  assert.deepEqual(validarPedidoPadrao(pedido(), AGORA), [])
  assert.ok(validarPedidoPadrao(pedido({ dataInicio: h(-1) }), AGORA).some((e) => /no passado/.test(e)))
  assert.ok(validarPedidoPadrao(pedido({ dataFim: h(2) }), AGORA).some((e) => /depois do início/.test(e)))
  assert.ok(validarPedidoPadrao(pedido({ dataFim: h(24 * 95) }), AGORA).some((e) => /90 dias/.test(e)))
})

test('validação: frete abaixo do piso (quando informado), soma dos pagamentos, Pix e composição', () => {
  assert.ok(validarPedidoPadrao(pedido({ pisoMinimo: 9000 }), AGORA).some((e) => /abaixo do piso/.test(e)))
  assert.deepEqual(validarPedidoPadrao(pedido({ pisoMinimo: 7000 }), AGORA), [])
  assert.ok(validarPedidoPadrao(pedido({ valorFrete: 9000 }), AGORA).some((e) => /somam R\$ 8000\.00/.test(e)))
  assert.ok(validarPedidoPadrao(pedido({ pix: { tipo: 'TelefoneCelular', valor: '+5511999999999' } }), AGORA).some((e) => /Pix com caractere/.test(e)))
  assert.ok(validarPedidoPadrao(pedido({ placas: ['RQW4D58'] }), AGORA).some((e) => /implemento/.test(e)))
})

test('glossário: mensagens da efrete/ANTT viram texto claro', () => {
  assert.match(traduzirErroEfrete('Rejeição: O valor do frete informado é menor do que o valor mínimo de frete estabelecido.'), /piso mínimo da ANTT/)
  assert.match(traduzirErroEfrete('Rejeição: O veículo do tipo automotor informado não possui vínculo com o transportador contratado.'), /não está vinculada ao RNTRC/)
  assert.match(traduzirErroEfrete('Rejeição: É obrigatório informar ao menos um implemento quando o veículo automotor for do tipo cavalo-trator.'), /sem implemento/)
  assert.match(traduzirErroEfrete('Rejeição; O CEP 01311914 ainda não está cadastrado em nossos sistemas.'), /latitude e longitude/)
  assert.match(traduzirErroEfrete('Data de início da viagem deve ser maior ou igual à data atual'), /no passado/)
  assert.equal(traduzirErroEfrete('Mensagem nova que não está no glossário'), 'Mensagem nova que não está no glossário')
})

function repoMemoria() {
  const m = new Map<string, PedidoRegistrado>()
  const r: RepositorioPedidos = {
    obter: async (id) => m.get(id) ?? null,
    registrarPendente: async (p) => void m.set(p.idOperacaoCliente, { status: 'pendente', ciot: null, tentativas: 0 }),
    registrarRetorno: async (id, r) => void m.set(id, { ...m.get(id)!, protocolo: r.protocolo } as PedidoRegistrado),
    marcarTentativa: async (id) => void m.set(id, { ...m.get(id)!, tentativas: (m.get(id)?.tentativas ?? 0) + 1 }),
    marcarEmitido: async (id, e) => void m.set(id, { ...(m.get(id) ?? { tentativas: 0 }), status: 'emitido', ciot: e.ciot }),
    marcarErro: async (id) => void m.set(id, { ...(m.get(id) ?? { tentativas: 0, ciot: null }), status: 'erro' }),
  }
  return { r, m }
}

test('anti-duplicidade: 2ª tentativa consulta pela referência e NÃO emite de novo', async () => {
  const { r, m } = repoMemoria()
  let emissoes = 0
  // 1ª: a efrete emite, mas a resposta se perde (erro de rede) -> pedido fica em "erro"
  const perdida = {
    emitirOperacaoTransporte: async () => ((emissoes += 1), { ok: false as const, erro: { codigo: 'REDE', mensagem: 'connection reset' } }),
    obterCiotPorReferencia: async () => ({ ok: true as const, dados: null }),
  }
  const r1 = await emitirComAntiDuplicidade(perdida, r, pedido(), AGORA)
  assert.equal(r1.ok, false)
  assert.equal(m.get('RBR-TESTE-0001')?.status, 'erro')
  // 2ª: a consulta acha o CIOT -> não chama a emissão
  const achou = {
    emitirOperacaoTransporte: async () => ((emissoes += 1), { ok: true as const, dados: { ciot: 'XXXXXXXXXXXX', protocolo: '1' } }),
    obterCiotPorReferencia: async () => ({ ok: true as const, dados: { ciot: '991000000123', estado: 'EmViagem', protocolo: null } }),
  }
  const r2 = await emitirComAntiDuplicidade(achou, r, pedido(), AGORA)
  assert.deepEqual(r2, { ok: true, ciot: '991000000123', protocolo: null, jaExistia: true })
  assert.equal(emissoes, 1)
  // 3ª: já emitido no banco -> nem consulta
  const r3 = await emitirComAntiDuplicidade(achou, r, pedido(), AGORA)
  assert.equal(r3.ok && r3.jaExistia, true)
  assert.equal(emissoes, 1)
})

test('anti-duplicidade: se a consulta falhar, não emite (seguro)', async () => {
  const { r, m } = repoMemoria()
  m.set('RBR-TESTE-0001', { status: 'erro', ciot: null, tentativas: 1 })
  let emitiu = false
  const prov = {
    emitirOperacaoTransporte: async () => ((emitiu = true), { ok: true as const, dados: { ciot: 'X', protocolo: null } }),
    obterCiotPorReferencia: async () => ({ ok: false as const, erro: { codigo: 'EFRETE_CONEXAO', mensagem: 'A efrete fechou a conexão.' } }),
  }
  const res = await emitirComAntiDuplicidade(prov, r, pedido(), AGORA)
  assert.equal(res.ok, false)
  assert.equal(!res.ok && res.etapa, 'consulta')
  assert.equal(emitiu, false)
})

test('primeira emissão: grava pendente, valida, emite e marca emitido; erro da efrete vem traduzido', async () => {
  const { r, m } = repoMemoria()
  const ok = await emitirComAntiDuplicidade(
    { emitirOperacaoTransporte: async () => ({ ok: true, dados: { ciot: '991000000124', protocolo: '777' } }), obterCiotPorReferencia: async () => ({ ok: true, dados: null }) },
    r,
    pedido(),
    AGORA,
  )
  assert.deepEqual(ok, { ok: true, ciot: '991000000124', protocolo: '777', jaExistia: false })
  assert.equal(m.get('RBR-TESTE-0001')?.status, 'emitido')
  const { r: r2 } = repoMemoria()
  const rej = await emitirComAntiDuplicidade(
    {
      emitirOperacaoTransporte: async () => ({ ok: false, erro: { codigo: 'SEM_CODIGO', mensagem: 'Rejeição: O valor do frete informado é menor do que o valor mínimo de frete estabelecido.' } }),
      obterCiotPorReferencia: async () => ({ ok: true, dados: null }),
    },
    r2,
    pedido({ idOperacaoCliente: 'RBR-TESTE-0002' }),
    AGORA,
  )
  assert.ok(!rej.ok && /piso mínimo/.test(rej.mensagem))
  // pedido inválido nem chama a efrete
  let chamou = false
  const inv = await emitirComAntiDuplicidade(
    { emitirOperacaoTransporte: async () => ((chamou = true), { ok: true, dados: { ciot: 'x', protocolo: null } }), obterCiotPorReferencia: async () => ({ ok: true, dados: null }) },
    repoMemoria().r,
    pedido({ idOperacaoCliente: 'RBR-TESTE-0003', dataInicio: h(-2) }),
    AGORA,
  )
  assert.ok(!inv.ok && inv.etapa === 'validacao')
  assert.equal(chamou, false)
})

test('dados fictícios: CPF, CNH e RENAVAM com dígitos verificadores válidos; chassi de 17', () => {
  const cpf = gerarCpf(123456789)
  assert.match(cpf, /^\d{11}$/)
  const d = cpf.split('').map(Number)
  const dv = (n: number) => {
    let s = 0
    for (let i = 0; i < n; i++) s += d[i] * (n + 1 - i)
    const r = (s * 10) % 11
    return r === 10 ? 0 : r
  }
  assert.equal(dv(9), d[9])
  assert.equal(dv(10), d[10])
  assert.match(gerarCnh(987654321), /^\d{11}$/)
  assert.match(gerarRenavam(1234567890), /^\d{11}$/)
  const ch = gerarChassi(42)
  assert.equal(ch.length, 17)
  assert.ok(!/[IOQ]/.test(ch))
})

test('verificador XXXX: aceito só em homologação; em produção (ou sem informar o ambiente) continua exigindo 4 dígitos', () => {
  assert.deepEqual(separarCiot('013312910027/XXXX', 'homologacao'), { numero: '013312910027', verificador: 'XXXX' })
  assert.equal(separarCiot('013312910027/XXXX', 'producao'), null)
  assert.equal(separarCiot('013312910027/XXXX'), null)
  // homologação continua aceitando o formato normal e recusando lixo
  assert.deepEqual(separarCiot('013312910027/4165', 'homologacao'), { numero: '013312910027', verificador: '4165' })
  assert.equal(separarCiot('013312910027/XXX', 'homologacao'), null)
  assert.equal(separarCiot('013312910027/xxxx', 'homologacao'), null)
  assert.equal(juntarCiot('013312910027', 'XXXX'), '013312910027/XXXX')
})

test('CIOT da efrete: 12 dígitos + "/" + verificador de 4 (formato real) separado e remontado', () => {
  assert.deepEqual(separarCiot('560000596706/4165'), { numero: '560000596706', verificador: '4165' })
  assert.deepEqual(separarCiot('560000596706'), { numero: '560000596706', verificador: null })
  assert.equal(separarCiot('56000059670/4165'), null)
  assert.equal(separarCiot('XXXXXXXXXXXX'), null)
  assert.equal(juntarCiot('560000596706', '4165'), '560000596706/4165')
  assert.equal(juntarCiot('560000596706', null), '560000596706')
})

// ---- Passo 4 ----------------------------------------------------------------------------------------
const COEFS: CoeficientePiso[] = [
  { tabela: 'A', tipo_carga: 'Carga Geral', eixos: 6, ccd_por_km: 7.3547, cc_fixo: 671.93, data_vigencia: '2026-07-17', fonte: 'Resolucao ANTT 6.084/2026 (Anexo II)' },
  { tabela: 'A', tipo_carga: 'Carga Geral', eixos: 6, ccd_por_km: 7.0, cc_fixo: 600, data_vigencia: '2025-01-20' },
  { tabela: 'B', tipo_carga: 'Carga Geral', eixos: 3, ccd_por_km: 5.0, cc_fixo: 500, data_vigencia: '2026-07-17' },
]

test('piso ANTT: cc_fixo + ccd_por_km × km, linha vigente mais recente; composição usa a tabela A', () => {
  const r = calcularPisoAntt(COEFS, { tipoCarga: 'Carga geral', eixos: 6, distanciaKm: 100, composicao: true, hoje: '2026-10-24' })
  assert.ok(r.ok)
  assert.equal(r.ok && r.piso, 1407.4) // 671,93 + 735,47
  assert.equal(r.ok && r.tabela, 'A')
  const b = calcularPisoAntt(COEFS, { tipoCarga: null, eixos: 3, distanciaKm: 100, composicao: false, hoje: '2026-10-24' })
  assert.equal(b.ok && b.piso, 1000)
  assert.equal(calcularPisoAntt(COEFS, { tipoCarga: 'Neogranel', eixos: 6, distanciaKm: 100, composicao: true, hoje: '2026-10-24' }).ok, false)
})

test('tipo de carga -> código da efrete e chave Pix -> tipo', () => {
  assert.equal(codigoTipoCarga('Carga geral'), 5)
  assert.equal(codigoTipoCarga('Perigosa (granel líquido)'), 8)
  assert.deepEqual(tipoChavePix('48.386.492/0001-21'), { tipo: 'CpfOuCnpj', valor: '48386492000121' })
  assert.deepEqual(tipoChavePix('Fulano@Exemplo.com'), { tipo: 'Email', valor: 'fulano@exemplo.com' })
  assert.deepEqual(tipoChavePix('+55 (11) 91234-5678'), { tipo: 'TelefoneCelular', valor: '5511912345678' })
  assert.equal(tipoChavePix('123e4567-e89b-12d3-a456-426614174000').tipo, 'ChaveAleatoria')
})

const OP = (x: Partial<DadosOperacaoCiot> = {}): DadosOperacaoCiot => ({
  operacaoId: '11111111-2222-3333-4444-555555555555',
  ambiente: 'homologacao',
  agora: AGORA,
  contratante: { cnpj: '69115969000104', nome: 'RBR', endereco: END },
  motorista: { cpf: gerarCpf(20261024), cnh: gerarCnh(20261024), celular: '5511912345678' },
  contratado: { cpfOuCnpj: '48386492000121', rntrc: '56802388', pix: '48386492000121' },
  tracao: { placa: 'RQW4D58', eixos: 3 },
  implementos: [{ placa: 'RRD5B39', eixos: 3 }],
  rota: { origem: { lat: -23.55, lon: -46.63, ibge: 3550308 }, destino: { lat: -22.9, lon: -47.06, ibge: 3509502 }, distanciaKm: 100 },
  carga: { tipoCarga: 'Carga Geral', ncm: null, complexa: false, tabelaAntt: 'A' },
  condicao: { valorTotal: 8000, adiantamento: 3000, pedagio: 0 },
  datas: { inicio: h(1), fim: h(25) },
  notas: [
    { chave: '35261069115969000104550010000000011000000019', numero: '1', serie: '1', valor: 6000, pesoKg: 600, ncm: '39231090', destinatarioCnpj: '11222333000181', destinatarioNome: 'DEST' },
    { chave: '35261069115969000104550010000000021000000024', numero: '2', serie: '1', valor: 4000, pesoKg: 400, ncm: '39235000', destinatarioCnpj: '11222333000181', destinatarioNome: 'DEST' },
  ],
  destinatarioEndereco: null,
  coeficientes: COEFS,
  documentos: { mdfeValorContrato: null, cteChaves: null },
  ...x,
})

test('pedido da operação: motorista, cavalo + implemento, NFs (todas), peso somado, Pix e piso calculado', () => {
  const r = pedidoDaOperacao(OP())
  assert.deepEqual(r.bloqueios, [])
  assert.ok(r.pedido)
  const p = r.pedido!
  assert.deepEqual(p.placas, ['RQW4D58', 'RRD5B39'])
  assert.equal(p.composicaoVeicular, true)
  assert.equal(p.pesoKg, 1000)
  assert.equal(p.ncm, '3923')
  assert.equal(p.notasFiscais.length, 2)
  assert.deepEqual(p.pagamentos.map((x) => [x.categoria, x.valor]), [['Adiantamento', 3000], ['Quitacao', 5000]])
  assert.equal(p.pix.tipo, 'CpfOuCnpj')
  assert.equal(p.motorista.ddd, 11)
  assert.equal(r.piso.ok && r.piso.piso, 1407.4)
  assert.equal(r.diferencaPiso, 6592.6)
  assert.match(p.idOperacaoCliente, /^RBR-HML-OP-/)
  const c = montarCorpoOperacaoPadrao(p) as Record<string, any>
  assert.equal(c.Viagens[0].NotasFiscais.length, 2)
  assert.equal(c.Viagens[0].NotasFiscais[1].CodigoNCMNaturezaCarga, '3923')
})

test('pedido da operação: frete abaixo do piso BLOQUEIA e mostra a diferença', () => {
  const r = pedidoDaOperacao(OP({ condicao: { valorTotal: 1000, adiantamento: 0, pedagio: 0 } }))
  assert.equal(r.pedido, null)
  assert.equal(r.diferencaPiso, -407.4)
  assert.ok(r.bloqueios.some((b) => /abaixo do piso mínimo da ANTT R\$ 1407\.40 \(faltam R\$ 407\.40\)/.test(b)))
})

test('pedido da operação: valor diferente do MDF-e e NFs diferentes do CT-e bloqueiam; sem NF bloqueia; carga complexa só avisa', () => {
  const r = pedidoDaOperacao(OP({ documentos: { mdfeValorContrato: 7500, cteChaves: ['35261069115969000104550010000000011000000019'] } }))
  assert.ok(r.bloqueios.some((b) => /diferente do valor do contrato no MDF-e/.test(b)))
  assert.ok(r.bloqueios.some((b) => /não são as mesmas citadas no CT-e/.test(b)))
  assert.ok(pedidoDaOperacao(OP({ notas: [] })).bloqueios.some((b) => /sem NF-e do cliente/.test(b)))
  const cx = pedidoDaOperacao(OP({ carga: { tipoCarga: 'Carga Geral', ncm: null, complexa: true, tabelaAntt: 'A' } }))
  assert.equal(cx.bloqueios.length, 0)
  assert.ok(cx.avisos.some((a) => /carga complexa/.test(a)))
})

test('protocolo da emissão é gravado ANTES de interpretar: fica salvo mesmo se gravar o CIOT falhar', async () => {
  const { r, m } = repoMemoria()
  r.marcarEmitido = async () => {
    throw new Error('banco recusou')
  }
  await assert.rejects(() =>
    emitirComAntiDuplicidade(
      { emitirOperacaoTransporte: async () => ({ ok: true, dados: { ciot: '560000596706/4165', protocolo: '6126266' } }), obterCiotPorReferencia: async () => ({ ok: true, dados: null }) },
      r,
      pedido(),
      AGORA,
    ),
  )
  assert.equal((m.get('RBR-TESTE-0001') as unknown as { protocolo: string }).protocolo, '6126266')
})

test('referência: sem tentativa (ou 1) é igual à de sempre; depois de cancelar vira -T2, -T3', () => {
  const base = pedidoDaOperacao(OP())
  const r1 = pedidoDaOperacao(OP({ tentativa: 1 }))
  const r2 = pedidoDaOperacao(OP({ tentativa: 2 }))
  const r3 = pedidoDaOperacao(OP({ tentativa: 3 }))
  assert.equal(r1.pedido?.idOperacaoCliente, base.pedido?.idOperacaoCliente)
  assert.equal(r2.pedido?.idOperacaoCliente, `${base.pedido?.idOperacaoCliente}-T2`)
  assert.equal(r3.pedido?.idOperacaoCliente, `${base.pedido?.idOperacaoCliente}-T3`)
  // o resto do pedido não muda
  assert.equal(r2.pedido!.valorFrete, base.pedido!.valorFrete)
  assert.deepEqual(r2.pedido!.placas, base.pedido!.placas)
  assert.deepEqual(r2.pedido!.pagamentos.map((g) => g.valor), base.pedido!.pagamentos.map((g) => g.valor))
  // os ids dos pagamentos (únicos no banco) acompanham a referência nova
  assert.ok(r2.pedido!.pagamentos.every((g) => g.idPagamentoCliente.startsWith(r2.pedido!.idOperacaoCliente)))
})

test('"emitir novamente" nunca pula a anti-duplicidade: referência nova já emitida volta como já existente', async () => {
  const pedido = pedidoDaOperacao(OP({ tentativa: 2 })).pedido!
  let emitiu = 0
  const r = await emitirComAntiDuplicidade(
    { emitirOperacaoTransporte: async () => { emitiu++; return { ok: true as const, dados: { ciot: '1', protocolo: 'p' } } }, obterCiotPorReferencia: async () => ({ ok: true as const, dados: null }) },
    { obter: async () => ({ status: 'emitido', ciot: '123456789012', tentativas: 1 }), registrarPendente: async () => {}, marcarTentativa: async () => {}, registrarRetorno: async () => {}, marcarEmitido: async () => {}, marcarErro: async () => {} },
    pedido,
  )
  assert.equal(r.ok && r.jaExistia, true)
  assert.equal(emitiu, 0)
})

test('C10: Tabela B com 2 ou 3 eixos orienta a usar a Tabela A', () => {
  const r = calcularPisoAntt([], { eixos: 3, distanciaKm: 100, altoDesempenho: false, composicao: false, tipoCarga: 'Carga Geral', hoje: '2026-10-30' } as never)
  assert.equal(r.ok, false)
  assert.match(String((r as { motivo: string }).motivo), /Use a Tabela A/)
})
