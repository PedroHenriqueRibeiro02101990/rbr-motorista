-- 20261024_04 — CIOT da efrete ligado à operação (passo 4, bloco 2).
-- operacao_ciot_vpo: nova origem 'efrete' (a RBR gera o CIOT do TAC pela efrete, como fazia pela Repom) + ambiente,
--   verificador, protocolo e data. O MDF-e de produção ignora CIOT com ciot_ambiente = 'homologacao' (mdfe.ts).
-- validar_ciot_origem: 'efrete' vale onde valia 'rbr_repom' (TAC / ETC equiparada); parceiro ETC continua com o dele.
-- efrete_ciot_pedidos: status 'encerrado'; piso calculado; confirmação humana (quem e quando); encerramento;
--   um pedido ativo por operação (pendente/emitido/erro).
-- efrete_cadastros: o que já foi cadastrado na efrete (proprietário, veículo, motorista) por ambiente, para não repetir.
-- RLS: efrete_cadastros só service_role (RLS ligada, sem política), como efrete_ciot_pedidos.
-- Rollback: supabase/rollback/rollback-20261024_04_efrete_ciot_operacao.sql
set local lock_timeout = '8s';

alter table public.operacao_ciot_vpo drop constraint if exists operacao_ciot_vpo_ciot_origem_chk;
alter table public.operacao_ciot_vpo
  add constraint operacao_ciot_vpo_ciot_origem_chk check (ciot_origem is null or ciot_origem in ('rbr_repom', 'parceiro', 'efrete')),
  add column ciot_ambiente text check (ciot_ambiente is null or ciot_ambiente in ('homologacao', 'producao')),
  add column ciot_verificador text check (ciot_verificador is null or ciot_verificador ~ '^\d{4}$'),
  add column ciot_protocolo text,
  add column ciot_emitido_em timestamptz;
comment on column public.operacao_ciot_vpo.ciot_ambiente is 'Ambiente em que o CIOT foi emitido (efrete). CIOT de homologação nunca libera MDF-e em produção.';

create or replace function public.validar_ciot_origem()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_esperada text := ciot_origem_esperada(new.operacao_id);
begin
  if new.ciot_origem is null then
    new.ciot_origem := v_esperada;
  end if;
  if v_esperada = 'parceiro' and new.ciot_origem in ('rbr_repom', 'efrete') then
    raise exception 'Parceiro ETC com mais de 3 veículos gera o próprio CIOT: digite o número do CIOT do parceiro (a RBR não gera).';
  end if;
  if v_esperada = 'rbr_repom' and new.ciot_origem = 'parceiro' then
    raise exception 'Parceiro TAC (ou ETC equiparada a TAC): o CIOT é gerado pela RBR (Repom ou efrete).';
  end if;
  if new.ciot is not null and btrim(new.ciot) <> '' and new.ciot_status = 'pendente' then
    new.ciot_status := 'emitido';
  end if;
  return new;
end;
$function$;

alter table public.efrete_ciot_pedidos drop constraint if exists efrete_ciot_pedidos_status_check;
alter table public.efrete_ciot_pedidos
  add constraint efrete_ciot_pedidos_status_check check (status in ('pendente', 'emitido', 'erro', 'cancelado', 'encerrado')),
  add column piso_minimo numeric(14, 2),
  add column piso_detalhe jsonb,
  add column confirmado_por uuid references public.pessoas(id) on delete set null,
  add column confirmado_por_nome text,
  add column confirmado_em timestamptz,
  add column encerrado_em timestamptz,
  add column encerramento_protocolo text;
create unique index efrete_ciot_pedidos_um_ativo_por_operacao
  on public.efrete_ciot_pedidos (operacao_id) where operacao_id is not null and status in ('pendente', 'emitido', 'erro');

create table public.efrete_cadastros (
  id uuid primary key default gen_random_uuid(),
  ambiente text not null check (ambiente in ('homologacao', 'producao')),
  tipo text not null check (tipo in ('proprietario', 'veiculo', 'motorista')),
  chave text not null, -- CPF/CNPJ (proprietário, motorista) ou placa (veículo)
  protocolo text,
  cadastrado_em timestamptz not null default now(),
  unique (ambiente, tipo, chave)
);
comment on table public.efrete_cadastros is 'Cadastros já feitos na efrete (para não repetir). Só service_role.';
alter table public.efrete_cadastros enable row level security;
revoke all on public.efrete_cadastros from anon, authenticated;
