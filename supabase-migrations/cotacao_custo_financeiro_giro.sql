-- Já aplicada no projeto kwscmegsfbtvlnyxougt (migration "cotacao_custo_financeiro_giro").
-- Custo financeiro do giro na cotação. Resumo:
--  * cotacoes: custo_financeiro, giro_repassar (default true), giro_dias_transito, giro_aporte, giro_taxa_efetiva
--  * cotacao_destinos: custo_financeiro
--  * parametros_sistema: giro_ativo, giro_faixas, giro_taxa_teto, giro_ir_pct, giro_pct_financiado,
--    giro_dias_compensacao, giro_km_por_dia, giro_dias_carga, giro_dias_mes
--  * trg_fn_cotacao_calcula_preco: base do preço = custo + (giro_repassar ? custo_financeiro : 0);
--    lucro_rbr = valor_total - custo - custo_financeiro - imposto (sempre líquido do custo financeiro)
-- Para recriar do zero, pegue o corpo da função em pg_get_functiondef('public.trg_fn_cotacao_calcula_preco'::regproc).
alter table public.cotacoes
  add column if not exists custo_financeiro numeric not null default 0,
  add column if not exists giro_repassar boolean not null default true,
  add column if not exists giro_dias_transito integer,
  add column if not exists giro_aporte numeric,
  add column if not exists giro_taxa_efetiva numeric;
alter table public.cotacao_destinos add column if not exists custo_financeiro numeric not null default 0;
