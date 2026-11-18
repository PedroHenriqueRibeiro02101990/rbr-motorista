-- Rollback da Parte A da Prospeccao. Apaga as tabelas prospeccao_* (e os dados nelas), funcoes, gatilhos e flags.
drop trigger if exists trg_prospeccao_flag_guarda on public.parametros_sistema;
delete from public.parametros_sistema where chave in ('PROSPECCAO_UI_LIBERADA', 'PROSPECCAO_ENVIO_LIBERADO', 'PROSPECCAO_LIMITE_DIARIO');
drop table if exists public.prospeccao_envio_diario, public.prospeccao_respostas, public.prospeccao_mensagens,
  public.prospeccao_contatos, public.prospeccao_empresas, public.prospeccao_bloqueio, public.prospeccao_pesos cascade;
drop function if exists public.trg_fn_prospeccao_flag_guarda(), public.prospeccao_eh_pedro(), public.prospeccao_auditar(text, jsonb),
  public.trg_fn_prospeccao_bloqueio_auditoria(), public.trg_fn_prospeccao_mensagem_regras(), public.prospeccao_contato_bloqueado(text),
  public.trg_fn_prospeccao_pesos_recalcular(), public.trg_fn_prospeccao_empresa_pontuar(), public.prospeccao_calcular_pontuacao(jsonb, int, boolean);
