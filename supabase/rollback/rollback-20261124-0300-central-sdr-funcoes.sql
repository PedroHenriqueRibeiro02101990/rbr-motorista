-- Desfaz 20261124-0300-central-sdr-funcoes.sql (so apaga as 3 funcoes; nenhum dado e tocado).
drop function if exists public.central_sdr_concluir(uuid, text, text), public.central_sdr_lista(), public.central_sdr_encher();
