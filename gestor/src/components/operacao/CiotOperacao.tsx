import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@rbr/shared/supabaseClient'
import type { DetalheOperacao } from '../../lib/operacaoDetalhe'

// Tarefa 2: origem do CIOT na operação (RBR na Repom ou CIOT do próprio parceiro ETC com mais de 3 veículos).
// O número continua em operacao_ciot_vpo.ciot, que é o que o MDF-e usa: sem CIOT, sem MDF-e.

type Executar = (fn: () => Promise<void>, sucesso?: string) => Promise<void>
type OrigemCiot = 'rbr_repom' | 'parceiro'
type CiotRow = {
  ciot: string | null
  ciot_origem: OrigemCiot | null
  ciot_status: string
  ciot_inicio_previsto: string | null
  ciot_fim_previsto: string | null
  ciot_prazo_pagamento: string | null
}
type AlertaCiot = { codigo: string; gravidade: 'bloqueia' | 'atencao'; limite: string | null; mensagem: string }

export const ORIGEM_LABEL: Record<OrigemCiot, string> = { rbr_repom: 'RBR gera na Repom', parceiro: 'CIOT do parceiro (ETC)' }
export const STATUS_CIOT_LABEL: Record<string, string> = {
  pendente: 'Pendente',
  emitido: 'Emitido',
  cancelado: 'Cancelado',
  encerrado: 'Encerrado',
  refazer_troca_veiculo: 'Refazer: veículo trocado',
}

const inputClass = 'border rounded-lg px-3 py-2 text-sm outline-none w-full bg-white'
const inputStyle = { borderColor: 'var(--rbr-border)' }
const labelClass = 'text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] mb-1.5 block'

// timestamptz -> valor de <input type="datetime-local"> no horário local
const paraInput = (v: string | null) => (v ? new Date(new Date(v).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '')
const doInput = (v: string) => (v ? new Date(v).toISOString() : null)

export function useCiot(operacaoId: string, versao: string) {
  const [ciot, setCiot] = useState<CiotRow | null | undefined>(undefined)
  const [esperada, setEsperada] = useState<OrigemCiot | null>(null)
  const recarregar = useCallback(async () => {
    const [c, e] = await Promise.all([
      supabase
        .from('operacao_ciot_vpo')
        .select('ciot, ciot_origem, ciot_status, ciot_inicio_previsto, ciot_fim_previsto, ciot_prazo_pagamento')
        .eq('operacao_id', operacaoId)
        .maybeSingle(),
      supabase.rpc('ciot_origem_esperada', { p_operacao: operacaoId }),
    ])
    setCiot((c.data as CiotRow | null) ?? null)
    setEsperada((e.data as OrigemCiot | null) ?? null)
  }, [operacaoId])
  useEffect(() => {
    void recarregar()
  }, [recarregar, versao])
  return { ciot, esperada, recarregar }
}

export default function CiotOperacao({
  d,
  salvando,
  executar,
  extra,
}: {
  d: DetalheOperacao
  salvando: boolean
  executar: Executar
  extra?: (c: { ciot: CiotRow | null; recarregar: () => Promise<void> }) => React.ReactNode
}) {
  const versao = `${d.operacao.updated_at}|${d.operacao.veiculo_id ?? ''}`
  const { ciot, esperada, recarregar } = useCiot(d.operacao.id, versao)
  const [numero, setNumero] = useState('')
  const [origem, setOrigem] = useState<OrigemCiot | ''>('')
  const [inicio, setInicio] = useState('')
  const [fim, setFim] = useState('')
  const [piso, setPiso] = useState('')
  const [alertas, setAlertas] = useState<AlertaCiot[]>([])
  const pisoAtual = d.operacao.piso_minimo_valor ?? null

  useEffect(() => {
    setPiso(pisoAtual != null ? String(pisoAtual).replace('.', ',') : '')
  }, [pisoAtual])

  useEffect(() => {
    void supabase
      .from('v_alertas_ciot')
      .select('codigo, gravidade, limite, mensagem')
      .eq('operacao_id', d.operacao.id)
      .then(({ data }) => setAlertas((data ?? []) as AlertaCiot[]))
  }, [d.operacao.id, ciot])

  useEffect(() => {
    setNumero(ciot?.ciot ?? '')
    setOrigem(ciot?.ciot_origem ?? esperada ?? '')
    setInicio(paraInput(ciot?.ciot_inicio_previsto ?? null))
    setFim(paraInput(ciot?.ciot_fim_previsto ?? null))
  }, [ciot, esperada])

  if (ciot === undefined) return null

  async function salvar() {
    await executar(async () => {
      const pisoNum = piso.trim() ? Number(piso.replace(/\./g, '').replace(',', '.')) : null
      if (pisoNum != null && (!Number.isFinite(pisoNum) || pisoNum < 0)) throw new Error('Piso mínimo inválido.')
      if (pisoNum !== pisoAtual) {
        const { error: ep } = await supabase.from('operacoes').update({ piso_minimo_valor: pisoNum }).eq('id', d.operacao.id)
        if (ep) throw ep
      }
      const n = numero.replace(/\D/g, '')
      if (n && n.length !== 12) throw new Error('O CIOT tem 12 dígitos.')
      if (origem === 'parceiro' && !n) throw new Error('Digite o número do CIOT gerado pelo parceiro.')
      const { error } = await supabase.from('operacao_ciot_vpo').upsert(
        {
          operacao_id: d.operacao.id,
          ciot: n || null,
          ciot_origem: origem || null,
          ciot_inicio_previsto: doInput(inicio),
          ciot_fim_previsto: doInput(fim),
        },
        { onConflict: 'operacao_id' },
      )
      if (error) throw error
      await recarregar()
    }, 'CIOT salvo.')
  }

  const origemTravada = esperada != null
  return (
    <div className="rounded-xl border p-3.5 flex flex-col gap-3" style={{ borderColor: 'var(--rbr-border)' }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-sm font-bold text-[color:var(--rbr-navy-dark)]">CIOT</div>
        {ciot && (
          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full" style={{ background: 'var(--rbr-muted-bg)', color: 'var(--rbr-navy)' }}>
            {STATUS_CIOT_LABEL[ciot.ciot_status] ?? ciot.ciot_status}
          </span>
        )}
      </div>
      {esperada == null && (
        <div className="text-xs rounded-lg px-3 py-2" style={{ background: 'var(--rbr-warning-bg)', color: 'var(--rbr-navy-dark)' }}>
          Tipo do parceiro não definido.{' '}
          <Link to="/cadastros" className="underline font-semibold">
            Definir tipo do parceiro
          </Link>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <div>
          <label className={labelClass}>Quem gera</label>
          <select value={origem} disabled={origemTravada} onChange={(e) => setOrigem(e.target.value as OrigemCiot)} className={inputClass} style={inputStyle}>
            <option value="">Escolha…</option>
            <option value="rbr_repom">{ORIGEM_LABEL.rbr_repom}</option>
            <option value="parceiro">{ORIGEM_LABEL.parceiro}</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>{origem === 'parceiro' ? 'CIOT do parceiro (12 dígitos)' : 'Número do CIOT'}</label>
          <input inputMode="numeric" value={numero} onChange={(e) => setNumero(e.target.value)} className={inputClass} style={inputStyle} />
        </div>
        <div>
          <label className={labelClass}>Início previsto</label>
          <input type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} className={inputClass} style={inputStyle} />
        </div>
        <div>
          <label className={labelClass}>Fim previsto</label>
          <input type="datetime-local" value={fim} onChange={(e) => setFim(e.target.value)} className={inputClass} style={inputStyle} />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <div>
          <label className={labelClass}>Piso mínimo do frete (R$)</label>
          <input inputMode="decimal" value={piso} onChange={(e) => setPiso(e.target.value)} placeholder="digitar à mão" className={inputClass} style={inputStyle} />
        </div>
        <div className="md:col-span-3 text-[11px] text-[color:var(--rbr-muted)] self-end pb-2">
          Carga lotação: frete pago ao parceiro abaixo do piso gera aviso antes da proposta e bloqueia o CIOT da RBR.
        </div>
      </div>
      <PrazosCiot ciot={ciot} />
      {alertas.map((a) => (
        <div
          key={a.codigo}
          className="text-xs rounded-lg px-3 py-2"
          style={a.gravidade === 'bloqueia' ? { background: '#FBE9E9', color: 'var(--rbr-danger)' } : { background: '#FDF1DC', color: '#8A5A00' }}
        >
          {a.mensagem}
        </div>
      ))}
      {ciot?.ciot && ciot.ciot_status === 'emitido' && (
        <div className="text-[11px] text-[color:var(--rbr-muted)]">Trocar o veículo depois do CIOT emitido exige uma nova operação de CIOT.</div>
      )}
      {origem === 'parceiro' && (
        <div className="text-[11px] text-[color:var(--rbr-muted)]">ETC com mais de 3 veículos gera o próprio CIOT: a RBR não gera, só registra o número.</div>
      )}
      {!numero.replace(/\D/g, '') && <div className="text-[11px] font-semibold" style={{ color: 'var(--rbr-danger)' }}>Sem CIOT, sem MDF-e.</div>}
      {extra?.({ ciot, recarregar })}
      <button
        type="button"
        disabled={salvando}
        onClick={salvar}
        className="self-start text-xs font-bold px-3.5 py-2 rounded-lg disabled:opacity-60"
        style={{ background: 'var(--rbr-navy)', color: '#fff' }}
      >
        Salvar CIOT
      </button>
    </div>
  )
}

// Linha do tempo dos prazos do CIOT (Portaria SUROC 6/2026 / Lei 15.485/2026).
function PrazosCiot({ ciot }: { ciot: CiotRow | null }) {
  if (!ciot || (!ciot.ciot_inicio_previsto && !ciot.ciot_fim_previsto)) return null
  const fmt = (v: Date) => v.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const itens: [string, string][] = []
  if (ciot.ciot_inicio_previsto) itens.push(['Cancelar o CIOT só até', fmt(new Date(new Date(ciot.ciot_inicio_previsto).getTime() - 24 * 3600 * 1000))])
  if (ciot.ciot_fim_previsto) itens.push(['Encerrar o CIOT até', fmt(new Date(new Date(ciot.ciot_fim_previsto).getTime() + 5 * 24 * 3600 * 1000))])
  if (ciot.ciot_prazo_pagamento) itens.push(['Pagar o frete ao parceiro até', new Date(ciot.ciot_prazo_pagamento + 'T12:00:00').toLocaleDateString('pt-BR') + ' (30 dias úteis)'])
  return (
    <ol className="flex flex-col gap-1 border-l-2 pl-3" style={{ borderColor: 'var(--rbr-navy)' }}>
      {itens.map(([k, v]) => (
        <li key={k} className="text-xs">
          <span className="text-[color:var(--rbr-muted)]">{k}</span> <b className="tabular-nums">{v}</b>
        </li>
      ))}
    </ol>
  )
}
