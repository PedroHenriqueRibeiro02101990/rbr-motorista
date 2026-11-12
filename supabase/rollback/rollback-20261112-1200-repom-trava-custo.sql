-- Rollback de 20261112-1200-repom-trava-custo.sql
drop index if exists public.repom_requisicoes_dia_idx;
alter table public.cotacoes drop column if exists pedagio_consultado_em;
alter table public.cotacoes drop column if exists pedagio_origem;
delete from vault.secrets where name = 'REPOM_ROTEIRIZACAO_LIBERADA';
