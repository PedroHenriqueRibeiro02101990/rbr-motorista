-- Desfaz 20261119-0100-radar-modulo.sql. Os dados importados em prospeccao_base e as configuracoes novas sao PERDIDOS.
drop function if exists public.radar_mandar_para_lista(text[], boolean), public.radar_contagem_segmentos(), public.radar_buscar_base(jsonb),
  public.radar_importar_base(jsonb), public.radar_segmento_slug(text), public.radar_restricao_cnae(text);
drop table if exists public.prospeccao_curso_progresso, public.prospeccao_sugestoes, public.prospeccao_respostas_config,
  public.prospeccao_caixa_acoes, public.prospeccao_caixa_mensagens, public.prospeccao_buscas_salvas, public.prospeccao_base;
drop policy if exists prospeccao_anexos_sel on storage.objects;
drop policy if exists prospeccao_anexos_ins on storage.objects;
delete from storage.buckets where id = 'prospeccao-anexos';
delete from public.parametros_sistema where chave = 'PROSPECCAO_CAIXA_ESCOPO';
delete from public.prospeccao_modelos where tipo in ('resp_preco','resp_regiao','resp_veiculos','resp_seguro') or tipo like 'resp\_custom\_%';
alter table public.prospeccao_modelos drop constraint if exists prospeccao_modelos_tipo_check;
alter table public.prospeccao_modelos add constraint prospeccao_modelos_tipo_check check (tipo in
  ('toque1','toque2','toque3','toque4','resp_sair','resp_agora_nao','resp_indicacao','resp_recebimento','resp_cotacao','resp_recusa_carga'));
alter table public.prospeccao_respostas drop constraint if exists prospeccao_respostas_classificacao_check;
alter table public.prospeccao_respostas add constraint prospeccao_respostas_classificacao_check check (
  classificacao in ('cotacao','preco_prazo','nao_sou_eu','agora_nao','fora_do_escritorio','sair','reclamacao','outro'));
-- segmentos e status: so volta se nao houver empresas com os valores novos
alter table public.prospeccao_empresas drop constraint if exists prospeccao_empresas_segmento_check;
alter table public.prospeccao_empresas add constraint prospeccao_empresas_segmento_check check (segmento in ('alimentos','bebidas','plasticos','metalurgia','maquinas'));
alter table public.prospeccao_empresas drop constraint if exists prospeccao_empresas_status_check;
alter table public.prospeccao_empresas add constraint prospeccao_empresas_status_check check (status in
  ('novo','qualificado','em_aprovacao','em_contato','respondeu','quente','descartado','descadastrado','repouso'));
