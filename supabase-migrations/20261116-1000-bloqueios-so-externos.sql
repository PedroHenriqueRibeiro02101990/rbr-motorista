-- 2026-11-16 · Bloqueios só do que o órgão externo rejeitaria. NÃO APLICADO: revisar e aplicar manualmente.
-- Altera só 3 funções (checar_pre_voo, trg_fn_operacao_exige_aprovados, trg_fn_veiculos_protege_campos); não mexe em dados.
-- Reversão: recriar as funções com as definições anteriores (checar_pre_voo em 20261024_03_operacao_nfes_cliente.sql;
-- os dois gatilhos estão no banco e foram lidos em 16/11/2026: ver comentários "ANTES" abaixo).

-- ============================================================================================================
-- 1) Pré-voo: cada item tem 'tipo' ('bloqueio' | 'aviso'); pode_emitir só considera bloqueio.
--    Fontes atuais: operacao_ciot_vpo, documentacao_operacao e averbação nova; ciot_registros e averbacoes_negociacao
--    seguem só como fonte LEGADA (somam, não são mais a única fonte).
--    RNTRC: status nunca consultado (NULL) = aviso; só inativo/cancelado/suspenso (consulta ANTT) = bloqueio.
--    Os nomes de 'item' não mudam (a tela mapeia item -> aba). 'tipo' e 'avisos' são campos novos, aditivos.
-- ============================================================================================================
create or replace function public.checar_pre_voo(p_operacao uuid)
returns jsonb
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $function$
declare
  r record; itens jsonb; v_teste boolean; v_nfes int;
  v_rntrc_v text; v_rntrc_m text; v_rntrc_impeditivo boolean;
  v_ciot_ok boolean; v_averb_ok boolean;
begin
  select * into r from v_checklist_prontidao where operacao_id = p_operacao;
  if not found then return jsonb_build_object('erro','operacao_nao_encontrada'); end if;
  select coalesce(o.eh_teste, false) into v_teste from operacoes o where o.id = p_operacao;
  select count(*) into v_nfes from operacao_nfes n where n.operacao_id = p_operacao;

  select lower(coalesce(rntrc_status,'')) into v_rntrc_v from veiculos where id = r.veiculo_id;
  select lower(coalesce(rntrc_status,'')) into v_rntrc_m from pessoas where id = r.motorista_id;
  v_rntrc_impeditivo := coalesce(v_rntrc_v,'') ~ '(inativ|cancel|suspens|vencid|baix|bloquead)'
                     or coalesce(v_rntrc_m,'') ~ '(inativ|cancel|suspens|vencid|baix|bloquead)';

  -- CIOT: lançado em operacao_ciot_vpo (12 dígitos, não cancelado/encerrado) ou emitido em documentacao_operacao; legado: ciot_registros.
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

  -- Averbação: número em operacao_ciot_vpo (MDF-e ou RCV) ou negociação legada.
  select
    exists (select 1 from operacao_ciot_vpo c
             where c.operacao_id = p_operacao
               and (nullif(trim(coalesce(c.numero_averbacao,'')),'') is not null
                    or nullif(trim(coalesce(c.averbacao_rcv_numero,'')),'') is not null))
    or r.averbacao_status is not null
  into v_averb_ok;

  itens := jsonb_build_array(
    jsonb_build_object('doc','CT-e','item','emitente_ie','tipo','bloqueio','ok', coalesce(r.ie_configurada,false),'motivo','IE do emitente não configurada'),
    jsonb_build_object('doc','CT-e','item','origem_destino','tipo','bloqueio','ok', r.cidade_origem is not null and r.uf_origem is not null and r.cidade_destino is not null and r.uf_destino is not null,'motivo','Origem ou destino incompletos'),
    jsonb_build_object('doc','CT-e','item','nfe','tipo','bloqueio','ok', v_nfes > 0 or ((v_teste or r.ambiente_fiscal is distinct from 'producao') and r.nf_chave_acesso is not null),'motivo','NF-e do cliente: nenhuma nota na operação'),
    jsonb_build_object('doc','CT-e','item','remetente_destinatario','tipo','bloqueio','ok', r.nf_remetente_cnpj is not null and r.nf_destinatario_cnpj is not null,'motivo','CNPJ do remetente ou destinatário ausente'),
    jsonb_build_object('doc','CT-e','item','endereco_destinatario','tipo','bloqueio','ok', r.destinatario_cep is not null and r.destinatario_logradouro is not null,'motivo','Endereço do cliente incompleto'),
    jsonb_build_object('doc','CT-e','item','valor','tipo','bloqueio','ok', coalesce(r.valor_total_cotacao,0) > 0,'motivo','Valor do frete ausente'),
    jsonb_build_object('doc','CT-e','item','piso_antt','tipo','bloqueio','ok', r.piso_antt_calculado is null or coalesce(r.frete_motorista,0) >= r.piso_antt_calculado,'motivo','Frete do motorista abaixo do piso ANTT'),
    jsonb_build_object('doc','MDF-e','item','motorista_veiculo','tipo','bloqueio','ok', r.motorista_id is not null and r.veiculo_id is not null,'motivo','Motorista e veículo precisam estar alocados'),
    jsonb_build_object('doc','MDF-e','item','rntrc',
      'tipo', case when v_rntrc_impeditivo then 'bloqueio' else 'aviso' end,
      'ok', (r.veiculo_id is null or v_rntrc_v = 'ativo') and (r.motorista_id is null or v_rntrc_m = 'ativo'),
      'motivo', case when v_rntrc_impeditivo then 'RNTRC consta como inativo/cancelado/suspenso na ANTT'
                     else 'RNTRC ainda não consultado na ANTT (a ANTT valida no CIOT e a SEFAZ no MDF-e)' end),
    jsonb_build_object('doc','MDF-e','item','ciot','tipo','aviso','ok', coalesce(v_ciot_ok,false),'motivo','CIOT ainda não lançado (o MDF-e real exige para TAC)'),
    jsonb_build_object('doc','MDF-e','item','averbacao','tipo','aviso','ok', coalesce(v_averb_ok,false),'motivo','Averbação ainda não feita (a SEFAZ exige o número no MDF-e)'),
    jsonb_build_object('doc','MDF-e','item','seguro','tipo','aviso','ok', not coalesce(r.excede_teto_seguro,false),'motivo','Valor da carga acima do teto da apólice (regra da RBR)'),
    jsonb_build_object('doc','Risco','item','rastreio','tipo','aviso','ok', not coalesce(r.rastreio_exigido,false) or r.rastreio_status is not null,'motivo','Rastreio exigido e não configurado (regra da RBR)'),
    jsonb_build_object('doc','Geral','item','bloqueio_fiscal','tipo','bloqueio','ok', not coalesce(r.bloqueio_fiscal,false),'motivo', coalesce(r.bloqueio_fiscal_motivo,'Bloqueio fiscal ativo')));

  return jsonb_build_object('operacao_id',p_operacao,
    'pode_emitir', not exists(select 1 from jsonb_array_elements(itens) e where (e->>'ok')::boolean = false and e->>'tipo' = 'bloqueio'),
    'pendencias', coalesce((select jsonb_agg(e) from jsonb_array_elements(itens) e where (e->>'ok')::boolean = false),'[]'::jsonb),
    'avisos', coalesce((select jsonb_agg(e) from jsonb_array_elements(itens) e where (e->>'ok')::boolean = false and e->>'tipo' = 'aviso'),'[]'::jsonb),
    'itens', itens,
    'nfes_cliente', (select jsonb_build_object('quantidade', count(*), 'valor_total', coalesce(sum(valor), 0), 'peso_total', coalesce(sum(peso_kg), 0)) from operacao_nfes where operacao_id = p_operacao),
    'alocacao', checar_alocacao(p_operacao));
end $function$;

-- ============================================================================================================
-- 2) Vincular veículo/motorista NÃO aprovado: regra da RBR, não de órgão externo.
--    gestor_rbr: libera e REGISTRA quem vinculou (auditoria_log). Demais perfis: continua bloqueando.
--    Cadastro de TESTE em operação real continua bloqueando para todos (isolamento teste x real).
--    ANTES: raise exception sempre que não aprovado, para qualquer perfil.
-- ============================================================================================================
create or replace function public.trg_fn_operacao_exige_aprovados()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare v_st text; v_nome text; v_cad_teste boolean;
  v_gestor boolean := (current_papel() = 'gestor_rbr');
  v_op_teste boolean := coalesce(new.eh_teste, false)
    or coalesce((select eh_teste from public.cotacoes where id = new.cotacao_id), false);
begin
  if new.pessoa_alocada_id is not null and (tg_op = 'INSERT' or new.pessoa_alocada_id is distinct from old.pessoa_alocada_id) then
    select aprovacao_status, nome, eh_teste into v_st, v_nome, v_cad_teste from public.pessoas where id = new.pessoa_alocada_id;
    if v_cad_teste and not v_op_teste then
      raise exception 'Motorista % é cadastro de TESTE e só pode ir em operação de teste.', v_nome;
    end if;
    if v_st is distinct from 'aprovado' and not (v_cad_teste and v_op_teste) then
      if v_gestor then
        insert into public.auditoria_log (pessoa_id_ator, papel, acao, entidade, entidade_id, dado_depois)
        values (current_pessoa_id(), 'gestor_rbr', 'vinculo_motorista_nao_aprovado', 'operacoes', new.id,
                jsonb_build_object('motorista_id', new.pessoa_alocada_id, 'motorista', v_nome, 'aprovacao_status', v_st));
      else
        raise exception 'Motorista % ainda não está aprovado (situação: %). Veja em Cadastros → Pendências.', v_nome, coalesce(v_st,'?');
      end if;
    end if;
  end if;
  if new.veiculo_id is not null and (tg_op = 'INSERT' or new.veiculo_id is distinct from old.veiculo_id) then
    select aprovacao_status, placa, eh_teste into v_st, v_nome, v_cad_teste from public.veiculos where id = new.veiculo_id;
    if v_cad_teste and not v_op_teste then
      raise exception 'Veículo % é cadastro de TESTE e só pode ir em operação de teste.', v_nome;
    end if;
    if v_st is distinct from 'aprovado' and not (v_cad_teste and v_op_teste) then
      if v_gestor then
        insert into public.auditoria_log (pessoa_id_ator, papel, acao, entidade, entidade_id, dado_depois)
        values (current_pessoa_id(), 'gestor_rbr', 'vinculo_veiculo_nao_aprovado', 'operacoes', new.id,
                jsonb_build_object('veiculo_id', new.veiculo_id, 'placa', v_nome, 'aprovacao_status', v_st));
      else
        raise exception 'Veículo % ainda não está aprovado (situação: %). Veja em Cadastros → Pendências.', v_nome, coalesce(v_st,'?');
      end if;
    end if;
  end if;
  return new;
end $function$;

-- ============================================================================================================
-- 3) Proteção dos campos de aprovação (integridade/auditoria): MANTIDA. Acréscimo: nem o gestor grava
--    aprovacao_por em nome de OUTRA pessoa (sistema/service role seguem livres: cad_sistema()/fin_eh_sistema()).
--    ATENÇÃO: confirmar que a tela de aprovação grava aprovacao_por = pessoa logada; se algum fluxo de gestor
--    grava outro valor, ele passa a falhar. O equivalente em pessoas (trg_fn_pessoas_protege_campos_sistema)
--    NÃO foi lido nem alterado.
--    ANTES: gestor/sistema retornavam new sem nenhuma checagem.
-- ============================================================================================================
create or replace function public.trg_fn_veiculos_protege_campos()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if cad_sistema() or fin_eh_sistema() then return new; end if;
  if current_papel() = 'gestor_rbr' then
    if new.aprovacao_por is distinct from old.aprovacao_por and new.aprovacao_por is not null
       and new.aprovacao_por is distinct from current_pessoa_id() then
      raise exception 'A aprovação só pode ser registrada em nome de quem a faz.';
    end if;
    return new;
  end if;
  if new.aprovacao_status is distinct from old.aprovacao_status
     or new.aprovacao_origem is distinct from old.aprovacao_origem
     or new.aprovacao_em is distinct from old.aprovacao_em
     or new.aprovacao_por is distinct from old.aprovacao_por
     or new.aprovacao_motivo is distinct from old.aprovacao_motivo
     or new.aprovacao_hash is distinct from old.aprovacao_hash
     or new.verificacao is distinct from old.verificacao
     or new.verificado_em is distinct from old.verificado_em
     or new.crlv_extraido_por_ia is distinct from old.crlv_extraido_por_ia
     or new.rntrc_status is distinct from old.rntrc_status then
    raise exception 'Campo de verificação do veículo só pode ser alterado pela RBR.';
  end if;
  return new;
end $function$;
