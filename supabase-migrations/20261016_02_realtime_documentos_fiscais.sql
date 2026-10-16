-- 20261016_02 — Realtime para o status dos documentos fiscais (tela Fiscal e tela da operação sem "Atualizar status")
--
-- O robô 'sincronizar-documentos-fiscais' (pg_cron, a cada minuto) grava o status vindo da Focus em
-- documentacao_operacao; com estas tabelas na publicação supabase_realtime o gestor recebe a mudança na hora.
-- O Realtime (postgres_changes) respeita o RLS de cada tabela: hoje gestor_rbr vê tudo e o agenciador só a
-- documentação liberada da própria operação (agenciador_ve_documentacao_liberada); nenhuma policy muda aqui.
-- Sem esta migration a tela continua funcionando: relê a cada 10 s enquanto houver documento processando.
-- Independente das outras migrations pendentes. Rollback: supabase/rollback/rollback-20261016_02_realtime_documentos_fiscais.sql

do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'documentacao_operacao') then
    alter publication supabase_realtime add table public.documentacao_operacao;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'operacao_ciot_vpo') then
    alter publication supabase_realtime add table public.operacao_ciot_vpo;
  end if;
end $$;
