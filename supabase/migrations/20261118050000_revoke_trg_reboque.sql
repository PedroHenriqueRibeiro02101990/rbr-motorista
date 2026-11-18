-- Seguranca: a funcao do gatilho nao deve ser chamavel por API (security definer). Aplicada em producao em 18/11/2026.
revoke execute on function public.trg_fn_reboque_marca_e_reboque() from public, anon, authenticated;
