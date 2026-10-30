-- Rollback de supabase-migrations/20261030_07_link_proposta.sql
-- Os links já gerados (linhas de propostas_publicas) ficam; para invalidar todos: update public.propostas_publicas set expira_em = now() where aceita_em is null;
drop function if exists public.gerar_link_proposta(uuid, integer);
