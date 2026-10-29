// node --test gestor/test/ciotAplicavel.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ciotAplicavel, etapasDaOperacao, pendenciasLiberacao } from '../src/lib/etapasOperacao.ts'
import type { DetalheOperacao } from '../src/lib/operacaoDetalhe'

const base = { dispensa_motivo: null, conferencia_status: 'nao_conferido', referencia: null, chave_acesso: null, numero_documento: null, arquivo_path: null, ambiente: 'homologacao', status: 'pendente' }
function detalhe(over: { teste?: boolean; propria?: boolean; ciotDispensado?: boolean } = {}): DetalheOperacao {
  const ciotDoc = over.ciotDispensado ? { ...base, tipo: 'ciot', exigido: false, dispensa_motivo: 'Operação de teste (eh_teste)' } : { ...base, tipo: 'ciot', exigido: true }
  return {
    operacao: { id: 'op', status: 'aguardando_liberacao_fiscal', tipo_documento_cliente: 'cte_mdfe', veiculo_id: 'v', pessoa_alocada_id: 'p', bloqueio_fiscal: false, liberada_em: null, eh_teste: over.teste === true },
    cotacao: { pedagio: 0 },
    veiculo: { is_veiculo_proprio: over.propria === true, placa: 'ABC1D23' },
    reboques: [],
    condicao: { id: 'c' },
    documentos: [{ ...base, tipo: 'cte', exigido: true }, ciotDoc],
    ciotVpo: null,
    averbacaoRcv: null,
  } as unknown as DetalheOperacao
}

test('operação normal com CIOT exigido: aplicável', () => assert.equal(ciotAplicavel(detalhe(), false), true))
test('frota própria: nunca tem CIOT', () => assert.equal(ciotAplicavel(detalhe({ propria: true, teste: true, ciotDispensado: true }), true), false))
test('teste com CIOT dispensado: some sem a efrete ligada, aparece com ela ligada', () => {
  const d = detalhe({ teste: true, ciotDispensado: true })
  assert.equal(ciotAplicavel(d, false), false)
  assert.equal(ciotAplicavel(d, true), true)
})
test('operação real com CIOT dispensado continua sem CIOT, mesmo com a efrete ligada', () => assert.equal(ciotAplicavel(detalhe({ ciotDispensado: true }), true), false))
test('a etapa CIOT não muda a liberação: ela só olha os documentos exigidos', () => {
  const d = detalhe({ teste: true, ciotDispensado: true })
  assert.deepEqual(pendenciasLiberacao(d).bloqueiam, ['CT-e'])
  assert.ok(etapasDaOperacao(d).every((e) => e.id !== 'ciot'), 'sem a flag no node, a etapa não aparece')
})
