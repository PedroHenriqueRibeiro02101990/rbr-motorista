import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import type { Database } from '@rbr/shared/database.types'
import { formatMoney, formatDateTime } from '@rbr/shared/format'
import { IconAlertTriangle } from '../icons-local'

type Operacao = Database['public']['Tables']['operacoes']['Row']

type OperacaoEnriquecida = Operacao & {
  clienteNome?: string | null
  valorTotal?: number | null
  cidadeOrigem?: string | null
  ufOrigem?: string | null
  cidadeDestino?: string | null
  ufDestino?: string | null
}

const cardStyle = {
  borderColor: 'var(--rbr-border)',
  boxShadow: '0 1px 2px rgba(18,23,61,0.03), 0 6px 18px rgba(18,23,61,0.05)',
}

type EixoKey =
  | 'carga_complexa_eixo1_perigosa'
  | 'carga_complexa_eixo2_superdimensionada'
  | 'carga_complexa_eixo3_seguro_excedido'
  | 'carga_complexa_eixo4_pontuacao_insuficiente'

const EIXOS: { key: EixoKey; label: string }[] = [
  { key: 'carga_complexa_eixo1_perigosa', label: 'Perigosa' },
  { key: 'carga_complexa_eixo2_superdimensionada', label: 'Superdimensionada' },
  { key: 'carga_complexa_eixo3_seguro_excedido', label: 'Seguro excedido' },
  { key: 'carga_complexa_eixo4_pontuacao_insuficiente', label: 'Pontuação insuficiente' },
]

type FlagAlvo = EixoKey | 'bloqueio_fiscal'

export default function Risco() {
  const [operacoes, setOperacoes] = useState<OperacaoEnriquecida[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [mostrarTodas, setMostrarTodas] = useState(false)
  const [confirmando, setConfirmando] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setErrorMsg(null)
    const { data, error } = await supabase
      .from('operacoes')
      .select('*, clientes(razao_social, nome_fantasia), cotacoes(valor_total, cidade_origem, uf_origem, cidade_destino, uf_destino)')
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) setErrorMsg(error.message)

    const mapeadas: OperacaoEnriquecida[] = (data ?? []).map((op) => ({
      ...op,
      clienteNome: (op as any).clientes?.nome_fantasia ?? (op as any).clientes?.razao_social,
      valorTotal: (op as any).cotacoes?.valor_total ?? null,
      cidadeOrigem: (op as any).cotacoes?.cidade_origem ?? null,
      ufOrigem: (op as any).cotacoes?.uf_origem ?? null,
      cidadeDestino: (op as any).cotacoes?.cidade_destino ?? null,
      ufDestino: (op as any).cotacoes?.uf_destino ?? null,
    }))
    setOperacoes(mapeadas)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function liberarFlag(op: OperacaoEnriquecida, campo: FlagAlvo) {
    setSaving(true)
    setErrorMsg(null)
    setConfirmando(null)

    const patch: Database['public']['Tables']['operacoes']['Update'] = { [campo]: false }

    if (campo !== 'bloqueio_fiscal') {
      const outrosEixosAtivos = EIXOS.some((e) => e.key !== campo && op[e.key])
      if (!outrosEixosAtivos) patch.carga_complexa = false
    }

    const { error } = await supabase.from('operacoes').update(patch).eq('id', op.id)
    setSaving(false)
    if (error) {
      setErrorMsg(error.message)
      return
    }
    await load()
  }

  const lista = (operacoes ?? []).filter((op) => mostrarTodas || op.carga_complexa || op.bloqueio_fiscal)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="rbr-display font-bold text-2xl md:text-3xl text-[color:var(--rbr-navy-dark)]">Gestão de Risco</h1>
        <label className="flex items-center gap-2 text-xs font-semibold text-[color:var(--rbr-navy-dark)] cursor-pointer">
          <input
            type="checkbox"
            checked={mostrarTodas}
            onChange={(e) => setMostrarTodas(e.target.checked)}
            className="w-4 h-4"
          />
          Mostrar todas as operações
        </label>
      </div>

      <div className="text-xs text-[color:var(--rbr-muted)] flex flex-col gap-0.5">
        <div>Pontuação de motorista por histórico ainda não está implementada — o eixo 4 reflete um sinal binário simples.</div>
        <div>Liberações manuais não geram histórico ainda — ação é imediata e não registrada.</div>
      </div>

      {errorMsg && (
        <div className="text-xs rounded-xl px-3 py-2.5" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
          {errorMsg}
        </div>
      )}

      {loading && <div className="text-sm text-[color:var(--rbr-muted)] py-6 text-center">Carregando…</div>}

      {!loading && lista.length === 0 && (
        <div className="text-sm text-[color:var(--rbr-muted)] bg-white border rounded-[20px] p-[18px]" style={cardStyle}>
          {mostrarTodas ? 'Nenhuma operação encontrada.' : 'Nenhuma operação com risco sinalizado no momento.'}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {!loading &&
          lista.map((op) => (
            <div key={op.id} className="bg-white border rounded-[20px] p-[18px] flex flex-col gap-3" style={cardStyle}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="text-[15px] font-bold">{op.clienteNome ?? 'Cliente a confirmar'}</div>
                {op.valorTotal != null && <div className="text-sm font-bold">{formatMoney(op.valorTotal)}</div>}
              </div>
              <div className="text-xs text-[color:var(--rbr-muted)]">
                {op.cidadeOrigem ?? '?'}/{op.ufOrigem ?? '?'} → {op.cidadeDestino ?? '?'}/{op.ufDestino ?? '?'} · atualizado em{' '}
                {formatDateTime(op.updated_at)}
              </div>

              <div className="flex gap-2 flex-wrap">
                {EIXOS.map((eixo) => {
                  const ativo = Boolean(op[eixo.key])
                  const chave = `${op.id}:${eixo.key}`
                  const emConfirmacao = confirmando === chave

                  if (!ativo) {
                    return (
                      <span
                        key={eixo.key}
                        className="text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full"
                        style={{ background: 'var(--rbr-muted-bg)', color: 'var(--rbr-muted)' }}
                      >
                        {eixo.label}
                      </span>
                    )
                  }

                  if (emConfirmacao) {
                    return (
                      <span key={eixo.key} className="flex items-center gap-1.5">
                        <span className="text-[11px] font-bold" style={{ color: 'var(--rbr-danger)' }}>
                          Confirmar liberação?
                        </span>
                        <button
                          onClick={() => liberarFlag(op, eixo.key)}
                          disabled={saving}
                          className="text-[11px] font-bold px-2 py-1 rounded-full text-white disabled:opacity-60"
                          style={{ background: 'var(--rbr-positive)' }}
                          aria-label="Confirmar liberação"
                        >
                          ✓
                        </button>
                        <button
                          onClick={() => setConfirmando(null)}
                          disabled={saving}
                          className="text-[11px] font-bold px-2 py-1 rounded-full"
                          style={{ background: 'var(--rbr-muted-bg)', color: 'var(--rbr-muted)' }}
                          aria-label="Cancelar"
                        >
                          ✕
                        </button>
                      </span>
                    )
                  }

                  return (
                    <button
                      key={eixo.key}
                      onClick={() => setConfirmando(chave)}
                      className="text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full"
                      style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}
                      title="Clique para liberar manualmente"
                    >
                      {eixo.label}
                    </button>
                  )
                })}
              </div>

              {op.bloqueio_fiscal &&
                (() => {
                  const chave = `${op.id}:bloqueio_fiscal`
                  const emConfirmacao = confirmando === chave
                  return (
                    <div className="rounded-xl px-3.5 py-3 flex flex-col gap-2" style={{ background: '#FBE9E9' }}>
                      <div className="flex items-center gap-1.5 text-xs font-bold" style={{ color: 'var(--rbr-danger)' }}>
                        <IconAlertTriangle width={13} height={13} />
                        Bloqueio fiscal: {op.bloqueio_fiscal_motivo ?? 'Sem motivo registrado.'}
                      </div>
                      {emConfirmacao ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-bold" style={{ color: 'var(--rbr-danger)' }}>
                            Confirmar liberação?
                          </span>
                          <button
                            onClick={() => liberarFlag(op, 'bloqueio_fiscal')}
                            disabled={saving}
                            className="text-[11px] font-bold px-2 py-1 rounded-full text-white disabled:opacity-60"
                            style={{ background: 'var(--rbr-positive)' }}
                            aria-label="Confirmar liberação"
                          >
                            ✓
                          </button>
                          <button
                            onClick={() => setConfirmando(null)}
                            disabled={saving}
                            className="text-[11px] font-bold px-2 py-1 rounded-full"
                            style={{ background: '#fff', color: 'var(--rbr-muted)' }}
                            aria-label="Cancelar"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmando(chave)}
                          className="self-start text-[11px] font-bold px-3 py-1.5 rounded-lg"
                          style={{ background: 'var(--rbr-navy)', color: '#fff' }}
                        >
                          Liberar bloqueio fiscal
                        </button>
                      )}
                    </div>
                  )
                })()}
            </div>
          ))}
      </div>
    </div>
  )
}
