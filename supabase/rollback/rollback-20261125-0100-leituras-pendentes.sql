-- Desfaz 20261125-0100 (remove a fila de leitura de fotos). Descarta leituras pendentes; o cache em documento_extracoes nao e tocado.
drop table if exists public.leituras_pendentes;
