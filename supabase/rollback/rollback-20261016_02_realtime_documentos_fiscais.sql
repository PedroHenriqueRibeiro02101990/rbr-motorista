-- ROLLBACK de 20261016_02_realtime_documentos_fiscais: tira as duas tabelas do Realtime (a tela volta a depender só
-- da releitura a cada 10 s enquanto houver documento processando).
begin;
do $$
begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'documentacao_operacao') then
    alter publication supabase_realtime drop table public.documentacao_operacao;
  end if;
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'operacao_ciot_vpo') then
    alter publication supabase_realtime drop table public.operacao_ciot_vpo;
  end if;
end $$;
delete from supabase_migrations.schema_migrations where name = '20261016_02_realtime_documentos_fiscais';
commit;
