-- 20261024_02 — efrete, passo 3: código verificador do CIOT.
-- O servidor devolve CodigoIdentificacaoOperacao como "NNNNNNNNNNNN/VVVV" (CIOT de 12 dígitos + verificador de 4),
-- formato que o manual v8.2 não descreve. ciot continua com os 12 dígitos; o verificador vai nesta coluna.
-- Para chamar a efrete (PDF, transações, cancelamento) o código completo é remontado como ciot || '/' || ciot_verificador.
-- Rollback: supabase/rollback/rollback-20261024_02_efrete_ciot_verificador.sql
set local lock_timeout = '8s';

alter table public.efrete_ciot_pedidos
  add column ciot_verificador text check (ciot_verificador is null or ciot_verificador ~ '^\d{4}$');
