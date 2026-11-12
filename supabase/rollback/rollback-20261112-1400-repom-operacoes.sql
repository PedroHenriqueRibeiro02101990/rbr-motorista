-- Rollback de 20261112-1400-repom-operacoes.sql
drop index if exists public.repom_requisicoes_dia_global_idx;
delete from vault.secrets where name in ('REPOM_API_LIBERADA', 'REPOM_VALOR_MAXIMO_OPERACAO');
drop table if exists public.repom_operacoes;
drop function if exists public.repom_operacoes_toca();
