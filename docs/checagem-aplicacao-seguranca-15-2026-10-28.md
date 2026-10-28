# Checagem antes de aplicar as propostas do PR #15 (NÃO APLICADAS)

Levantamento feito em 2026-10-28, só leitura, no projeto kwscmegsfbtvlnyxougt. Nada foi aplicado.

## (a) Quem usa o quê

### `pg_net` (hoje registrado em `public`, versão 0.20.4, não relocável: precisa de drop + create)
| Quem | Como usa | Situação |
|---|---|---|
| Gatilho `trg_averbar_automatico_ao_emitir` (em `documentacao_operacao`) | `net.http_post` + chave no Vault | **ativo** |
| Gatilho `trg_encerrar_mdfe_na_entrega` → `trg_fn_encerrar_mdfe_na_entrega` (em `operacoes`) | `net.http_post` + chave no Vault | **desligado** (`tgenabled = D`) |
| Cron `sincronizar-documentos-fiscais` (jobid 3, todo minuto) | `net.http_post` com `x-sync-secret` do Vault, só quando há documento pendente | ativo |
| Chamadas manuais de teste (docs/efrete-passo4-testes.md) | `net.http_post` + leitura de `net._http_response` | só quando alguém roda |

- **Caminho da chave interna da efrete (`EFRETE_TESTE_CHAMADA_INTERNA`):** nenhuma função, gatilho ou cron do banco a usa. Ela só é lida em SQL avulso (`vault.decrypted_secrets`) e enviada no cabeçalho `x-efrete-chave-interna` por `net.http_post`; a Edge Function compara com `efrete_segredo`. O drop do `pg_net` não mexe no Vault nem na função; só impede essa chamada manual durante os segundos da recriação.
- As funções plpgsql resolvem `net.http_post` na hora de rodar, então não são apagadas pelo drop. O cron também não.
- Hoje a fila `net.http_request_queue` está vazia e `net._http_response` tem 1 linha (teste meu); o drop apaga as duas (sem perda relevante).
- As permissões do schema `net` são refeitas pelo gatilho de evento do próprio Supabase (`issue_pg_net_access`).

### As 2 funções do revoke (`20261023_05`)
| Função | Quem chama | Efeito do revoke |
|---|---|---|
| `sincronizar_financeiro_operacao(uuid)` | ninguém: nenhuma função, gatilho, cron, view, política ou código do app/Edge. Só aparece em `shared/database.types.ts` (tipo gerado) | hoje `authenticated` pode executar; passa a ninguém (service_role e dono continuam) |
| `trg_fn_interacao_primeiro_contato()` | só o gatilho `trg_interacao_primeiro_contato` (tabela `interacoes`, ativo) | hoje `anon` e `authenticated` podem executar (herança de PUBLIC); gatilho continua disparando, pois o Postgres não confere EXECUTE no disparo |

## (b) Rollback exato
- `20261023_05`: `grant execute on function public.sincronizar_financeiro_operacao(uuid) to authenticated;` e `grant execute on function public.trg_fn_interacao_primeiro_contato() to public;` (arquivo `supabase/rollback/rollback-20261023_05_revoke_execute_nao_chamadas.sql`). Confere com o estado de hoje (primeira: só `authenticated`; segunda: PUBLIC, logo anon + authenticated).
- `20261023_06`: `drop extension if exists pg_net; create extension pg_net with schema public;` (arquivo `rollback-20261023_06_...`). Fila e respostas voltam vazias, como após a aplicação.
- Para qualquer um: se o cron ou o gatilho de averbação falhar durante a janela, a falha é só uma tentativa perdida; o cron tenta de novo no minuto seguinte. O gatilho de averbação perde o disparo daquele documento: reemitir a averbação pela tela.

## (c) Janela de menor risco sugerida
- Emissões fiscais registradas nos últimos 30 dias (horário de Brasília): 00h (3), 08h (3), 14h (3), 16h (9): são só operações de teste.
- Sugestão: **madrugada, entre 03h e 05h**, num dia sem operação de teste e com o cron conferido logo depois (próxima execução do jobid 3 e `select count(*) from net._http_response` subindo). Depois da reunião com a NSTech, como você pediu.
- Ordem: primeiro `20261023_05` (revoke, instantâneo, rollback de uma linha); depois `20261023_06` (alguns segundos sem `net.http_post`).
- Verificação logo após: `select extname, nspname from pg_extension e join pg_namespace n on n.oid = e.extnamespace where extname = 'pg_net';` (esperado `extensions`), cron ativo, e uma emissão de teste de averbação.
