// node --test gestor/test/origemCotacao.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  avisoRemetenteDiferente,
  erroOrigemManual,
  origemAoTrocarCliente,
  origemDaCotacao,
  origemEfetiva,
  patchOrigem,
  type OrigemForm,
} from '../src/lib/origemCotacao.ts'

// Cenário real: cliente Logik Log (Itupeva/SP), carga parada em São Sebastião da Bela Vista/MG.
const logik = { logradouro: 'AVENIDA EMILIO CHECCHINATO', numero_endereco: '1000', bairro: 'Distrito Industrial', cidade: 'Itupeva', uf: 'SP', cep: '13295-274' }
const outro = { cidade: 'Campinas', uf: 'SP' }
const doCliente: OrigemForm = { origem_manual: false, origem_cep: '', origem_endereco: '', cidade_origem: 'Itupeva', uf_origem: 'SP' }
const manual: OrigemForm = {
  origem_manual: true,
  origem_cep: '37567-000',
  origem_endereco: 'Rodovia MG-290, km 12 — Zona Rural',
  cidade_origem: 'São Sebastião da Bela Vista',
  uf_origem: 'mg',
}

test('sem coleta manual: origem efetiva = cliente (e o endereço do cliente vai para a rota por destino)', () => {
  const e = origemEfetiva(doCliente, logik)
  assert.equal(e.manual, false)
  assert.equal(e.cidade, 'Itupeva')
  assert.equal(e.uf, 'SP')
  assert.match(e.textoRota, /EMILIO CHECCHINATO.*Itupeva\/SP/)
  assert.deepEqual(e.corpoRota, { endereco_origem: e.textoRota })
  assert.deepEqual(patchOrigem(doCliente, logik), { cidade_origem: 'Itupeva', uf_origem: 'SP', origem_cep: null, origem_endereco: null })
})

test('coleta em outro local: origem efetiva = manual em tudo (rota, cidade/UF gravadas, CEP e endereço)', () => {
  const e = origemEfetiva(manual, logik)
  assert.equal(e.manual, true)
  assert.equal(e.cidade, 'São Sebastião da Bela Vista')
  assert.equal(e.uf, 'MG')
  assert.equal(e.textoRota, 'Rodovia MG-290, km 12 — Zona Rural — São Sebastião da Bela Vista/MG — CEP 37567000')
  assert.deepEqual(e.corpoRota, { cidade_origem: 'São Sebastião da Bela Vista', uf_origem: 'MG' })
  assert.deepEqual(patchOrigem(manual, logik), {
    cidade_origem: 'São Sebastião da Bela Vista',
    uf_origem: 'MG',
    origem_cep: '37567000',
    origem_endereco: 'Rodovia MG-290, km 12 — Zona Rural',
  })
})

test('trocar o cliente não apaga a origem manual; sem manual, segue o novo cliente', () => {
  assert.deepEqual(origemAoTrocarCliente(manual, outro), { cidade_origem: 'São Sebastião da Bela Vista', uf_origem: 'mg' })
  assert.deepEqual(origemAoTrocarCliente(doCliente, outro), { cidade_origem: 'Campinas', uf_origem: 'SP' })
})

test('CEP obrigatório só na coleta em outro local', () => {
  assert.equal(erroOrigemManual(doCliente), null)
  assert.equal(erroOrigemManual(manual), null)
  assert.match(erroOrigemManual({ ...manual, origem_cep: '' }) ?? '', /CEP/)
  assert.match(erroOrigemManual({ ...manual, origem_cep: '3756' }) ?? '', /CEP/)
  assert.match(erroOrigemManual({ ...manual, uf_origem: '' }) ?? '', /cidade e a UF/)
})

test('reabrir: CEP gravado volta como coleta em outro local', () => {
  assert.deepEqual(origemDaCotacao({ origem_cep: '37567000', origem_endereco: 'Rod. MG-290' }), { origem_manual: true, origem_cep: '37567000', origem_endereco: 'Rod. MG-290' })
  assert.equal(origemDaCotacao({ origem_cep: null }).origem_manual, false)
  assert.equal(origemDaCotacao({}).origem_manual, false)
})

test('aviso amarelo quando a coleta difere do remetente da NF-e (sem diferença de acento/maiúscula)', () => {
  assert.match(avisoRemetenteDiferente(manual, { municipio: 'Itupeva', uf: 'SP' }) ?? '', /Coleta em São Sebastião da Bela Vista\/MG, diferente .*\(Itupeva\/SP\)/)
  assert.equal(avisoRemetenteDiferente(manual, { municipio: 'SAO SEBASTIAO DA BELA VISTA', uf: 'MG' }), null)
  assert.equal(avisoRemetenteDiferente(doCliente, { municipio: 'Itupeva', uf: 'SP' }), null)
  assert.equal(avisoRemetenteDiferente(manual, null), null)
})
