-- Rollback de 20261023_07: remove a função de leitura e a chave interna de teste. Os 4 segredos EFRETE_* do Pedro ficam.
drop function if exists public.efrete_segredo(text);
delete from vault.secrets where name = 'EFRETE_TESTE_CHAMADA_INTERNA';
delete from supabase_migrations.schema_migrations where name = 'efrete_segredo';
