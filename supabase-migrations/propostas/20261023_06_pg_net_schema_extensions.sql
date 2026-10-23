-- PROPOSTA (NÃO APLICADA) — 20261023_06 — registra a extensão pg_net no schema "extensions" (alerta extension_in_public).
-- Fato (23/10): só o REGISTRO da extensão está em public; as funções e tabelas dela ficam no schema "net"
-- (net.http_post etc.). A extensão NÃO é relocável (extrelocatable = false), então não existe
-- "alter extension ... set schema": é preciso recriar.
-- Quem usa net.http_post: gatilhos trg_averbar_automatico_ao_emitir e trg_fn_encerrar_mdfe_na_entrega e o cron
-- sincronizar-documentos-fiscais. As funções são plpgsql (resolvem "net.http_post" na hora de rodar), então não são
-- apagadas pelo drop; o cron também não.
-- Efeito colateral: a fila net.http_request_queue e as respostas em net._http_response são apagadas (em 23/10: 0 e 0).
-- As permissões do schema net são refeitas pelo gatilho de evento issue_pg_net_access (grant_pg_net_access).
-- Aplicar em horário sem emissão fiscal (ex.: noite), porque durante alguns segundos net.http_post não existe.
-- Rollback: supabase/rollback/rollback-20261023_06_pg_net_schema_extensions.sql
drop extension if exists pg_net;
create extension pg_net with schema extensions;
