# Revisão crítica: erros e melhorias

Nada foi corrigido; só registrado. Data: 2026-11-12. Gravidade: A/M/B. Esforço: P/M/G. **FATO** = verificado no código ou no banco (evidência citada). **SUSPEITA** = indício a confirmar.

## A. Fatos verificados

| ID | Área | Achado | Tipo | Grav. | Evidência | Sugestão | Esf. |
|---|---|---|---|---|---|---|---|
| F01 | Fiscal | Nenhuma chamada à Focus tem timeout: `fetch` sem `AbortSignal` em `emitir-cte`, `emitir-mdfe`, `cancelar-documento-fiscal`, `consultar-documento-fiscal`, `eventos-fiscais`, `sincronizar-documentos-fiscais`, `emitir-nfse-intramunicipal`. Só efrete (25 s), NSPEDAGIO (60 s) e Repom (30 s) têm | risco | A | busca de `AbortSignal/timeout` em `supabase/functions/*/index.ts`; `_shared/efreteClient.ts:216` | Helper único `fetchComTimeout` (ex.: 45 s) e gravar "sem resposta" em `documentacao_operacao` | M |
| F02 | Fiscal | Averbação (`enviar-averbacao`, `-rcv`) e Gemini (6 funções) também sem timeout | risco | M | mesma busca | Mesmo helper | P |
| F03 | Banco | Migrações `20261030_01..12` do repositório (trilha, fluxo, link de proposta, assumir, finalizando…) **não constam** em `schema_migrations`, mas as funções existem. Duas pastas de migração (`supabase/migrations`, `supabase-migrations`) e rollbacks em duas pastas (`supabase/rollback`, `docs/rollbacks`) | divergência | A | `list_migrations` x `ls supabase-migrations`; `gerar_link_proposta` existe no banco | Unificar pasta, registrar as migrações aplicadas à mão, uma convenção de rollback | M |
| F04 | Funções | Publicadas **sem fonte no repo**: `consultar-protesto` (verify_jwt **false**) e `baixar-documento-fiscal`. Repo-only não publicadas: `repom-pedagio-rota`, `repom-status` | risco | A | `list_edge_functions` x `ls supabase/functions` | Trazer o código ao repo, revisar auth do protesto | P |
| F05 | Segurança | Proteção contra senha vazada do Auth desligada | risco | M | advisor `auth_leaked_password_protection` | Ligar no painel | P |
| F06 | Segurança | 101 funções `SECURITY DEFINER` executáveis por `authenticated`; 1 por `anon` (`trg_fn_interacao_primeiro_contato`) | risco | M | advisors `authenticated_security_definer_function_executable`, `anon_security_definer_function_executable` | Revisar uma a uma se checam papel por dentro; revogar a de trigger do anon | G |
| F07 | Segurança | `pg_net` instalada no schema public | divida | B | advisor `extension_in_public` | Mover para `extensions` | P |
| F08 | Tela x banco | A Central de integrações (PR #67) lê `efrete_ciot_pedidos`, mas a tabela tem RLS sem policy para usuário: o gestor verá "sem registro" mesmo havendo CIOT. Também `efrete_ciot_pagamentos`, `efrete_cadastros` | inconsistência | M | advisor `rls_enabled_no_policy`; comentário da tabela "Só service_role" | Ler por RPC de gestor ou função só-leitura (outra fase) | P |
| F09 | Permissões | Rotas `/jornada`, `/metas`, `/risco`, `/conformidade`, `/relatorio-comercial` não filtram papel na rota; só o RLS protege o dado | permissão ampla | M | `gestor/src/App.tsx` (só `PAPEIS_DO_PAINEL`), `menuPorPapel.ts` | Guard por papel na rota (defesa em profundidade) | P |
| F10 | Dados | Duplicidade do número do CIOT em duas tabelas (`operacao_ciot_vpo.ciot` e `efrete_ciot_pedidos.ciot`); hoje **1 operação diverge** | campo duplicado | M | consulta ao banco (contagem 1) | Definir fonte única ou trigger de sincronização; investigar a operação | M |
| F11 | Dados | Duas tabelas para AET (`aet_autorizacoes` e `autorizacoes_aet`), ambas vazias | divida | B | `list_tables` | Escolher uma e remover a outra | P |
| F12 | Textos | Comentários e texto antigos citam WebmaniaBR em `parametros_fiscais` e `documentacao_operacao`, mas a integração é a Focus; `LiberarCaminhaoInfo` avisa que o link do cliente não existe | texto desatualizado | B | comentários de tabela; `LiberarCaminhaoInfo.tsx` | Atualizar comentários | P |
| F13 | Usabilidade | Botão **Assumir** em Serviços está desativado enquanto a RPC `assumir_operacao` existe; vários botões visíveis e desativados (Enviar ao gestor, Aprovar, Recusar, Convidar, Cancelamentos) | usabilidade | B | `Servicos.tsx:202`, `PrecoVisual.tsx:261`, `Fiscal.tsx:1452` | Esconder o que não existe ou ligar | P |
| F14 | Usabilidade | Telas gigantes: `Cotacao.tsx` 4.983 linhas, `Cadastros.tsx` 3.621, `Operacoes.tsx` 1.548, `Fiscal.tsx` 1.663 | divida | M | `wc -l` | Quebrar em componentes por aba | G |
| F15 | Testes | 17 arquivos de teste para 33 funções; sem teste de handler em `cancelar-documento-fiscal`, `enviar-averbacao*`, `sincronizar-documentos-fiscais`, `consulta-cadastros`, `conta-publica`, `acesso-app`, `financeiro-ia`; sem teste de RLS automatizado em CI conhecido | falta de teste | A | `find *.test.ts` | Testes de contrato por função crítica e de isolamento de RLS | G |
| F16 | Erros engolidos | 16 usos de `.catch(() => null)` em parse de resposta (inclui respostas da Focus); falha vira "resposta vazia" sem rastro | engole erro | M | busca em `supabase/functions` (ex.: `emitir-cte/index.ts:247`, `emitir-mdfe/index.ts:308`) | Registrar o texto bruto truncado em `mensagem_erro` | P |
| F17 | Go-live | Efrete só aceita homologação (trava no código) e NSPEDAGIO tem ambiente fixo `homologacao`; CIOT obrigatório no MDF-e em produção em 23/11/2026 | risco | A | `checklist-producao.md`, `nspedagioClient.ts`, `prazos.ts` | Plano de virada de ambiente antes de 23/11 | M |
| F18 | Retenção | Política LGPD cita limpeza de imagens (90 dias) e GPS (2 anos), mas o cron só limpa `tentativas_acesso_publico` | processo manual | M | `cron.job` (5 jobs) | Criar rotina e relatório de execução | M |
| F19 | Fiscal x tela | Reemissão/correção de CT-e e MDF-e e aba "Cancelamentos" não existem como fluxo na tela | falta | M | `Fiscal.tsx:1452` desativado | Entrega da outra janela (PR #65); acompanhar | G |
| F20 | Desempenho | `sincronizar-documentos-fiscais` roda a cada minuto, 24 h por dia | desempenho | B | `cron.job` | Frequência adaptativa ou só com documento pendente | P |
| F21 | Estado | Status `aguardando_aceite_motorista`, `em_emissao`, `aguardando_liberacao_gestor`, `ordem_liberada`, `em_viagem` existem no enum, mas a função de transição não define caminhos para eles; qualquer gestor pode pular de um estado a outro (só `liberada_em` e fechamento são exigidos) | estado/regra só na tela | M | definição de `trg_fn_operacao_valida_transicao` | Tabela de transições permitidas | M |
| F22 | Tela x banco | Parte das regras fiscais vive só na função (ex.: prazos em `_shared/prazos.ts`) e na tela (textos copiados), sem uma trava equivalente no banco | regra duplicada | M | `prazos.ts` x `PENDENCIAS-PEDRO.md` (prazos "copiados do desenho") | Fonte única | M |

## B. Suspeitas (a confirmar)
| ID | Área | Suspeita | Por que | Como confirmar |
|---|---|---|---|---|
| S01 | Estado preso | 54 documentos com status `pendente` há mais de 1 dia; 4 operações reais paradas há mais de 7 dias | consulta ao banco; `pendente` pode ser "ainda não emitido", normal | Separar por operação ativa e exigência |
| S02 | Segurança | `consultar-protesto`, `consulta-cadastros` e `eventos-fiscais` com verify_jwt false dependem de checagem interna | fonte do protesto indisponível | Ler o código publicado |
| S03 | Idempotência | Emissão de CT-e/MDF-e usa `ref` por operação, mas reenvio após timeout não foi verificado ponta a ponta | sem timeout (F01) | Teste com Focus em homologação |
| S04 | Processo manual | Disparo de aviso de carga é por link do WhatsApp (manual), limite 100/dia | `wa.me` nas telas | Avaliar API oficial |
| S05 | Permissões | Policy `authenticated_le_pix_taxa_motorista` em `parametros_sistema` pode expor mais que a chave Pix | só o nome foi lido | Ler a condição da policy |
| S06 | Código morto | Funções `emitir-*-teste*`, `efrete-*-teste` e rota `/demo-ciot` continuam publicadas | existem no inventário | Remover na virada de produção |

## C. TOP 15 (impacto × esforço)
1. F17 plano de virada de ambiente antes de 23/11 (A, M)
2. F01 timeout em todas as chamadas à Focus (A, M)
3. F03 unificar migrações e registrar as 20261030 (A, M)
4. F04 trazer `consultar-protesto` e `baixar-documento-fiscal` ao repo (A, P)
5. F15 testes de contrato das funções críticas e de RLS (A, G)
6. F08 Central de integrações ler `efrete_*` por caminho permitido (M, P)
7. F05 ligar proteção de senha vazada (M, P)
8. F10 fonte única do número do CIOT e investigar a divergência (M, M)
9. F09 guard de papel nas rotas (M, P)
10. F21 tabela de transições de status (M, M)
11. F16 não engolir erro de resposta da Focus (M, P)
12. F18 rotina de retenção LGPD (M, M)
13. F06 revisar as 101 funções DEFINER (M, G)
14. F13 esconder botões inexistentes (B, P)
15. F12/F11 limpar texto antigo e tabela AET duplicada (B, P)

## D. Plano em lotes pequenos para mandar ao Code
- **Lote 1 (segurança e robustez, 1 PR)**: F01, F02, F16 (helper de timeout e registro do erro bruto).
- **Lote 2 (repositório = produção, 1 PR)**: F03, F04, rollbacks em uma pasta, comentários F12.
- **Lote 3 (acesso, 1 PR)**: F09, F05 (instrução), F13, S05.
- **Lote 4 (dados, 1 PR com SQL aditivo e rollback)**: F10, F11, F21.
- **Lote 5 (testes, 1 PR)**: F15 por ordem: `cancelar-documento-fiscal`, `enviar-averbacao`, `sincronizar-documentos-fiscais`, RLS.
- **Lote 6 (virada de produção, depois da decisão do Pedro)**: F17, F18, F20, S06.
