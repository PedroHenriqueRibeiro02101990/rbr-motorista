-- Rollback de 20261024_04_efrete_ciot_operacao.sql
-- Atenção: linhas com ciot_origem = 'efrete' ou status 'encerrado' impedem recriar as checagens antigas; trate-as antes.
set local lock_timeout = '8s';

drop table if exists public.efrete_cadastros;
drop index if exists public.efrete_ciot_pedidos_um_ativo_por_operacao;
alter table public.efrete_ciot_pedidos
  drop column if exists piso_minimo, drop column if exists piso_detalhe,
  drop column if exists confirmado_por, drop column if exists confirmado_por_nome, drop column if exists confirmado_em,
  drop column if exists encerrado_em, drop column if exists encerramento_protocolo;
alter table public.efrete_ciot_pedidos drop constraint if exists efrete_ciot_pedidos_status_check;
alter table public.efrete_ciot_pedidos add constraint efrete_ciot_pedidos_status_check check (status in ('pendente', 'emitido', 'erro', 'cancelado'));

alter table public.operacao_ciot_vpo
  drop column if exists ciot_ambiente, drop column if exists ciot_verificador,
  drop column if exists ciot_protocolo, drop column if exists ciot_emitido_em;
alter table public.operacao_ciot_vpo drop constraint if exists operacao_ciot_vpo_ciot_origem_chk;
alter table public.operacao_ciot_vpo add constraint operacao_ciot_vpo_ciot_origem_chk check (ciot_origem is null or ciot_origem in ('rbr_repom', 'parceiro'));

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
$function$;

delete from supabase_migrations.schema_migrations where name = 'efrete_ciot_operacao';
