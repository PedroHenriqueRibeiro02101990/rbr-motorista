-- Prospeccao: ajustes pos-aplicacao das Partes A e B. ADITIVA. NAO APLICADA (o Pedro aplica).
-- Rollback: supabase/rollback/rollback-20261116-1200-prospeccao-ajustes.sql
set local lock_timeout = '8s';

-- a) Recalculo de pontuacao: UPDATE com WHERE explicito (mesmo efeito; evita bloqueio de "update sem where").
create or replace function public.trg_fn_prospeccao_pesos_recalcular() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.prospeccao_empresas set criterios = criterios where true;
  return null;
end $$;
revoke all on function public.trg_fn_prospeccao_pesos_recalcular() from public, anon, authenticated;

-- b) Bloqueio por dominio: dominios de e-mail publico nao podem ser bloqueados (a tabela esta vazia).
alter table public.prospeccao_bloqueio drop constraint if exists prospeccao_bloqueio_dominio_publico_ck;
alter table public.prospeccao_bloqueio add constraint prospeccao_bloqueio_dominio_publico_ck check (tipo <> 'dominio' or valor not in
  ('gmail.com', 'gmail.com.br', 'hotmail.com', 'hotmail.com.br', 'outlook.com', 'outlook.com.br', 'live.com', 'live.com.br', 'msn.com',
   'yahoo.com', 'yahoo.com.br', 'uol.com.br', 'bol.com.br', 'terra.com.br', 'ig.com.br', 'icloud.com'));
