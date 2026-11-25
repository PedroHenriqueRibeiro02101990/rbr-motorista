-- Central (24/11/2026): tira o acesso do anon (e do PUBLIC) as 4 funcoes de gatilho criadas na 20261124-0100. So isso.
-- STATUS: APLICADA em 24/11/2026 por ordem do Pedro (central_revoga_anon_gatilhos_20261124_0400). Gatilho nao precisa de permissao de execucao para disparar.
-- Rollback: supabase/rollback/rollback-20261124-0400-central-revoga-anon-gatilhos.sql
revoke execute on function public.trg_fn_central_flag_guarda(), public.trg_fn_central_robos_guarda(), public.trg_fn_central_comandos_guarda(), public.trg_fn_central_sdr_fila_guarda() from public, anon;
