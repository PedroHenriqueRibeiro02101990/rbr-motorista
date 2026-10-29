-- NSPEDAGIO (vale-pedágio): base do banco. Tudo aditivo: não apaga nem altera dados existentes.
-- 1) nspedagio_segredo(p_nome): lê UM segredo NSPEDAGIO_* do Vault. Só service_role (Edge Functions). Mesmo padrão da efrete_segredo.
-- 2) operacoes.numero_vpo: número NUMÉRICO e único (bigint) para idDocumentoTransporte. Operações antigas ficam com null
--    (o default só vale para linhas novas; a função que chamar o NSPEDAGIO numera a operação na primeira vez que precisar).
-- 3) vpo_requisicoes: registro de cada chamada ao NSPEDAGIO (sem segredo e sem token). RLS só gestor_rbr.
-- Rollback: supabase/rollback/rollback-20261029_01_nspedagio_base.sql

create function public.nspedagio_segredo(p_nome text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_nome is null or p_nome !~ '^NSPEDAGIO_[A-Z0-9_]+$' then
    raise exception 'Segredo não permitido: só nomes NSPEDAGIO_*';
  end if;
  return (select s.decrypted_secret from vault.decrypted_secrets s where s.name = p_nome limit 1);
end;
$$;
comment on function public.nspedagio_segredo(text) is 'Lê um segredo NSPEDAGIO_* do Vault. Somente service_role (Edge Functions do vale-pedágio).';
revoke all on function public.nspedagio_segredo(text) from public, anon, authenticated;
grant execute on function public.nspedagio_segredo(text) to service_role;

create sequence if not exists public.operacoes_numero_vpo_seq start 100001;
alter table public.operacoes add column if not exists numero_vpo bigint;
alter table public.operacoes alter column numero_vpo set default nextval('public.operacoes_numero_vpo_seq');
create unique index if not exists operacoes_numero_vpo_key on public.operacoes (numero_vpo);
comment on column public.operacoes.numero_vpo is 'Número numérico e único da operação, enviado ao NSPEDAGIO como idDocumentoTransporte (Long).';

create table if not exists public.vpo_requisicoes (
  id uuid primary key default gen_random_uuid(),
  operacao_id uuid not null references public.operacoes(id),
  acao text not null,
  ambiente text not null default 'homologacao',
  idempotency_key text not null unique,
  request_json jsonb,
  response_json jsonb,
  http_status integer,
  id_vpo_antt text,
  numero_viagem text,
  id_recibo text,
  total_viagem numeric(14,2),
  erro text,
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid()
);
comment on table public.vpo_requisicoes is 'Uma linha por chamada ao NSPEDAGIO. Gravada ANTES de interpretar a resposta. Nunca guarda segredo nem token.';
create index if not exists vpo_requisicoes_operacao_idx on public.vpo_requisicoes (operacao_id, criado_em desc);
alter table public.vpo_requisicoes enable row level security;
create policy vpo_req_gestor on public.vpo_requisicoes for all
  using (public.current_papel() = 'gestor_rbr')
  with check (public.current_papel() = 'gestor_rbr');
