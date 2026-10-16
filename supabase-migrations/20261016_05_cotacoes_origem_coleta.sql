-- 20261016_05 — Coleta em outro local: CEP e endereço da origem da cotação.
-- JÁ APLICADA no banco em 2026-10-16 14:23 UTC (schema_migrations 20261016142300 "cotacoes_origem_coleta_cep_endereco").
-- Este arquivo só registra no repositório o que está no ar. NÃO reaplicar (é idempotente de qualquer forma).
-- Usado por gestor/src/lib/origemCotacao.ts; o MDF-e deve usar origem_cep como cep_carregamento quando existir.
set local lock_timeout = '8s';
alter table public.cotacoes add column if not exists origem_cep text;
alter table public.cotacoes add column if not exists origem_endereco text;
comment on column public.cotacoes.origem_cep is 'CEP do local de coleta quando difere do endereço do cliente (coleta em outro local). Usado como cep_carregamento do MDF-e.';
comment on column public.cotacoes.origem_endereco is 'Endereço completo do local de coleta quando difere do endereço do cliente (informativo).';
