-- Fornecedor (empresa que emite) de CIOT e de VPO por operação. ADITIVA: tabela nova, 4 colunas novas e 2 funções.
-- Padrão: nstech para os dois. Novo fornecedor = uma linha em fornecedores_fiscais + um adaptador no backend.
create table if not exists public.fornecedores_fiscais (
  id text primary key check (id ~ '^[a-z0-9_]+$'),
  nome text not null,
  capacidades text[] not null default '{}',          -- 'ciot' e/ou 'vpo'
  ativo boolean not null default true,
  disponivel_emissao boolean not null default false,  -- false = aparece como "em implantação"
  ambiente text not null default 'homologacao',
  ordem integer not null default 100,
  padrao_ciot boolean not null default false,
  padrao_vpo boolean not null default false,
  criado_em timestamptz not null default now()
);
create unique index if not exists fornecedores_fiscais_um_padrao_ciot on public.fornecedores_fiscais (padrao_ciot) where padrao_ciot;
create unique index if not exists fornecedores_fiscais_um_padrao_vpo on public.fornecedores_fiscais (padrao_vpo) where padrao_vpo;

alter table public.fornecedores_fiscais enable row level security;
alter table public.fornecedores_fiscais force row level security;
drop policy if exists fornecedores_fiscais_leitura on public.fornecedores_fiscais;
create policy fornecedores_fiscais_leitura on public.fornecedores_fiscais for select to authenticated
  using (public.current_papel()::text in ('gestor_rbr', 'fiscal'));
-- Leitura: gestor e Fiscal (o Fiscal é quem escolhe a empresa). Escrita: nenhuma policy para usuário (só service_role e as funções abaixo).
revoke all on public.fornecedores_fiscais from anon;
revoke insert, update, delete on public.fornecedores_fiscais from authenticated;

insert into public.fornecedores_fiscais (id, nome, capacidades, ativo, disponivel_emissao, ambiente, ordem, padrao_ciot, padrao_vpo) values
  ('nstech', 'NSTech', array['ciot','vpo'], true, true,  'homologacao', 10, true,  true),
  ('repom',  'Repom',                                           array['ciot','vpo'], true, false, 'homologacao', 20, false, false)
on conflict (id) do nothing;

alter table public.operacao_ciot_vpo
  add column if not exists ciot_fornecedor text references public.fornecedores_fiscais(id),
  add column if not exists vpo_fornecedor text references public.fornecedores_fiscais(id),
  add column if not exists fornecedor_escolhido_por uuid,
  add column if not exists fornecedor_escolhido_em timestamptz;
comment on column public.operacao_ciot_vpo.ciot_fornecedor is 'Empresa escolhida para emitir o CIOT desta operação. Nulo = padrão (fornecedores_fiscais.padrao_ciot).';
comment on column public.operacao_ciot_vpo.vpo_fornecedor is 'Empresa escolhida para emitir o vale-pedágio desta operação. Nulo = padrão (fornecedores_fiscais.padrao_vpo).';

-- Escolha por operação: só Fiscal e gestor; só fornecedor ativo, com a capacidade e disponível; bloqueada depois de emissão ativa.
create or replace function public.escolher_fornecedor_fiscal(p_operacao uuid, p_tipo text, p_fornecedor text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  f public.fornecedores_fiscais%rowtype;
  v public.operacao_ciot_vpo%rowtype;
  op record;
  quem uuid := auth.uid();
begin
  if p_tipo not in ('ciot', 'vpo') then raise exception 'Tipo inválido: use ciot ou vpo.'; end if;
  if coalesce(public.current_papel()::text, '') not in ('fiscal', 'gestor_rbr') then
    raise exception 'Só o Fiscal ou o gestor podem trocar a empresa que emite.';
  end if;
  select id, modo_demonstracao into op from public.operacoes where id = p_operacao and deleted_at is null;
  if not found then raise exception 'Operação não encontrada.'; end if;
  if coalesce(op.modo_demonstracao, false) then raise exception 'Operação de demonstração: a empresa fica fixa na NSTech.'; end if;
  select * into f from public.fornecedores_fiscais where id = p_fornecedor;
  if not found or not f.ativo or not (p_tipo = any (f.capacidades)) then raise exception 'Fornecedor % não atende %.', p_fornecedor, upper(p_tipo); end if;
  if not f.disponivel_emissao then raise exception 'Fornecedor % ainda não está disponível para emitir (em implantação).', f.nome; end if;

  select * into v from public.operacao_ciot_vpo where operacao_id = p_operacao;
  if found then
    if p_tipo = 'ciot' and coalesce(v.ciot_status, '') in ('pendente', 'emitido', 'encerrado') then
      raise exception 'CIOT já emitido: cancele antes de trocar a empresa.';
    end if;
    if p_tipo = 'vpo' and (v.vpo_idvpo is not null
        or exists (select 1 from public.vpo_requisicoes r where r.operacao_id = p_operacao and r.situacao = 'em_processamento')) then
      raise exception 'Vale-pedágio já comprado ou em andamento: cancele antes de trocar a empresa.';
    end if;
  end if;

  insert into public.operacao_ciot_vpo (operacao_id, ciot_fornecedor, vpo_fornecedor, fornecedor_escolhido_por, fornecedor_escolhido_em)
  values (p_operacao, case when p_tipo = 'ciot' then p_fornecedor end, case when p_tipo = 'vpo' then p_fornecedor end, quem, now())
  on conflict (operacao_id) do update set
    ciot_fornecedor = case when p_tipo = 'ciot' then p_fornecedor else public.operacao_ciot_vpo.ciot_fornecedor end,
    vpo_fornecedor  = case when p_tipo = 'vpo'  then p_fornecedor else public.operacao_ciot_vpo.vpo_fornecedor end,
    fornecedor_escolhido_por = quem,
    fornecedor_escolhido_em = now();
  return jsonb_build_object('ok', true, 'tipo', p_tipo, 'fornecedor', p_fornecedor);
end $$;

-- Padrão global: só o gestor.
create or replace function public.definir_fornecedor_padrao(p_tipo text, p_fornecedor text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare f public.fornecedores_fiscais%rowtype;
begin
  if p_tipo not in ('ciot', 'vpo') then raise exception 'Tipo inválido: use ciot ou vpo.'; end if;
  if coalesce(public.current_papel()::text, '') <> 'gestor_rbr' then raise exception 'Só o gestor define o fornecedor padrão.'; end if;
  select * into f from public.fornecedores_fiscais where id = p_fornecedor;
  if not found or not f.ativo or not (p_tipo = any (f.capacidades)) or not f.disponivel_emissao then
    raise exception 'Fornecedor % não pode ser o padrão de % (inativo, sem a capacidade ou em implantação).', p_fornecedor, upper(p_tipo);
  end if;
  if p_tipo = 'ciot' then
    update public.fornecedores_fiscais set padrao_ciot = false where padrao_ciot and id <> p_fornecedor;
    update public.fornecedores_fiscais set padrao_ciot = true where id = p_fornecedor;
  else
    update public.fornecedores_fiscais set padrao_vpo = false where padrao_vpo and id <> p_fornecedor;
    update public.fornecedores_fiscais set padrao_vpo = true where id = p_fornecedor;
  end if;
  return jsonb_build_object('ok', true, 'tipo', p_tipo, 'fornecedor', p_fornecedor);
end $$;

revoke all on function public.escolher_fornecedor_fiscal(uuid, text, text) from public, anon;
revoke all on function public.definir_fornecedor_padrao(text, text) from public, anon;
grant execute on function public.escolher_fornecedor_fiscal(uuid, text, text) to authenticated;
grant execute on function public.definir_fornecedor_padrao(text, text) to authenticated;
