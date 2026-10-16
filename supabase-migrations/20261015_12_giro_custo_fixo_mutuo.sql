-- 20261015_12 — Capital de giro vira custo FIXO mensal (mútuo do Marcelo), não custo por operação (B4)
--
-- Fato de negócio (2026-10-15): o Marcelo Guelfi Prado fechou R$ 100.000 de mútuo. Remuneração: 12 parcelas de
-- R$ 3.000 líquidos, todo dia 10, de 10/11/2026 a 10/10/2027; o IR sobre os juros fica por conta da RBR (retém e
-- recolhe por DARF). Devolução do principal em 16/10/2027.
--
--  1) Preço: trg_fn_cotacao_calcula_preco deixa de somar custo_financeiro / giro_repasse_pct no preço e de
--     descontar do lucro. As colunas ficam (histórico). Cotação já salva não muda até ser editada; em 2026-10-15
--     nenhuma cotação aberta (rascunho/enviada) tinha custo_financeiro > 0, então nenhuma muda de valor ao editar.
--  2) parametros_sistema.giro_ativo = false (a tela de cotação para de calcular e esconde o bloco do giro).
--  3) 12 despesas fixas a pagar (origem 'mutuo_marcelo', chave 'mutuo:marcelo:AAAA-MM', categoria juros_giro).
--     Vencimento no dia 10 mesmo em fim de semana/feriado: o pagamento é por Pix, que funciona todo dia.
--  4) IR: só o parâmetro mutuo_ir_aliquota, sem valor (JSON null), até o contador (Alan) confirmar. Os lançamentos
--     de DARF ficam para depois (decisão do Pedro em 2026-10-15). A devolução do principal não é lançada aqui.
-- Idempotente: pode rodar de novo sem duplicar.

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

-- Origem própria para os lançamentos do mútuo (o CHECK do banco só aceitava as origens existentes).
alter table public.lancamentos_financeiros drop constraint if exists lancamentos_financeiros_origem_check;
alter table public.lancamentos_financeiros add constraint lancamentos_financeiros_origem_check
  check (origem = any (array['manual', 'operacao', 'documento', 'recorrencia', 'extrato', 'assinatura', 'imposto', 'legado',
                             'mutuo_marcelo']));

update public.parametros_sistema set valor = 'false'::jsonb, updated_at = now() where chave = 'giro_ativo';

insert into public.parametros_sistema (chave, valor, descricao)
values ('mutuo_ir_aliquota', 'null'::jsonb,
        'Alíquota do IR sobre os juros do mútuo do Marcelo (fração, ex.: 0.15). A confirmar com o contador (Alan); null = ainda não definida.')
on conflict (chave) do nothing;

do $$
declare
  v_cat uuid := coalesce((select id from public.categorias_financeiras where codigo = 'juros_giro'),
                         (select id from public.categorias_financeiras where codigo = 'juros_emprestimos'));
  v_venc date;
  i int;
begin
  for i in 1..12 loop
    v_venc := (date '2026-11-10' + make_interval(months => i - 1))::date;
    insert into public.lancamentos_financeiros (tipo, status, descricao, categoria_id, contraparte_nome, valor, data_emissao,
                                                competencia, data_vencimento, forma_pagamento, parcela_numero, parcela_total,
                                                origem, origem_chave, observacoes)
    values ('pagar', 'aberto',
            'Juros do mútuo — Marcelo Guelfi Prado (' || i || '/12) — ' || to_char(v_venc, 'MM/YYYY'),
            v_cat, 'Marcelo Guelfi Prado', 3000.00, v_venc, v_venc, v_venc, 'pix', i, 12,
            'mutuo_marcelo', 'mutuo:marcelo:' || to_char(v_venc, 'YYYY-MM'),
            'Mútuo de R$ 100.000 (devolução do principal em 16/10/2027). Valor líquido ao Marcelo; o IR sobre os juros é da RBR (DARF), lançado à parte quando o contador confirmar a alíquota.')
    on conflict (origem_chave) do nothing;
  end loop;
end $$;
