-- 20261015_03 — Tira EXECUTE de anon/authenticated das funções SECURITY DEFINER novas do modo teste
--
-- A 20261014_01 cria estas funções com SECURITY DEFINER, e o padrão do projeto (default privileges) dá EXECUTE a
-- anon e authenticated em toda função nova do schema public — o get_advisors acusa cada uma.
--  * Os 4 gatilhos: quem dispara um trigger não precisa de EXECUTE na função do trigger; nada muda no uso.
--  * cotacao_tem_documento_fiscal: só é chamada dentro de trg_fn_cotacao_modo_teste (SECURITY DEFINER, roda como o
--    dono) e pela própria migration; o gestor não chama por RPC (conferido em gestor/src, shared e nas
--    policies/views em 2026-10-15).
-- service_role continua podendo executar (grant explícito do default privileges).
-- Depende de 20261014_01. Rollback: supabase/rollback/rollback-20261015_03_revoga_funcoes_modo_teste.sql

revoke all on function public.cotacao_tem_documento_fiscal(uuid) from public, anon, authenticated;
revoke all on function public.trg_fn_cotacao_modo_teste() from public, anon, authenticated;
revoke all on function public.trg_fn_cotacao_modo_teste_pos() from public, anon, authenticated;
revoke all on function public.trg_fn_operacao_herda_teste() from public, anon, authenticated;
revoke all on function public.trg_fn_doc_teste_auditoria() from public, anon, authenticated;
