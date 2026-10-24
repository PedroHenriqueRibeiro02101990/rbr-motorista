// node --test supabase-functions/_shared/ciotEfrete.test.ts   (sem rede, sem segredos)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  dataEfrete,
  emitirComAntiDuplicidade,
  gerarChassi,
  gerarCnh,
  gerarCpf,
  gerarRenavam,
  montarCorpoOperacaoPadrao,
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
  notaFiscal: { numero: '1', serie: '1', valorTotal: 10000, valorPorUnidade: 10, quantidade: 1000 },
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
