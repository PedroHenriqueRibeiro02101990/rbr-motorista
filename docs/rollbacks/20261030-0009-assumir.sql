-- Rollback de 20261030_09_assumir.sql
drop function if exists public.assumir_operacao(uuid, boolean, text);
drop function if exists public.largar_operacao(uuid);
