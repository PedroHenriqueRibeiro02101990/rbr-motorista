// node --test gestor/test/fiscalV3Modelo.test.ts   (dados de exemplo no formato da OP-0360; nada vem de producao)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { contarBloqueios, destinoDoItem, itensDaPrevia, linhasDoQueEnviamos, linhasConferenciaMdfe, modeloFiscal, ncmDaOperacao, type EstadoFiscal } from '../src/lib/fiscalV3Modelo.ts'

const ciotOk = { ciot: '520048038432', ciot_verificador: '1483', ciot_origem: 'rbr_repom', ciot_ambiente: 'producao', vpo_idvpo: '96670000000000000001', vpo_valor: 1431.56 }
const base = (s: Partial<EstadoFiscal>): EstadoFiscal => ({ cte: null, atm: null, mdfe: null, rcv: null, ciotVpo: null, preVoo: [], ...s })
const CTE = { status: 'emitido', numero_documento: '11' }
const MDFE = { status: 'emitido', numero_documento: '6' }

// Os 4 estados "so para testar" da previa
test('estado 1 (CT-e a emitir): CT-e selecionado e piscando; so Emitir CT-e habilitado; 0 de 4', () => {
  const m = modeloFiscal(base({}))
  assert.equal(m.inicial, 'cte'); assert.equal(m.contador, '0 de 4 concluídas')
  assert.deepEqual(m.cartoes.map((c) => [c.chave, c.texto, c.classe]), [['cte', 'A emitir', 'next'], ['vpo', 'A comprar', 'next'], ['ciot', 'A emitir', ''], ['mdfe', 'Aguardando CT-e, CIOT e VPO', 'wait']])
  assert.equal(m.botoes.emitirCte, true); assert.equal(m.botoes.cancelarCte, false); assert.equal(m.botoes.baixarCte, false); assert.equal(m.botoes.emitirMdfe, false)
  assert.equal(m.tagCte, 'A EMITIR')
})
test('estado 2 (VPO e CIOT pendentes): vale selecionado; CT-e feito e averbado; MDF-e aguarda', () => {
  const m = modeloFiscal(base({ cte: CTE, atm: { status: 'emitido' } }))
  assert.equal(m.inicial, 'vpo'); assert.equal(m.contador, '1 de 4 concluídas')
  assert.equal(m.cartoes[0].texto, 'Emitido · nº 11'); assert.equal(m.cartoes[0].averbado, true); assert.equal(m.cartoes[0].classe, 'done')
  assert.equal(m.botoes.emitirCte, false); assert.equal(m.botoes.cancelarCte, true); assert.equal(m.botoes.cartaCorrecao, true)
  assert.equal(m.botoes.comprarVpo, true); assert.equal(m.botoes.emitirMdfe, false)
  assert.match(m.motivoMdfe, /Falta emitir o CT-e, o CIOT e comprar o vale-pedágio/)
})
test('estado 3 (MDF-e a emitir): MDF-e selecionado, "A emitir" e botao habilitado; averbacao do MDF-e aguarda', () => {
  const m = modeloFiscal(base({ cte: CTE, atm: { status: 'emitido' }, ciotVpo: ciotOk }))
  assert.equal(m.inicial, 'mdfe'); assert.equal(m.contador, '3 de 4 concluídas')
  assert.equal(m.cartoes[1].texto, 'Comprado · R$ 1.431,56'); assert.equal(m.cartoes[3].texto, 'A emitir'); assert.equal(m.cartoes[3].classe, 'next')
  assert.equal(m.botoes.emitirMdfe, true); assert.equal(m.botoes.cancelarMdfe, false); assert.equal(m.mdfeAverbado, false); assert.equal(m.tagMdfe, 'A EMITIR')
})
test('estado 4 (tudo emitido): 4 de 4, MDF-e averbado, acoes pos-emissao habilitadas e Emitir apagado', () => {
  const m = modeloFiscal(base({ cte: CTE, atm: { status: 'emitido' }, ciotVpo: ciotOk, mdfe: MDFE, rcv: { averbacao_rcv_status: 'emitido' } }))
  assert.equal(m.contador, '4 de 4 concluídas'); assert.equal(m.inicial, 'mdfe'); assert.equal(m.cartoes[3].averbado, true)
  assert.equal(m.botoes.emitirMdfe, false); assert.equal(m.botoes.cancelarMdfe, true); assert.equal(m.botoes.baixarMdfe, true); assert.equal(m.botoes.trocarCondutor, true)
  assert.equal(m.tagMdfe, 'EMITIDO · Nº 6')
})

// A) botao apagado enquanto o pre-voo tiver item em vermelho, e o motivo aparece
test('A) Emitir MDF-e fica DESABILITADO com pre-voo em vermelho (cep_carregamento) e mostra o motivo; ao corrigir, habilita', () => {
  const pronto = { cte: CTE, atm: { status: 'emitido' }, ciotVpo: ciotOk }
  const bloqueado = modeloFiscal(base({ ...pronto, preVoo: [{ nivel: 'bloqueio', campo: 'cep_carregamento', mensagem: 'CEP de carregamento com 8 digitos nao encontrado.' }] }))
  assert.equal(bloqueado.botoes.emitirMdfe, false); assert.match(bloqueado.motivoMdfe, /Emitir MDF-e fica apagado: falta 1 item/)
  const ok = modeloFiscal(base({ ...pronto, preVoo: [] }))
  assert.equal(ok.botoes.emitirMdfe, true); assert.equal(ok.motivoMdfe, '')
})
test('A) o componente apaga o botao com opacity .4 e cursor not-allowed e mostra o motivo logo abaixo', () => {
  const f = readFileSync(new URL('../src/components/operacao/FiscalV3Painel.tsx', import.meta.url), 'utf8')
  assert.match(f, /\.btn:disabled\{opacity:\.4;cursor:not-allowed\}/)
  assert.match(f, /disabled=\{!m\.botoes\.emitirMdfe/); assert.match(f, /m\.motivoMdfe/)
})

// B) NCM contraditorio (OP-0360: NCM 94069090 vem da NF-e 1375; operacoes.ncm e nulo)
test('B) NCM da OP-0360 vem da NF-e 1375 quando operacoes.ncm e nulo; MDF-e e Repom usam a MESMA funcao', () => {
  assert.equal(ncmDaOperacao({ ncmOperacao: null, ncmsNfes: ['94069090'] }), '94069090')
  assert.equal(ncmDaOperacao({ ncmOperacao: null, ncmsNfes: [], ncmsCotacao: ['94069090'] }), '94069090')
  assert.equal(ncmDaOperacao({ ncmOperacao: '12019000', ncmsNfes: ['94069090'] }), '12019000')
  assert.equal(ncmDaOperacao({ ncmOperacao: null, ncmsNfes: [null], ncmsCotacao: null }), null)
  // O painel (MDF-e e Repom) le o NCM de dados.ncm, que vem de ncmDaOperacao (operacoes.ncm -> NF-e -> cotacao)
  const dados = readFileSync(new URL('../src/lib/fiscalV3Dados.ts', import.meta.url), 'utf8')
  assert.match(dados, /ncm: ncmDaOperacao\(/)
  const painel = readFileSync(new URL('../src/components/operacao/FiscalV3Painel.tsx', import.meta.url), 'utf8')
  assert.match(painel, /ncm: d\.ncm/)
})

// C) um so estado por cartao
test('C) CIOT: um so estado, da mesma fonte; em homologacao nao conta como concluido e mostra o selo', () => {
  const h = modeloFiscal(base({ cte: CTE, ciotVpo: { ...ciotOk, ciot_ambiente: 'homologacao' } }))
  assert.equal(h.cartoes[2].concluido, false); assert.equal(h.ciotHomologacao, true); assert.match(h.cartoes[2].texto, /Homologação · sem validade/)
  const p = modeloFiscal(base({ cte: CTE, ciotVpo: ciotOk }))
  assert.equal(p.cartoes[2].texto, 'Emitido'); assert.equal(p.ciotHomologacao, false)
})

// D) tara fora da faixa = aviso amarelo, nao bloqueia
test('D) tara fora da faixa e AVISO (!) e nao bloqueia o botao', () => {
  const previa = itensDaPrevia({ regras: [{ tipo: 'aviso', origem: 'rbr', mensagem: 'Veículo de tração: tara aproximada, confirme com a ficha ou pesagem.' }] })
  const e = base({ cte: CTE, atm: { status: 'emitido' }, ciotVpo: ciotOk, preVoo: previa })
  assert.equal(modeloFiscal(e).botoes.emitirMdfe, true)
  assert.ok(linhasConferenciaMdfe(e).some((l) => l.sinal === 'a' && /tara aproximada/.test(l.texto)))
})

test('conferencia do MDF-e: textos da previa e bloqueio vira ✗', () => {
  const e = base({ cte: CTE, atm: { status: 'emitido' }, ciotVpo: ciotOk, preVoo: [] })
  const t = linhasConferenciaMdfe(e).map((l) => l.texto)
  assert.ok(t.includes('CT-e emitido (nº 11) e averbado') && t.includes('CIOT emitido · obrigatório no MDF-e a partir de 23/11/2026') && t.includes('Vale-pedágio comprado'))
  assert.ok(t.includes('Cavalo e carreta vinculados ao cadastro') && t.includes('CEP de descarregamento da NF-e') && t.includes('Destino do pagamento: IPEF Repom'))
  const x = linhasConferenciaMdfe(base({ ...e, cte: null, ciotVpo: null }))
  assert.deepEqual(x.slice(0, 3).map((l) => l.sinal), ['x', 'x', 'x'])
})

test('itensDaPrevia converte a previa do emissor (regras) em itens do pre-voo', () => {
  const r = itensDaPrevia({ regras: [{ tipo: 'bloqueio', origem: 'sefaz', mensagem: 'CEP de descarregamento nao encontrado' }, { tipo: 'aviso', origem: 'rbr', mensagem: 'x' }] })
  assert.deepEqual(r.map((i) => [i.nivel, i.campo]), [['bloqueio', 'cep_descarregamento'], ['aviso', 'outro']])
})

test('o painel tem os textos e a estrutura da previa', () => {
  const f = readFileSync(new URL('../src/components/operacao/FiscalV3Painel.tsx', import.meta.url), 'utf8')
  for (const t of ['O que enviamos e de onde vem', 'Ver o que enviamos e de onde vem', 'Averbação do CT-e', 'Averbação do MDF-e', 'Conferência antes de emitir', 'Finalizar viagem', 'Eventos do MDF-e', 'Regras de troca de motorista e veículo', 'CT-e feito fora do sistema', 'MDF-e feito fora do sistema', 'Vale-pedágio feito fora do sistema', 'CIOT feito fora do sistema', 'Aguardando o MDF-e', 'NF-e do cliente', 'Averbação automática', 'prefers-reduced-motion', 'role="tablist"', 'Baixar JSON', 'Salvar em PDF'])
    assert.ok(f.includes(t), t)
  assert.ok(readFileSync(new URL('../src/components/operacao/SubirPdfManual.tsx', import.meta.url), 'utf8').includes('Subir PDF manual'))
})

test('A2: botao mostra quantos faltam e cada item leva a aba certa', () => {
  const itens = itensDaPrevia({ bloqueios: ['Veículo de tração: tara não informada.', 'Falta o destino de pagamento do frete.'], avisos: ['x'] })
  const m = modeloFiscal(base({ cte: CTE, ciotVpo: ciotOk, preVoo: itens }))
  assert.equal(contarBloqueios(itens), 2)
  assert.match(m.motivoMdfe, /faltam 2 itens/)
  assert.equal(m.botoes.emitirMdfe, false)
  assert.match(modeloFiscal(base({ cte: CTE, ciotVpo: ciotOk, preVoo: itens.slice(0, 1) })).motivoMdfe, /falta 1 item/)
  assert.equal(destinoDoItem({ campo: 'tara', mensagem: 'tara' }, 'op1').rota, '/cadastros?aba=motoristas')
  assert.equal(destinoDoItem({ campo: 'destino_pagamento', mensagem: 'pagamento' }, 'op1').rota, '/operacoes?op=op1&aba=financeiro')
  assert.equal(destinoDoItem({ campo: 'ciot', mensagem: 'CIOT' }, 'op1').vista, 'ciot')
  assert.equal(destinoDoItem({ campo: 'vpo', mensagem: 'vale-pedágio' }, 'op1').vista, 'vpo')
})
test('A2: "Ver o que enviamos" mostra contratante, proprietario, reboques com tara, CIOT de 12 digitos e categoria do vale', () => {
  const l = linhasDoQueEnviamos({ modal_rodoviario: {
    contratantes: [{ nome: 'RBR CARGO LTDA', cnpj: '69115969000104' }], cpf_proprietario_veiculo: '12345678909', razao_social_proprietario_veiculo: 'Fulano', uf_proprietario_veiculo: 'SP',
    placa_veiculo: 'AAA1A11', tara_veiculo: 9000, veiculos_reboque: [{ placa: 'BBB2B22', tara: 6800 }], ciot: [{ ciot: '520048413061' }],
    dispositivos_vale_pedagio: [{ numero_comprovante_compra: '9667', valor_vale_pedagio: '100.00', categoria_combinacao_veicular: '08' }] } })
  const t = l.map((x) => x.valor).join(' | ')
  assert.match(t, /RBR CARGO LTDA · 69115969000104/); assert.match(t, /Fulano · 12345678909 · UF SP/); assert.match(t, /BBB2B22 \(tara 6800 kg\)/); assert.match(t, /520048413061/); assert.match(t, /categoria 08/)
  assert.deepEqual(linhasDoQueEnviamos(null), [])
})
