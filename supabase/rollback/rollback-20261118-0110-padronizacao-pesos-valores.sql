-- Desfaz 20261118-0110-padronizacao-pesos-valores.sql
alter table public.veiculos drop constraint if exists veiculos_tara_kg_faixa_chk, drop constraint if exists veiculos_capacidade_carga_faixa_chk, drop constraint if exists veiculos_tara_origem_chk;
alter table public.operacao_ciot_vpo drop constraint if exists operacao_ciot_vpo_vpo_valor_nao_negativo_chk;
alter table public.condicoes_pagamento_operacao drop constraint if exists condicoes_pagto_valor_contrato_nao_negativo_chk, drop constraint if exists condicoes_pagto_valor_adiantamento_nao_negativo_chk;
