-- 20261024_03 — NF-e do CLIENTE na operação (passo 4, bloco 1).
-- A RBR não emite NF-e em operação real: a nota da mercadoria é do cliente (embarcador). A RBR emite CT-e (ou NFS-e)
-- + MDF-e citando as notas do cliente. Uma carga pode ter várias notas.
--
-- Reaproveita a tabela operacao_nfes que já existia (vazia, sem tela que gravasse). Mantém `valor` (= valor total da
-- nota) e `peso_kg` (= peso bruto) porque a função do escudo de carga ilícita já lê esses nomes.
-- Novos: emitente/destinatário, NCM, cidades, caminho do XML no bucket privado operacao-nfe, origem
-- ('xml' | 'digitada' | 'cotacao'), quem criou.
-- RLS: gestor total (já existia); agenciador só nas operações dele; motorista só leitura das operações em que está
-- alocado. anon perde todos os grants (RLS já barrava; agora nem chega na tabela).
-- Chave: 44 dígitos e dígito verificador (reaproveita a função chave_nfe_valida que já existia).
-- checar_pre_voo: o item da NF-e passa a exigir nota do cliente em operacao_nfes; a chave da cotação só vale em
-- homologação ou em operação de teste.
-- Rollback: supabase/rollback/rollback-20261024_03_operacao_nfes_cliente.sql
set local lock_timeout = '8s';

alter table public.operacao_nfes
  add column emitente_cnpj text,
  add column emitente_nome text,
  add column destinatario_cnpj text,
  add column destinatario_nome text,
  add column ncm text,
  add column ncms text[],
  add column produto_predominante text,
  add column quantidade_volumes numeric,
  add column data_emissao date,
  add column municipio_origem text,
  add column uf_origem text,
  add column municipio_destino text,
  add column uf_destino text,
  add column arquivo_xml_path text,
  add column origem text not null default 'xml' check (origem in ('xml', 'digitada', 'cotacao')),
  add column criado_por uuid references public.pessoas(id) on delete set null,
  add constraint operacao_nfes_chave_dv check (public.chave_nfe_valida(chave_acesso)),
  add constraint operacao_nfes_xml_ou_digitada check (origem <> 'xml' or arquivo_xml_path is not null);
comment on column public.operacao_nfes.valor is 'Valor total da nota (vNF).';
comment on column public.operacao_nfes.peso_kg is 'Peso bruto da nota (soma de pesoB dos volumes).';
comment on column public.operacao_nfes.xml_url is 'Legado (não usado). O XML fica em arquivo_xml_path, no bucket privado operacao-nfe.';
create index operacao_nfes_chave_idx on public.operacao_nfes (chave_acesso);

revoke all on public.operacao_nfes from anon;

create policy agenciador_nfes_operacoes_proprias on public.operacao_nfes
  for all to authenticated
  using (exists (select 1 from public.operacoes o where o.id = operacao_id and o.agenciador_id = (select public.current_pessoa_id())))
  with check (exists (select 1 from public.operacoes o where o.id = operacao_id and o.agenciador_id = (select public.current_pessoa_id())));

create policy motorista_le_nfes_da_operacao on public.operacao_nfes
  for select to authenticated
  using (exists (select 1 from public.operacoes o where o.id = operacao_id and o.pessoa_alocada_id = (select public.current_pessoa_id())));

-- Bucket privado dos XML: caminho <operacao_id>/<chave>.xml
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('operacao-nfe', 'operacao-nfe', false, 2097152, array['text/xml', 'application/xml'])
on conflict (id) do nothing;

create policy operacao_nfe_gestor_acesso_total on storage.objects
  for all to authenticated
  using (bucket_id = 'operacao-nfe' and public.current_papel() = 'gestor_rbr'::public.papel_pessoa)
  with check (bucket_id = 'operacao-nfe' and public.current_papel() = 'gestor_rbr'::public.papel_pessoa);

create policy operacao_nfe_agenciador_proprias on storage.objects
  for all to authenticated
  using (
    bucket_id = 'operacao-nfe'
    and exists (select 1 from public.operacoes o where o.id::text = (storage.foldername(name))[1] and o.agenciador_id = public.current_pessoa_id())
  )
  with check (
    bucket_id = 'operacao-nfe'
    and exists (select 1 from public.operacoes o where o.id::text = (storage.foldername(name))[1] and o.agenciador_id = public.current_pessoa_id())
  );

create policy operacao_nfe_motorista_leitura on storage.objects
  for select to authenticated
  using (
    bucket_id = 'operacao-nfe'
    and exists (select 1 from public.operacoes o where o.id::text = (storage.foldername(name))[1] and o.pessoa_alocada_id = public.current_pessoa_id())
  );

-- NF duplicada em OUTRA operação: quem está na operação não enxerga as dos outros, então a checagem roda como
-- definer e devolve só as chaves repetidas (nenhum outro dado da outra operação).
create or replace function public.nfes_em_outra_operacao(p_operacao uuid, p_chaves text[])
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.pode_ver_operacao(p_operacao) then
    raise exception 'Sem permissão para esta operação.';
  end if;
  return coalesce((
    select array_agg(distinct n.chave_acesso)
    from public.operacao_nfes n
    join public.operacoes o on o.id = n.operacao_id
    where n.chave_acesso = any (p_chaves) and n.operacao_id <> p_operacao and o.deleted_at is null and o.status <> 'cancelada'
  ), '{}');
end;
$$;
revoke all on function public.nfes_em_outra_operacao(uuid, text[]) from public, anon;
grant execute on function public.nfes_em_outra_operacao(uuid, text[]) to authenticated;

-- Pré-voo: igual ao anterior, só muda o item da NF-e (nota do cliente na operação; cotação só em homologação/teste).
create or replace function public.checar_pre_voo(p_operacao uuid)
returns jsonb
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $function$
declare r record; itens jsonb; v_teste boolean; v_nfes int;
begin
  select * into r from v_checklist_prontidao where operacao_id = p_operacao;
  if not found then return jsonb_build_object('erro','operacao_nao_encontrada'); end if;
  select coalesce(o.eh_teste, false) into v_teste from operacoes o where o.id = p_operacao;
  select count(*) into v_nfes from operacao_nfes n where n.operacao_id = p_operacao;
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
    jsonb_build_object('doc','MDF-e','item','ciot','ok', r.numero_ciot is not null or r.forma_pagamento_tipo is null,'motivo','CIOT ainda não gerado'),
    jsonb_build_object('doc','MDF-e','item','averbacao','ok', r.averbacao_status is not null,'motivo','Averbação ainda não feita'),
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
