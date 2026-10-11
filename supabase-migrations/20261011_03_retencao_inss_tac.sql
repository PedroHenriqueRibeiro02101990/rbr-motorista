-- Tarefa 3 (11/10/2026): retenção de INSS no pagamento ao TAC pessoa física (não depende da nota).
-- INSS retido = aliquota (11%) x base; base = 20% do FRETE bruto (o VPO/pedágio não entra), limitada ao teto do
-- salário de contribuição no mês (somando as outras operações do mesmo parceiro na competência).
-- SEST/SENAT e IRRF ficam DESLIGADOS (só aviso "a confirmar"). ISS e regra para parceiro com CNPJ não são calculados.

insert into public.parametros_sistema (chave, valor, descricao) values (
  'retencoes_parceiro',
  jsonb_build_object(
    'inss_aliquota_retencao', 0.11,
    'inss_base_frete', 0.20,
    'inss_teto_salario_contribuicao', null,
    'sest_senat_ativo', false,
    'sest_senat_aliquota', null,
    'irrf_ativo', false
  ),
  'Retenções no pagamento ao parceiro TAC PF. Teto do salário de contribuição: preencher (R$/mês). SEST/SENAT e IRRF desligados até confirmação do contador.'
) on conflict (chave) do nothing;

alter table public.condicoes_pagamento_operacao
  add column if not exists parceiro_id uuid references public.pessoas(id),
  add column if not exists frete_bruto numeric(14,2),
  add column if not exists inss_aliquota numeric(6,4),
  add column if not exists inss_base numeric(14,2),
  add column if not exists inss_retido numeric(14,2) not null default 0,
  add column if not exists valor_liquido numeric(14,2),
  add column if not exists retencao_aplica boolean not null default false,
  add column if not exists retencao_motivo text,
  add column if not exists retencao_avisos jsonb not null default '[]'::jsonb,
  add column if not exists inss_competencia date,
  add column if not exists inss_vencimento_recolhimento date,
  add column if not exists retencao_calculada_em timestamptz;

comment on column public.condicoes_pagamento_operacao.inss_retido is 'INSS retido do TAC PF nesta operação (relatório mensal de recolhimento, vence dia 20 do mês seguinte).';

-- Valor em reais no formato brasileiro (independe do lc_numeric do servidor): 1234.5 -> '1.234,50'.
create or replace function public.brl_txt(p numeric)
returns text
language sql
immutable
as $$
  with t as (select to_char(round(coalesce(p, 0), 2), 'FM999999999990.00') as v)
  select regexp_replace(split_part(v, '.', 1), '(\d)(?=(\d{3})+$)', '\1.', 'g') || ',' || split_part(v, '.', 2) from t
$$;

-- Cálculo (também usado pela tela como prévia, antes de salvar). p_frete = frete bruto pago ao parceiro (sem VPO).
create or replace function public.calcular_retencao_inss(p_operacao uuid, p_frete numeric)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_par jsonb := coalesce((select valor from parametros_sistema where chave = 'retencoes_parceiro'), '{}'::jsonb);
  v_aliq numeric := coalesce((v_par->>'inss_aliquota_retencao')::numeric, 0.11);
  v_pct_base numeric := coalesce((v_par->>'inss_base_frete')::numeric, 0.20);
  v_teto numeric := nullif(v_par->>'inss_teto_salario_contribuicao', '')::numeric;
  v_parceiro uuid := titular_da_operacao(p_operacao);
  p record;
  v_comp date;
  v_base numeric := 0;
  v_base_outras numeric := 0;
  v_retido numeric := 0;
  v_aplica boolean := false;
  v_motivo text;
  v_avisos jsonb := '[]'::jsonb;
  v_frete numeric := round(coalesce(p_frete, 0), 2);
begin
  select date_trunc('month', coalesce(o.entregue_em, now()))::date into v_comp from operacoes o where o.id = p_operacao;
  v_comp := coalesce(v_comp, date_trunc('month', now())::date);

  if not coalesce((v_par->>'irrf_ativo')::boolean, false) then
    v_avisos := v_avisos || to_jsonb('IRRF a confirmar (não calculado).'::text);
  end if;
  if not coalesce((v_par->>'sest_senat_ativo')::boolean, false) then
    v_avisos := v_avisos || to_jsonb('SEST/SENAT desligado (a confirmar com o contador).'::text);
  end if;

  select * into p from pessoas where id = v_parceiro;
  if v_parceiro is null or p.id is null then
    v_motivo := 'Parceiro ainda não identificado (aloque veículo e motorista). Retenção não calculada.';
  elsif p.tipo_parceiro is null then
    v_motivo := 'Tipo do parceiro não informado no cadastro (TAC, MEI ou ETC). Classifique para calcular a retenção.';
    v_avisos := v_avisos || to_jsonb('Sem o tipo do parceiro a RBR pode deixar de reter INSS devido.'::text);
  elsif p.tipo_parceiro = 'tac_pf' and p.opcao_inss_direto and p.data_comunicacao_inss_direto is not null then
    v_motivo := format('Dispensa: o parceiro comunicou em %s que recolhe o INSS por conta própria.', to_char(p.data_comunicacao_inss_direto, 'DD/MM/YYYY'));
  elsif p.tipo_parceiro = 'tac_pf' then
    v_aplica := true;
    v_motivo := format('TAC pessoa física: retenção de %s%% sobre %s%% do frete bruto (o VPO não entra).',
                       trim_scale(v_aliq * 100), trim_scale(v_pct_base * 100));
    if p.opcao_inss_direto then
      v_avisos := v_avisos || to_jsonb('O parceiro marcou que recolhe direto, mas falta a data da comunicação: a retenção continua.'::text);
    end if;
  elsif p.tipo_parceiro = 'mei_caminhoneiro' then
    v_motivo := 'MEI Caminhoneiro: sem retenção por padrão (regra a confirmar com o contador).';
  else
    v_motivo := 'ETC (pessoa jurídica): sem retenção por padrão (regra a confirmar com o contador).';
  end if;

  if v_aplica then
    v_base := round(v_frete * v_pct_base, 2);
    if v_teto is null then
      v_avisos := v_avisos || to_jsonb('Teto do salário de contribuição não configurado: retenção calculada sem limite.'::text);
    else
      select coalesce(sum(c.inss_base), 0) into v_base_outras
        from condicoes_pagamento_operacao c
       where c.parceiro_id = v_parceiro and c.inss_competencia = v_comp and c.operacao_id <> p_operacao and c.retencao_aplica;
      if v_base > greatest(v_teto - v_base_outras, 0) then
        v_base := greatest(v_teto - v_base_outras, 0);
        v_avisos := v_avisos || to_jsonb(format('Base limitada pelo teto do mês (R$ %s; já usado em outras operações: R$ %s).',
                                                brl_txt(v_teto), brl_txt(v_base_outras))::text);
      end if;
    end if;
    v_retido := round(v_base * v_aliq, 2);
  end if;

  return jsonb_build_object(
    'parceiro_id', v_parceiro,
    'frete_bruto', v_frete,
    'aplica', v_aplica,
    'aliquota', case when v_aplica then v_aliq end,
    'base', case when v_aplica then v_base end,
    'inss_retido', v_retido,
    'valor_liquido', v_frete - v_retido,
    'motivo', v_motivo,
    'avisos', v_avisos,
    'competencia', v_comp,
    'vencimento_recolhimento', (v_comp + interval '1 month' + interval '19 days')::date
  );
end;
$$;
revoke all on function public.calcular_retencao_inss(uuid, numeric) from public, anon;
grant execute on function public.calcular_retencao_inss(uuid, numeric) to authenticated, service_role;

-- Grava o cálculo na condição de pagamento sempre que ela é criada/alterada.
create or replace function public.aplicar_retencao_inss()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb := calcular_retencao_inss(new.operacao_id, new.valor_total_contrato);
begin
  new.parceiro_id := (r->>'parceiro_id')::uuid;
  new.frete_bruto := (r->>'frete_bruto')::numeric;
  new.retencao_aplica := (r->>'aplica')::boolean;
  new.inss_aliquota := (r->>'aliquota')::numeric;
  new.inss_base := (r->>'base')::numeric;
  new.inss_retido := (r->>'inss_retido')::numeric;
  new.valor_liquido := (r->>'valor_liquido')::numeric;
  new.retencao_motivo := r->>'motivo';
  new.retencao_avisos := r->'avisos';
  new.inss_competencia := (r->>'competencia')::date;
  new.inss_vencimento_recolhimento := (r->>'vencimento_recolhimento')::date;
  new.retencao_calculada_em := now();
  return new;
end;
$$;
revoke all on function public.aplicar_retencao_inss() from public, anon;

drop trigger if exists trg_aplicar_retencao_inss on public.condicoes_pagamento_operacao;
create trigger trg_aplicar_retencao_inss
  before insert or update on public.condicoes_pagamento_operacao
  for each row execute function public.aplicar_retencao_inss();

-- Relatório mensal de recolhimento (vence dia 20 do mês seguinte à competência).
create or replace view public.v_inss_retido_mensal
with (security_invoker = on) as
select
  c.inss_competencia as competencia,
  c.inss_vencimento_recolhimento as vencimento,
  c.parceiro_id,
  p.nome as parceiro_nome,
  p.cpf as parceiro_cpf,
  count(*) as operacoes,
  sum(c.frete_bruto) as frete_bruto,
  sum(c.inss_base) as base,
  sum(c.inss_retido) as inss_retido,
  array_agg(c.operacao_id order by c.operacao_id) as operacao_ids
from public.condicoes_pagamento_operacao c
join public.pessoas p on p.id = c.parceiro_id
where c.retencao_aplica and c.inss_retido > 0
group by c.inss_competencia, c.inss_vencimento_recolhimento, c.parceiro_id, p.nome, p.cpf;
grant select on public.v_inss_retido_mensal to authenticated, service_role;
