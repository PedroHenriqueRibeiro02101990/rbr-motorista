-- Tarefa 2 (11/10/2026): origem do CIOT na operação.
-- O número do CIOT continua em operacao_ciot_vpo.ciot (é o que o emitir-mdfe lê: a trava "sem CIOT, sem MDF-e" não muda).
-- Os campos novos ficam na mesma tabela (1:1 com a operação) para não haver dois lugares com o número do CIOT.

alter table public.operacao_ciot_vpo
  add column if not exists ciot_origem text,
  add column if not exists ciot_status text not null default 'pendente',
  add column if not exists ciot_inicio_previsto timestamptz,
  add column if not exists ciot_fim_previsto timestamptz;

alter table public.operacao_ciot_vpo drop constraint if exists operacao_ciot_vpo_ciot_origem_chk;
alter table public.operacao_ciot_vpo add constraint operacao_ciot_vpo_ciot_origem_chk
  check (ciot_origem is null or ciot_origem in ('rbr_repom', 'parceiro'));
alter table public.operacao_ciot_vpo drop constraint if exists operacao_ciot_vpo_ciot_status_chk;
alter table public.operacao_ciot_vpo add constraint operacao_ciot_vpo_ciot_status_chk
  check (ciot_status in ('pendente', 'emitido', 'cancelado', 'encerrado', 'refazer_troca_veiculo'));
alter table public.operacao_ciot_vpo drop constraint if exists operacao_ciot_vpo_ciot_periodo_chk;
alter table public.operacao_ciot_vpo add constraint operacao_ciot_vpo_ciot_periodo_chk
  check (ciot_inicio_previsto is null or ciot_fim_previsto is null or ciot_fim_previsto >= ciot_inicio_previsto);

comment on column public.operacao_ciot_vpo.ciot is 'Número do CIOT (gerado pela RBR na Repom ou digitado do parceiro ETC > 3 veículos).';
comment on column public.operacao_ciot_vpo.ciot_origem is 'rbr_repom (TAC e ETC equiparada) | parceiro (ETC com mais de 3 veículos gera o próprio).';

-- Parceiro que recebe o frete: titular do veículo, senão titular do motorista, senão o próprio motorista.
create or replace function public.titular_da_operacao(p_operacao uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(v.titular_id, p.titular_id, p.id)
  from operacoes o
  left join veiculos v on v.id = o.veiculo_id
  left join pessoas p on p.id = o.pessoa_alocada_id
  where o.id = p_operacao
$$;
revoke all on function public.titular_da_operacao(uuid) from public, anon;
grant execute on function public.titular_da_operacao(uuid) to authenticated, service_role;

-- Origem esperada pela classificação do parceiro (null = parceiro sem classificação).
create or replace function public.ciot_origem_esperada(p_operacao uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case p.classificacao_ciot
           when 'tac' then 'rbr_repom'
           when 'etc_equiparada_tac' then 'rbr_repom'
           when 'etc_ciot_proprio' then 'parceiro'
         end
  from pessoas p
  where p.id = titular_da_operacao(p_operacao)
$$;
revoke all on function public.ciot_origem_esperada(uuid) from public, anon;
grant execute on function public.ciot_origem_esperada(uuid) to authenticated, service_role;

create or replace function public.validar_ciot_origem()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_esperada text := ciot_origem_esperada(new.operacao_id);
begin
  if new.ciot_origem is null then
    new.ciot_origem := v_esperada;
  end if;
  if v_esperada = 'parceiro' and new.ciot_origem = 'rbr_repom' then
    raise exception 'Parceiro ETC com mais de 3 veículos gera o próprio CIOT: digite o número do CIOT do parceiro (a RBR não gera).';
  end if;
  if v_esperada = 'rbr_repom' and new.ciot_origem = 'parceiro' then
    raise exception 'Parceiro TAC (ou ETC equiparada a TAC): o CIOT é gerado pela RBR na Repom.';
  end if;
  if new.ciot is not null and btrim(new.ciot) <> '' and new.ciot_status = 'pendente' then
    new.ciot_status := 'emitido';
  end if;
  return new;
end;
$$;
revoke all on function public.validar_ciot_origem() from public, anon;

drop trigger if exists trg_validar_ciot_origem on public.operacao_ciot_vpo;
create trigger trg_validar_ciot_origem
  before insert or update on public.operacao_ciot_vpo
  for each row execute function public.validar_ciot_origem();
