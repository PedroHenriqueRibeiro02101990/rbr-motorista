-- Rollback de 20261029_01_nspedagio_base.sql
drop table if exists public.vpo_requisicoes;
drop index if exists public.operacoes_numero_vpo_key;
alter table public.operacoes drop column if exists numero_vpo;
drop sequence if exists public.operacoes_numero_vpo_seq;
drop function if exists public.nspedagio_segredo(text);
delete from supabase_migrations.schema_migrations where name = 'nspedagio_base';
