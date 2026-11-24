-- Central F3 (24/11/2026): tres parametros novos, so valores. ADITIVA. Depende de 20261124-0100-central-base (guarda trg_central_flag_guarda: so o Pedro altera CENTRAL_*).
-- Rollback: supabase/rollback/rollback-20261124-0200-central-f3-parametros.sql
-- STATUS: NAO APLICADA. So aplicar quando o Pedro escrever "pode aplicar". Nao muda nenhuma flag PROSPECCAO_*. Nao guarda segredo.
set local lock_timeout = '8s';

insert into public.parametros_sistema (chave, valor, descricao) values
  ('CENTRAL_PREFIXOS_SETOR', '["compras","suprimentos","logistica","expedicao","transportes","frete","cotacao","comercial","faturamento","pcp"]'::jsonb,
     'Central: prefixos de e-mail do setor certo (antes do @), em ordem de preferencia. contato@ e geral e fica como ultima opcao.'),
  ('CENTRAL_PREVOO_MARCAS', '{}'::jsonb,
     'Central: itens do pre-voo que nao da para o sistema conferir sozinho, marcados pelo Pedro. Chaves: dns (SPF/DKIM/DMARC) e descadastrar (caixa descadastrar@ funcionando). Valor: data da marcacao.'),
  ('CENTRAL_METAS', '{"contatos":1000,"base":5000}'::jsonb,
     'Central: metas dos cartoes de resultado.')
on conflict (chave) do nothing;
