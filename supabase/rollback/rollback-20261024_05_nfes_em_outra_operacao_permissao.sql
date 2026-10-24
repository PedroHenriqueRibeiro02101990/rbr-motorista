-- Rollback de 20261024_05_nfes_em_outra_operacao_permissao.sql
-- Volta à versão de 20261024_03 (checagem por pode_ver_operacao). ATENÇÃO: essa versão deixa o agenciador consultar
-- as chaves de outras operações (ver o cabeçalho da migration). Use só se a nova quebrar algo legítimo.
set local lock_timeout = '8s';

create or replace function public.nfes_em_outra_operacao(p_operacao uuid, p_chaves text[])
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.pode_ver_operacao(p_operacao) then
    raise exception 'Sem permissão para esta operação.';
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

delete from supabase_migrations.schema_migrations where name = 'nfes_em_outra_operacao_permissao';
