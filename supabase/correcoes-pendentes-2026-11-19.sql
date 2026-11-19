-- CORRECOES DE DADOS PENDENTES - auditoria 19/11/2026.
-- NADA AQUI FOI EXECUTADO. O Pedro decide de manha. Cada bloco: (1) SELECT de conferencia, (2) UPDATE pronto.
-- Rode um bloco por vez no SQL Editor. Antes de cada UPDATE, confira o SELECT: so devem aparecer as linhas esperadas.
-- Todo UPDATE esta dentro de begin/commit COM uma conferencia de contagem; troque "commit" por "rollback" para ensaiar.

-- ============================================================================================================================
-- BLOCO 1 - is_veiculo_proprio = true com titular preenchido (26 veiculos da noite de 18/11), com AHP3H35 FORA
-- Motivo: o RPC antigo criava o veiculo com is_veiculo_proprio = true (DEFAULT da coluna). O emissor do MDF-e trata
-- is_veiculo_proprio = true como "frota da RBR" e NAO envia proprietario (mdfe.ts, proprietario()), mesmo havendo titular.
-- AHP3H35 fica de fora: pode ser comodato real da RBR (o teste do emissor trata como comodato). Decida depois.
-- ============================================================================================================================
-- (1) conferencia: espera-se 25 linhas (26 menos a AHP3H35), todas com titular_id preenchido
select placa, tipo_veiculo, e_reboque, tara_kg, titular_id, is_veiculo_proprio
from public.veiculos
where is_veiculo_proprio is true and titular_id is not null and placa <> 'AHP3H35'
order by placa;
-- (2) correcao
begin;
update public.veiculos set is_veiculo_proprio = false
where is_veiculo_proprio is true and titular_id is not null and placa <> 'AHP3H35';
-- conferir: nenhuma linha restante, exceto AHP3H35 (se ainda for true)
select placa from public.veiculos where is_veiculo_proprio is true and titular_id is not null;
commit;

-- ============================================================================================================================
-- BLOCO 2 - EFF2I58 e uma carreta mas esta com e_reboque = false (o MDF-e a trataria como veiculo de tracao)
-- ============================================================================================================================
select placa, tipo_veiculo, e_reboque, tara_kg from public.veiculos where placa = 'EFF2I58';
begin;
update public.veiculos set e_reboque = true where placa = 'EFF2I58' and e_reboque is not true;
select placa, e_reboque from public.veiculos where placa = 'EFF2I58';
commit;

-- ============================================================================================================================
-- BLOCO 3 - semirreboque/carreta cadastrado SEM e_reboque (outros alem da EFF2I58). So LISTAR: confirme cada placa antes.
-- ============================================================================================================================
select placa, tipo_veiculo, e_reboque, tara_kg, capacidade_carga
from public.veiculos
where deleted_at is null and ativo and e_reboque is not true and tipo_veiculo ~* 'semi|reboque|carreta'
order by placa;
-- depois de conferir, para as placas confirmadas (troque a lista):
-- update public.veiculos set e_reboque = true where placa in ('XXX0X00') and e_reboque is not true;

-- ============================================================================================================================
-- BLOCO 4 - tara fora da faixa plausivel (provavel erro de unidade: 25.5 em vez de 25500; 29 em vez de 29000). NAO corrigir em massa:
-- a tara certa vem do CRLV/pesagem de cada veiculo. Lista para o Pedro/Karen conferirem um a um.
-- Casos conhecidos da noite de 18/11: DBB9C49 (29 kg), EFF2I58 (61 kg), MKT6E78 (25.5), MLN9A91 (9.8), MRJ1B57 (22.5), AWJ0B09 (16.000 em cavalo).
-- ============================================================================================================================
select placa, tipo_veiculo, e_reboque, tara_kg, capacidade_carga, tara_origem
from public.veiculos
where deleted_at is null and ativo and tara_kg is not null
  and ((e_reboque is true and (tara_kg < 2000 or tara_kg > 20000)) or (e_reboque is not true and (tara_kg < 1000 or tara_kg > 30000)))
order by placa;
-- Modelo do UPDATE (um por placa, com o valor em KG conferido no CRLV/pesagem):
-- update public.veiculos set tara_kg = 9800, tara_origem = 'confirmada' where placa = 'MLN9A91';
-- Atencao: 25.5 / 9.8 / 22.5 sao toneladas (x 1000). Tara 61 e 29 kg nao tem conversao obvia: pedir o numero ao dono.

-- ============================================================================================================================
-- BLOCO 5 - RENAVAM provisorio 'PENDENTE-<placa>' (a RPC confirmar_cadastro_por_documentos grava isso quando o CRLV nao trouxe o RENAVAM)
-- O emissor/Repom leem esse texto como se fosse o RENAVAM. Corrigir um a um com o numero do CRLV.
-- ============================================================================================================================
select id, placa, renavam from public.veiculos where renavam like 'PENDENTE-%' order by placa;
-- Modelo: update public.veiculos set renavam = '00000000000' where placa = 'XXX0X00' and renavam like 'PENDENTE-%';

-- ============================================================================================================================
-- BLOCO 6 - veiculo criado pelo cadastro por documentos com titular = quem cadastrou (gestor/operacao/fiscal) em vez do dono
-- Causa: a RPC faz titular_id = coalesce(motorista_do_lote, ator). Sem CNH no lote, o titular vira o usuario logado.
-- Impacto: o MDF-e levaria o NOME/CPF/RNTRC do funcionario como proprietario do veiculo.
-- ============================================================================================================================
select v.placa, v.proprietario_documento, v.titular_id, p.papel as papel_do_titular
from public.veiculos v join public.pessoas p on p.id = v.titular_id
where p.papel in ('gestor_rbr', 'operacao', 'fiscal') and v.deleted_at is null
order by v.placa;
-- Correcao sugerida (SO apos conferir cada linha): apontar para a pessoa dona do documento do CRLV (quando ja existir cadastrada):
select v.placa, v.proprietario_documento, d.id as pessoa_dona, d.nome
from public.veiculos v
join public.pessoas p on p.id = v.titular_id and p.papel in ('gestor_rbr', 'operacao', 'fiscal')
left join public.pessoas d on d.deleted_at is null and (d.cpf = v.proprietario_documento or d.cnpj = v.proprietario_documento)
where v.deleted_at is null;
-- update public.veiculos v set titular_id = d.id from public.pessoas d
--  where d.deleted_at is null and (d.cpf = v.proprietario_documento or d.cnpj = v.proprietario_documento)
--    and v.titular_id in (select id from public.pessoas where papel in ('gestor_rbr','operacao','fiscal')) and v.deleted_at is null;

-- ============================================================================================================================
-- BLOCO 7 - arquivos ORFAOS no Storage e registros apontando para arquivo inexistente
-- Os SELECTs estao em docs/sql/auditoria-2026-11-19-consultas-f1.sql (secoes 1A e 1B). Arquivo no Storage NAO se apaga por SQL
-- (apagar linha de storage.objects deixa o arquivo fisico). Apague pelo painel do Supabase (Storage) ou pela API de Storage,
-- depois de conferir que o arquivo nao tem vinculo. Registros que apontam para arquivo inexistente: pedir o reenvio ao usuario.
-- ============================================================================================================================

-- ============================================================================================================================
-- BLOCO 8 - OP-3771: ciot_status = 'refazer_troca_veiculo' do evento antigo (a carreta vinculada ao CIOT manual ja emitido)
-- A regra nova (migracao 20261118-2300) nao marca mais. Se a OP-3771 ainda estiver marcada, e residuo do evento antigo.
-- ============================================================================================================================
select op.codigo, c.ciot, c.ciot_status, c.origem, c.ciot_emitido_em
from public.operacao_ciot_vpo c join public.operacoes op on op.id = c.operacao_id
where op.codigo = 'OP-3771';
-- Se ciot_status = 'refazer_troca_veiculo' e o CIOT manual de 12 digitos esta correto:
-- begin;
-- update public.operacao_ciot_vpo set ciot_status = 'emitido'
--  where operacao_id = (select id from public.operacoes where codigo = 'OP-3771') and ciot_status = 'refazer_troca_veiculo' and origem = 'manual';
-- commit;

-- ============================================================================================================================
-- ACRESCENTADO NA SESSAO DA MANHA (19/11/2026). NADA EXECUTADO. Rode DEPOIS de aplicar a migracao 20261119-0900 (os blocos 6B e 10 usam o que ela cria).
-- ============================================================================================================================

-- ============================================================================================================================
-- BLOCO 6B - titular = funcionario: de onde sai o NOME do dono quando a pessoa dona ainda NAO esta cadastrada
-- veiculos so guarda o DOCUMENTO do proprietario; o nome fica na leitura do CRLV (documento_extracoes). So LISTA: crie a pessoa dona pelo
-- Cadastros (ou pela insercao modelo) depois de conferir cada linha, e entao rode o UPDATE do bloco 6 (agora ele acha a dona).
-- ============================================================================================================================
select v.placa, v.proprietario_documento,
       de.campos->'normalizado'->'campos'->'nome_proprietario'->>'valor' as nome_proprietario_no_crlv,
       de.campos->'normalizado'->'campos'->'uf'->>'valor' as uf_no_crlv,
       exists (select 1 from public.pessoas d where d.deleted_at is null and (d.cpf = v.proprietario_documento or d.cnpj = v.proprietario_documento)) as dona_ja_cadastrada
from public.veiculos v
join public.pessoas p on p.id = v.titular_id and p.papel::text in ('gestor_rbr', 'operacao', 'fiscal')
left join public.documento_extracoes de on de.path = v.crlv_extracao_id
where v.deleted_at is null
order by v.placa;
-- Modelo (UMA pessoa por vez, com nome/UF/documento conferidos acima; CPF = 11 digitos, CNPJ = 14):
-- insert into public.pessoas (nome, papel, tipo_pessoa_doc, cpf, uf, documento_origem) values ('NOME DO CRLV', 'titular_motorista', 'PF', '00000000000', 'SP', 'documentos');
-- depois: o UPDATE do bloco 6.

-- ============================================================================================================================
-- BLOCO 9 - tipo do veiculo com texto cru do CRLV ("TRACAO CAMINHAO TRATOR"): o emissor do MDF-e nao reconhece e bloqueia a previa
-- (mapearTipoRodado so entende truck, toco, cavalo, van, utilitario). Conhecidos: SXR2E28 e MIT7D37. CRLV novo ja grava 'cavalo mecanico'.
-- ============================================================================================================================
select placa, tipo_veiculo, tipo_crlv, e_reboque, tipo_carroceria, quantidade_eixos
from public.veiculos
where deleted_at is null and tipo_veiculo ~* 'trator|tra[cç][aã]o' and tipo_veiculo !~* 'cavalo'
order by placa;   -- espera-se SXR2E28 e MIT7D37 (e nenhum reboque). Se aparecer outro, confira antes.
begin;
update public.veiculos set tipo_veiculo = 'cavalo mecanico'
where deleted_at is null and tipo_veiculo ~* 'trator|tra[cç][aã]o' and tipo_veiculo !~* 'cavalo' and e_reboque is not true and tipo_veiculo !~* 'reboque';
-- conferir: nenhuma linha restante, e os dois cavalos agora entendidos pelo emissor
select placa, tipo_veiculo from public.veiculos where placa in ('SXR2E28', 'MIT7D37');
select placa, tipo_veiculo from public.veiculos where deleted_at is null and tipo_veiculo ~* 'trator|tra[cç][aã]o' and tipo_veiculo !~* 'cavalo';
commit;

-- ============================================================================================================================
-- BLOCO 10 - documentos ja enviados pelo cadastro por documentos SEM vinculo (D1): CNH, RG, CPF, RNTRC e comprovante ficaram so em
-- cadastro_auditoria.documento_path e em documento_extracoes. Liga cada arquivo a pessoa/veiculo que a auditoria registrou.
-- Depende da migracao 20261119-0900 (o CHECK de tipos precisa aceitar cpf/rntrc/dados_bancarios).
-- ============================================================================================================================
-- (1) conferencia: um arquivo por (entidade, tipo); mostra o que SERIA ligado e se ja existe vinculo
select a.entidade, a.entidade_id, a.documento_tipo, 'cadastro-documentos/' || a.documento_path as arquivo_url,
       exists (select 1 from public.documentos_pessoais_imagens d where d.arquivo_url = 'cadastro-documentos/' || a.documento_path) as ja_vinculado,
       (select count(*) from public.documento_extracoes de where de.path = 'cadastro-documentos/' || a.documento_path) as tem_extracao
from (select distinct entidade, entidade_id, documento_tipo, documento_path from public.cadastro_auditoria
      where documento_path is not null and documento_tipo in ('cnh', 'rg', 'cpf', 'rntrc', 'comprovante_residencia', 'dados_bancarios', 'crlv')) a
order by a.entidade, a.entidade_id, a.documento_tipo;
-- (2) correcao (idempotente: so insere o que ainda nao esta ligado)
begin;
insert into public.documentos_pessoais_imagens (tipo, arquivo_url, pessoa_id, veiculo_id, campos_extraidos, extraido_em)
select a.documento_tipo, 'cadastro-documentos/' || a.documento_path,
       case when a.entidade = 'pessoa' then a.entidade_id end, case when a.entidade = 'veiculo' then a.entidade_id end,
       de.campos, case when de.campos is null then null else now() end
from (select distinct entidade, entidade_id, documento_tipo, documento_path from public.cadastro_auditoria
      where documento_path is not null and documento_tipo in ('cnh', 'rg', 'cpf', 'rntrc', 'comprovante_residencia', 'dados_bancarios', 'crlv')) a
left join public.documento_extracoes de on de.path = 'cadastro-documentos/' || a.documento_path
where not exists (select 1 from public.documentos_pessoais_imagens d where d.arquivo_url = 'cadastro-documentos/' || a.documento_path
                  and d.tipo = a.documento_tipo and d.pessoa_id is not distinct from (case when a.entidade = 'pessoa' then a.entidade_id end)
                  and d.veiculo_id is not distinct from (case when a.entidade = 'veiculo' then a.entidade_id end));
-- colunas da pessoa: CNH e comprovante (so onde estao vazias)
update public.pessoas p set cnh_foto_url = 'cadastro-documentos/' || x.documento_path, cnh_extracao_id = coalesce(p.cnh_extracao_id, 'cadastro-documentos/' || x.documento_path)
from (select distinct on (entidade_id) entidade_id, documento_path from public.cadastro_auditoria where entidade = 'pessoa' and documento_tipo = 'cnh' and documento_path is not null order by entidade_id, confirmado_em desc) x
where p.id = x.entidade_id and p.cnh_foto_url is null;
update public.pessoas p set comprovante_residencia_url = 'cadastro-documentos/' || x.documento_path
from (select distinct on (entidade_id) entidade_id, documento_path from public.cadastro_auditoria where entidade = 'pessoa' and documento_tipo = 'comprovante_residencia' and documento_path is not null order by entidade_id, confirmado_em desc) x
where p.id = x.entidade_id and p.comprovante_residencia_url is null;
-- conferir: nenhum documento do cadastro por documentos ficou sem vinculo
select count(*) as sem_vinculo from (select distinct documento_path, documento_tipo from public.cadastro_auditoria
  where documento_path is not null and documento_tipo in ('cnh', 'rg', 'cpf', 'rntrc', 'comprovante_residencia', 'dados_bancarios', 'crlv')) a
where not exists (select 1 from public.documentos_pessoais_imagens d where d.arquivo_url = 'cadastro-documentos/' || a.documento_path);
commit;
