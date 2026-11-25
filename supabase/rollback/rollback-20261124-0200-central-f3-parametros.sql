-- Desfaz 20261124-0200-central-f3-parametros.sql (so apaga os tres parametros).
delete from public.parametros_sistema where chave in ('CENTRAL_PREFIXOS_SETOR', 'CENTRAL_PREVOO_MARCAS', 'CENTRAL_METAS');
