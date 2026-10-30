-- E04: gerar o link público de aceite da proposta. Aditiva: só cria uma função (a tabela propostas_publicas já existe).
-- O código tem 32 caracteres hexadecimais (128 bits aleatórios): não dá para adivinhar. Só gestor gera. Reaproveita o link
-- ainda válido da mesma cotação para não ter dois links diferentes circulando.
begin;

create or replace function public.gerar_link_proposta(p_cotacao uuid, p_dias integer default 7)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_codigo text;
begin
  if current_papel() is distinct from 'gestor_rbr' then
    raise exception 'Só a RBR gera o link da proposta.';
  end if;
  if not exists (select 1 from public.cotacoes where id = p_cotacao) then
    raise exception 'Cotação não encontrada.';
  end if;
  if p_dias is null or p_dias < 1 or p_dias > 60 then
    raise exception 'A validade do link vai de 1 a 60 dias.';
  end if;
  select codigo into v_codigo from public.propostas_publicas
   where cotacao_id = p_cotacao and aceita_em is null and perdida_em is null and (expira_em is null or expira_em > now())
   order by criada_em desc limit 1;
  if v_codigo is not null then
    return v_codigo;
  end if;
  v_codigo := replace(gen_random_uuid()::text, '-', '');
  insert into public.propostas_publicas (codigo, cotacao_id, expira_em)
  values (v_codigo, p_cotacao, now() + make_interval(days => p_dias));
  return v_codigo;
end $$;

revoke all on function public.gerar_link_proposta(uuid, integer) from public, anon;
grant execute on function public.gerar_link_proposta(uuid, integer) to authenticated;

commit;
