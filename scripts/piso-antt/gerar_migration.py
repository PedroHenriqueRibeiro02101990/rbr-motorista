"""Gera a migration aditiva da Portaria SUROC 22 a partir de resultado.json (saida de conferir_portaria22.py)
e do export atual da tabela (coef.json, para copiar a grafia exata do tipo_carga).
Uso: python gerar_migration.py coef.json resultado.json ../../supabase/migrations/ARQUIVO.sql"""
import json
import sys
import unicodedata


def n(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn').lower()


rows = json.load(open(sys.argv[1]))
res = json.load(open(sys.argv[2]))
grafia = {n(r['tipo_carga']): r['tipo_carga'] for r in rows}
VIG = '2026-10-01'
FONTE = 'Portaria SUROC 22/2026 (DOU 30/09/2026; valores da copia em contadores.cnt.br, nao oficial)'
linhas, total = [], 0
for t in sorted(res):
    for tab, tipo, e, ccd, cc, duvida in res[t]:
        if duvida:
            continue
        linhas.append("  ('%s', '%s', %d, %s, %s)" % (tab, grafia[n(tipo)], e, repr(ccd), '%.2f' % cc))
        total += 1
sql = f"""-- Portaria SUROC 22 (28/09/2026): novos coeficientes do piso minimo do frete (CCD), reajuste extraordinario do diesel
-- (Pcomb R$ 7,33/L). ADITIVA: nao apaga nem altera valores da Res. ANTT 6.084/2026; so acrescenta linhas novas e
-- "fecha" as antigas com vigencia_fim. Os consumidores ja escolhem a linha vigente por data_vigencia <= data da consulta.
-- Vigencia {VIG}: Art. 3 da portaria "entra em vigor no dia seguinte ao de sua publicacao"; publicada em 30/09/2026 (DOU).
-- FONTE: copia em contadores.cnt.br (o DOU/ANTT oficial nao foi acessivel). Conferir no DOU antes de usar como oficial.
-- Entram as Tabelas A (menos 1 linha em duvida), B e D. FICAM DE FORA: Tabela C (Neogranel 2 eixos 3,0767 fora do padrao)
-- e a linha A Perigosa (granel liquido) 7 eixos (portaria 9,1849 x banco 9,1949), mantida com a_confirmar = true.
-- O CC (fixo) nao mudou em nenhuma linha conferida; so o CCD sobe (1,0% a 4,0% na validacao; real: 2,1% a 2,5%).

alter table public.piso_antt_coeficientes
  add column if not exists vigencia_fim date,
  add column if not exists a_confirmar boolean not null default false,
  add column if not exists observacao text;

with novos(tabela, tipo_carga, eixos, ccd, cc) as (values
{',\n'.join(linhas)}
)
insert into public.piso_antt_coeficientes
  (tabela, tabela_descricao, tipo_carga, eixos, ccd_por_km, cc_fixo, data_vigencia, fonte)
select n.tabela, o.tabela_descricao, n.tipo_carga, n.eixos, n.ccd, n.cc, date '{VIG}', '{FONTE}'
from novos n
join public.piso_antt_coeficientes o
  on o.tabela = n.tabela and o.tipo_carga = n.tipo_carga and o.eixos = n.eixos and o.data_vigencia = date '2026-07-17'
on conflict (tabela, tipo_carga, eixos, data_vigencia) do nothing;

-- fecha as linhas antigas que ganharam substituta
update public.piso_antt_coeficientes o
   set vigencia_fim = date '2026-09-30'
 where o.data_vigencia = date '2026-07-17'
   and o.vigencia_fim is null
   and exists (select 1 from public.piso_antt_coeficientes x
                where x.tabela = o.tabela and x.tipo_carga = o.tipo_carga and x.eixos = o.eixos
                  and x.data_vigencia = date '{VIG}');

-- linha em duvida: mantem a antiga e marca
update public.piso_antt_coeficientes
   set a_confirmar = true,
       observacao = 'Portaria 22 traz CCD 9,1849 (menor que o esperado); manter ate confirmar no DOU oficial'
 where tabela = 'A' and tipo_carga = 'Perigosa (granel liquido)' and eixos = 7 and data_vigencia = date '2026-07-17';

do $$
declare n_novas int;
begin
  select count(*) into n_novas from public.piso_antt_coeficientes where data_vigencia = date '{VIG}';
  if n_novas <> {total} then
    raise exception 'Portaria 22: esperava {total} linhas novas, achei %', n_novas;
  end if;
end $$;
"""
open(sys.argv[3], 'w', encoding='utf8', newline='\n').write(sql)
print('linhas novas:', total)
