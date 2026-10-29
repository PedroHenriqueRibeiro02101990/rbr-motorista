-- PROPOSTA, NÃO APLICADA. Mostrar ao dono antes de aplicar.
-- A efrete devolve o verificador "XXXX" na homologação. A restrição atual só aceita 4 dígitos e barra o registro.
-- Troca a restrição por outra que aceita XXXX SOMENTE quando a linha é de homologação (ambiente = 'homologacao').
-- Linhas existentes continuam válidas (a nova regra é mais permissiva só nesse caso). Nenhum dado é alterado.
alter table public.efrete_ciot_pedidos drop constraint efrete_ciot_pedidos_ciot_verificador_check;
alter table public.efrete_ciot_pedidos add constraint efrete_ciot_pedidos_ciot_verificador_check
  check (ciot_verificador is null or ciot_verificador ~ '^\d{4}$' or (ambiente = 'homologacao' and ciot_verificador = 'XXXX'));

-- Rollback (só funciona se nenhuma linha tiver XXXX; senão, apague/ajuste essa linha antes):
-- alter table public.efrete_ciot_pedidos drop constraint efrete_ciot_pedidos_ciot_verificador_check;
-- alter table public.efrete_ciot_pedidos add constraint efrete_ciot_pedidos_ciot_verificador_check
--   check (ciot_verificador is null or ciot_verificador ~ '^\d{4}$');
