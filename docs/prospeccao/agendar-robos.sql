-- Prospeccao: AGENDAMENTO dos dois robos (pg_cron + pg_net). NAO faz parte das migrations: rode so DEPOIS de
--   1) aplicar as migrations 20261116-1000 e 20261116-1100,
--   2) publicar as edge functions prospeccao-enviar e prospeccao-ler (verify_jwt = true),
--   3) cadastrar o segredo PROSPECCAO_CRON_CHAVE no Vault (e a chave service_role do projeto; ela so vive no Vault, nunca no chat).
-- Com todas as chaves "nao" os robos so registram "desligado" no log e saem: agendar e seguro.
-- Para parar o agendamento: select cron.unschedule('prospeccao-enviar'); select cron.unschedule('prospeccao-ler');

select vault.create_secret('PREENCHER', 'PROSPECCAO_CRON_CHAVE', 'Prospeccao: chave service_role usada pelo agendador (Pedro cadastra)')
 where not exists (select 1 from vault.secrets where name = 'PROSPECCAO_CRON_CHAVE');

-- Projeto: kwscmegsfbtvlnyxougt. O envio roda nos minutos 0,5,10...; a leitura nos minutos 3,8,13... (nunca no mesmo instante).
select cron.schedule('prospeccao-enviar', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://kwscmegsfbtvlnyxougt.supabase.co/functions/v1/prospeccao-enviar',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'PROSPECCAO_CRON_CHAVE')),
    body := '{}'::jsonb, timeout_milliseconds := 55000);
$$);

select cron.schedule('prospeccao-ler', '3-59/5 * * * *', $$
  select net.http_post(
    url := 'https://kwscmegsfbtvlnyxougt.supabase.co/functions/v1/prospeccao-ler',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'PROSPECCAO_CRON_CHAVE')),
    body := '{}'::jsonb, timeout_milliseconds := 55000);
$$);
