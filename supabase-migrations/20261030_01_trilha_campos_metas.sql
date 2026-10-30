-- Implantação do back, etapa 1 (aditiva): A03 ator em documentos/eventos, A08 campos novos em operacoes,
-- A09 trilha de auditoria geral, F06 estrutura de metas. Só cria objetos novos; nada existente é alterado nem apagado.

-- A03: quem emitiu, de onde veio e a hora real do fato (a hora do registro continua sendo created_at/updated_at).
alter table public.documentacao_operacao add column if not exists emitido_por uuid references public.pessoas(id);
alter table public.documentacao_operacao add column if not exists origem_acao text;
alter table public.documentacao_operacao add column if not exists fato_em timestamptz;
alter table public.eventos_fiscais_operacao add column if not exists ator_id uuid references public.pessoas(id);
alter table public.eventos_fiscais_operacao add column if not exists origem_acao text;
alter table public.eventos_fiscais_operacao add column if not exists fato_em timestamptz;

-- A08: campos novos em operacoes (todos anuláveis).
alter table public.operacoes add column if not exists cavalo_veiculo_id uuid references public.veiculos(id);
alter table public.operacoes add column if not exists motorista_id uuid references public.pessoas(id);
alter table public.operacoes add column if not exists contato_coleta_nome text;
alter table public.operacoes add column if not exists contato_coleta_email text;
alter table public.operacoes add column if not exists contato_coleta_whatsapp text;
alter table public.operacoes add column if not exists contato_recebe_nome text;
alter table public.operacoes add column if not exists contato_recebe_email text;
alter table public.operacoes add column if not exists contato_recebe_whatsapp text;
alter table public.operacoes add column if not exists exigencias_carga text;
alter table public.operacoes add column if not exists aceite_motorista_em timestamptz;
alter table public.operacoes add column if not exists protocolo_gr text;
alter table public.operacoes add column if not exists versao_proposta integer;
alter table public.operacoes add column if not exists comprovante_entrega_path text;

-- A08/D04: histórico de alterações com antes e depois.
create table if not exists public.operacao_alteracoes (
  id uuid primary key default gen_random_uuid(),
  operacao_id uuid not null references public.operacoes(id),
  nivel text not null check (nivel in ('A','B','C','D')),
  campo text not null,
  antes jsonb,
  depois jsonb,
  motivo text,
  ator_id uuid references public.pessoas(id),
  origem_acao text,
  criado_em timestamptz not null default now()
);
create index if not exists operacao_alteracoes_op_idx on public.operacao_alteracoes (operacao_id, criado_em desc);
alter table public.operacao_alteracoes enable row level security;
create policy op_alteracoes_gestor on public.operacao_alteracoes for all
  using (public.current_papel() = 'gestor_rbr') with check (public.current_papel() = 'gestor_rbr');

-- A09: trilha de auditoria geral (liberação do gestor, cancelamentos, transferências, trocas, buscas da IA).
create table if not exists public.trilha_auditoria (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,
  operacao_id uuid references public.operacoes(id),
  ator_id uuid references public.pessoas(id),
  papel text,
  origem_acao text,
  motivo text,
  antes jsonb,
  depois jsonb,
  criado_em timestamptz not null default now()
);
create index if not exists trilha_auditoria_tipo_idx on public.trilha_auditoria (tipo, criado_em desc);
create index if not exists trilha_auditoria_op_idx on public.trilha_auditoria (operacao_id, criado_em desc);
alter table public.trilha_auditoria enable row level security;
create policy trilha_auditoria_gestor on public.trilha_auditoria for select
  using (public.current_papel() = 'gestor_rbr');

-- F06: metas por função e por pessoa. Vendas ativas; Operação e Fiscal criadas desligadas, com indicadores de exemplo.
create table if not exists public.metas (
  id uuid primary key default gen_random_uuid(),
  funcao text not null check (funcao in ('comercial','operacao','fiscal','financeiro','gestor')),
  pessoa_id uuid references public.pessoas(id),
  indicador text not null,
  descricao text,
  valor_meta numeric,
  ativa boolean not null default false,
  criado_em timestamptz not null default now(),
  unique (funcao, pessoa_id, indicador)
);
alter table public.metas enable row level security;
create policy metas_gestor on public.metas for all
  using (public.current_papel() = 'gestor_rbr') with check (public.current_papel() = 'gestor_rbr');
insert into public.metas (funcao, indicador, descricao, ativa) values
  ('comercial','faturamento','Faturamento no mês',true),
  ('comercial','cargas_fechadas','Cargas fechadas no mês',true),
  ('comercial','taxa_aprovacao','Taxa de aprovação das cotações',true),
  ('operacao','operacoes_no_prazo','Operações concluídas no prazo',false),
  ('operacao','resposta_na_fila','Tempo de resposta na fila',false),
  ('operacao','sem_devolucao_fiscal','Operações sem devolução do fiscal',false),
  ('fiscal','emitido_sem_rejeicao','Documentos emitidos sem rejeição',false),
  ('fiscal','tempo_fila_emissao','Tempo da fila até a emissão',false)
on conflict do nothing;
