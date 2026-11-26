"""Gera a migration 20261126-1200 (correcao aditiva apos conferir o texto oficial da Portaria 22 no ANTTlegis):
 1) vigencia certa: 30/09/2026 (DOU 29/09/2026, edicao extra; Art. 3: dia seguinte a publicacao);
 2) linha A Perigosa (granel liquido) 7 eixos confirmada (CCD 9,1849) -> entra;
 3) Tabela C inteira entra (Neogranel 2 eixos 3,0767 confirmado no texto oficial).
Uso: python gerar_migration_1200.py coef.json ARQUIVO.sql   (coef.json = export da tabela ANTES da portaria, so para a grafia/eixos)"""
import json
import sys
import unicodedata
from portaria22_dados import PORTARIA


def n(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn').lower()


rows = json.load(open(sys.argv[1]))
grafia = {n(r['tipo_carga']): r['tipo_carga'] for r in rows}
eixos_db = {}
for r in rows:
    eixos_db.setdefault((r['tabela'], n(r['tipo_carga'])), set()).add(r['eixos'])

linhas = []
# Tabela C inteira
for tipo, (ccd, cc) in PORTARIA['C'].items():
    eixos = sorted(eixos_db[('C', n(tipo))])
    assert len(eixos) == len(ccd), tipo
    for e, a, b in zip(eixos, ccd, cc):
        linhas.append("  ('C', '%s', %d, %s, %.2f)" % (grafia[n(tipo)], e, repr(a), b))
# linha A confirmada
tipo = 'Perigosa (granel liquido)'
ccd, cc = PORTARIA['A'][tipo]
eixos = sorted(eixos_db[('A', n(tipo))])
i = eixos.index(7)
linhas.append("  ('A', '%s', 7, %s, %.2f)" % (grafia[n(tipo)], repr(ccd[i]), cc[i]))
total_novas = len(linhas)
FONTE = "Portaria SUROC 22/2026 (DOU 29/09/2026, ed. extra; vigencia 30/09/2026; conferida por amostra no ANTTlegis, restante da copia em contadores.cnt.br)"

sql = f"""-- Correcao ADITIVA da Portaria SUROC 22 apos conferir o texto no ANTTlegis (ANTT):
--  1) vigencia: publicada no DOU em 29/09/2026 (edicao extra); Art. 3 "entra em vigor no dia seguinte ao de sua publicacao"
--     => 30/09/2026 (a migration 1000 tinha usado 01/10/2026). Corrige so a data das linhas novas e o fim das antigas.
--  2) linha A Perigosa (granel liquido) 7 eixos: o texto oficial traz CCD 9,1849 (CC 1.013,95) -> entra e a antiga fecha.
--  3) Tabela C: o texto oficial confirma Neogranel 2 eixos CCD 3,0767 -> as {total_novas - 1} linhas da Tabela C entram.
-- Nada e apagado. Valores antigos de CCD/CC nao mudam.

update public.piso_antt_coeficientes
   set data_vigencia = date '2026-09-30'
 where data_vigencia = date '2026-10-01' and fonte like 'Portaria SUROC 22/2026%';

update public.piso_antt_coeficientes
   set vigencia_fim = date '2026-09-29'
 where data_vigencia = date '2026-07-17' and vigencia_fim = date '2026-09-30';

with novos(tabela, tipo_carga, eixos, ccd, cc) as (values
{',\n'.join(linhas)}
)
insert into public.piso_antt_coeficientes
  (tabela, tabela_descricao, tipo_carga, eixos, ccd_por_km, cc_fixo, data_vigencia, fonte)
select n.tabela, o.tabela_descricao, n.tipo_carga, n.eixos, n.ccd, n.cc, date '2026-09-30', '{FONTE}'
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
   set fonte = '{FONTE}'
 where data_vigencia = date '2026-09-30' and fonte like 'Portaria SUROC 22/2026%';

do $$
declare n_novas int;
begin
  select count(*) into n_novas from public.piso_antt_coeficientes where data_vigencia = date '2026-09-30';
  if n_novas <> {193 + total_novas} then
    raise exception 'Portaria 22: esperava {193 + total_novas} linhas vigentes em 30/09/2026, achei %', n_novas;
  end if;
  if exists (select 1 from public.piso_antt_coeficientes where data_vigencia = date '2026-10-01') then
    raise exception 'Portaria 22: sobrou linha com vigencia 01/10/2026';
  end if;
end $$;
"""
open(sys.argv[2], 'w', encoding='utf8', newline='\n').write(sql)
print('linhas novas:', total_novas, 'total vigente esperado:', 193 + total_novas)
