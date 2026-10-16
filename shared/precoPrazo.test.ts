// Testes da política de prazo e desconto (precoPrazo.ts). Rodar na raiz do repositório:
//   node --test shared/precoPrazo.test.ts
// Os números vêm dos exemplos da decisão do Pedro (2026-10-16), com alíquota de 6%.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  POLITICA_PADRAO,
  aplicarAjuste,
  avaliarDesconto,
  lerPolitica,
  regraRecebimentoDoPrazo,
  sugestaoDescontosBoleto,
  ajusteDoPrazo,
  corMargem,
  degrauSugerido,
  descontoMaximo,
  descontoValido,
  descontosCondicionaisBoleto,
  escadaDePrazos,
  margem,
  margemAposAjuste,
  negociacao,
  valorFinal,
} from './precoPrazo.ts'

const A = 0.06
const perto = (real: number | null, esperado: number, casas = 3) => {
  assert.ok(real != null, 'valor nulo')
  assert.ok(Math.abs(real - esperado) < 10 ** -casas, `esperado ~${esperado}, veio ${real}`)
}

test('valor final e margem com L = 40% e a = 6%: margem 28,6%', () => {
  const v = valorFinal(1000, 0.4, A)
  assert.equal(v, 1528.38)
  perto(margem(v!, 1000, A), 0.2857)
})

test('margem do valor final não depende da alíquota (margem = L / (1 + L))', () => {
  for (const a of [0, 0.06, 0.15]) perto(margem(valorFinal(10000, 0.4, a)!, 10000, a), 0.4 / 1.4)
})

test('d_max com m0 = 28,6% é 3,8%', () => {
  perto(descontoMaximo(0.4 / 1.4, A), 0.0378)
})

test('para 5% de desconto é preciso m0 de 29,4% (L ≈ 41,7%)', () => {
  perto(descontoMaximo(0.294, A), 0.05)
  const l = 0.294 / (1 - 0.294)
  perto(l, 0.4164, 3)
})

test('m0 = 35% permite 13,2%', () => {
  perto(descontoMaximo(0.35, A), 0.1324)
})

test('margem já abaixo do piso: d_max = 0', () => {
  assert.equal(descontoMaximo(0.2, A), 0)
})

test('desconto de d_max leva exatamente ao piso', () => {
  const v = valorFinal(1000, 0.4, A)!
  const d = descontoMaximo(margem(v, 1000, A)!, A)
  perto(margemAposAjuste(v, -d, 1000, A), 0.26, 3)
})

test('sem prazo escolhido o preço não muda (ajuste 0) e 7 DDL é o preço da cotação', () => {
  assert.equal(ajusteDoPrazo(null), 0)
  assert.equal(ajusteDoPrazo(undefined), 0)
  assert.equal(ajusteDoPrazo('7ddl'), 0)
  assert.equal(aplicarAjuste(1528.38, 0), 1528.38)
})

test('escada: antecipado −2%, à vista −1%, 14/15 +1,5%, 21 +3%, 28 +4%, 30 +4,5%, 2x 0; imposto acompanha', () => {
  const v = 1000
  const linhas = escadaDePrazos(v, 600, A)
  const valor = Object.fromEntries(linhas.map((l) => [l.prazo, l.valor]))
  assert.deepEqual(valor, {
    antecipado: 980,
    a_vista: 990,
    '7ddl': 1000,
    '14ddl': 1015,
    '15ddl': 1015,
    '21ddl': 1030,
    '28ddl': 1040,
    '30ddl': 1045,
    '2x': 1000,
  })
  // margem a 28 DDL = (1040 × 0,94 − 600) / 1040
  perto(linhas.find((l) => l.prazo === '28ddl')!.margem, (1040 * 0.94 - 600) / 1040, 6)
})

test('cores: verde acima de 30%, amarelo de 26% a 30%, vermelho abaixo de 26%', () => {
  assert.equal(corMargem(0.35), 'verde')
  assert.equal(corMargem(0.3), 'amarelo')
  assert.equal(corMargem(0.27), 'amarelo')
  assert.equal(corMargem(0.26), 'amarelo')
  assert.equal(corMargem(0.25), 'vermelho')
  assert.equal(corMargem(null), null)
})

test('cotado a 28 DDL: degraus 28→14 (3%), 28→7 (4%) e por último antecipado (5%, raro)', () => {
  const custo = 12000
  const v28 = aplicarAjuste(valorFinal(custo, 0.4, A)!, 0.04)
  const n = negociacao('28ddl', v28, custo, A)
  assert.deepEqual(
    n.degraus.map((d) => [d.para, d.sugerido, d.raro]),
    [
      ['14ddl', 0.03, false],
      ['7ddl', 0.04, false],
      ['antecipado', 0.05, true],
    ],
  )
  assert.equal(degrauSugerido(n)?.para, '14ddl')
})

test('cotado a 14 DDL com custo de R$ 3 mil: nenhum desconto sugerido pelo valor (faixas)', () => {
  const custo = 3000
  const v14 = aplicarAjuste(valorFinal(custo, 0.45, A)!, 0.015)
  const n = negociacao('14ddl', v14, custo, A)
  assert.ok(n.degraus.every((d) => !d.dentroDaFaixaDeValor))
  assert.equal(degrauSugerido(n), null)
})

test('cotado a 14 DDL com custo de R$ 6 mil: à vista (2%) sugerido; antecipado fora da faixa', () => {
  const custo = 6000
  const v14 = aplicarAjuste(valorFinal(custo, 0.45, A)!, 0.015)
  const n = negociacao('14ddl', v14, custo, A)
  const sug = degrauSugerido(n)
  assert.equal(sug?.para, 'a_vista')
  assert.equal(sug?.sugerido, 0.02)
  assert.equal(sug?.maximo, 0.03)
  assert.equal(n.degraus.find((d) => d.para === 'antecipado')?.dentroDaFaixaDeValor, false)
})

test('7 DDL: só antecipado 2%, e só a partir da faixa de valor', () => {
  const custo = 15000
  const n = negociacao('7ddl', valorFinal(custo, 0.4, A)!, custo, A)
  assert.deepEqual(n.degraus.map((d) => [d.para, d.sugerido]), [['antecipado', 0.02]])
  assert.equal(degrauSugerido(n)?.para, 'antecipado')
})

test('sem espaço: d_max abaixo de 2% mostra o aviso e não sugere degrau', () => {
  const custo = 12000
  // margem ~27%: d_max ~1,4%
  const v = 12000 / (1 - A - 0.27)
  const n = negociacao('14ddl', v, custo, A)
  assert.ok(n.descontoMaximo < 0.02)
  assert.equal(n.semEspaco, true)
  assert.match(n.mensagem ?? '', /Sem espaço para desconto/)
  assert.equal(degrauSugerido(n), null)
  // os degraus continuam visíveis (informa, não bloqueia), marcados como abaixo do piso
  assert.ok(n.degraus.some((d) => d.passaDoPiso))
})

test('teto: nenhum desconto acima de 5%, mesmo se a configuração pedir mais', () => {
  const politica = { ...POLITICA_PADRAO, concessoes: [{ de: ['28ddl' as const], para: '7ddl' as const, min: 0.08, max: 0.09 }] }
  const n = negociacao('28ddl', 10000, 5000, A, politica)
  assert.equal(n.degraus[0].maximo, 0.05)
  assert.equal(n.degraus[0].sugerido, 0.05)
  assert.equal(descontoValido(0.05), true)
  assert.equal(descontoValido(0.051), false)
})

test('boleto 28 DDL com desconto condicional até 14 DDL (3%) e até 7 DDL (4%)', () => {
  const r = descontosCondicionaisBoleto(10400, '2026-11-02', '28ddl', [
    { para: '14ddl', desconto: 0.03 },
    { para: '7ddl', desconto: 0.04 },
    { para: 'antecipado', desconto: 0.05 }, // não é boleto: fica de fora
  ])
  assert.equal(r.vencimento, '2026-11-30')
  assert.deepEqual(r.condicoes, [
    { dataLimite: '2026-11-09', dias: 7, desconto: 0.04, valor: 9984 },
    { dataLimite: '2026-11-16', dias: 14, desconto: 0.03, valor: 10088 },
  ])
})

test('boleto: no máximo 3 datas e só prazos mais curtos que o contratado', () => {
  const r = descontosCondicionaisBoleto(1000, '2026-11-02', '14ddl', [
    { para: '21ddl', desconto: 0.01 },
    { para: '7ddl', desconto: 0.02 },
  ])
  assert.deepEqual(r.condicoes.map((c) => c.dias), [7])
  assert.equal(descontosCondicionaisBoleto(1000, '2026-11-02', 'a_vista', []).vencimento, null)
})

test('15 DDL +1,5%, 30 DDL +4,5% e 2x sem ajuste', () => {
  assert.equal(ajusteDoPrazo('15ddl'), 0.015)
  assert.equal(ajusteDoPrazo('30ddl'), 0.045)
  assert.equal(ajusteDoPrazo('2x'), 0)
})

test('degrau mostra o preço de tabela do prazo de destino só como referência', () => {
  const custo = 12000
  const v = valorFinal(custo, 0.4, A)!
  const n = negociacao('28ddl', aplicarAjuste(v, 0.04), custo, A, POLITICA_PADRAO, v)
  const d14 = n.degraus.find((d) => d.para === '14ddl')!
  assert.equal(d14.valorSugerido, 18502)
  assert.equal(d14.valorTabelaDestino, 18615.72)
})

test('desconto digitado acima do sugerido: permitido até 5%, acima do d_max só marca', () => {
  const custo = 12000
  const v = valorFinal(custo, 0.4, A)!
  const a = avaliarDesconto(0.045, v, custo, A) // d_max a 7 DDL = 3,8%
  assert.equal(a.permitido, true)
  assert.equal(a.acimaDoMaximo, true)
  assert.equal(a.cor, 'vermelho')
  assert.equal(avaliarDesconto(0.06, v, custo, A).permitido, false)
  assert.equal(avaliarDesconto(0.02, v, custo, A).acimaDoMaximo, false)
})

test('regra de recebimento: DDL da liberação, à vista na entrega, antecipado antes, 2x à mão', () => {
  assert.deepEqual(regraRecebimentoDoPrazo('14ddl'), {
    base: 'liberacao',
    modo: 'dias',
    parcelas: [{ dias: 14, percentual: 100 }],
    ajustar_dia_util: true,
  })
  assert.equal(regraRecebimentoDoPrazo('a_vista')?.base, 'entrega')
  assert.equal(regraRecebimentoDoPrazo('antecipado')?.base, 'aprovacao')
  assert.equal(regraRecebimentoDoPrazo('2x'), null)
})

test('lerPolitica: completa com o padrão, ignora lixo e nunca passa de 5%', () => {
  assert.deepEqual(lerPolitica(null), POLITICA_PADRAO)
  const p = lerPolitica({
    ajustePorPrazo: { '28ddl': 0.05, '14ddl': 'x' },
    tetoDesconto: 0.2,
    faixas: { antecipado: { custoMinimo: 8000 } },
    concessoes: [{ de: ['28ddl'], para: '14ddl', min: 0.02, max: 0.09 }, { de: ['xx'], para: '7ddl', max: 0.01 }],
  })
  assert.equal(p.ajustePorPrazo['28ddl'], 0.05)
  assert.equal(p.ajustePorPrazo['14ddl'], 0.015)
  assert.equal(p.tetoDesconto, 0.05)
  assert.equal(p.faixas.antecipado.custoMinimo, 8000)
  assert.equal(p.faixas.a_vista.custoMinimo, 5000)
  assert.deepEqual(p.concessoes, [{ de: ['28ddl'], para: '14ddl', min: 0.02, max: 0.05 }])
})

test('sugestão de descontos do boleto a 28 DDL: 7 DDL 4% e 14 DDL 3%', () => {
  assert.deepEqual(sugestaoDescontosBoleto('28ddl'), [
    { para: '7ddl', desconto: 0.04 },
    { para: '14ddl', desconto: 0.03 },
  ])
  assert.deepEqual(sugestaoDescontosBoleto('7ddl'), [])
  assert.deepEqual(sugestaoDescontosBoleto('a_vista'), [])
})
