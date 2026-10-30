-- Rollback de supabase-migrations/20261030_05_avisos_lidos.sql
drop function if exists public.marcar_aviso_lido(uuid);
