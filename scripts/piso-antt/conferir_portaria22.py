"""Conferencia da Portaria SUROC 22 contra o banco (so leitura).
Uso: python -I conferir_portaria22.py coef.json   (coef.json = export atual de piso_antt_coeficientes)
Regra: o CC tem de ser igual ao da Res. 6.084 e a razao CCD novo/antigo tem de ficar entre 1,00 e 1,04.
Uma tabela so entra se TODAS as linhas passarem; a linha em duvida fica de fora e marcada a confirmar."""
import json
import sys
import unicodedata
from portaria22_dados import PORTARIA


def n(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn').lower()


DUVIDA = {('A', 'perigosa (granel liquido)', 7)}
rows = json.load(open(sys.argv[1]))
db = {(r['tabela'], n(r['tipo_carga']), r['eixos']): (float(r['ccd_por_km']), float(r['cc_fixo'])) for r in rows}
incluidas = {}
for t, tab in PORTARIA.items():
    ok, ruins = [], []
    for tipo, (ccd, cc) in tab.items():
        eixos = sorted(e for (tb, tp, e) in db if tb == t and tp == n(tipo))
        if len(eixos) != len(ccd):
            ruins.append((tipo, 'colunas do banco %d != valores %d' % (len(eixos), len(ccd))))
            continue
        for e, a, b in zip(eixos, ccd, cc):
            antigo = db[(t, n(tipo), e)]
            if (t, n(tipo), e) in DUVIDA:
                print('   em duvida (nao altera):', t, tipo, e, 'banco', antigo, 'portaria', (a, b))
                continue
            if antigo[1] != b:
                ruins.append((tipo, e, 'CC mudou', antigo[1], b))
                continue
            r = a / antigo[0]
            if not (1.0 < r < 1.04):
                ruins.append((tipo, e, 'razao CCD fora de 1,00-1,04', round(r, 4)))
                continue
            ok.append([t, tipo, e, a, b, (t, n(tipo), e) in DUVIDA])
    print(t, 'linhas ok', len(ok), 'ruins', len(ruins))
    for x in ruins:
        print('   ', x)
    if not ruins:
        incluidas[t] = ok
json.dump(incluidas, open('resultado.json', 'w'))
print('tabelas incluidas:', sorted(incluidas))
