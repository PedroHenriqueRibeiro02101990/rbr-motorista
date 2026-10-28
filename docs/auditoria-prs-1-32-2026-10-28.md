# Auditoria dos PRs #1 a #32 (2026-10-28)

CI: o repositório só tem as verificações da Vercel (o build do gestor roda `tsc -b && vite build`). Além disso rodei, em cada PR aberto, o resultado do merge com a main: `tsc -b` (gestor, motorista, agenciador), `node --test` e `vite build`. Todos passaram (detalhe no fim).
Migração "aplicada" = conferida em `list_migrations` do projeto Supabase. Nenhuma migração foi aplicada por mim.

| PR | Título | Estado | CI | Conflito com a main | Migração | Dinheiro / Pix / segurança | Recomendação |
|---|---|---|---|---|---|---|---|
| #1 | Política de prazo e desconto no cotador (depende da integracao-2026-10-15; não mesclar ainda) | aberto (draft) | verde (Vercel) | CONFLITO (base integracao-2026-10-15) | sim: 20261016_01_politica_prazo_desconto — NÃO aplicada | Sim (desconto/prazo em fatura e preço) | Não mesclar → Pedro |
| #2 | Fiscal: status dos documentos ao vivo, sem botão "Atualizar status" | mesclado | — | — | — | — | mesclado |
| #3 | Averbação RC-V (Sompo) do MDF-e nas telas e repositório sincronizado com o que está no ar | mesclado | — | — | — | — | mesclado |
| #4 | Integração 2026-10-15: modo teste, regras fiscais, status ao vivo, averbação Sompo e melhorias B1–B5 (não mesclar sem OK) | mesclado | — | — | — | — | mesclado |
| #5 | Painel da operação enxuto (próximo passo + linha do tempo) | mesclado | — | — | — | — | mesclado |
| #6 | Cotação: tipo de carga obrigatório para enviar/converter | mesclado | — | — | — | — | mesclado |
| #7 | Cotação: coleta em outro local (origem editável) | mesclado | — | — | — | — | mesclado |
| #8 | Avisos só enquanto acionáveis (todo o ERP) | aberto | verde (Vercel) | limpo | sim: 20261016_05 — aplicada (cotacoes_origem_coleta_cep_endereco) | Não | Mesclar |
| #9 | App motorista: envio de documento (CNH) que chega ao banco | aberto | verde (Vercel) | limpo | não | Dados pessoais (foto da CNH), sem dinheiro | Mesclar |
| #10 | Cotação: título origem → destino | aberto | verde (Vercel) | limpo | não | Não | Mesclar |
| #11 | Cadastro: tipo de documento comprovante de residência (migration + rollback) | aberto | verde (Vercel) | limpo | sim: 20261023_01 — aplicada (documentos_tipo_comprovante_residencia) | Não | Mesclar |
| #12 | Operação: ordem de coleta (PDF do motorista) + tabela ordens_coleta | aberto | verde (Vercel) | limpo | sim: 20261023_02 — aplicada (ordens_coleta) | Não | Mesclar |
| #13 | CRM comercial: leads, receber-lead e Fila do dia (etapa 1 + início da 2) | aberto | verde (Vercel) | limpo | sim: 20261023_03 — aplicada (crm_etapa1); a função receber-lead já está no ar (verify_jwt=false) | Segurança: endpoint público já existente; o PR só traz o código ao repositório + tela Fila do dia | Mesclar (anotado) |
| #14 | Segurança: remove backup _bkp_gr_exigido_20261015 (migration + rollback) | fechado | verde (Vercel) | limpo | sim (rollback/drop de backup) | Não | Fechado: manter como está |
| #15 | Segurança Supabase: análise e propostas (revoke de 2 funções, pg_net) — sem aplicar | aberto | verde (Vercel) | limpo | sim: propostas 20261023_05 e _06 — NÃO aplicadas (de propósito) | Segurança (revoke de funções, pg_net) | Não mesclar → Pedro |
| #16 | efrete (NSTech): conexão na homologação — cliente, função de teste e leitura do Vault | mesclado | — | — | — | — | mesclado |
| #17 | efrete (NSTech): proxy na Vercel + login e consultas OK na homologação (depende do #16) | mesclado | — | — | — | — | mesclado |
| #18 | efrete passo 3: CIOT Padrão com Pix na homologação (depende do #17) | mesclado | — | — | — | — | mesclado |
| #19 | Passo 4: NF-e do cliente na operação + CIOT da efrete ligado à operação (depende do #18) | mesclado | — | — | — | — | mesclado |
| #20 | Efrete: passos 2 a 4 (conexão, CIOT de teste, NF-e do cliente na operação) | mesclado | — | — | — | — | mesclado |
| #21 | Preparação para produção: CT-e/MDF-e publicados, RLS das NF-e, acentos no proxy, checklist e VPO | mesclado | — | — | — | — | mesclado |
| #22 | Proxy efrete: publicar correção de acentos (deploy) | mesclado | — | — | — | — | mesclado |
| #23 | Corrigir permissão de nfes_em_outra_operacao | mesclado | — | — | — | — | mesclado |
| #24 | Fechar pendências: permissões das NF-e (grant chave_nfe_valida e eh_backend por sessão) | mesclado | — | — | — | — | mesclado |
| #25 | Mapa do Início volta a claro | mesclado | — | — | — | — | mesclado |
| #26 | Operação: linha do tempo aprovada (painel lateral, cartão GR, CIOT manual, etapas recolhidas) | mesclado | — | — | — | — | mesclado |
| #27 | Painel 'O que fazer agora': filtro por tipo e 'Tudo em dia' | aberto | verde (Vercel) | limpo | não | Não | Mesclar |
| #28 | Cadastros: lista de clientes com filtros e Novo cliente enxuto (Tela 2, parcial) | aberto | verde (Vercel) | limpo | não | Não | Mesclar |
| #29 | Segurança: CIOT pela efrete só em produção real; CIOT manual é o caminho | mesclado | — | — | — | — | mesclado |
| #30 | CIOT pela efrete: tela da demonstração de homologação | aberto (draft) | verde (Vercel) | limpo | não (só SQL de limpeza em docs, não executável pelo app) | Fluxo CIOT/Pix atrás de flag DESLIGADA; trava 412 intacta; tela e demo só com flag | Mesclar |
| #31 | Fase 0: datas previstas de coleta e entrega na operação | aberto (draft) | verde (Vercel) | limpo | não | Não | Mesclar |
| #32 | Checklist de produção da efrete (só documento) | aberto (draft) | verde (Vercel) | limpo | não | Não | Mesclar |

## Verificação local do merge com a main
| PR | Resultado |
|---|---|
| #8 | tsc ok (3 apps), 30 testes ok, build ok |
| #9 | tsc ok (3 apps), 29 testes ok, build do motorista ok |
| #10 | tsc ok, 28 testes ok, build ok |
| #11 | tsc ok (3 apps), 25 testes ok |
| #12 | tsc ok (3 apps), 32 testes ok, builds ok |
| #13 | tsc ok (3 apps), 28 testes ok, build ok |
| #27 / #28 | tsc ok, 25 testes ok, build ok |
| #30 | tsc ok, 32 testes ok, build ok; build sem flags não contém o cartão do CIOT nem a demo (0 ocorrências) |
| #31 | tsc ok, 31 testes ok, build ok |
| #32 | só documento |

## Decisões conservadoras registradas
- #13: a função `receber-lead` (pública) e as tabelas já estão no ar; o merge só alinha o repositório e mostra a Fila do dia no menu. Mesclo, mas anoto aqui.
- #14 está fechado (não foi mesclado) e fica como está.
- #1 aponta para a base `integracao-2026-10-15` (já incorporada na main pelo #4): não dá para mesclar sem refazer a base e aplicar a migração.

## Resultado da execução (2026-10-28)

### Merges (squash, em lotes; SHA da main antes → depois)
| Lote | PR | Antes | Depois |
|---|---|---|---|
| 1 | #32 checklist de produção + esta auditoria | 6414908 | 273f1db |
| 1 | #31 datas previstas | 273f1db | 481141a |
| 1 | #30 cartão do CIOT + /demo-ciot | 481141a | 2a80c99 |
| 2 | #8 avisos acionáveis | 2a80c99 | c1be234 |
| 2 | #9 envio de documento no app do motorista | c1be234 | a724e5c |
| 2 | #10 título origem → destino | a724e5c | d0acad3 |
| 3 | #11 comprovante de residência | d0acad3 | f606623 |
| 3 | #12 ordem de coleta | f606623 | a975e89 |
| 3 | #13 CRM / Fila do dia | a975e89 | 38cc974 |
| 4 | #27 painel "O que fazer agora" | 38cc974 | a30bcf6 |
| 4 | #28 lista de clientes | a30bcf6 | b07ee81 |

Antes de cada lote o merge com a main foi testado de novo (tsc nos 3 apps, testes, build). Reversão, se precisar: um PR de revert por merge, a partir do SHA "antes".

### Verificação da produção (gestor.rbrcargo.com.br) depois de cada lote
- Página e arquivo principal respondem 200; o chunk do cliente Supabase tem a URL do projeto; o endpoint de saúde do Auth responde 200.
- O pacote de produção NÃO contém o cartão do CIOT nem a demonstração (0 ocorrências de "Conferência antes de emitir" e "DEMONSTRAÇÃO: dados fictícios" em todos os arquivos JS da página): com a flag desligada o código nem é incluído.
- `/demo-ciot` na produção devolve a página normal do app (200 do SPA, sem a demonstração).
- Limite: não há navegador aqui. "Login abre" e "painel carrega" foram verificados só até a página, o pacote e o Auth; a passada visual com login é sua.
- Variáveis da Vercel: nada alterado em Production. As variáveis novas (`VITE_EFRETE_CIOT_HABILITADO`, `VITE_DEMO_CIOT`, `VITE_SUPABASE_*`) existem só no escopo Preview, da branch `tela-ciot-homologacao-2026-10-28`.

### Não feito
- Deploy da função `efrete-ciot-operacao`: não fiz. A versão publicada (v2) é anterior ao PR #29 (não tem `travaEfreteOperacao`) e à mudança do `status`. Publicar exige enviar 4 arquivos (~83 KB) pelo conector; recusei copiar à mão por risco de erro de transcrição. Comando: `supabase functions deploy efrete-ciot-operacao --project-ref kwscmegsfbtvlnyxougt`. Depois, a chamada de status da operação 965ceb0d (sem emitir nada) mostra `ambiente` e `pagamentos`.
- Nenhuma migração aplicada. Nenhum PR fechado. Nenhuma branch apagada.

### Contagem final (#1 a #32)
- Mesclados antes desta tarefa: 18 (#2 a #7, #16 a #26, #29). Mesclados agora: 11. Total mesclado: 29 de 32.
- Fechado sem mesclar: #14 (já estava fechado).
- Abertos para o Pedro: #1 e #15.
- Consertados nesta tarefa: 0 (nenhum precisou de conserto).

## Fase D: o que fica para o Pedro
**#1 Política de prazo e desconto (draft, conflito)**
- Muda: cotador com prazo de pagamento e desconto (−2% a +4,5% sobre 7 DDL), regra de recebimento e desconto condicional em fatura. Mexe em preço e fatura.
- Risco: base antiga (`integracao-2026-10-15`), conflito, migração `20261016_01` não aplicada e depende de funções da `20261014_01`/`20261015_12`.
- Pergunta: 1) Você ainda quer esta política de prazo e desconto? Se sim, eu refaço a branch sobre a main e deixo a migração pronta para você aplicar.

**#15 Segurança Supabase (propostas, sem aplicar)**
- Muda: propõe revogar EXECUTE de 2 funções (`sincronizar_financeiro_operacao`, `trg_fn_interacao_primeiro_contato`) e recriar `pg_net` fora do schema `public`.
- Risco: o `pg_net` derruba por segundos as chamadas HTTP dos gatilhos de averbação/MDF-e e do cron; fazer fora do horário de emissão.
- Pergunta: 2) Posso mesclar só o documento e as propostas (sem aplicar nada)? 3) Quando você autoriza aplicar as duas migrações, e em que horário?
