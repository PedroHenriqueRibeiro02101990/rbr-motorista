-- Prospeccao: amplia os tipos de modelo aceitos (resp_cotacao e resp_recusa_carga), sem perder os 8 atuais. ADITIVA.
-- Depende de 20261116-1100 (prospeccao_modelos). Os dois modelos novos nascem INATIVOS ("A DEFINIR"): o Pedro escreve e ativa pelo painel.
-- Rollback: supabase/rollback/rollback-20261116-1300-prospeccao-modelos-tipos.sql
set local lock_timeout = '8s';

alter table public.prospeccao_modelos drop constraint if exists prospeccao_modelos_tipo_check;
alter table public.prospeccao_modelos add constraint prospeccao_modelos_tipo_check check (tipo in
  ('toque1', 'toque2', 'toque3', 'toque4', 'resp_sair', 'resp_agora_nao', 'resp_indicacao', 'resp_recebimento', 'resp_cotacao', 'resp_recusa_carga'));

insert into public.prospeccao_modelos (tipo, assunto, corpo, ativo) values
  ('resp_cotacao', 'Re: cotação', 'A DEFINIR (resposta quando a empresa pede cotação: sem valor de frete e sem prazo de coleta).', false),
  ('resp_recusa_carga', 'Re: sua solicitação', 'A DEFINIR (resposta educada quando a carga está fora do que a RBR atende: mudança, tanque, medicamentos, fertilizantes).', false)
on conflict (tipo) do nothing;
