drop function if exists public.escolher_fornecedor_fiscal(uuid, text, text);
drop function if exists public.definir_fornecedor_padrao(text, text);
alter table public.operacao_ciot_vpo drop column if exists ciot_fornecedor, drop column if exists vpo_fornecedor, drop column if exists fornecedor_escolhido_por, drop column if exists fornecedor_escolhido_em;
drop table if exists public.fornecedores_fiscais;
