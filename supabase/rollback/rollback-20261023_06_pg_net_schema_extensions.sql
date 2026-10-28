-- Rollback da proposta 20261023_06: volta o registro da extensão para public (estado de 23/10/2026).
drop extension if exists pg_net;
create extension pg_net with schema public;
