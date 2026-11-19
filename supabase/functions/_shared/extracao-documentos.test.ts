// node --test supabase/functions/_shared/extracao-documentos.test.ts   (sem rede; dados sinteticos)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizarExtracao, conferenciaCruzada, schemaDoTipo, sugerirGenero } from './extracao-documentos.ts'

const c = (valor: unknown, confianca = 'alta') => ({ valor, confianca, trecho: 'x' })
const HOJE = '2026-11-18'

test('CRLV de semirreboque: 25.5 t vira 25.500 kg com conversao registrada; marca e_reboque; deriva tara so da carreta', () => {
  const n = normalizarExtracao('crlv', {
    placa: c('mln-9a91'), especie_tipo: c('SEMIRREBOQUE'), pbt: c(25.5), capacidade_carga: c(16.33), tara: c(null), cmt: c('*.*'),
  }, HOJE)
  assert.equal(n.campos.pbt.valor, 25500); assert.match(n.campos.pbt.observacao ?? '', /25,5 t para 25.500 kg/)
  assert.equal(n.campos.placa.valor, 'MLN9A91')
  assert.equal(n.deducoes.e_reboque?.valor, true)
  assert.equal(n.deducoes.tara_derivada_crlv?.valor, 9170)
  assert.equal(n.campos.cmt.valor, null); assert.ok(n.campos.cmt.motivo_nulo)
  assert.equal(n.campos.tara.valor, null)
})
test('CRLV de cavalo: PBT nunca vira tara; e_reboque=false; sem derivar', () => {
  const n = normalizarExtracao('crlv', { especie_tipo: c('CAMINHAO TRATOR'), pbt: c(16.0), tara: c(16.0), capacidade_carga: c(null) }, HOJE)
  assert.equal(n.campos.tara.valor, null); assert.equal(n.deducoes.e_reboque?.valor, false)
  assert.equal(n.deducoes.tara_derivada_crlv, undefined)
})
test('9.8 t vira 9.800 kg e 7980 kg fica', () => {
  const n = normalizarExtracao('crlv', { especie_tipo: c('SEMIRREBOQUE'), tara: c(9.8), capacidade_carga: c(7980) }, HOJE)
  assert.equal(n.campos.tara.valor, 9800); assert.equal(n.campos.capacidade_carga.valor, 7980)
})
test('LXX2816: capacidade igual ao PBT nao deriva e avisa', () => {
  const n = normalizarExtracao('crlv', { especie_tipo: c('SEMIRREBOQUE'), pbt: c(35.0), capacidade_carga: c(35.0) }, HOJE)
  assert.equal(n.deducoes.tara_derivada_crlv, undefined); assert.ok(n.avisos.some((a) => /igual ao PBT/.test(a)))
})
test('CNH: idade, genero sugerido, vencida e menor de idade viram aviso (nada gravado)', () => {
  const n = normalizarExtracao('cnh', { nome: c('Joao da Silva'), validade: c('2026-01-01'), data_nascimento: c('1980-05-10'), cpf: c('529.982.247-25') }, HOJE)
  assert.equal(n.deducoes.idade.valor, 46); assert.equal(n.deducoes.genero.valor, 'M'); assert.equal(n.deducoes.genero.confianca, 'media')
  assert.ok(n.avisos.includes('CNH vencida.')); assert.equal(n.campos.cpf.valor, '52998224725')
  assert.equal(sugerirGenero('Qualquer', 'F')?.confianca, 'alta')
})
test('comprovante com mais de 90 dias alerta; CEP completa cidade; titular diferente na conferencia cruzada', () => {
  const cr = normalizarExtracao('comprovante_residencia', { nome_titular: c('Maria Souza'), cep: c('65285-000'), data_emissao: c('2026-06-01') }, HOJE)
  assert.ok(cr.avisos.some((a) => /mais de 90/.test(a))); assert.ok(cr.deducoes.cidade_uf_pelo_cep)
  const cnh = normalizarExtracao('cnh', { nome: c('Joao da Silva'), cpf: c('52998224725') }, HOJE)
  assert.ok(conferenciaCruzada([cnh, cr]).some((m) => /outra pessoa/.test(m)))
})
test('CIOT de 16 digitos vira 12 + 4; valores em formato brasileiro', () => {
  const n = normalizarExtracao('contrato_ciot_repom', { ciot: c('5200480384321483'), valor_frete: c('R$ 24.210,33'), adiantamento: c('R$ 4.842,07'), saldo: c('19.368,26'), placa: c('abc-1d23') }, HOJE)
  assert.equal(n.campos.ciot.valor, '520048038432'); assert.equal(n.deducoes.ciot_verificador.valor, '1483')
  assert.equal(n.campos.valor_frete.valor, 24210.33); assert.equal(n.campos.saldo.valor, 19368.26); assert.equal(n.campos.placa.valor, 'ABC1D23')
})
test('VPR: IDVPO de 20 digitos e valor', () => {
  const n = normalizarExtracao('vpr_vale_pedagio', { idvpo: c('96670000000000000001'), valor_total: c('R$ 236,27') }, HOJE)
  assert.equal(n.campos.idvpo.valor, '96670000000000000001'); assert.equal(n.campos.valor_total.valor, 236.27); assert.deepEqual(n.avisos, [])
  assert.ok(normalizarExtracao('vpr_vale_pedagio', { idvpo: c('123') }, HOJE).avisos.length)
})
test('campo ausente: null com motivo, nunca inventado; schema tem confianca por campo', () => {
  const n = normalizarExtracao('cnh', {}, HOJE)
  assert.equal(n.campos.nome.valor, null); assert.ok(n.campos.nome.motivo_nulo)
  assert.ok((schemaDoTipo('crlv').properties as Record<string, { properties: Record<string, unknown> }>).tara.properties.confianca)
})

// ---- Auditoria 19/11: datas ISO, placa/renavam/uf/categoria normalizados ----
import { paraIso } from './extracao-documentos.ts'
test('paraIso: ISO fica, DD/MM/AAAA vira ISO (nunca MM/DD), impossivel vira null', () => {
  assert.equal(paraIso('2030-05-01'), '2030-05-01')
  assert.equal(paraIso('12/05/2030'), '2030-05-12') // 12 de maio, nao 5 de dezembro
  assert.equal(paraIso('01.02.2031'), '2031-02-01')
  assert.equal(paraIso('31/02/2030'), null)
  assert.equal(paraIso('13/13/2030'), null)
  assert.equal(paraIso('maio de 2030'), null)
  assert.equal(paraIso(''), null)
  assert.equal(paraIso(null), null)
})
test('CNH com datas em DD/MM/AAAA: gravam em ISO; data impossivel vira null com aviso e confianca baixa', () => {
  const n = normalizarExtracao('cnh', { nome: c('Joao da Silva'), validade: c('12/05/2030'), data_nascimento: c('31/02/1980'), cpf: c('52998224725') }, HOJE)
  assert.equal(n.campos.validade.valor, '2030-05-12')
  assert.equal(n.campos.data_nascimento.valor, null); assert.equal(n.campos.data_nascimento.confianca, 'baixa')
  assert.ok(n.avisos.some((a) => /data_nascimento/.test(a)))
  // idempotente: reaplicar na saida nao muda (a tela do lancamento manual normaliza de novo)
  const campos = Object.fromEntries(Object.entries(n.campos).map(([k, v]) => [k, { valor: v.valor, confianca: v.confianca }]))
  assert.equal(normalizarExtracao('cnh', campos, HOJE).campos.validade.valor, '2030-05-12')
})
test('CPF com digito errado: aviso e confianca baixa (nao bloqueia a leitura)', () => {
  const n = normalizarExtracao('cnh', { cpf: c('529.982.247-26') }, HOJE)
  assert.equal(n.campos.cpf.valor, '52998224726'); assert.equal(n.campos.cpf.confianca, 'baixa'); assert.ok(n.avisos.some((a) => /CPF/.test(a)))
  assert.equal(normalizarExtracao('cnh', { cpf: c('52998224725') }, HOJE).avisos.some((a) => /CPF/.test(a)), false)
})
test('CRLV: RENAVAM so digitos, chassi sem pontuacao, UF maiuscula, placa invalida avisa', () => {
  const n = normalizarExtracao('crlv', { placa: c('mkt-6e78'), renavam: c('0123.456.789-0'), chassi: c('9bw zzz 377vt004251'), uf: c('sp'), especie_tipo: c('CAMINHAO TRATOR') }, HOJE)
  assert.equal(n.campos.placa.valor, 'MKT6E78'); assert.equal(n.campos.renavam.valor, '01234567890')
  assert.equal(n.campos.chassi.valor, '9BWZZZ377VT004251'); assert.equal(n.campos.uf.valor, 'SP')
  assert.equal(n.avisos.some((a) => /Placa lida/.test(a)), false)
  const ruim = normalizarExtracao('crlv', { placa: c('MKT6E7') }, HOJE)
  assert.equal(ruim.campos.placa.confianca, 'baixa'); assert.ok(ruim.avisos.some((a) => /Placa lida/.test(a)))
})
test('VPR: categoria vira 2 digitos da lista; fora da lista nao entra', () => {
  assert.equal(normalizarExtracao('vpr_vale_pedagio', { categoria: c('7') }, HOJE).campos.categoria.valor, '07')
  const f = normalizarExtracao('vpr_vale_pedagio', { categoria: c('99') }, HOJE)
  assert.equal(f.campos.categoria.valor, null); assert.ok(f.avisos.some((a) => /Categoria/.test(a)))
})
