-- Financeiro completo — parte 1: cadastros-base (contas, plano de contas, regras de prazo, feriados)

create table if not exists contas_bancarias (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null default 'corrente' check (tipo in ('corrente','poupanca','caixa','aplicacao','cartao','outro')),
  banco_codigo text,
  banco_nome text,
  agencia text,
  conta text,
  saldo_inicial numeric(14,2) not null default 0,
  saldo_inicial_em date not null default current_date,
  padrao boolean not null default false,
  ativa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists contas_bancarias_uma_padrao on contas_bancarias (padrao) where padrao;

create table if not exists categorias_financeiras (
  id uuid primary key default gen_random_uuid(),
  codigo text unique,
  nome text not null,
  tipo text not null check (tipo in ('receita','despesa')),
  grupo text not null check (grupo in ('receita_operacional','outras_receitas','receita_financeira','deducoes','custo_operacional',
                                        'despesa_administrativa','despesa_comercial','despesa_pessoal','despesa_financeira',
                                        'investimento','retirada_socios','emprestimo')),
  tributavel boolean not null default false,
  sistema boolean not null default false,
  ativa boolean not null default true,
  ordem int not null default 100,
  created_at timestamptz not null default now()
);

insert into categorias_financeiras (codigo, nome, tipo, grupo, tributavel, sistema, ordem) values
  ('receita_frete',        'Receita de frete',                 'receita','receita_operacional', true,  true, 10),
  ('receita_assinatura',   'Assinaturas do app (motoristas)',  'receita','receita_operacional', false, true, 11),
  ('receita_servicos',     'Outros serviços prestados',        'receita','receita_operacional', true,  false, 12),
  ('receita_reembolso',    'Reembolsos recebidos',             'receita','outras_receitas',     false, false, 13),
  ('outras_receitas',      'Outras receitas',                  'receita','outras_receitas',     false, false, 14),
  ('rendimentos',          'Rendimentos de aplicação',         'receita','receita_financeira',  false, false, 15),
  ('aporte_socios',        'Aporte dos sócios',                'receita','emprestimo',          false, false, 16),
  ('emprestimo_recebido',  'Empréstimo recebido',              'receita','emprestimo',          false, false, 17),
  ('impostos_faturamento', 'Impostos sobre faturamento (DAS/Simples)','despesa','deducoes',      false, true, 20),
  ('frete_motorista',      'Frete pago ao motorista',          'despesa','custo_operacional',   false, true, 30),
  ('pedagio',              'Pedágio (vale-pedágio)',           'despesa','custo_operacional',   false, true, 31),
  ('seguro_carga',         'Seguro da carga (averbação/TAG)',  'despesa','custo_operacional',   false, true, 32),
  ('gr',                   'Gerenciamento de risco (GR)',      'despesa','custo_operacional',   false, true, 33),
  ('rastreamento',         'Rastreamento por satélite',        'despesa','custo_operacional',   false, true, 34),
  ('escolta',              'Escolta',                          'despesa','custo_operacional',   false, true, 35),
  ('aet_taxas',            'AET e taxas de órgãos',            'despesa','custo_operacional',   false, true, 36),
  ('balsa',                'Balsa / travessia',                'despesa','custo_operacional',   false, true, 37),
  ('carga_descarga',       'Carga, descarga e içamento',       'despesa','custo_operacional',   false, true, 38),
  ('emissao_documentos',   'Emissão de documentos (assessoria)','despesa','custo_operacional',  false, false, 39),
  ('outros_custos_op',     'Outros custos da operação',        'despesa','custo_operacional',   false, true, 40),
  ('contabilidade',        'Contabilidade',                    'despesa','despesa_administrativa', false, false, 50),
  ('sistemas_software',    'Sistemas e softwares',             'despesa','despesa_administrativa', false, false, 51),
  ('aluguel',              'Aluguel e condomínio',             'despesa','despesa_administrativa', false, false, 52),
  ('telefonia_internet',   'Telefone e internet',              'despesa','despesa_administrativa', false, false, 53),
  ('servicos_terceiros',   'Serviços de terceiros',            'despesa','despesa_administrativa', false, false, 54),
  ('material_escritorio',  'Material e escritório',            'despesa','despesa_administrativa', false, false, 55),
  ('taxas_licencas',       'Taxas, licenças e ANTT',           'despesa','despesa_administrativa', false, false, 56),
  ('outras_despesas_adm',  'Outras despesas administrativas',  'despesa','despesa_administrativa', false, false, 57),
  ('marketing_ads',        'Marketing e anúncios (Google Ads)','despesa','despesa_comercial',      false, false, 60),
  ('comissoes',            'Comissões',                        'despesa','despesa_comercial',      false, false, 61),
  ('salarios',             'Salários e encargos',              'despesa','despesa_pessoal',        false, false, 70),
  ('pro_labore',           'Pró-labore',                       'despesa','despesa_pessoal',        false, false, 71),
  ('tarifas_bancarias',    'Tarifas bancárias',                'despesa','despesa_financeira',     false, false, 80),
  ('juros_multas',         'Juros e multas pagos',             'despesa','despesa_financeira',     false, false, 81),
  ('investimentos',        'Investimentos (equipamentos, etc.)','despesa','investimento',          false, false, 90),
  ('distribuicao_lucros',  'Distribuição de lucros',           'despesa','retirada_socios',        false, false, 95),
  ('emprestimo_pago',      'Pagamento de empréstimo',          'despesa','emprestimo',             false, false, 96)
on conflict (codigo) do nothing;

alter table tipos_custo_adicional add column if not exists categoria_id uuid references categorias_financeiras(id);
update tipos_custo_adicional t set categoria_id = c.id
from categorias_financeiras c
where t.categoria_id is null and c.codigo = case t.codigo
  when 'rastreamento_satelite' then 'rastreamento'
  when 'aet_teaet' then 'aet_taxas' when 'aet_tuv' then 'aet_taxas' when 'engenheiro_art' then 'aet_taxas'
  when 'escolta' then 'escolta' when 'escolta_armada' then 'escolta'
  when 'equipamento_icamento' then 'carga_descarga' when 'carga_descarga' then 'carga_descarga'
  when 'balsa' then 'balsa' when 'gr_pesquisa' then 'gr'
  when 'adicional_perigosa' then 'frete_motorista' when 'retorno_vazio' then 'frete_motorista'
  when 'isca_lacre' then 'gr'
  else 'outros_custos_op' end;

-- Regras de prazo: cadastráveis, usadas em cotações (receber), fornecedores e lançamentos (pagar)
create table if not exists condicoes_prazo (
  id uuid primary key default gen_random_uuid(),
  codigo text unique,
  nome text not null,
  descricao text,
  aplica_a text not null default 'ambos' check (aplica_a in ('receber','pagar','ambos')),
  base text not null default 'entrega' check (base in ('aprovacao','liberacao','coleta','entrega','emissao')),
  modo text not null default 'dias' check (modo in ('dias','fechamento_mensal')),
  dia_fixo int check (dia_fixo between 1 and 31),
  parcelas jsonb not null default '[{"dias":0,"percentual":100}]'::jsonb,
  ajustar_dia_util boolean not null default true,
  forma_padrao text check (forma_padrao in ('pix','boleto','transferencia','dinheiro','cartao','debito_automatico','outro')),
  padrao_receber boolean not null default false,
  padrao_pagar boolean not null default false,
  ativa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint condicoes_prazo_fechamento_dia check (modo <> 'fechamento_mensal' or dia_fixo is not null),
  constraint condicoes_prazo_parcelas_array check (jsonb_typeof(parcelas) = 'array' and jsonb_array_length(parcelas) between 1 and 24)
);
create unique index if not exists condicoes_prazo_um_padrao_receber on condicoes_prazo (padrao_receber) where padrao_receber;
create unique index if not exists condicoes_prazo_um_padrao_pagar on condicoes_prazo (padrao_pagar) where padrao_pagar;

-- Valida parcelas: percentuais somam 100, dias >= 0
create or replace function trg_fn_condicao_prazo_valida() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare v_soma numeric; v_ruim int;
begin
  select coalesce(sum((p->>'percentual')::numeric),0), count(*) filter (where coalesce((p->>'dias')::int, -1) < 0 or coalesce((p->>'percentual')::numeric,0) <= 0)
    into v_soma, v_ruim from jsonb_array_elements(new.parcelas) p;
  if v_ruim > 0 then raise exception 'Cada parcela precisa de dias (0 ou mais) e percentual maior que zero.'; end if;
  if abs(v_soma - 100) > 0.01 then raise exception 'Os percentuais das parcelas somam % %%, precisam somar 100%%.', round(v_soma,2); end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_condicao_prazo_valida on condicoes_prazo;
create trigger trg_condicao_prazo_valida before insert or update on condicoes_prazo for each row execute function trg_fn_condicao_prazo_valida();

insert into condicoes_prazo (codigo, nome, descricao, aplica_a, base, modo, dia_fixo, parcelas, forma_padrao, padrao_receber, padrao_pagar) values
  ('avista_aprovacao', 'À vista (antes da coleta)', 'Cliente paga ao aprovar a cotação', 'receber', 'aprovacao', 'dias', null, '[{"dias":0,"percentual":100}]', 'pix', false, false),
  ('entrega_0',  'Na entrega',              'Vence no dia da entrega',          'ambos',  'entrega', 'dias', null, '[{"dias":0,"percentual":100}]', 'pix', false, false),
  ('entrega_7',  '7 dias após a entrega',   null,                                'ambos',  'entrega', 'dias', null, '[{"dias":7,"percentual":100}]', 'boleto', false, false),
  ('entrega_15', '15 dias após a entrega',  null,                                'ambos',  'entrega', 'dias', null, '[{"dias":15,"percentual":100}]', 'boleto', false, false),
  ('entrega_30', '30 dias após a entrega',  null,                                'ambos',  'entrega', 'dias', null, '[{"dias":30,"percentual":100}]', 'boleto', true, false),
  ('entrega_30_60', '30/60 dias após a entrega', 'Duas parcelas iguais',          'ambos',  'entrega', 'dias', null, '[{"dias":30,"percentual":50},{"dias":60,"percentual":50}]', 'boleto', false, false),
  ('coleta_50_entrega_50', '50% na coleta + 50% na entrega', null,               'receber','coleta',  'dias', null, '[{"dias":0,"percentual":50},{"dias":0,"percentual":50}]', 'pix', false, false),
  ('fechamento_dia10', 'Fechamento mensal — vence dia 10 do mês seguinte', 'Tudo que foi entregue no mês vence no dia 10 do mês seguinte', 'ambos', 'entrega', 'fechamento_mensal', 10, '[{"dias":1,"percentual":100}]', 'boleto', false, false),
  ('avista_liberacao', 'À vista na liberação da carga', 'Paga quando a carga é liberada para coleta', 'pagar', 'liberacao', 'dias', null, '[{"dias":0,"percentual":100}]', 'pix', false, true),
  ('seguradora_mensal', 'Fatura mensal da seguradora — dia 10', 'Averbações do mês cobradas no dia 10 do mês seguinte', 'pagar', 'liberacao', 'fechamento_mensal', 10, '[{"dias":1,"percentual":100}]', 'boleto', false, false),
  ('das_dia20', 'Imposto (DAS) — dia 20 do mês seguinte', 'Usado pelo cálculo automático do Simples', 'pagar', 'emissao', 'fechamento_mensal', 20, '[{"dias":1,"percentual":100}]', 'boleto', false, false)
on conflict (codigo) do nothing;

create table if not exists feriados (
  data date primary key,
  nome text not null
);
insert into feriados (data, nome) values
 ('2026-01-01','Confraternização Universal'),('2026-02-16','Carnaval'),('2026-02-17','Carnaval'),('2026-04-03','Sexta-feira Santa'),
 ('2026-04-21','Tiradentes'),('2026-05-01','Dia do Trabalho'),('2026-06-04','Corpus Christi'),('2026-09-07','Independência'),
 ('2026-10-12','Nossa Senhora Aparecida'),('2026-11-02','Finados'),('2026-11-15','Proclamação da República'),('2026-11-20','Consciência Negra'),
 ('2026-12-25','Natal'),
 ('2027-01-01','Confraternização Universal'),('2027-02-08','Carnaval'),('2027-02-09','Carnaval'),('2027-03-26','Sexta-feira Santa'),
 ('2027-04-21','Tiradentes'),('2027-05-01','Dia do Trabalho'),('2027-05-27','Corpus Christi'),('2027-09-07','Independência'),
 ('2027-10-12','Nossa Senhora Aparecida'),('2027-11-02','Finados'),('2027-11-15','Proclamação da República'),('2027-11-20','Consciência Negra'),
 ('2027-12-25','Natal')
on conflict (data) do nothing;

create or replace function proximo_dia_util(p date) returns date
language plpgsql stable set search_path = public, pg_temp as $$
declare d date := p;
begin
  if d is null then return null; end if;
  for i in 1..15 loop
    exit when extract(isodow from d) < 6 and not exists (select 1 from feriados where data = d);
    d := d + 1;
  end loop;
  return d;
end $$;

-- Gera vencimentos a partir de uma regra (ou regra personalizada em jsonb) e uma data-base
create or replace function calcular_vencimentos(p_regra jsonb, p_data_base date, p_total numeric)
returns table (parcela int, total_parcelas int, vencimento date, valor numeric)
language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_modo text := coalesce(p_regra->>'modo','dias');
  v_dia int := nullif(p_regra->>'dia_fixo','')::int;
  v_ajusta boolean := coalesce((p_regra->>'ajustar_dia_util')::boolean, true);
  v_parc jsonb := coalesce(p_regra->'parcelas', '[{"dias":0,"percentual":100}]'::jsonb);
  v_n int := jsonb_array_length(v_parc);
  v_acum numeric := 0;
  v_venc date; v_val numeric; v_mes date; p jsonb; i int := 0;
begin
  for p in select * from jsonb_array_elements(v_parc) loop
    i := i + 1;
    if v_modo = 'fechamento_mensal' then
      v_mes := (date_trunc('month', p_data_base) + make_interval(months => coalesce((p->>'dias')::int, 1)))::date;
      v_venc := v_mes + (least(coalesce(v_dia,10), extract(day from (v_mes + interval '1 month' - interval '1 day'))::int) - 1);
    else
      v_venc := p_data_base + coalesce((p->>'dias')::int, 0);
    end if;
    if v_ajusta then v_venc := proximo_dia_util(v_venc); end if;
    if i = v_n then v_val := round(p_total - v_acum, 2);
    else v_val := round(p_total * (p->>'percentual')::numeric / 100, 2); end if;
    v_acum := v_acum + v_val;
    parcela := i; total_parcelas := v_n; vencimento := v_venc; valor := v_val;
    return next;
  end loop;
end $$;

-- Fornecedores / pessoas / cotações: campos financeiros
alter table fornecedores
  add column if not exists condicao_prazo_id uuid references condicoes_prazo(id),
  add column if not exists categoria_id uuid references categorias_financeiras(id),
  add column if not exists banco_codigo text,
  add column if not exists banco_agencia text,
  add column if not exists banco_conta text,
  add column if not exists banco_tipo_conta text,
  add column if not exists dados_bancarios_alterados_em timestamptz;
alter table pessoas add column if not exists dados_bancarios_alterados_em timestamptz;

create or replace function trg_fn_marca_dados_bancarios_alterados() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and (
       old.pix is distinct from new.pix or old.banco_codigo is distinct from new.banco_codigo
    or old.banco_agencia is distinct from new.banco_agencia or old.banco_conta is distinct from new.banco_conta) then
    new.dados_bancarios_alterados_em := now();
  end if;
  return new;
end $$;
drop trigger if exists trg_fornecedor_dados_bancarios on fornecedores;
create trigger trg_fornecedor_dados_bancarios before update on fornecedores for each row execute function trg_fn_marca_dados_bancarios_alterados();
drop trigger if exists trg_pessoa_dados_bancarios on pessoas;
create trigger trg_pessoa_dados_bancarios before update on pessoas for each row execute function trg_fn_marca_dados_bancarios_alterados();

alter table cotacoes
  add column if not exists condicao_prazo_id uuid references condicoes_prazo(id),
  add column if not exists prazo_personalizado jsonb,
  add column if not exists forma_recebimento text default 'boleto'
    check (forma_recebimento in ('pix','boleto','transferencia','dinheiro','cartao','debito_automatico','outro'));

alter table condicoes_pagamento_operacao
  add column if not exists saldo_prazo_dias int not null default 0 check (saldo_prazo_dias between 0 and 120);

alter table operacoes
  add column if not exists coleta_em timestamptz,
  add column if not exists entregue_em timestamptz,
  add column if not exists fechamento_motivo text;

update operacoes set entregue_em = coalesce(finalizada_em, updated_at) where status in ('entregue','fechada') and entregue_em is null;

insert into parametros_sistema (chave, valor) values
  ('saldo_minimo_alerta', '0'::jsonb),
  ('aliquota_das_efetiva', '0.06'::jsonb),
  ('saldo_motorista_prazo_dias', '0'::jsonb),
  ('dias_alerta_vencimento', '3'::jsonb)
on conflict (chave) do nothing;

-- RLS
alter table contas_bancarias enable row level security;
alter table categorias_financeiras enable row level security;
alter table condicoes_prazo enable row level security;
alter table feriados enable row level security;
do $$ declare t text; begin
  foreach t in array array['contas_bancarias','categorias_financeiras','condicoes_prazo','feriados'] loop
    execute format('drop policy if exists gestor_acesso_total on %I', t);
    execute format('create policy gestor_acesso_total on %I for all to authenticated using (current_papel() = ''gestor_rbr'') with check (current_papel() = ''gestor_rbr'')', t);
  end loop;
end $$;
drop trigger if exists trg_touch_updated_at on contas_bancarias;
create trigger trg_touch_updated_at before update on contas_bancarias for each row execute function touch_updated_at();
