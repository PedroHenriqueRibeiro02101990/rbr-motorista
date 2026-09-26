import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import type { Database } from '@rbr/shared/database.types'
import { formatMoney, formatDate, formatDateTime } from '@rbr/shared/format'

type Pessoa = Database['public']['Tables']['pessoas']['Row']
type Comissao = Database['public']['Tables']['comissoes_agenciador']['Row']
type Spread = Database['public']['Tables']['spreads_agenciador']['Row']
type Pix = Database['public']['Tables']['pix_cobrancas_agenciador']['Row']
type Faixa = Database['public']['Tables']['agenciador_faixa_override']['Row']

type SpreadComCliente = Spread & { clienteNome?: string; taxaValor?: number | null }
type PixComCliente = Pix & { clienteNome?: string }

const PIX_STATUS_LABEL: Record<string, string> = {
  aguardando: 'Aguardando',
  confirmado: 'Confirmado',
  expirado: 'Expirado',
}
const PIX_STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  aguardando: { bg: 'var(--rbr-warning-bg)', color: 'var(--rbr-navy-dark)' },
  confirmado: { bg: 'var(--rbr-positive)', color: '#FFFFFF' },
  expirado: { bg: '#FCE8E8', color: 'var(--rbr-danger)' },
}

export default function Financeiro({ pessoa }: { pessoa: Pessoa }) {
  const [comissoes, setComissoes] = useState<Comissao[]>([])
  const [spreads, setSpreads] = useState<SpreadComCliente[]>([])
  const [pixCobrancas, setPixCobrancas] = useState<PixComCliente[]>([])
  const [faixas, setFaixas] = useState<Faixa[]>([])
  const [baseAtivaQtd, setBaseAtivaQtd] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    const comissoesPromise = supabase
      .from('comissoes_agenciador')
      .select('*')
      .eq('agenciador_id', pessoa.id)
      .order('competencia', { ascending: false })

    const spreadsPromise = supabase
      .from('spreads_agenciador')
      .select('*, operacoes(clientes(razao_social, nome_fantasia)), taxas_tecnologia(valor)')
      .eq('agenciador_id', pessoa.id)
      .order('created_at', { ascending: false })

    const pixPromise = supabase
      .from('pix_cobrancas_agenciador')
      .select('*, operacoes(clientes(razao_social, nome_fantasia))')
      .eq('agenciador_id', pessoa.id)
      .order('created_at', { ascending: false })

    const baseAtivaPromise = supabase
      .from('vinculos_agenciador_motorista')
      .select('id', { count: 'exact', head: true })
      .eq('agenciador_id', pessoa.id)
      .eq('status', 'confirmado')

    const [
      { data: com, error: comErr },
      { data: spr, error: sprErr },
      { data: pix, error: pixErr },
      { count: baseCount },
    ] = await Promise.all([comissoesPromise, spreadsPromise, pixPromise, baseAtivaPromise])

    if (comErr || sprErr || pixErr) setError((comErr ?? sprErr ?? pixErr)?.message ?? 'Erro ao carregar financeiro')

    setComissoes(com ?? [])
    setSpreads(
      (spr ?? []).map((s: any) => ({
        ...s,
        clienteNome: (s as any).operacoes?.clientes?.nome_fantasia ?? (s as any).operacoes?.clientes?.razao_social,
        taxaValor: (s as any).taxas_tecnologia?.valor ?? null,
      })),
    )
    setPixCobrancas(
      (pix ?? []).map((p: any) => ({
        ...p,
        clienteNome: (p as any).operacoes?.clientes?.nome_fantasia ?? (p as any).operacoes?.clientes?.razao_social,
      })),
    )
    setBaseAtivaQtd(baseCount ?? 0)

    // Faixa de comissão é dado de referência pública, mas se a RLS não liberar
    // para este papel, apenas omitimos essa seção em vez de quebrar a página.
    const { data: fx, error: fxErr } = await supabase
      .from('agenciador_faixa_override')
      .select('*')
      .order('min_qtd', { ascending: true })
    if (!fxErr) setFaixas(fx ?? [])

    setLoading(false)
  }, [pessoa.id])

  useEffect(() => {
    load()
  }, [load])

  const faixaAtual = faixas.find(
    (f) => baseAtivaQtd >= f.min_qtd && (f.max_qtd == null || baseAtivaQtd <= f.max_qtd),
  )
  const faixaAtualIdx = faixaAtual ? faixas.indexOf(faixaAtual) : -1
  const proximaFaixa = faixaAtualIdx >= 0 ? faixas[faixaAtualIdx + 1] : undefined

  return (
    <div className="px-5 pt-8 md:px-0 md:pt-0 flex flex-col gap-3.5 md:gap-6 pb-4">
      <h1 className="rbr-display font-bold text-2xl md:text-3xl text-[color:var(--rbr-navy-dark)]">Financeiro</h1>

      {error && (
        <div className="text-xs text-[color:var(--rbr-danger)] bg-white border rounded-[14px] p-3" style={{ borderColor: 'var(--rbr-border)' }}>
          {error}
        </div>
      )}

      {loading && <div className="text-sm text-[color:var(--rbr-muted)] py-6 text-center">Carregando…</div>}

      {!loading && faixas.length > 0 && (
        <div
          className="bg-white border rounded-[20px] p-[18px]"
          style={{ borderColor: 'var(--rbr-border)', boxShadow: '0 1px 2px rgba(18,23,61,0.03), 0 6px 18px rgba(18,23,61,0.05)' }}
        >
          <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] mb-2">
            Sua faixa de comissão
          </div>
          <div className="flex items-end justify-between flex-wrap gap-2">
            <div>
              <div className="text-2xl font-bold text-[color:var(--rbr-navy-dark)]">
                {baseAtivaQtd} <span className="text-xs font-medium text-[color:var(--rbr-muted)]">motoristas na base ativa</span>
              </div>
              <div className="text-sm mt-1" style={{ color: 'var(--rbr-positive)' }}>
                {faixaAtual ? `Percentual atual: ${faixaAtual.percentual}%` : 'Ainda fora das faixas cadastradas'}
              </div>
            </div>
            {proximaFaixa && (
              <div className="text-xs text-[color:var(--rbr-muted)] text-right">
                Faltam {Math.max(0, proximaFaixa.min_qtd - baseAtivaQtd)} para {proximaFaixa.percentual}%
              </div>
            )}
          </div>
        </div>
      )}

      {!loading && (
        <section className="flex flex-col gap-2.5">
          <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">Comissões por competência</div>
          {comissoes.length === 0 ? (
            <div className="text-sm text-[color:var(--rbr-muted)] bg-white border rounded-[16px] p-4" style={{ borderColor: 'var(--rbr-border)' }}>
              Nenhuma comissão registrada ainda.
            </div>
          ) : (
            <>
              {/* Mobile: cards */}
              <div className="md:hidden flex flex-col gap-2.5">
                {comissoes.map((c) => (
                  <div
                    key={c.id}
                    className="bg-white border rounded-[14px] p-4"
                    style={{ borderColor: 'var(--rbr-border)', boxShadow: '0 1px 2px rgba(18,23,61,0.03), 0 6px 18px rgba(18,23,61,0.05)' }}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-bold">{formatDate(c.competencia)}</span>
                      <span
                        className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
                        style={{
                          background: c.status === 'creditado' ? 'var(--rbr-positive)' : 'var(--rbr-warning-bg)',
                          color: c.status === 'creditado' ? '#FFFFFF' : 'var(--rbr-navy-dark)',
                        }}
                      >
                        {c.status === 'creditado' ? 'Creditado' : 'Pendente'}
                      </span>
                    </div>
                    <div className="text-lg font-bold">{formatMoney(c.valor_calculado)}</div>
                    <div className="text-xs text-[color:var(--rbr-muted)] mt-1">
                      {c.base_ativa_qtd} motoristas · {c.percentual_aplicado}%
                    </div>
                  </div>
                ))}
              </div>
              {/* Desktop: table */}
              <div
                className="hidden md:block bg-white border rounded-[16px] overflow-hidden"
                style={{ borderColor: 'var(--rbr-border)', boxShadow: '0 1px 2px rgba(18,23,61,0.03), 0 6px 18px rgba(18,23,61,0.05)' }}
              >
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-[color:var(--rbr-muted)] border-b" style={{ borderColor: 'var(--rbr-border)' }}>
                      <th className="px-4 py-3 font-semibold">Competência</th>
                      <th className="px-4 py-3 font-semibold">Base ativa</th>
                      <th className="px-4 py-3 font-semibold">Percentual</th>
                      <th className="px-4 py-3 font-semibold">Valor</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comissoes.map((c) => (
                      <tr key={c.id} className="border-b last:border-0" style={{ borderColor: 'var(--rbr-border)' }}>
                        <td className="px-4 py-3">{formatDate(c.competencia)}</td>
                        <td className="px-4 py-3">{c.base_ativa_qtd}</td>
                        <td className="px-4 py-3">{c.percentual_aplicado}%</td>
                        <td className="px-4 py-3 font-semibold">{formatMoney(c.valor_calculado)}</td>
                        <td className="px-4 py-3">
                          <span
                            className="text-[11px] font-bold uppercase px-2.5 py-1 rounded-full"
                            style={{
                              background: c.status === 'creditado' ? 'var(--rbr-positive)' : 'var(--rbr-warning-bg)',
                              color: c.status === 'creditado' ? '#FFFFFF' : 'var(--rbr-navy-dark)',
                            }}
                          >
                            {c.status === 'creditado' ? 'Creditado' : 'Pendente'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      {!loading && (
        <section className="flex flex-col gap-2.5">
          <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">Spreads por operação</div>
          {spreads.length === 0 ? (
            <div className="text-sm text-[color:var(--rbr-muted)] bg-white border rounded-[16px] p-4" style={{ borderColor: 'var(--rbr-border)' }}>
              Nenhum spread registrado ainda.
            </div>
          ) : (
            <>
              <div className="md:hidden flex flex-col gap-2.5">
                {spreads.map((s) => (
                  <div
                    key={s.id}
                    className="bg-white border rounded-[14px] p-4"
                    style={{ borderColor: 'var(--rbr-border)', boxShadow: '0 1px 2px rgba(18,23,61,0.03), 0 6px 18px rgba(18,23,61,0.05)' }}
                  >
                    <div className="text-sm font-semibold mb-1">{s.clienteNome ?? 'Cliente a confirmar'}</div>
                    <div className="flex justify-between text-xs text-[color:var(--rbr-muted)]">
                      <span>Bruto: {formatMoney(s.valor_bruto)}</span>
                      <span>Taxa: {formatMoney(s.valor_taxa_tecnologia)}</span>
                    </div>
                    <div className="text-sm font-bold mt-1.5">Líquido: {formatMoney(s.valor_liquido)}</div>
                  </div>
                ))}
              </div>
              <div
                className="hidden md:block bg-white border rounded-[16px] overflow-hidden"
                style={{ borderColor: 'var(--rbr-border)', boxShadow: '0 1px 2px rgba(18,23,61,0.03), 0 6px 18px rgba(18,23,61,0.05)' }}
              >
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-[color:var(--rbr-muted)] border-b" style={{ borderColor: 'var(--rbr-border)' }}>
                      <th className="px-4 py-3 font-semibold">Cliente</th>
                      <th className="px-4 py-3 font-semibold">Valor bruto</th>
                      <th className="px-4 py-3 font-semibold">Taxa tecnologia</th>
                      <th className="px-4 py-3 font-semibold">Valor líquido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {spreads.map((s) => (
                      <tr key={s.id} className="border-b last:border-0" style={{ borderColor: 'var(--rbr-border)' }}>
                        <td className="px-4 py-3">{s.clienteNome ?? 'Cliente a confirmar'}</td>
                        <td className="px-4 py-3">{formatMoney(s.valor_bruto)}</td>
                        <td className="px-4 py-3">{formatMoney(s.valor_taxa_tecnologia)}</td>
                        <td className="px-4 py-3 font-semibold">{formatMoney(s.valor_liquido)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      {!loading && (
        <section className="flex flex-col gap-2.5">
          <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">Cobranças Pix</div>
          {pixCobrancas.length === 0 ? (
            <div className="text-sm text-[color:var(--rbr-muted)] bg-white border rounded-[16px] p-4" style={{ borderColor: 'var(--rbr-border)' }}>
              Nenhuma cobrança Pix registrada ainda.
            </div>
          ) : (
            <>
              <div className="md:hidden flex flex-col gap-2.5">
                {pixCobrancas.map((p) => {
                  const style = PIX_STATUS_STYLE[p.status] ?? PIX_STATUS_STYLE.aguardando
                  return (
                    <div
                      key={p.id}
                      className="bg-white border rounded-[14px] p-4"
                      style={{ borderColor: 'var(--rbr-border)', boxShadow: '0 1px 2px rgba(18,23,61,0.03), 0 6px 18px rgba(18,23,61,0.05)' }}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-semibold">{p.clienteNome ?? 'Cliente a confirmar'}</span>
                        <span
                          className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
                          style={{ background: style.bg, color: style.color }}
                        >
                          {PIX_STATUS_LABEL[p.status] ?? p.status}
                        </span>
                      </div>
                      <div className="text-sm font-bold">{formatMoney(p.valor)}</div>
                      {p.janela_expira_em && (
                        <div className="text-xs text-[color:var(--rbr-muted)] mt-1">Expira em {formatDateTime(p.janela_expira_em)}</div>
                      )}
                    </div>
                  )
                })}
              </div>
              <div
                className="hidden md:block bg-white border rounded-[16px] overflow-hidden"
                style={{ borderColor: 'var(--rbr-border)', boxShadow: '0 1px 2px rgba(18,23,61,0.03), 0 6px 18px rgba(18,23,61,0.05)' }}
              >
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-[color:var(--rbr-muted)] border-b" style={{ borderColor: 'var(--rbr-border)' }}>
                      <th className="px-4 py-3 font-semibold">Cliente</th>
                      <th className="px-4 py-3 font-semibold">Valor</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Expira em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pixCobrancas.map((p) => {
                      const style = PIX_STATUS_STYLE[p.status] ?? PIX_STATUS_STYLE.aguardando
                      return (
                        <tr key={p.id} className="border-b last:border-0" style={{ borderColor: 'var(--rbr-border)' }}>
                          <td className="px-4 py-3">{p.clienteNome ?? 'Cliente a confirmar'}</td>
                          <td className="px-4 py-3 font-semibold">{formatMoney(p.valor)}</td>
                          <td className="px-4 py-3">
                            <span
                              className="text-[11px] font-bold uppercase px-2.5 py-1 rounded-full"
                              style={{ background: style.bg, color: style.color }}
                            >
                              {PIX_STATUS_LABEL[p.status] ?? p.status}
                            </span>
                          </td>
                          <td className="px-4 py-3">{formatDateTime(p.janela_expira_em)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  )
}
