// node --test gestor/test/avisos.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  incidentesAcionaveis,
  mostrarAvisoAguardandoCte,
  mostrarAvisoMudancaDocumento,
  mostrarOrdemDocumentos,
  mostrarSeloHomologacao,
  testeEncerrado,
} from '../src/lib/avisos.ts'

const E = { status: 'emitido', ambiente: 'producao' }
const P = { status: 'pendente', ambiente: 'producao' }
const C = { status: 'cancelado', ambiente: 'producao' }

test('operação nova: avisos aparecem', () => {
  assert.equal(mostrarAvisoAguardandoCte(P, P), true)
  assert.equal(mostrarOrdemDocumentos(P, P, P, null), true)
  assert.equal(mostrarAvisoMudancaDocumento('2026-10-16', 'aguardando_liberacao_fiscal', [{ tipo: 'cte', status: 'pendente' }]), true)
  assert.equal(testeEncerrado({ nfeChave: null, cte: P, mdfe: P }), false)
})

test('CT-e emitido e averbado: avisos somem', () => {
  assert.equal(mostrarAvisoAguardandoCte(E, E), false)
  assert.equal(mostrarAvisoAguardandoCte(E, P), false)
  assert.equal(mostrarOrdemDocumentos(E, E, E, 'emitido'), false)
  assert.equal(mostrarOrdemDocumentos(E, E, P, null), true) // ainda falta o MDF-e
  assert.equal(mostrarAvisoMudancaDocumento('2026-10-16', 'aguardando_liberacao_fiscal', [{ tipo: 'cte', status: 'emitido' }]), false)
})

test('documentos cancelados: avisos somem e o teste encerra', () => {
  assert.equal(mostrarAvisoAguardandoCte(C, P), false)
  assert.equal(mostrarOrdemDocumentos(C, E, C, 'emitido'), false)
  assert.equal(mostrarSeloHomologacao({ status: 'cancelado', ambiente: 'homologacao' }), false)
  assert.equal(testeEncerrado({ nfeChave: null, cte: C, mdfe: C }), true)
  assert.equal(testeEncerrado({ nfeChave: '3526...', cte: C, mdfe: C }), false) // NF-e de teste ainda ativa
  assert.equal(testeEncerrado({ nfeChave: null, cte: C, mdfe: E }), false) // MDF-e ainda autorizado
})

test('selo de homologação: só em homologação e ativo', () => {
  assert.equal(mostrarSeloHomologacao({ status: 'emitido', ambiente: 'homologacao' }), true)
  assert.equal(mostrarSeloHomologacao(E), false)
})

test('mudança de documento some depois da saída; incidentes só abertos', () => {
  assert.equal(mostrarAvisoMudancaDocumento('2026-10-16', 'em_transito', []), false)
  assert.equal(mostrarAvisoMudancaDocumento(null, 'aguardando_liberacao_fiscal', []), false)
  assert.deepEqual(incidentesAcionaveis([{ status: 'aberto' }, { status: 'encerrado' }]), [{ status: 'aberto' }])
})
