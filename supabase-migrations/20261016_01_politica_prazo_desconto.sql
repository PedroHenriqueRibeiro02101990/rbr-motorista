-- 20261016_01 — Política de preço por prazo de pagamento e desconto na negociação (decisão do Pedro, 2026-10-16)
--
-- DEPENDE de 20261015_12_giro_custo_fixo_mutuo (o cálculo de preço abaixo parte da versão sem capital de giro) e de
-- 20261014_01_modo_teste (eh_gestor_ou_backend). Aplicar só depois delas, e ANTES de publicar o gestor desta versão
-- (a tela grava as colunas novas).
--
--  1) parametros_sistema.politica_prazo_desconto: escada por prazo, concessões, faixas por valor, teto (5%), piso e
--     cores. O gestor edita na configuração; o cotador lê (shared/precoPrazo.ts, lerPolitica).
--  2) cotacoes: ajuste_prazo_pct (acréscimo/desconto do prazo sobre o preço a 7 DDL), desconto_pct (concessão sobre o
--     preço do prazo cotado, até 5%), desconto_prazo (prazo aceito em troca), desconto_motivo, valor_tabela (preço a
--     7 DDL, antes de prazo e desconto — para a análise de quem abriu mão de margem).
--     Preço (modo lucro %): valor_total = round(round(V × (1 + ajuste), 2) × (1 − desconto), 2), V = preço a 7 DDL.
--     Sem ajuste e sem desconto (todas as cotações de hoje) o valor é exatamente o de antes.
--     Modo "valor final" digitado à mão: o valor já é o final; ajuste e desconto não se aplicam (ficam nulos).
--  3) faturas: valor_cheio (sem o desconto negociado), desconto_negociado_pct, descontos_condicionais (boleto: valor
--     com desconto até cada data, no máximo 3), desconto_perdido_em/obs (pagou fora do prazo: volta ao valor cheio).
--     Fase 1: só calcula, grava e mostra; o boleto do banco segue com o valor cheio.
--  4) operacoes: pix_antecipado_confirmado_em/por (pagamento antecipado). Sem confirmação há só aviso; não bloqueia.
-- Nada aqui bloqueia cotação por margem: abaixo de 26% continua só o registro em auditoria_log que já existe.

-- 1) Parâmetro ------------------------------------------------------------------------------------------------
insert into public.parametros_sistema (chave, valor, descricao)
values ('politica_prazo_desconto',
  '{"ajustePorPrazo":{"antecipado":-0.02,"a_vista":-0.01,"7ddl":0,"14ddl":0.015,"15ddl":0.015,"21ddl":0.03,"28ddl":0.04,"30ddl":0.045,"2x":0},
    "concessoes":[
      {"de":["28ddl"],"para":"14ddl","min":0.03,"max":0.03},
      {"de":["28ddl"],"para":"7ddl","min":0.04,"max":0.04},
      {"de":["21ddl"],"para":"14ddl","min":0.02,"max":0.02},
      {"de":["21ddl"],"para":"7ddl","min":0.03,"max":0.03},
      {"de":["14ddl"],"para":"a_vista","min":0.02,"max":0.03,"faixa":"a_vista"},
      {"de":["14ddl"],"para":"antecipado","min":0.04,"max":0.05,"faixa":"antecipado"},
      {"de":["7ddl"],"para":"antecipado","min":0.02,"max":0.02,"faixa":"antecipado"},
      {"de":["21ddl","28ddl"],"para":"antecipado","min":0.05,"max":0.05,"faixa":"antecipado","raro":true}],
    "faixas":{"antecipado":{"custoMinimo":10000},"a_vista":{"custoMinimo":5000}},
    "tetoDesconto":0.05,"margemPiso":0.26,"margemConfortavel":0.30,"descontoMinimoUtil":0.02}'::jsonb,
  'Política de preço por prazo e de desconto na negociação (2026-10-16). Frações sobre o preço; teto nunca acima de 5%. Uso interno: não divulgar.')
on conflict (chave) do nothing;

-- 2) Cotação ---------------------------------------------------------------------------------------------------
alter table public.cotacoes
  add column if not exists ajuste_prazo_pct numeric(8,6),
  add column if not exists desconto_pct numeric(8,6),
  add column if not exists desconto_prazo text,
  add column if not exists desconto_motivo text,
  add column if not exists valor_tabela numeric(12,2);

alter table public.cotacoes drop constraint if exists cotacoes_ajuste_prazo_pct_chk;
alter table public.cotacoes add constraint cotacoes_ajuste_prazo_pct_chk
  check (ajuste_prazo_pct is null or ajuste_prazo_pct between -0.5 and 0.5);
alter table public.cotacoes drop constraint if exists cotacoes_desconto_pct_chk;
alter table public.cotacoes add constraint cotacoes_desconto_pct_chk
  check (desconto_pct is null or desconto_pct between 0 and 0.05);

comment on column public.cotacoes.ajuste_prazo_pct is 'Ajuste do prazo de pagamento sobre o preço a 7 DDL (fração; −0,02 antecipado … +0,045 30 DDL). Editável.';
comment on column public.cotacoes.desconto_pct is 'Desconto negociado sobre o preço do prazo cotado (fração, até 0,05). Vale só com pagamento no prazo combinado.';
comment on column public.cotacoes.desconto_prazo is 'Prazo que o cliente aceitou em troca do desconto (antecipado, a_vista, 7ddl, 14ddl…).';
comment on column public.cotacoes.desconto_motivo is 'Motivo do desconto (opcional), para análise de quais fretes abriram mão de margem.';
comment on column public.cotacoes.valor_tabela is 'Preço a 7 DDL (lucro % sobre o custo com imposto), antes de ajuste de prazo e desconto. Calculado pelo gatilho.';

create or replace function public.trg_fn_cotacao_calcula_preco()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_custo numeric; v_adicionais numeric; v_adicionais_motorista numeric;
  v_aliq numeric; v_lucro_padrao numeric; v_fator numeric; v_divisor numeric; v_base_lucro numeric;
  v_modo_valor_final boolean; v_base numeric;
begin
  if new.valor_frete_motorista is null then return new; end if;
  if new.taxa_seguro_tag_pct is not null then
    new.valor_seguro_tag := round(coalesce(new.valor_nf, 0) * new.taxa_seguro_tag_pct, 2);
  end if;
  select
    coalesce(sum(case when forma_calculo = 'pct_valor_nf' then round(coalesce(new.valor_nf, 0) * valor_unitario, 2)
                      else round(valor_unitario * quantidade, 2) end), 0),
    coalesce(sum(case when recebedor = 'motorista' then
                   case when forma_calculo = 'pct_valor_nf' then round(coalesce(new.valor_nf, 0) * valor_unitario, 2)
                        else round(valor_unitario * quantidade, 2) end
                 else 0 end), 0)
  into v_adicionais, v_adicionais_motorista
  from cotacao_custos_adicionais where cotacao_id = new.id;
  new.custos_adicionais_total := v_adicionais;
  new.valor_total_motorista := new.valor_frete_motorista + v_adicionais_motorista;

  -- 2026-10-15: o capital de giro é custo fixo mensal (mútuo), fora do preço e do lucro por operação.
  -- custo_financeiro / giro_repasse_pct ficam gravados só como histórico.
  v_custo := new.valor_frete_motorista + coalesce(new.pedagio, 0) + coalesce(new.valor_seguro_tag, 0) + v_adicionais;
  v_aliq := coalesce(new.aliquota_imposto_pct, 0);
  v_modo_valor_final := (new.preco_modo = 'valor_final' and new.valor_total is not null);

  if v_modo_valor_final then
    if new.valor_total <= 0 then raise exception 'Valor final precisa ser maior que zero.'; end if;
    -- 2026-10-16: valor digitado à mão já é o preço final; ajuste de prazo e desconto não se aplicam.
    new.ajuste_prazo_pct := null;
    new.desconto_pct := null;
    new.desconto_prazo := null;
    new.valor_tabela := new.valor_total;
  else
    new.preco_modo := 'lucro_pct';
    if new.lucro_pct is null then
      select (valor)::text::numeric into v_lucro_padrao from parametros_sistema where chave = 'lucro_cotacao_padrao';
      new.lucro_pct := coalesce(v_lucro_padrao, 0.40);
    end if;
    v_fator := 1 + new.lucro_pct;
    v_divisor := 1 - v_aliq * v_fator;
    if v_divisor <= 0 then
      raise exception 'Com lucro de % %% e imposto de % %% não dá pra fechar o valor final — revise os percentuais.',
        round(new.lucro_pct * 100, 2), round(v_aliq * 100, 2);
    end if;
    -- 2026-10-16: preço a 7 DDL; o prazo ajusta e a concessão desconta sobre ele (mesma conta de shared/precoPrazo.ts).
    v_base := round(v_custo * v_fator / v_divisor, 2);
    new.valor_tabela := v_base;
    if coalesce(new.desconto_pct, 0) = 0 then
      new.desconto_prazo := null;
    end if;
    new.valor_total := round(round(v_base * (1 + coalesce(new.ajuste_prazo_pct, 0)), 2) * (1 - coalesce(new.desconto_pct, 0)), 2);
  end if;

  new.valor_imposto := round(new.valor_total * v_aliq, 2);
  new.lucro_rbr := round(new.valor_total - v_custo - new.valor_imposto, 2);
  new.margem_ajustada := case when new.valor_total > 0 then round(new.lucro_rbr / new.valor_total, 6) else null end;
  if v_modo_valor_final then
    v_base_lucro := v_custo + new.valor_imposto;
    new.lucro_pct := case when v_base_lucro > 0 then round(new.lucro_rbr / v_base_lucro, 6) else null end;
  end if;
  return new;
end;
$function$;

-- 3) Fatura ----------------------------------------------------------------------------------------------------
alter table public.faturas
  add column if not exists valor_cheio numeric(12,2),
  add column if not exists desconto_negociado_pct numeric(8,6),
  add column if not exists descontos_condicionais jsonb not null default '[]'::jsonb,
  add column if not exists desconto_perdido_em timestamptz,
  add column if not exists desconto_perdido_obs text;

alter table public.faturas drop constraint if exists faturas_descontos_condicionais_chk;
alter table public.faturas add constraint faturas_descontos_condicionais_chk
  check (jsonb_typeof(descontos_condicionais) = 'array' and jsonb_array_length(descontos_condicionais) <= 3);

comment on column public.faturas.valor_cheio is 'Valor sem o desconto negociado (volta a valer se o pagamento sair fora do prazo combinado).';
comment on column public.faturas.descontos_condicionais is 'Boleto com desconto condicional: [{data_limite, dias, desconto, valor}], até 3. Fase 1: só registro; o boleto do banco segue com o valor cheio.';
comment on column public.faturas.desconto_perdido_em is 'Pagamento fora do prazo combinado: o desconto negociado deixou de valer (registro manual).';

-- 4) Operação --------------------------------------------------------------------------------------------------
alter table public.operacoes
  add column if not exists pix_antecipado_confirmado_em timestamptz,
  add column if not exists pix_antecipado_confirmado_por uuid references public.pessoas(id);

comment on column public.operacoes.pix_antecipado_confirmado_em is 'Pagamento antecipado: quando o gestor confirmou o Pix (antes de liberar o motorista). Sem confirmação há só aviso.';

-- Só gestor (ou backend) mexe na confirmação do Pix: motorista e agenciador também atualizam operacoes por RLS.
create or replace function public.trg_fn_operacao_protege_pix_antecipado()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if (new.pix_antecipado_confirmado_em is distinct from old.pix_antecipado_confirmado_em
      or new.pix_antecipado_confirmado_por is distinct from old.pix_antecipado_confirmado_por)
     and not eh_gestor_ou_backend() then
    new.pix_antecipado_confirmado_em := old.pix_antecipado_confirmado_em;
    new.pix_antecipado_confirmado_por := old.pix_antecipado_confirmado_por;
  end if;
  return new;
end $$;

revoke all on function public.trg_fn_operacao_protege_pix_antecipado() from public, anon, authenticated;

drop trigger if exists trg_operacao_protege_pix_antecipado on public.operacoes;
create trigger trg_operacao_protege_pix_antecipado
  before update of pix_antecipado_confirmado_em, pix_antecipado_confirmado_por on public.operacoes
  for each row execute function public.trg_fn_operacao_protege_pix_antecipado();
