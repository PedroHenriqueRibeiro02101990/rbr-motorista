import { useEffect, useState } from 'react'
import type { Json } from '@rbr/shared/database.types'
import { POLITICA_PADRAO, PRAZOS, ROTULO_PRAZO, ehPrazo, lerPolitica, type PoliticaPrazo, type PrazoPagamento } from '@rbr/shared/precoPrazo'
import { erroMsg, lerParametro, salvarParametro } from '../../lib/financeiro'
import { Aviso, Botao, Campo, Card, inputClass, inputStyle } from './ui'

// Política de preço por prazo e de desconto na negociação (parametros_sistema.politica_prazo_desconto). Tudo aqui é
// sugestão para o cotador; nada bloqueia cotação. Uso interno: estas regras não vão para a LP nem para anúncios.

type Linha = { de: PrazoPagamento; para: PrazoPagamento; min: string; max: string; faixa: '' | 'antecipado' | 'a_vista'; raro: boolean }

const paraPct = (v: number) => String(Number((v * 100).toFixed(4))).replace('.', ',')
const dePct = (s: string) => Number(s.trim().replace(',', '.')) / 100

// Uma linha por prazo de origem (uma concessão com vários prazos de origem vira várias linhas: o efeito é o mesmo).
function linhasDe(p: PoliticaPrazo): Linha[] {
  return p.concessoes.flatMap((c) =>
    c.de.map((de) => ({ de, para: c.para, min: paraPct(c.min), max: paraPct(c.max), faixa: c.faixa ?? '', raro: c.raro === true })),
  )
}

export default function PoliticaPrazoConfig() {
  const [ajustes, setAjustes] = useState<Record<PrazoPagamento, string>>(
    Object.fromEntries(PRAZOS.map((k) => [k, paraPct(POLITICA_PADRAO.ajustePorPrazo[k])])) as Record<PrazoPagamento, string>,
  )
  const [linhas, setLinhas] = useState<Linha[]>(linhasDe(POLITICA_PADRAO))
  const [faixaAnt, setFaixaAnt] = useState(String(POLITICA_PADRAO.faixas.antecipado.custoMinimo))
  const [faixaVista, setFaixaVista] = useState(String(POLITICA_PADRAO.faixas.a_vista.custoMinimo))
  const [teto, setTeto] = useState(paraPct(POLITICA_PADRAO.tetoDesconto))
  const [piso, setPiso] = useState(paraPct(POLITICA_PADRAO.margemPiso))
  const [verde, setVerde] = useState(paraPct(POLITICA_PADRAO.margemConfortavel))
  const [minUtil, setMinUtil] = useState(paraPct(POLITICA_PADRAO.descontoMinimoUtil))
  const [ok, setOk] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    lerParametro('politica_prazo_desconto').then((j) => {
      const p = lerPolitica(j)
      setAjustes(Object.fromEntries(PRAZOS.map((k) => [k, paraPct(p.ajustePorPrazo[k])])) as Record<PrazoPagamento, string>)
      setLinhas(linhasDe(p))
      setFaixaAnt(String(p.faixas.antecipado.custoMinimo))
      setFaixaVista(String(p.faixas.a_vista.custoMinimo))
      setTeto(paraPct(p.tetoDesconto))
      setPiso(paraPct(p.margemPiso))
      setVerde(paraPct(p.margemConfortavel))
      setMinUtil(paraPct(p.descontoMinimoUtil))
    })
  }, [])

  async function salvar() {
    setErro(null)
    setOk(null)
    try {
      const tetoN = dePct(teto)
      if (!(tetoN >= 0 && tetoN <= 0.05)) throw new Error('O teto de desconto vai de 0% a 5%.')
      const bruto = {
        ajustePorPrazo: Object.fromEntries(PRAZOS.map((k) => [k, dePct(ajustes[k] || '0')])),
        concessoes: linhas.map((l) => {
          const min = dePct(l.min)
          const max = dePct(l.max)
          if (!(max >= 0 && max <= tetoN)) throw new Error(`${ROTULO_PRAZO[l.de]} → ${ROTULO_PRAZO[l.para]}: o máximo vai de 0% ao teto (${teto}%).`)
          if (!(min >= 0 && min <= max)) throw new Error(`${ROTULO_PRAZO[l.de]} → ${ROTULO_PRAZO[l.para]}: o sugerido vai de 0% ao máximo.`)
          return { de: [l.de], para: l.para, min, max, ...(l.faixa ? { faixa: l.faixa } : {}), ...(l.raro ? { raro: true } : {}) }
        }),
        faixas: { antecipado: { custoMinimo: Number(faixaAnt) }, a_vista: { custoMinimo: Number(faixaVista) } },
        tetoDesconto: tetoN,
        margemPiso: dePct(piso),
        margemConfortavel: dePct(verde),
        descontoMinimoUtil: dePct(minUtil),
      }
      for (const [k, v] of Object.entries(bruto.ajustePorPrazo)) {
        if (!(Math.abs(v) <= 0.5)) throw new Error(`Ajuste de ${ROTULO_PRAZO[k as PrazoPagamento]} inválido (de −50% a +50%).`)
      }
      if (!(bruto.faixas.antecipado.custoMinimo >= 0 && bruto.faixas.a_vista.custoMinimo >= 0)) throw new Error('Faixas de valor: informe um custo mínimo em R$.')
      // Passa pela mesma leitura do cotador: o que for gravado é exatamente o que ele vai usar.
      const politica = lerPolitica(bruto)
      await salvarParametro('politica_prazo_desconto', politica as unknown as Json)
      setOk('Política salva. Vale para as próximas cotações abertas no cotador.')
    } catch (e) {
      setErro(erroMsg(e))
    }
  }

  const sel = (v: string, on: (v: string) => void, opcoes: Array<[string, string]>, rotulo: string) => (
    <select aria-label={rotulo} value={v} onChange={(e) => on(e.target.value)} className={inputClass} style={inputStyle}>
      {opcoes.map(([k, l]) => (
        <option key={k} value={k}>
          {l}
        </option>
      ))}
    </select>
  )
  const opcoesPrazo: Array<[string, string]> = PRAZOS.map((k) => [k, ROTULO_PRAZO[k]])

  return (
    <Card titulo="Prazo de pagamento e desconto (uso interno)">
      <div className="text-xs text-[color:var(--rbr-muted)] mb-3">
        Sugestões para o cotador: o preço da cotação é o de 7 DDL; o prazo ajusta esse preço e a concessão desconta sobre o preço do prazo
        cotado. Nada aqui bloqueia cotação. Não divulgar na LP nem em anúncios.
      </div>

      <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] mb-2">Ajuste por prazo (% sobre o preço a 7 DDL)</div>
      <div className="grid grid-cols-3 md:grid-cols-9 gap-2">
        {PRAZOS.map((k) => (
          <Campo key={k} label={ROTULO_PRAZO[k]}>
            <input inputMode="decimal" value={ajustes[k]} onChange={(e) => setAjustes((a) => ({ ...a, [k]: e.target.value }))} className={inputClass} style={inputStyle} />
          </Campo>
        ))}
      </div>

      <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] mt-4 mb-2">
        Trocas de prazo por desconto (% sobre o preço do prazo cotado)
      </div>
      <div className="flex flex-col gap-2">
        {linhas.map((l, i) => {
          const muda = (x: Partial<Linha>) => setLinhas((ls) => ls.map((y, j) => (j === i ? { ...y, ...x } : y)))
          return (
            <div key={i} className="grid gap-2 items-center text-xs" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))' }}>
              {sel(l.de, (v) => ehPrazo(v) && muda({ de: v }), opcoesPrazo, 'Cotado a')}
              {sel(l.para, (v) => ehPrazo(v) && muda({ para: v }), opcoesPrazo, 'Cliente aceita')}
              <input aria-label="Desconto sugerido (%)" inputMode="decimal" value={l.min} onChange={(e) => muda({ min: e.target.value })} className={inputClass} style={inputStyle} placeholder="sugerido %" />
              <input aria-label="Desconto máximo (%)" inputMode="decimal" value={l.max} onChange={(e) => muda({ max: e.target.value })} className={inputClass} style={inputStyle} placeholder="máximo %" />
              {sel(
                l.faixa,
                (v) => muda({ faixa: v === 'antecipado' || v === 'a_vista' ? v : '' }),
                [
                  ['', 'qualquer valor'],
                  ['antecipado', 'faixa antecipado'],
                  ['a_vista', 'faixa à vista'],
                ],
                'Faixa de valor',
              )}
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={l.raro} onChange={(e) => muda({ raro: e.target.checked })} />
                exceção
              </label>
              <button type="button" onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))} className="font-semibold underline text-left" style={{ color: 'var(--rbr-danger)' }}>
                Remover
              </button>
            </div>
          )
        })}
        <div>
          <Botao variante="secundario" onClick={() => setLinhas((ls) => [...ls, { de: '28ddl', para: '14ddl', min: '0', max: '0', faixa: '', raro: false }])}>
            + Troca
          </Botao>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mt-4">
        <Campo label="Antecipado a partir de (R$ de custo)">
          <input inputMode="decimal" value={faixaAnt} onChange={(e) => setFaixaAnt(e.target.value.replace(/[^\d.]/g, ''))} className={inputClass} style={inputStyle} />
        </Campo>
        <Campo label="À vista a partir de (R$ de custo)">
          <input inputMode="decimal" value={faixaVista} onChange={(e) => setFaixaVista(e.target.value.replace(/[^\d.]/g, ''))} className={inputClass} style={inputStyle} />
        </Campo>
        <Campo label="Teto do desconto (%)" dica="Nunca acima de 5%.">
          <input inputMode="decimal" value={teto} onChange={(e) => setTeto(e.target.value)} className={inputClass} style={inputStyle} />
        </Campo>
        <Campo label="Piso da margem (%)">
          <input inputMode="decimal" value={piso} onChange={(e) => setPiso(e.target.value)} className={inputClass} style={inputStyle} />
        </Campo>
        <Campo label="Margem verde acima de (%)">
          <input inputMode="decimal" value={verde} onChange={(e) => setVerde(e.target.value)} className={inputClass} style={inputStyle} />
        </Campo>
        <Campo label="Sem espaço abaixo de (%)" dica="Desconto máximo menor que isso: o cotador avisa que não há espaço.">
          <input inputMode="decimal" value={minUtil} onChange={(e) => setMinUtil(e.target.value)} className={inputClass} style={inputStyle} />
        </Campo>
      </div>
      {ok && <div className="mt-3"><Aviso tipo="ok">{ok}</Aviso></div>}
      {erro && <div className="mt-3"><Aviso>{erro}</Aviso></div>}
      <div className="flex justify-end mt-3">
        <Botao onClick={salvar}>Salvar política</Botao>
      </div>
    </Card>
  )
}
