-- F04: busca global. A busca em si roda com as políticas da pessoa (só vê o que a função dela deixa ver).
-- Esta função devolve SÓ CONTAGENS (nenhum dado) para a tela dizer "N resultados ocultos pela sua função".
-- Aditiva: só cria uma função.
begin;

create or replace function public.busca_contagens(p_termo text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  t text := replace(replace(replace(trim(coalesce(p_termo, '')), '\', ''), '%', ''), '_', '');
  p text;
  v_clientes bigint;
  v_cotacoes bigint;
begin
  if current_pessoa_id() is null then
    raise exception 'Entre no sistema para buscar.';
  end if;
  if length(t) < 3 then
    return jsonb_build_object('clientes', 0, 'cotacoes', 0);
  end if;
  p := '%' || t || '%';
  select count(*) into v_clientes from public.clientes c
   where c.razao_social ilike p or c.nome_fantasia ilike p or c.cnpj ilike p;
  select count(*) into v_cotacoes from public.cotacoes q
   where q.cidade_origem ilike p or q.cidade_destino ilike p;
  return jsonb_build_object('clientes', v_clientes, 'cotacoes', v_cotacoes);
end $$;

revoke all on function public.busca_contagens(text) from public, anon;
grant execute on function public.busca_contagens(text) to authenticated;

commit;
