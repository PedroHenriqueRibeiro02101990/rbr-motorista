-- 20261024_05 — nfes_em_outra_operacao: confere quem chama antes de responder.
-- Antes (20261024_03), a função checava com pode_ver_operacao(). Essa função inclui eh_backend(), que é
-- current_user not in ('authenticated', 'anon'). Dentro de SECURITY DEFINER, current_user vira o dono (postgres),
-- então eh_backend() dava TRUE para qualquer agenciador: a função devolvia as chaves das outras operações.
-- Agora a checagem é direta: gestor_rbr, ou o agenciador dono da operação. Fora disso, erro "Sem permissão...".
-- Continua SECURITY DEFINER (precisa ler operacao_nfes de outras operações) e devolve só as chaves repetidas.
-- Rollback: supabase/rollback/rollback-20261024_05_nfes_em_outra_operacao_permissao.sql
set local lock_timeout = '8s';

create or replace function public.nfes_em_outra_operacao(p_operacao uuid, p_chaves text[])
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(public.current_papel()::text, '') <> 'gestor_rbr'
     and not exists (
       select 1 from public.operacoes o
       where o.id = p_operacao and o.agenciador_id = public.current_pessoa_id()
     ) then
    raise exception 'Sem permissão para consultar esta operação.';
  end if;
  return coalesce((
    select array_agg(distinct n.chave_acesso)
    from public.operacao_nfes n
    join public.operacoes o on o.id = n.operacao_id
    where n.chave_acesso = any (p_chaves) and n.operacao_id <> p_operacao and o.deleted_at is null and o.status <> 'cancelada'
  ), '{}');
end;
$$;
revoke all on function public.nfes_em_outra_operacao(uuid, text[]) from public, anon;
grant execute on function public.nfes_em_outra_operacao(uuid, text[]) to authenticated;
