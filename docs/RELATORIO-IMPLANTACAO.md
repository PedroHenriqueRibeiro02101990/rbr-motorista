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

## 6f. Lote de comportamento (autorizado em 30/10, NÃO aplicado)
- Arquivos: `supabase-migrations/20261030_03_lote_comportamento.sql` e rollback `docs/rollbacks/20261030-0003-lote-comportamento.sql`.
- Teste ANTES (set local role, transação descartada): os 3 gestores (Pedro, José Carlos, José Eduardo) enxergam 100% de 13 tabelas (operacoes 8/8, clientes 7/7, cotacoes 15/15, documentacao_operacao 48/48, lancamentos 72/72, vpo_requisicoes 16/16 etc.); usuário comum enxerga 0.
- Rollback testado: lote + rollback numa transação descartada devolveram exatamente o estado anterior (colunas 2024, funções 253, políticas 210, gatilhos 131, tabelas 145).
- Risco evitado na revisão: a política nova de operacoes lia clientes e uma política existente de clientes lê operacoes (recursão de políticas); troquei por função auxiliar.
- Desvio do documento (A06): o UNIQUE de documentacao_operacao foi mantido porque 4 funções de emissão usam upsert onConflict por operacao_id,tipo; o histórico vai por gatilho.
- C10 (dados da Portaria SUROC 22/2026) fora do lote: faltam os 272 coeficientes oficiais.
- **Aplicação negada pelo classificador ([Production Deploy])**, mesmo com a autorização escrita pelo Pedro. Nada do lote está no banco. Falta: aplicar, repetir o teste de papéis (script scratchpad/teste-papeis.cjs post), advisors, fumaça nas funções e só então o merge.

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

## 6g. Lote de comportamento APLICADO (30/10/2026)

Aplicado pelo usuário (`supabase db query -f 20261030_03_lote_comportamento.sql`, uma transação). Verificação feita depois:

- **Papéis (set local role, rollback ao fim): OK.** Os 3 sócios gestores seguem vendo 100% das 14 tabelas testadas (operações 8/8, clientes 8/8, cotações 15/15, documentos 48/48, lançamentos 72/72, VPO 16/16, pessoas 34/34). Comercial sem carteira vê 0 de tudo; financeiro vê só clientes, operações e lançamentos; fiscal vê clientes, cotações, operações, documentos e eventos fiscais; operação vê clientes, cotações, operações, documentos e eventos fiscais. Nenhum papel novo vê lançamentos, apólices, VPO, metas ou CIOT fora da sua função. `efrete_ciot_pedidos` segue sem política para autenticados (-1), igual ao ANTES.
- **Advisors: OK.** Segurança: 6 INFO, 1, 1, 1 como antes; avisos de função SECURITY DEFINER para autenticados foram de 90 para 92 (`cliente_na_minha_carteira` e `avancar_em_nome_do_motorista`, ambas esperadas e com checagem interna).
- **Funções: OK.** saude-fiscal, emitir-mdfe, emitir-cte, cancelar-documento-fiscal, efrete-ciot-operacao e nspedagio-vpo respondem 401 sem login (no ar, protegidas). Não houve emissão real.
- **B12:** gatilho de encerramento automático do MDF-e removido (0 no banco). **B13:** pré-voo único no detalhe da operação.
- Teste `shared/test/nfeOperacao.test.ts` só roda no Deno (importa `npm:`); fora da lista do CI, não é regressão.
- Merge na main: ainda não feito; falta o build completo de todos os apps e fica para depois da autorização de push (limite diário de 4 pushes já usado).

## 6h. Estado "finalizando" e aviso ao fiscal (30/10/2026)

Migração aditiva `20261030_04_finalizando.sql` aplicada (rollback em `docs/rollbacks/20261030-0004-finalizando.sql`): funções `iniciar_finalizacao` (só gestor; entregue ou em_viagem vira `finalizando` e grava aviso em `notificacoes` para quem tem a função fiscal e para os gestores) e `terminar_finalizacao` (`finalizada` se MDF-e e CIOT foram encerrados; senão volta a `entregue`). O botão Finalizar viagem chama as duas. Teste em transação descartada como gestor: status `finalizando` com 3 avisos, depois `entregue` ao simular falha. O teste achou e corrigiu um erro de tipo do enum `canal_notificacao` antes de qualquer uso real. Não testado no navegador.

## 6i. Sino e central de avisos (30/10/2026)

Migração aditiva `20261030_05_avisos_lidos.sql` aplicada (rollback em `docs/rollbacks/20261030-0005-avisos-lidos.sql`): função `marcar_aviso_lido` (cada pessoa só marca os próprios avisos). Gestor: página `/avisos` e item no menu com contador de não lidos. Build ok. Não testado no navegador.

## 6j. B13 botão por etapa e H01 bateria (30/10/2026)

Pré-voo: cada pendência ganhou o botão "Ir para Fiscal/Motorista/Financeiro" (`lib/preVooEtapas.ts`, 4 testes). Bateria `gestor/test/fluxoEmissaoFinalizacao.test.ts`: 14 cenários (janela de emissão até a véspera, CIOT ausente só bloqueia depois de 23/11/2026, CIOT efrete só vale emitido, timeout nunca reenvia sem consultar, referência nova a cada tentativa, vigência do VPO, passos da finalização e retomada só do que falhou, prazos de encerramento e cancelamento, cancelar a operação inteira na ordem e parando no que trava). Não emite nada real. O que continua pendente da bateria está no H01 do checklist.

## 6k. Cancelar a operação inteira (B15)

Novo `CancelarOperacaoInteira.tsx`, aberto pelo link "Cancelar tudo na ordem" que aparece em Operações quando há documento fiscal emitido. Mostra o plano (MDF-e, CIOT, vale-pedágio, averbação, CT-e), exige motivo de 15 a 255 letras e a caixa "Entendo", executa passo a passo chamando as funções que já conferem os prazos no servidor, grava cada passo em `operacao_cancelamento_passos` e só cancela a operação se tudo deu certo. Averbação não tem função de cancelamento: o plano trava e orienta fazer na seguradora. **Não executei nenhum cancelamento** (efeito fiscal e financeiro real). Build ok, não testado no navegador.

## 6l. Início por função (F05) e Busca (F04)

Início: seletor "Ver como" (`lib/inicioPorFuncao.ts`, 3 testes). Busca: página `/busca` e migração aditiva `20261030_06_busca_contagens.sql` (aplicada; rollback em `docs/rollbacks/20261030-0006-busca-contagens.sql`), função que devolve só contagens de clientes e cotações. Teste em transação descartada: o gestor vê 2 de 2 cotações; um usuário comercial sem carteira vê 0 de 2 e a tela diz "2 resultados ocultos pela sua função". **Decisão:** a interpretação de frase livre por IA não foi feita (exigiria uma função nova com chave de IA e custo por consulta); a busca casa nome, CNPJ e cidade. **Aviso:** a tela do gestor só aceita o papel gestor (`App.tsx`); abrir para comercial, operação, fiscal e financeiro entrarem é decisão de acesso e fica para depois.

## 6m. Link público de aceite (E04/E05)

Migração aditiva `20261030_07_link_proposta.sql` (aplicada; rollback em `docs/rollbacks/20261030-0007-link-proposta.sql`) e função `proposta-publica` publicada. Smoke test real: sem chave 401; código inválido ou inexistente 404 com a mesma mensagem; ação desconhecida 400; link válido devolve só origem, destino, carga, valor e validade; aceite sem nome 400. Linha de teste removida. O aceite real não foi disparado (avisaria os gestores). Gerador testado por papel: gestor gera e reaproveita; comercial é recusado. Não testado no navegador.
