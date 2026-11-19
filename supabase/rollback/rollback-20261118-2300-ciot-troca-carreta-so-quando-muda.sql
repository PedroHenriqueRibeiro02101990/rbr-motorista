-- Rollback da A6: volta a funcao do gatilho ao corpo que estava em producao em 18/11/2026.
create or replace function public.trg_fn_ciot_troca_carreta()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_op uuid := coalesce(new.operacao_id, old.operacao_id);
begin
  update public.operacao_ciot_vpo set ciot_status = 'refazer_troca_veiculo', updated_at = now()
   where operacao_id = v_op and ciot is not null and btrim(ciot) <> '' and ciot_status in ('emitido', 'pendente');
  if found then
    insert into public.auditoria_log (acao, entidade, entidade_id, dado_antes, dado_depois, papel, pessoa_id_ator)
    values ('ciot_troca_carreta', 'operacoes', v_op, to_jsonb(old), to_jsonb(new), public.current_papel()::text, public.current_pessoa_id());
  end if;
  return coalesce(new, old);
end $function$;
revoke all on function public.trg_fn_ciot_troca_carreta() from public, anon, authenticated;
