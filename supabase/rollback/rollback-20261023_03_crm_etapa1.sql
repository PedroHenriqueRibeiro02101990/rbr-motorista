-- Rollback de 20261023_03 (apaga leads, interações e oportunidades registrados).
drop view if exists public.v_fila_do_dia;
drop trigger if exists trg_interacao_primeiro_contato on public.interacoes;
drop function if exists public.trg_fn_interacao_primeiro_contato();
drop table if exists public.oportunidades;
drop table if exists public.interacoes;
drop table if exists public.leads;
delete from supabase_migrations.schema_migrations where name = 'crm_etapa1';
