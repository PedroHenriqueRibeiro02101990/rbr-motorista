# Checklist do back

Uma linha por ID de `docs/IMPLANTACAO-BACK.md`. Atualizado em 30/10/2026.

| ID | Status | Nota |
|---|---|---|
| A01 | pendente | Papéis por login `[M]` |
| A02 | pendente | Segregação de funções |
| A03 | pronto, aguardando aplicação | Ator em tudo `[M]` · supabase-migrations/20261030_01_trilha_campos_metas.sql (aplicação negada pelo classificador) |
| A04 | parcial | Status novos da operação `[M]` · alocando_motorista e aguardando_liberacao_fiscal já existem no banco; faltam os demais |
| A05 | pendente | Operação avança em nome do motorista `[M]` |
| A06 | pendente | Reemissão com versões `[M,X]` |
| A07 | pendente | Carteira individual de clientes `[M]` |
| A08 | pronto, aguardando aplicação | Campos novos em operacoes `[M]` · mesma migração 20261030_01 |
| A09 | pronto, aguardando aplicação | Trilha de auditoria geral `[M]` · tabela trilha_auditoria na migração 20261030_01 |
| A10 | pendente | Limpar Repom · 14 arquivos citam Repom |
| B01 | feito | Testar token do NSPEDÁGIO `[X]` · token e leituras do PC e pela função publicada, 29/10 (docs-privado) |
| B02 | feito | Função nspedagio_segredo `[M]` · migração 20261029_01 aplicada |
| B03 | feito | Número numérico da operação e vpo_requisicoes `[M]` · migrações 20261029_01 e _02 aplicadas |
| B04 | parcial | Cliente e funções do NSPEDÁGIO `[X]` · nspedagio-vpo v5 com simular, comprar, cancelar, recibo, trocar placa, tag, status; falta gravar idVpoAntt em operacao_ciot_vpo e cancelamento com sucesso explícito (pergunta ao Antonio) |
| B05 | feito | Cartão do VPO na aba Fiscal · CartaoVpo (commit 5721e80); não testado no navegador |
| B06 | pendente | Proxy da Vercel para o NSPEDÁGIO `[X]` · depende do limite de deploys da Vercel |
| B07 | pendente | Pedágio estimado na cotação |
| B08 | parcial | CIOT · efreteClient já tem EncerrarOperacaoTransporte; falta botão e desembarque |
| B09 | parcial | Ligar CIOT e VPO ao emitir-mdfe · emitir-mdfe já monta infCIOT e vpo_idvpo e bloqueia CIOT de homologação em produção; falta exigir ciot_status=emitido e VPO ativo |
| B10 | pendente | CIOT com várias NF-e |
| B11 | pendente | Finalizar viagem |
| B12 | pendente | Remover o encerramento automático `[M]` |
| B13 | pendente | Pré-voo único e esteira |
| B14 | pendente | Janela de emissão |
| B15 | pendente | Cancelar a operação inteira `[$]` |
| B16 | pendente | Cancelar MDF-e com conferência |
| B17 | parcial | Tabela única de prazos · supabase/functions/_shared/prazos.ts + 6 testes verdes; falta ligar nas telas e funções |
| B18 | pendente | Idempotência geral |
| C01 | pendente | Averbação automática e confiável `[X]` |
| C02 | pendente | Troca de motorista `[X]` |
| C03 | pendente | Inclusão de condutor completa |
| C04 | pendente | Troca de veículo `[X]` |
| C05 | pendente | Correções de documentos `[X]` |
| C06 | pendente | Mesma NF-e em duas operações `[X]` |
| C07 | pendente | Várias NF-e na mesma operação |
| C08 | pendente | Limite da apólice `[P]` |
| C09 | pendente | Uma operação, um caminhão, uma carga |
| C10 | pendente | Piso ANTT atualizado `[M]` · tabela tem 272 combinações; faltam os dados da Portaria SUROC 22/2026 além dos valores de conferência |
| C11 | pendente | GR a cada troca |
| C12 | pendente | Rejeição e contingência |
| C13 | pendente | Vários municípios e UFs no MDF-e `[X]` |
| D01 | pendente | Fila por urgência |
| D02 | pendente | Assumir a operação |
| D03 | pendente | Completar e enviar ao fiscal |
| D04 | pendente | Alterações níveis A a D |
| D05 | pendente | Devolvida pelo fiscal |
| D06 | pendente | Gestor libera a ordem de coleta |
| D07 | pendente | Liberar o caminhão |
| D08 | pendente | Registrar a entrega |
| D09 | pendente | Finalizar a operação |
| D10 | pendente | Ocorrência em rota |
| D11 | pendente | Lote de viagens |
| D12 | pendente | Alertas de prazo da viagem |
| D13 | pendente | Operação vê o valor ao cliente |
| F01 | pendente | Sino e central de avisos |
| F02 | pendente | Todo aviso tem botão que resolve |
| F03 | pendente | Aviso vai a quem errou `[P]` |
| F04 | pendente | Busca com IA `[P]` |
| F05 | pendente | Início por função com mapa |
| F06 | pronto, aguardando aplicação | Metas `[M,P]` · tabela metas, vendas ativas e Operação/Fiscal desligadas, na migração 20261030_01 |
| F07 | pendente | 'O que fazer agora' por módulo |
| F08 | pendente | Confirmação visível e janela de edição |
| F09 | parcial | Banner de homologação · FaixaTeste existe; conferir texto |
| E01 | parcial | Funil e cotação (verificar o que existe) · cotação, pré-cotação, envio e conversão já existem; conferir lacunas |
| E02 | pendente | Margem e níveis do vendedor `[M]` |
| E03 | pendente | Envio por e-mail e WhatsApp `[X]` |
| E04 | pendente | Link público de aceite `[M]` |
| E05 | pendente | Aceite com registro `[M]` |
| E06 | pendente | PDF da proposta |
| E07 | pendente | Prazos e valores da cotação |
| E08 | pendente | Aviso de disponibilidade |
| E09 | pendente | Equipe e convites |
| E10 | pendente | Quem recebe a carga |
| E11 | pendente | Relatório comercial e celular do vendedor |
| E12 | parcial | Cotação vencida e pré-cotação · aviso fixo da pré-cotação existe (AVISO_PRE_COTACAO); falta aviso de cotação vencida |
| G01 | pendente | Bateria de testes de regra no CI |
| G02 | pendente | Sentinela de prontidão (15 min) |
| G03 | pendente | Reconciliador (30 min e virada do dia) |
| G04 | pendente | Auditor de dinheiro |
| G05 | pendente | Auditor de segregação e trilha |
| G06 | pendente | Simulador noturno `[X]` |
| G07 | pendente | Disjuntor |
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
