-- Rollback de 20261030_11_trilha_status.sql (os registros já gravados na trilha ficam)
drop trigger if exists trg_trilha_status_operacao on public.operacoes;
drop function if exists public.trg_fn_trilha_status_operacao();
drop trigger if exists trg_trilha_documento_upd on public.documentacao_operacao;
drop trigger if exists trg_trilha_documento on public.documentacao_operacao;
drop function if exists public.trg_fn_trilha_documento();
