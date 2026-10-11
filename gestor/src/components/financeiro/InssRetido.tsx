import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { dbNovo } from '@rbr/shared/dbNovo'
import { formatMoney } from '@rbr/shared/format'
import { Aviso, Botao, Campo, Card, Carregando, Vazio, inputClass, inputStyle } from './ui'
import { useConfirmacao } from '../Confirmacao'

// Tarefa 3: relatório mensal do INSS retido dos parceiros TAC PF (vence dia 20 do mês seguinte) e os parâmetros da retenção.

type Linha = {
  competencia: string
  vencimento: string
  parceiro_id: string
  parceiro_nome: string
  parceiro_cpf: string | null
  operacoes: number
  frete_bruto: number
  base: number
  inss_retido: number
}
type Parametros = {
  inss_aliquota_retencao: number
  inss_base_frete: number
  inss_teto_salario_contribuicao: number | null
  sest_senat_ativo: boolean
  sest_senat_aliquota: number | null
  irrf_ativo: boolean
}

const mesAno = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
const dataBr = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
const numero = (s: string) => {
  const v = Number(s.replace(/\./g, '').replace(',', '.'))
  return s.trim() === '' || !Number.isFinite(v) ? null : v
}

export default function InssRetido() {
  const [linhas, setLinhas] = useState<Linha[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    const { data, error } = await dbNovo.from('v_inss_retido_mensal').select('*').order('competencia', { ascending: false })
    setErro(error ? error.message : null)
    setLinhas((data as Linha[] | null) ?? [])
  }, [])
  useEffect(() => {
    void carregar()
  }, [carregar])

  const porMes = useMemo(() => {
    const m = new Map<string, Linha[]>()
    for (const l of linhas ?? []) m.set(l.competencia, [...(m.get(l.competencia) ?? []), l])
    return [...m.entries()]
  }, [linhas])

  return (
    <div className="flex flex-col gap-4">
      <ParametrosRetencao />
      <Card titulo="INSS retido dos parceiros (TAC pessoa física)">
        {erro && <Aviso>{erro}</Aviso>}
        {linhas === null ? (
          <Carregando />
        ) : porMes.length === 0 ? (
          <Vazio>Nenhuma retenção registrada ainda.</Vazio>
        ) : (
          <div className="flex flex-col gap-4">
            {porMes.map(([comp, ls]) => {
              const total = ls.reduce((s, l) => s + Number(l.inss_retido), 0)
              return (
                <div key={comp} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="text-sm font-bold capitalize">{mesAno(comp)}</div>
                    <div className="text-xs">
                      Recolher até <b>{dataBr(ls[0].vencimento)}</b> · total <b className="tabular-nums">{formatMoney(total)}</b>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-[10.5px] uppercase tracking-wide text-[color:var(--rbr-muted)]">
                          <th className="py-1 pr-3">Parceiro</th>
                          <th className="pr-3">CPF</th>
                          <th className="pr-3 text-right">Operações</th>
                          <th className="pr-3 text-right">Frete bruto</th>
                          <th className="pr-3 text-right">Base (20%)</th>
                          <th className="text-right">INSS retido</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ls.map((l) => (
                          <tr key={l.parceiro_id} className="border-t" style={{ borderColor: 'var(--rbr-border)' }}>
                            <td className="py-1.5 pr-3 font-semibold">{l.parceiro_nome}</td>
                            <td className="pr-3 tabular-nums">{l.parceiro_cpf ?? '—'}</td>
                            <td className="pr-3 text-right tabular-nums">{l.operacoes}</td>
                            <td className="pr-3 text-right tabular-nums">{formatMoney(l.frete_bruto)}</td>
                            <td className="pr-3 text-right tabular-nums">{formatMoney(l.base)}</td>
                            <td className="text-right tabular-nums font-bold">{formatMoney(l.inss_retido)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}

function ParametrosRetencao() {
  const [p, setP] = useState<Parametros | null>(null)
  const [teto, setTeto] = useState('')
  const [aliq, setAliq] = useState('')
  const [base, setBase] = useState('')
  const { confirmacao, rodar, ocupado } = useConfirmacao()

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('parametros_sistema').select('valor').eq('chave', 'retencoes_parceiro').maybeSingle()
    const v = (data?.valor ?? null) as Parametros | null
    setP(v)
    setTeto(v?.inss_teto_salario_contribuicao != null ? String(v.inss_teto_salario_contribuicao).replace('.', ',') : '')
    setAliq(v ? String(v.inss_aliquota_retencao * 100).replace('.', ',') : '11')
    setBase(v ? String(v.inss_base_frete * 100).replace('.', ',') : '20')
  }, [])
  useEffect(() => {
    void carregar()
  }, [carregar])

  if (!p) return null
  return (
    <Card titulo="Parâmetros da retenção">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Campo label="INSS retido (%)">
          <input value={aliq} onChange={(e) => setAliq(e.target.value)} inputMode="decimal" className={inputClass} style={inputStyle} />
        </Campo>
        <Campo label="Base: % do frete bruto">
          <input value={base} onChange={(e) => setBase(e.target.value)} inputMode="decimal" className={inputClass} style={inputStyle} />
        </Campo>
        <Campo label="Teto do salário de contribuição (R$/mês)" dica="Vazio = sem limite (aparece aviso).">
          <input value={teto} onChange={(e) => setTeto(e.target.value)} inputMode="decimal" className={inputClass} style={inputStyle} />
        </Campo>
      </div>
      <div className="text-[11px] text-[color:var(--rbr-muted)] mt-2">
        SEST/SENAT: {p.sest_senat_ativo ? 'ligado' : 'desligado (a confirmar)'} · IRRF: {p.irrf_ativo ? 'ligado' : 'a confirmar (não calculado)'}. A base é só o frete; o VPO não entra.
      </div>
      {confirmacao}
      <div className="mt-2">
        <Botao
          disabled={ocupado}
          onClick={() =>
            void rodar('Parâmetros da retenção salvos. Valem para as próximas condições de pagamento salvas.', async () => {
              const a = numero(aliq)
              const b = numero(base)
              if (a == null || a <= 0 || a > 100) throw new Error('Percentual do INSS inválido.')
              if (b == null || b <= 0 || b > 100) throw new Error('Percentual da base inválido.')
              const novo = { ...p, inss_aliquota_retencao: a / 100, inss_base_frete: b / 100, inss_teto_salario_contribuicao: numero(teto) }
              const { error } = await supabase.from('parametros_sistema').update({ valor: novo }).eq('chave', 'retencoes_parceiro')
              if (error) throw error
              await carregar()
            })
          }
        >
          {ocupado ? 'enviando…' : 'Salvar parâmetros'}
        </Botao>
      </div>
    </Card>
  )
}
