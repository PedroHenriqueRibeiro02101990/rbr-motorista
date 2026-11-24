// node --test gestor/test/central.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  batimentoAtrasado, duracaoLegivel, efeitoDaChave, estadoDoRobo, fracaoProgresso, loteNovo, maisDe24h, motivoNaoLiga, nivelUso,
  percentualUso, podeEncerrar, processosDoResumo, projecaoEsgotar, resumoDaLista, semDono, termoBusca, textoProgresso, tipoEmail, verificacaoRotulo,
  type RoboLinha,
} from '../src/lib/central.ts'

const robo = (o: Partial<RoboLinha>): RoboLinha => ({ id: 'x', nome: 'X', onde_roda: 'pc', tipo: 'agendado', hora: null, ligado: false, travado: false, bloqueado_motivo: null, flag_chave: null, ultimo_inicio: null, ultimo_fim: null, ultimo_resultado: null, ...o })
const agora = new Date('2026-11-24T15:00:00Z')

test('limites: porcentagem, aviso a partir de 80% e vermelho no teto', () => {
  assert.equal(percentualUso(76, 95), 80)
  assert.equal(percentualUso(500, 100), 100)
  assert.equal(percentualUso(5, 0), 0)
  assert.equal(nivelUso(79, 100), 'ok')
  assert.equal(nivelUso(80, 100), 'wn')
  assert.equal(nivelUso(100, 100), 'bd')
  assert.equal(nivelUso(5, 0), 'ok')
})

test('limites: projeção de quando acaba', () => {
  assert.equal(projecaoEsgotar(0, 100, 'dia', agora), null)
  assert.equal(projecaoEsgotar(100, 100, 'dia', agora), 'Já chegou no limite.')
  assert.match(projecaoEsgotar(450, 900, 'mes', new Date('2026-11-10T12:00:00Z'))!, /acaba em 10 dias/)
})

test('batimento: atrasado depois de 5 minutos ou sem batimento', () => {
  assert.equal(batimentoAtrasado(null, agora), true)
  assert.equal(batimentoAtrasado('2026-11-24T14:57:00Z', agora), false)
  assert.equal(batimentoAtrasado('2026-11-24T14:54:00Z', agora), true)
  assert.equal(batimentoAtrasado('lixo', agora), true)
})

test('processos: lê a lista do resumo, ignora linhas ruins e protege o agente', () => {
  const ps = processosDoResumo({ processos: [
    { pid: 10, nome: 'python.exe', arquivo: 'D:\\RBR\\Sistema\\garimpo\\rodar.py', inicio: '2026-11-23T10:00:00Z', memoria_mb: 180, dono: 'garimpo_listas' },
    { pid: 11, nome: 'cmd.exe', arquivo: 'D:\\RBR\\Sistema\\listas\\a.bat', inicio: '2026-11-24T14:00:00Z' },
    { pid: 12, nome: 'agente.exe', arquivo: 'D:\\RBR\\Sistema\\agente\\agente.exe', inicio: '2026-11-20T10:00:00Z', dono: 'agente' },
    { pid: -1, nome: 'ruim', inicio: '2026-11-24T14:00:00Z' },
    { pid: 13, nome: 'sem-data', inicio: 'ontem' },
  ] })
  assert.deepEqual(ps.map((p) => p.pid), [12, 10, 11])
  assert.equal(ps.find((p) => p.pid === 12)!.protegido, true)
  assert.equal(podeEncerrar(ps.find((p) => p.pid === 12)!), false)
  assert.equal(podeEncerrar(ps.find((p) => p.pid === 10)!), true)
  assert.equal(ps.find((p) => p.pid === 11)!.dono, 'sem dono')
  assert.equal(semDono(ps), 1)
  assert.deepEqual(processosDoResumo(null), [])
  assert.deepEqual(processosDoResumo({ processos: 'x' }), [])
})

test('processos: tempo rodando e destaque de mais de 24 horas', () => {
  assert.equal(duracaoLegivel('2026-11-24T14:59:30Z', agora), 'menos de 1 min')
  assert.equal(duracaoLegivel('2026-11-24T14:30:00Z', agora), '30 min')
  assert.equal(duracaoLegivel('2026-11-24T12:05:00Z', agora), '2 h 55 min')
  assert.equal(duracaoLegivel('2026-11-22T12:00:00Z', agora), '2 d 3 h')
  assert.equal(maisDe24h('2026-11-23T14:00:00Z', agora), true)
  assert.equal(maisDe24h('2026-11-24T10:00:00Z', agora), false)
})

test('lista: tipo do e-mail, verificação e busca segura', () => {
  assert.equal(tipoEmail('compras@empresa.com.br'), 'setor')
  assert.equal(tipoEmail('Logistica2@empresa.com.br'), 'setor')
  assert.equal(tipoEmail('contato@empresa.com.br'), 'geral')
  assert.equal(tipoEmail(''), 'sem')
  assert.equal(tipoEmail(null), 'sem')
  assert.equal(verificacaoRotulo('verificado').rotulo, 'Válido')
  assert.equal(verificacaoRotulo('invalido').nivel, 'bd')
  assert.equal(verificacaoRotulo(null).rotulo, 'Pendente')
  // vírgula e parênteses quebrariam o filtro do banco
  assert.equal(termoBusca('a,b(c)%d*'), 'a b c d')
})

test('lista: resumo informado pelo agente e o que falta enviar', () => {
  assert.equal(resumoDaLista(null), null)
  assert.equal(resumoDaLista({ lista: { empresas: -1 } }), null)
  const r = resumoDaLista({ lista: { empresas: 12000, contatos: 9000, gerada_em: '2026-11-24T03:00:00Z' } })!
  assert.equal(r.empresas, 12000)
  assert.match(loteNovo(new Date('2026-11-24T08:05:09Z')), /^lote-20261124-080509$/)
})

test('importação: texto e barra de progresso', () => {
  assert.equal(textoProgresso(null), 'Esperando o agente começar.')
  assert.equal(textoProgresso({ lotes_total: 3, lotes_feitos: 1, enviadas: 4900, repetidas: 100, erros: 0 }), 'Lote 1 de 3: 4900 novas, 100 repetidas, 0 com erro.')
  assert.equal(fracaoProgresso({ lotes_total: 4, lotes_feitos: 1 }), 0.25)
  assert.equal(fracaoProgresso({ lotes_total: 2, lotes_feitos: 9 }), 1)
})

test('robôs: travado nunca liga; responder sozinho bloqueado; envio e leitura exigem o pré-voo', () => {
  const flags = { PROSPECCAO_ENVIO_LIBERADO: 'nao', PROSPECCAO_LEITURA_LIBERADA: 'nao' }
  assert.equal(estadoDoRobo(robo({ travado: true, ligado: true }), flags), 'travado')
  assert.match(motivoNaoLiga(robo({ travado: true }), flags)!, /Travado/)
  assert.match(motivoNaoLiga(robo({ id: 'resposta_auto', flag_chave: 'PROSPECCAO_RESPOSTA_AUTOMATICA_LIBERADA', bloqueado_motivo: 'O robo de leitura ainda nao executa isso' }), flags)!, /leitura ainda nao executa/)
  assert.match(motivoNaoLiga(robo({ id: 'envio', flag_chave: 'PROSPECCAO_ENVIO_LIBERADO' }), flags)!, /primeiro envio/)
  assert.match(motivoNaoLiga(robo({ id: 'leitura', flag_chave: 'PROSPECCAO_LEITURA_LIBERADA' }), flags)!, /primeiro envio/)
  assert.equal(motivoNaoLiga(robo({ id: 'tms' }), flags), null)
  assert.equal(motivoNaoLiga(robo({ id: 'modo_teste', flag_chave: 'PROSPECCAO_MODO_TESTE' }), flags), null)
})

test('robôs: estado vem da chave quando o robô é uma chave, e de "rodando" quando início > fim', () => {
  assert.equal(estadoDoRobo(robo({ flag_chave: 'PROSPECCAO_MODO_TESTE', ligado: false }), { PROSPECCAO_MODO_TESTE: 'sim' }), 'ligado')
  assert.equal(estadoDoRobo(robo({ flag_chave: 'PROSPECCAO_MODO_TESTE', ligado: true }), { PROSPECCAO_MODO_TESTE: 'nao' }), 'desligado')
  assert.equal(estadoDoRobo(robo({ ligado: true, ultimo_inicio: '2026-11-24T10:00:00Z', ultimo_fim: '2026-11-23T10:00:00Z' }), {}), 'rodando')
  assert.equal(estadoDoRobo(robo({ ligado: true, ultimo_inicio: '2026-11-23T10:00:00Z', ultimo_fim: '2026-11-23T11:00:00Z' }), {}), 'ligado')
  assert.equal(estadoDoRobo(robo({ ligado: false }), {}), 'desligado')
})

test('confirmação: toda chave de produção diz o efeito e marca o que é perigoso', () => {
  for (const id of ['envio', 'leitura', 'resposta_auto', 'aprovacao', 'modo_teste']) {
    for (const ligar of [true, false]) {
      const e = efeitoDaChave(id, ligar)
      assert.ok(e.titulo.endsWith('?') && e.efeito.length > 20, `${id} ${ligar}`)
    }
  }
  assert.equal(efeitoDaChave('envio', true).perigoso, true)
  assert.equal(efeitoDaChave('modo_teste', false).perigoso, true)
  assert.equal(efeitoDaChave('aprovacao', false).perigoso, true)
  assert.equal(efeitoDaChave('modo_teste', true).perigoso, false)
})
