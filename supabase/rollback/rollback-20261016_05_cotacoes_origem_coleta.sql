-- Rollback de 20261016_05 (versão no banco: 20261016142300). Apaga os CEPs/endereços de coleta já gravados.
-- Antes, volte o gestor para uma versão que não grava essas colunas (senão salvar cotação falha).
alter table public.cotacoes drop column if exists origem_endereco;
alter table public.cotacoes drop column if exists origem_cep;
delete from supabase_migrations.schema_migrations where version = '20261016142300';
