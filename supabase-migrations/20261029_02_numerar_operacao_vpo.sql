-- numerar_operacao_vpo(p_operacao): devolve operacoes.numero_vpo; se a operacao ainda nao tem, atribui o proximo da sequence (so quando nula). Somente service_role.
-- Só mexe na coluna nova numero_vpo e só quando está nula. Somente service_role.
-- Rollback: drop function if exists public.numerar_operacao_vpo(uuid);
create function public.numerar_operacao_vpo(p_operacao uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare v bigint;
begin
  update public.operacoes set numero_vpo = nextval('public.operacoes_numero_vpo_seq')
   where id = p_operacao and numero_vpo is null;
  select numero_vpo into v from public.operacoes where id = p_operacao;
  return v;
end;
$$;
revoke all on function public.numerar_operacao_vpo(uuid) from public, anon, authenticated;
grant execute on function public.numerar_operacao_vpo(uuid) to service_role;
