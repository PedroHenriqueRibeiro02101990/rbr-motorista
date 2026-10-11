-- Tarefa 1 (11/10/2026): cadastro do parceiro que recebe o frete (pessoa titular).
-- tipo_parceiro: tac_pf (TAC pessoa física), mei_caminhoneiro, etc (Empresa de Transporte de Cargas).
-- ETC com até 3 veículos no RNTRC é equiparada a TAC (a RBR gera o CIOT); ETC com mais de 3 gera o próprio CIOT.
-- O CNPJ usa a coluna pessoas.cnpj que já existe.

alter table public.pessoas
  add column if not exists tipo_parceiro text,
  add column if not exists qtd_veiculos_rntrc integer,
  add column if not exists opcao_inss_direto boolean not null default false,
  add column if not exists data_comunicacao_inss_direto date;

alter table public.pessoas drop constraint if exists pessoas_tipo_parceiro_chk;
alter table public.pessoas add constraint pessoas_tipo_parceiro_chk
  check (tipo_parceiro is null or tipo_parceiro in ('tac_pf', 'mei_caminhoneiro', 'etc'));

alter table public.pessoas drop constraint if exists pessoas_qtd_veiculos_rntrc_chk;
alter table public.pessoas add constraint pessoas_qtd_veiculos_rntrc_chk
  check (qtd_veiculos_rntrc is null or (tipo_parceiro = 'etc' and qtd_veiculos_rntrc >= 0));

-- Classificação derivada (não editável): quem gera o CIOT.
alter table public.pessoas add column if not exists classificacao_ciot text generated always as (
  case
    when tipo_parceiro in ('tac_pf', 'mei_caminhoneiro') then 'tac'
    when tipo_parceiro = 'etc' and qtd_veiculos_rntrc is null then 'etc_frota_nao_informada'
    when tipo_parceiro = 'etc' and qtd_veiculos_rntrc <= 3 then 'etc_equiparada_tac'
    when tipo_parceiro = 'etc' then 'etc_ciot_proprio'
  end
) stored;

comment on column public.pessoas.tipo_parceiro is 'tac_pf | mei_caminhoneiro | etc. Define CIOT e retenção de INSS.';
comment on column public.pessoas.qtd_veiculos_rntrc is 'Só ETC: veículos no RNTRC. <= 3 equiparada a TAC; > 3 gera o próprio CIOT.';
comment on column public.pessoas.opcao_inss_direto is 'TAC PF comunicou que recolhe o INSS por conta própria (dispensa a retenção quando há data da comunicação).';
comment on column public.pessoas.classificacao_ciot is 'Derivada: tac | etc_equiparada_tac | etc_ciot_proprio | etc_frota_nao_informada.';

-- Só o gestor (ou o backend) muda esses campos: eles decidem CIOT e retenção de INSS.
create or replace function public.proteger_campos_parceiro()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_papel()::text, '') = 'gestor_rbr' or eh_backend() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.tipo_parceiro is not null or new.qtd_veiculos_rntrc is not null or new.opcao_inss_direto or new.data_comunicacao_inss_direto is not null then
      raise exception 'Só o gestor da RBR define o tipo do parceiro e a opção de INSS.';
    end if;
  elsif new.tipo_parceiro is distinct from old.tipo_parceiro
     or new.qtd_veiculos_rntrc is distinct from old.qtd_veiculos_rntrc
     or new.opcao_inss_direto is distinct from old.opcao_inss_direto
     or new.data_comunicacao_inss_direto is distinct from old.data_comunicacao_inss_direto then
    raise exception 'Só o gestor da RBR altera o tipo do parceiro e a opção de INSS.';
  end if;
  return new;
end;
$$;
revoke all on function public.proteger_campos_parceiro() from public, anon;

drop trigger if exists trg_proteger_campos_parceiro on public.pessoas;
create trigger trg_proteger_campos_parceiro
  before insert or update on public.pessoas
  for each row execute function public.proteger_campos_parceiro();
