-- 20261015_11 — Apagar lançamento financeiro (a pagar e a receber, qualquer origem), só gestor
--
-- fin_apagar_lancamento(p_id, p_motivo, p_estornar_baixas default false) -> jsonb {resultado, mensagem, ...}
--  * grava o registro completo em auditoria_log (dado_antes) antes de mexer;
--  * DELETE de verdade só quando nada recria o lançamento: origem <> 'operacao', sem origem_chave e sem nenhuma baixa;
--  * nos outros casos marca status = 'cancelado' com cancelado_motivo = 'Apagado manualmente: <motivo>':
--      - origem 'operacao' (fin_sincronizar_operacao_interno) e 'imposto' (sincronizar_imposto_mes) usam fin_upsert_auto,
--        que não recria cancelado cujo motivo não começa com 'Automático:';
--      - 'recorrencia' e 'assinatura' (gerar_lancamentos_recorrentes) inserem com "on conflict (origem_chave) do nothing":
--        apagado, voltaria na próxima geração; cancelado, a chave continua ocupada e não volta;
--      - com baixa (mesmo estornada) a trigger trg_lancamento_protege_delete (mantida) impede o DELETE;
--  * baixa ativa (não estornada): recusa com mensagem clara. Com p_estornar_baixas = true estorna todas antes
--    (o mesmo estorno da tela: baixas_financeiras.estornada = true + motivo; não existe função de estorno separada)
--    e segue no mesmo chamado — uma transação só;
--  * lançamento em fatura: tira da fatura (fatura_id = null; trg_lancamento_pos recalcula o total da fatura). Fatura
--    já paga: recusa (estorne/cancele a fatura antes).
-- Some das listas e dos totais: as telas já filtram status <> 'cancelado'; a lista "Cancelados"/"Todos" do
-- Financeiro esconde os "Apagado manualmente".

create or replace function public.fin_apagar_lancamento(p_id uuid, p_motivo text, p_estornar_baixas boolean default false)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  l lancamentos_financeiros%rowtype;
  v_motivo text := trim(coalesce(p_motivo, ''));
  v_baixas_ativas int;
  v_baixas_total int;
  v_estornadas int := 0;
  v_fatura_id uuid;
  v_fatura_numero int;
  v_fatura_status text;
  v_resultado text;
begin
  perform fin_exige_gestor();
  if length(v_motivo) < 5 then
    raise exception 'Informe o motivo para apagar o lançamento.';
  end if;

  select * into l from lancamentos_financeiros where id = p_id for update;
  if not found then
    raise exception 'Lançamento não encontrado.';
  end if;

  select count(*) filter (where not estornada), count(*) into v_baixas_ativas, v_baixas_total
    from baixas_financeiras where lancamento_id = p_id;

  if v_baixas_ativas > 0 and not p_estornar_baixas then
    raise exception 'Este lançamento tem % pagamento(s) registrado(s). Use "Estornar baixa(s) e apagar" para estornar e apagar de uma vez.', v_baixas_ativas
      using errcode = 'P0001', hint = 'tem_baixa';
  end if;

  if l.fatura_id is not null then
    select id, numero, status::text into v_fatura_id, v_fatura_numero, v_fatura_status from faturas where id = l.fatura_id;
    if v_fatura_status = 'pago' then
      raise exception 'Este lançamento está na fatura nº % já paga. Estorne o pagamento ou cancele a fatura antes de apagar.', v_fatura_numero;
    end if;
  end if;

  insert into auditoria_log (pessoa_id_ator, papel, acao, entidade, entidade_id, dado_antes, dado_depois)
  values (current_pessoa_id(), current_papel()::text, 'lancamento_apagado', 'lancamentos_financeiros', l.id,
          to_jsonb(l),
          jsonb_build_object('motivo', v_motivo, 'estornar_baixas', p_estornar_baixas,
                             'baixas', (select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) from baixas_financeiras b where b.lancamento_id = l.id),
                             'fatura_retirada', case when v_fatura_id is not null then jsonb_build_object('id', v_fatura_id, 'numero', v_fatura_numero) end));

  if v_baixas_ativas > 0 then
    update baixas_financeiras
       set estornada = true, estorno_motivo = 'Estorno para apagar o lançamento: ' || v_motivo
     where lancamento_id = l.id and not estornada;
    get diagnostics v_estornadas = row_count;
  end if;

  if l.fatura_id is not null then
    update lancamentos_financeiros set fatura_id = null where id = l.id;
  end if;

  if l.origem <> 'operacao' and l.origem_chave is null and v_baixas_total = 0 then
    delete from lancamentos_financeiros where id = l.id;
    v_resultado := 'apagado';
  else
    update lancamentos_financeiros
       set status = 'cancelado', cancelado_motivo = 'Apagado manualmente: ' || v_motivo
     where id = l.id;
    v_resultado := 'cancelado';
  end if;

  update auditoria_log set dado_depois = dado_depois || jsonb_build_object('resultado', v_resultado, 'baixas_estornadas', v_estornadas)
   where id = (select max(id) from auditoria_log where entidade = 'lancamentos_financeiros' and entidade_id = l.id and acao = 'lancamento_apagado');

  return jsonb_build_object(
    'resultado', v_resultado,
    'baixas_estornadas', v_estornadas,
    'fatura_retirada', v_fatura_numero,
    'mensagem', case when v_resultado = 'apagado' then 'Lançamento apagado.'
                     else 'Cancelado manualmente para não ser recriado.' end);
end $$;

revoke all on function public.fin_apagar_lancamento(uuid, text, boolean) from public, anon;
grant execute on function public.fin_apagar_lancamento(uuid, text, boolean) to authenticated, service_role;
