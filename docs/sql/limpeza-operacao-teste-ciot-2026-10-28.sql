-- Limpeza da operação de teste "TESTE CIOT" (criada em 2026-10-28). NÃO EXECUTADA.
-- Operação 965ceb0d-6097-43f5-b3c2-25a31c0e4e97 / cotação c073079b-e348-4969-a788-7590ad9bf035.
-- Só apaga linhas criadas por ela. NÃO toca no titular, no motorista, nos veículos nem no cliente RBR (eram só FK).
-- Rode dentro de uma transação e confira as contagens antes de confirmar. Rollback: ROLLBACK no lugar de COMMIT,
-- depois de confirmado não há volta (a operação era só de teste): para repetir, crie outra operação de teste.
begin;
  select count(*) as pedidos_efrete from efrete_ciot_pedidos where operacao_id = '965ceb0d-6097-43f5-b3c2-25a31c0e4e97'; -- se > 0, o pedido fica como evidência: pare e decida
  delete from documentacao_operacao where operacao_id = '965ceb0d-6097-43f5-b3c2-25a31c0e4e97'; -- 8 linhas geradas por gatilho
  delete from operacao_nfes where operacao_id = '965ceb0d-6097-43f5-b3c2-25a31c0e4e97';        -- 1 linha
  delete from condicoes_pagamento_operacao where operacao_id = '965ceb0d-6097-43f5-b3c2-25a31c0e4e97'; -- 1 linha
  delete from operacoes where id = '965ceb0d-6097-43f5-b3c2-25a31c0e4e97' and eh_teste is true;
  delete from cotacoes where id = 'c073079b-e348-4969-a788-7590ad9bf035' and eh_teste is true;
-- conferir: select count(*) from operacoes where id = '965ceb0d-6097-43f5-b3c2-25a31c0e4e97'; (esperado 0)
rollback; -- troque por commit quando conferir
