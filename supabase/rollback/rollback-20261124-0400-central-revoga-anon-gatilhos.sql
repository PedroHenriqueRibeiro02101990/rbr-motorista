-- Desfaz 20261124-0400 (devolve o acesso padrao do Supabase as 4 funcoes de gatilho).
grant execute on function public.trg_fn_central_flag_guarda(), public.trg_fn_central_robos_guarda(), public.trg_fn_central_comandos_guarda(), public.trg_fn_central_sdr_fila_guarda() to public, anon;
