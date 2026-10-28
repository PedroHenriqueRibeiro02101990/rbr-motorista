// node --test gestor/test/datasPrevistas.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { doInput, paraInput, validarDatasPrevistas } from '../src/lib/datasPrevistas.ts'

const agora = new Date('2026-10-28T12:00:00Z')

test('duas datas em branco: sem erro (a viagem usa o padrão)', () => assert.equal(validarDatasPrevistas('', '', agora), null))
test('só uma preenchida: erro', () => assert.match(validarDatasPrevistas('2026-10-30T08:00', '', agora)!, /coleta e a entrega/))
test('entrega antes da coleta: erro', () => assert.match(validarDatasPrevistas('2026-10-31T08:00', '2026-10-30T08:00', agora)!, /depois da coleta/))
test('entrega no passado: erro', () => assert.match(validarDatasPrevistas('2026-10-01T08:00', '2026-10-02T08:00', agora)!, /já passou/))
test('datas boas: sem erro', () => assert.equal(validarDatasPrevistas('2026-10-30T08:00', '2026-10-31T08:00', agora), null))
test('ida e volta do campo datetime-local mantém o instante', () => {
  const iso = '2026-10-30T11:00:00.000Z'
  assert.equal(doInput(paraInput(iso)), iso)
  assert.equal(paraInput(null), '')
  assert.equal(doInput(''), null)
})
