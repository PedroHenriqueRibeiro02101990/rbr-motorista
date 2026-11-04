// node --test gestor/test/proximoPassoQuem.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { proximoPassoQuem, textoProximoPasso } from '../src/lib/proximoPassoQuem.ts'

test('cada fase tem o responsável certo', () => {
  assert.equal(proximoPassoQuem('aguardando_assumir')?.quem, 'Operação')
  assert.equal(proximoPassoQuem('aguardando_liberacao_fiscal')?.quem, 'Fiscal')
  assert.equal(proximoPassoQuem('devolvida_pelo_fiscal')?.quem, 'Operação')
  assert.equal(proximoPassoQuem('pausada_por_alteracao')?.quem, 'Gestor')
  assert.equal(proximoPassoQuem('aguardando_liberacao_gestor')?.quem, 'Gestor')
  assert.equal(proximoPassoQuem('aguardando_aceite_motorista')?.quem, 'Motorista')
})

test('alocando muda o passo conforme já ter motorista', () => {
  assert.match(proximoPassoQuem('alocando_motorista', false)!.passo, /Alocar motorista/)
  assert.match(proximoPassoQuem('alocando_motorista', true)!.passo, /Conferir a alocação/)
})

test('status sem passo (cancelada, fechada) devolve vazio', () => {
  assert.equal(proximoPassoQuem('cancelada'), null)
  assert.equal(textoProximoPasso('fechada'), '')
  assert.equal(textoProximoPasso('aguardando_assumir'), 'Próximo: Assumir a operação (Operação)')
})
