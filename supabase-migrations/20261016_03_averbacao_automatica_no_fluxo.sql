-- 20261016_03_averbacao_automatica_no_fluxo — JÁ APLICADA no banco real em 2026-10-16, por SQL direto em dois passos
-- (função e depois gatilho). NÃO está registrada em supabase_migrations.schema_migrations. Conteúdo reconstruído do banco
-- com pg_get_functiondef / pg_get_triggerdef e os grants atuais (EXECUTE só postgres e service_role); NÃO reaplicar.
--
-- Averbação automática: quando um documento vira 'emitido' em produção, CT-e chama enviar-averbacao (Allianz, RCTR-C) e
-- MDF-e chama enviar-averbacao-rcv (Sompo, RC-V), com o segredo do Vault 'sync_documentos_secret' via pg_net.
-- Falha nunca derruba a gravação do status (exceção engolida). A tela só mostra o resultado e oferece reenvio.

CREATE OR REPLACE FUNCTION public.trg_averbar_automatico_ao_emitir()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_funcao text;
  v_segredo text;
begin
  if new.status is distinct from 'emitido' then return new; end if;
  if tg_op = 'UPDATE' and old.status is not distinct from 'emitido' then return new; end if;
  if new.ambiente is distinct from 'producao' then return new; end if;

  if new.tipo::text = 'cte' then
    v_funcao := 'enviar-averbacao';
  elsif new.tipo::text = 'mdfe' then
    v_funcao := 'enviar-averbacao-rcv';
  else
    return new;
  end if;

  begin
    select decrypted_secret into v_segredo from vault.decrypted_secrets where name = 'sync_documentos_secret' limit 1;
    if v_segredo is null then return new; end if;
    perform net.http_post(
      url := 'https://kwscmegsfbtvlnyxougt.supabase.co/functions/v1/' || v_funcao,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-sync-secret', v_segredo),
      body := jsonb_build_object('operacao_id', new.operacao_id)
    );
  exception when others then
    null;
  end;
  return new;
end;
$function$;

revoke all on function public.trg_averbar_automatico_ao_emitir() from public, anon, authenticated;
grant execute on function public.trg_averbar_automatico_ao_emitir() to service_role;

drop trigger if exists trg_averbar_automatico_ao_emitir on public.documentacao_operacao;
CREATE TRIGGER trg_averbar_automatico_ao_emitir AFTER INSERT OR UPDATE OF status ON public.documentacao_operacao FOR EACH ROW EXECUTE FUNCTION trg_averbar_automatico_ao_emitir();
