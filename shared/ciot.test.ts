// node --test shared/ciot.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { separarCiotDigitado } from './ciot.ts'

test('CIOT de 16 dígitos colado separa em 12 + 4; 12 dígitos fica sem verificador', () => {
  assert.deepEqual(separarCiotDigitado('1234 5678 9012 3456'), { ciot: '123456789012', verificador: '3456' })
  assert.deepEqual(separarCiotDigitado('123456789012'), { ciot: '123456789012', verificador: null })
  assert.equal(separarCiotDigitado('12345678901'), null)
  assert.equal(separarCiotDigitado(''), null)
})
