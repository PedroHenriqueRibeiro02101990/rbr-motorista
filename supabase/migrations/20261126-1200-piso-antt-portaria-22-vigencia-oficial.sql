-- Correcao ADITIVA da Portaria SUROC 22 apos conferir o texto no ANTTlegis (ANTT):
--  1) vigencia: publicada no DOU em 29/09/2026 (edicao extra); Art. 3 "entra em vigor no dia seguinte ao de sua publicacao"
--     => 30/09/2026 (a migration 1000 tinha usado 01/10/2026). Corrige so a data das linhas novas e o fim das antigas.
--  2) linha A Perigosa (granel liquido) 7 eixos: o texto oficial traz CCD 9,1849 (CC 1.013,95) -> entra e a antiga fecha.
--  3) Tabela C: o texto oficial confirma Neogranel 2 eixos CCD 3,0767 -> as 78 linhas da Tabela C entram.
-- Nada e apagado. Valores antigos de CCD/CC nao mudam.

update public.piso_antt_coeficientes
   set data_vigencia = date '2026-09-30'
 where data_vigencia = date '2026-10-01' and fonte like 'Portaria SUROC 22/2026%';

update public.piso_antt_coeficientes
   set vigencia_fim = date '2026-09-29'
 where data_vigencia = date '2026-07-17' and vigencia_fim = date '2026-09-30';

with novos(tabela, tipo_carga, eixos, ccd, cc) as (values
  ('C', 'Granel solido', 2, 3.4876, 174.38),
  ('C', 'Granel solido', 3, 4.4476, 198.05),
  ('C', 'Granel solido', 4, 5.0799, 215.03),
  ('C', 'Granel solido', 5, 5.829, 229.64),
  ('C', 'Granel solido', 6, 6.5029, 232.91),
  ('C', 'Granel solido', 7, 6.8871, 270.36),
  ('C', 'Granel solido', 9, 7.8999, 292.59),
  ('C', 'Granel liquido', 2, 3.535, 176.84),
  ('C', 'Granel liquido', 3, 4.5028, 201.78),
  ('C', 'Granel liquido', 4, 5.1771, 220.31),
  ('C', 'Granel liquido', 5, 5.931, 235.73),
  ('C', 'Granel liquido', 6, 6.6068, 239.32),
  ('C', 'Granel liquido', 7, 6.9785, 274.70),
  ('C', 'Granel liquido', 9, 7.9988, 298.16),
  ('C', 'Frigorificada ou Aquecida', 2, 4.1786, 205.65),
  ('C', 'Frigorificada ou Aquecida', 3, 5.3115, 232.97),
  ('C', 'Frigorificada ou Aquecida', 4, 6.0901, 256.16),
  ('C', 'Frigorificada ou Aquecida', 5, 6.9516, 271.54),
  ('C', 'Frigorificada ou Aquecida', 6, 7.747, 274.63),
  ('C', 'Frigorificada ou Aquecida', 7, 8.2358, 329.34),
  ('C', 'Frigorificada ou Aquecida', 9, 9.3985, 351.60),
  ('C', 'Conteinerizada', 3, 4.4378, 196.43),
  ('C', 'Conteinerizada', 4, 5.054, 210.75),
  ('C', 'Conteinerizada', 5, 5.8061, 225.87),
  ('C', 'Conteinerizada', 6, 6.4794, 229.04),
  ('C', 'Conteinerizada', 7, 6.8862, 270.22),
  ('C', 'Conteinerizada', 9, 7.8701, 287.67),
  ('C', 'Carga Geral', 2, 3.4762, 172.50),
  ('C', 'Carga Geral', 3, 4.4341, 195.81),
  ('C', 'Carga Geral', 4, 5.0693, 213.27),
  ('C', 'Carga Geral', 5, 5.8195, 228.08),
  ('C', 'Carga Geral', 6, 6.4924, 231.17),
  ('C', 'Carga Geral', 7, 6.9018, 272.80),
  ('C', 'Carga Geral', 9, 7.8926, 291.39),
  ('C', 'Neogranel', 2, 3.0767, 172.50),
  ('C', 'Neogranel', 3, 4.4335, 195.72),
  ('C', 'Neogranel', 4, 5.0791, 214.89),
  ('C', 'Neogranel', 5, 5.8195, 228.08),
  ('C', 'Neogranel', 6, 6.4924, 231.17),
  ('C', 'Neogranel', 7, 6.9018, 272.80),
  ('C', 'Neogranel', 9, 7.8926, 291.39),
  ('C', 'Perigosa (granel solido)', 2, 4.0241, 224.77),
  ('C', 'Perigosa (granel solido)', 3, 4.9948, 250.19),
  ('C', 'Perigosa (granel solido)', 4, 5.6653, 270.47),
  ('C', 'Perigosa (granel solido)', 5, 6.4144, 285.09),
  ('C', 'Perigosa (granel solido)', 6, 7.0883, 288.36),
  ('C', 'Perigosa (granel solido)', 7, 7.4921, 329.05),
  ('C', 'Perigosa (granel solido)', 9, 8.5135, 352.70),
  ('C', 'Perigosa (granel liquido)', 2, 4.0551, 229.89),
  ('C', 'Perigosa (granel liquido)', 3, 5.0336, 256.60),
  ('C', 'Perigosa (granel liquido)', 4, 5.7135, 278.43),
  ('C', 'Perigosa (granel liquido)', 5, 6.4674, 293.85),
  ('C', 'Perigosa (granel liquido)', 6, 7.1433, 297.43),
  ('C', 'Perigosa (granel liquido)', 7, 7.5346, 336.06),
  ('C', 'Perigosa (granel liquido)', 9, 8.5635, 360.94),
  ('C', 'Perigosa (frigorificada ou aquecida)', 2, 4.6738, 253.51),
  ('C', 'Perigosa (frigorificada ou aquecida)', 3, 5.8205, 283.12),
  ('C', 'Perigosa (frigorificada ou aquecida)', 4, 6.6174, 310.60),
  ('C', 'Perigosa (frigorificada ou aquecida)', 5, 7.4789, 325.98),
  ('C', 'Perigosa (frigorificada ou aquecida)', 6, 8.2743, 329.07),
  ('C', 'Perigosa (frigorificada ou aquecida)', 7, 8.7886, 388.00),
  ('C', 'Perigosa (frigorificada ou aquecida)', 9, 9.9625, 412.10),
  ('C', 'Perigosa (conteinerizada)', 3, 4.7065, 237.75),
  ('C', 'Perigosa (conteinerizada)', 4, 5.3608, 255.37),
  ('C', 'Perigosa (conteinerizada)', 5, 6.1129, 270.49),
  ('C', 'Perigosa (conteinerizada)', 6, 6.7862, 273.66),
  ('C', 'Perigosa (conteinerizada)', 7, 7.2127, 318.08),
  ('C', 'Perigosa (conteinerizada)', 9, 8.2051, 336.95),
  ('C', 'Perigosa (carga geral)', 2, 3.7341, 212.06),
  ('C', 'Perigosa (carga geral)', 3, 4.7027, 237.13),
  ('C', 'Perigosa (carga geral)', 4, 5.3761, 257.89),
  ('C', 'Perigosa (carga geral)', 5, 6.1263, 272.70),
  ('C', 'Perigosa (carga geral)', 6, 6.7992, 275.79),
  ('C', 'Perigosa (carga geral)', 7, 7.2283, 320.66),
  ('C', 'Perigosa (carga geral)', 9, 8.2277, 340.67),
  ('C', 'Carga Granel Pressurizada', 5, 5.9504, 249.68),
  ('C', 'Carga Granel Pressurizada', 6, 6.6398, 255.50),
  ('C', 'Carga Granel Pressurizada', 9, 8.0871, 323.48),
  ('A', 'Perigosa (granel liquido)', 7, 9.1849, 1013.95)
)
insert into public.piso_antt_coeficientes
  (tabela, tabela_descricao, tipo_carga, eixos, ccd_por_km, cc_fixo, data_vigencia, fonte)
select n.tabela, o.tabela_descricao, n.tipo_carga, n.eixos, n.ccd, n.cc, date '2026-09-30', 'Portaria SUROC 22/2026 (DOU 29/09/2026, ed. extra; vigencia 30/09/2026; conferida por amostra no ANTTlegis, restante da copia em contadores.cnt.br)'
from novos n
join public.piso_antt_coeficientes o
  on o.tabela = n.tabela and o.tipo_carga = n.tipo_carga and o.eixos = n.eixos and o.data_vigencia = date '2026-07-17'
on conflict (tabela, tipo_carga, eixos, data_vigencia) do nothing;

update public.piso_antt_coeficientes o
   set vigencia_fim = date '2026-09-29'
 where o.data_vigencia = date '2026-07-17' and o.vigencia_fim is null
   and exists (select 1 from public.piso_antt_coeficientes x
                where x.tabela = o.tabela and x.tipo_carga = o.tipo_carga and x.eixos = o.eixos and x.data_vigencia = date '2026-09-30');

update public.piso_antt_coeficientes
   set a_confirmar = false,
       observacao = 'Substituida pela Portaria SUROC 22/2026 (CCD 9,1849 confirmado no ANTTlegis)'
 where tabela = 'A' and tipo_carga = 'Perigosa (granel liquido)' and eixos = 7 and data_vigencia = date '2026-07-17';

update public.piso_antt_coeficientes
   set fonte = 'Portaria SUROC 22/2026 (DOU 29/09/2026, ed. extra; vigencia 30/09/2026; conferida por amostra no ANTTlegis, restante da copia em contadores.cnt.br)'
 where data_vigencia = date '2026-09-30' and fonte like 'Portaria SUROC 22/2026%';

do $$
declare n_novas int;
begin
  select count(*) into n_novas from public.piso_antt_coeficientes where data_vigencia = date '2026-09-30';
  if n_novas <> 272 then
    raise exception 'Portaria 22: esperava 272 linhas vigentes em 30/09/2026, achei %', n_novas;
  end if;
  if exists (select 1 from public.piso_antt_coeficientes where data_vigencia = date '2026-10-01') then
    raise exception 'Portaria 22: sobrou linha com vigencia 01/10/2026';
  end if;
end $$;
