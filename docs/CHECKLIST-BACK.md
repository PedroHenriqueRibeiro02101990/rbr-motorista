| H05 | feito |  · funções em supabase/functions e scripts/deploy-functions.js || G07 | parcial |  · disjuntorAberto testado; falta persistir o estado e bloquear emissão || G04 | parcial |  · divergenciasDeValor testada; falta o robô agendado || G01 | parcial |  · CI roda 200+ testes a cada push; falta a matriz completa de cenários || F09 | parcial |  · FaixaTeste e FaixaFixa (HOMOLOGAÇÃO) já existem; texto exato do item não conferido no navegador || F07 | parcial |  · PainelPendencias já existe; conferir módulos || F06 | parcial |  · estrutura de metas criada no banco (vendas ligadas; Operação/Fiscal desligadas); falta tela || F03 | parcial |  · destinoDoAviso e escalonamento (2 h gestor; 4 h e-mail desligado) testados; falta ligar ao sino || E12 | parcial |  · aviso fixo da pré-cotação existe; diasVencida testada; falta o aviso de cotação vencida na tela || E02 | parcial |  · faixaDeMargem e sugereAfrouxar testadas; falta a tela e os níveis do vendedor (depende dos papéis, lote A01) || D13 | feito |  · não há restrição de valor ao cliente para o gestor/operação hoje; nada a construir || D12 | parcial |  · alertas de entrega vencida e de MDF-e perto de 30 dias no painel da operação; falta o do CIOT (fim previsto não vem no detalhe) || D11 | parcial |  · lote por grupo_saida_id e sequencia já existe na lista de Operações || D10 | parcial |  · fluxoDaOcorrencia testado; incidentes_carga já existe; falta tela quadro 49 || D04 | parcial |  · nivelDaAlteracao A a D testado; a tabela operacao_alteracoes já existe; falta ligar às edições || D03 | parcial |  · checklistCompletar (11 itens) testado; falta ligar ao botão Enviar ao fiscal || D01 | feito |  · lista de Operações ordenada pela coleta mais próxima, selo Urgente (< 24 h); espera 2 h/4 h está em ordenarFila; não testado no navegador || C12 | parcial |  · contingenciaMdfeVencida (168 h) e proximaRef testadas; falta ligar || C10 | parcial |  · mensagem orientando Tabela A com 2 ou 3 eixos (teste); a atualização dos 272 coeficientes pela Portaria SUROC 22/2026 fica no lote e precisa da tabela oficial || C09 | parcial |  · aviso amarelo no pré-voo quando há mais de um destinatário || C08 | parcial |  · ligado ao pré-voo (lê o teto RCTR-C do cadastro; amarelo 80%, vermelho acima de 100%); falta travar a emissão no servidor e a liberação do gestor com comunicação anexada || C07 | parcial |  · várias NF-e já somam peso e valor no pré-voo e no CIOT; conferido por leitura do código || C06 | parcial |  · RPC nfes_em_outra_operacao já existe no banco; falta confirmar com o Alan a remessa parcial || C05 | parcial |  · cartaCorrecaoPermitida (20 cartas; sem valores, partes, datas) testada; falta tela e chamada Focus || C04 | parcial |  · planoDeTroca (veículo M0 a M3, eixos diferentes = nível A) codificado e testado; troca de gatilhos fica no lote || C02 | parcial |  · planoDeTroca (motorista M0 a M3) codificado e testado; falta tela e execução (depende do lote C04 e respostas NSTech) || B13 | parcial |  · esteira com não se aplica e motivo ligada ao detalhe da operação (teste); falta pré-voo único e botão por etapa || B08 | parcial |  · botão Encerrar CIOT no cartão + prazo no servidor; falta desembarque por nota (pergunta NSTech); não testado no navegador || B11 | parcial |  · Finalizar viagem encerra MDF-e e CIOT e refaz só o que faltou (finalizacao.ts, 2 testes, build ok); estado finalizando e aviso ao fiscal dependem do lote A04; não testado no navegador || A06 | parcial |  · proximaRef (rbr-mdfe-op-v2) em shared/regrasFluxo.ts; o UNIQUE e a tabela de versões ficam no lote de comportamento || H05 | feito |  · funções em supabase/functions e scripts/deploy-functions.js || G07 | parcial |  · disjuntorAberto testado; falta persistir o estado e bloquear emissão || G04 | parcial |  · divergenciasDeValor testada; falta o robô agendado || G01 | parcial |  · CI roda 200+ testes a cada push; falta a matriz completa de cenários || F09 | parcial |  · FaixaTeste e FaixaFixa (HOMOLOGAÇÃO) já existem; texto exato do item não conferido no navegador || F07 | parcial |  · PainelPendencias já existe; conferir módulos || F06 | parcial |  · estrutura de metas criada no banco (vendas ligadas; Operação/Fiscal desligadas); falta tela || F03 | parcial |  · destinoDoAviso e escalonamento (2 h gestor; 4 h e-mail desligado) testados; falta ligar ao sino || E12 | parcial |  · aviso fixo da pré-cotação existe; diasVencida testada; falta o aviso de cotação vencida na tela || E02 | parcial |  · faixaDeMargem e sugereAfrouxar testadas; falta a tela e os níveis do vendedor (depende dos papéis, lote A01) || D13 | feito |  · não há restrição de valor ao cliente para o gestor/operação hoje; nada a construir || D12 | parcial |  · alertas de entrega vencida e de MDF-e perto de 30 dias no painel da operação; falta o do CIOT (fim previsto não vem no detalhe) || D11 | parcial |  · lote por grupo_saida_id e sequencia já existe na lista de Operações || D10 | parcial |  · fluxoDaOcorrencia testado; incidentes_carga já existe; falta tela quadro 49 || D04 | parcial |  · nivelDaAlteracao A a D testado; a tabela operacao_alteracoes já existe; falta ligar às edições || D03 | parcial |  · checklistCompletar (11 itens) testado; falta ligar ao botão Enviar ao fiscal || D01 | feito |  · lista de Operações ordenada pela coleta mais próxima, selo Urgente (< 24 h); espera 2 h/4 h está em ordenarFila; não testado no navegador || C12 | parcial |  · contingenciaMdfeVencida (168 h) e proximaRef testadas; falta ligar || C10 | parcial |  · mensagem orientando Tabela A com 2 ou 3 eixos (teste); a atualização dos 272 coeficientes pela Portaria SUROC 22/2026 fica no lote e precisa da tabela oficial || C09 | parcial |  · aviso amarelo no pré-voo quando há mais de um destinatário || C08 | parcial |  · ligado ao pré-voo (lê o teto RCTR-C do cadastro; amarelo 80%, vermelho acima de 100%); falta travar a emissão no servidor e a liberação do gestor com comunicação anexada || C07 | parcial |  · várias NF-e já somam peso e valor no pré-voo e no CIOT; conferido por leitura do código || C06 | parcial |  · RPC nfes_em_outra_operacao já existe no banco; falta confirmar com o Alan a remessa parcial || C05 | parcial |  · cartaCorrecaoPermitida (20 cartas; sem valores, partes, datas) testada; falta tela e chamada Focus || C04 | parcial |  · planoDeTroca (veículo M0 a M3, eixos diferentes = nível A) codificado e testado; troca de gatilhos fica no lote || C02 | parcial |  · planoDeTroca (motorista M0 a M3) codificado e testado; falta tela e execução (depende do lote C04 e respostas NSTech) || B13 | parcial |  · esteira com não se aplica e motivo ligada ao detalhe da operação (teste); falta pré-voo único e botão por etapa || B08 | parcial |  · botão Encerrar CIOT no cartão + prazo no servidor; falta desembarque por nota (pergunta NSTech); não testado no navegador || B11 | parcial |  · Finalizar viagem encerra MDF-e e CIOT e refaz só o que faltou (finalizacao.ts, 2 testes, build ok); estado finalizando e aviso ao fiscal dependem do lote A04; não testado no navegador || A06 | parcial |  · proximaRef (rbr-mdfe-op-v2) em shared/regrasFluxo.ts; o UNIQUE e a tabela de versões ficam no lote de comportamento |# Checklist do back

Uma linha por ID de `docs/IMPLANTACAO-BACK.md`. Atualizado em 30/10/2026.

| ID | Status | Nota |
|---|---|---|
| A01 | pendente | Papéis por login `[M]` |
| A02 | pendente | Segregação de funções |
| A03 | parcial (colunas criadas; falta gravar nas funções) | Ator em tudo `[M]` · supabase-migrations/20261030_01_trilha_campos_metas.sql (aplicação negada pelo classificador) |
| A04 | parcial | Status novos da operação `[M]` · alocando_motorista e aguardando_liberacao_fiscal já existem no banco; faltam os demais |
| A05 | pendente | Operação avança em nome do motorista `[M]` |
| A06 | parcial | Reemissão com versões · proximaRef (rbr-mdfe-op-v2) em shared/regrasFluxo.ts; o UNIQUE e a tabela de versões ficam no lote de comportamento |
| A07 | pendente | Carteira individual de clientes `[M]` |
| A08 | parcial (colunas e histórico criados; falta usar nas telas) | Campos novos em operacoes `[M]` · mesma migração 20261030_01 |
| A09 | parcial (tabela criada; falta gravar os eventos) | Trilha de auditoria geral `[M]` · tabela trilha_auditoria na migração 20261030_01 |
| A10 | pendente | Limpar Repom · 14 arquivos citam Repom |
| B01 | feito | Testar token do NSPEDÁGIO `[X]` · token e leituras do PC e pela função publicada, 29/10 (docs-privado) |
| B02 | feito | Função nspedagio_segredo `[M]` · migração 20261029_01 aplicada |
| B03 | feito | Número numérico da operação e vpo_requisicoes `[M]` · migrações 20261029_01 e _02 aplicadas |
| B04 | feito | nspedagio-vpo grava idVpoAntt em operacao_ciot_vpo (origem api) na compra real e limpa no cancelamento; falta provar com nova compra em dia útil; cancelamento sem sucesso explícito segue pendente da NSTech
| B05 | feito | Cartão do VPO na aba Fiscal · CartaoVpo (commit 5721e80); não testado no navegador |
| B06 | pendente | Proxy da Vercel para o NSPEDÁGIO `[X]` · depende do limite de deploys da Vercel |
| B07 | pendente | Pedágio estimado na cotação |
| B08 | parcial | CIOT · botão Encerrar CIOT no cartão + prazo no servidor; falta desembarque por nota (pergunta NSTech); não testado no navegador |
| B09 | feito | ciotEfreteSemValidade em mdfe.ts: CIOT da efrete só vale com status emitido (bloqueia em produção real); 20 testes; emitir-mdfe publicada. Falta checar VPO ativo
| B10 | pendente | CIOT com várias NF-e |
| B11 | parcial | Finalizar viagem · Finalizar viagem encerra MDF-e e CIOT e refaz só o que faltou (finalizacao.ts, 2 testes, build ok); estado finalizando e aviso ao fiscal dependem do lote A04; não testado no navegador |
| B12 | pendente | Remover o encerramento automático `[M]` |
| B13 | parcial | Pré-voo único e esteira · esteira com não se aplica e motivo ligada ao detalhe da operação (teste); falta pré-voo único e botão por etapa |
| B14 | pendente | Janela de emissão |
| B15 | pendente | Cancelar a operação inteira `[$]` |
| B16 | pendente | Cancelar MDF-e com conferência |
| B17 | parcial | prazos.ts ligado em cancelar-documento-fiscal e efrete-ciot-operacao; falta VPO e telas
| B18 | pendente | Idempotência geral |
| C01 | pendente | Averbação automática e confiável `[X]` |
| C02 | parcial | Troca de motorista · planoDeTroca (motorista M0 a M3) codificado e testado; falta tela e execução (depende do lote C04 e respostas NSTech) |
| C03 | pendente | Inclusão de condutor completa |
| C04 | parcial | Troca de veículo · planoDeTroca (veículo M0 a M3, eixos diferentes = nível A) codificado e testado; troca de gatilhos fica no lote |
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
| D02 | pendente | Assumir a operação |
| D03 | parcial | Completar e enviar ao fiscal · checklistCompletar (11 itens) testado; falta ligar ao botão Enviar ao fiscal |
| D04 | parcial | Alterações níveis A a D · nivelDaAlteracao A a D testado; a tabela operacao_alteracoes já existe; falta ligar às edições |
| D05 | pendente | Devolvida pelo fiscal |
| D06 | pendente | Gestor libera a ordem de coleta |
| D07 | pendente | Liberar o caminhão |
| D08 | pendente | Registrar a entrega |
| D09 | pendente | Finalizar a operação |
| D10 | parcial | Ocorrência em rota · fluxoDaOcorrencia testado; incidentes_carga já existe; falta tela quadro 49 |
| D11 | parcial | Lote de viagens · lote por grupo_saida_id e sequencia já existe na lista de Operações |
| D12 | parcial | Alertas de prazo da viagem · alertas de entrega vencida e de MDF-e perto de 30 dias no painel da operação; falta o do CIOT (fim previsto não vem no detalhe) |
| D13 | feito | Operação vê o valor ao cliente · não há restrição de valor ao cliente para gestor/operação hoje; nada a construir |
| F01 | pendente | Sino e central de avisos |
| F02 | pendente | Todo aviso tem botão que resolve |
| F03 | parcial | Aviso vai a quem errou · destinoDoAviso e escalonamento (2 h gestor; 4 h e-mail desligado) testados; falta ligar ao sino |
| F04 | pendente | Busca com IA `[P]` |
| F05 | pendente | Início por função com mapa |
| F06 | parcial | Metas · estrutura de metas criada no banco (vendas ligadas; Operação e Fiscal desligadas, com indicadores de exemplo); falta tela |
| F07 | parcial | 'O que fazer agora' por módulo · PainelPendencias já existe; conferir módulos |
| F08 | pendente | Confirmação visível e janela de edição |
| F09 | parcial | Banner de homologação · FaixaTeste e FaixaFixa (HOMOLOGAÇÃO) já existem; texto exato do item não conferido no navegador |
| E01 | parcial | Funil e cotação (verificar o que existe) · cotação, pré-cotação, envio e conversão já existem; conferir lacunas |
| E02 | parcial | Margem e níveis do vendedor · faixaDeMargem e sugereAfrouxar testadas; falta a tela e os níveis do vendedor (depende dos papéis, lote A01) |
| E03 | pendente | Envio por e-mail e WhatsApp `[X]` |
| E04 | pendente | Link público de aceite `[M]` |
| E05 | pendente | Aceite com registro `[M]` |
| E06 | pendente | PDF da proposta |
| E07 | pendente | Prazos e valores da cotação |
| E08 | pendente | Aviso de disponibilidade |
| E09 | pendente | Equipe e convites |
| E10 | pendente | Quem recebe a carga |
| E11 | pendente | Relatório comercial e celular do vendedor |
| E12 | parcial | Cotação vencida e pré-cotação · aviso fixo da pré-cotação existe; diasVencida testada; falta o aviso de cotação vencida na tela |
| G01 | parcial | Bateria de testes de regra no CI · CI roda a bateria completa (mais de 200 testes) a cada push; falta a matriz completa de cenários de cte.ts e mdfe.ts |
| G02 | pendente | Sentinela de prontidão (15 min) |
| G03 | pendente | Reconciliador (30 min e virada do dia) |
| G04 | parcial | Auditor de dinheiro · divergenciasDeValor testada; falta o robô agendado |
| G05 | pendente | Auditor de segregação e trilha |
| G06 | pendente | Simulador noturno `[X]` |
| G07 | parcial | Disjuntor · disjuntorAberto testado; falta persistir o estado e bloquear emissão |
| G08 | pendente | Vigia regulatório |
| G09 | pendente | Tela Saúde fiscal |
| H01 | pendente | Bateria de homologação com evidência |
| H02 | aguarda o Pedro | Piloto real `[P,$]` · pacote de produção |
| H03 | aguarda o Pedro | Migrações de segurança do PR #15 `[M,P]` · pacote de produção |
| H04 | aguarda o Pedro | Produção · pacote de produção |
| H05 | feito | Deploy permanente das funções · funções já em supabase/functions; scripts/deploy-functions.js criado |
| H06 | pendente | Limite de deploys da Vercel `[X]` |
| H07 | feito | Operação de teste 965ceb0d `[M]` · RRD5B39 aprovado como veículo de teste (28/10 e 29/10) |
| H08 | aguarda o Pedro | Confirmar texto da Allianz `[P]` · pacote de produção |
| H09 | aguarda o Pedro | Reunião de homologação da NSTech `[X]` · pacote de produção |
