-- VPO que aguenta a demora do NSPEDAGIO (compra/cancelamento levam alguns minutos; a função corta a espera em ~95 s).
-- Aditiva: 2 colunas anuláveis + 1 índice parcial. Rollback: supabase/rollback/rollback-20261111-1000-vpo-em-processamento.sql
alter table public.vpo_requisicoes add column if not exists situacao text;
alter table public.vpo_requisicoes add column if not exists processando_desde timestamptz;
alter table public.vpo_requisicoes drop constraint if exists vpo_requisicoes_situacao_chk;
alter table public.vpo_requisicoes add constraint vpo_requisicoes_situacao_chk check (situacao is null or situacao in ('em_processamento', 'concluida'));
comment on column public.vpo_requisicoes.situacao is 'em_processamento = a função cortou a espera e o NSPEDAGIO ainda pode concluir; a tela consulta o recibo. concluida = resolvida pelo recibo.';
comment on column public.vpo_requisicoes.processando_desde is 'Quando a chamada demorada começou (a tela espera até 5 min a partir daqui).';
-- Trava no banco: no máximo uma compra em processamento por operação (segunda compra nunca passa).
create unique index if not exists vpo_req_uma_compra_em_processamento
  on public.vpo_requisicoes (operacao_id) where acao = 'comprar' and situacao = 'em_processamento';
