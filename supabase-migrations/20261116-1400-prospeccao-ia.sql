-- Prospeccao, Etapa 5: agente de IA (resposta, validador, analista semanal), custo de IA, relatorios, experimentos e avisos. ADITIVA.
-- Depende de 1000, 1100, 1300 e 1350. NAO repete nada das etapas 1 e 3 (tipos resp_cotacao/resp_recusa_carga e caixas ja existem).
-- Tudo nasce DESLIGADO: sem a chave da IA (segredo PROSPECCAO_IA_CHAVE, criado na 1350) as funcoes respondem "IA desligada" e nao fazem nada.
-- Rollback: supabase/rollback/rollback-20261116-1400-prospeccao-ia.sql
set local lock_timeout = '8s';

-- ---------------------------------------------------------------------------------------------------------
-- 1) Parametros (so o usuario do Pedro altera, pelo gatilho de flags da Parte A)
-- ---------------------------------------------------------------------------------------------------------
insert into public.parametros_sistema (chave, valor, descricao) values
  ('PROSPECCAO_IA_TETO_DIARIO_BRL',   '3'::jsonb,   'Prospeccao IA: teto de gasto por dia em R$. Ao bater, a IA para de classificar e redigir (envios por modelo continuam) e o Pedro e avisado.'),
  ('PROSPECCAO_IA_CAMBIO_USD_BRL',    '5.5'::jsonb, 'Prospeccao IA: cambio usado para converter o custo em dolar para reais (editavel).'),
  ('PROSPECCAO_IA_MODELO_CLASSIFICAR','"claude-haiku-5-5"'::jsonb,  'Prospeccao IA: modelo barato para classificar.'),
  ('PROSPECCAO_IA_MODELO_EXTRAIR',    '"claude-haiku-5-5"'::jsonb,  'Prospeccao IA: modelo barato para extrair dados (origem, destino, carga...).'),
  ('PROSPECCAO_IA_MODELO_VALIDAR',    '"claude-haiku-5-5"'::jsonb,  'Prospeccao IA: modelo barato do validador independente.'),
  ('PROSPECCAO_IA_MODELO_REDIGIR',    '"claude-sonnet-5-5"'::jsonb, 'Prospeccao IA: modelo para redigir rascunhos e relatorios.'),
  ('PROSPECCAO_IA_MODELO_ESCALAR',    '"claude-sonnet-5-5"'::jsonb, 'Prospeccao IA: modelo para onde a classificacao escala quando a confianca e baixa (depois disso vai para uma pessoa).'),
  ('PROSPECCAO_IA_AUTONOMIA',         '"rascunho"'::jsonb,          'Prospeccao IA: escada de autonomia. "rascunho" = so cria rascunhos; "seguras" = com aprovacao desligada, envia sozinho agradecimento/indicacao/agora nao/recusa de carga; "roteiro" = tambem o aviso de cotacao. Comeca em rascunho.'),
  ('PROSPECCAO_IA_PRECOS_USD_MILHAO', '{"claude-haiku-5-5":{"in":1.0,"out":5.0},"claude-sonnet-5-5":{"in":3.0,"out":15.0}}'::jsonb, 'Prospeccao IA: preco por milhao de tokens (US$), ESTIMATIVA EDITAVEL: confira na tabela de precos da Anthropic.')
on conflict (chave) do nothing;

-- ---------------------------------------------------------------------------------------------------------
-- 2) Colunas novas nas tabelas existentes
-- ---------------------------------------------------------------------------------------------------------
alter table public.prospeccao_respostas
  add column agente_processado_em timestamptz,
  add column agente_categoria text,
  add column agente_confianca numeric,
  add column agente_dados jsonb not null default '{}'::jsonb,
  add column agente_acao text,
  add column agente_motivo text;
create index prospeccao_respostas_agente_idx on public.prospeccao_respostas (recebido_em) where agente_processado_em is null and tratada = false;

alter table public.prospeccao_mensagens
  add column experimento_id uuid,
  add column variante boolean not null default false,
  add column validador_motivo text;

-- ---------------------------------------------------------------------------------------------------------
-- 3) Tabelas
-- ---------------------------------------------------------------------------------------------------------
create table public.prospeccao_ia_uso (
  id bigint generated always as identity primary key,
  momento timestamptz not null default now(),
  data date not null default (now() at time zone 'America/Sao_Paulo')::date,
  funcao text not null check (funcao in ('classificar', 'extrair', 'validar', 'redigir', 'escalar', 'analisar')),
  modelo text not null,
  tokens_in int not null default 0 check (tokens_in >= 0),
  tokens_out int not null default 0 check (tokens_out >= 0),
  custo_usd numeric(12, 6) not null default 0,
  custo_brl numeric(12, 4) not null default 0,
  resposta_id uuid references public.prospeccao_respostas(id) on delete set null
);
create index prospeccao_ia_uso_data_idx on public.prospeccao_ia_uso (data);
comment on table public.prospeccao_ia_uso is 'Prospeccao IA: uma linha por chamada a IA (tokens e custo). Soma do dia contra PROSPECCAO_IA_TETO_DIARIO_BRL. Nunca guarda o texto enviado.';

create table public.prospeccao_relatorios (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  semana_inicio date not null,
  semana_fim date not null,
  resumo text,
  metricas jsonb not null default '{}'::jsonb,        -- por texto/toque/segmento: enviados, respostas, uteis, agora_nao, descadastros, devolucoes, custo_ia_brl
  sugestoes jsonb not null default '[]'::jsonb,       -- [{id,titulo,campo,motivo,evidencia,risco,teste,status:'nova'|'aceita'|'recusada'}]
  reversoes jsonb not null default '[]'::jsonb,       -- experimentos revertidos na semana (sempre aparecem)
  email_enviado_em timestamptz,
  unique (semana_inicio)
);

create table public.prospeccao_experimentos (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  tipo text not null check (tipo in ('texto', 'assunto', 'cadencia', 'segmento')),   -- a allowlist da IA: so estes quatro
  alvo text not null,                                  -- tipo do modelo (toque1...), "jornada" ou o segmento
  padrao jsonb not null,
  variante jsonb not null,
  pct_envios int not null default 10 check (pct_envios between 1 and 10),
  status text not null default 'em_teste' check (status in ('em_teste', 'vencedor', 'revertido', 'encerrado')),
  motivo_decisao text,
  decidido_em timestamptz,
  relatorio_id uuid references public.prospeccao_relatorios(id) on delete set null,
  origem text not null default 'analista' check (origem in ('analista', 'manual'))
);
create index prospeccao_experimentos_status_idx on public.prospeccao_experimentos (status);
alter table public.prospeccao_mensagens add constraint prospeccao_mensagens_experimento_fk foreign key (experimento_id) references public.prospeccao_experimentos(id) on delete set null;

create table public.prospeccao_avisos (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  tipo text not null,                                  -- cotacao, escalada, teto_ia, reversao, validador...
  texto text not null,
  empresa_id uuid references public.prospeccao_empresas(id) on delete set null,
  conversa_id uuid references public.prospeccao_conversas(id) on delete set null,
  visto_em timestamptz
);
create index prospeccao_avisos_abertos_idx on public.prospeccao_avisos (criado_em desc) where visto_em is null;

-- ---------------------------------------------------------------------------------------------------------
-- 4) RLS: so gestor; a tela so marca aviso como visto e aceita/recusa sugestao
-- ---------------------------------------------------------------------------------------------------------
alter table public.prospeccao_ia_uso enable row level security;
alter table public.prospeccao_relatorios enable row level security;
alter table public.prospeccao_experimentos enable row level security;
alter table public.prospeccao_avisos enable row level security;
create policy prospeccao_ia_uso_sel on public.prospeccao_ia_uso for select to authenticated using (public.current_papel() = 'gestor_rbr');
create policy prospeccao_relatorios_sel on public.prospeccao_relatorios for select to authenticated using (public.current_papel() = 'gestor_rbr');
create policy prospeccao_relatorios_upd on public.prospeccao_relatorios for update to authenticated using (public.current_papel() = 'gestor_rbr') with check (public.current_papel() = 'gestor_rbr');
create policy prospeccao_experimentos_sel on public.prospeccao_experimentos for select to authenticated using (public.current_papel() = 'gestor_rbr');
create policy prospeccao_avisos_sel on public.prospeccao_avisos for select to authenticated using (public.current_papel() = 'gestor_rbr');
create policy prospeccao_avisos_upd on public.prospeccao_avisos for update to authenticated using (public.current_papel() = 'gestor_rbr') with check (public.current_papel() = 'gestor_rbr');
revoke all on public.prospeccao_ia_uso, public.prospeccao_relatorios, public.prospeccao_experimentos, public.prospeccao_avisos from anon;
revoke update on public.prospeccao_relatorios from authenticated;
grant update (sugestoes) on public.prospeccao_relatorios to authenticated;
revoke update on public.prospeccao_avisos from authenticated;
grant update (visto_em) on public.prospeccao_avisos to authenticated;
