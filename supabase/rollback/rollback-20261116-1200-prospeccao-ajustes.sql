-- Rollback dos ajustes da Prospeccao: volta a funcao e a constraint para a versao da Parte A.
create or replace function public.trg_fn_prospeccao_pesos_recalcular() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.prospeccao_empresas set criterios = criterios;
  return null;
end $$;
revoke all on function public.trg_fn_prospeccao_pesos_recalcular() from public, anon, authenticated;

alter table public.prospeccao_bloqueio drop constraint if exists prospeccao_bloqueio_dominio_publico_ck;
alter table public.prospeccao_bloqueio add constraint prospeccao_bloqueio_dominio_publico_ck check (tipo <> 'dominio' or valor not in
  ('gmail.com', 'hotmail.com', 'outlook.com', 'live.com', 'yahoo.com', 'yahoo.com.br', 'uol.com.br', 'bol.com.br', 'terra.com.br', 'icloud.com'));
