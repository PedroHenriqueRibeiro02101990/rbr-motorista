-- Prospeccao: AGENDAMENTO do agente de IA e do analista semanal. NAO APLICADO (o Pedro aplica, depois de agendar-robos.sql).
-- Pre-requisitos: migrations 1350, 1360, 1400 e 1410 aplicadas; edge functions prospeccao-agente e prospeccao-analista publicadas (verify_jwt = true);
-- segredo PROSPECCAO_CRON_CHAVE no Vault (o mesmo de agendar-robos.sql); e a chave da IA (PROSPECCAO_IA_CHAVE) cadastrada pelo painel.
-- Sem a chave da IA as duas funcoes respondem "IA desligada" e nao fazem nada: agendar e seguro.
-- Para parar: select cron.unschedule('prospeccao-agente'); select cron.unschedule('prospeccao-analista');

-- Agente de resposta: de 5 em 5 minutos, 1 minuto depois do robo de leitura (leitura roda nos minutos 3,8,13...).
select cron.schedule('prospeccao-agente', '4-59/5 * * * *', $$
  select net.http_post(
    url := 'https://kwscmegsfbtvlnyxougt.supabase.co/functions/v1/prospeccao-agente',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'PROSPECCAO_CRON_CHAVE')),
    body := '{}'::jsonb, timeout_milliseconds := 55000);
$$);

-- Analista semanal: toda segunda 07:00 em Sao Paulo (UTC-3, sem horario de verao) = 10:00 UTC.
select cron.schedule('prospeccao-analista', '0 10 * * 1', $$
  select net.http_post(
    url := 'https://kwscmegsfbtvlnyxougt.supabase.co/functions/v1/prospeccao-analista',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'PROSPECCAO_CRON_CHAVE')),
    body := '{}'::jsonb, timeout_milliseconds := 120000);
$$);
