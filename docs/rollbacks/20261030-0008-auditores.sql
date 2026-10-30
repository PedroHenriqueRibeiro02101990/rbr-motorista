-- Rollback de supabase-migrations/20261030_08_auditores.sql
select cron.unschedule('auditor-segregacao-30min');
select cron.unschedule('auditor-dinheiro-30min');
drop function if exists public.reabrir_disjuntor(text);
drop function if exists public.atualizar_disjuntor();
drop function if exists public.auditar_dinheiro();
drop function if exists public.auditar_segregacao();
-- Os achados já gravados ficam em saude_fiscal_achados; para limpar: update public.saude_fiscal_achados set resolvido_em = now() where robo in ('auditor_segregacao','auditor_dinheiro') and resolvido_em is null;
