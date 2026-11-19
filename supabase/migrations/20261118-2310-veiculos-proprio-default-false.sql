-- A7 (18/11/2026): veiculos.is_veiculo_proprio = true e lido pelo emissor como "frota da RBR" (MDF-e sem proprietario e sem tpTransp).
-- A RBR nao tem frota propria; o cadastro por documentos (confirmar_cadastro_por_documentos) insere sem informar o campo e herdava o default true,
-- gravando true para veiculo de motorista TAC. So muda o DEFAULT (vale para insercoes futuras); NENHUMA linha existente e alterada.
-- Rollback: supabase/rollback/rollback-20261118-2310-veiculos-proprio-default-false.sql
alter table public.veiculos alter column is_veiculo_proprio set default false;
