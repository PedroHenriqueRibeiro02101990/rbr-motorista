// node --test shared/ordemColetaPdf.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { desenharOrdemColeta, secoesOrdemColeta, type OrdemColeta, type PdfLike } from './ordemColetaPdf.ts'

const base: OrdemColeta = {
  codigo: '150CBC5D-v1',
  rota: 'SÃO SEBASTIÃO DA BELA VISTA/MG → CAMPINAS/SP',
  endereco_carregamento: 'Rodovia MG-290, km 12, Zona Rural',
  cep_carregamento: '37567000',
  cidade_carregamento: 'São Sebastião da Bela Vista',
  uf_carregamento: 'MG',
  contato_nome: 'João (portaria)',
  contato_telefone: '(35) 99999-0000',
  coleta_prevista_em: '2026-10-24T11:00:00Z',
  carga_descricao: 'Peças metálicas',
  peso_kg: 12000,
  volumes: 8,
  documentos: [{ tipo: 'cte', numero: '18' }, { tipo: 'mdfe', numero: '7' }],
  observacoes: null,
  motorista: 'Motorista Teste',
  placa: 'ABC1D23',
  gerada_em: '2026-10-23T12:00:00Z',
  empresa: { nome: 'RBR Cargo', telefone: '(11) 95397-7966' },
}

test('seções com local, contato, data, carga e documentos', () => {
  const s = secoesOrdemColeta(base)
  assert.deepEqual(s.map((x) => x.titulo), ['Local de carregamento', 'Contato no local', 'Data da coleta', 'Carga', 'Documentos da viagem', 'Motorista e veículo'])
  assert.equal(s[0].linhas[1][1], 'São Sebastião da Bela Vista/MG · CEP 37567-000')
  assert.equal(s[2].linhas[0][1], '24/10/2026, 08:00') // horário de Brasília
  assert.equal(s[3].linhas[0][1], 'Peças metálicas · 12.000 kg · 8 volume(s)')
  assert.deepEqual(s[4].linhas, [['CT-e', 'nº 18'], ['MDF-e', 'nº 7']])
})

test('sem contato, data e documentos: textos de "a confirmar"', () => {
  const s = secoesOrdemColeta({ ...base, contato_nome: null, coleta_prevista_em: null, documentos: [], motorista: null, placa: null })
  assert.equal(s[1].linhas[0][1], 'a confirmar com a RBR')
  assert.equal(s[2].linhas[0][1], 'a combinar')
  assert.equal(s[4].linhas[0][1], 'A RBR envia os documentos antes da saída.')
  assert.ok(!s.some((x) => x.titulo === 'Motorista e veículo'))
})

test('desenho escreve o título, a rota sem seta e o endereço', () => {
  const textos: string[] = []
  const doc: PdfLike = {
    setFont: () => {}, setFontSize: () => {}, setTextColor: () => {}, setDrawColor: () => {}, line: () => {}, addPage: () => {},
    splitTextToSize: (t: string) => [t],
    text: (t: string | string[]) => { textos.push(...(Array.isArray(t) ? t : [t])) },
  }
  desenharOrdemColeta(doc, base)
  assert.ok(textos.includes('Ordem de coleta'))
  assert.ok(textos.includes('SÃO SEBASTIÃO DA BELA VISTA/MG -> CAMPINAS/SP'))
  assert.ok(textos.includes('Rodovia MG-290, km 12, Zona Rural'))
})
