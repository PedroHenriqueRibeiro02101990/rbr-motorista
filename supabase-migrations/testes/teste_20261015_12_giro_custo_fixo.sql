-- Testes da migration 20261015_12 (giro como custo fixo + mútuo do Marcelo). Transação com ROLLBACK.
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase-migrations/testes/teste_20261015_12_giro_custo_fixo.sql

\set ON_ERROR_STOP 1
begin;

-- 1) 12 parcelas de R$ 3.000, dia 10, de 11/2026 a 10/2027, chave idempotente, categoria de juros do giro.
do $$ declare n int; v_datas date[]; v_cat text; begin
  select count(*), array_agg(data_vencimento order by data_vencimento) into n, v_datas
    from lancamentos_financeiros where origem = 'mutuo_marcelo' and status <> 'cancelado';
  if n <> 12 or v_datas[1] <> date '2026-11-10' or v_datas[12] <> date '2027-10-10'
     or exists (select 1 from unnest(v_datas) d where extract(day from d) <> 10) then
    raise exception 'FALHOU 1: % parcelas, datas %', n, v_datas;
  end if;
  if exists (select 1 from lancamentos_financeiros where origem = 'mutuo_marcelo'
              and (valor <> 3000 or tipo <> 'pagar' or contraparte_nome <> 'Marcelo Guelfi Prado'
                   or origem_chave <> 'mutuo:marcelo:' || to_char(data_vencimento, 'YYYY-MM'))) then
    raise exception 'FALHOU 1: valor/tipo/contraparte/chave';
  end if;
  select distinct c.codigo into v_cat from lancamentos_financeiros l join categorias_financeiras c on c.id = l.categoria_id
   where l.origem = 'mutuo_marcelo';
  if v_cat is distinct from 'juros_giro' then raise exception 'FALHOU 1: categoria %', v_cat; end if;
  raise notice 'OK 1: 12 parcelas de R$ 3.000 (10/11/2026 a 10/10/2027), categoria juros_giro';
end $$;

-- 2) Parâmetros: giro por operação desligado; alíquota do IR sem valor inventado.
do $$ begin
  if (select valor from parametros_sistema where chave = 'giro_ativo') <> 'false'::jsonb then raise exception 'FALHOU 2: giro_ativo'; end if;
  if (select valor from parametros_sistema where chave = 'mutuo_ir_aliquota') <> 'null'::jsonb then raise exception 'FALHOU 2: mutuo_ir_aliquota'; end if;
  raise notice 'OK 2: giro_ativo = false e mutuo_ir_aliquota = null (a confirmar com o contador)';
end $$;

-- 3) Preço: custo financeiro gravado não entra mais no preço nem no lucro.
insert into cotacoes (id, origem, valor_frete_motorista, pedagio, aliquota_imposto_pct, lucro_pct, preco_modo, custo_financeiro, giro_repasse_pct)
values ('7e5a3000-0000-0000-0000-0000000000a1', 'gestor', 1000, 0, 0, 0.40, 'lucro_pct', 500, 100);
insert into cotacoes (id, origem, valor_frete_motorista, pedagio, aliquota_imposto_pct, preco_modo, valor_total, custo_financeiro)
values ('7e5a3000-0000-0000-0000-0000000000a2', 'gestor', 1000, 0, 0.06, 'valor_final', 2000, 300);
do $$ declare a record; b record; begin
  select * into a from cotacoes where id = '7e5a3000-0000-0000-0000-0000000000a1';
  select * into b from cotacoes where id = '7e5a3000-0000-0000-0000-0000000000a2';
  if a.valor_total <> 1400 or a.lucro_rbr <> 400 or a.custo_financeiro <> 500 then
    raise exception 'FALHOU 3a: lucro_pct -> total %, lucro %, custo_financeiro %', a.valor_total, a.lucro_rbr, a.custo_financeiro;
  end if;
  if b.valor_total <> 2000 or b.lucro_rbr <> 880 then
    raise exception 'FALHOU 3b: valor_final -> total %, lucro % (esperado 2000 - 1000 - 120 = 880)', b.valor_total, b.lucro_rbr;
  end if;
  raise notice 'OK 3: preço e lucro sem o custo financeiro (coluna mantida como histórico)';
end $$;

do $$ begin raise notice 'teste_20261015_12: todos os casos passaram'; end $$;
rollback;
