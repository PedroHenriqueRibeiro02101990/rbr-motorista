-- D05/F03: o fiscal devolve a operação com o item e o motivo; o aviso vai a quem errou (último a mexer: quem alocou, senão quem gerou),
-- e a operação sobe ao gestor se ninguém resolver. Aditiva: só cria funções. Grava em operacao_devolucoes_fiscal e notificacoes.
begin;

create or replace function public.devolver_pelo_fiscal(p_operacao uuid, p_item text, p_motivo text, p_detalhe text default '')
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_eu uuid := current_pessoa_id();
  v_status public.status_operacao;
  v_errou uuid;
begin
  if v_eu is null or (current_papel() is distinct from 'gestor_rbr' and not public.tem_funcao('fiscal')) then
    raise exception 'Só o fiscal devolve uma operação.';
  end if;
  if length(trim(coalesce(p_item, ''))) < 2 or length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Diga qual item está errado e o motivo.';
  end if;
  select status, coalesce(alocada_por, gerada_por) into v_status, v_errou from public.operacoes where id = p_operacao for update;
  if not found then raise exception 'Operação não encontrada.'; end if;
  if v_status <> 'aguardando_liberacao_fiscal' then
    raise exception 'Só dá para devolver uma operação que está aguardando a liberação do fiscal (agora: %).', v_status;
  end if;
  update public.operacoes set status = 'devolvida_pelo_fiscal' where id = p_operacao;
  insert into public.operacao_devolucoes_fiscal (operacao_id, item, motivo, detalhe, devolvido_por, avisar_quem_errou)
  values (p_operacao, trim(p_item), trim(p_motivo), trim(coalesce(p_detalhe, '')), v_eu, v_errou);
  insert into public.notificacoes (pessoa_id, tipo, referencia_id, canal, status_entrega, conteudo)
  select x.id, 'devolvida', p_operacao, 'push'::public.canal_notificacao, 'pendente'::public.status_entrega_notificacao,
         'O fiscal devolveu a operação ' || left(p_operacao::text, 8) || ': ' || trim(p_item) || ' (' || trim(p_motivo) || ').'
    from (select v_errou as id where v_errou is not null
          union select p.id from public.pessoas p where p.papel::text = 'gestor_rbr') x;
end $$;

revoke all on function public.devolver_pelo_fiscal(uuid, text, text, text) from public, anon;
grant execute on function public.devolver_pelo_fiscal(uuid, text, text, text) to authenticated;
commit;
