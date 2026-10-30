-- Rollback de 20261030_12_revoga_trilha_rpc.sql (não é recomendado reabrir; só se um gatilho parar de funcionar)
grant execute on function public.trg_fn_trilha_documento(), public.trg_fn_trilha_status_operacao() to authenticated;
