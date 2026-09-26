import { type ParcelaRegra, type RegraPrazo, BASE_LABEL, addDias, brl, fmtData, hojeISO, previewVencimentos } from '../../lib/financeiro'
import { Campo, inputClass, inputStyle } from './ui'

// Editor de regra de prazo (usado nas Configurações e no prazo personalizado da cotação).
export function EditorParcelas({ regra, onChange }: { regra: RegraPrazo; onChange: (r: RegraPrazo) => void }) {
  const soma = regra.parcelas.reduce((s, p) => s + (Number(p.percentual) || 0), 0)
  const setP = (i: number, p: Partial<ParcelaRegra>) => onChange({ ...regra, parcelas: regra.parcelas.map((x, j) => (j === i ? { ...x, ...p } : x)) })
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <Campo label="Contar a partir da">
          <select value={regra.base} onChange={(e) => onChange({ ...regra, base: e.target.value })} className={inputClass} style={inputStyle}>
            {Object.entries(BASE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Modo">
          <select value={regra.modo} onChange={(e) => onChange({ ...regra, modo: e.target.value as RegraPrazo['modo'] })} className={inputClass} style={inputStyle}>
            <option value="dias">Dias corridos</option>
            <option value="fechamento_mensal">Fechamento mensal (dia fixo)</option>
          </select>
        </Campo>
        {regra.modo === 'fechamento_mensal' && (
          <Campo label="Dia do vencimento">
            <input inputMode="numeric" value={regra.dia_fixo ?? ''} onChange={(e) => onChange({ ...regra, dia_fixo: Number(e.target.value) || null })} className={inputClass} style={inputStyle} />
          </Campo>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        {regra.parcelas.map((p, i) => (
          <div key={i} className="flex gap-2 items-center flex-wrap">
            <span className="text-[11px] w-7 text-[color:var(--rbr-muted)]">{i + 1}ª</span>
            <input inputMode="decimal" value={p.percentual} onChange={(e) => setP(i, { percentual: Number(e.target.value.replace(',', '.')) || 0 })} className={`${inputClass} !w-20`} style={inputStyle} aria-label="Percentual" />
            <span className="text-xs">%</span>
            <input inputMode="numeric" value={p.dias} onChange={(e) => setP(i, { dias: Number(e.target.value) || 0 })} className={`${inputClass} !w-20`} style={inputStyle} aria-label="Dias" />
            <span className="text-xs">{regra.modo === 'fechamento_mensal' ? 'mês(es) depois' : 'dias após a'}</span>
            <select value={p.base ?? ''} onChange={(e) => setP(i, { base: e.target.value || undefined })} className={`${inputClass} !w-44`} style={inputStyle} aria-label="Evento da parcela">
              <option value="">{BASE_LABEL[regra.base]}</option>
              {Object.entries(BASE_LABEL)
                .filter(([k]) => k !== regra.base)
                .map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
            </select>
            {regra.parcelas.length > 1 && (
              <button type="button" className="text-xs text-[color:var(--rbr-danger)]" onClick={() => onChange({ ...regra, parcelas: regra.parcelas.filter((_, j) => j !== i) })} aria-label="Remover parcela">
                ✕
              </button>
            )}
          </div>
        ))}
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="text-[11px] font-bold text-[color:var(--rbr-navy)]"
            onClick={() => {
              const n = regra.parcelas.length + 1
              const pct = Math.floor((100 / n) * 100) / 100
              const ult = regra.parcelas[regra.parcelas.length - 1]
              const novas = [...regra.parcelas, { dias: (ult?.dias ?? 0) + (regra.modo === 'fechamento_mensal' ? 1 : 30), percentual: pct }].map((p, i, arr) => ({
                ...p,
                percentual: i === arr.length - 1 ? Math.round((100 - pct * (arr.length - 1)) * 100) / 100 : pct,
              }))
              onChange({ ...regra, parcelas: novas })
            }}
          >
            + parcela
          </button>
          <span className="text-[11px]" style={{ color: Math.abs(soma - 100) > 0.01 ? 'var(--rbr-danger)' : 'var(--rbr-muted)' }}>
            Soma {soma.toLocaleString('pt-BR')}%{Math.abs(soma - 100) > 0.01 ? ' — precisa dar 100%' : ''}
          </span>
        </div>
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={regra.ajustar_dia_util !== false} onChange={(e) => onChange({ ...regra, ajustar_dia_util: e.target.checked })} /> Se cair em fim de semana ou
        feriado, passa para o próximo dia útil
      </label>
    </div>
  )
}

export function PreviaRegra({ regra, feriados, total = 10000, texto }: { regra: RegraPrazo; feriados?: Set<string>; total?: number; texto?: string }) {
  const hoje = hojeISO()
  const base = { aprovacao: hoje, liberacao: addDias(hoje, 1), coleta: addDias(hoje, 2), entrega: addDias(hoje, 4), emissao: addDias(hoje, 1) }
  if (!regra.parcelas.length) return null
  const pv = previewVencimentos(regra, base, total, feriados)
  return (
    <div className="text-[11px] text-[color:var(--rbr-muted)] rounded-lg px-3 py-2" style={{ background: 'var(--rbr-muted-bg)' }}>
      {texto ?? `Exemplo: frete de ${brl(total)} aprovado hoje,`} coleta {fmtData(base.coleta)}, entrega {fmtData(base.entrega)} →{' '}
      {pv.map((p) => `${fmtData(p.vencimento)} ${brl(p.valor)}`).join(' + ')}
    </div>
  )
}

