import { useEffect, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import {
  ROTULO_PRAZO,
  descontosCondicionaisBoleto,
  ehPrazo,
  lerPolitica,
  sugestaoDescontosBoleto,
  type PrazoPagamento,
} from '@rbr/shared/precoPrazo'
import { brl, fmtData, lerParametro } from '../../lib/financeiro'
import { SEM_DESCONTO, type DescontoCondicionalFatura, type DescontosDaFatura } from '../../lib/descontoFatura'
import { inputClass, inputStyle } from './ui'

type Sugestao = { eh_dia_util?: boolean; proximo_dia_util?: { data?: string } | null }

// Na criação da fatura: lê a cotação dos itens e propõe o desconto (fase 1, só registro).
//  - cotação com desconto negociado: guarda o valor cheio (vale se pagar fora do prazo); nada de desconto condicional
//    por cima (um desconto por frete, sem acumular);
//  - senão, prazo de boleto (DDL): sugere o desconto condicional para pagar antes, nas datas do prazo mais curto,
//    levadas ao próximo dia útil pela mesma regra do vencimento. O gestor edita ou tira cada um.
export default function DescontoFaturaCampos({
  cotacaoId,
  clienteId,
  total,
  emissao,
  onChange,
}: {
  cotacaoId: string | null
  clienteId: string
  total: number
  emissao: string
  onChange: (d: DescontosDaFatura) => void
}) {
  const [prazo, setPrazo] = useState<PrazoPagamento | null>(null)
  const [negociado, setNegociado] = useState<number | null>(null)
  const [linhas, setLinhas] = useState<Array<DescontoCondicionalFatura & { ativo: boolean; pctTexto: string }>>([])
  const [aviso, setAviso] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    setPrazo(null)
    setNegociado(null)
    setLinhas([])
    setAviso(null)
    if (!cotacaoId || !(total > 0)) return
    ;(async () => {
      const [{ data: cot }, politicaJson] = await Promise.all([
        supabase.from('cotacoes').select('prazo_recebimento, desconto_pct').eq('id', cotacaoId).maybeSingle(),
        lerParametro('politica_prazo_desconto'),
      ])
      if (!vivo || !cot) return
      const p = ehPrazo(cot.prazo_recebimento) ? cot.prazo_recebimento : null
      setPrazo(p)
      if (cot.desconto_pct && cot.desconto_pct > 0) {
        setNegociado(Number(cot.desconto_pct))
        return
      }
      if (!p) return
      const politica = lerPolitica(politicaJson)
      const { condicoes } = descontosCondicionaisBoleto(total, emissao, p, sugestaoDescontosBoleto(p, politica), politica)
      if (!condicoes.length) return
      let ibge: string | undefined
      let uf: string | undefined
      if (clienteId) {
        const r = await supabase.rpc('municipio_ibge_cliente', { p_cliente: clienteId })
        ibge = (r.data as string | null) ?? undefined
        const c = await supabase.from('clientes').select('uf').eq('id', clienteId).maybeSingle()
        uf = c.data?.uf ?? undefined
      }
      const ajustadas = await Promise.all(
        condicoes.map(async (c) => {
          let data = c.dataLimite
          const { data: sug } = await supabase.rpc('sugerir_vencimento', { p_emissao: emissao, p_prazo_dias: c.dias, p_municipio_ibge: ibge, p_uf: uf })
          const s = sug as Sugestao | null
          if (s && s.eh_dia_util === false && s.proximo_dia_util?.data) data = s.proximo_dia_util.data
          return {
            data_limite: data,
            dias: c.dias,
            desconto: c.desconto,
            valor: c.valor,
            ativo: true,
            pctTexto: String(Number((c.desconto * 100).toFixed(4))),
          }
        }),
      )
      if (vivo) {
        setLinhas(ajustadas)
        setAviso('Fase 1: o desconto fica registrado na fatura, no PDF e no texto de envio. O boleto do banco segue com o valor cheio.')
      }
    })().catch(() => undefined)
    return () => {
      vivo = false
    }
  }, [cotacaoId, clienteId, total, emissao])

  useEffect(() => {
    if (negociado) {
      onChange({ ...SEM_DESCONTO, desconto_negociado_pct: negociado, valor_cheio: Math.round((total / (1 - negociado)) * 100) / 100 })
      return
    }
    const ativos = linhas
      .filter((l) => l.ativo)
      .flatMap((l) => {
        const pct = Number(l.pctTexto.replace(',', '.')) / 100
        if (!(pct > 0) || pct > 0.05) return []
        return [{ data_limite: l.data_limite, dias: l.dias, desconto: pct, valor: Math.round(total * (1 - pct) * 100) / 100 }]
      })
    onChange({ ...SEM_DESCONTO, valor_cheio: ativos.length ? total : null, descontos_condicionais: ativos })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas, negociado, total])

  if (negociado) {
    return (
      <div className="text-xs rounded-lg px-3 py-2" style={{ background: 'var(--rbr-muted-bg)' }}>
        Cotação com <strong>{(negociado * 100).toLocaleString('pt-BR')}% de desconto negociado</strong>: vale só com pagamento até o vencimento.
        Valor cheio registrado na fatura: <strong>{brl(Math.round((total / (1 - negociado)) * 100) / 100)}</strong>. Sem desconto condicional por
        cima (um desconto por frete).
      </div>
    )
  }
  if (!linhas.length) return null
  return (
    <div className="rounded-lg border px-3 py-2.5 flex flex-col gap-2" style={{ borderColor: 'var(--rbr-border)' }}>
      <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">
        Desconto se pagar antes{prazo ? ` · contrato ${ROTULO_PRAZO[prazo]}` : ''}
      </div>
      {linhas.map((l, i) => {
        const pct = Number(l.pctTexto.replace(',', '.')) / 100
        const valor = pct > 0 ? Math.round(total * (1 - pct) * 100) / 100 : total
        return (
          <div key={l.data_limite} className="flex items-center gap-2 flex-wrap text-xs">
            <input
              id={`desc-cond-${i}`}
              type="checkbox"
              checked={l.ativo}
              onChange={(e) => setLinhas((ls) => ls.map((x, j) => (j === i ? { ...x, ativo: e.target.checked } : x)))}
            />
            <label htmlFor={`desc-cond-${i}`} className="flex-1">
              Até {fmtData(l.data_limite)} ({l.dias} dias)
            </label>
            <input
              aria-label={`Desconto até ${fmtData(l.data_limite)}`}
              inputMode="decimal"
              value={l.pctTexto}
              onChange={(e) => setLinhas((ls) => ls.map((x, j) => (j === i ? { ...x, pctTexto: e.target.value.replace(/[^\d,.]/g, '') } : x)))}
              className={inputClass}
              style={{ ...inputStyle, width: 70, textAlign: 'right' }}
            />
            <span>%</span>
            <span className="tabular-nums font-semibold w-28 text-right">{brl(valor)}</span>
            {pct > 0.05 && <span style={{ color: 'var(--rbr-danger)' }}>acima de 5%: não entra</span>}
          </div>
        )
      })}
      {aviso && <div className="text-[11px] text-[color:var(--rbr-muted)]">{aviso}</div>}
    </div>
  )
}
