-- A8 (18/11/2026): checar_pre_voo lia so as tabelas legadas (v_checklist_prontidao: ciot_registros -> numero_ciot; averbacoes_negociacao -> averbacao_status).
-- Operacao manual (Repom) grava CIOT e averbacao em operacao_ciot_vpo e documentacao_operacao: o pre-voo dizia "CIOT ainda nao gerado" mesmo com CIOT lancado.
-- So troca a FUNCAO. Mantem EXATAMENTE a semantica atual (todo item continua bloqueando, mesmos nomes de item); so soma as fontes novas ao lado das legadas.
-- (A versao de 16/11 em supabase-migrations/20261116-1000-bloqueios-so-externos.sql tambem mudava bloqueio->aviso e 2 gatilhos; NAO foi aplicada e continua pendente de revisao.)
-- Rollback: supabase/rollback/rollback-20261118-2320-pre-voo-fontes-atuais.sql
create or replace function public.checar_pre_voo(p_operacao uuid)
returns jsonb
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $function$
declare r record; itens jsonb; v_teste boolean; v_nfes int; v_ciot_ok boolean; v_averb_ok boolean;
begin
  select * into r from v_checklist_prontidao where operacao_id = p_operacao;
  if not found then return jsonb_build_object('erro','operacao_nao_encontrada'); end if;
  select coalesce(o.eh_teste, false) into v_teste from operacoes o where o.id = p_operacao;
  select count(*) into v_nfes from operacao_nfes n where n.operacao_id = p_operacao;

  -- CIOT: operacao_ciot_vpo (12 digitos, nao cancelado/encerrado/erro) ou documentacao_operacao emitido; legado: ciot_registros (r.numero_ciot).
  select
    exists (select 1 from operacao_ciot_vpo c
             where c.operacao_id = p_operacao
               and length(regexp_replace(coalesce(c.ciot,''), '\D', '', 'g')) = 12
               and coalesce(c.ciot_status,'emitido') not in ('cancelado','encerrado','erro'))
    or exists (select 1 from documentacao_operacao d
                where d.operacao_id = p_operacao and d.tipo::text = 'ciot' and d.status::text = 'emitido')
    or r.numero_ciot is not null
    or r.forma_pagamento_tipo is null
  into v_ciot_ok;

  -- Averbacao: numero em operacao_ciot_vpo (MDF-e ou RCV), averbacao emitida em documentacao_operacao, ou negociacao legada.
  select
    exists (select 1 from operacao_ciot_vpo c
             where c.operacao_id = p_operacao
               and (nullif(trim(coalesce(c.numero_averbacao,'')),'') is not null
                    or nullif(trim(coalesce(c.averbacao_rcv_numero,'')),'') is not null))
    or exists (select 1 from documentacao_operacao d
                where d.operacao_id = p_operacao and d.tipo::text = 'atm' and d.status::text = 'emitido')
    or r.averbacao_status is not null
  into v_averb_ok;

  itens := jsonb_build_array(
    jsonb_build_object('doc','CT-e','item','emitente_ie','ok', coalesce(r.ie_configurada,false),'motivo','IE do emitente não configurada'),
    jsonb_build_object('doc','CT-e','item','origem_destino','ok', r.cidade_origem is not null and r.uf_origem is not null and r.cidade_destino is not null and r.uf_destino is not null,'motivo','Origem ou destino incompletos'),
    jsonb_build_object('doc','CT-e','item','nfe','ok', v_nfes > 0 or ((v_teste or r.ambiente_fiscal is distinct from 'producao') and r.nf_chave_acesso is not null),'motivo','NF-e do cliente: nenhuma nota na operação'),
    jsonb_build_object('doc','CT-e','item','remetente_destinatario','ok', r.nf_remetente_cnpj is not null and r.nf_destinatario_cnpj is not null,'motivo','CNPJ do remetente ou destinatário ausente'),
    jsonb_build_object('doc','CT-e','item','endereco_destinatario','ok', r.destinatario_cep is not null and r.destinatario_logradouro is not null,'motivo','Endereço do cliente incompleto'),
    jsonb_build_object('doc','CT-e','item','valor','ok', coalesce(r.valor_total_cotacao,0) > 0,'motivo','Valor do frete ausente'),
    jsonb_build_object('doc','CT-e','item','piso_antt','ok', r.piso_antt_calculado is null or coalesce(r.frete_motorista,0) >= r.piso_antt_calculado,'motivo','Frete do motorista abaixo do piso ANTT'),
    jsonb_build_object('doc','MDF-e','item','motorista_veiculo','ok', r.motorista_id is not null and r.veiculo_id is not null,'motivo','Motorista e veículo precisam estar alocados'),
    jsonb_build_object('doc','MDF-e','item','rntrc','ok', coalesce(r.veiculo_rntrc_ativo,false),'motivo','RNTRC do veículo não está ativo'),
    jsonb_build_object('doc','MDF-e','item','ciot','ok', coalesce(v_ciot_ok,false),'motivo','CIOT ainda não gerado'),
    jsonb_build_object('doc','MDF-e','item','averbacao','ok', coalesce(v_averb_ok,false),'motivo','Averbação ainda não feita'),
    jsonb_build_object('doc','MDF-e','item','seguro','ok', not coalesce(r.excede_teto_seguro,false),'motivo','Valor da carga acima do teto da apólice'),
    jsonb_build_object('doc','Risco','item','rastreio','ok', not coalesce(r.rastreio_exigido,false) or r.rastreio_status is not null,'motivo','Rastreio exigido e não configurado'),
    jsonb_build_object('doc','Geral','item','bloqueio_fiscal','ok', not coalesce(r.bloqueio_fiscal,false),'motivo', coalesce(r.bloqueio_fiscal_motivo,'Bloqueio fiscal ativo')));
  return jsonb_build_object('operacao_id',p_operacao,
    'pode_emitir', not exists(select 1 from jsonb_array_elements(itens) e where (e->>'ok')::boolean = false),
    'pendencias', coalesce((select jsonb_agg(e) from jsonb_array_elements(itens) e where (e->>'ok')::boolean = false),'[]'::jsonb),
    'itens', itens,
    'nfes_cliente', (select jsonb_build_object('quantidade', count(*), 'valor_total', coalesce(sum(valor), 0), 'peso_total', coalesce(sum(peso_kg), 0)) from operacao_nfes where operacao_id = p_operacao),
    'alocacao', checar_alocacao(p_operacao));
end $function$;
