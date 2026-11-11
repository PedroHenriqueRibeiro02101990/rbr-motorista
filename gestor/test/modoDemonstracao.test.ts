// node --test gestor/test/modoDemonstracao.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  aaaammddDeIso,
  esteiraDemonstracao,
  limparNomeTeste,
  linhasDadosCiot,
  linhasDadosVpo,
  mascarar,
  modoDemonstracaoAtivo,
  NAO_INFORMADO,
  seloVale,
  textoConfirmacao,
  type DadosDemo,
  type FormularioVale,
} from '../src/lib/modoDemonstracao.ts'
import { estadoPasso, passosAntesDoCiot, passoLibera, type DocLeve } from '../src/lib/ciotCartao.ts'
import { registroEmJson, type RequisicaoVpo } from '../src/lib/vpoPassos.ts'

test('modo de demonstração: eh_teste + marca + nenhum documento da operação em produção', () => {
  const homolog = [{ ambiente: 'homologacao' }, { ambiente: 'homologacao' }]
  assert.equal(modoDemonstracaoAtivo({ eh_teste: true, modo_demonstracao: true }, homolog), true)
  assert.equal(modoDemonstracaoAtivo({ eh_teste: true, modo_demonstracao: true }, [{ ambiente: null }]), true)
  assert.equal(modoDemonstracaoAtivo({ eh_teste: true, modo_demonstracao: true }, [...homolog, { ambiente: 'producao' }]), false)
  assert.equal(modoDemonstracaoAtivo({ eh_teste: true, modo_demonstracao: false }, homolog), false)
  assert.equal(modoDemonstracaoAtivo({ eh_teste: false, modo_demonstracao: true }, homolog), false)
  assert.equal(modoDemonstracaoAtivo({ eh_teste: true }, homolog), false)
  assert.equal(modoDemonstracaoAtivo(null, homolog), false)
})

test('o ambiente fiscal GLOBAL (producao no gestor) não esconde mais o modo: a regra nem recebe esse valor', () => {
  assert.equal(modoDemonstracaoAtivo.length, 2)
  assert.equal(modoDemonstracaoAtivo({ eh_teste: true, modo_demonstracao: true }, undefined), true)
})

const dispensados: DocLeve[] = [
  { tipo: 'cte', status: 'pendente', exigido: false, dispensa_motivo: 'Fora do roteiro da demonstração' },
  { tipo: 'atm', status: 'pendente', exigido: false, dispensa_motivo: 'Operação de teste (eh_teste)' },
]
const exigidos: DocLeve[] = [
  { tipo: 'cte', status: 'pendente', exigido: true },
  { tipo: 'atm', status: 'pendente', exigido: true },
]

test('CIOT liberado com CT-e e averbação dispensados SÓ no modo de demonstração', () => {
  const passos = passosAntesDoCiot(dispensados, true, true)
  assert.ok(passos.every((p) => passoLibera(p.estado)))
  assert.ok(passos.every((p) => p.estado === 'dispensado_demo'))
})

test('CIOT continua bloqueado fora do modo quando CT-e e averbação estão pendentes e exigidos', () => {
  assert.ok(passosAntesDoCiot(exigidos, true, false).some((p) => !passoLibera(p.estado)))
  assert.ok(passosAntesDoCiot(exigidos, true, true).some((p) => !passoLibera(p.estado)))
})

test('fora do modo, dispensado não vira "dispensado_demo" e o Fiscal (sem os campos) segue bloqueando', () => {
  assert.equal(estadoPasso(dispensados[0], true, false), 'nao_exigido')
  assert.equal(estadoPasso({ tipo: 'cte', status: 'pendente' }, false, false), 'pendente')
})

let n = 0
const req = (acao: string, extra: Partial<RequisicaoVpo> = {}): RequisicaoVpo => ({
  id: `r${++n}`, acao, ambiente: 'homologacao', http_status: 200, id_vpo_antt: null, numero_viagem: null, id_recibo: null,
  total_viagem: null, erro: null, criado_em: new Date(Date.UTC(2026, 10, 12, 12, 0, n)).toISOString(), ...extra,
})

test('esteira: 5 caixas, 3 fora da demonstração (pontilhadas), 2 ativas, contador só dos 2', () => {
  const e = esteiraDemonstracao([], null)
  assert.deepEqual(e.caixas.map((c) => c.id), ['cte', 'averbacao', 'vpo', 'ciot', 'mdfe'])
  assert.deepEqual(e.caixas.filter((c) => !c.ativo).map((c) => c.id), ['cte', 'averbacao', 'mdfe'])
  assert.ok(e.caixas.filter((c) => !c.ativo).every((c) => c.status === 'Fora desta demonstração' && c.estado === 'fora'))
  assert.equal(e.contador, '0 de 2')
  assert.equal(e.caixas.find((c) => c.id === 'vpo')?.estado, 'a_emitir')
  assert.equal(e.caixas.find((c) => c.id === 'ciot')?.estado, 'a_emitir')
})

test('esteira: um quadro por documento com estado próprio (a emitir, emitido, cancelado) e contador só dos emitidos', () => {
  const comprado = [req('simular'), req('comprar', { id_vpo_antt: '669' })]
  const e1 = esteiraDemonstracao(comprado, null)
  assert.equal(e1.contador, '1 de 2')
  assert.equal(e1.caixas.find((c) => c.id === 'vpo')?.estado, 'emitido')
  assert.ok(e1.caixas.find((c) => c.id === 'vpo')?.detalhe, 'o emitido mostra data e hora')
  assert.equal(esteiraDemonstracao(comprado, 'emitido', Date.now(), { emitidoEm: '2026-11-12T15:00:00Z' }).contador, '2 de 2')
  // os dois cancelados: 0 de 2, e cada quadro diz "cancelado em ... emitir de novo / comprar de novo"
  const cancelado = esteiraDemonstracao([...comprado, req('cancelar')], 'cancelado', Date.now(), { canceladoEm: '2026-11-12T16:00:00Z' })
  assert.equal(cancelado.contador, '0 de 2')
  const ciot = cancelado.caixas.find((c) => c.id === 'ciot')!
  const vpo = cancelado.caixas.find((c) => c.id === 'vpo')!
  assert.equal(ciot.estado, 'cancelado')
  assert.match(ciot.detalhe ?? '', /cancelado em .*emitir de novo/)
  assert.equal(vpo.estado, 'cancelado')
  assert.match(vpo.detalhe ?? '', /cancelado em .*comprar de novo/)
  const andamento = esteiraDemonstracao([req('simular'), req('comprar', { http_status: null, situacao: 'em_processamento', processando_desde: new Date().toISOString() })], null)
  assert.equal(andamento.caixas.find((c) => c.id === 'vpo')?.estado, 'processando')
})

const D: DadosDemo = {
  contratante: { nome: 'RBR CARGO', cnpj: '69115969000104' },
  titular: { nome: 'TESTE MASSA ANTT - TRANSPORTADOR EFRETE (apagar depois)', documento: '48386492000121', rntrc: '56802388', pix: '48386492000121' },
  motorista: { nome: 'TESTE HOMOLOGACAO - MOTORISTA FICTICIO EFRETE (apagar depois)', cpf: '12026102422', cnh: '22026102403' },
  veiculos: [{ placa: 'RQW4D58', eixos: 3, cavalo: true }, { placa: 'RRD5B39', eixos: 3, cavalo: false }],
  rota: { origem: 'SAO PAULO/SP', destino: 'CAMPINAS/SP', distanciaKm: 100, ibgeOrigem: '3550308', ibgeDestino: '3509502' },
  carga: { ncm: '39231090', pesoKg: 1000 },
  frete: { total: 8000, adiantamento: 3000 },
  datas: { inicio: '2026-11-20T13:00:00Z', fim: '2026-11-21T13:00:00Z' },
  numeroOperacao: 100008,
  vpo: { idvpo: null, valor: null },
}

test('nomes de teste: sem "(apagar depois)" e sem o prefixo "TESTE ... -", só na exibição', () => {
  assert.equal(limparNomeTeste('TESTE MASSA ANTT - TRANSPORTADOR EFRETE (apagar depois)'), 'TRANSPORTADOR EFRETE')
  assert.equal(limparNomeTeste('TESTE HOMOLOGACAO - MOTORISTA FICTICIO EFRETE (apagar depois)'), 'MOTORISTA FICTICIO EFRETE')
  assert.equal(limparNomeTeste('KMR LOGISTICA E TRANSPORTES LTDA'), 'KMR LOGISTICA E TRANSPORTES LTDA')
  assert.equal(limparNomeTeste(null), null)
  const texto = JSON.stringify(linhasDadosCiot(D, null))
  assert.ok(!/apagar depois/i.test(texto) && !/TESTE (MASSA|HOMOLOGACAO)/.test(texto))
  assert.match(texto, /TRANSPORTADOR EFRETE/)
})

test('"confirmado por": só nome de pessoa; ensaio automático mostra só data e hora', () => {
  const f = (i: string) => `DATA(${i})`
  assert.equal(textoConfirmacao('Ensaio automatizado (Claude), homologação', '2026-11-12T10:00:00Z', f), 'confirmado em DATA(2026-11-12T10:00:00Z)')
  assert.equal(textoConfirmacao('Teste automatizado (Claude), homologação', 'x', f), 'confirmado em DATA(x)')
  assert.equal(textoConfirmacao(null, 'x', f), 'confirmado em DATA(x)')
  assert.equal(textoConfirmacao('Maria Souza', 'x', f), 'confirmado por Maria Souza em DATA(x)')
})

test('dados do CIOT: uma linha por dado, origem etiquetada, CPF/CNH/Pix mascarados e "não informado" quando falta', () => {
  const l = linhasDadosCiot(D, { ok: true, piso: 1407.4, tabela: 'A', eixos: 6, distanciaKm: 100 })
  assert.equal(l.length, 10)
  const texto = JSON.stringify(l)
  assert.ok(!texto.includes('12026102422') && !texto.includes('22026102403'))
  assert.ok(!l.find((x) => x.dado === 'Chave Pix')!.valor.includes('48386492000121'))
  assert.equal(l.find((x) => x.dado === 'Número do vale-pedágio')?.valor, NAO_INFORMADO)
  const sem = linhasDadosCiot({ ...D, titular: { nome: null, documento: null, rntrc: null, pix: null }, motorista: { nome: null, cpf: null, cnh: null } }, null)
  assert.equal(sem.find((x) => x.dado === 'Chave Pix')?.valor, NAO_INFORMADO)
  assert.equal(sem.find((x) => x.dado === 'Piso mínimo da ANTT')?.valor, NAO_INFORMADO)
  assert.equal(sem.find((x) => x.dado === 'Motorista, CPF e CNH')?.valor, NAO_INFORMADO)
})

test('piso mínimo da ANTT: mesmo valor da conferência, ou o gravado no pedido, com origem "Fiscal (tabela ANTT)"', () => {
  const daPrevia = linhasDadosCiot(D, { ok: true, piso: 1407.4, tabela: 'A', eixos: 6, distanciaKm: 100 }).find((x) => x.dado === 'Piso mínimo da ANTT')!
  assert.match(daPrevia.valor, /1\.407,40/)
  assert.equal(daPrevia.origem, 'Fiscal (tabela ANTT)')
  const doPedido = linhasDadosCiot(D, null, 1407.4).find((x) => x.dado === 'Piso mínimo da ANTT')!
  assert.match(doPedido.valor, /1\.407,40/)
  assert.equal(doPedido.origem, 'Fiscal (tabela ANTT)')
})

const FORM: FormularioVale = { origem: '3550308', destino: '3509502', placa: 'GYI1732', eixos: '6', inicio: '20261120', fim: '20261121' }

test('tabela do vale lê o MESMO formulário: placa, eixos, rota e vigência coincidem', () => {
  const l = linhasDadosVpo(D, FORM, null)
  assert.match(l[0].valor, /GYI1732 · 6 eixos · placa de teste com TAG ativa; a da operação é RQW4D58/)
  assert.equal(l[1].valor, 'SAO PAULO/SP (IBGE 3550308) → CAMPINAS/SP (IBGE 3509502)')
  assert.equal(l[2].valor, '20/11/2026 a 21/11/2026')
  // o usuário muda o formulário (BH, 5 eixos, outras datas): a tabela acompanha, sem divergência
  const l2 = linhasDadosVpo(D, { ...FORM, destino: '3106200', eixos: '5', inicio: '20261112', fim: '20261116' }, 'R$ 140,64 (5 eixos, simulação do NSPEDAGIO)')
  assert.match(l2[0].valor, /· 5 eixos/)
  assert.match(l2[1].valor, /IBGE 3106200/)
  assert.equal(l2[2].valor, '12/11/2026 a 16/11/2026')
  assert.match(l2.find((x) => x.dado === 'Valor do vale')!.valor, /140,64/)
  assert.equal(linhasDadosVpo(D, FORM, null).find((x) => x.dado === 'Valor do vale')?.valor, 'aparece depois de Simular')
  // placa da própria operação: sem a frase da placa de teste
  assert.ok(!/placa de teste/.test(linhasDadosVpo(D, { ...FORM, placa: 'RQW4D58' }, null)[0].valor))
})

test('datas e máscara', () => {
  assert.equal(aaaammddDeIso('2026-11-20T13:00:00Z'), '20261120')
  assert.equal(aaaammddDeIso(null), '')
  assert.equal(mascarar('12026102422'), '•••••••2422')
})

test('selo do vale na demonstração: nada que sugira dado de mentira', () => {
  assert.equal(seloVale('nao_simulado', false), 'Ainda sem simulação')
  assert.equal(seloVale('nao_simulado', true), 'Valor calculado pelo NSPEDÁGIO')
  assert.equal(seloVale('simulado', false), 'Valor calculado pelo NSPEDÁGIO')
  for (const e of ['nao_simulado', 'simulado', 'comprando', 'comprado', 'cancelando', 'cancelado', 'nao_confirmado'] as const) {
    assert.ok(!/simulado,|n[ãa]o simulado/i.test(seloVale(e, false)), e)
  }
})

test('registro exportado nunca leva o PDF do recibo', () => {
  const pdf = 'JVBERi0x'.repeat(100)
  const json = registroEmJson('op', [req('recibo', { response_json: [{ dadosRetorno: { viagem: [{ recibo: pdf, numeroViagem: '1' }] } }] })])
  assert.ok(!json.includes(pdf))
  assert.match(json, /PDF do recibo omitido/)
})
