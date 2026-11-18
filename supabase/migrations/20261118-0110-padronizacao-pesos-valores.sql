-- Padronizacao de pesos e valores (Parte A, etapa 7b-d). ADITIVA: CHECK ... NOT VALID valida so gravacoes NOVAS; registros antigos
-- (inclusive os com tara errada, ex.: 25.5 e 9.8) permanecem como estao. Sem update, sem delete. NAO APLICADA (so na etapa 28).
-- Rollback: supabase/rollback/rollback-20261118-0110-padronizacao-pesos-valores.sql
-- Colunas de valor em reais que ja sao numeric (confirmado em shared/database.types.ts): nada a converter; so garantimos >= 0.
-- Nenhuma coluna de valor em texto foi encontrada nas tabelas fiscais (operacao_ciot_vpo, condicoes_pagamento_operacao).

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'veiculos_tara_kg_faixa_chk') then
    alter table public.veiculos add constraint veiculos_tara_kg_faixa_chk check (tara_kg is null or (tara_kg between 1000 and 30000)) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'veiculos_capacidade_carga_faixa_chk') then
    alter table public.veiculos add constraint veiculos_capacidade_carga_faixa_chk check (capacidade_carga is null or (capacidade_carga between 1000 and 80000)) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'veiculos_tara_origem_chk') then
    alter table public.veiculos add constraint veiculos_tara_origem_chk check (tara_origem is null or tara_origem in ('confirmada', 'derivada_crlv', 'aproximada_tabela')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'operacao_ciot_vpo_vpo_valor_nao_negativo_chk') then
    alter table public.operacao_ciot_vpo add constraint operacao_ciot_vpo_vpo_valor_nao_negativo_chk check (vpo_valor is null or vpo_valor >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'condicoes_pagto_valor_contrato_nao_negativo_chk') then
    alter table public.condicoes_pagamento_operacao add constraint condicoes_pagto_valor_contrato_nao_negativo_chk check (valor_total_contrato >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'condicoes_pagto_valor_adiantamento_nao_negativo_chk') then
    alter table public.condicoes_pagamento_operacao add constraint condicoes_pagto_valor_adiantamento_nao_negativo_chk check (valor_adiantamento is null or valor_adiantamento >= 0) not valid;
  end if;
end $$;
