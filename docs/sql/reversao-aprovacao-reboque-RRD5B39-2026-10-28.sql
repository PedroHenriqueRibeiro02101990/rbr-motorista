-- Reversão da aprovação TEMPORÁRIA do semirreboque de teste RRD5B39 (2f568e42-7ab7-4a63-9f5c-ccec3789e845).
-- Escrita ANTES da mudança. Estado original (2026-10-28 09:00 UTC): aprovacao_status = 'aguardando_documentos',
-- aprovacao_origem = 'automatica', aprovacao_em/por/motivo/hash = null.
-- A aprovação foi feita só para rodar o ciclo do CIOT na operação de teste 965ceb0d (homologação).
update public.veiculos
   set aprovacao_status = 'aguardando_documentos'
 where id = '2f568e42-7ab7-4a63-9f5c-ccec3789e845' and eh_teste is true;
-- Se algum outro campo de aprovação tiver sido alterado pelo gatilho, restaurar também:
-- update public.veiculos set aprovacao_origem='automatica', aprovacao_em=null, aprovacao_por=null, aprovacao_motivo=null, aprovacao_hash=null where id='2f568e42-7ab7-4a63-9f5c-ccec3789e845';
