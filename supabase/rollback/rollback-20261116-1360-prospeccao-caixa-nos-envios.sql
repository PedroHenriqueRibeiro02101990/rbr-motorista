drop index if exists public.prospeccao_mensagens_caixa_idx, public.prospeccao_log_caixa_idx;
alter table public.prospeccao_mensagens drop column if exists caixa_id;
alter table public.prospeccao_log drop column if exists caixa_id;
