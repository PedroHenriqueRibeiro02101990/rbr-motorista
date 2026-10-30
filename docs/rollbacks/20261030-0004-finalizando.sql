-- Rollback de supabase-migrations/20261030_04_finalizando.sql. Antes: conferir que nenhuma operação está em 'finalizando' (voltar para 'entregue').
update public.operacoes set status = 'entregue' where status = 'finalizando';
drop function if exists public.iniciar_finalizacao(uuid);
drop function if exists public.terminar_finalizacao(uuid, boolean);
