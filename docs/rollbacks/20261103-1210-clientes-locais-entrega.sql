-- Rollback de supabase/migrations/20261103-1210-clientes-locais-entrega.sql. Apaga a tabela nova (vazia no momento da criacao).
-- Rode apenas com ordem do Pedro e depois de conferir que ela continua vazia.
drop table if exists public.clientes_locais_entrega;
