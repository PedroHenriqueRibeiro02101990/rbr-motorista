// node --test gestor/test/modoDemonstracao.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esteiraDemonstracao, linhasDadosCiot, linhasDadosVpo, mascarar, modoDemonstracaoAtivo, NAO_INFORMADO, type DadosDemo } from '../src/lib/modoDemonstracao.ts'
import { estadoPasso, passosAntesDoCiot, passoLibera, type DocLeve } from '../src/lib/ciotCartao.ts'
import type { RequisicaoVpo } from '../src/lib/vpoPassos.ts'

test('modo de demonstração: só com teste + homologação + marca, os três juntos', () => {
  assert.equal(modoDemonstracaoAtivo({ eh_teste: true, modo_demonstracao: true }, 'homologacao'), true)
  assert.equal(modoDemonstracaoAtivo({ eh_teste: true, modo_demonstracao: true }, 'producao'), false)
  assert.equal(modoDemonstracaoAtivo({ eh_teste: true, modo_demonstracao: true }, null), false)
  assert.equal(modoDemonstracaoAtivo({ eh_teste: true, modo_demonstracao: false }, 'homologacao'), false)
  assert.equal(modoDemonstracaoAtivo({ eh_teste: false, modo_demonstracao: true }, 'homologacao'), false)
  assert.equal(modoDemonstracaoAtivo({ eh_teste: true }, 'homologacao'), false)
  assert.equal(modoDemonstracaoAtivo(null, 'homologacao'), false)
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
  // mesmo dentro do modo, documento EXIGIDO e pendente bloqueia
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

test('esteira: 5 caixas, 3 fora da demonstração, contador só dos 2 ativos', () => {
  const e = esteiraDemonstracao([], null)
  assert.deepEqual(e.caixas.map((c) => c.id), ['cte', 'averbacao', 'vpo', 'ciot', 'mdfe'])
  assert.deepEqual(e.caixas.filter((c) => !c.ativo).map((c) => c.id), ['cte', 'averbacao', 'mdfe'])
  assert.ok(e.caixas.filter((c) => !c.ativo).every((c) => c.status === 'Fora desta demonstração'))
  assert.equal(e.contador, '0 de 2')
})

test('esteira: status reais e contador (vale comprado, CIOT emitido, cancelado, em processamento)', () => {
  const comprado = [req('simular'), req('comprar', { id_vpo_antt: '669' })]
  assert.equal(esteiraDemonstracao(comprado, null).contador, '1 de 2')
  assert.equal(esteiraDemonstracao(comprado, 'emitido').contador, '2 de 2')
  const cancelado = esteiraDemonstracao([...comprado, req('cancelar')], 'cancelado')
  assert.equal(cancelado.contador, '0 de 2')
  assert.equal(cancelado.caixas.find((c) => c.id === 'ciot')?.status, 'Cancelado')
  assert.equal(cancelado.caixas.find((c) => c.id === 'vpo')?.status, 'Cancelado')
  const andamento = esteiraDemonstracao([req('simular'), req('comprar', { http_status: null, situacao: 'em_processamento', processando_desde: new Date().toISOString() })], null)
  assert.equal(andamento.caixas.find((c) => c.id === 'vpo')?.status, 'Em processamento')
})

const D: DadosDemo = {
  contratante: { nome: 'RBR CARGO', cnpj: '69115969000104' },
  titular: { nome: 'TRANSPORTADOR', documento: '48386492000121', rntrc: '56802388', pix: '48386492000121' },
  motorista: { nome: 'MOTORISTA', cpf: '12026102422', cnh: '22026102403' },
  veiculos: [{ placa: 'RQW4D58', eixos: 3, cavalo: true }, { placa: 'RRD5B39', eixos: 3, cavalo: false }],
  rota: { origem: 'SAO PAULO/SP', destino: 'CAMPINAS/SP', distanciaKm: 100, ibgeOrigem: '3550308', ibgeDestino: '3509502' },
  carga: { ncm: '39231090', pesoKg: 1000 },
  frete: { total: 8000, adiantamento: 3000 },
  datas: { inicio: '2026-11-20T13:00:00Z', fim: '2026-11-21T13:00:00Z' },
  numeroOperacao: 100008,
  vpo: { idvpo: null, valor: null },
}

test('dados do CIOT: uma linha por dado, origem etiquetada, CPF/CNH/Pix mascarados e "não informado" quando falta', () => {
  const l = linhasDadosCiot(D, { ok: true, piso: 1407.4, tabela: 'A', eixos: 6, distanciaKm: 100 })
  assert.equal(l.length, 10)
  assert.ok(l.every((x) => ['Cadastro', 'Cotação', 'Operação', 'Rota', 'Fiscal'].includes(x.origem)))
  const texto = JSON.stringify(l)
  assert.ok(!texto.includes('12026102422') && !texto.includes('22026102403'))
  assert.ok(!l.find((x) => x.dado === 'Chave Pix')!.valor.includes('48386492000121'))
  assert.equal(l.find((x) => x.dado === 'Número do vale-pedágio')?.valor, NAO_INFORMADO)
  const sem = linhasDadosCiot({ ...D, titular: { nome: null, documento: null, rntrc: null, pix: null }, motorista: { nome: null, cpf: null, cnh: null } }, null)
  assert.equal(sem.find((x) => x.dado === 'Chave Pix')?.valor, NAO_INFORMADO)
  assert.equal(sem.find((x) => x.dado === 'Piso mínimo da ANTT')?.valor, NAO_INFORMADO)
  assert.equal(sem.find((x) => x.dado === 'Motorista, CPF e CNH')?.valor, NAO_INFORMADO)
})

test('dados do vale: placa de teste destacada e valor só depois de simular', () => {
  const l = linhasDadosVpo(D, null, 'GYI1732')
  assert.match(l[0].valor, /GYI1732.*6 eixos.*placa de teste/)
  assert.equal(l.find((x) => x.dado === 'Valor do vale')?.valor, 'aparece depois de Simular')
  assert.match(linhasDadosVpo(D, 'R$ 140,64', 'GYI1732').find((x) => x.dado === 'Valor do vale')!.valor, /140,64/)
  assert.equal(mascarar('12026102422'), '•••••••2422')
})
