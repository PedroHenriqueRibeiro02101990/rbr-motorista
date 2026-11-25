-- Desfaz 20261124-0100-central-base.sql. Apaga tudo que a Central criou (robos, comandos, batimentos, uso, registro e Fila do SDR) e os parametros CENTRAL_*.
-- NAO mexe em nenhum dado de prospeccao_* nem de leads. A coluna lote_importacao e removida (os dados da base ficam, so perdem a marca do lote).
drop trigger if exists trg_central_flag_guarda on public.parametros_sistema;
drop table if exists public.central_sdr_fila, public.central_registro, public.central_uso, public.central_heartbeat, public.central_comandos, public.central_robos;
drop function if exists public.central_sdr_devolver(uuid), public.central_sdr_assumir(uuid, uuid), public.central_desfazer_lote(text),
  public.central_importar_base(jsonb, text), public.central_robo_resultado(text, timestamptz, timestamptz, text),
  public.central_comando_atualizar(uuid, text, text, jsonb), public.central_registrar_uso(text, text, date, numeric),
  public.central_batimento(text, text, jsonb), public.central_marcar_desfeito(uuid), public.central_registrar(text, jsonb, jsonb, boolean),
  public.trg_fn_central_robos_guarda(), public.trg_fn_central_comandos_guarda(), public.trg_fn_central_sdr_fila_guarda(),
  public.trg_fn_central_flag_guarda(), public.central_eh_agente(), public.central_eh_sdr(), public.central_eh_admin();
drop index if exists public.prospeccao_base_lote_idx;
alter table public.prospeccao_base drop column if exists lote_importacao;
delete from public.parametros_sistema where chave like 'CENTRAL\_%';
-- O valor 'agente_central' do tipo papel_pessoa NAO e removido (o Postgres nao remove valor de enum). Fica sem uso e sem nenhuma permissao. Antes de reverter, apague/troque a pessoa do agente em pessoas.
