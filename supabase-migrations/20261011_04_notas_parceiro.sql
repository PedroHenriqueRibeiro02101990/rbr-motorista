-- Tarefa 4 (11/10/2026): NFS-e de serviço dos parceiros. NÃO bloqueia pagamento: é só controle de pendência.
-- Uma nota cobre uma ou várias operações (N:N). "Frete pago" = lançamentos de despesa da categoria frete_motorista
-- com pagamento registrado (o pedágio/VPO tem categoria própria e fica fora da soma).

create table if not exists public.notas_parceiro (
  id uuid primary key default gen_random_uuid(),
  parceiro_id uuid not null references public.pessoas(id),
  competencia date not null check (competencia = date_trunc('month', competencia)::date),
  numero text not null,
  valor numeric(14,2) not null check (valor > 0),
  data_emissao date not null,
  arquivo_url text,
  observacao text,
  criado_por uuid references public.pessoas(id),
  criado_em timestamptz not null default now()
);
create index if not exists notas_parceiro_parceiro_idx on public.notas_parceiro (parceiro_id, competencia);

create table if not exists public.notas_parceiro_operacoes (
  nota_id uuid not null references public.notas_parceiro(id) on delete cascade,
  operacao_id uuid not null references public.operacoes(id),
  primary key (nota_id, operacao_id)
);
create index if not exists notas_parceiro_operacoes_op_idx on public.notas_parceiro_operacoes (operacao_id);

alter table public.notas_parceiro enable row level security;
alter table public.notas_parceiro_operacoes enable row level security;
drop policy if exists gestor_acesso_total on public.notas_parceiro;
create policy gestor_acesso_total on public.notas_parceiro for all to authenticated
  using ((select current_papel()) = 'gestor_rbr'::papel_pessoa) with check ((select current_papel()) = 'gestor_rbr'::papel_pessoa);
drop policy if exists gestor_acesso_total on public.notas_parceiro_operacoes;
create policy gestor_acesso_total on public.notas_parceiro_operacoes for all to authenticated
  using ((select current_papel()) = 'gestor_rbr'::papel_pessoa) with check ((select current_papel()) = 'gestor_rbr'::papel_pessoa);
grant select, insert, update, delete on public.notas_parceiro, public.notas_parceiro_operacoes to authenticated;
grant all on public.notas_parceiro, public.notas_parceiro_operacoes to service_role;

-- Frete pago por operação e parceiro, com a competência do pagamento e se já há nota cobrindo.
create or replace view public.v_frete_pago_parceiro
with (security_invoker = on) as
select
  l.pessoa_id as parceiro_id,
  l.operacao_id,
  date_trunc('month', max(l.data_pagamento))::date as competencia,
  sum(l.valor) as frete,
  max(l.data_pagamento) as pago_em,
  exists (select 1 from public.notas_parceiro_operacoes no where no.operacao_id = l.operacao_id) as tem_nota
from public.lancamentos_financeiros l
join public.categorias_financeiras c on c.id = l.categoria_id and c.codigo = 'frete_motorista'
where l.tipo = 'despesa'
  and l.status <> 'cancelado'
  and l.data_pagamento is not null
  and l.pessoa_id is not null
  and l.operacao_id is not null
group by l.pessoa_id, l.operacao_id;
grant select on public.v_frete_pago_parceiro to authenticated, service_role;

-- Pendências: frete pago sem nota, por parceiro e mês.
create or replace view public.v_notas_parceiro_pendentes
with (security_invoker = on) as
select
  f.parceiro_id,
  p.nome as parceiro_nome,
  p.cpf as parceiro_cpf,
  p.cnpj as parceiro_cnpj,
  p.celular as parceiro_celular,
  f.competencia,
  count(*) as operacoes,
  sum(f.frete) as frete_total,
  array_agg(f.operacao_id order by f.pago_em) as operacao_ids
from public.v_frete_pago_parceiro f
join public.pessoas p on p.id = f.parceiro_id
where not f.tem_nota
group by f.parceiro_id, p.nome, p.cpf, p.cnpj, p.celular, f.competencia;
grant select on public.v_notas_parceiro_pendentes to authenticated, service_role;

-- Anexar a nota: grava a nota e liga as operações. Diferença de valor vira aviso, nunca bloqueio.
create or replace function public.anexar_nota_parceiro(
  p_parceiro uuid, p_competencia date, p_numero text, p_valor numeric, p_data_emissao date, p_arquivo_url text, p_operacoes uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_frete numeric;
begin
  if (select current_papel()) is distinct from 'gestor_rbr'::papel_pessoa and not eh_backend() then
    raise exception 'Só o gestor da RBR anexa notas de parceiros.';
  end if;
  if coalesce(array_length(p_operacoes, 1), 0) = 0 then
    raise exception 'Escolha ao menos uma operação coberta pela nota.';
  end if;
  if nullif(btrim(p_numero), '') is null then
    raise exception 'Informe o número da nota.';
  end if;
  insert into notas_parceiro (parceiro_id, competencia, numero, valor, data_emissao, arquivo_url, criado_por)
  values (p_parceiro, date_trunc('month', p_competencia)::date, btrim(p_numero), p_valor, p_data_emissao, p_arquivo_url, current_pessoa_id())
  returning id into v_id;
  insert into notas_parceiro_operacoes (nota_id, operacao_id) select v_id, unnest(p_operacoes) on conflict do nothing;
  select coalesce(sum(frete), 0) into v_frete from v_frete_pago_parceiro where parceiro_id = p_parceiro and operacao_id = any (p_operacoes);
  return jsonb_build_object('nota_id', v_id, 'frete_operacoes', v_frete, 'diferenca', round(p_valor - v_frete, 2));
end;
$$;
revoke all on function public.anexar_nota_parceiro(uuid, date, text, numeric, date, text, uuid[]) from public, anon;
grant execute on function public.anexar_nota_parceiro(uuid, date, text, numeric, date, text, uuid[]) to authenticated, service_role;

-- Arquivos das notas: bucket privado, só o gestor.
insert into storage.buckets (id, name, public) values ('notas-parceiros', 'notas-parceiros', false) on conflict (id) do nothing;
drop policy if exists notas_parceiros_gestor on storage.objects;
create policy notas_parceiros_gestor on storage.objects for all to authenticated
  using (bucket_id = 'notas-parceiros' and (select current_papel()) = 'gestor_rbr'::papel_pessoa)
  with check (bucket_id = 'notas-parceiros' and (select current_papel()) = 'gestor_rbr'::papel_pessoa);
