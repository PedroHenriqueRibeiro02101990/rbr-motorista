-- Tarefa 5 (11/10/2026): alertas legais do CIOT e do frete (Portaria SUROC 6/2026 e Lei 15.485/2026).
-- (a) Piso mínimo por operação (digitado à mão por enquanto): aviso antes da proposta ao motorista e antes do CIOT;
--     bloqueia o registro de CIOT gerado pela RBR quando o frete pago ao parceiro está abaixo do piso.
-- (b) Prazos: cancelar o CIOT só até 24 h antes do início; encerrar até 5 dias após o fim previsto; pagar o frete ao
--     parceiro em até 30 dias úteis (ciot_prazo_pagamento), com alerta antes de vencer.
-- (c) Troca de veículo depois do CIOT emitido = nova operação de CIOT (marca o CIOT para refazer e avisa).

alter table public.operacoes add column if not exists piso_minimo_valor numeric(14,2);
comment on column public.operacoes.piso_minimo_valor is 'Piso mínimo do frete (lotação) para esta operação; preenchido à mão por enquanto.';

alter table public.operacao_ciot_vpo
  add column if not exists ciot_prazo_pagamento date,
  add column if not exists ciot_cancelado_em timestamptz,
  add column if not exists ciot_encerrado_em timestamptz;
comment on column public.operacao_ciot_vpo.ciot_prazo_pagamento is 'Data limite para pagar o frete ao parceiro: 30 dias úteis após o fim previsto (editável).';

insert into public.parametros_sistema (chave, valor, descricao) values (
  'alertas_ciot',
  jsonb_build_object('dias_uteis_pagamento', 30, 'dias_aviso_pagamento', 5, 'horas_cancelamento', 24, 'dias_encerramento', 5),
  'Prazos do CIOT (Portaria SUROC 6/2026 / Lei 15.485/2026) e antecedência do alerta de pagamento.'
) on conflict (chave) do nothing;

create or replace function public.somar_dias_uteis(p_data date, p_dias integer)
returns date
language plpgsql
stable
set search_path = public
as $$
declare
  d date := p_data;
  n integer := 0;
begin
  if p_data is null then
    return null;
  end if;
  while n < p_dias loop
    d := d + 1;
    if eh_dia_util(d) then
      n := n + 1;
    end if;
  end loop;
  return d;
end;
$$;
revoke all on function public.somar_dias_uteis(date, integer) from public, anon;
grant execute on function public.somar_dias_uteis(date, integer) to authenticated, service_role;

-- Frete do parceiro x piso da operação.
create or replace function public.checar_piso_operacao(p_operacao uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'piso', o.piso_minimo_valor,
    'frete', c.valor_total_contrato,
    'abaixo', o.piso_minimo_valor is not null and c.valor_total_contrato is not null and c.valor_total_contrato < o.piso_minimo_valor
  )
  from operacoes o
  left join condicoes_pagamento_operacao c on c.operacao_id = o.id
  where o.id = p_operacao
$$;
revoke all on function public.checar_piso_operacao(uuid) from public, anon;
grant execute on function public.checar_piso_operacao(uuid) to authenticated, service_role;

create or replace function public.regras_prazo_ciot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_par jsonb := coalesce((select valor from parametros_sistema where chave = 'alertas_ciot'), '{}'::jsonb);
  v_piso jsonb;
  v_horas integer := coalesce((v_par->>'horas_cancelamento')::int, 24);
begin
  -- (a) piso: não registra CIOT da RBR com frete abaixo do piso
  if new.ciot is not null and btrim(new.ciot) <> '' and coalesce(new.ciot_origem, ciot_origem_esperada(new.operacao_id)) = 'rbr_repom'
     and (tg_op = 'INSERT' or new.ciot is distinct from old.ciot) then
    v_piso := checar_piso_operacao(new.operacao_id);
    if (v_piso->>'abaixo')::boolean then
      raise exception 'Frete pago ao parceiro (R$ %) abaixo do piso mínimo (R$ %): ajuste o frete antes de gerar o CIOT.',
        brl_txt((v_piso->>'frete')::numeric), brl_txt((v_piso->>'piso')::numeric);
    end if;
  end if;
  -- (b) prazo de pagamento: 30 dias úteis após o fim previsto (se o gestor não definiu outro)
  if new.ciot_prazo_pagamento is null and new.ciot_fim_previsto is not null then
    new.ciot_prazo_pagamento := somar_dias_uteis((new.ciot_fim_previsto at time zone 'America/Sao_Paulo')::date,
                                                 coalesce((v_par->>'dias_uteis_pagamento')::int, 30));
  end if;
  -- (b) cancelamento só até 24 h antes do início
  if new.ciot_status = 'cancelado' and (tg_op = 'INSERT' or old.ciot_status is distinct from 'cancelado') then
    if new.ciot_inicio_previsto is not null and now() > new.ciot_inicio_previsto - make_interval(hours => v_horas) then
      raise exception 'O CIOT só pode ser cancelado até % h antes do início previsto (%). Depois disso, encerre o CIOT.',
        v_horas, to_char(new.ciot_inicio_previsto at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI');
    end if;
    new.ciot_cancelado_em := coalesce(new.ciot_cancelado_em, now());
  end if;
  if new.ciot_status = 'encerrado' and (tg_op = 'INSERT' or old.ciot_status is distinct from 'encerrado') then
    new.ciot_encerrado_em := coalesce(new.ciot_encerrado_em, now());
  end if;
  return new;
end;
$$;
revoke all on function public.regras_prazo_ciot() from public, anon;

-- (não depende da ordem em relação ao trigger da Tarefa 2: calcula a origem esperada quando ela ainda está vazia)
drop trigger if exists trg_regras_prazo_ciot on public.operacao_ciot_vpo;
create trigger trg_regras_prazo_ciot
  before insert or update on public.operacao_ciot_vpo
  for each row execute function public.regras_prazo_ciot();

-- (c) troca de veículo com CIOT emitido: o CIOT vale para o veículo; trocar exige nova operação de CIOT.
create or replace function public.ciot_troca_veiculo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.veiculo_id is not null and new.veiculo_id is distinct from old.veiculo_id then
    update operacao_ciot_vpo
       set ciot_status = 'refazer_troca_veiculo', updated_at = now()
     where operacao_id = new.id and ciot is not null and btrim(ciot) <> '' and ciot_status in ('emitido', 'pendente');
    if found then
      insert into auditoria_log (acao, entidade, entidade_id, dado_antes, dado_depois, papel, pessoa_id_ator)
      values ('ciot_troca_veiculo', 'operacoes', new.id::text, jsonb_build_object('veiculo_id', old.veiculo_id),
              jsonb_build_object('veiculo_id', new.veiculo_id, 'aviso', 'Troca de veículo = nova operação de CIOT'),
              current_papel()::text, current_pessoa_id());
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.ciot_troca_veiculo() from public, anon;

drop trigger if exists trg_ciot_troca_veiculo on public.operacoes;
create trigger trg_ciot_troca_veiculo
  after update of veiculo_id on public.operacoes
  for each row execute function public.ciot_troca_veiculo();

-- Prazos e alertas por operação (linha do tempo + painel do gestor).
create or replace view public.v_alertas_ciot
with (security_invoker = on) as
with par as (
  select coalesce((select valor from public.parametros_sistema where chave = 'alertas_ciot'), '{}'::jsonb) as v
), base as (
  select c.operacao_id, c.ciot, c.ciot_status, c.ciot_inicio_previsto, c.ciot_fim_previsto, c.ciot_prazo_pagamento,
         o.status as status_operacao, o.piso_minimo_valor, cp.valor_total_contrato,
         c.ciot_inicio_previsto - make_interval(hours => coalesce((par.v->>'horas_cancelamento')::int, 24)) as limite_cancelamento,
         c.ciot_fim_previsto + make_interval(days => coalesce((par.v->>'dias_encerramento')::int, 5)) as limite_encerramento,
         coalesce((par.v->>'dias_aviso_pagamento')::int, 5) as dias_aviso,
         exists (
           select 1 from public.lancamentos_financeiros l
           join public.categorias_financeiras cf on cf.id = l.categoria_id and cf.codigo = 'frete_motorista'
           where l.operacao_id = c.operacao_id and l.tipo = 'despesa' and l.status <> 'cancelado' and l.status <> 'pago'
         ) as frete_em_aberto
  from public.operacao_ciot_vpo c
  join public.operacoes o on o.id = c.operacao_id
  left join public.condicoes_pagamento_operacao cp on cp.operacao_id = c.operacao_id
  cross join par
  where o.status <> 'cancelada'
)
select operacao_id, 'troca_veiculo'::text as codigo, 'bloqueia'::text as gravidade, null::timestamptz as limite,
       'Veículo trocado depois do CIOT: faça uma nova operação de CIOT para o veículo novo.'::text as mensagem
  from base where ciot_status = 'refazer_troca_veiculo'
union all
select operacao_id, 'piso', 'bloqueia', null,
       format('Frete do parceiro (R$ %s) abaixo do piso mínimo (R$ %s).', public.brl_txt(valor_total_contrato), public.brl_txt(piso_minimo_valor))
  from base where piso_minimo_valor is not null and valor_total_contrato < piso_minimo_valor
union all
select operacao_id, 'cancelamento', 'atencao', limite_cancelamento,
       format('Cancelar o CIOT só até %s (24 h antes do início).', to_char(limite_cancelamento at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'))
  from base where ciot_status = 'emitido' and limite_cancelamento > now() and limite_cancelamento < now() + interval '48 hours'
union all
select operacao_id, 'encerramento', case when now() > limite_encerramento then 'bloqueia' else 'atencao' end, limite_encerramento,
       format('Encerrar o CIOT até %s (5 dias após o fim previsto).', to_char(limite_encerramento at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'))
  from base where ciot_status = 'emitido' and ciot_fim_previsto < now()
union all
select operacao_id, 'pagamento', case when ciot_prazo_pagamento < current_date then 'bloqueia' else 'atencao' end, ciot_prazo_pagamento::timestamptz,
       format('Pagar o frete ao parceiro até %s (30 dias úteis).', to_char(ciot_prazo_pagamento, 'DD/MM/YYYY'))
  from base where ciot_prazo_pagamento is not null and frete_em_aberto and ciot_prazo_pagamento <= current_date + dias_aviso;
grant select on public.v_alertas_ciot to authenticated, service_role;
