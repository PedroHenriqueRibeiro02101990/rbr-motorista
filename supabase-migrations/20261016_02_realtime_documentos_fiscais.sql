-- 20261016_02_realtime_documentos_fiscais — JÁ APLICADA no banco real em 2026-10-16 (supabase_migrations.schema_migrations,
-- version 20261016034957). Conteúdo copiado de schema_migrations.statements; NÃO reaplicar.
-- Realtime para o status dos documentos fiscais e das averbações (tela Fiscal e da operação sem "Atualizar status").
-- O Realtime (postgres_changes) respeita o RLS de cada tabela; nenhuma policy muda aqui.
-- Rollback: supabase/rollback/rollback-20261016_02_realtime_documentos_fiscais.sql
alter publication supabase_realtime add table public.documentacao_operacao;
alter publication supabase_realtime add table public.operacao_ciot_vpo;
