// node --test gestor/test/centralSdr.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ligacaoLink, motivoTexto, ordenarFila, proximaAcao, quentesSemDono, sugestaoDeDono, validarCorte, validarMaxDia, type ItemFila } from '../src/lib/centralSdr.ts'

const item = (o: Partial<ItemFila>): ItemFila => ({
  id: 'a', status: 'na_fila', motivo: 'nota_alta', nota: 70, telefone: '11999998888', observacao: null, criado_em: '2026-11-24T10:00:00Z', assumido_por: null, assumido_por_nome: null,
  resultado_em: null, lead_id: null, empresa_id: 'e', empresa: 'Empresa', cidade: null, uf: null, segmento: null, contato_nome: null, contato_cargo: null, contato_email: null, resumo: null, quente: false, ...o,
})

test('fila: quente primeiro, depois respondeu, depois maior nota', () => {
  const l = ordenarFila([item({ id: 'nota80', nota: 80 }), item({ id: 'resp', motivo: 'respondeu', nota: 40 }), item({ id: 'quente', motivo: 'respondeu', quente: true, nota: 10 }), item({ id: 'nota90', nota: 90 })])
  assert.deepEqual(l.map((i) => i.id), ['quente', 'resp', 'nota90', 'nota80'])
})

test('fila: texto do motivo e próxima ação', () => {
  assert.match(motivoTexto(item({ motivo: 'respondeu', quente: true })), /cotação ou preço/)
  assert.match(motivoTexto(item({ nota: 75 })), /Nota alta \(75\)/)
  assert.match(proximaAcao(item({ telefone: null })), /Sem telefone/)
  assert.match(proximaAcao(item({ quente: true })), /Ligar agora/)
})

test('fila: lead quente sem dono há mais de 1 hora vira urgente; assumido não', () => {
  const agora = new Date('2026-11-24T12:00:00Z')
  assert.equal(quentesSemDono([item({ quente: true })], agora).length, 1)
  assert.equal(quentesSemDono([item({ quente: true, criado_em: '2026-11-24T11:30:00Z' })], agora).length, 0)
  assert.equal(quentesSemDono([item({ quente: true, status: 'assumido', assumido_por: 'x' })], agora).length, 0)
  assert.equal(quentesSemDono([item({ quente: false })], agora).length, 0)
})

test('fila: lead quente sugere José Carlos; o resto fica com quem está logado', () => {
  const pessoas = [{ id: 'p', nome: 'Pedro Henrique' }, { id: 'j', nome: 'José Carlos' }]
  assert.equal(sugestaoDeDono(item({ quente: true }), pessoas, 'p'), 'j')
  assert.equal(sugestaoDeDono(item({ quente: false }), pessoas, 'p'), 'p')
  assert.equal(sugestaoDeDono(item({ quente: true }), [{ id: 'p', nome: 'Pedro Henrique' }], 'p'), 'p')
})

test('fila: telefone vira link e ajustes são validados', () => {
  assert.equal(ligacaoLink('(11) 99999-8888'), 'tel:+5511999998888')
  assert.equal(ligacaoLink('5511999998888'), 'tel:+5511999998888')
  assert.equal(ligacaoLink('123'), null)
  assert.equal(ligacaoLink(null), null)
  assert.equal(validarCorte('70'), 70)
  assert.equal(validarCorte('abc'), null)
  assert.equal(validarCorte('101'), null)
  assert.equal(validarMaxDia('10'), 10)
  assert.equal(validarMaxDia('1.5'), null)
  assert.equal(validarMaxDia('-1'), null)
})
