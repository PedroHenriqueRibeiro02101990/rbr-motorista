-- Rollback de 20261116-1300: remove os dois modelos novos (se nao estiverem na jornada) e volta a restricao para os 8 tipos.
delete from public.prospeccao_modelos where tipo in ('resp_cotacao', 'resp_recusa_carga') and tipo not in (select modelo_tipo from public.prospeccao_jornada);
alter table public.prospeccao_modelos drop constraint if exists prospeccao_modelos_tipo_check;
alter table public.prospeccao_modelos add constraint prospeccao_modelos_tipo_check check (tipo in
  ('toque1', 'toque2', 'toque3', 'toque4', 'resp_sair', 'resp_agora_nao', 'resp_indicacao', 'resp_recebimento'));
