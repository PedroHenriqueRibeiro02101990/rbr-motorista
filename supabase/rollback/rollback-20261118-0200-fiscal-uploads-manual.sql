-- Desfaz 20261118-0200-fiscal-uploads-manual.sql
drop function if exists public.confirmar_ciot_vpo_manual(uuid, jsonb);
drop policy if exists docop_escrita_funcoes on public.documentacao_operacao;
drop policy if exists eventos_fiscais_insert_funcoes on public.eventos_fiscais_operacao;
drop policy if exists ciot_vpo_escrita_funcoes on public.operacao_ciot_vpo;
drop policy if exists operacao_documentos_funcoes on storage.objects;
drop index if exists public.documentacao_operacao_hash_idx;
alter table public.documentacao_operacao drop column if exists arquivo_hash, drop column if exists arquivo_historico;
-- (a regra de categoria volta a 02..11 so se nao houver linha com 12, 13 ou 14)
alter table public.operacao_ciot_vpo drop constraint if exists operacao_ciot_vpo_vpo_categoria_combinacao_check;
alter table public.operacao_ciot_vpo add constraint operacao_ciot_vpo_vpo_categoria_combinacao_check
  check (vpo_categoria_combinacao is null or vpo_categoria_combinacao = any (array['02','04','06','07','08','10','11'])) not valid;
