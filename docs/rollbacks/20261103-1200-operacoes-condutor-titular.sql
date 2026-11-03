-- Rollback de supabase/migrations/20261103-1200-operacoes-condutor-titular.sql.
-- So desfaz as duas colunas novas (e perde o que tiver sido gravado nelas). Rode apenas com ordem do Pedro.
drop index if exists public.operacoes_condutor_id_idx;
drop index if exists public.operacoes_titular_id_idx;
alter table public.operacoes drop column if exists condutor_id;
alter table public.operacoes drop column if exists titular_id;
