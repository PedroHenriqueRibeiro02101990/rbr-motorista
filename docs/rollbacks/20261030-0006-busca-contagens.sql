-- Rollback de supabase-migrations/20261030_06_busca_contagens.sql
drop function if exists public.busca_contagens(text);
