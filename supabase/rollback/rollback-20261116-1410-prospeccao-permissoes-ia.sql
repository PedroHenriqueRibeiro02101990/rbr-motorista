drop policy if exists prospeccao_pesos_so_pedro_upd on public.prospeccao_pesos;
drop policy if exists prospeccao_pesos_so_pedro_ins on public.prospeccao_pesos;
drop policy if exists prospeccao_pesos_so_pedro_del on public.prospeccao_pesos;
drop policy if exists prospeccao_experimentos_pedro_upd on public.prospeccao_experimentos;
revoke update on public.prospeccao_experimentos from authenticated;
