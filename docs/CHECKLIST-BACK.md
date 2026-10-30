| H05 | feito |  · funções em supabase/functions e scripts/deploy-functions.js || G07 | parcial |  · disjuntorAberto testado; falta persistir o estado e bloquear emissão || G04 | parcial |  · divergenciasDeValor testada; falta o robô agendado || G01 | parcial |  · CI roda 200+ testes a cada push; falta a matriz completa de cenários || F09 | parcial |  · FaixaTeste e FaixaFixa (HOMOLOGAÇÃO) já existem; texto exato do item não conferido no navegador || F07 | parcial |  · PainelPendencias já existe; conferir módulos || F06 | parcial |  · estrutura de metas criada no banco (vendas ligadas; Operação/Fiscal desligadas); falta tela || F03 | parcial |  · destinoDoAviso e escalonamento (2 h gestor; 4 h e-mail desligado) testados; falta ligar ao sino || E12 | parcial |  · aviso fixo da pré-cotação existe; diasVencida testada; falta o aviso de cotação vencida na tela || E02 | parcial |  · faixaDeMargem e sugereAfrouxar testadas; falta a tela e os níveis do vendedor (depende dos papéis, lote A01) || D13 | feito |  · não há restrição de valor ao cliente para o gestor/operação hoje; nada a construir || D12 | parcial |  · alertas de entrega vencida e de MDF-e perto de 30 dias no painel da operação; falta o do CIOT (fim previsto não vem no detalhe) || D11 | parcial |  · lote por grupo_saida_id e sequencia já existe na lista de Operações || D10 | parcial |  · fluxoDaOcorrencia testado; incidentes_carga já existe; falta tela quadro 49 || D04 | parcial |  · nivelDaAlteracao A a D testado; a tabela operacao_alteracoes já existe; falta ligar às edições || D03 | parcial |  · checklistCompletar (11 itens) testado; falta ligar ao botão Enviar ao fiscal || D01 | feito |  · lista de Operações ordenada pela coleta mais próxima, selo Urgente (< 24 h); espera 2 h/4 h está em ordenarFila; não testado no navegador || C12 | parcial |  · contingenciaMdfeVencida (168 h) e proximaRef testadas; falta ligar || C10 | parcial |  · mensagem orientando Tabela A com 2 ou 3 eixos (teste); a atualização dos 272 coeficientes pela Portaria SUROC 22/2026 fica no lote e precisa da tabela oficial || C09 | parcial |  · aviso amarelo no pré-voo quando há mais de um destinatário || C08 | parcial |  · ligado ao pré-voo (lê o teto RCTR-C do cadastro; amarelo 80%, vermelho acima de 100%); falta travar a emissão no servidor e a liberação do gestor com comunicação anexada || C07 | parcial |  · várias NF-e já somam peso e valor no pré-voo e no CIOT; conferido por leitura do código || C06 | parcial |  · RPC nfes_em_outra_operacao já existe no banco; falta confirmar com o Alan a remessa parcial || C05 | parcial |  · cartaCorrecaoPermitida (20 cartas; sem valores, partes, datas) testada; falta tela e chamada Focus || C04 | parcial |  · planoDeTroca (veículo M0 a M3, eixos diferentes = nível A) codificado e testado; troca de gatilhos fica no lote || C02 | parcial |  · planoDeTroca (motorista M0 a M3) codificado e testado; falta tela e execução (depende do lote C04 e respostas NSTech) || B13 | parcial |  · esteira com não se aplica e motivo ligada ao detalhe da operação (teste); falta pré-voo único e botão por etapa || B08 | parcial |  · botão Encerrar CIOT no cartão + prazo no servidor; falta desembarque por nota (pergunta NSTech); não testado no navegador || B11 | parcial |  · Finalizar viagem encerra MDF-e e CIOT e refaz só o que faltou (finalizacao.ts, 2 testes, build ok); estado finalizando e aviso ao fiscal dependem do lote A04; não testado no navegador || A06 | parcial |  · proximaRef (rbr-mdfe-op-v2) em shared/regrasFluxo.ts; o UNIQUE e a tabela de versões ficam no lote de comportamento || H05 | feito |  · funções em supabase/functions e scripts/deploy-functions.js || G07 | parcial |  · disjuntorAberto testado; falta persistir o estado e bloquear emissão || G04 | parcial |  · divergenciasDeValor testada; falta o robô agendado || G01 | parcial |  · CI roda 200+ testes a cada push; falta a matriz completa de cenários || F09 | parcial |  · FaixaTeste e FaixaFixa (HOMOLOGAÇÃO) já existem; texto exato do item não conferido no navegador || F07 | parcial |  · PainelPendencias já existe; conferir módulos || F06 | parcial |  · estrutura de metas criada no banco (vendas ligadas; Operação/Fiscal desligadas); falta tela || F03 | parcial |  · destinoDoAviso e escalonamento (2 h gestor; 4 h e-mail desligado) testados; falta ligar ao sino || E12 | parcial |  · aviso fixo da pré-cotação existe; diasVencida testada; falta o aviso de cotação vencida na tela || E02 | parcial |  · faixaDeMargem e sugereAfrouxar testadas; falta a tela e os níveis do vendedor (depende dos papéis, lote A01) || D13 | feito |  · não há restrição de valor ao cliente para o gestor/operação hoje; nada a construir || D12 | parcial |  · alertas de entrega vencida e de MDF-e perto de 30 dias no painel da operação; falta o do CIOT (fim previsto não vem no detalhe) || D11 | parcial |  · lote por grupo_saida_id e sequencia já existe na lista de Operações || D10 | parcial |  · fluxoDaOcorrencia testado; incidentes_carga já existe; falta tela quadro 49 || D04 | parcial |  · nivelDaAlteracao A a D testado; a tabela operacao_alteracoes já existe; falta ligar às edições || D03 | parcial |  · checklistCompletar (11 itens) testado; falta ligar ao botão Enviar ao fiscal || D01 | feito |  · lista de Operações ordenada pela coleta mais próxima, selo Urgente (< 24 h); espera 2 h/4 h está em ordenarFila; não testado no navegador || C12 | parcial |  · contingenciaMdfeVencida (168 h) e proximaRef testadas; falta ligar || C10 | parcial |  · mensagem orientando Tabela A com 2 ou 3 eixos (teste); a atualização dos 272 coeficientes pela Portaria SUROC 22/2026 fica no lote e precisa da tabela oficial || C09 | parcial |  · aviso amarelo no pré-voo quando há mais de um destinatário || C08 | parcial |  · ligado ao pré-voo (lê o teto RCTR-C do cadastro; amarelo 80%, vermelho acima de 100%); falta travar a emissão no servidor e a liberação do gestor com comunicação anexada || C07 | parcial |  · várias NF-e já somam peso e valor no pré-voo e no CIOT; conferido por leitura do código || C06 | parcial |  · RPC nfes_em_outra_operacao já existe no banco; falta confirmar com o Alan a remessa parcial || C05 | parcial |  · cartaCorrecaoPermitida (20 cartas; sem valores, partes, datas) testada; falta tela e chamada Focus || C04 | parcial |  · planoDeTroca (veículo M0 a M3, eixos diferentes = nível A) codificado e testado; troca de gatilhos fica no lote || C02 | parcial |  · planoDeTroca (motorista M0 a M3) codificado e testado; falta tela e execução (depende do lote C04 e respostas NSTech) || B13 | parcial |  · esteira com não se aplica e motivo ligada ao detalhe da operação (teste); falta pré-voo único e botão por etapa || B08 | parcial |  · botão Encerrar CIOT no cartão + prazo no servidor; falta desembarque por nota (pergunta NSTech); não testado no navegador || B11 | parcial |  · Finalizar viagem encerra MDF-e e CIOT e refaz só o que faltou (finalizacao.ts, 2 testes, build ok); estado finalizando e aviso ao fiscal dependem do lote A04; não testado no navegador || A06 | parcial |  · proximaRef (rbr-mdfe-op-v2) em shared/regrasFluxo.ts; o UNIQUE e a tabela de versões ficam no lote de comportamento |# Checklist do back

Uma linha por ID de `docs/IMPLANTACAO-BACK.md`. Atualizado em 30/10/2026.

| ID | Status | Nota |
|---|---|---|
| A01 | pendente | Papéis por login · LOTE PRONTO E NÃO APLICADO (aplicação negada pelo classificador): enum com comercial/operacao/fiscal/financeiro, tabela funcoes_pessoa, tem_funcao(); validado em transação descartada com rollback idêntico ao estado anterior |
| A02 | feito | Segregação de funções · LOTE APLICADO em 30/10 e testado por papel: gatilho de segregação (quem gerou ou alocou não emite; gestor é exceção) e colunas gerada_por/alocada_por |
| A03 | parcial (colunas criadas; falta gravar nas funções) | Ator em tudo `[M]` · supabase-migrations/20261030_01_trilha_campos_metas.sql (aplicação negada pelo classificador) |
| A04 | feito | Status novos da operação · LOTE APLICADO em 30/10 e testado por papel: 10 status novos no enum (finalizando, em_viagem, finalizada, etc.) |
| A05 | feito | Operação avança em nome do motorista · LOTE APLICADO em 30/10 e testado por papel: RPC avancar_em_nome_do_motorista com trilha |
| A06 | feito | Reemissão com versões · LOTE APLICADO: versões por gatilho em documentacao_operacao_versoes; UNIQUE mantido de propósito (as funções de emissão fazem upsert por operacao_id,tipo) |
| A07 | feito | Carteira individual de clientes · LOTE APLICADO em 30/10 e testado por papel: clientes.vendedor_id, políticas da carteira do comercial, RPC transferir_carteira com motivo |
| A08 | parcial (colunas e histórico criados; falta usar nas telas) | Campos novos em operacoes `[M]` · mesma migração 20261030_01 |
| A09 | parcial (tabela criada; falta gravar os eventos) | Trilha de auditoria geral `[M]` · tabela trilha_auditoria na migração 20261030_01 |
| A10 | parcial | Limpar Repom · textos visíveis trocados (efrete, NSPEDÁGIO); o valor legado rbr_repom do banco e as funções vpoProvedor/repom ficam: mexer na restrição é lote |
| B01 | feito | Testar token do NSPEDÁGIO `[X]` · token e leituras do PC e pela função publicada, 29/10 (docs-privado) |
| B02 | feito | Função nspedagio_segredo `[M]` · migração 20261029_01 aplicada |
| B03 | feito | Número numérico da operação e vpo_requisicoes `[M]` · migrações 20261029_01 e _02 aplicadas |
| B04 | feito | Cliente e funções do NSPEDÁGIO · provado em homologação (30/10): compra estourou os 60 s, o recibo gravou o idVpoAntt em operacao_ciot_vpo (origem api), o cancelamento deu SUCESSO_CANCELAR_VIAGEM, o recibo seguinte "não localizado" e o vpo_idvpo voltou a nulo |
| B05 | feito | Cartão do VPO na aba Fiscal · CartaoVpo (commit 5721e80); não testado no navegador |
| B06 | pendente | Proxy da Vercel para o NSPEDÁGIO `[X]` · depende do limite de deploys da Vercel |
| B07 | pendente | Pedágio estimado na cotação |
| B08 | parcial | CIOT · botão Encerrar CIOT no cartão + prazo no servidor; falta desembarque por nota (pergunta NSTech); não testado no navegador |
| B09 | feito | ciotEfreteSemValidade em mdfe.ts: CIOT da efrete só vale com status emitido (bloqueia em produção real); 20 testes; emitir-mdfe publicada. Falta checar VPO ativo
| B10 | pendente | CIOT com várias NF-e |
| B11 | feito | Finalizar viagem · Finalizar viagem marca a operação como finalizando e avisa fiscal e gestores (tabela notificacoes), encerra MDF-e e CIOT, refaz só o que faltou e termina em finalizada (ou volta a entregue se falhar); RPCs iniciar_finalizacao/terminar_finalizacao testadas em transação descartada; não testado no navegador |
| B12 | feito | Remover o encerramento automático · LOTE APLICADO: gatilho trg_encerrar_mdfe_na_entrega removido (conferido: 0 no banco); quem encerra o MDF-e é o botão Finalizar viagem |
| B13 | parcial | Pré-voo único e esteira · esteira com não se aplica e pré-voo único (CT-e, MDF-e, risco e gerais numa lista) no detalhe da operação; falta o botão por etapa; não testado no navegador |
| B14 | parcial | Janela de emissão · dentroDaJanelaDeEmissao (até a véspera, Brasília) testada; falta ligar ao botão de emitir |
| B15 | parcial | Cancelar a operação inteira · planoDeCancelamentoOperacao/andamentoDoCancelamento testados e tabela operacao_cancelamento_passos criada; falta a função que executa e a tela (quadro 56) |
| B16 | pendente | Cancelar MDF-e com conferência |
| B17 | parcial | prazos.ts ligado em cancelar-documento-fiscal e efrete-ciot-operacao; falta VPO e telas
| B18 | parcial | Idempotência geral · deveConsultarSozinho e podeReenviarAposTimeout testadas; efrete e NSPEDÁGIO já consultam antes de recomprar; falta o robô de 10 min |
| C01 | pendente | Averbação automática e confiável `[X]` |
| C02 | parcial | Troca de motorista · planoDeTroca (motorista M0 a M3) codificado e testado; falta tela e execução (depende do lote C04 e respostas NSTech) |
| C03 | pendente | Inclusão de condutor completa |
| C04 | feito | Troca de veículo · LOTE APLICADO em 30/10 e testado por papel: trocar só a carreta manda refazer o CIOT; o plano de troca já está testado em regrasFluxo.ts |
| C05 | parcial | Correções de documentos · cartaCorrecaoPermitida (20 cartas; sem valores, partes, datas) testada; falta tela e chamada Focus |
| C06 | parcial | Mesma NF-e em duas operações · RPC nfes_em_outra_operacao já existe no banco; falta confirmar com o Alan a remessa parcial |
| C07 | parcial | Várias NF-e na mesma operação · várias NF-e já somam peso e valor no pré-voo e no CIOT; conferido por leitura do código |
| C08 | parcial | Limite da apólice · ligado ao pré-voo (lê o teto RCTR-C do cadastro; amarelo 80%, vermelho acima de 100%); falta travar a emissão no servidor e a liberação do gestor com comunicação anexada |
| C09 | parcial | Uma operação, um caminhão, uma carga · aviso amarelo no pré-voo quando há mais de um destinatário |
| C10 | parcial | Piso ANTT atualizado · mensagem orientando Tabela A com 2 ou 3 eixos (teste); a atualização dos 272 coeficientes pela Portaria SUROC 22/2026 fica no lote e precisa da tabela oficial |
| C11 | pendente | GR a cada troca |
| C12 | parcial | Rejeição e contingência · contingenciaMdfeVencida (168 h) e proximaRef testadas; falta ligar |
| C13 | pendente | Vários municípios e UFs no MDF-e `[X]` |
| D01 | feito | Fila por urgência · lista de Operações ordenada pela coleta mais próxima, selo Urgente (menos de 24 h); espera 2 h/4 h em ordenarFila; não testado no navegador |
| D02 | parcial | Assumir a operação · colunas assumida_por e assumida_em criadas; falta o botão Assumir e o bloqueio |
| D03 | parcial | Completar e enviar ao fiscal · checklistCompletar (11 itens) testado; falta ligar ao botão Enviar ao fiscal |
| D04 | parcial | Alterações níveis A a D · nivelDaAlteracao A a D testado; a tabela operacao_alteracoes já existe; falta ligar às edições |
| D05 | parcial | Devolvida pelo fiscal · tabela operacao_devolucoes_fiscal criada; falta a tela e o aviso a quem errou |
| D06 | pendente | Gestor libera a ordem de coleta |
| D07 | pendente | Liberar o caminhão |
| D08 | pendente | Registrar a entrega |
| D09 | pendente | Finalizar a operação |
| D10 | parcial | Ocorrência em rota · fluxoDaOcorrencia testado; incidentes_carga já existe; falta tela quadro 49 |
| D11 | parcial | Lote de viagens · lote por grupo_saida_id e sequencia já existe na lista de Operações |
| D12 | parcial | Alertas de prazo da viagem · alertas de entrega vencida e de MDF-e perto de 30 dias no painel da operação; falta o do CIOT (fim previsto não vem no detalhe) |
| D13 | feito | Operação vê o valor ao cliente · não há restrição de valor ao cliente para gestor/operação hoje; nada a construir |
| F01 | parcial | Sino e central de avisos · sino com contagem de não lidos no menu (atualiza a cada minuto) e página Avisos; hoje só o aviso de finalização gera item; não testado no navegador |
| F02 | parcial | Todo aviso tem botão que resolve · central de avisos (/avisos) com marcar como lido e link para a operação; RPC marcar_aviso_lido aplicada; falta filtros e outros tipos de aviso |
| F03 | parcial | Aviso vai a quem errou · destinoDoAviso e escalonamento (2 h gestor; 4 h e-mail desligado) testados; falta ligar ao sino |
| F04 | pendente | Busca com IA `[P]` |
| F05 | pendente | Início por função com mapa |
| F06 | parcial | Metas · estrutura de metas criada no banco (vendas ligadas; Operação e Fiscal desligadas, com indicadores de exemplo); falta tela |
| F07 | parcial | 'O que fazer agora' por módulo · PainelPendencias já existe; conferir módulos |
| F08 | parcial | Confirmação visível e janela de edição · componente único useConfirmacao (✓/✗, evita clique duplo) e Modal sobre fundo escurecido já existem e são usados em várias telas; falta conferir as telas que ainda não usam |
| F09 | parcial | Banner de homologação · FaixaTeste e FaixaFixa (HOMOLOGAÇÃO) já existem; texto exato do item não conferido no navegador |
| E01 | parcial | Funil e cotação (verificar o que existe) · cotação, pré-cotação, envio e conversão já existem; conferir lacunas |
| E02 | parcial | Margem e níveis do vendedor · faixaDeMargem e sugereAfrouxar testadas; falta a tela e os níveis do vendedor (depende dos papéis, lote A01) |
| E03 | pendente | Envio por e-mail e WhatsApp `[X]` |
| E04 | parcial | Link público de aceite · tabela propostas_publicas criada (código, expiração, aberturas); falta a rota /p/código e a Edge Function pública |
| E05 | parcial | Aceite com registro · colunas de aceite (nome, cargo, data, IP) em propostas_publicas; falta gravar pelo link |
| E06 | pendente | PDF da proposta |
| E07 | feito | Prazos e valores da cotação · não há acréscimo fixo de 3% na tela de envio nem no PDF (busca no código sem ocorrência); vale o prazo e valor da cotação |
| E08 | parcial | Aviso de disponibilidade · tabela avisos_disponibilidade criada; falta a tela e o texto na proposta |
| E09 | pendente | Equipe e convites |
| E10 | pendente | Quem recebe a carga |
| E11 | pendente | Relatório comercial e celular do vendedor |
| E12 | parcial | Cotação vencida e pré-cotação · aviso fixo da pré-cotação existe; diasVencida testada; falta o aviso de cotação vencida na tela |
| G01 | parcial | Bateria de testes de regra no CI · CI roda a bateria completa (mais de 200 testes) a cada push; falta a matriz completa de cenários de cte.ts e mdfe.ts |
| G02 | parcial | Sentinela de prontidão (15 min) · avaliarSaudeFiscal cobre a prontidão de documentos; CNH, RNTRC, apólice e certificado ainda não; sem agendamento |
| G03 | parcial | Reconciliador (30 min e virada do dia) · função saude-fiscal publicada (documento pendente, CT-e sem averbação, MDF-e aberto, CIOT perto de 5 dias, VPO em operação cancelada); comparação com Focus, efrete e NSPEDÁGIO e agendamento pg_cron não feitos |
| G04 | parcial | Auditor de dinheiro · divergenciasDeValor testada; falta o robô agendado |
| G05 | parcial | Auditor de segregação e trilha · a estrutura de ator existe (A03) e trilha_auditoria foi criada; o auditor ainda não |
| G06 | pendente | Simulador noturno `[X]` |
| G07 | parcial | Disjuntor · disjuntorAberto testado; falta persistir o estado e bloquear emissão |
| G08 | pendente | Vigia regulatório |
| G09 | parcial | Tela Saúde fiscal · página Saúde fiscal criada (menu + /saude-fiscal): lista os achados em aberto, cor geral e botão Verificar agora (chama saude-fiscal); build ok; não testada no navegador |
| H01 | parcial | Bateria de homologação com evidência · rodado em 30/10 em homologação: VPO ciclo completo (compra, timeout, recibo, cancelamento com sucesso explícito); CIOT emitir, consultar, PDF e cancelar em 29/10. O resto da bateria (troca de motorista e veículo, carta de correção, várias NF-e, 2 notas no CIOT, timeouts simulados) não foi rodado |
| H02 | aguarda o Pedro | Piloto real `[P,$]` · pacote de produção |
| H03 | aguarda o Pedro | Migrações de segurança do PR #15 `[M,P]` · pacote de produção |
| H04 | aguarda o Pedro | Produção · pacote de produção |
| H05 | feito | Deploy permanente das funções · funções já em supabase/functions; scripts/deploy-functions.js criado |
| H06 | pendente | Limite de deploys da Vercel `[X]` |
| H07 | feito | Operação de teste 965ceb0d `[M]` · RRD5B39 aprovado como veículo de teste (28/10 e 29/10) |
| H08 | aguarda o Pedro | Confirmar texto da Allianz `[P]` · pacote de produção |
| H09 | aguarda o Pedro | Reunião de homologação da NSTech `[X]` · pacote de produção |
