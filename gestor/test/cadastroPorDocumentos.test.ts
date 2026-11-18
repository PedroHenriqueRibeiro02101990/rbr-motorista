// node --test gestor/test/cadastroPorDocumentos.test.ts   (dados sinteticos; nenhum dado real)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizarExtracao } from '../../supabase/functions/_shared/extracao-documentos.ts'
import { achadosDoPayload, montarPayload, resumoDoQueSeraCriado, temBloqueio, veiculosParaCorrigir, CADASTRO_POR_DOCUMENTOS_HABILITADO } from '../src/lib/cadastroPorDocumentos.ts'

const c = (valor: unknown, confianca = 'alta') => ({ valor, confianca, trecho: 'x' })
const HOJE = '2026-11-18'
const cnh = normalizarExtracao('cnh', { nome: c('Joao Teste'), cpf: c('52998224725'), numero_registro: c('12345678900'), categoria: c('E'), validade: c('2030-05-01'), data_nascimento: c('1985-03-02') }, HOJE)
const cavalo = normalizarExtracao('crlv', { placa: c('MKT6E78'), renavam: c('00000000001'), especie_tipo: c('CAMINHAO TRATOR'), quantidade_eixos: c(3), pbt: c(16.0), cmt: c(60.0), cpf_cnpj_proprietario: c('52998224725'), uf: c('SP') }, HOJE)
const carreta = normalizarExtracao('crlv', { placa: c('MLN9A91'), renavam: c('00000000002'), especie_tipo: c('SEMIRREBOQUE'), quantidade_eixos: c(3), pbt: c(25.5), capacidade_carga: c(16.33), cpf_cnpj_proprietario: c('52998224725') }, HOJE)

test('flag do cadastro por documentos sai desligada', () => assert.equal(CADASTRO_POR_DOCUMENTOS_HABILITADO, false))

test('payload: 1 motorista, 1 cavalo, 1 carreta vinculada; carreta usa so tara derivada confirmada', () => {
  const docs = [
    { path: 'a/cnh.pdf', tipo: 'cnh', normalizado: cnh },
    { path: 'a/cavalo.pdf', tipo: 'crlv', normalizado: cavalo },
    { path: 'a/carreta.pdf', tipo: 'crlv', normalizado: carreta, edicoes: { tara_derivada: 1 } },
  ]
  const p = montarPayload(docs)
  assert.equal(resumoDoQueSeraCriado(p), '1 motorista, 1 cavalo, 1 carreta vinculada ao cavalo')
  assert.equal(p.cavalo?.tara_kg, null) // CRLV nao traz tara: nada inventado
  assert.equal(p.carreta?.tara_kg, 9170); assert.equal(p.carreta?.tara_origem, 'derivada_crlv')
  assert.equal(p.carreta?.capacidade_carga, 16330); assert.equal(p.cavalo?.pbt_kg, 16000)
  assert.equal(p.cavalo?.placa, 'MKT6E78')
})
test('sem confirmar a derivada, a tara da carreta nao e gravada', () => {
  const p = montarPayload([{ path: 'a/carreta.pdf', tipo: 'crlv', normalizado: carreta }])
  assert.equal(p.carreta?.tara_kg, null)
})
test('edicao manual vira auditoria e marca manual', () => {
  const p = montarPayload([{ path: 'a/cavalo.pdf', tipo: 'crlv', normalizado: cavalo, edicoes: { tara: 8100 } }])
  assert.equal(p.cavalo?.tara_kg, 8100); assert.ok(p.manual.includes('tara'))
  assert.ok(p.auditoria.some((a) => a.campo === 'tara' && a.editado === true))
})
test('validacoes do payload: tara errada bloqueia; cavalo sem carreta avisa', () => {
  const ruim = montarPayload([{ path: 'a/cavalo.pdf', tipo: 'crlv', normalizado: cavalo, edicoes: { tara: 26 } }])
  assert.ok(temBloqueio(achadosDoPayload(ruim, HOJE)))
  const ok = montarPayload([{ path: 'a/cavalo.pdf', tipo: 'crlv', normalizado: cavalo, edicoes: { tara: 8100 } }])
  const a = achadosDoPayload(ok, HOJE)
  assert.ok(!temBloqueio(a)); assert.ok(a.some((x) => /sem carreta vinculada/.test(x.mensagem)))
})
test('cadastros para corrigir: MKT6E78 (25.5/17.16) e MLN9A91 (9.8/25.5) aparecem; cadastro bom nao', () => {
  const l = veiculosParaCorrigir([
    { placa: 'MKT6E78', tara_kg: 25.5, capacidade_carga: 17.16, tipo_veiculo: 'cavalo' },
    { placa: 'MLN9A91', tara_kg: 9.8, capacidade_carga: 25.5, tipo_veiculo: 'carreta', e_reboque: false },
    { placa: 'OKK1A11', tara_kg: 8100, capacidade_carga: 25000, tipo_veiculo: 'cavalo' },
  ])
  assert.deepEqual(l.map((x) => x.placa), ['MKT6E78', 'MLN9A91'])
  assert.ok(l[0].motivos.length >= 2)
})

test('integracao: saida crua da IA (sintetica) -> normalizacao -> payload -> validacoes, do CRLV ao cadastro vinculado', () => {
  // Simula o JSON que a IA devolveria para dois CRLV e uma CNH (PDFs sinteticos; nenhum dado real)
  const cr = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, c(v)]))
  const iaCavalo = cr({ placa: 'MKT-6E78', renavam: '00000000001', especie_tipo: 'CAMINHAO TRATOR', quantidade_eixos: 3, pbt: '16.0', cmt: '60.0', capacidade_carga: '*.*', tara: null, cpf_cnpj_proprietario: '529.982.247-25', uf: 'MA' })
  const iaCarreta = cr({ placa: 'MLN9A91', renavam: '00000000002', especie_tipo: 'SEMIRREBOQUE', quantidade_eixos: 3, pbt: '25.5', capacidade_carga: '16.33', cpf_cnpj_proprietario: '52998224725', uf: 'MA' })
  const docs = [
    { path: 'l/cnh.pdf', tipo: 'cnh', normalizado: cnh },
    { path: 'l/cavalo.pdf', tipo: 'crlv', normalizado: normalizarExtracao('crlv', iaCavalo, HOJE), edicoes: { tara: 8100 } },
    { path: 'l/carreta.pdf', tipo: 'crlv', normalizado: normalizarExtracao('crlv', iaCarreta, HOJE), edicoes: { tara_derivada: 1 } },
  ]
  const p = montarPayload(docs)
  assert.equal(p.cavalo?.placa, 'MKT6E78'); assert.equal(p.cavalo?.tara_kg, 8100); assert.equal(p.cavalo?.pbt_kg, 16000)
  assert.equal(p.carreta?.tara_kg, 9170); assert.equal(p.carreta?.capacidade_carga, 16330)
  assert.equal(temBloqueio(achadosDoPayload(p, HOJE)), false)
  assert.equal(resumoDoQueSeraCriado(p), '1 motorista, 1 cavalo, 1 carreta vinculada ao cavalo')
  assert.ok(p.auditoria.length > 5)
})
