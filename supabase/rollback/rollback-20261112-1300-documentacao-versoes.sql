-- Rollback de 20261112-1300-documentacao-versoes.sql
-- Nao apaga a tabela nem a coluna versao (podem ter vindo do lote de comportamento A06 e guardam historico). Desfaz so o que esta migracao acrescentou.
drop policy if exists docversoes_funcoes on public.documentacao_operacao_versoes;
drop index if exists public.documentacao_versoes_unica;
alter table public.documentacao_operacao_versoes no force row level security;
alter table public.documentacao_operacao_versoes drop column if exists cancelado_em;
alter table public.documentacao_operacao_versoes drop column if exists emitido_em;
alter table public.documentacao_operacao_versoes drop column if exists emitido_por;
alter table public.documentacao_operacao_versoes drop column if exists motivo;
alter table public.documentacao_operacao_versoes drop column if exists protocolo;
