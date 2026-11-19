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
