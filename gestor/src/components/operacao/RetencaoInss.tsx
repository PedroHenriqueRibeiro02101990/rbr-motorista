import { useEffect, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { formatMoney } from '@rbr/shared/format'

// Tarefa 3: prévia da retenção de INSS no pagamento ao parceiro (RPC calcular_retencao_inss, mesma regra do trigger
// que grava o valor retido na condição de pagamento). Não depende da nota fiscal.

export type Retencao = {
  frete_bruto: number
  aplica: boolean
  base: number | null
  aliquota: number | null
  inss_retido: number
  valor_liquido: number
  motivo: string
  avisos: string[]
  competencia: string
  vencimento_recolhimento: string
}

export default function RetencaoInss({ operacaoId, frete, vpo }: { operacaoId: string; frete: number; vpo?: number | null }) {
  const [r, setR] = useState<Retencao | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!Number.isFinite(frete) || frete <= 0) {
      setR(null)
      return
    }
    let vivo = true
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc('calcular_retencao_inss', { p_operacao: operacaoId, p_frete: frete })
      if (!vivo) return
      setErro(error ? error.message : null)
      setR((data as Retencao | null) ?? null)
    }, 400)
    return () => {
      vivo = false
      clearTimeout(t)
    }
  }, [operacaoId, frete])

  if (erro) return <div className="text-xs" style={{ color: 'var(--rbr-danger)' }}>Não consegui calcular a retenção: {erro}</div>
  if (!r) return null
  const linhas: [string, string, boolean?][] = [
    ['Frete bruto', formatMoney(r.frete_bruto)],
    ['Retenção INSS', r.aplica ? `− ${formatMoney(r.inss_retido)}` : formatMoney(0)],
    ['Líquido a pagar', formatMoney(r.valor_liquido), true],
  ]
  return (
    <div className="rounded-lg border px-3 py-2.5 flex flex-col gap-2" style={{ borderColor: 'var(--rbr-border)', background: 'var(--rbr-muted-bg)' }}>
      <div className="grid grid-cols-3 gap-2">
        {linhas.map(([k, v, forte]) => (
          <div key={k}>
            <div className="text-[10px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">{k}</div>
            <div className={`text-sm tabular-nums ${forte ? 'font-extrabold text-[color:var(--rbr-navy-dark)]' : 'font-bold'}`}>{v}</div>
          </div>
        ))}
      </div>
      <div className="text-xs text-[color:var(--rbr-navy-dark)]">
        <b>{r.aplica ? 'Por que reter:' : 'Sem retenção:'}</b> {r.motivo}
        {r.aplica && r.base != null && (
          <span className="text-[color:var(--rbr-muted)]">
            {' '}
            Base {formatMoney(r.base)} · recolher até {new Date(r.vencimento_recolhimento + 'T12:00:00').toLocaleDateString('pt-BR')} (dia 20 do mês seguinte).
          </span>
        )}
      </div>
      {vpo != null && vpo > 0 && <div className="text-[11px] text-[color:var(--rbr-muted)]">VPO/pedágio de {formatMoney(vpo)} fora da base: a base é só o frete.</div>}
      {r.avisos.length > 0 && (
        <ul className="text-[11px] list-disc pl-4" style={{ color: '#8A5A00' }}>
          {r.avisos.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
