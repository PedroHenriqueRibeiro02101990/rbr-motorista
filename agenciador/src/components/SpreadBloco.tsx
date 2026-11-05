import { useState } from 'react'
import { avaliar, precoPorSpreadPct, spreadPorPreco, r2, type EntradaCusto, type ParametrosRbr } from '@rbr/shared/spreadAgenciador'
import { Aviso, brl, pct } from './ui'

const num = (v: string) => {
  const n = Number(v.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}
const fmt = (n: number) => n.toFixed(2).replace('.', ',')

/**
 * Bloco de SPREAD e MARGEM. O agenciador controla so o spread: em R$, em % do preco final, ou digitando o preco final.
 * Os tres campos sao ligados. Os custos internos da RBR (frete, lucro, custo financeiro) NAO sao exibidos.
 */
export default function SpreadBloco({
  custo,
  params,
  piso,
  spread,
  onSpread,
  bloqueado,
}: {
  custo: EntradaCusto
  params: ParametrosRbr
  piso: number
  spread: number
  onSpread: (v: number) => void
  bloqueado?: boolean
}) {
  const res = avaliar(custo, params, piso, spread)
  const [txt, setTxt] = useState<{ campo: 'rs' | 'pct' | 'preco' | null; v: string }>({ campo: null, v: '' })
  const valor = (campo: 'rs' | 'pct' | 'preco', padrao: string) => (txt.campo === campo ? txt.v : padrao)

  function digitar(campo: 'rs' | 'pct' | 'preco', v: string) {
    setTxt({ campo, v })
    const n = num(v)
    if (!Number.isFinite(n)) return
    try {
      if (campo === 'rs') onSpread(r2(n))
      else if (campo === 'pct') onSpread(precoPorSpreadPct(custo, params, n / 100).spread)
      else onSpread(spreadPorPreco(custo, params, n))
    } catch {
      /* percentual alto demais: ignora ate o usuario corrigir */
    }
  }
  const campo = 'w-full rounded-xl border px-3 py-2.5 text-sm font-semibold bg-white'
  const lab = 'text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]'
  const bord = { borderColor: 'var(--rbr-border)' }
  const corMargem = res.erro ? 'var(--rbr-danger)' : 'var(--rbr-positive)'

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="flex flex-col gap-1">
          <span className={lab}>Seu spread (R$)</span>
          <input disabled={bloqueado} inputMode="decimal" className={campo} style={bord} value={valor('rs', fmt(spread))} onChange={(e) => digitar('rs', e.target.value)} onBlur={() => setTxt({ campo: null, v: '' })} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={lab}>Seu spread (% do preço)</span>
          <input disabled={bloqueado} inputMode="decimal" className={campo} style={bord} value={valor('pct', (res.margemPct * 100).toFixed(1).replace('.', ','))} onChange={(e) => digitar('pct', e.target.value)} onBlur={() => setTxt({ campo: null, v: '' })} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={lab}>Preço final ao cliente</span>
          <input disabled={bloqueado} inputMode="decimal" className={campo} style={bord} value={valor('preco', fmt(res.precoFinal))} onChange={(e) => digitar('preco', e.target.value)} onBlur={() => setTxt({ campo: null, v: '' })} />
        </label>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <Num titulo="Preço final" valor={brl(res.precoFinal)} />
        <Num titulo="Sua margem" valor={pct(res.margemPct)} cor={corMargem} />
        <Num titulo="Spread bruto" valor={brl(res.spread)} />
        <Num titulo="Você recebe (líquido)" valor={brl(res.spreadLiquido)} cor={corMargem} destaque />
      </div>
      <p className="text-[12px] text-[color:var(--rbr-muted)]">
        O imposto já está dentro do preço. A taxa de tecnologia de {brl(params.taxaTecnologia)} por carga fechada é descontada do seu spread no fechamento.
      </p>

      {res.erro && <Aviso tom="vermelho">{res.erro} Spread mínimo para este frete: {brl(res.spreadMinimo)}.</Aviso>}
      {!res.erro && res.aviso && <Aviso tom="amarelo">{res.aviso}</Aviso>}
    </div>
  )
}

function Num({ titulo, valor, cor, destaque }: { titulo: string; valor: string; cor?: string; destaque?: boolean }) {
  return (
    <div className="rounded-xl p-3" style={{ background: destaque ? 'var(--rbr-muted-bg)' : 'var(--rbr-navy-tint)' }}>
      <div className="text-[11px] font-semibold text-[color:var(--rbr-muted)]">{titulo}</div>
      <div className="rbr-display font-bold text-lg mt-0.5" style={{ color: cor ?? 'var(--rbr-navy-dark)' }}>{valor}</div>
    </div>
  )
}
