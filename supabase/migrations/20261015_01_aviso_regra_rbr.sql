-- 20261015_01 — Aviso de regra da RBR nos eventos fiscais da operação (Parte C, 2026-10-15)
--
-- Regras internas da RBR deixaram de bloquear a emissão (ex.: destino de pagamento do motorista no MDF-e) e viram
-- aviso. Para o aviso não se perder depois da tela do momento, a emitir-mdfe (v16) grava um evento
-- 'aviso_regra_rbr' em eventos_fiscais_operacao, que a operação já mostra em "eventos" do MDF-e.
-- Aplicar ANTES de publicar a emitir-mdfe v16 (sem isto o insert do evento falha no CHECK; a emissão segue,
-- mas o aviso não fica registrado).

alter table public.eventos_fiscais_operacao drop constraint if exists eventos_fiscais_operacao_evento_check;
alter table public.eventos_fiscais_operacao add constraint eventos_fiscais_operacao_evento_check
  check (evento = any (array['encerramento', 'cancelamento', 'carta_correcao', 'inclusao_condutor', 'aviso_regra_rbr']));
