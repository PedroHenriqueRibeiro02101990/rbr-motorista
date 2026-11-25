// node --test supabase/functions/_shared/repomVprSchemaManual.test.ts
// O corpo da emissão tem de ter TODAS as chaves (e objetos aninhados) do exemplo do manual API Vale-Pedágio v2.0 (4.3), menos as 3 proibidas:
// Pracas, PracasVolta (não usamos roteirizador próprio) e NumeroCartao (em desuso). A Repom respondeu NullReference com chaves/objetos omitidos.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { montarCorpoVale, type PedidoVale } from './repomVprClient.ts'

const EXEMPLO_MANUAL = {
  ProcessoCodigoCliente: 'FL462', Placa: 'XXX0000', NumeroEixos: 2, CarretaPlaca: 'AAA1111', CarretaNumeroEixos: 4, NumeroCartao: '',
  NomeTransportador: 'Transportadora Teste', DocumentoTransportador: '00000000000', DocumentoSubcontratado: '', NomeMotorista: 'Motorista Teste',
  DocumentoMotorista: '00000000000', CnpjFilial: '00000000000000', UsuarioEmissao: 'User Test', Roteiro: { RoteiroCodigo: 0, PercursoCodigo: 0 },
  documento: [{ documentoCodigo: '141506', serie: '2' }], Pracas: [256], Configuracao: { EixosSuspensosIda: 0, EixosSuspensosVolta: 0 }, UtilizaCarreta: 'true',
}
const PROIBIDAS = ['NumeroCartao', 'Pracas', 'PracasVolta']
const chaves = (o: unknown, pref = ''): string[] => (Array.isArray(o) ? (o.length ? chaves(o[0], pref) : []) : o && typeof o === 'object' ? Object.entries(o).flatMap(([k, v]) => [pref + k, ...chaves(v, pref + k + '.')]) : [])
const base: PedidoVale = { processoCodigoCliente: 'RBV1', placa: 'BIS4025', numeroEixos: 2, nomeTransportador: 'A B', documentoTransportador: '12345678909', nomeMotorista: 'C D', documentoMotorista: '12345678909', cnpjFilial: '69115969000104', usuarioEmissao: 'U', roteiro: { roteiroCodigo: 5, percursoCodigo: 1 }, documentos: [{ codigo: '660', serie: '1' }] }

test('corpo do vale (com e sem carreta) tem todas as chaves do exemplo do manual, menos as 3 proibidas, e nenhuma a mais', () => {
  const esperado = chaves(EXEMPLO_MANUAL).filter((k) => !PROIBIDAS.includes(k)).sort()
  for (const p of [base, { ...base, carretaPlaca: 'DEF4G56', carretaNumeroEixos: 4 }]) {
    const c = montarCorpoVale(p)
    assert.deepEqual(chaves(c).sort(), esperado)
    for (const k of PROIBIDAS) assert.equal(k in c, false)
  }
})

test('tipos como no manual: textos string (nunca null), eixos e roteiro numéricos, configuração com números, documento completo', () => {
  const c = montarCorpoVale(base) as Record<string, unknown>
  for (const k of ['ProcessoCodigoCliente', 'Placa', 'CarretaPlaca', 'NomeTransportador', 'DocumentoTransportador', 'DocumentoSubcontratado', 'NomeMotorista', 'DocumentoMotorista', 'CnpjFilial', 'UsuarioEmissao']) assert.equal(typeof c[k], 'string', k)
  assert.equal(c.DocumentoSubcontratado, ''); assert.equal(c.CarretaPlaca, ''); assert.equal(c.CarretaNumeroEixos, 0); assert.equal(c.UtilizaCarreta, false)
  assert.deepEqual(c.Roteiro, { RoteiroCodigo: 5, PercursoCodigo: 1 }); assert.deepEqual(c.Configuracao, { EixosSuspensosIda: 0, EixosSuspensosVolta: 0 })
  assert.deepEqual(c.documento, [{ documentoCodigo: '660', serie: '1' }])
  assert.equal(JSON.stringify(c).includes('null'), false)
})
