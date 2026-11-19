-- A6 (18/11/2026): o gatilho da carreta marcava ciot_status = 'refazer_troca_veiculo' a CADA insert/update/delete em operacao_reboques,
-- mesmo sem troca (OP-3771: ao VINCULAR a carreta a um CIOT manual ja emitido, o CIOT virou "refazer"). So troca a FUNCAO do gatilho (aditivo).
-- Nova regra:
--   UPDATE  -> so marca se o veiculo_id da linha mudou de fato.
--   INSERT  -> CIOT MANUAL (origem 'manual') e primeiro vinculo de carreta da operacao = completar o cadastro, nao e troca: so registra na auditoria.
--              Demais casos (CIOT por API, ou ja havia carreta) continuam marcando.
--   DELETE  -> marca (a carreta saiu de fato).
-- A funcao ciot_troca_veiculo (operacoes.veiculo_id) ja usa "is distinct from" e nao muda.
-- Rollback: supabase/rollback/rollback-20261118-2300-ciot-troca-carreta-so-quando-muda.sql
create or replace function public.trg_fn_ciot_troca_carreta()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_op uuid := coalesce(new.operacao_id, old.operacao_id);
  v_marcar boolean := true;
  v_primeiro_vinculo boolean := false;
  v_manual boolean := false;
begin
  if tg_op = 'UPDATE' and new.veiculo_id is not distinct from old.veiculo_id and new.operacao_id is not distinct from old.operacao_id then
    return new; -- mesma carreta: nada mudou
  end if;
  if tg_op = 'INSERT' then
    v_primeiro_vinculo := not exists (select 1 from public.operacao_reboques r where r.operacao_id = v_op and r.id <> new.id);
    v_manual := exists (select 1 from public.operacao_ciot_vpo c where c.operacao_id = v_op and c.origem = 'manual');
    if v_primeiro_vinculo and v_manual then v_marcar := false; end if;
  end if;
  if v_marcar then
    update public.operacao_ciot_vpo set ciot_status = 'refazer_troca_veiculo', updated_at = now()
     where operacao_id = v_op and ciot is not null and btrim(ciot) <> '' and ciot_status in ('emitido', 'pendente');
    if found then
      insert into public.auditoria_log (acao, entidade, entidade_id, dado_antes, dado_depois, papel, pessoa_id_ator)
      values ('ciot_troca_carreta', 'operacoes', v_op, to_jsonb(old), to_jsonb(new), public.current_papel()::text, public.current_pessoa_id());
    end if;
  else
    insert into public.auditoria_log (acao, entidade, entidade_id, dado_antes, dado_depois, papel, pessoa_id_ator)
    values ('ciot_primeira_carreta_manual', 'operacoes', v_op, null, to_jsonb(new), public.current_papel()::text, public.current_pessoa_id());
  end if;
  return coalesce(new, old);
end $function$;
revoke all on function public.trg_fn_ciot_troca_carreta() from public, anon, authenticated;
