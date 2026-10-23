-- PROPOSTA (NÃO APLICADA) — 20261023_05 — tira o EXECUTE de funções SECURITY DEFINER que nenhum app, Edge Function,
-- política, view, gatilho ou cron chama pela API. Levantamento completo em docs/seguranca-supabase-2026-10-23.md.
-- As 9 funções que o Pedro excluiu não entram aqui.
-- Rollback: supabase/rollback/rollback-20261023_05_revoke_execute_nao_chamadas.sql
revoke execute on function public.sincronizar_financeiro_operacao(uuid) from authenticated, anon, public;
-- Função de gatilho do CRM (20261023_03): nasceu com EXECUTE para PUBLIC (padrão do Postgres). O gatilho continua
-- disparando; só deixa de aparecer como RPC chamável.
revoke execute on function public.trg_fn_interacao_primeiro_contato() from authenticated, anon, public;
