-- 20261023_02 — Ordem de coleta (PDF do motorista).
-- Uma linha por versão da ordem de uma operação. Só registra o que foi gerado/enviado; NÃO muda status da operação
-- nem o "Liberar coleta" (gatilho trg_fn_operacao_valida_transicao fica igual).
-- Rollback: supabase/rollback/rollback-20261023_02_ordens_coleta.sql
set local lock_timeout = '8s';

create table if not exists public.ordens_coleta (
  id uuid primary key default gen_random_uuid(),
  operacao_id uuid not null references public.operacoes(id) on delete restrict,
  versao int not null default 1,
  -- local de carregamento (cópia no momento da geração; a cotação pode mudar depois)
  endereco_carregamento text not null,
  cep_carregamento text,
  cidade_carregamento text not null,
  uf_carregamento text not null check (char_length(uf_carregamento) = 2),
  contato_nome text,
  contato_telefone text,
  coleta_prevista_em timestamptz,
  -- carga e documentos que o motorista precisa levar/conferir
  carga_descricao text,
  peso_kg numeric,
  volumes int,
  documentos jsonb not null default '[]'::jsonb, -- ex.: [{"tipo":"cte","numero":"18"},{"tipo":"mdfe","numero":"7"}]
  observacoes text,
  pdf_path text, -- bucket operacao-documentos: <operacao_id>/ordem-coleta/v<versao>.pdf
  gerada_por uuid references public.pessoas(id),
  gerada_em timestamptz not null default now(),
  enviada_motorista_em timestamptz,
  cancelada_em timestamptz,
  cancelada_motivo text,
  unique (operacao_id, versao)
);
comment on table public.ordens_coleta is 'Ordem de coleta (PDF para o motorista): local de carregamento, contato, data, carga e documentos. Não altera a liberação para coleta.';

create index if not exists ordens_coleta_operacao_idx on public.ordens_coleta (operacao_id, versao desc);

alter table public.ordens_coleta enable row level security;

create policy ordens_coleta_gestor on public.ordens_coleta
  for all using (current_papel() = 'gestor_rbr') with check (current_papel() = 'gestor_rbr');

-- Motorista vê só a ordem das cargas alocadas a ele (ou ao titular dele), e só depois de liberada.
create policy ordens_coleta_motorista_le on public.ordens_coleta
  for select using (
    cancelada_em is null and exists (
      select 1 from public.operacoes o
      where o.id = ordens_coleta.operacao_id
        and o.status in ('liberada_coleta', 'carregando', 'em_transito', 'entregue')
        and (o.pessoa_alocada_id = current_pessoa_id()
             or o.pessoa_alocada_id in (select p.id from public.pessoas p where p.titular_id = current_pessoa_id()))
    )
  );

