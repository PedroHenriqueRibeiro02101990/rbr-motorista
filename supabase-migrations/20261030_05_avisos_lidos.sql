-- F01/F02: a pessoa marca como lido só os próprios avisos. Aditiva: só cria uma função.
begin;
create or replace function public.marcar_aviso_lido(p_aviso uuid default null)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.notificacoes
     set status_entrega = 'confirmado_lido', entregue_em = coalesce(entregue_em, now())
   where pessoa_id = current_pessoa_id()
     and status_entrega <> 'confirmado_lido'
     and (p_aviso is null or id = p_aviso);
$$;
revoke all on function public.marcar_aviso_lido(uuid) from public, anon;
grant execute on function public.marcar_aviso_lido(uuid) to authenticated;
commit;
