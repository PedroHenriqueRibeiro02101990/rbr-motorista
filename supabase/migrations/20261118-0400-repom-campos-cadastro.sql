-- Parte D etapa 26: campos que faltam no cadastro para a Repom. ADITIVA e idempotente; colunas opcionais, sem valor inventado.
-- NAO APLICADA (so na etapa 28). Rollback: supabase/rollback/rollback-20261118-0400-repom-campos-cadastro.sql
-- Previsao de entrega da operacao: ja existe operacoes.entrega_prevista (reaproveitada; nada novo).
alter table public.pessoas add column if not exists rg_numero text;
alter table public.pessoas add column if not exists rg_orgao_emissor text;
alter table public.pessoas add column if not exists rg_uf text;
alter table public.pessoas add column if not exists genero text;
alter table public.pessoas add column if not exists numero_dependentes integer;
alter table public.pessoas add column if not exists optante_simples_nacional boolean;   -- prestador
alter table public.operacoes add column if not exists tipo_carga_antt smallint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pessoas_genero_chk') then
    alter table public.pessoas add constraint pessoas_genero_chk check (genero is null or genero in ('M', 'F')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pessoas_numero_dependentes_chk') then
    alter table public.pessoas add constraint pessoas_numero_dependentes_chk check (numero_dependentes is null or numero_dependentes between 0 and 30) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'operacoes_tipo_carga_antt_chk') then
    alter table public.operacoes add constraint operacoes_tipo_carga_antt_chk check (tipo_carga_antt is null or tipo_carga_antt between 1 and 8) not valid;
  end if;
end $$;

-- Lista editavel dos tipos de carga ANTT (codigos 1 a 8 do guia da Repom, docs/repom/ESPECIFICACAO-FRETE.md secao 5).
create table if not exists public.tipos_carga_antt (codigo smallint primary key check (codigo between 1 and 8), descricao text not null);
insert into public.tipos_carga_antt (codigo, descricao) values
  (1, 'Granel solido'), (2, 'Granel liquido'), (3, 'Frigorificada'), (4, 'Conteinerizada'), (5, 'Carga Geral'), (6, 'Neogranel'),
  (7, 'Perigosa (granel solido)'), (8, 'Perigosa (granel liquido)')
on conflict (codigo) do nothing;
alter table public.tipos_carga_antt enable row level security;
drop policy if exists tipos_carga_antt_leitura on public.tipos_carga_antt;
create policy tipos_carga_antt_leitura on public.tipos_carga_antt for select to authenticated using (true);
drop policy if exists tipos_carga_antt_gestor on public.tipos_carga_antt;
create policy tipos_carga_antt_gestor on public.tipos_carga_antt for all to authenticated
  using ((select current_papel()) = 'gestor_rbr'::papel_pessoa) with check ((select current_papel()) = 'gestor_rbr'::papel_pessoa);

-- Configuracao da Repom (codigo da filial da RBR na Repom, editavel; sem valor padrao inventado).
create table if not exists public.repom_config (chave text primary key, valor text not null, atualizado_em timestamptz not null default now());
alter table public.repom_config enable row level security;
drop policy if exists repom_config_gestor on public.repom_config;
create policy repom_config_gestor on public.repom_config for all to authenticated
  using ((select current_papel()) = 'gestor_rbr'::papel_pessoa) with check ((select current_papel()) = 'gestor_rbr'::papel_pessoa);

-- Complemento do motorista lido dos documentos (RG e genero CONFIRMADOS pela pessoa); a RPC principal da Parte A nao muda.
create or replace function public.complementar_motorista_por_documentos(p_cpf text, p_dados jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select current_papel()) is null or (select current_papel()) not in ('gestor_rbr'::papel_pessoa, 'operacao'::papel_pessoa, 'fiscal'::papel_pessoa) then
    raise exception 'Sem permissao.' using errcode = '42501';
  end if;
  update pessoas set
    rg_numero = coalesce(nullif(p_dados->>'rg_numero', ''), rg_numero),
    rg_orgao_emissor = coalesce(nullif(p_dados->>'rg_orgao_emissor', ''), rg_orgao_emissor),
    rg_uf = coalesce(nullif(p_dados->>'rg_uf', ''), rg_uf),
    genero = coalesce(nullif(p_dados->>'genero', ''), genero),
    numero_dependentes = coalesce(nullif(p_dados->>'numero_dependentes', '')::int, numero_dependentes)
  where cpf = p_cpf and deleted_at is null;
end;
$$;
revoke all on function public.complementar_motorista_por_documentos(text, jsonb) from public, anon;
grant execute on function public.complementar_motorista_por_documentos(text, jsonb) to authenticated, service_role;
