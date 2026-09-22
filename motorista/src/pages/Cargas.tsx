import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import type { Database } from '@rbr/shared/database.types'
import { formatDateTime, formatMoney, STATUS_OPERACAO_LABEL } from '@rbr/shared/format'
import { IconCamera, IconCheck, IconChevronRight } from '@rbr/shared/icons'
import { IconAlertTriangle } from '../icons-local'

type Pessoa = Database['public']['Tables']['pessoas']['Row']
type Operacao = Database['public']['Tables']['operacoes']['Row']
type ChecklistFoto = Database['public']['Tables']['operacao_checklist_fotos']['Row']
type EtapaChecklist = Database['public']['Enums']['etapa_checklist']
type StatusOperacao = Database['public']['Enums']['status_operacao']

type OperacaoEnriquecida = Operacao & {
  clienteNome?: string
  valorContrato?: number | null
}

const ETAPAS: { key: EtapaChecklist; label: string }[] = [
  { key: 'carregamento', label: 'Carregamento' },
  { key: 'descarga', label: 'Descarga' },
  { key: 'carga_patio', label: 'Carga em pátio' },
  { key: 'canhoto', label: 'Canhoto' },
  { key: 'nota_fiscal_assinada', label: 'Nota fiscal assinada' },
]

const STATUS_FLOW: StatusOperacao[] = [
  'alocando_motorista',
  'aguardando_liberacao_fiscal',
  'liberada_coleta',
  'carregando',
  'em_transito',
  'entregue',
  'fechada',
]

const TERMINAIS = new Set<StatusOperacao>(['entregue', 'fechada', 'cancelada'])

function proximoStatus(atual: StatusOperacao): StatusOperacao | null {
  const i = STATUS_FLOW.indexOf(atual)
  if (i === -1 || i === STATUS_FLOW.length - 1) return null
  return STATUS_FLOW[i + 1]
}

function badgeBackground(status: StatusOperacao): string {
  if (status === 'cancelada') return 'var(--rbr-danger)'
  if (status === 'entregue' || status === 'fechada') return 'var(--rbr-positive)'
  return 'var(--rbr-navy)'
}

const cardStyle = {
  borderColor: 'var(--rbr-border)',
  boxShadow: '0 1px 2px rgba(18,23,61,0.03), 0 6px 18px rgba(18,23,61,0.05)',
}

export default function Cargas({ pessoa }: { pessoa: Pessoa }) {
  const [operacoes, setOperacoes] = useState<OperacaoEnriquecida[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [fotosPorOperacao, setFotosPorOperacao] = useState<Record<string, ChecklistFoto[]>>({})
  const [fotosLoading, setFotosLoading] = useState(false)
  const [uploadingEtapa, setUploadingEtapa] = useState<string | null>(null)
  const [advancing, setAdvancing] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('operacoes')
      .select('*, clientes(razao_social, nome_fantasia), condicoes_pagamento_operacao(valor_total_contrato)')
      .eq('pessoa_alocada_id', pessoa.id)
      .order('updated_at', { ascending: false })

    const mapeadas: OperacaoEnriquecida[] = (data ?? []).map((op) => ({
      ...op,
      clienteNome: (op as any).clientes?.nome_fantasia ?? (op as any).clientes?.razao_social,
      valorContrato: (op as any).condicoes_pagamento_operacao?.[0]?.valor_total_contrato,
    }))

    mapeadas.sort((a, b) => {
      const aTerm = TERMINAIS.has(a.status) ? 1 : 0
      const bTerm = TERMINAIS.has(b.status) ? 1 : 0
      if (aTerm !== bTerm) return aTerm - bTerm
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    })

    setOperacoes(mapeadas)
    setLoading(false)
  }, [pessoa.id])

  useEffect(() => {
    load()
  }, [load])

  async function carregarFotos(operacaoId: string) {
    setFotosLoading(true)
    const { data } = await supabase
      .from('operacao_checklist_fotos')
      .select('*')
      .eq('operacao_id', operacaoId)
      .order('created_at', { ascending: false })
    setFotosPorOperacao((prev) => ({ ...prev, [operacaoId]: data ?? [] }))
    setFotosLoading(false)
  }

  async function toggleExpand(op: OperacaoEnriquecida) {
    setErrorMsg(null)
    if (expandedId === op.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(op.id)
    if (!fotosPorOperacao[op.id]) {
      await carregarFotos(op.id)
    }
  }

  async function handleUpload(op: OperacaoEnriquecida, etapa: EtapaChecklist, file: File) {
    setErrorMsg(null)
    setUploadingEtapa(etapa)
    const path = `${op.id}/${etapa}/${Date.now()}-${file.name}`

    const { error: uploadError } = await supabase.storage.from('operacao-fotos').upload(path, file)
    if (uploadError) {
      setErrorMsg(uploadError.message)
      setUploadingEtapa(null)
      return
    }

    const { error: insertError } = await supabase
      .from('operacao_checklist_fotos')
      .insert({ operacao_id: op.id, etapa, foto_url: path })
    if (insertError) {
      setErrorMsg(insertError.message)
      setUploadingEtapa(null)
      return
    }

    await carregarFotos(op.id)
    setUploadingEtapa(null)
  }

  async function handleAvancar(op: OperacaoEnriquecida) {
    const proximo = proximoStatus(op.status)
    if (!proximo) return
    setErrorMsg(null)
    setAdvancing(true)
    const { error } = await supabase.from('operacoes').update({ status: proximo }).eq('id', op.id)
    setAdvancing(false)
    if (error) {
      setErrorMsg(error.message)
      return
    }
    await load()
  }

  return (
    <div className="px-5 pt-8 flex flex-col gap-3.5">
      <div className="rbr-display font-bold text-2xl leading-tight text-[color:var(--rbr-navy-dark)]">
        Minhas cargas
      </div>

      {loading && <div className="text-sm text-[color:var(--rbr-muted)] py-6 text-center">Carregando…</div>}

      {!loading && operacoes && operacoes.length === 0 && (
        <div className="text-sm text-[color:var(--rbr-muted)] bg-white border rounded-[20px] p-[18px]" style={cardStyle}>
          Nenhuma carga alocada para você ainda.
        </div>
      )}

      {!loading &&
        operacoes?.map((op) => {
          const isExpanded = expandedId === op.id
          const fotos = fotosPorOperacao[op.id] ?? []
          const proximo = proximoStatus(op.status)
          const isTerminal = TERMINAIS.has(op.status)

          return (
            <div
              key={op.id}
              className="bg-white border rounded-[20px] overflow-hidden"
              style={cardStyle}
            >
              <button className="w-full text-left p-[18px]" onClick={() => toggleExpand(op)}>
                <div className="flex items-center justify-between mb-2.5">
                  <span
                    className="text-[11px] font-bold uppercase tracking-wide text-white px-2.5 py-1 rounded-full"
                    style={{ background: badgeBackground(op.status) }}
                  >
                    {STATUS_OPERACAO_LABEL[op.status]}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {op.valorContrato != null && (
                      <span className="text-sm font-bold">{formatMoney(op.valorContrato)}</span>
                    )}
                    <IconChevronRight
                      width={16}
                      height={16}
                      style={{
                        color: 'var(--rbr-muted)',
                        transform: isExpanded ? 'rotate(90deg)' : 'none',
                        transition: 'transform 0.15s',
                      }}
                    />
                  </div>
                </div>
                <div className="text-[15px] font-bold mb-1">{op.clienteNome ?? 'Cliente a confirmar'}</div>
                <div className="text-xs text-[color:var(--rbr-muted)]">
                  {op.peso_bruto ? `${op.peso_bruto} kg` : 'Peso não informado'} · atualizado em{' '}
                  {formatDateTime(op.updated_at)}
                </div>
              </button>

              {isExpanded && (
                <div className="border-t px-[18px] pb-[18px] pt-3.5" style={{ borderColor: 'var(--rbr-border)' }}>
                  {op.bloqueio_fiscal && (
                    <div
                      className="flex items-start gap-2 rounded-xl px-3 py-2.5 mb-3.5"
                      style={{ background: '#FBE9E9' }}
                    >
                      <IconAlertTriangle width={16} height={16} style={{ color: 'var(--rbr-danger)', flexShrink: 0, marginTop: 1 }} />
                      <div className="text-xs" style={{ color: 'var(--rbr-danger)' }}>
                        <span className="font-bold">Bloqueio fiscal ativo. </span>
                        {op.bloqueio_fiscal_motivo ?? 'Aguarde a liberação do time fiscal.'}
                      </div>
                    </div>
                  )}

                  <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] mb-2.5">
                    Checklist fotográfico
                  </div>

                  {fotosLoading ? (
                    <div className="text-xs text-[color:var(--rbr-muted)] py-2">Carregando fotos…</div>
                  ) : (
                    <div className="flex flex-col gap-2 mb-4">
                      {ETAPAS.map(({ key, label }) => {
                        const foto = fotos.find((f) => f.etapa === key)
                        const inputId = `foto-${op.id}-${key}`
                        const isUploading = uploadingEtapa === key
                        return (
                          <div
                            key={key}
                            className="flex items-center justify-between rounded-xl px-3 py-2.5"
                            style={{ background: 'var(--rbr-muted-bg)' }}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div
                                className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                                style={{
                                  background: foto ? 'var(--rbr-positive)' : '#fff',
                                  color: foto ? '#fff' : 'var(--rbr-muted)',
                                }}
                              >
                                {foto ? (
                                  <IconCheck width={14} height={14} />
                                ) : (
                                  <span className="text-[10px] font-bold">{ETAPAS.findIndex((e) => e.key === key) + 1}</span>
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="text-[13px] font-semibold truncate">{label}</div>
                                {foto && (
                                  <div className="text-[11px] text-[color:var(--rbr-muted)]">
                                    {formatDateTime(foto.created_at)}
                                  </div>
                                )}
                              </div>
                            </div>
                            <label
                              htmlFor={inputId}
                              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                              style={{
                                background: foto ? '#fff' : 'var(--rbr-gold)',
                                color: foto ? 'var(--rbr-navy)' : 'var(--rbr-navy-dark)',
                                opacity: isUploading ? 0.6 : 1,
                              }}
                            >
                              <IconCamera width={16} height={16} />
                              <input
                                id={inputId}
                                type="file"
                                accept="image/*"
                                capture="environment"
                                className="hidden"
                                disabled={isUploading}
                                onChange={(e) => {
                                  const file = e.target.files?.[0]
                                  e.target.value = ''
                                  if (file) handleUpload(op, key, file)
                                }}
                              />
                            </label>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {errorMsg && (
                    <div
                      className="text-xs rounded-xl px-3 py-2.5 mb-3.5"
                      style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}
                    >
                      {errorMsg}
                    </div>
                  )}

                  {!isTerminal && proximo && (
                    <button
                      onClick={() => handleAvancar(op)}
                      disabled={advancing}
                      className="w-full py-3 rounded-xl text-sm font-bold disabled:opacity-60"
                      style={{ background: 'var(--rbr-gold)', color: 'var(--rbr-navy-dark)' }}
                    >
                      {advancing
                        ? 'Atualizando…'
                        : `Avançar para ${STATUS_OPERACAO_LABEL[proximo].toLowerCase()}`}
                    </button>
                  )}

                  {isTerminal && (
                    <div className="text-xs text-[color:var(--rbr-muted)] text-center py-1">
                      Esta carga já foi finalizada.
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
    </div>
  )
}
