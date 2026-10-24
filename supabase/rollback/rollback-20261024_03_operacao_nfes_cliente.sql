-- Rollback de 20261024_03_operacao_nfes_cliente.sql
-- Atenção: apaga as colunas novas de operacao_nfes (e o que estiver nelas) e o bucket operacao-nfe só se estiver vazio.
set local lock_timeout = '8s';

drop policy if exists operacao_nfe_gestor_acesso_total on storage.objects;
drop policy if exists operacao_nfe_agenciador_proprias on storage.objects;
drop policy if exists operacao_nfe_motorista_leitura on storage.objects;
delete from storage.buckets where id = 'operacao-nfe' and not exists (select 1 from storage.objects where bucket_id = 'operacao-nfe');

drop policy if exists agenciador_nfes_operacoes_proprias on public.operacao_nfes;
drop policy if exists motorista_le_nfes_da_operacao on public.operacao_nfes;
drop function if exists public.nfes_em_outra_operacao(uuid, text[]);

drop index if exists public.operacao_nfes_chave_idx;
alter table public.operacao_nfes
  drop constraint if exists operacao_nfes_chave_dv,
  drop constraint if exists operacao_nfes_xml_ou_digitada,
  drop column if exists emitente_cnpj, drop column if exists emitente_nome,
  drop column if exists destinatario_cnpj, drop column if exists destinatario_nome,
  drop column if exists ncm, drop column if exists ncms, drop column if exists produto_predominante,
  drop column if exists quantidade_volumes, drop column if exists data_emissao,
  drop column if exists municipio_origem, drop column if exists uf_origem,
  drop column if exists municipio_destino, drop column if exists uf_destino,
  drop column if exists arquivo_xml_path, drop column if exists origem, drop column if exists criado_por;
grant all on public.operacao_nfes to anon;

-- checar_pre_voo volta à versão anterior (item da NF-e aceitava a chave da cotação sempre).
create or replace function public.checar_pre_voo(p_operacao uuid)
returns jsonb
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $function$
declare r record; itens jsonb;
begin
  select * into r from v_checklist_prontidao where operacao_id = p_operacao;
  if not found then return jsonb_build_object('erro','operacao_nao_encontrada'); end if;
  itens := jsonb_build_array(
    jsonb_build_object('doc','CT-e','item','emitente_ie','ok', coalesce(r.ie_configurada,false),'motivo','IE do emitente não configurada'),
    jsonb_build_object('doc','CT-e','item','origem_destino','ok', r.cidade_origem is not null and r.uf_origem is not null and r.cidade_destino is not null and r.uf_destino is not null,'motivo','Origem ou destino incompletos'),
    jsonb_build_object('doc','CT-e','item','nfe','ok', r.nf_chave_acesso is not null or exists(select 1 from operacao_nfes n where n.operacao_id = p_operacao),'motivo','Nenhuma chave de NF-e'),
    jsonb_build_object('doc','CT-e','item','remetente_destinatario','ok', r.nf_remetente_cnpj is not null and r.nf_destinatario_cnpj is not null,'motivo','CNPJ do remetente ou destinatário ausente'),
    jsonb_build_object('doc','CT-e','item','endereco_destinatario','ok', r.destinatario_cep is not null and r.destinatario_logradouro is not null,'motivo','Endereço do cliente incompleto'),
    jsonb_build_object('doc','CT-e','item','valor','ok', coalesce(r.valor_total_cotacao,0) > 0,'motivo','Valor do frete ausente'),
    jsonb_build_object('doc','CT-e','item','piso_antt','ok', r.piso_antt_calculado is null or coalesce(r.frete_motorista,0) >= r.piso_antt_calculado,'motivo','Frete do motorista abaixo do piso ANTT'),
    jsonb_build_object('doc','MDF-e','item','motorista_veiculo','ok', r.motorista_id is not null and r.veiculo_id is not null,'motivo','Motorista e veículo precisam estar alocados'),
    jsonb_build_object('doc','MDF-e','item','rntrc','ok', coalesce(r.veiculo_rntrc_ativo,false),'motivo','RNTRC do veículo não está ativo'),
    jsonb_build_object('doc','MDF-e','item','ciot','ok', r.numero_ciot is not null or r.forma_pagamento_tipo is null,'motivo','CIOT ainda não gerado'),
    jsonb_build_object('doc','MDF-e','item','averbacao','ok', r.averbacao_status is not null,'motivo','Averbação ainda não feita'),
    jsonb_build_object('doc','MDF-e','item','seguro','ok', not coalesce(r.excede_teto_seguro,false),'motivo','Valor da carga acima do teto da apólice'),
    jsonb_build_object('doc','Risco','item','rastreio','ok', not coalesce(r.rastreio_exigido,false) or r.rastreio_status is not null,'motivo','Rastreio exigido e não configurado'),
    jsonb_build_object('doc','Geral','item','bloqueio_fiscal','ok', not coalesce(r.bloqueio_fiscal,false),'motivo', coalesce(r.bloqueio_fiscal_motivo,'Bloqueio fiscal ativo')));
  return jsonb_build_object('operacao_id',p_operacao,
    'pode_emitir', not exists(select 1 from jsonb_array_elements(itens) e where (e->>'ok')::boolean = false),
    'pendencias', coalesce((select jsonb_agg(e) from jsonb_array_elements(itens) e where (e->>'ok')::boolean = false),'[]'::jsonb),
    'itens', itens,
    'alocacao', checar_alocacao(p_operacao));
end $function$;

delete from supabase_migrations.schema_migrations where name = 'operacao_nfes_cliente';
