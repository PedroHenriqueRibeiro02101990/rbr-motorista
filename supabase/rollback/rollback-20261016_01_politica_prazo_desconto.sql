-- ROLLBACK de 20261016_01_politica_prazo_desconto
-- Volta o cálculo de preço para a versão da 20261015_12 (sem prazo nem desconto) e tira o gatilho do Pix antecipado.
-- Cotações já gravadas com ajuste/desconto ficam com o valor_total que tinham até a próxima edição; na próxima
-- gravação o preço volta a ser o de 7 DDL. As colunas novas só saem na parte opcional (apaga dado).

begin;

drop trigger if exists trg_operacao_protege_pix_antecipado on public.operacoes;
drop function if exists public.trg_fn_operacao_protege_pix_antecipado();

create or replace function public.trg_fn_cotacao_calcula_preco()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_custo numeric; v_adicionais numeric; v_adicionais_motorista numeric;
  v_aliq numeric; v_lucro_padrao numeric; v_fator numeric; v_divisor numeric; v_base_lucro numeric;
  v_modo_valor_final boolean;
begin
  if new.valor_frete_motorista is null then return new; end if;
  if new.taxa_seguro_tag_pct is not null then
    new.valor_seguro_tag := round(coalesce(new.valor_nf, 0) * new.taxa_seguro_tag_pct, 2);
  end if;
  select
    coalesce(sum(case when forma_calculo = 'pct_valor_nf' then round(coalesce(new.valor_nf, 0) * valor_unitario, 2)
                      else round(valor_unitario * quantidade, 2) end), 0),
    coalesce(sum(case when recebedor = 'motorista' then
                   case when forma_calculo = 'pct_valor_nf' then round(coalesce(new.valor_nf, 0) * valor_unitario, 2)
                        else round(valor_unitario * quantidade, 2) end
                 else 0 end), 0)
  into v_adicionais, v_adicionais_motorista
  from cotacao_custos_adicionais where cotacao_id = new.id;
  new.custos_adicionais_total := v_adicionais;
  new.valor_total_motorista := new.valor_frete_motorista + v_adicionais_motorista;

  -- 2026-10-15: o capital de giro é custo fixo mensal (mútuo), fora do preço e do lucro por operação.
  -- custo_financeiro / giro_repasse_pct ficam gravados só como histórico.
  v_custo := new.valor_frete_motorista + coalesce(new.pedagio, 0) + coalesce(new.valor_seguro_tag, 0) + v_adicionais;
  v_aliq := coalesce(new.aliquota_imposto_pct, 0);
  v_modo_valor_final := (new.preco_modo = 'valor_final' and new.valor_total is not null);

  if v_modo_valor_final then
    if new.valor_total <= 0 then raise exception 'Valor final precisa ser maior que zero.'; end if;
  else
    new.preco_modo := 'lucro_pct';
    if new.lucro_pct is null then
      select (valor)::text::numeric into v_lucro_padrao from parametros_sistema where chave = 'lucro_cotacao_padrao';
      new.lucro_pct := coalesce(v_lucro_padrao, 0.40);
    end if;
    v_fator := 1 + new.lucro_pct;
    v_divisor := 1 - v_aliq * v_fator;
    if v_divisor <= 0 then
      raise exception 'Com lucro de % %% e imposto de % %% não dá pra fechar o valor final — revise os percentuais.',
        round(new.lucro_pct * 100, 2), round(v_aliq * 100, 2);
    end if;
    new.valor_total := round(v_custo * v_fator / v_divisor, 2);
  end if;

  new.valor_imposto := round(new.valor_total * v_aliq, 2);
  new.lucro_rbr := round(new.valor_total - v_custo - new.valor_imposto, 2);
  new.margem_ajustada := case when new.valor_total > 0 then round(new.lucro_rbr / new.valor_total, 6) else null end;
  if v_modo_valor_final then
    v_base_lucro := v_custo + new.valor_imposto;
    new.lucro_pct := case when v_base_lucro > 0 then round(new.lucro_rbr / v_base_lucro, 6) else null end;
  end if;
  return new;
end;
$function$;

delete from public.parametros_sistema where chave = 'politica_prazo_desconto';
delete from supabase_migrations.schema_migrations where name = '20261016_01_politica_prazo_desconto';

commit;

-- OPCIONAL, só depois de conferir (apaga dado):
-- alter table public.cotacoes drop column if exists ajuste_prazo_pct, drop column if exists desconto_pct,
--   drop column if exists desconto_prazo, drop column if exists desconto_motivo, drop column if exists valor_tabela;
-- alter table public.faturas drop column if exists valor_cheio, drop column if exists desconto_negociado_pct,
--   drop column if exists descontos_condicionais, drop column if exists desconto_perdido_em,
--   drop column if exists desconto_perdido_obs;
-- alter table public.operacoes drop column if exists pix_antecipado_confirmado_em,
--   drop column if exists pix_antecipado_confirmado_por;
