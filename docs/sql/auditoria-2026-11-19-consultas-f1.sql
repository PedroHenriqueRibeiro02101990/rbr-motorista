-- AUDITORIA 19/11/2026 - F1: PROVA NO BANCO. SOMENTE SELECT (nenhum INSERT/UPDATE/DELETE).
-- Por que existe: na noite da auditoria a sessao NAO tinha acesso ao banco (sem MCP do Supabase, sem CLI logada, sem psql),
-- entao estas consultas NAO foram executadas. Rode no SQL Editor do Supabase (papel postgres) e cole os numeros no relatorio.
-- Colunas conferidas nas migracoes do repositorio; se alguma coluna nao existir no banco, a consulta avisa o nome na mensagem de erro.

-- 1A) Arquivos no Storage SEM vinculo (por bucket) -------------------------------------------------------------------
-- operacao-documentos (vinculo: documentacao_operacao.arquivo_path e arquivo_historico; ordens_coleta.pdf_path)
select 'operacao-documentos' as bucket, o.name as path, o.created_at
from storage.objects o
where o.bucket_id = 'operacao-documentos'
  and not exists (select 1 from documentacao_operacao d where d.arquivo_path = o.name or o.name = any (coalesce(d.arquivo_historico, '{}')))
  and not exists (select 1 from ordens_coleta c where c.pdf_path = o.name)
order by o.created_at desc limit 200;

-- operacao-nfe (vinculo: operacao_nfes.arquivo_xml_path)
select 'operacao-nfe' as bucket, o.name, o.created_at from storage.objects o
where o.bucket_id = 'operacao-nfe' and not exists (select 1 from operacao_nfes n where n.arquivo_xml_path = o.name)
order by o.created_at desc limit 200;

-- documentos-pessoais (vinculo: documentos_pessoais_imagens.arquivo_url; comprovante de residencia: pessoas.comprovante_residencia_url, se existir)
select 'documentos-pessoais' as bucket, o.name, o.created_at from storage.objects o
where o.bucket_id = 'documentos-pessoais'
  and not exists (select 1 from documentos_pessoais_imagens i where i.arquivo_url = o.name)
  and not exists (select 1 from veiculos v where v.crlv_foto_url = o.name)
order by o.created_at desc limit 200;
-- pasta "pessoa/novo/" = comprovante enviado antes de salvar o cadastro (ComprovanteResidencia.tsx): confira se virou vinculo
select o.name, o.created_at from storage.objects o where o.bucket_id = 'documentos-pessoais' and o.name like 'pessoa/novo/%' order by o.created_at desc limit 100;

-- cadastro-documentos (vinculo so existe via cadastro_auditoria.documento_path e veiculos.crlv_foto_url = 'cadastro-documentos/<path>')
select 'cadastro-documentos' as bucket, o.name, o.created_at from storage.objects o
where o.bucket_id = 'cadastro-documentos'
  and not exists (select 1 from cadastro_auditoria a where a.documento_path = o.name)
  and not exists (select 1 from veiculos v where v.crlv_foto_url = 'cadastro-documentos/' || o.name)
order by o.created_at desc limit 200;

-- 1B) Registros apontando para arquivo INEXISTENTE ---------------------------------------------------------------------
select d.id, d.operacao_id, d.tipo, d.arquivo_path
from documentacao_operacao d
where d.arquivo_path is not null and not exists (select 1 from storage.objects o where o.bucket_id = 'operacao-documentos' and o.name = d.arquivo_path);
select n.id, n.operacao_id, n.arquivo_xml_path from operacao_nfes n
where n.arquivo_xml_path is not null and not exists (select 1 from storage.objects o where o.bucket_id = 'operacao-nfe' and o.name = n.arquivo_xml_path);
select i.id, i.pessoa_id, i.veiculo_id, i.tipo, i.arquivo_url from documentos_pessoais_imagens i
where i.arquivo_url is not null and not exists (select 1 from storage.objects o where o.bucket_id = 'documentos-pessoais' and o.name = i.arquivo_url);

-- 1C) Uploads SEM extracao (chave de documento_extracoes.path = '<bucket>/<path>'), ultimos 30 dias, por tipo ----------------
select d.tipo, count(*) as uploads, count(*) filter (where e.path is null) as sem_extracao
from documentacao_operacao d
left join documento_extracoes e on e.path = 'operacao-documentos/' || d.arquivo_path
where d.arquivo_path is not null and d.tipo in ('ciot', 'vpo') and d.arquivo_enviado_em > now() - interval '30 days'
group by d.tipo;
-- exemplos (operacao) de VPR/contrato CIOT enviados e nunca lidos
select op.codigo, d.tipo, d.arquivo_nome, d.arquivo_enviado_em
from documentacao_operacao d join operacoes op on op.id = d.operacao_id
left join documento_extracoes e on e.path = 'operacao-documentos/' || d.arquivo_path
where d.tipo in ('ciot', 'vpo') and d.arquivo_path is not null and e.path is null and d.arquivo_enviado_em > now() - interval '30 days'
order by d.arquivo_enviado_em desc;
-- cadastro por documentos: fotos sem leitura
select o.name, o.created_at from storage.objects o
left join documento_extracoes e on e.path = 'cadastro-documentos/' || o.name
where o.bucket_id = 'cadastro-documentos' and o.created_at > now() - interval '30 days' and e.path is null order by o.created_at desc;
-- app do motorista/agenciador: documentos_pessoais_imagens sem campos extraidos
select tipo, count(*) as total, count(*) filter (where campos_extraidos is null) as sem_leitura
from documentos_pessoais_imagens where created_at > now() - interval '30 days' group by tipo order by tipo;

-- 1D) Extracao com SUCESSO cujo valor NAO chegou no campo de destino -------------------------------------------------------
-- CRLV (cadastro-documentos) x veiculos: placa, renavam, tara, proprietario
select e.path, e.campos->'normalizado'->'campos'->'placa'->>'valor' as placa_lida,
       v.id as veiculo_id, v.renavam, v.tara_kg, v.proprietario_documento, v.e_reboque, v.is_veiculo_proprio, v.titular_id
from documento_extracoes e
left join veiculos v on v.crlv_foto_url = e.path
where e.tipo = 'crlv' and e.path like 'cadastro-documentos/%' and e.criado_em > now() - interval '60 days'
order by e.criado_em desc;
-- ... CRLV lido com placa que nao existe em veiculos (leu e ninguem gravou)
select e.path, e.campos->'normalizado'->'campos'->'placa'->>'valor' as placa_lida from documento_extracoes e
where e.tipo = 'crlv' and not exists (select 1 from veiculos v where v.placa = e.campos->'normalizado'->'campos'->'placa'->>'valor');
-- CNH lida x pessoas (cpf gravado?)
select e.path, e.campos->'normalizado'->'campos'->'cpf'->>'valor' as cpf_lido,
       exists (select 1 from pessoas p where p.cpf = e.campos->'normalizado'->'campos'->'cpf'->>'valor') as pessoa_existe
from documento_extracoes e where e.tipo = 'cnh' order by e.criado_em desc limit 100;
-- VPR lido x operacao_ciot_vpo (IDVPO e valor)
select e.path, e.campos->'normalizado'->'campos'->'idvpo'->>'valor' as idvpo_lido, e.campos->'normalizado'->'campos'->'valor_total'->>'valor' as valor_lido,
       c.operacao_id, c.vpo_idvpo, c.vpo_valor
from documento_extracoes e
left join operacao_ciot_vpo c on c.vpo_idvpo = e.campos->'normalizado'->'campos'->'idvpo'->>'valor'
where e.tipo = 'vpr_vale_pedagio' order by e.criado_em desc;
-- contrato CIOT lido x operacao_ciot_vpo (CIOT de 12 digitos)
select e.path, e.campos->'normalizado'->'campos'->'ciot'->>'valor' as ciot_lido, c.operacao_id, c.ciot, c.ciot_verificador
from documento_extracoes e left join operacao_ciot_vpo c on c.ciot = e.campos->'normalizado'->'campos'->'ciot'->>'valor'
where e.tipo = 'contrato_ciot_repom' order by e.criado_em desc;
-- datas lidas fora do padrao ISO (CNH validade) - efeito do bug de data corrigido nesta auditoria
select e.path, e.campos->'normalizado'->'campos'->'validade'->>'valor' as validade_lida from documento_extracoes e
where e.tipo = 'cnh' and (e.campos->'normalizado'->'campos'->'validade'->>'valor') !~ '^\d{4}-\d{2}-\d{2}$';
-- pessoas com CNH criadas pelo cadastro por documentos: validade gravada x lida
select p.id, p.cnh_validade, p.cnh_extracao_id, p.documento_origem from pessoas p where p.documento_origem = 'documentos' order by p.created_at desc limit 50;

-- 1E) Chaves das NF-e x operacao
select op.codigo, count(n.*) as notas, count(n.*) filter (where n.arquivo_xml_path is null) as sem_xml
from operacoes op left join operacao_nfes n on n.operacao_id = op.id
where op.status not in ('cancelada', 'concluida') group by op.codigo having count(n.*) = 0 order by op.codigo;

-- 1F) Extracoes com erro: a extrair-documento NAO grava falha em tabela; o unico rastro e o log da funcao
-- (Dashboard > Edge Functions > extrair-documento > Logs: procurar "ok":false). Contagem de uploads sem extracao (1C) e o melhor proxy.

-- 1G) Caminhos fora do padrao
select o.bucket_id, o.name from storage.objects o
where (o.bucket_id = 'operacao-documentos' and o.name !~ '^[0-9a-f-]{36}/(cte|mdfe|vpo|ciot|ordem-coleta|[a-z_]+)/')
   or (o.bucket_id = 'operacao-nfe' and o.name !~ '^[0-9a-f-]{36}/')
   or (o.bucket_id = 'documentos-pessoais' and o.name !~ '^(pessoa|veiculo)/[0-9a-f-]{36}/')
limit 200;

-- 1H) Campos exigidos pelo emissor vazios ou fora de faixa (veiculos e pessoas ATIVOS)
-- tara fora da faixa plausivel (carreta 2.000-20.000; demais 1.000-30.000), e_reboque falso em semirreboque, proprio com titular
select v.placa, v.tipo_veiculo, v.e_reboque, v.tara_kg, v.capacidade_carga, v.is_veiculo_proprio, v.titular_id,
  case
    when v.tara_kg is null then 'sem tara'
    when (v.e_reboque or v.tipo_veiculo ~* 'carreta|semi|reboque') and (v.tara_kg < 2000 or v.tara_kg > 20000) then 'tara fora da faixa (carreta)'
    when not (v.e_reboque or v.tipo_veiculo ~* 'carreta|semi|reboque') and (v.tara_kg < 1000 or v.tara_kg > 30000) then 'tara fora da faixa'
  end as problema_tara,
  (v.tipo_veiculo ~* 'semi|reboque|carreta' and v.e_reboque is not true) as semirreboque_sem_e_reboque,
  (v.is_veiculo_proprio and v.titular_id is not null) as proprio_com_titular,
  (v.renavam like 'PENDENTE-%') as renavam_provisorio,
  (v.uf_licenciamento is null) as sem_uf_licenciamento
from veiculos v where v.deleted_at is null and v.ativo
  and (v.tara_kg is null or v.tara_kg < 1000 or v.tara_kg > 30000 or (v.tipo_veiculo ~* 'semi|reboque|carreta' and v.e_reboque is not true)
       or (v.is_veiculo_proprio and v.titular_id is not null) or v.renavam like 'PENDENTE-%' or v.uf_licenciamento is null)
order by v.placa;
-- titular (proprietario) sem o que o MDF-e exige: documento, RNTRC de 8 digitos, UF
select p.id, p.papel, (p.cpf is null and p.cnpj is null) as sem_documento, (length(regexp_replace(coalesce(p.rntrc_numero, ''), '\D', '', 'g')) not between 1 and 8) as rntrc_ruim,
       (p.uf is null) as sem_uf, (p.cnpj is null and p.uf is null) as pf_sem_uf
from pessoas p where p.id in (select titular_id from veiculos where titular_id is not null and deleted_at is null and ativo)
  and ((p.cpf is null and p.cnpj is null) or coalesce(p.rntrc_numero, '') = '' or p.uf is null);
-- veiculos criados pelo cadastro por documentos com titular = quem cadastrou (gestor/operacao) em vez do dono
select v.placa, v.titular_id, p.papel from veiculos v join pessoas p on p.id = v.titular_id
where p.papel in ('gestor_rbr', 'operacao', 'fiscal') and v.deleted_at is null;
-- operacoes abertas: motorista/veiculo/carreta alocados e o que falta
select op.codigo, op.status, op.veiculo_id is null as sem_veiculo, op.pessoa_alocada_id is null as sem_motorista,
       (select count(*) from operacao_reboques r where r.operacao_id = op.id) as carretas
from operacoes op where op.status not in ('cancelada', 'concluida', 'rascunho') order by op.codigo;

-- ============================================================================================================================
-- Acrescentado na sessao da manha de 19/11/2026 (SO LEITURA). 1I = S1 (buckets); 1J = o que conferir ANTES da migracao 20261119-0900;
-- 1K = veiculos cujo tipo ou carroceria o emissor do MDF-e nao entende.
-- ============================================================================================================================
-- 1I) S1: buckets (nenhum bucket de documento pessoal pode estar public = true) e policies de storage
select id, name, public, file_size_limit, allowed_mime_types from storage.buckets order by id;
select policyname, cmd, roles, qual, with_check from pg_policies where schemaname = 'storage' and tablename = 'objects' order by policyname;

-- 1J) Antes de aplicar 20261119-0900: gatilhos, indices e checks que a nova linha de documentos_pessoais_imagens / pessoas vai encontrar
select tgname, tgenabled, pg_get_triggerdef(oid) as definicao from pg_trigger where tgrelid = 'public.documentos_pessoais_imagens'::regclass and not tgisinternal;
select indexname, indexdef from pg_indexes where schemaname = 'public' and tablename = 'documentos_pessoais_imagens';
select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.pessoas'::regclass and contype = 'c';
select unnest(enum_range(null::papel_pessoa)) as papel;

-- 1K) Tipo de rodado/carroceria que o emissor nao entende (bloqueia a previa do MDF-e)
select placa, tipo_veiculo, tipo_crlv, e_reboque, tipo_carroceria,
  (tipo_veiculo is null or (tipo_veiculo !~* 'truck|toco|cavalo|van|utilit|fiorino|vuc|3/4|reboque|carreta')) as tipo_que_o_emissor_nao_entende,
  (e_reboque is not true and tipo_veiculo !~* 'cavalo' and (tipo_carroceria is null or tipo_carroceria !~* 'sider|container|conteiner|granel|bau|baú|fechad|abert|grade|prancha|nao aplic|não aplic')) as carroceria_de_tracao_que_o_emissor_nao_entende,
  (e_reboque is true and (tipo_carroceria is null or tipo_carroceria !~* 'sider|container|conteiner|granel|bau|baú|fechad|abert|grade|prancha|nao aplic|não aplic')) as carroceria_de_reboque_que_o_emissor_nao_entende
from veiculos where deleted_at is null and ativo
  and (tipo_veiculo is null or tipo_veiculo !~* 'truck|toco|cavalo|van|utilit|fiorino|vuc|3/4|reboque|carreta'
       or (e_reboque is not true and tipo_veiculo !~* 'cavalo' and (tipo_carroceria is null or tipo_carroceria !~* 'sider|container|conteiner|granel|bau|baú|fechad|abert|grade|prancha|nao aplic|não aplic'))
       or (e_reboque is true and (tipo_carroceria is null or tipo_carroceria !~* 'sider|container|conteiner|granel|bau|baú|fechad|abert|grade|prancha|nao aplic|não aplic')))
order by placa;
