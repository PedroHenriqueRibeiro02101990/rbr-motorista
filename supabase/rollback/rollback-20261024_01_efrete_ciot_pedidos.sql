-- Rollback de 20261024_01: apaga os pedidos/pagamentos de CIOT da efrete registrados (homologação).
drop table if exists public.efrete_ciot_pagamentos;
drop table if exists public.efrete_ciot_pedidos;
delete from supabase_migrations.schema_migrations where name = 'efrete_ciot_pedidos';
