-- B11/A04: estado "finalizando" com aviso ao fiscal. Aditiva: só cria funções. Não mexe em dados nem em políticas.
-- iniciar_finalizacao: gestor marca a operação entregue como "finalizando" e avisa quem tem a função fiscal (e os gestores).
-- terminar_finalizacao: grava o resultado: "finalizada" se MDF-e e CIOT foram encerrados; senão volta a "entregue" (pode tentar de novo).
begin;

create or replace function public.iniciar_finalizacao(p_operacao uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status public.status_operacao;
begin
  if current_papel() is distinct from 'gestor_rbr' then
    raise exception 'Só a RBR finaliza a viagem.';
  end if;
  select status into v_status from public.operacoes where id = p_operacao for update;
  if not found then raise exception 'Operação não encontrada.'; end if;
  if v_status = 'finalizando' then return; end if;
  if v_status not in ('entregue', 'em_viagem') then
    raise exception 'A viagem só pode ser finalizada depois da entrega (status atual: %).', v_status;
  end if;
  update public.operacoes set status = 'finalizando' where id = p_operacao;
  insert into public.notificacoes (pessoa_id, tipo, referencia_id, canal, status_entrega, conteudo)
  select distinct x.id, 'finalizando', p_operacao, 'push'::public.canal_notificacao, 'pendente'::public.status_entrega_notificacao,
         'A operação ' || left(p_operacao::text, 8) || ' está sendo finalizada (encerramento do MDF-e e do CIOT). Confira o fiscal.'
  from (
    select p.id from public.pessoas p join public.funcoes_pessoa f on f.pessoa_id = p.id and f.ativo and f.funcao = 'fiscal'
    union
    select p.id from public.pessoas p where p.papel::text = 'gestor_rbr'
  ) x;
end $$;

create or replace function public.terminar_finalizacao(p_operacao uuid, p_ok boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if current_papel() is distinct from 'gestor_rbr' then
    raise exception 'Só a RBR finaliza a viagem.';
  end if;
  update public.operacoes
     set status = case when p_ok then 'finalizada'::public.status_operacao else 'entregue'::public.status_operacao end
   where id = p_operacao and status = 'finalizando';
end $$;

revoke all on function public.iniciar_finalizacao(uuid), public.terminar_finalizacao(uuid, boolean) from public, anon;
grant execute on function public.iniciar_finalizacao(uuid), public.terminar_finalizacao(uuid, boolean) to authenticated;

commit;
