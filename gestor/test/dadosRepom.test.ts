// node --test gestor/test/dadosRepom.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dadosRepom } from '../src/lib/dadosRepom.ts'

const base = {
  operacao: { peso_bruto: 27400, valor_declarado_nfe: 212000 },
  veiculo: { placa: 'QRT4C21', quantidade_eixos: 5 },
  motorista: { cpf: '123.456.789-09' },
  cotacao: { nf_chave_acesso: '3526 1069 1159 6900 0104 5500 1000 0000 0112 1153 6013', ncms_produtos: ['49111090'] },
  documentos: [{ tipo: 'cte', chave_acesso: '35261069115969000104570010000000011211536013' }],
  condicao: { valor_total_contrato: 1000, valor_adiantamento: 500 },
} as never

const por = (l: ReturnType<typeof dadosRepom>, r: string) => l.find((x) => x.rotulo === r)!

test('Repom: campos principais saem só com dígitos e o Subcontratado fica em branco com aviso', () => {
  const l = dadosRepom(base)
  assert.equal(por(l, 'Placa do cavalo').valor, 'QRT4C21')
  assert.equal(por(l, 'CPF do motorista').valor, '12345678909')
  assert.equal(por(l, 'Chave da NF-e').valor.length, 44)
  assert.equal(por(l, 'Chave do CT-e').valor.length, 44)
  assert.equal(por(l, 'Subcontratado').valor, '')
  assert.match(por(l, 'Subcontratado').aviso ?? '', /em branco de propósito/)
})

test('Repom: adiantamento até 80% do contrato; acima avisa', () => {
  assert.match(por(dadosRepom(base), 'Adiantamento (R$)').aviso ?? '', /até 80%/)
  const alto = { ...(base as object), condicao: { valor_total_contrato: 1000, valor_adiantamento: 900 } } as never
  assert.match(por(dadosRepom(alto), 'Adiantamento (R$)').aviso ?? '', /Acima de 80%/)
})

test('Repom: sem peso na NF avisa', () => {
  const semPeso = { ...(base as object), operacao: { peso_bruto: null, valor_declarado_nfe: 1 } } as never
  assert.match(por(dadosRepom(semPeso), 'Peso (kg)').aviso ?? '', /não trouxe o peso/)
})
