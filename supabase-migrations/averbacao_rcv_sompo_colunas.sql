-- averbacao_rcv_sompo_colunas — JÁ APLICADA no banco real em 2026-10-16 (supabase_migrations.schema_migrations,
-- version 20261016034144). Conteúdo copiado de schema_migrations.statements; NÃO reaplicar.
alter table public.operacao_ciot_vpo
  add column if not exists averbacao_rcv_status text,
  add column if not exists averbacao_rcv_numero text,
  add column if not exists averbacao_rcv_erro text,
  add column if not exists averbacao_rcv_resposta jsonb,
  add column if not exists averbacao_rcv_em timestamptz;
comment on column public.operacao_ciot_vpo.averbacao_rcv_status is 'Averbacao do MDF-e na apolice RC-V (Sompo, caixa AT&M 11486292): null/pendente, emitido, erro, bloqueado.';
