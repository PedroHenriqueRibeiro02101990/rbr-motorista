-- Rollback da Parte B da Prospeccao (nao mexe na Parte A).
select cron.unschedule(jobname) from cron.job where jobname in ('prospeccao-enviar', 'prospeccao-ler');
delete from public.parametros_sistema where chave in ('PROSPECCAO_LEITURA_LIBERADA', 'PROSPECCAO_APROVACAO_OBRIGATORIA', 'PROSPECCAO_RESPOSTA_AUTOMATICA_LIBERADA', 'PROSPECCAO_MODO_TESTE');
drop index if exists public.prospeccao_respostas_uid_uq, public.prospeccao_mensagens_msgid_idx, public.prospeccao_mensagens_contato_toque_uq;
alter table public.prospeccao_mensagens drop column if exists tentativas, drop column if exists teste_enviado_em;
alter table public.prospeccao_respostas drop column if exists uid_imap, drop column if exists message_id_origem, drop column if exists classificacao_confianca,
  drop column if exists indicacao_email, drop column if exists para_pessoa, drop column if exists aviso_recebimento_em, drop column if exists lembrete_em, drop column if exists escalado_em;
drop table if exists public.prospeccao_destinos_teste, public.prospeccao_log, public.prospeccao_jornada, public.prospeccao_modelos, public.prospeccao_rampa, public.prospeccao_estado cascade;
drop function if exists public.prospeccao_segredo(text), public.trg_fn_prospeccao_modelo_valida();
delete from vault.secrets where name in ('PROSPECCAO_SMTP_HOST', 'PROSPECCAO_SMTP_PORTA', 'PROSPECCAO_EMAIL_USUARIO', 'PROSPECCAO_EMAIL_SENHA', 'PROSPECCAO_IMAP_HOST', 'PROSPECCAO_IMAP_PORTA');
-- leads.origem volta ao conjunto original (falha se existir lead com origem = prospeccao; converta-os antes).
alter table public.leads drop constraint if exists leads_origem_check;
alter table public.leads add constraint leads_origem_check check (origem in ('site', 'whatsapp', 'indicacao', 'manual', 'outro'));
drop trigger if exists trg_prospeccao_limpa_parada on public.parametros_sistema;
drop function if exists public.trg_fn_prospeccao_limpa_parada();
