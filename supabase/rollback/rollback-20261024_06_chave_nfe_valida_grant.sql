-- Rollback de 20261024_06_chave_nfe_valida_grant.sql
-- Atenção: sem este grant, o insert de NF-e em operacao_nfes volta a falhar para authenticated (CHECK operacao_nfes_chave_dv).
set local lock_timeout = '8s';

revoke execute on function public.chave_nfe_valida(text) from authenticated;

delete from supabase_migrations.schema_migrations where name = 'chave_nfe_valida_grant';
