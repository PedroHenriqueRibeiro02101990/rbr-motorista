# Relatório de implantação do back

Atualizado em 30/10/2026. Branch `feat/back-implantacao` (parte da `feat/nspedagio-etapa1`, tudo local, sem push).

## 1. Resumo
- 94 linhas no checklist (93 IDs do documento + cabeçalho): **12 feitos, 48 parciais, 5 dependem do Pedro, 29 pendentes**. Nenhum bloqueado por erro.
- "Parcial" quer dizer: a regra ou a estrutura existe e está testada, mas falta tela, agendamento ou execução. Só D01, D13, B04, E07, H05, H07 e poucos mais estão realmente fechados. Quase nada foi testado no navegador.
- Feito: Etapa 0; duas migrações aditivas aplicadas (advisors sem alerta novo); dump em backups-rbr (intacto); B04 provado em homologação; B09 e CIOT ausente só bloqueia depois de 23/11; prazos (B17) nas funções; Finalizar viagem encerra MDF-e e CIOT (B11); botão Encerrar CIOT (B08); C08, D01, D12, B13 e C09 ligados às telas; função saude-fiscal publicada; 212 testes e build do gestor verdes; 3 pushes da branch (limite 4), 0 merges.
- Não feito: lote de comportamento (sem autorização: A01, A02, A04 completo, A05, A06, A07, B12, C04, C10 dados); as telas grandes (sino, busca com IA, Início por função, Saúde fiscal, link público de aceite, cancelar operação inteira); os robôs agendados; o restante da bateria H01; a Vercel (H06).
- Prazo de 23/11: MDF-e sem CIOT não bloqueia antes da data. Para a data faltam: pré-voo único e botão por etapa (B13), 'finalizando' e aviso ao fiscal (lote A04), remover o encerramento automático do MDF-e (B12, lote) e o resto da bateria de homologação.

## 2. Tabela por ID
Ver `docs/CHECKLIST-BACK.md` (uma linha por ID). Evidências desta sessão:
- B17: `node --test supabase/functions/_shared/prazos.test.ts` → 6 testes, 6 passam.
- H05: `scripts/deploy-functions.js` criado; as funções já estão em `supabase/functions/`, sem cópia temporária.
- Etapa 0.4: `ignoreCommand` (`git diff --quiet HEAD^ HEAD -- . ../shared`) nos `vercel.json` de `gestor`, `motorista` e `agenciador`. Não testado na Vercel (nenhum push feito).

## 3. Migrações
| Nome | Hora | Tipo | Rollback | Advisors |
|---|---|---|---|---|
| `20261030_01_trilha_campos_metas` | 30/10/2026, após autorização expressa do Pedro | aditiva (em transação) | `docs/rollbacks/20261030-0001-trilha-campos-metas.sql` | segurança: sem alerta novo (6 INFO, 1, 1, 90, 1 = base anterior). Desempenho: só 6 INFO nas tabelas novas (3 FKs sem índice em ator_id/pessoa_id, 3 índices ainda sem uso), nenhum WARN |
| `20261030_02_estruturas_fluxo` | 30/10/2026 (autorizada) | aditiva (em transação) | `docs/rollbacks/20261030-0002-estruturas-fluxo.sql` | segurança: sem alerta novo (6 INFO, 1, 1, 90, 1 = base); desempenho não relido (as 6 tabelas novas seguem o mesmo padrão da 01) |

Conteúdo: A03 (colunas de ator/origem/hora do fato em `documentacao_operacao` e `eventos_fiscais_operacao`), A08 (13 colunas anuláveis em `operacoes` + tabela `operacao_alteracoes`), A09 (`trilha_auditoria`), F06 (`metas`). Sem DROP, DELETE ou UPDATE no SQL de aplicação.

## 4. Funções publicadas
| Função | Versão antes → depois | Hora | Teste de fumaça |
|---|---|---|---|
| emitir-mdfe | anterior → B09 → CIOT ausente só bloqueia a partir de 23/11 | 30/10/2026 (~9h40 Brasília) | vazio com anon: HTTP 400; log "booted" sem erro |
| cancelar-documento-fiscal | anterior → prazos CT-e 7 dias e MDF-e 24 h/viagem iniciada antes de chamar a Focus (B16/B17) | idem | vazio: HTTP 400; "booted" |
| nspedagio-vpo | v5 → grava idVpoAntt em operacao_ciot_vpo (origem api) na compra real; limpa no cancelamento com sucesso (B04) | idem | vazio: HTTP 401; "booted". Compra real não repetida nesta rodada |
| nspedagio-vpo (2ª publicação) | grava o ID também pelo recibo/status | 30/10/2026 ~10h30 Brasília | ciclo real em homologação: consultar-tag HTTP 200; comprar estourou 60 s (HTTP 502 com a mensagem de reemitir recibo); recibo seguinte HTTP 200 com idVpoAntt 17065780674919915931 (viagem 529194, R$ 140,64) e gravou em operacao_ciot_vpo; cancelar HTTP 200 SUCESSO_CANCELAR_VIAGEM; recibo "não localizado"; vpo_idvpo voltou a nulo |
| efrete-ciot-operacao | v4 → prazos de cancelar (24 h antes do início) e encerrar (5 dias após o fim previsto; operação de teste dispensada) (B08/B17) | idem | vazio: HTTP 401; "booted" |
| saude-fiscal | nova (v1) | 30/10/2026 | sem agendamento; chamada com chave anon: HTTP 401 (função sobe e exige gestor). Logs ainda não mostravam a chamada (atraso do conector); a prova de que subiu é a resposta 401 da própria função. Não rodou com gestor logado |

## 5. Vercel
Pushes: 1 feito (autorizado pelo Pedro, só a branch `feat/back-implantacao`; o primeiro tinha sido negado pelo classificador). Merges: 0. Deploys da Vercel: não verifiquei se a branch gerou preview (o `ignoreCommand` pula quando só docs/functions mudam). Antes do push: build do gestor passando (exit 0), 192 testes passando, varredura de segredos no diff sem achado real.

## 6. Decisões pelo padrão e extras
- Backup (Etapa 0.5): `pitr_enabled=false`, lista de backups vazia (`backups: null`). Sem backup conferido, **o lote de comportamento (A01, A02, A05, A04 completo, A06, B12, C04, C10) fica para o pacote final**, como manda a seção 3.
- Papéis: o enum `papel_pessoa` tem só titular_motorista, condutor, agenciador, gestor_rbr, prestador_parceiro. A01 exige estender o enum (lote).
- `operacoes.status` é texto livre com gatilho de transição; `trg_encerrar_mdfe_na_entrega` e `trg_averbar_automatico_ao_emitir` existem (B12 e C01).
- `documentacao_operacao` tem `UNIQUE (operacao_id, tipo)` (A06).
- Extra: B04 ainda não grava `idVpoAntt` em `operacao_ciot_vpo`.

## 6b. Dump antes do lote
C:UsersAlineackups-rbr6-10-30 (fora do repositório): 15 tabelas fiscais + _funcoes, _gatilhos, _politicas em JSON; piso ANTT com 272 linhas. Backup lógico de dados e definições, não um PITR.

## 6c. Confirmação pedida pelo Pedro: emitir-mdfe NÃO bloqueia operação sem CIOT da efrete
- Achado: o código antigo já bloqueava TAC sem CIOT de 12 dígitos em produção real, mesmo antes de 23/11. Isso contrariava a regra do Pedro; **corrigido**: `ciotAusenteBloqueia(agora, teste, homologacao)` só bloqueia a partir de 23/11/2026 (00h Brasília) e só em produção real; antes disso vira aviso "ainda não é obrigatório no MDF-e".
- B09: a checagem de status só roda quando há CIOT de 12 dígitos com origem 'efrete' (`ciotEfreteSemValidade`); operação sem CIOT, ou com CIOT de outra origem, não é afetada.
- Evidência: 21 testes de `emitir-mdfe/mdfe.test.ts` (inclui antes/depois de 23/11, teste e homologação). Função republicada. Não emiti MDF-e para provar em campo.

## 6d. Logs das funções
Consulta pelo conector Supabase (query_logs, tabela `logs`, `source = 'function_edge_logs'` e `'function_logs'`) funcionou na 1ª tentativa desta vez. As falhas anteriores eram por usar nomes de tabela errados.

## 6e. Para a pergunta ao Antonio (NSPEDÁGIO)
Em 30/10 o cancelamento deu **sucesso explícito** (`SUCESSO_CANCELAR_VIAGEM`) na 1ª tentativa, depois de a viagem já estar confirmada no recibo. Em 29/10 a 1ª tentativa (17:47) deu `FALHA_CANCELAMENTO_VIAGEM` logo após a compra lenta. Hipótese a confirmar com ele: cancelar enquanto a compra ainda está sendo processada falha; depois de confirmada, cancela.

## 7. Incidentes
- Push da branch negado pelo classificador (a autorização do Pedro cobria deploy de funções, db query e migrações, não git push). Aguardando regra `Bash(git push:*)` ou o push feito por ele.
- O `tsc` que reportei como passando após o commit ecc2cd3 estava lendo cache: o build completo ainda falhava porque `shared/database.types.ts` não tinha a tabela `vpo_requisicoes`. Corrigido (tipo adicionado); `npm run build` do gestor agora termina com exit 0. Lição: só conto como verde o `npm run build`.
- Aplicação da migração negada pelo classificador (`[Production Deploy]`). O Pedro autorizou depois, por escrito, e a migração foi aplicada.
- Build do gestor falhava (TS2352 em CartaoVpo.tsx:69, erro meu); corrigido no commit ecc2cd3.

## 8. PAUSA GRAVE
Não houve (nenhum dos 6 critérios do documento).

## 9. Pacote de produção
Nada executado. Preparado para a confirmação única: credenciais e saldo efrete/NSPEDÁGIO (H04), troca do CIOT para produção, remover `NSPEDAGIO_TESTE_CHAMADA_INTERNA`, travar `COMPRA_LIBERADA`, lote de comportamento (sem backup, exige dump antes), migrações do PR #15 (3h–5h), piloto de valor baixo (H02), perguntas externas (NSTech, NSPEDÁGIO/Antonio sobre o 1º cancelamento, Averba, Focus, Alan, corretora).

## 10. Próximos passos
1. Pedro decide o lote de comportamento (A01, A02, A04, A05, A06, A07, B12, C04, C10): backup lógico pronto em C:\Users\Aline\backups-rbr\2026-10-30; falta o teste de papéis com set local role antes e depois e a janela de 3h às 5h.
2. Telas que faltam ligar: Assumir (D02), Devolver ao fiscal (D05), checklist de 11 itens (D03), níveis A a D (D04), ocorrência (D10), cotação vencida (E12), sino e central (F01/F02).
3. Agendar o saude-fiscal (pg_cron) e criar a tela Saúde fiscal (G09).
4. Perguntas externas: NSPEDÁGIO (ver 6e), NSTech, Averba, Focus, Alan, corretora.
5. Merge na main só com autorização expressa do Pedro.
