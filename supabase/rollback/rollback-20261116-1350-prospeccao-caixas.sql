-- Rollback de 20261116-1350 (caixas, diagnostico, caixa de entrada, segredos pelo painel).
-- ATENCAO: apaga as conversas e e-mails guardados na Caixa de entrada (copia local; os originais continuam na caixa da Hostinger).
drop function if exists public.prospeccao_segredos_status();
drop function if exists public.prospeccao_gravar_segredo(text, text);
delete from vault.secrets where name in ('PROSPECCAO_CAIXA_PEDRO_SENHA', 'PROSPECCAO_CAIXA_COMERCIAL_SENHA', 'PROSPECCAO_CAIXA_OPERACIONAL_SENHA', 'PROSPECCAO_IA_CHAVE');
drop table if exists public.prospeccao_emails cascade;
drop table if exists public.prospeccao_conversas cascade;
drop table if exists public.prospeccao_caixa_diagnostico cascade;
drop table if exists public.prospeccao_caixas cascade;
drop function if exists public.trg_fn_prospeccao_emails_guarda();
drop function if exists public.trg_fn_prospeccao_emails_conversa();
