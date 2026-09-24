import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { type ResultadoOperacao, GRUPO_LABEL, brl, erroMsg, fmtMes, hojeISO } from '../../lib/financeiro'
import { Aviso, Card, Carregando, Chips, Vazio, inputClass, inputStyle } from './ui'

interface LinhaDre {
  mes: string
  categoria_id: string | null
  categoria_nome: string
  grupo: string
  tipo: string
  valor: number
  natureza: string
}

// Estrutura do DRE gerencial: blocos somados/subtraídos em ordem.
const BLOCOS: { grupos: string[]; sinal: 1 | -1; subtotal?: string }[] = [
  { grupos: ['receita_operacional'], sinal: 1, subtotal: undefined },
  { grupos: ['deducoes'], sinal: -1, subtotal: 'Receita líquida' },
  { grupos: ['custo_operacional'], sinal: -1, subtotal: 'Margem de contribuição' },
  { grupos: ['despesa_administrativa', 'despesa_comercial', 'despesa_pessoal'], sinal: -1, subtotal: 'Resultado operacional' },
  { grupos: ['outras_receitas', 'receita_financeira'], sinal: 1 },
  { grupos: ['despesa_financeira'], sinal: -1, subtotal: 'Lucro líquido' },
]
const FORA = ['investimento', 'retirada_socios', 'emprestimo']

export default function Resultado({ versao }: { versao: number }) {
  const ano = Number(hojeISO().slice(0, 4))
  const [de, setDe] = useState(`${ano}-01`)
  const [ate, setAte] = useState(hojeISO().slice(0, 7))
  const [regime, setRegime] = useState<'competencia' | 'caixa'>('competencia')
  const [linhas, setLinhas] = useState<LinhaDre[] | null>(null)
  const [ops, setOps] = useState<ResultadoOperacao[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aberto, setAberto] = useState<Set<string>>(new Set())
  const [visao, setVisao] = useState<'dre' | 'operacoes' | 'clientes'>('dre')

  useEffect(() => {
    const [a, m] = ate.split('-').map(Number)
    const fim = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10)
    setLinhas(null)
    supabase.rpc('dre', { p_de: `${de}-01`, p_ate: fim, p_regime: regime }).then(({ data, error }) => {
      if (error) setErro(error.message)
      setLinhas(((data ?? []) as LinhaDre[]).map((l) => ({ ...l, valor: Number(l.valor) })))
    })
  }, [de, ate, regime, versao])

  useEffect(() => {
    const [a2, m2] = ate.split('-').map(Number)
    const inicio = new Date(`${de}-01T00:00:00`).toISOString()
    const fimExclusivo = new Date(a2, m2, 1, 0, 0, 0).toISOString()
    supabase
      .from('v_resultado_operacoes')
      .select('*')
      .neq('status', 'cancelada')
      .gte('created_at', inicio)
      .lt('created_at', fimExclusivo)
      .order('created_at', { ascending: false })
      .limit(500)
      .then(({ data, error }) => {
        if (error) setErro(erroMsg(error))
        setOps(data ?? [])
      })
  }, [de, ate, versao])

  const meses = useMemo(() => {
    const r: string[] = []
    let [a, m] = de.split('-').map(Number)
    const [a2, m2] = ate.split('-').map(Number)
    while (a < a2 || (a === a2 && m <= m2)) {
      r.push(`${a}-${String(m).padStart(2, '0')}-01`)
      m++
      if (m > 12) {
        m = 1
        a++
      }
      if (r.length > 36) break
    }
    return r
  }, [de, ate])

  const somaGrupo = (grupos: string[], mes?: string) =>
    (linhas ?? []).filter((l) => grupos.includes(l.grupo) && (!mes || l.mes === mes)).reduce((s, l) => s + l.valor, 0)

  const tabela = useMemo(() => {
    if (!linhas) return []
    const out: { tipo: 'grupo' | 'cat' | 'sub'; chave: string; label: string; valores: number[]; total: number; sinal: number; grupo?: string }[] = []
    const acum = meses.map(() => 0)
    let acumTotal = 0
    for (const b of BLOCOS) {
      for (const g of b.grupos) {
        const vals = meses.map((m) => somaGrupo([g], m))
        const tot = somaGrupo([g])
        if (tot === 0 && vals.every((v) => v === 0) && g !== 'receita_operacional') continue
        out.push({ tipo: 'grupo', chave: g, label: GRUPO_LABEL[g] ?? g, valores: vals, total: tot, sinal: b.sinal })
        const cats = [...new Set(linhas.filter((l) => l.grupo === g).map((l) => l.categoria_nome))]
        for (const c of cats) {
          out.push({
            tipo: 'cat',
            chave: `${g}:${c}`,
            grupo: g,
            label: c,
            valores: meses.map((m) => linhas.filter((l) => l.grupo === g && l.categoria_nome === c && l.mes === m).reduce((s, l) => s + l.valor, 0)),
            total: linhas.filter((l) => l.grupo === g && l.categoria_nome === c).reduce((s, l) => s + l.valor, 0),
            sinal: b.sinal,
          })
        }
        vals.forEach((v, i) => (acum[i] += b.sinal * v))
        acumTotal += b.sinal * tot
      }
      if (b.subtotal) out.push({ tipo: 'sub', chave: b.subtotal, label: b.subtotal, valores: [...acum], total: acumTotal, sinal: 1 })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas, meses])

  const receitaTotal = somaGrupo(['receita_operacional'])
  const margemContrib = tabela.find((t) => t.chave === 'Margem de contribuição')?.total ?? 0
  const lucroLiq = tabela.find((t) => t.chave === 'Lucro líquido')?.total ?? 0
  // Fora do resultado: líquido de cada grupo (entradas − saídas), já que o DRE devolve os dois positivos.
  const fora = FORA.map((g) => ({
    g,
    v: (linhas ?? []).filter((l) => l.grupo === g).reduce((s, l) => s + (l.tipo === 'receita' ? l.valor : -l.valor), 0),
  })).filter((x) => Math.abs(x.v) > 0.004)
  const saidasFora = (linhas ?? []).filter((l) => (l.grupo === 'retirada_socios' || l.grupo === 'investimento') && l.tipo === 'despesa').reduce((s, l) => s + l.valor, 0)

  const porCliente = useMemo(() => {
    const m = new Map<string, { cliente: string; ops: number; receita: number; lucro: number; aReceber: number; margemPrev: number }>()
    for (const o of ops ?? []) {
      const k = o.cliente_nome ?? '—'
      const x = m.get(k) ?? { cliente: k, ops: 0, receita: 0, lucro: 0, aReceber: 0, margemPrev: 0 }
      x.ops++
      x.receita += Number(o.receita_real ?? 0)
      x.lucro += Number(o.lucro_real ?? 0)
      x.aReceber += Number(o.a_receber ?? 0)
      x.margemPrev += Number(o.lucro_previsto ?? 0)
      m.set(k, x)
    }
    return [...m.values()].sort((a, b) => b.receita - a.receita)
  }, [ops])

  // Fixo × variável: margem de contribuição e ponto de equilíbrio (quanto faturar por mês para empatar)
  const equilibrio = useMemo(() => {
    const porMes = meses.map((m) => {
      const doMes = (linhas ?? []).filter((l) => l.mes === m)
      const receita = doMes.filter((l) => l.tipo === 'receita' && l.grupo === 'receita_operacional').reduce((s, l) => s + l.valor, 0)
      const variaveis = doMes.filter((l) => l.tipo === 'despesa' && l.natureza === 'variavel').reduce((s, l) => s + l.valor, 0)
      const fixos = doMes.filter((l) => l.tipo === 'despesa' && l.natureza === 'fixa').reduce((s, l) => s + l.valor, 0)
      const mc = receita - variaveis
      return { mes: m, receita, variaveis, fixos, mc, mcPct: receita > 0 ? mc / receita : null, resultado: mc - fixos }
    })
    const receita = porMes.reduce((s, x) => s + x.receita, 0)
    const variaveis = porMes.reduce((s, x) => s + x.variaveis, 0)
    const fixos = porMes.reduce((s, x) => s + x.fixos, 0)
    const n = Math.max(1, porMes.length)
    const mcPct = receita > 0 ? (receita - variaveis) / receita : null
    const fixoMensal = fixos / n
    const pontoEquilibrio = mcPct && mcPct > 0 ? fixoMensal / mcPct : null
    return { porMes, receita, variaveis, fixos, mcPct, fixoMensal, receitaMensal: receita / n, pontoEquilibrio }
  }, [linhas, meses])

  const pct = (v: number, base: number) => (base ? `${((v / base) * 100).toFixed(1).replace('.', ',')}%` : '—')

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-2 flex-wrap justify-between">
        <Chips
          opcoes={[
            { valor: 'dre', label: 'DRE' },
            { valor: 'operacoes', label: 'Margem por operação' },
            { valor: 'clientes', label: 'Por cliente' },
          ]}
          valor={visao}
          onChange={setVisao}
        />
        <div className="flex gap-2 items-end flex-wrap">
          <label className="text-[11px] text-[color:var(--rbr-muted)]">
            De
            <input type="month" value={de} onChange={(e) => setDe(e.target.value)} className={inputClass} style={inputStyle} />
          </label>
          <label className="text-[11px] text-[color:var(--rbr-muted)]">
            Até
            <input type="month" value={ate} onChange={(e) => setAte(e.target.value)} className={inputClass} style={inputStyle} />
          </label>
          {visao === 'dre' && (
            <Chips
              opcoes={[
                { valor: 'competencia', label: 'Competência' },
                { valor: 'caixa', label: 'Caixa' },
              ]}
              valor={regime}
              onChange={setRegime}
            />
          )}
        </div>
      </div>
      {erro && <Aviso>{erro}</Aviso>}

      {visao === 'dre' &&
        (!linhas ? (
          <Carregando />
        ) : (
          <>
            <div className="text-[11px] text-[color:var(--rbr-muted)]">
              {regime === 'competencia'
                ? 'Competência: cada valor entra no mês em que o serviço aconteceu (frete no mês da emissão), pago ou não. Inclui previsões.'
                : 'Caixa: só o que efetivamente entrou e saiu das contas, no mês do pagamento.'}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Resumo label="Receita" valor={brl(receitaTotal)} />
              <Resumo label="Margem de contribuição" valor={brl(margemContrib)} sub={pct(margemContrib, receitaTotal)} />
              <Resumo label="Lucro líquido" valor={brl(lucroLiq)} sub={pct(lucroLiq, receitaTotal)} ruim={lucroLiq < 0} />
              <Resumo label="Retiradas e investimentos" valor={brl(saidasFora)} sub="fora do resultado" />
            </div>

            <Card titulo="Custos fixos × variáveis e ponto de equilíbrio">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                <Resumo label="Custo fixo por mês (média)" valor={brl(equilibrio.fixoMensal)} sub="aluguel, energia, contador, sistemas…" />
                <Resumo
                  label="Custos variáveis"
                  valor={equilibrio.receita > 0 ? pct(equilibrio.variaveis, equilibrio.receita) : '—'}
                  sub="do faturamento (motorista, pedágio, seguro, imposto…)"
                />
                <Resumo label="Margem de contribuição" valor={equilibrio.mcPct != null ? pct(equilibrio.mcPct, 1) : '—'} sub="o que sobra de cada R$ 100 de frete" />
                <Resumo
                  label="Ponto de equilíbrio"
                  valor={equilibrio.pontoEquilibrio != null ? `${brl(equilibrio.pontoEquilibrio)}/mês` : '—'}
                  sub={
                    equilibrio.pontoEquilibrio != null
                      ? equilibrio.receitaMensal >= equilibrio.pontoEquilibrio
                        ? `faturando ${brl(equilibrio.receitaMensal)}/mês — acima`
                        : `faturando ${brl(equilibrio.receitaMensal)}/mês — faltam ${brl(equilibrio.pontoEquilibrio - equilibrio.receitaMensal)}`
                      : 'sem faturamento no período'
                  }
                  ruim={equilibrio.pontoEquilibrio != null && equilibrio.receitaMensal < equilibrio.pontoEquilibrio}
                />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-[10.5px] uppercase tracking-wide text-[color:var(--rbr-muted)] border-b" style={{ borderColor: 'var(--rbr-border)' }}>
                      <th className="text-left p-2">Mês</th>
                      <th className="text-right p-2">Faturamento</th>
                      <th className="text-right p-2">(−) Variáveis</th>
                      <th className="text-right p-2">= Margem de contribuição</th>
                      <th className="text-right p-2">(−) Fixos</th>
                      <th className="text-right p-2">= Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {equilibrio.porMes.map((x) => (
                      <tr key={x.mes} className="border-b" style={{ borderColor: 'var(--rbr-border)' }}>
                        <td className="p-2 whitespace-nowrap">{fmtMes(x.mes)}</td>
                        <td className="p-2 text-right tabular-nums">{x.receita ? brl(x.receita) : '—'}</td>
                        <td className="p-2 text-right tabular-nums">{x.variaveis ? brl(x.variaveis) : '—'}</td>
                        <td className="p-2 text-right tabular-nums">
                          {x.receita || x.variaveis ? brl(x.mc) : '—'}
                          {x.mcPct != null && <span className="text-[color:var(--rbr-muted)]"> ({pct(x.mcPct, 1)})</span>}
                        </td>
                        <td className="p-2 text-right tabular-nums">{x.fixos ? brl(x.fixos) : '—'}</td>
                        <td className="p-2 text-right tabular-nums font-semibold" style={{ color: x.resultado < 0 ? 'var(--rbr-danger)' : undefined }}>
                          {x.receita || x.fixos || x.variaveis ? brl(x.resultado) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="text-[11px] text-[color:var(--rbr-muted)] mt-2">
                Fixa ou variável vem da categoria (Configurações → Plano de contas). Cadastre as despesas fixas em “Despesas e receitas fixas” para o custo fixo do
                mês ficar completo mesmo antes de pagar.
              </div>
            </Card>
            <Card className="!p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="text-[10.5px] uppercase tracking-wide text-[color:var(--rbr-muted)] border-b" style={{ borderColor: 'var(--rbr-border)' }}>
                      <th className="p-2.5 text-left sticky left-0 bg-white min-w-[200px]">Conta</th>
                      {meses.map((m) => (
                        <th key={m} className="p-2.5 text-right whitespace-nowrap">
                          {fmtMes(m)}
                        </th>
                      ))}
                      <th className="p-2.5 text-right">Total</th>
                      <th className="p-2.5 text-right">% rec.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tabela
                      .filter((t) => t.tipo !== 'cat' || aberto.has(t.grupo!))
                      .map((t) => (
                        <tr
                          key={t.chave}
                          className={`border-b ${t.tipo === 'grupo' ? 'cursor-pointer hover:bg-[#FAFBFD]' : ''}`}
                          style={{ borderColor: 'var(--rbr-border)', background: t.tipo === 'sub' ? 'var(--rbr-muted-bg)' : undefined }}
                          onClick={() =>
                            t.tipo === 'grupo' &&
                            setAberto((s) => {
                              const n = new Set(s)
                              if (n.has(t.chave)) n.delete(t.chave)
                              else n.add(t.chave)
                              return n
                            })
                          }
                        >
                          <td
                            className={`p-2.5 sticky left-0 ${t.tipo === 'sub' ? 'font-bold' : t.tipo === 'grupo' ? 'font-semibold' : 'pl-7 text-[color:var(--rbr-muted)]'}`}
                            style={{ background: t.tipo === 'sub' ? 'var(--rbr-muted-bg)' : '#fff' }}
                          >
                            {t.tipo === 'grupo' && <span className="inline-block w-3 text-[10px]">{aberto.has(t.chave) ? '▾' : '▸'}</span>}
                            {t.tipo === 'grupo' && t.sinal < 0 ? '(−) ' : t.tipo === 'grupo' && t.chave !== 'receita_operacional' ? '(+) ' : ''}
                            {t.tipo === 'sub' ? `= ${t.label}` : t.label}
                          </td>
                          {t.valores.map((v, i) => (
                            <td key={i} className="p-2.5 text-right tabular-nums whitespace-nowrap" style={{ color: t.tipo === 'sub' && v < 0 ? 'var(--rbr-danger)' : undefined }}>
                              {v === 0 ? '—' : brl(v).replace('R$', '').trim()}
                            </td>
                          ))}
                          <td className="p-2.5 text-right tabular-nums font-semibold whitespace-nowrap" style={{ color: t.tipo === 'sub' && t.total < 0 ? 'var(--rbr-danger)' : undefined }}>
                            {brl(t.total).replace('R$', '').trim()}
                          </td>
                          <td className="p-2.5 text-right tabular-nums text-[color:var(--rbr-muted)]">{pct(t.total, receitaTotal)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </Card>
            {fora.length > 0 && (
              <div className="text-xs text-[color:var(--rbr-muted)]">
                Fora do resultado no período (líquido, + entrou / − saiu): {fora.map((x) => `${GRUPO_LABEL[x.g]} ${brl(x.v)}`).join(' · ')}
              </div>
            )}
          </>
        ))}

      {visao === 'operacoes' &&
        (!ops ? (
          <Carregando />
        ) : ops.length === 0 ? (
          <Card>
            <Vazio>Nenhuma operação no período.</Vazio>
          </Card>
        ) : (
          <Card className="!p-0 overflow-hidden">
            <div className="px-3 pt-3 text-[11px] text-[color:var(--rbr-muted)]">
              Previsto = o que a cotação calculou. Real = o que está no financeiro (recebíveis e custos lançados, pagos ou não) menos o imposto estimado. Quando o real fica
              abaixo, algum custo não previsto entrou na operação.
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="text-left text-[10.5px] uppercase tracking-wide text-[color:var(--rbr-muted)] border-b" style={{ borderColor: 'var(--rbr-border)' }}>
                    <th className="p-2.5">Operação</th>
                    <th className="p-2.5 text-right">Receita</th>
                    <th className="p-2.5 text-right">Custos</th>
                    <th className="p-2.5 text-right">Lucro prev.</th>
                    <th className="p-2.5 text-right">Lucro real</th>
                    <th className="p-2.5 text-right">Margem prev. → real</th>
                    <th className="p-2.5 text-right">A receber</th>
                  </tr>
                </thead>
                <tbody>
                  {ops.map((o) => {
                    const mp = o.margem_prevista != null ? Number(o.margem_prevista) : null
                    const mr = o.margem_real != null ? Number(o.margem_real) : null
                    const piorou = mp != null && mr != null && mr < mp - 0.02
                    return (
                      <tr key={o.operacao_id} className="border-b" style={{ borderColor: 'var(--rbr-border)' }}>
                        <td className="p-2.5">
                          <div className="font-semibold truncate max-w-[260px]">{o.rota ?? '—'}</div>
                          <div className="text-[10.5px] text-[color:var(--rbr-muted)]">
                            {o.cliente_nome ?? '—'} · {o.status}
                          </div>
                        </td>
                        <td className="p-2.5 text-right tabular-nums">{brl(Number(o.receita_real))}</td>
                        <td className="p-2.5 text-right tabular-nums">{brl(Number(o.custos_reais))}</td>
                        <td className="p-2.5 text-right tabular-nums">{brl(o.lucro_previsto != null ? Number(o.lucro_previsto) : null)}</td>
                        <td className="p-2.5 text-right tabular-nums font-semibold" style={{ color: Number(o.lucro_real) < 0 ? 'var(--rbr-danger)' : undefined }}>
                          {brl(Number(o.lucro_real))}
                        </td>
                        <td className="p-2.5 text-right tabular-nums whitespace-nowrap" style={{ color: piorou ? 'var(--rbr-danger)' : undefined }}>
                          {mp != null ? pct(mp, 1) : '—'} → {mr != null ? pct(mr, 1) : '—'}
                        </td>
                        <td className="p-2.5 text-right tabular-nums">{Number(o.a_receber) > 0 ? brl(Number(o.a_receber)) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        ))}

      {visao === 'clientes' &&
        (!ops ? (
          <Carregando />
        ) : (
          <Card className="!p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="text-left text-[10.5px] uppercase tracking-wide text-[color:var(--rbr-muted)] border-b" style={{ borderColor: 'var(--rbr-border)' }}>
                    <th className="p-2.5">Cliente</th>
                    <th className="p-2.5 text-right">Operações</th>
                    <th className="p-2.5 text-right">Receita</th>
                    <th className="p-2.5 text-right">% da receita</th>
                    <th className="p-2.5 text-right">Lucro real</th>
                    <th className="p-2.5 text-right">Margem</th>
                    <th className="p-2.5 text-right">A receber</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const tot = porCliente.reduce((s, c) => s + c.receita, 0)
                    return porCliente.map((c) => (
                      <tr key={c.cliente} className="border-b" style={{ borderColor: 'var(--rbr-border)' }}>
                        <td className="p-2.5 font-semibold">{c.cliente}</td>
                        <td className="p-2.5 text-right tabular-nums">{c.ops}</td>
                        <td className="p-2.5 text-right tabular-nums">{brl(c.receita)}</td>
                        <td className="p-2.5 text-right tabular-nums" style={{ color: tot && c.receita / tot > 0.4 ? '#8A5A00' : undefined }}>
                          {pct(c.receita, tot)}
                        </td>
                        <td className="p-2.5 text-right tabular-nums">{brl(c.lucro)}</td>
                        <td className="p-2.5 text-right tabular-nums">{pct(c.lucro, c.receita)}</td>
                        <td className="p-2.5 text-right tabular-nums">{c.aReceber > 0 ? brl(c.aReceber) : '—'}</td>
                      </tr>
                    ))
                  })()}
                </tbody>
              </table>
            </div>
          </Card>
        ))}
    </div>
  )
}

function Resumo({ label, valor, sub, ruim }: { label: string; valor: string; sub?: string; ruim?: boolean }) {
  return (
    <div className="bg-white border rounded-xl p-3" style={{ borderColor: 'var(--rbr-border)' }}>
      <div className="text-[11px] text-[color:var(--rbr-muted)]">{label}</div>
      <div className="rbr-display font-bold tabular-nums" style={{ color: ruim ? 'var(--rbr-danger)' : 'var(--rbr-navy-dark)' }}>
        {valor}
      </div>
      {sub && <div className="text-[11px] text-[color:var(--rbr-muted)]">{sub}</div>}
    </div>
  )
}

