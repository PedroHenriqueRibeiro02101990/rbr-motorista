-- Fecha o acesso por RPC às funções de gatilho da trilha (os advisors mostraram anon podendo chamar). Gatilho continua funcionando.
begin;
revoke all on function public.trg_fn_trilha_documento(), public.trg_fn_trilha_status_operacao() from public, anon, authenticated;
commit;
