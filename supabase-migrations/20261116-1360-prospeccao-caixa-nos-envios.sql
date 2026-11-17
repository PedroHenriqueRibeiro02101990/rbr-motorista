-- Prospeccao: registra POR QUAL CAIXA cada toque saiu (limite e rampa por caixa). ADITIVA. Depende da 1350.
-- Rollback: supabase/rollback/rollback-20261116-1360-prospeccao-caixa-nos-envios.sql
set local lock_timeout = '8s';
alter table public.prospeccao_mensagens add column caixa_id uuid references public.prospeccao_caixas(id);
alter table public.prospeccao_log add column caixa_id uuid references public.prospeccao_caixas(id);
create index prospeccao_mensagens_caixa_idx on public.prospeccao_mensagens (caixa_id, enviado_em) where caixa_id is not null;
create index prospeccao_log_caixa_idx on public.prospeccao_log (caixa_id, momento desc) where caixa_id is not null;
