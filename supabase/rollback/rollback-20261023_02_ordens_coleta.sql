-- Rollback de 20261023_02: apaga a tabela ordens_coleta (as ordens registradas somem; os PDFs no bucket
-- operacao-documentos/<operacao>/ordem-coleta/ ficam e podem ser apagados à parte).
drop table if exists public.ordens_coleta;
delete from supabase_migrations.schema_migrations where name = 'ordens_coleta';
