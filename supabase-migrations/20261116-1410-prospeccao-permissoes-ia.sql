-- Prospeccao: so o usuario do Pedro edita os pesos da pontuacao e encerra/recusa experimentos. ADITIVA (politicas RESTRITIVAS somam-se as existentes; nada e apagado).
-- Depende de 1000 e 1400. Rollback: supabase/rollback/rollback-20261116-1410-prospeccao-permissoes-ia.sql
set local lock_timeout = '8s';
create policy prospeccao_pesos_so_pedro_upd on public.prospeccao_pesos as restrictive for update to authenticated using (public.prospeccao_eh_pedro()) with check (public.prospeccao_eh_pedro());
create policy prospeccao_pesos_so_pedro_ins on public.prospeccao_pesos as restrictive for insert to authenticated with check (public.prospeccao_eh_pedro());
create policy prospeccao_pesos_so_pedro_del on public.prospeccao_pesos as restrictive for delete to authenticated using (public.prospeccao_eh_pedro());
create policy prospeccao_experimentos_pedro_upd on public.prospeccao_experimentos for update to authenticated using (public.prospeccao_eh_pedro()) with check (public.prospeccao_eh_pedro());
revoke update on public.prospeccao_experimentos from authenticated;
grant update (status, motivo_decisao, decidido_em) on public.prospeccao_experimentos to authenticated;
