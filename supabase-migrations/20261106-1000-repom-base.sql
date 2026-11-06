-- Repom (roteirizacao de pedagio / VPR): base do banco. ADITIVA: nao apaga nem altera dados existentes.
-- 1) repom_segredo(p_nome): le UM segredo REPOM_* do Vault. So service_role (mesmo padrao da nspedagio_segredo).
-- 2) repom_rotas / repom_pedagios: cache para nao pagar nem cadastrar a mesma rota duas vezes.
-- 3) repom_requisicoes: registro de cada chamada (sem segredo e sem token). Gravada ANTES de interpretar a resposta.
-- RLS: so gestor_rbr le; escrita so service_role (que ignora RLS). Agenciador NAO le nada daqui.
-- Rollback: supabase/rollback/rollback-20261106-1000-repom-base.sql

create function public.repom_segredo(p_nome text)
returns text language plpgsql stable security definer set search_path = '' as $$
begin
  if p_nome is null or p_nome !~ '^REPOM_[A-Z0-9_]+$' then
    raise exception 'Segredo nao permitido: so nomes REPOM_*';
  end if;
  return (select s.decrypted_secret from vault.decrypted_secrets s where s.name = p_nome limit 1);
end;
$$;
comment on function public.repom_segredo(text) is 'Le um segredo REPOM_* do Vault. Somente service_role (Edge Functions da Repom).';
revoke all on function public.repom_segredo(text) from public, anon, authenticated;
grant execute on function public.repom_segredo(text) to service_role;

create table if not exists public.repom_rotas (
  id uuid primary key default gen_random_uuid(),
  chave_hash text not null unique,
  codigo_roteiro_repom text not null,
  codigo_percurso_repom text not null,
  distancia_km numeric(10,2),
  descricao_percurso text,
  criado_em timestamptz not null default now()
);
create table if not exists public.repom_pedagios (
  id uuid primary key default gen_random_uuid(),
  rota_id uuid not null references public.repom_rotas(id) on delete cascade,
  eixos smallint not null,
  eixos_suspensos_ida smallint not null default 0,
  eixos_suspensos_volta smallint not null default 0,
  valor_total numeric(14,2) not null,
  valor_ida numeric(14,2),
  valor_volta numeric(14,2),
  consultado_em timestamptz not null default now(),
  validade_dias smallint not null default 30,
  unique (rota_id, eixos, eixos_suspensos_ida, eixos_suspensos_volta)
);
create table if not exists public.repom_requisicoes (
  id uuid primary key default gen_random_uuid(),
  acao text not null,
  ambiente text not null default 'qa',
  idempotency_key text not null unique,
  request_json jsonb,
  response_json jsonb,
  http_status integer,
  status text not null default 'pendente',
  erro text,
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid()
);
create index if not exists repom_requisicoes_usuario_idx on public.repom_requisicoes (criado_por, criado_em desc);

alter table public.repom_rotas enable row level security;
alter table public.repom_pedagios enable row level security;
alter table public.repom_requisicoes enable row level security;
create policy repom_rotas_gestor_le on public.repom_rotas for select using (public.current_papel() = 'gestor_rbr');
create policy repom_pedagios_gestor_le on public.repom_pedagios for select using (public.current_papel() = 'gestor_rbr');
create policy repom_req_gestor_le on public.repom_requisicoes for select using (public.current_papel() = 'gestor_rbr');
revoke all on public.repom_rotas, public.repom_pedagios, public.repom_requisicoes from anon;
revoke insert, update, delete on public.repom_rotas, public.repom_pedagios, public.repom_requisicoes from authenticated;
