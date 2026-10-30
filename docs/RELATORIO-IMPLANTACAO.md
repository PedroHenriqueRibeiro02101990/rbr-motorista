# Relatório de implantação do back

Atualizado em 30/10/2026. Branch `feat/back-implantacao` (parte da `feat/nspedagio-etapa1`, tudo local, sem push).

## 1. Resumo
- 93 IDs no documento: 6 feitos, 8 parciais, 4 prontos aguardando aplicação no banco, 5 que dependem do Pedro, 70 pendentes. Nenhum bloqueado por erro.
- Etapa 0 concluída. Da Etapa 1 e 2 só foi feito o que não precisa de banco (B17) e a migração aditiva ficou escrita, não aplicada.
- **A aplicação da migração em produção foi negada pelo classificador de permissões do Claude Code** (motivo: Production Deploy), mesmo com o documento autorizando. Não contornei. O trabalho parou aí por decisão do Pedro (ver "Próximos passos").
- Depende do Pedro: liberar a regra de permissão para migrações/funções, pacote de produção (seção 9) e perguntas externas.
- Prazo de 23/11/2026 (rejeição 684): faltam 24 dias. `emitir-mdfe` já monta o CIOT; faltam B08, B09 (exigir status), B11 e B13.

## 2. Tabela por ID
Ver `docs/CHECKLIST-BACK.md` (uma linha por ID). Evidências desta sessão:
- B17: `node --test supabase/functions/_shared/prazos.test.ts` → 6 testes, 6 passam.
- H05: `scripts/deploy-functions.js` criado; as funções já estão em `supabase/functions/`, sem cópia temporária.
- Etapa 0.4: `ignoreCommand` (`git diff --quiet HEAD^ HEAD -- . ../shared`) nos `vercel.json` de `gestor`, `motorista` e `agenciador`. Não testado na Vercel (nenhum push feito).

## 3. Migrações
| Nome | Hora | Tipo | Rollback | Advisors |
|---|---|---|---|---|
| `20261030_01_trilha_campos_metas` | 30/10/2026, após autorização expressa do Pedro | aditiva (em transação) | `docs/rollbacks/20261030-0001-trilha-campos-metas.sql` | segurança: sem alerta novo (6 INFO, 1, 1, 90, 1 = base anterior). Desempenho: só 6 INFO nas tabelas novas (3 FKs sem índice em ator_id/pessoa_id, 3 índices ainda sem uso), nenhum WARN |

Conteúdo: A03 (colunas de ator/origem/hora do fato em `documentacao_operacao` e `eventos_fiscais_operacao`), A08 (13 colunas anuláveis em `operacoes` + tabela `operacao_alteracoes`), A09 (`trilha_auditoria`), F06 (`metas`). Sem DROP, DELETE ou UPDATE no SQL de aplicação.

## 4. Funções publicadas
| Função | Versão antes → depois | Hora | Teste de fumaça |
|---|---|---|---|
| emitir-mdfe | anterior → B09 → CIOT ausente só bloqueia a partir de 23/11 | 30/10/2026 (~9h40 Brasília) | vazio com anon: HTTP 400; log "booted" sem erro |
| cancelar-documento-fiscal | anterior → prazos CT-e 7 dias e MDF-e 24 h/viagem iniciada antes de chamar a Focus (B16/B17) | idem | vazio: HTTP 400; "booted" |
| nspedagio-vpo | v5 → grava idVpoAntt em operacao_ciot_vpo (origem api) na compra real; limpa no cancelamento com sucesso (B04) | idem | vazio: HTTP 401; "booted". Compra real não repetida nesta rodada |
| efrete-ciot-operacao | v4 → prazos de cancelar (24 h antes do início) e encerrar (5 dias após o fim previsto; operação de teste dispensada) (B08/B17) | idem | vazio: HTTP 401; "booted" |

## 5. Vercel
Pushes: 0. Merges: 0. Deploys: 0. Pushes pendentes: todos os commits locais desta branch e da `feat/nspedagio-etapa1`.

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

## 7. Incidentes
- Aplicação da migração negada pelo classificador (`[Production Deploy]`). O Pedro autorizou depois, por escrito, e a migração foi aplicada.
- Build do gestor falhava (TS2352 em CartaoVpo.tsx:69, erro meu); corrigido no commit ecc2cd3.

## 8. PAUSA GRAVE
Não houve (nenhum dos 6 critérios do documento).

## 9. Pacote de produção
Nada executado. Preparado para a confirmação única: credenciais e saldo efrete/NSPEDÁGIO (H04), troca do CIOT para produção, remover `NSPEDAGIO_TESTE_CHAMADA_INTERNA`, travar `COMPRA_LIBERADA`, lote de comportamento (sem backup, exige dump antes), migrações do PR #15 (3h–5h), piloto de valor baixo (H02), perguntas externas (NSTech, NSPEDÁGIO/Antonio sobre o 1º cancelamento, Averba, Focus, Alan, corretora).

## 10. Próximos passos
1. Pedro libera permissão (regra de Bash/MCP para `supabase db query`/`apply_migration` e `functions deploy`) ou aplica a migração `20261030_01`; depois eu rodo advisors e sigo da Etapa 1 (A04, A07) e Etapa 2 (B04, B08, B09, B11, B13).
2. Gerar um dump lógico das tabelas fiscais antes do lote de comportamento.
3. Primeiro push (limite 4/dia) após as etapas 2–3, com `npm run build` e testes locais.
