// node --test gestor/test/radar.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  aprovarLote, bloqueioDoTexto, caminhoCurva, checagensEmail, contarEtapas, decidirEnvioManual, emBlocos, estadoCaixa, etapaDoStatus, filtrarBase, FILTROS_PADRAO, kpisBusca,
  LICOES, modoEfetivo, modosPermitidos, NOS_MAPA, podeAlterarChave, podeAprovarMensagem, prepararImportacaoBase, progressoCurso, restricaoDoCnae, riscoEnvio, slugClasse,
  quandoSai, slugDoSegmento, somarTotais, statusAposAcao, validarTextoResposta, visibilidadeRadar, SEGMENTOS_RADAR, type EmpresaBase,
} from '../src/lib/radar.ts'

const emp = (o: Partial<EmpresaBase>): EmpresaBase => ({
  cnpj: '11111111000191', razao_social: 'Empresa X', segmento_rbr: 'Alimentos', porte: 'EPP', municipio: 'Jundiaí', distancia_km: 50, email: 'a@x.com.br',
  dominio_valido: true, ja_na_lista: false, gigante: false, ...o,
})

// ---- filtros da busca ----------------------------------------------------------------------------------
test('busca: raio, segmentos, porte, MEI fora e gigantes desligados por padrao', () => {
  const lista = [
    emp({ cnpj: '1', razao_social: 'Perto', distancia_km: 40 }),
    emp({ cnpj: '2', razao_social: 'Longe', distancia_km: 151 }),
    emp({ cnpj: '3', razao_social: 'Mei', porte: 'MEI' }),
    emp({ cnpj: '4', razao_social: 'Gigante SA', porte: 'Demais', gigante: true }),
    emp({ cnpj: '5', razao_social: 'Bebida', segmento_rbr: 'Bebidas' }),
  ]
  const nomes = (f = FILTROS_PADRAO) => filtrarBase(lista, f).map((e) => e.razao_social)
  assert.deepEqual(nomes(), ['Perto', 'Bebida'])
  assert.deepEqual(nomes({ ...FILTROS_PADRAO, raio: 200 }), ['Perto', 'Longe', 'Bebida'])
  assert.deepEqual(nomes({ ...FILTROS_PADRAO, segmentos: ['Bebidas'] }), ['Bebida'])
  assert.deepEqual(nomes({ ...FILTROS_PADRAO, gigantes: true }), ['Perto', 'Gigante SA', 'Bebida'])
  assert.ok(!nomes({ ...FILTROS_PADRAO, gigantes: true, portes: [] }).includes('Mei'), 'MEI nunca aparece')
  assert.deepEqual(nomes({ ...FILTROS_PADRAO, portes: ['ME'] }), [])
})

test('busca: so e-mail, so validado, so quem nunca recebeu e texto livre sem acento', () => {
  const lista = [
    emp({ cnpj: '1', razao_social: 'Sem Email', email: null }),
    emp({ cnpj: '2', razao_social: 'A Validar', dominio_valido: false }),
    emp({ cnpj: '3', razao_social: 'Já Na Lista', ja_na_lista: true }),
    emp({ cnpj: '4', razao_social: 'Cerâmica Ótima', municipio: 'São Roque' }),
  ]
  const nomes = (f: Partial<typeof FILTROS_PADRAO>) => filtrarBase(lista, { ...FILTROS_PADRAO, ...f }).map((e) => e.razao_social)
  assert.deepEqual(nomes({}), ['A Validar', 'Cerâmica Ótima'])
  assert.deepEqual(nomes({ so_validado: true }), ['Cerâmica Ótima'])
  assert.deepEqual(nomes({ so_nova: false }), ['A Validar', 'Já Na Lista', 'Cerâmica Ótima'])
  assert.deepEqual(nomes({ so_email: false, so_nova: false }).length, 4)
  assert.deepEqual(nomes({ q: 'ceramica sao roque' }), [])
  assert.deepEqual(nomes({ q: 'ceramica' }), ['Cerâmica Ótima'])
  assert.deepEqual(nomes({ q: 'SAO ROQUE' }), ['Cerâmica Ótima'])
})

test('busca: KPIs e 18 segmentos com slug', () => {
  const k = kpisBusca([emp({ distancia_km: 40 }), emp({ cnpj: '2', distancia_km: 60, dominio_valido: false }), emp({ cnpj: '3', distancia_km: null })])
  assert.deepEqual(k, { encontradas: 3, comDominio: 2, prontas: 2, kmMedio: 50 })
  assert.equal(SEGMENTOS_RADAR.length, 18)
  for (const s of SEGMENTOS_RADAR) assert.equal(slugDoSegmento(s.base), s.slug, s.base)
  assert.equal(slugDoSegmento('Segmento inventado'), null)
})

test('restricao por CNAE: avisa, nunca exclui', () => {
  assert.equal(restricaoDoCnae('2013-4/00'), 'fertilizante')
  assert.equal(restricaoDoCnae('2063100'), 'cosmetico')
  assert.equal(restricaoDoCnae('2110600'), 'medicamento')
  assert.equal(restricaoDoCnae('2051700'), 'quimico')
  assert.equal(restricaoDoCnae('1091101'), null)
  const r = filtrarBase([emp({ restricao: 'quimico' })], FILTROS_PADRAO)
  assert.equal(r.length, 1)
})

// ---- importador ----------------------------------------------------------------------------------------
const CAB = 'prioridade;cnpj_formatado;razao_social;nome_fantasia;segmento_rbr;porte;municipio;uf;distancia_km;email;dominio_valido;gigante'
test('importador: duplicados, linhas ruins, MEI e e-mail malformado', () => {
  const csv = '﻿' + [
    CAB,
    'A;11.111.111/0001-91;Alfa Ltda;Alfa;Alimentos;EPP;Jundiaí;SP;50;Compras@Alfa.com.br;sim;nao',
    'A;11.111.111/0001-91;Alfa de novo;;Alimentos;EPP;Jundiaí;SP;50;x@alfa.com.br;sim;nao',
    'B;22.222.222/0001-91;Beta;;Bebidas;MEI;Campinas;SP;90;b@beta.com.br;sim;nao',
    'B;123;Sem cnpj valido;;Bebidas;ME;Campinas;SP;90;b@beta.com.br;sim;nao',
    'B;33.333.333/0001-91;;;Bebidas;ME;Campinas;SP;90;c@gama.com.br;sim;nao',
    'C;44.444.444/0001-91;Delta;;Cimento;Demais;Itu;SP;100;email-quebrado;nao;nao',
  ].join('\r\n')
  const r = prepararImportacaoBase(csv)
  assert.equal(r.validas.length, 2)
  assert.equal(r.validas[0].cnpj, '11111111000191')
  assert.equal(r.validas[0].email, 'compras@alfa.com.br')
  assert.equal(r.validas[1].email, '', 'e-mail malformado vira vazio, a empresa entra')
  assert.deepEqual(r.ignoradas.map((i) => i.motivo), ['CNPJ repetido no arquivo', 'MEI não entra', 'CNPJ inválido', 'sem razão social'])
  assert.deepEqual(r.ignoradas.map((i) => i.linha), [3, 4, 5, 6])
})

test('importador: arquivo de gigantes marca gigante = sim; blocos de 500; soma de totais', () => {
  const r = prepararImportacaoBase([CAB, 'A;11.111.111/0001-91;Alfa;;Alimentos;Demais;X;SP;5;a@a.com.br;sim;nao'].join('\n'), { gigantes: true })
  assert.equal(r.validas[0].gigante, 'sim')
  const blocos = emBlocos(Array.from({ length: 1201 }, (_, i) => i))
  assert.deepEqual(blocos.map((b) => b.length), [500, 500, 201])
  assert.deepEqual(somarTotais({ novos: 1, atualizados: 2, ignorados: 3 }, { novos: 4, atualizados: 0 }), { novos: 5, atualizados: 2, ignorados: 3 })
})

// ---- etapas das empresas -------------------------------------------------------------------------------
test('etapas: status agrupados e contagem real', () => {
  const lista = ['novo', 'qualificado', 'em_aprovacao', 'em_contato', 'respondeu', 'quente', 'cliente', 'repouso', 'descartado', 'descadastrado'].map((status) => ({ status }))
  assert.deepEqual(contarEtapas(lista), { todas: 10, nova: 2, sequencia: 2, respondeu: 1, quente: 1, cliente: 1, repouso: 1, bloqueada: 2 })
  assert.equal(etapaDoStatus('inexistente'), 'nova')
})
test('mudanca de etapa: acoes da gaveta', () => {
  assert.equal(statusAposAcao('mandar_agente', 'novo'), 'qualificado')
  assert.equal(statusAposAcao('mandar_agente', 'quente'), 'quente', 'nao rebaixa quem ja avancou')
  assert.equal(statusAposAcao('bloquear', 'qualificado'), 'descartado')
  assert.equal(statusAposAcao('cliente', 'quente'), 'cliente')
})

// ---- aprovacao -----------------------------------------------------------------------------------------
test('aprovacao: nao aprova contato invalido, bloqueado, faixa C nem texto com preco/prazo', () => {
  const ok = checagensEmail('Oi, tudo bem? Queria entrar na lista de cotação de vocês.', 'Frete', false)
  assert.equal(ok.ok, true)
  const base = { validacao: 'mx_ok', bloqueado: false, checagem: ok, classe: 'A' }
  assert.equal(podeAprovarMensagem(base), null)
  assert.match(podeAprovarMensagem({ ...base, bloqueado: true }) ?? '', /bloqueio/)
  assert.match(podeAprovarMensagem({ ...base, validacao: 'invalido' }) ?? '', /inválido/)
  assert.match(podeAprovarMensagem({ ...base, validacao: 'devolvido' }) ?? '', /inválido/)
  assert.match(podeAprovarMensagem({ ...base, classe: 'C' }) ?? '', /faixa C/)
  const preco = checagensEmail('O frete sai por R$ 4.500 com coleta em 2 dias.', 'Frete', false)
  assert.equal(preco.ok, false)
  assert.deepEqual(preco.itens.filter((i) => !i.ok).map((i) => i.texto), ['Sem preço', 'Sem prazo'])
  assert.match(podeAprovarMensagem({ ...base, checagem: preco }) ?? '', /preço ou prazo/)
})
test('aprovacao: risco por regra e lote so de baixo risco', () => {
  assert.deepEqual(riscoEnvio({ classe: 'A', tipoEmail: 'generico', distanciaKm: 50 }), { nivel: 'baixo', motivos: [] })
  const r = riscoEnvio({ classe: 'B', tipoEmail: 'pessoal', distanciaKm: 152, segmentoNovo: true, restricao: 'quimico' })
  assert.equal(r.nivel, 'medio')
  assert.equal(r.motivos.length, 5)
  const lote = aprovarLote([{ id: 1, risco: 'baixo' as const, aprovavel: true }, { id: 2, risco: 'medio' as const, aprovavel: true }, { id: 3, risco: 'baixo' as const, aprovavel: false }])
  assert.deepEqual(lote.map((x) => x.id), [1])
})

// ---- envio manual --------------------------------------------------------------------------------------
test('envio manual: envio desligado salva rascunho; modo teste vai so para destinos de teste com [TESTE]', () => {
  const base = { para: ['cliente@empresa.com.br'], assunto: 'Re: cotação', destinosTeste: ['teste@rbrcargo.com.br'] }
  assert.equal(decidirEnvioManual({ ...base, envioLiberado: false, modoTeste: true }).acao, 'salvar_rascunho')
  assert.equal(decidirEnvioManual({ ...base, envioLiberado: false, modoTeste: false }).acao, 'salvar_rascunho')
  const teste = decidirEnvioManual({ ...base, envioLiberado: true, modoTeste: true })
  assert.deepEqual(teste, { acao: 'enviar', destinatarios: ['teste@rbrcargo.com.br'], assunto: '[TESTE] Re: cotação', teste: true })
  assert.equal(decidirEnvioManual({ ...base, envioLiberado: true, modoTeste: true, destinosTeste: [] }).acao, 'recusar')
  const real = decidirEnvioManual({ ...base, envioLiberado: true, modoTeste: false })
  assert.deepEqual(real, { acao: 'enviar', destinatarios: ['cliente@empresa.com.br'], assunto: 'Re: cotação', teste: false })
  assert.equal(decidirEnvioManual({ ...base, envioLiberado: true, modoTeste: false, bloqueados: ['CLIENTE@empresa.com.br'] }).acao, 'recusar')
  assert.equal(decidirEnvioManual({ ...base, para: ['sem-arroba'], envioLiberado: true, modoTeste: false }).acao, 'recusar')
  const jaTeste = decidirEnvioManual({ ...base, assunto: '[TESTE] já marcado', envioLiberado: true, modoTeste: true })
  assert.equal(jaTeste.acao === 'enviar' && jaTeste.assunto, '[TESTE] já marcado')
})

// ---- travas da jornada ---------------------------------------------------------------------------------
test('jornada: cotacao e preco nunca sozinhos; reclamacao nunca; sair sempre automatico', () => {
  assert.deepEqual(modosPermitidos('cotacao'), ['rascunho'])
  assert.deepEqual(modosPermitidos('preco_prazo'), ['rascunho'])
  assert.deepEqual(modosPermitidos('reclamacao'), ['nunca'])
  assert.deepEqual(modosPermitidos('sair'), ['sozinho'])
  assert.deepEqual(modosPermitidos('seguro'), ['rascunho', 'sozinho'])
  assert.deepEqual(modosPermitidos('custom_x', true), ['rascunho'], 'pergunta nova nasce e fica em rascunho')
  assert.equal(modoEfetivo('cotacao', 'sozinho', true), 'rascunho')
  assert.equal(modoEfetivo('preco_prazo', 'sozinho', true), 'rascunho')
  assert.equal(modoEfetivo('reclamacao', 'sozinho', true), 'nunca')
  assert.equal(modoEfetivo('seguro', 'sozinho', false), 'rascunho', 'sozinho so vale com RESPOSTA_AUTOMATICA_LIBERADA = sim')
  assert.equal(modoEfetivo('seguro', 'sozinho', true), 'sozinho')
  assert.equal(modoEfetivo('sair', 'rascunho', false), 'sozinho')
})
test('jornada: texto da resposta valida variaveis e HTML; mapa completo', () => {
  assert.equal(validarTextoResposta('Oi {nome}, da {empresa} em {cidade}.'), null)
  assert.match(validarTextoResposta('Oi {apelido}') ?? '', /desconhecida/)
  assert.match(validarTextoResposta('<b>oi</b>') ?? '', /HTML/)
  assert.match(validarTextoResposta('  ') ?? '', /Escreva/)
  assert.equal(slugClasse('Tem desconto à vista?'), 'custom_tem_desconto_a_vista')
  assert.equal(slugClasse('???'), '')
  assert.equal(NOS_MAPA.filter((n) => n.col === 2).length, 12)
  assert.ok(NOS_MAPA.filter((n) => n.pai).every((n) => NOS_MAPA.some((p) => p.id === n.pai)))
  assert.equal(caminhoCurva({ x: 0, y: 0 }, { x: 10, y: 20 }), 'M0 0 C5 0 5 20 10 20')
})

// ---- visibilidade, ajustes, curso ----------------------------------------------------------------------
test('visibilidade: com a flag em nao so o Pedro ve; com sim, todo gestor', () => {
  assert.deepEqual(visibilidadeRadar({ papel: 'gestor_rbr', flagUi: 'nao', ehPedro: true }), { visivel: true, emTeste: true })
  assert.deepEqual(visibilidadeRadar({ papel: 'gestor_rbr', flagUi: 'nao', ehPedro: false }), { visivel: false, emTeste: false })
  assert.deepEqual(visibilidadeRadar({ papel: 'gestor_rbr', flagUi: null, ehPedro: false }), { visivel: false, emTeste: false })
  assert.deepEqual(visibilidadeRadar({ papel: 'gestor_rbr', flagUi: 'sim', ehPedro: false }), { visivel: true, emTeste: false })
  assert.deepEqual(visibilidadeRadar({ papel: 'motorista', flagUi: 'sim', ehPedro: true }), { visivel: false, emTeste: false })
})
test('ajustes: so o Pedro altera; ligar envio/leitura/resposta exige LIGAR', () => {
  assert.match(podeAlterarChave({ ehPedro: false, chave: 'PROSPECCAO_MODO_TESTE', novoValor: 'nao' }) ?? '', /Pedro/)
  assert.match(podeAlterarChave({ ehPedro: true, chave: 'PROSPECCAO_ENVIO_LIBERADO', novoValor: 'sim' }) ?? '', /LIGAR/)
  assert.match(podeAlterarChave({ ehPedro: true, chave: 'PROSPECCAO_ENVIO_LIBERADO', novoValor: 'sim', digitado: 'ligar' }) ?? '', /LIGAR/)
  assert.equal(podeAlterarChave({ ehPedro: true, chave: 'PROSPECCAO_ENVIO_LIBERADO', novoValor: 'sim', digitado: 'LIGAR' }), null)
  assert.equal(podeAlterarChave({ ehPedro: true, chave: 'PROSPECCAO_ENVIO_LIBERADO', novoValor: 'nao' }), null, 'desligar nao pede nada')
  assert.equal(podeAlterarChave({ ehPedro: true, chave: 'PROSPECCAO_LEITURA_LIBERADA', novoValor: 'sim' }) !== null, true)
  assert.equal(podeAlterarChave({ ehPedro: true, chave: 'PROSPECCAO_RESPOSTA_AUTOMATICA_LIBERADA', novoValor: 'sim' }) !== null, true)
  assert.equal(podeAlterarChave({ ehPedro: true, chave: 'OUTRA_COISA', novoValor: 'nao' }), 'Chave desconhecida.')
  assert.deepEqual(estadoCaixa({ ativa: true, senhaCadastrada: false }), { texto: 'senha faltando', tom: 'bad' })
  assert.deepEqual(estadoCaixa({ ativa: false, senhaCadastrada: true }), { texto: 'desligada', tom: 'neutro' })
  assert.deepEqual(estadoCaixa({ ativa: true, senhaCadastrada: true }), { texto: 'ativa', tom: 'ok' })
  assert.deepEqual(bloqueioDoTexto('Fulano@Empresa.com.br'), { tipo: 'email', valor: 'fulano@empresa.com.br' })
  assert.deepEqual(bloqueioDoTexto('@bebidasomega.com.br'), { tipo: 'dominio', valor: 'bebidasomega.com.br' })
  assert.deepEqual(bloqueioDoTexto('12.345.678/0001-90'), { tipo: 'cnpj', valor: '12345678000190' })
  assert.equal(bloqueioDoTexto('texto solto'), null)
})
test('curso: 7 licoes e progresso', () => {
  assert.equal(LICOES.length, 7)
  assert.ok(LICOES.every((l) => l.certa >= 0 && l.certa < l.opcoes.length))
  assert.equal(progressoCurso([]), 0)
  assert.equal(progressoCurso([0, 0, 1]), 29)
  assert.equal(progressoCurso([0, 1, 2, 3, 4, 5, 6, 99]), 100)
})

test('quando sai: dentro da janela, antes, depois e fim de semana (horario de Sao Paulo)', () => {
  assert.match(quandoSai(new Date('2026-11-18T15:00:00Z')), /próxima rodada/) // qua 12h
  assert.match(quandoSai(new Date('2026-11-18T08:00:00Z')), /hoje a partir das 7h/) // qua 05h
  assert.match(quandoSai(new Date('2026-11-18T23:00:00Z')), /amanhã/) // qua 20h
  assert.match(quandoSai(new Date('2026-11-20T23:00:00Z')), /segunda/) // sex 20h
  assert.match(quandoSai(new Date('2026-11-21T15:00:00Z')), /segunda/) // sab
})
