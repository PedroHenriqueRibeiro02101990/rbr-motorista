drop index if exists public.vpo_req_uma_compra_em_processamento;
alter table public.vpo_requisicoes drop constraint if exists vpo_requisicoes_situacao_chk;
alter table public.vpo_requisicoes drop column if exists processando_desde;
alter table public.vpo_requisicoes drop column if exists situacao;
