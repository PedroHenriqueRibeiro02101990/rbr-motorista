# Migrações pendentes de aplicação (ordem)

Nenhuma migração nova foi escrita nesta subida. O que está pendente da base (anteriores):

| Ordem | Arquivo | Estado | Rollback |
|---|---|---|---|
| 1 | `supabase-migrations/propostas/20261023_05_revoke_execute_nao_chamadas.sql` | proposta, NÃO aplicada (PR #15); checagem em `docs/checagem-aplicacao-seguranca-15-2026-10-28.md` | `supabase/rollback/rollback-20261023_05_revoke_execute_nao_chamadas.sql` |
| 2 | `supabase-migrations/propostas/20261023_06_pg_net_schema_extensions.sql` | proposta, NÃO aplicada; fora do horário de emissão | `supabase/rollback/rollback-20261023_06_pg_net_schema_extensions.sql` |
| — | `supabase-migrations/20261016_01_politica_prazo_desconto.sql` (PR #1) | NÃO aplicada; PR #1 parado por decisão do Pedro | `supabase/rollback/rollback-20261016_01_politica_prazo_desconto.sql` |

As Fases 2 e 3 (tipo de serviço, coleta/entrega, tomador, travas, arquivos) vão exigir colunas novas; ainda não foram escritas.
