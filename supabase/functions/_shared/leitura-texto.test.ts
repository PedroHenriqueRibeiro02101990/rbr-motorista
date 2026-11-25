// node --test supabase/functions/_shared/leitura-texto.test.ts   (sem rede, sem PDF real: texto sintetico com os mesmos rotulos)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { camposFaltantes, classificarPorTexto, lerCnh, lerCrlv, lerRntrc, lerSemIa, textoDoXml } from './leitura-texto.ts'
import { normalizarExtracao } from './extracao-documentos.ts'

const HOJE = '2026-11-25'
const v = (b: Record<string, unknown> | null, k: string) => (b?.[k] as { valor: unknown } | undefined)?.valor ?? null

// CPF 529.982.247-25 e CNPJ 11.222.333/0001-81 sao numeros de teste validos (digitos verificadores corretos).
const CNH_INLINE = `REPUBLICA FEDERATIVA DO BRASIL  MINISTERIO DOS TRANSPORTES  CARTEIRA NACIONAL DE HABILITACAO
NOME E SOBRENOME
JOAO DA SILVA TESTE
DOC. IDENTIDADE / ORG. EMISSOR / UF 1234567 SSP SP
CPF 529.982.247-25 DATA NASCIMENTO 02/10/1980
FILIACAO MARIA TESTE
CAT. HAB. E
Nº REGISTRO 01234567890 VALIDADE 15/03/2031 1ª HABILITAÇÃO 10/01/2002`

const CNH_LINHAS = `CARTEIRA NACIONAL DE HABILITAÇÃO
Nome
JOSE DE SOUZA TESTE
CPF
529.982.247-25
Data de nascimento 1ª Habilitação Validade
05/06/1975 20/02/1999 30/09/2030
Cat. Hab. AE
Nº Registro 09876543210`

test('CNH digital (rotulos com valor ao lado): todos os campos, datas ISO e CPF so digitos', () => {
  const b = lerCnh(CNH_INLINE)
  assert.equal(v(b, 'nome'), 'JOAO DA SILVA TESTE')
  assert.equal(v(b, 'cpf'), '52998224725')
  assert.equal(v(b, 'numero_registro'), '01234567890')
  assert.equal(v(b, 'categoria'), 'E')
  assert.equal(v(b, 'validade'), '2031-03-15')
  assert.equal(v(b, 'data_nascimento'), '1980-10-02')
  assert.equal(v(b, 'primeira_habilitacao'), '2002-01-10')
  assert.deepEqual(camposFaltantes('cnh', b), [])
})

test('CNH digital (linha de rotulos e depois linha de datas): atribui pela ordem; categoria AE', () => {
  const b = lerCnh(CNH_LINHAS)
  assert.equal(v(b, 'nome'), 'JOSE DE SOUZA TESTE')
  assert.equal(v(b, 'cpf'), '52998224725')
  assert.equal(v(b, 'categoria'), 'AE')
  assert.equal(v(b, 'data_nascimento'), '1975-06-05')
  assert.equal(v(b, 'primeira_habilitacao'), '1999-02-20')
  assert.equal(v(b, 'validade'), '2030-09-30')
  assert.equal(v(b, 'numero_registro'), '09876543210')
})

test('CNH: CPF com digito errado nao entra (null + faltante), nunca inventa', () => {
  const b = lerCnh(CNH_INLINE.replace('529.982.247-25', '529.982.247-26'))
  assert.equal(v(b, 'cpf'), null)
  assert.ok(camposFaltantes('cnh', b).includes('cpf'))
})

test('CNH: datas ambiguas (3 datas, 2 rotulos achados) ficam null em vez de chute', () => {
  const b = lerCnh('CARTEIRA NACIONAL DE HABILITACAO Nº REGISTRO 01234567890 CAT. HAB. B VALIDADE 01/01/2030 outra 02/02/2020 mais 03/03/2010')
  assert.equal(v(b, 'validade'), '2030-01-01')
  assert.equal(v(b, 'data_nascimento'), null)
})

test('CNH passa pela normalizacao do sistema (CNH vencida avisa; idade sugerida)', () => {
  const b = lerCnh(CNH_INLINE.replace('15/03/2031', '15/03/2025'))!
  const n = normalizarExtracao('cnh', b, HOJE)
  assert.equal(n.campos.validade.valor, '2025-03-15')
  assert.ok(n.avisos.includes('CNH vencida.'))
  assert.equal(n.campos.primeira_habilitacao.valor, '2002-01-10')
  assert.equal(n.deducoes.idade?.valor, 46)
})

const CRLV_INLINE = `CERTIFICADO DE REGISTRO E LICENCIAMENTO DE VEÍCULO - DIGITAL (CRLV-e)
CÓDIGO RENAVAM 01234567890 PLACA ABC1D23 EXERCÍCIO 2026
ANO FABRICAÇÃO 2015 ANO MODELO 2016
MARCA / MODELO / VERSÃO SCANIA/R 450 A6X2
CHASSI 9BSR6X20003123456
ESPÉCIE / TIPO
CARGA / CAMINHÃO TRATOR
CARROCERIA NAO APLICAVEL
CAPACIDADE 0,0 PESO BRUTO TOTAL 29,0 CMT 45,0 EIXOS 3
NOME
TRANSPORTES TESTE LTDA
CPF / CNPJ 11.222.333/0001-81
LOCAL CAMPINAS SP DATA 10/02/2026`

const CRLV_ROTULOS_JUNTOS = `CRLV-e CERTIFICADO DE REGISTRO E LICENCIAMENTO DE VEICULO
CÓDIGO RENAVAM PLACA EXERCÍCIO
09876543210 MLN9A91 2026
ANO FABRICAÇÃO ANO MODELO
2019 2020
CHASSI
9A9S1234567890123
ESPÉCIE / TIPO
CARGA / SEMI-REBOQUE
CARROCERIA
GRADE BAIXA
NOME
JOAO DA SILVA TESTE
CPF / CNPJ
529.982.247-25
LOCAL
GOIANIA GO`

test('CRLV-e (valor ao lado do rotulo): campos principais, placa sem traco, documento so digitos', () => {
  const b = lerCrlv(CRLV_INLINE)
  assert.equal(v(b, 'placa'), 'ABC1D23')
  assert.equal(v(b, 'renavam'), '01234567890')
  assert.equal(v(b, 'chassi'), '9BSR6X20003123456')
  assert.equal(v(b, 'ano_fabricacao'), 2015)
  assert.equal(v(b, 'ano_modelo'), 2016)
  assert.equal(v(b, 'exercicio'), 2026)
  assert.equal(v(b, 'especie_tipo'), 'CARGA / CAMINHAO TRATOR')
  assert.equal(v(b, 'cpf_cnpj_proprietario'), '11222333000181')
  assert.equal(v(b, 'nome_proprietario'), 'TRANSPORTES TESTE LTDA')
  assert.equal(v(b, 'uf'), 'SP')
  assert.equal(v(b, 'tara'), null) // CRLV digital nao traz tara
  assert.deepEqual(camposFaltantes('crlv', b), [])
})

test('CRLV-e (rotulos em linha e valores na linha de baixo): le o que o formato permite e aponta o resto', () => {
  const b = lerCrlv(CRLV_ROTULOS_JUNTOS)
  assert.equal(v(b, 'placa'), 'MLN9A91')
  assert.equal(v(b, 'chassi'), '9A9S1234567890123')
  assert.equal(v(b, 'ano_fabricacao'), 2019)
  assert.equal(v(b, 'ano_modelo'), 2020)
  assert.equal(v(b, 'especie_tipo'), 'CARGA / SEMI-REBOQUE')
  assert.equal(v(b, 'carroceria'), 'GRADE BAIXA')
  assert.equal(v(b, 'cpf_cnpj_proprietario'), '52998224725')
  assert.equal(v(b, 'uf'), 'GO')
  // renavam esta na linha de valores, fora da janela do rotulo? se nao leu, e faltante (nao inventa)
  const falt = camposFaltantes('crlv', b)
  assert.ok(falt.every((k) => ['renavam'].includes(k)), `faltantes inesperados: ${falt}`)
})

test('CRLV-e passa pela normalizacao (semirreboque: e_reboque; pesos em t viram kg)', () => {
  const n = normalizarExtracao('crlv', lerCrlv(CRLV_INLINE.replace('CAMINHÃO TRATOR', 'SEMI-REBOQUE'))!, HOJE)
  assert.equal(n.campos.placa.valor, 'ABC1D23')
  assert.equal(n.campos.pbt.valor, 29000)
  assert.equal(n.deducoes.e_reboque?.valor, true)
})

test('CRLV: placa invalida e chassi so de letras nao entram', () => {
  const b = lerCrlv('CRLV RENAVAM 01234567890 PLACA AAAAAAA CHASSI ABCDEFGHJKLMNPRST')
  assert.equal(v(b, 'placa'), null)
  assert.equal(v(b, 'chassi'), null)
})

const RNTRC_TXT = `AGÊNCIA NACIONAL DE TRANSPORTES TERRESTRES - ANTT
Certificado de Registro Nacional de Transportadores Rodoviários de Cargas - RNTRC
RNTRC: 012345678
Transportador: JOSE DE SOUZA TESTE
CPF/CNPJ: 529.982.247-25
Tipo: TAC - Transportador Autônomo de Cargas
Situação: ATIVO
Validade: 20/08/2028`

test('RNTRC: numero, titular, tipo, situacao e validade ISO', () => {
  const b = lerRntrc(RNTRC_TXT)
  assert.equal(v(b, 'numero'), '012345678')
  assert.equal(v(b, 'titular'), 'JOSE DE SOUZA TESTE')
  assert.equal(v(b, 'tipo_transportador'), 'TAC')
  assert.equal(v(b, 'situacao'), 'ativo')
  assert.equal(v(b, 'validade'), '2028-08-20')
  assert.deepEqual(camposFaltantes('rntrc', b), [])
  const n = normalizarExtracao('rntrc', b!, HOJE)
  assert.equal(n.campos.numero.valor, '012345678')
  assert.equal(n.campos.validade.valor, '2028-08-20')
})

test('classificarPorTexto reconhece CNH, CRLV-e e RNTRC sem confundir entre si e mantem VPR/contrato', () => {
  assert.equal(classificarPorTexto(CNH_INLINE), 'cnh')
  assert.equal(classificarPorTexto(CRLV_INLINE), 'crlv')
  assert.equal(classificarPorTexto(RNTRC_TXT), 'rntrc')
  assert.equal(classificarPorTexto('Contrato de Transporte de Carga CIOT: 123456789012'), 'contrato_ciot_repom')
  assert.equal(classificarPorTexto('Vale Pedagio Repom IdVpo: 12345678901234567890'), 'vpr_vale_pedagio')
  assert.equal(classificarPorTexto('um boleto qualquer sem relacao nenhuma'), null)
})

test('lerSemIa: foto/imagem devolve null (sem texto: so IA le); XML com texto classifica e le', async () => {
  assert.equal(await lerSemIa(new Uint8Array([1, 2, 3]), 'image/jpeg', null), null)
  const xml = new TextEncoder().encode(`<?xml version="1.0"?><doc><t>${RNTRC_TXT.replace(/\n/g, '</t><t>')}</t></doc>`)
  assert.ok(textoDoXml(xml).includes('RNTRC: 012345678'))
  const r = await lerSemIa(xml, 'application/xml', null)
  assert.equal(r?.tipo, 'rntrc')
  assert.equal(r?.completo, true)
  assert.equal(r?.tipoAutomatico, true)
})

test('lerSemIa: texto de tipo desconhecido volta com tipo null (nao inventa tipo)', async () => {
  const xml = new TextEncoder().encode('<a>' + 'texto qualquer sem rotulo conhecido. '.repeat(10) + '</a>')
  const r = await lerSemIa(xml, 'text/xml', null)
  assert.equal(r?.tipo, null)
  assert.equal(r?.completo, false)
})
