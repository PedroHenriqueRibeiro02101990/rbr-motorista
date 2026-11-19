// node --test gestor/test/prospeccaoPainel.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { corDaCaixa, funilVazio, FUNIL_EXEMPLO, gastoDoDiaEDoMes, larguraBarra, pct, pesosAlterados, situacaoGasto, taxaPorSegmento, taxaPorToque, validarPesos } from '../src/lib/prospeccaoPainel.ts'

test('barras do funil: escala pelo maior valor, nunca passa de 100 e nunca some quando ha valor', () => {
  assert.equal(larguraBarra(60, 120), 50)
  assert.equal(larguraBarra(120, 120), 100)
  assert.equal(larguraBarra(1, 10000), 2, 'valor pequeno ainda aparece')
  assert.equal(larguraBarra(0, 100), 0)
  assert.equal(larguraBarra(5, 0), 0)
  assert.equal(larguraBarra(500, 100), 100)
  assert.equal(pct(9, 60), 15); assert.equal(pct(1, 3), 33.3); assert.equal(pct(1, 0), 0)
  assert.ok(funilVazio({ qualificadas: 0, aprovadas: 0, enviadas: 0, respondidas: 0, cotacoes: 0, assumidas: 0 }) && !funilVazio(FUNIL_EXEMPLO))
})

test('taxa de resposta por toque e por segmento (uteis separadas)', () => {
  const envios = [{ toque: 1, segmento: 'bebidas' }, { toque: 1, segmento: 'bebidas' }, { toque: 1, segmento: 'plasticos' }, { toque: 2, segmento: 'bebidas' }]
  const resp = [{ toque: 1, segmento: 'bebidas', classificacao: 'cotacao' }, { toque: 2, segmento: 'bebidas', classificacao: 'agora_nao' }]
  const t = Object.fromEntries(taxaPorToque(envios, resp).map((x) => [x.chave, x]))
  assert.deepEqual([t['Toque 1'].enviados, t['Toque 1'].respostas, t['Toque 1'].uteis, t['Toque 1'].taxa, t['Toque 1'].taxaUtil], [3, 1, 1, 33.3, 33.3])
  assert.deepEqual([t['Toque 2'].respostas, t['Toque 2'].uteis, t['Toque 2'].taxaUtil], [1, 0, 0], 'agora nao nao e util')
  const s = Object.fromEntries(taxaPorSegmento(envios, resp).map((x) => [x.chave, x]))
  assert.equal(s.bebidas.enviados, 3); assert.equal(s.bebidas.respostas, 2); assert.equal(s.plasticos.taxa, 0)
})

test('gasto de IA: dia e mes, e situacao contra o teto (ok, atencao em 70%, parada em 100%)', () => {
  const uso = [{ data: '2026-11-16', custo_brl: 0.4 }, { data: '2026-11-16', custo_brl: 0.35 }, { data: '2026-11-03', custo_brl: 1.1 }, { data: '2026-10-30', custo_brl: 9 }]
  assert.deepEqual(gastoDoDiaEDoMes(uso, '2026-11-16'), { dia: 0.75, mes: 1.85 })
  assert.deepEqual(situacaoGasto(0.75, 3), { pct: 25, tom: 'ok' })
  assert.equal(situacaoGasto(2.1, 3).tom, 'atencao'); assert.equal(situacaoGasto(3, 3).tom, 'parada'); assert.equal(situacaoGasto(0, 0).tom, 'parada')
})

test('pesos: inteiros de 0 a 100 somando exatamente 100; mostra so o que mudou', () => {
  const base = [{ criterio: 'a', rotulo: 'A', peso: 60 }, { criterio: 'b', rotulo: 'B', peso: 40 }]
  assert.equal(validarPesos(base), null)
  assert.match(validarPesos([{ criterio: 'a', rotulo: 'A', peso: 60 }, { criterio: 'b', rotulo: 'B', peso: 30 }]) ?? '', /somam 90/)
  assert.match(validarPesos([{ criterio: 'a', rotulo: 'A', peso: 101 }, { criterio: 'b', rotulo: 'B', peso: -1 }]) ?? '', /inteiro/)
  assert.match(validarPesos([{ criterio: 'a', rotulo: 'A', peso: 60.5 }, { criterio: 'b', rotulo: 'B', peso: 39.5 }]) ?? '', /inteiro/)
  assert.deepEqual(pesosAlterados(base, [{ criterio: 'a', rotulo: 'A', peso: 50 }, { criterio: 'b', rotulo: 'B', peso: 40 }]), [{ criterio: 'a', rotulo: 'A', de: 60, para: 50 }])
})

test('cor da caixa na faixa de saude', () => {
  const b = { ativa: true, parada_motivo: null, ultimo_diagnostico_resumo: 'verde' as const, temSenha: true }
  assert.equal(corDaCaixa(b), 'verde')
  assert.equal(corDaCaixa({ ...b, ativa: false }), 'cinza')
  assert.equal(corDaCaixa({ ...b, parada_motivo: 'erro de autenticacao' }), 'vermelho')
  assert.equal(corDaCaixa({ ...b, temSenha: false }), 'amarelo')
  assert.equal(corDaCaixa({ ...b, ultimo_diagnostico_resumo: null }), 'amarelo', 'nunca testada = atencao')
})
