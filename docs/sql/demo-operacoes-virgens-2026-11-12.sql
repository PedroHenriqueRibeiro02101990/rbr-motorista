-- FASE 3: 3 operacoes DEMO virgens (clones limpos da OP-d755). SO INSERT. NAO EXECUTADO e NAO TESTADO:
-- o acesso do Claude ao banco foi negado pelo sistema de seguranca (ate para leitura), entao o esquema real de operacoes/cotacoes
-- nao pode ser conferido. Este script clona a OP-d755 por jsonb_populate_record (cobre qualquer coluna) e zera so o que precisa.
-- COMO USAR (Pedro, no SQL Editor): rode do "begin" ate o "select" final. Ele termina em ROLLBACK de proposito: confira o resultado
-- e, se estiver certo, troque a ultima linha por "commit;" e rode de novo. Se algum insert falhar por coluna unica ou gatilho, o
-- rollback desfaz tudo; me mande a mensagem de erro.
-- NAO ALTERA nenhuma operacao existente (OP-d755, OP-70cd, reais): so le a d755 como modelo.
-- Cada operacao nova: eh_teste e modo_demonstracao ligados, sem vale (numero_vpo nulo, sem registro em operacao_ciot_vpo nem vpo_requisicoes),
-- sem CIOT, sem documentos fiscais, sem NF-e real (nf_chave_acesso nula na cotacao). Pronta para Simular e Consultar tag.
begin;

create temp table _novas on commit drop as
select i, gen_random_uuid() as cot_id, gen_random_uuid() as op_id from generate_series(1, 3) as i;

-- 1) cotacoes novas (copia da cotacao da d755; sem NF-e)
insert into public.cotacoes
select (jsonb_populate_record(
  null::public.cotacoes,
  to_jsonb(c) || jsonb_build_object('id', n.cot_id, 'nf_chave_acesso', null, 'eh_teste', true)
)).*
from public.cotacoes c
join public.operacoes o on o.cotacao_id = c.id and o.id::text like 'd755%'
cross join _novas n;

-- 2) operacoes novas (copia da d755 com marcas de teste/demo e sem nada fiscal)
insert into public.operacoes
select (jsonb_populate_record(
  null::public.operacoes,
  to_jsonb(o) || jsonb_build_object(
    'id', n.op_id,
    'cotacao_id', n.cot_id,
    'eh_teste', true,
    'modo_demonstracao', true,
    'numero_vpo', null,
    'status', o.status,
    'created_at', now(),
    'updated_at', now(),
    'deleted_at', null
  )
)).*
from public.operacoes o
cross join _novas n
where o.id::text like 'd755%';

-- 3) condicoes de pagamento e reboques da operacao modelo, para as novas
insert into public.condicoes_pagamento_operacao
select (jsonb_populate_record(null::public.condicoes_pagamento_operacao, to_jsonb(c) || jsonb_build_object('operacao_id', n.op_id, 'id', gen_random_uuid()))).*
from public.condicoes_pagamento_operacao c
join public.operacoes o on o.id = c.operacao_id and o.id::text like 'd755%'
cross join _novas n;

insert into public.operacao_reboques
select (jsonb_populate_record(null::public.operacao_reboques, to_jsonb(r) || jsonb_build_object('operacao_id', n.op_id, 'id', gen_random_uuid()))).*
from public.operacao_reboques r
join public.operacoes o on o.id = r.operacao_id and o.id::text like 'd755%'
cross join _novas n;

-- Conferencia: id, codigo (OP- + 4 primeiras letras do id) e link
select 'OP-' || left(op_id::text, 4) as codigo, op_id as id, '/fiscal?op=' || op_id as link
from _novas order by i;

rollback;  -- troque por: commit;  depois de conferir
