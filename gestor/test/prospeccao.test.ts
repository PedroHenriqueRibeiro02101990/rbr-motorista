// node --test gestor/test/prospeccao.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  analisarImportacao, bloqueado, calcularPontuacao, motivoNaoAprovar, parseCsv, podeGerarRascunho, rascunhoToque1, temHtml, tipoEmail, validarSintaxeEmail,
} from '../src/lib/prospeccao.ts'

const PESOS = [
  ['funcionarios', 20], ['segmento_cnae', 12], ['email_logistica', 10], ['vende_b2b', 8], ['vagas_logistica', 8], ['mais_de_uma_unidade', 6],
  ['interestadual', 6], ['capital_porte', 6], ['perto_rodovia', 6], ['frota_propria', 4], ['cnpj_3_anos', 4], ['nome_responsavel', 4],
  ['telefone_whatsapp', 3], ['site_ativo', 3],
].map(([criterio, peso]) => ({ criterio: criterio as string, peso: peso as number }))
const tudo = (n: number) => Object.fromEntries(PESOS.map((p) => [p.criterio, n]))

test('os 14 pesos somam 100', () => {
  assert.equal(PESOS.length, 14)
  assert.equal(PESOS.reduce((s, p) => s + p.peso, 0), 100)
})

test('pontuacao e classe: A >= 70, B 50-69, C < 50', () => {
  assert.deepEqual(calcularPontuacao(tudo(1), PESOS, 200, false), { pontuacao: 100, classe: 'A' })
  assert.deepEqual(calcularPontuacao(tudo(0.7), PESOS, 200, false), { pontuacao: 70, classe: 'A' })
  assert.deepEqual(calcularPontuacao(tudo(0.5), PESOS, 200, false), { pontuacao: 50, classe: 'B' })
  assert.deepEqual(calcularPontuacao(tudo(0.49), PESOS, 200, false), { pontuacao: 49, classe: 'C' })
})

test('notas fora de 0..1 sao limitadas; ausentes valem 0', () => {
  assert.equal(calcularPontuacao({ funcionarios: 5, site_ativo: -3 }, PESOS, 100, false).pontuacao, 20)
  assert.equal(calcularPontuacao({}, PESOS, 100, false).pontuacao, 0)
})

test('corte: menos de 50 funcionarios vira C; 50 nao corta; desconhecido nao corta', () => {
  assert.equal(calcularPontuacao(tudo(1), PESOS, 49, false).classe, 'C')
  assert.equal(calcularPontuacao(tudo(1), PESOS, 50, false).classe, 'A')
  assert.equal(calcularPontuacao(tudo(1), PESOS, null, false).classe, 'A')
})

test('penalidade de risco rebaixa uma classe', () => {
  assert.equal(calcularPontuacao(tudo(1), PESOS, 200, true).classe, 'B')
  assert.equal(calcularPontuacao(tudo(0.6), PESOS, 200, true).classe, 'C')
  assert.equal(calcularPontuacao(tudo(0), PESOS, 200, true).classe, 'C')
})

test('e-mail: sintaxe e tipo generico/pessoal', () => {
  assert.ok(validarSintaxeEmail('logistica@empresa.com.br'))
  assert.ok(!validarSintaxeEmail('sem-arroba.com'))
  assert.ok(!validarSintaxeEmail('a@b'))
  assert.equal(tipoEmail('Logistica@x.com'), 'generico')
  assert.equal(tipoEmail('sac@x.com'), 'generico')
  assert.equal(tipoEmail('joao.silva@x.com'), 'pessoal')
})

test('bloqueio por e-mail e por dominio', () => {
  const b = [{ tipo: 'email', valor: 'a@x.com' }, { tipo: 'dominio', valor: 'ruim.com' }]
  assert.ok(bloqueado('A@x.com', b))
  assert.ok(bloqueado('qualquer@ruim.com', b))
  assert.ok(!bloqueado('b@x.com', b))
})

test('aprovar: barra invalido, devolvido e bloqueado', () => {
  const b = [{ tipo: 'dominio', valor: 'ruim.com' }]
  assert.equal(motivoNaoAprovar({ email: 'a@ok.com', validacao_status: 'sintaxe_ok' }, b), null)
  assert.match(motivoNaoAprovar({ email: 'a@ok.com', validacao_status: 'invalido' }, b)!, /inválido/)
  assert.match(motivoNaoAprovar({ email: 'a@ok.com', validacao_status: 'devolvido' }, b)!, /devolvido/)
  assert.match(motivoNaoAprovar({ email: 'a@ruim.com', validacao_status: 'sintaxe_ok' }, b)!, /bloqueio/)
  assert.ok(motivoNaoAprovar(null, b))
})

test('CSV: ; e aspas, BOM e linhas em branco', () => {
  const r = parseCsv('﻿cnpj;razao_social;origem_contato\r\n11222333000181;"Acme; Ltda";"busca ""gratis"""\r\n\r\n')
  assert.equal(r.length, 1)
  assert.equal(r[0].razao_social, 'Acme; Ltda')
  assert.equal(r[0].origem_contato, 'busca "gratis"')
})

test('importacao: erro sem origem, CNPJ ruim, segmento fora do escopo, duplicados e bloqueados', () => {
  const base = { razao_social: 'A', cnpj: '11.222.333/0001-81', segmento: 'bebidas', origem_contato: 'busca', contato_email: 'logistica@a.com' }
  const linhas = [
    base,
    { ...base, origem_contato: '' },
    { ...base, cnpj: '123' },
    { ...base, segmento: 'quimicos' },
    { ...base, cnpj: '22333444000155', contato_email: 'x@ruim.com' },
    { ...base, cnpj: '33444555000122', contato_email: 'logistica@a.com' },
    { ...base, cnpj: '44555666000133', contato_email: 'invalido' },
    { ...base, cnpj: '55666777000144', contato_email: 'ja@existe.com' },
    { ...base, cnpj: '11222333000181' },
  ]
  const r = analisarImportacao(linhas, { cnpjs: new Set(), emails: new Set(['ja@existe.com']) }, [{ tipo: 'dominio', valor: 'ruim.com' }])
  assert.deepEqual(r.map((x) => x.situacao), ['ok', 'erro', 'erro', 'erro', 'bloqueada', 'duplicada', 'ok', 'duplicada', 'duplicada'])
  assert.equal(r[0].contato?.tipo_email, 'generico')
  assert.equal(r[0].empresa?.cnpj, '11222333000181')
  assert.equal(r[6].contato?.validacao_status, 'invalido')
  assert.equal(r[1].linha, 3)
})

test('rascunho do 1o toque: variaveis trocadas, texto puro, sem chaves sobrando', () => {
  const m = rascunhoToque1({ segmento: 'metalurgia', cidade: 'Sorocaba' })
  assert.equal(m.assunto, 'Frete de produtos metalúrgicos saindo de Sorocaba (RBR Cargo)')
  assert.match(m.corpo, /operam com produtos metalúrgicos/)
  assert.ok(!/[{}]/.test(m.assunto + m.corpo))
  assert.ok(!temHtml(m.corpo))
  assert.match(m.corpo, /responda "sair"|responda "sair"\.$/)
  assert.ok(!/R\$|prazo de|disponibilidade/.test(m.corpo))
})

test('so gera rascunho para classe A/B com sintaxe ok', () => {
  assert.ok(podeGerarRascunho('A', 'sintaxe_ok'))
  assert.ok(podeGerarRascunho('B', 'sintaxe_ok'))
  assert.ok(!podeGerarRascunho('C', 'sintaxe_ok'))
  assert.ok(!podeGerarRascunho('A', 'invalido'))
  assert.ok(!podeGerarRascunho('A', null))
})
