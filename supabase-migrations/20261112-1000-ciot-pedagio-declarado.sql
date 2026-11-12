-- Aditiva: guarda o pedágio declarado em cada pedido de CIOT (valor do vale comprado ou estimativa da cotação).
-- Serve para avisar na tela quando o vale mudou depois de o CIOT ser emitido (CIOT de lotação não tem retificação).
alter table public.efrete_ciot_pedidos add column if not exists pedagio_declarado numeric;
comment on column public.efrete_ciot_pedidos.pedagio_declarado is 'Pedágio enviado no pedido do CIOT (R$). Nulo nos pedidos anteriores a esta coluna.';
