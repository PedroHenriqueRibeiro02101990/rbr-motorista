-- Implantação do back, etapa 2 (aditiva): estruturas para D02 (assumir), D05 (devolução do fiscal), E04/E05 (proposta pública e aceite),
-- E08 (aviso de disponibilidade), B15 (passos do cancelamento da operação), G07 (disjuntor) e G09 (saúde fiscal).
-- Só cria objetos novos; nada existente é alterado nem apagado. Acesso só do gestor_rbr (a página pública do aceite passará por Edge Function).

-- D02: quem assumiu a operação e quando.
alter table public.operacoes add column if not exists assumida_por uuid references public.pessoas(id);
alter table public.operacoes add column if not exists assumida_em timestamptz;

-- D05: o fiscal devolve com motivo e detalhe; só o item errado reabre.
create table if not exists public.operacao_devolucoes_fiscal (
  id uuid primary key default gen_random_uuid(),
  operacao_id uuid not null references public.operacoes(id),
  item text not null,
  motivo text not null,
  detalhe text not null,
  devolvido_por uuid references public.pessoas(id),
  avisar_quem_errou uuid references public.pessoas(id),
  devolvido_em timestamptz not null default now(),
  resolvido_em timestamptz,
  resolvido_por uuid references public.pessoas(id)
);
create index if not exists operacao_devolucoes_op_idx on public.operacao_devolucoes_fiscal (operacao_id, devolvido_em desc);
alter table public.operacao_devolucoes_fiscal enable row level security;
create policy devolucoes_fiscal_gestor on public.operacao_devolucoes_fiscal for all
  using (public.current_papel() = 'gestor_rbr') with check (public.current_papel() = 'gestor_rbr');

-- E04/E05/E06: proposta com link público (rbrcargo.com.br/p/<código>), aceite registrado e aberturas.
create table if not exists public.propostas_publicas (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  cotacao_id uuid not null references public.cotacoes(id),
  pdf_path text,
  expira_em timestamptz,
  perdida_em timestamptz,
  perda_motivo text,
  aceita_em timestamptz,
  aceite_nome text,
  aceite_cargo text,
  aceite_ip text,
  aberturas integer not null default 0,
  aparelhos_distintos integer not null default 0,
  criada_em timestamptz not null default now()
);
create index if not exists propostas_publicas_cotacao_idx on public.propostas_publicas (cotacao_id);
alter table public.propostas_publicas enable row level security;
create policy propostas_publicas_gestor on public.propostas_publicas for all
  using (public.current_papel() = 'gestor_rbr') with check (public.current_papel() = 'gestor_rbr');

-- E08: aviso de disponibilidade preenchido à mão ("X caminhões livres em tal região no dia tal"); vazio = some.
create table if not exists public.avisos_disponibilidade (
  id uuid primary key default gen_random_uuid(),
  regiao text not null,
  dia date not null,
  caminhoes integer not null check (caminhoes > 0),
  criado_por uuid references public.pessoas(id),
  criado_em timestamptz not null default now()
);
alter table public.avisos_disponibilidade enable row level security;
create policy avisos_disponibilidade_gestor on public.avisos_disponibilidade for all
  using (public.current_papel() = 'gestor_rbr') with check (public.current_papel() = 'gestor_rbr');

-- B15: um passo por vez no cancelamento da operação inteira (MDF-e, CIOT, VPO, averbação, CT-e), na ordem inversa.
create table if not exists public.operacao_cancelamento_passos (
  id uuid primary key default gen_random_uuid(),
  operacao_id uuid not null references public.operacoes(id),
  ordem integer not null,
  etapa text not null check (etapa in ('mdfe','ciot','vpo','averbacao','cte')),
  status text not null default 'pendente' check (status in ('pendente','feito','falhou','nao_se_aplica')),
  motivo_operacao text,
  detalhe text,
  feito_por uuid references public.pessoas(id),
  feito_em timestamptz,
  unique (operacao_id, ordem)
);
alter table public.operacao_cancelamento_passos enable row level security;
create policy cancelamento_passos_gestor on public.operacao_cancelamento_passos for all
  using (public.current_papel() = 'gestor_rbr') with check (public.current_papel() = 'gestor_rbr');

-- G07: disjuntor (uma linha). Só o gestor reabre.
create table if not exists public.disjuntor_fiscal (
  id boolean primary key default true check (id),
  aberto boolean not null default false,
  motivo text,
  aberto_em timestamptz,
  reaberto_por uuid references public.pessoas(id),
  reaberto_em timestamptz
);
insert into public.disjuntor_fiscal (id, aberto) values (true, false) on conflict do nothing;
alter table public.disjuntor_fiscal enable row level security;
create policy disjuntor_fiscal_gestor on public.disjuntor_fiscal for all
  using (public.current_papel() = 'gestor_rbr') with check (public.current_papel() = 'gestor_rbr');

-- G09: achados dos robôs (sentinela, reconciliador, auditores) para a tela Saúde fiscal.
create table if not exists public.saude_fiscal_achados (
  id uuid primary key default gen_random_uuid(),
  robo text not null,
  operacao_id uuid references public.operacoes(id),
  gravidade text not null check (gravidade in ('verde','amarelo','vermelho','precisa_de_voce')),
  mensagem text not null,
  criado_em timestamptz not null default now(),
  resolvido_em timestamptz
);
create index if not exists saude_fiscal_achados_idx on public.saude_fiscal_achados (gravidade, criado_em desc);
alter table public.saude_fiscal_achados enable row level security;
create policy saude_fiscal_gestor on public.saude_fiscal_achados for all
  using (public.current_papel() = 'gestor_rbr') with check (public.current_papel() = 'gestor_rbr');
