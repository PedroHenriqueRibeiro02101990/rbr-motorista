// node --test gestor/test/cadastroPorDocumentos.test.ts   (dados sinteticos; nenhum dado real)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizarExtracao } from '../../supabase/functions/_shared/extracao-documentos.ts'
import { achadosDoPayload, montarPayload, resumoDoQueSeraCriado, temBloqueio, veiculosParaCorrigir, CADASTRO_POR_DOCUMENTOS_HABILITADO } from '../src/lib/cadastroPorDocumentos.ts'

const c = (valor: unknown, confianca = 'alta') => ({ valor, confianca, trecho: 'x' })
const HOJE = '2026-11-18'
const cnh = normalizarExtracao('cnh', { nome: c('Joao Teste'), cpf: c('52998224725'), numero_registro: c('12345678900'), categoria: c('E'), validade: c('2030-05-01'), data_nascimento: c('1985-03-02') }, HOJE)
const cavalo = normalizarExtracao('crlv', { placa: c('MKT6E78'), renavam: c('00000000001'), especie_tipo: c('CAMINHAO TRATOR'), quantidade_eixos: c(3), pbt: c(16.0), cmt: c(60.0), nome_proprietario: c('Joao Teste'), cpf_cnpj_proprietario: c('52998224725'), uf: c('SP') }, HOJE)
const carreta = normalizarExtracao('crlv', { placa: c('MLN9A91'), renavam: c('00000000002'), especie_tipo: c('SEMIRREBOQUE'), quantidade_eixos: c(3), pbt: c(25.5), capacidade_carga: c(16.33), nome_proprietario: c('Joao Teste'), cpf_cnpj_proprietario: c('52998224725') }, HOJE)

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
  const iaCavalo = cr({ placa: 'MKT-6E78', renavam: '00000000001', especie_tipo: 'CAMINHAO TRATOR', quantidade_eixos: 3, pbt: '16.0', cmt: '60.0', capacidade_carga: '*.*', tara: null, nome_proprietario: 'JOAO TESTE', cpf_cnpj_proprietario: '529.982.247-25', uf: 'MA' })
  const iaCarreta = cr({ placa: 'MLN9A91', renavam: '00000000002', especie_tipo: 'SEMIRREBOQUE', quantidade_eixos: 3, pbt: '25.5', capacidade_carga: '16.33', nome_proprietario: 'JOAO TESTE', cpf_cnpj_proprietario: '52998224725', uf: 'MA' })
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

test('Parte D: RG vem do documento e o genero so entra se a pessoa confirmou', () => {
  const rg = normalizarExtracao('rg', { nome: c('Joao Teste'), numero_rg: c('123456'), orgao_emissor: c('SSP'), uf_emissor: c('MA'), cpf: c('52998224725') }, HOJE)
  const sem = montarPayload([{ path: 'l/rg.pdf', tipo: 'rg', normalizado: rg }])
  assert.equal(sem.complemento?.rg_numero, '123456'); assert.equal(sem.complemento?.rg_orgao_emissor, 'SSP'); assert.equal(sem.complemento?.genero, null)
  assert.equal(montarPayload([{ path: 'l/rg.pdf', tipo: 'rg', normalizado: rg, edicoes: { genero: 'M' } }]).complemento?.genero, 'M')
})

// ---- Etapa 32: leitura resistente (front) ----
import { estadoDaLeitura, ROTULO_ESTADO, textoResumoVazio } from '../src/lib/cadastroPorDocumentos.ts'
import { readFileSync } from 'node:fs'

test('(vi) falha da IA vira "Nao foi possivel ler agora" (nunca "Outro (nao reconhecido)") e oferece Tentar de novo', () => {
  const e = estadoDaLeitura({ sucesso: false, codigo: 'ia_indisponivel', erro: 'A leitura automatica esta ocupada agora. Tente de novo em instantes.' })
  assert.equal(e.estado, 'falhou_ia'); assert.equal(ROTULO_ESTADO[e.estado], 'Nao foi possivel ler agora'); assert.notEqual(ROTULO_ESTADO[e.estado], ROTULO_ESTADO.nao_reconhecido)
  assert.equal(estadoDaLeitura(null, true).estado, 'falhou_ia')
  assert.equal(estadoDaLeitura({ sucesso: true, tipo: 'outro', normalizado: null }).estado, 'nao_reconhecido')
  assert.equal(estadoDaLeitura({ sucesso: true, tipo: 'crlv', normalizado: {} }).estado, 'lido')
})
test('(vi) resumo vazio explica a falha de leitura; sem falha mantem o texto antigo', () => {
  assert.equal(textoResumoVazio(['falhou_ia', 'lendo']), 'Nenhum documento foi lido ainda. Use Tentar de novo ou preencha manualmente.')
  assert.equal(textoResumoVazio([]), 'nada ainda: envie ao menos um documento')
})
test('(vi) a tela envia UM arquivo por chamada, no maximo 2 ao mesmo tempo, tem Tentar de novo e Preencher manualmente', () => {
  const f = readFileSync(new URL('../src/components/cadastros/NovoCadastroPorDocumentos.tsx', import.meta.url), 'utf8')
  assert.match(f, /arquivos: \[\{ path, tipo \}\]/); assert.match(f, /rodarComLimite\(paraLer\.map\(\(path\) => \(\) => lerUm\(path\)\), 2\)/)
  for (const t of ['A leitura automatica esta ocupada.', 'Tentar de novo', 'Preencher manualmente']) assert.ok(f.includes(t), t)
})

// ---- Auditoria 19/11: o que chega no banco e o que bloqueia antes de gravar ----
test('payload normaliza o que foi digitado: placa sem traco, CPF/RENAVAM so digitos (a RPC procura por valor exato)', () => {
  const docs = [
    { path: 'a/cnh.pdf', tipo: 'cnh', normalizado: cnh, edicoes: { cpf: '529.982.247-25' } },
    { path: 'a/cavalo.pdf', tipo: 'crlv', normalizado: cavalo, edicoes: { placa: 'mkt-6e78', renavam: '0000.000.0001' } },
  ]
  const p = montarPayload(docs)
  assert.equal(p.motorista?.cpf, '52998224725'); assert.equal(p.cavalo?.placa, 'MKT6E78'); assert.equal(p.cavalo?.renavam, '00000000001')
})
test('sem CPF valido o motorista bloqueia (a RPC o ignoraria em silencio); sem RENAVAM bloqueia; so veiculo sem dono no CRLV bloqueia (nunca cai em quem cadastra)', () => {
  const semCpf = normalizarExtracao('cnh', { nome: c('Joao Teste'), numero_registro: c('1'), validade: c('2030-05-01') }, HOJE)
  const p = montarPayload([{ path: 'a/cnh.pdf', tipo: 'cnh', normalizado: semCpf }])
  const a = achadosDoPayload(p, HOJE)
  assert.ok(a.some((x) => x.campo === 'cpf' && x.nivel === 'bloqueio')); assert.equal(temBloqueio(a), true)
  const semRenavam = normalizarExtracao('crlv', { placa: c('MKT6E78'), especie_tipo: c('CAMINHAO TRATOR'), quantidade_eixos: c(3), pbt: c(16.0) }, HOJE)
  const p2 = montarPayload([{ path: 'a/cavalo.pdf', tipo: 'crlv', normalizado: semRenavam }])
  const a2 = achadosDoPayload(p2, HOJE)
  assert.ok(a2.some((x) => x.campo === 'renavam' && x.nivel === 'bloqueio'))
  assert.ok(a2.some((x) => x.campo === 'proprietario' && x.nivel === 'bloqueio'))
  assert.ok(!a2.some((x) => x.campo === 'titular')) // o aviso "o titular sou eu" nao existe mais: titular so vem do CRLV
})

// ---- 25/11/2026: leitura sem IA, sucesso parcial e fila da IA gratuita ----
import { MSG_FOTO_SEM_LEITURA, ehFoto } from '../src/lib/cadastroPorDocumentos.ts'
test('(25/11) arquivo na fila fica "lendo"; leitura parcial vira "parcial" (nao erro); foto que falha diz para enviar o PDF', () => {
  assert.equal(estadoDaLeitura({ sucesso: true, na_fila: true, leitura_id: 'x', normalizado: null }).estado, 'lendo')
  const p = estadoDaLeitura({ sucesso: true, origem_leitura: 'parcial', normalizado: {}, campos_faltantes: ['validade'] })
  assert.equal(p.estado, 'parcial'); assert.equal(ROTULO_ESTADO.parcial, 'Lido em parte - confira')
  assert.equal(estadoDaLeitura({ sucesso: true, origem_leitura: 'texto', normalizado: {} }).estado, 'lido')
  const f = estadoDaLeitura(null, true, true)
  assert.equal(f.estado, 'falhou_ia'); assert.equal(f.mensagem, MSG_FOTO_SEM_LEITURA)
  assert.match(MSG_FOTO_SEM_LEITURA, /envie o PDF original \(CNH digital, CRLV-e\) ou preencha manualmente/)
  assert.equal(estadoDaLeitura(null, true, false).mensagem, 'A leitura automatica esta ocupada agora. Tente de novo em instantes.')
  assert.equal(ehFoto('x/123-cnh.jpg'), true); assert.equal(ehFoto('x/123-crlv.PDF'), false)
})
test('(25/11) a tela consulta a fila (60 s, a cada 3 s), mostra o selo da IA gratuita e destaca o que falta', () => {
  const f = readFileSync(new URL('../src/components/cadastros/NovoCadastroPorDocumentos.tsx', import.meta.url), 'utf8')
  for (const t of ["modo: 'consultar_fila'", 'ESPERA_FILA_MS', 'Lido por IA gratuita - confira', 'falta: preencha', "reserva: true"]) assert.ok(f.includes(t), t)
  const l = readFileSync(new URL('../src/lib/cadastroPorDocumentos.ts', import.meta.url), 'utf8')
  assert.match(l, /ESPERA_FILA_MS = 60_000/); assert.match(l, /INTERVALO_FILA_MS = 3_000/)
})
