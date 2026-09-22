import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import type { Database } from '@rbr/shared/database.types'
import { formatDateTime } from '@rbr/shared/format'
import { IconStar } from '@rbr/shared/icons'
import { IconX } from '../icons-local'

type Pessoa = Database['public']['Tables']['pessoas']['Row']
type PontuacaoEvento = Database['public']['Tables']['pontuacao_eventos']['Row']
type PontuacaoContestacao = Database['public']['Tables']['pontuacao_contestacoes']['Row']
type StatusContestacao = Database['public']['Enums']['status_contestacao']

const STATUS_CONTESTACAO_LABEL: Record<StatusContestacao, string> = {
  pendente: 'Pendente',
  em_analise: 'Em análise',
  aceita: 'Aceita',
  negada: 'Negada',
  reduzida: 'Reduzida',
}

function badgeContestacao(status: StatusContestacao): string {
  if (status === 'aceita' || status === 'reduzida') return 'var(--rbr-positive)'
  if (status === 'negada') return 'var(--rbr-danger)'
  return 'var(--rbr-navy)'
}

const cardStyle = {
  borderColor: 'var(--rbr-border)',
  boxShadow: '0 1px 2px rgba(18,23,61,0.03), 0 6px 18px rgba(18,23,61,0.05)',
}

export default function Pontos({ pessoa }: { pessoa: Pessoa }) {
  const [loading, setLoading] = useState(true)
  const [saldo, setSaldo] = useState<number | null>(null)
  const [totalEventos, setTotalEventos] = useState<number | null>(null)
  const [eventos, setEventos] = useState<PontuacaoEvento[]>([])
  const [contestacoes, setContestacoes] = useState<PontuacaoContestacao[]>([])
  const [contestandoId, setContestandoId] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: saldoData }, { data: eventosData }, { data: contestacoesData }] = await Promise.all([
      supabase.from('pontuacao_saldo').select('saldo, total_eventos, sem_historico').eq('pessoa_id', pessoa.id).maybeSingle(),
      supabase.from('pontuacao_eventos').select('*').eq('pessoa_id', pessoa.id).order('aplicado_em', { ascending: false }),
      supabase.from('pontuacao_contestacoes').select('*').eq('pessoa_id', pessoa.id).order('created_at', { ascending: false }),
    ])
    setSaldo(saldoData?.saldo ?? 0)
    setTotalEventos(saldoData?.total_eventos ?? 0)
    setEventos(eventosData ?? [])
    setContestacoes(contestacoesData ?? [])
    setLoading(false)
  }, [pessoa.id])

  useEffect(() => {
    load()
  }, [load])

  function contestacaoDoEvento(eventoId: string): PontuacaoContestacao | undefined {
    return contestacoes.find((c) => c.pontuacao_evento_id === eventoId)
  }

  function abrirContestacao(eventoId: string) {
    setErrorMsg(null)
    setTexto('')
    setContestandoId(eventoId)
  }

  async function enviarContestacao() {
    if (!contestandoId || !texto.trim()) return
    setEnviando(true)
    setErrorMsg(null)
    const { error } = await supabase.from('pontuacao_contestacoes').insert({
      pontuacao_evento_id: contestandoId,
      pessoa_id: pessoa.id,
      texto_contestacao: texto.trim(),
    })
    setEnviando(false)
    if (error) {
      setErrorMsg(error.message)
      return
    }
    setContestandoId(null)
    setTexto('')
    await load()
  }

  return (
    <div className="px-5 pt-8 flex flex-col gap-3.5">
      <div className="rbr-display font-bold text-2xl leading-tight text-[color:var(--rbr-navy-dark)]">Pontos</div>

      {loading && <div className="text-sm text-[color:var(--rbr-muted)] py-6 text-center">Carregando…</div>}

      {!loading && (
        <div
          className="bg-white border rounded-[20px] p-[18px] flex items-center gap-3"
          style={cardStyle}
        >
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--rbr-muted-bg)' }}
          >
            <IconStar width={22} height={22} fill="var(--rbr-gold)" stroke="none" />
          </div>
          <div>
            <div className="rbr-display text-2xl font-bold leading-tight">{saldo ?? 0} pontos</div>
            <div className="text-xs text-[color:var(--rbr-muted)]">
              {totalEventos ?? 0} evento{(totalEventos ?? 0) === 1 ? '' : 's'} de pontuação
            </div>
          </div>
        </div>
      )}

      {!loading && (
        <>
          <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] mt-1">
            Histórico
          </div>

          {eventos.length === 0 && (
            <div className="text-sm text-[color:var(--rbr-muted)] bg-white border rounded-[20px] p-[18px]" style={cardStyle}>
              Nenhum evento de pontuação ainda.
            </div>
          )}

          {eventos.map((ev) => {
            const contestacao = contestacaoDoEvento(ev.id)
            const positivo = ev.sinal === 'positivo'
            return (
              <div key={ev.id} className="bg-white border rounded-[20px] p-[18px]" style={cardStyle}>
                <div className="flex items-center justify-between mb-1.5">
                  <span
                    className="text-sm font-bold"
                    style={{ color: positivo ? 'var(--rbr-positive)' : 'var(--rbr-danger)' }}
                  >
                    {positivo ? '+' : '-'}
                    {Math.abs(ev.pontos)} pontos
                  </span>
                  <span className="text-xs text-[color:var(--rbr-muted)]">{formatDateTime(ev.aplicado_em)}</span>
                </div>
                <div className="text-[13px] mb-2.5">{ev.motivo_texto ?? ev.tipo_criterio}</div>

                {contestacao ? (
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[11px] font-bold uppercase tracking-wide text-white px-2.5 py-1 rounded-full"
                      style={{ background: badgeContestacao(contestacao.status) }}
                    >
                      Contestação: {STATUS_CONTESTACAO_LABEL[contestacao.status]}
                    </span>
                  </div>
                ) : (
                  <button
                    onClick={() => abrirContestacao(ev.id)}
                    className="text-xs font-bold border rounded-lg px-3 py-1.5"
                    style={{ borderColor: 'var(--rbr-navy)', color: 'var(--rbr-navy)' }}
                  >
                    Contestar
                  </button>
                )}

                {contestacao?.motivo_decisao && (
                  <div className="text-xs text-[color:var(--rbr-muted)] mt-2">
                    Motivo da decisão: {contestacao.motivo_decisao}
                  </div>
                )}
              </div>
            )
          })}
        </>
      )}

      {contestandoId && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: 'rgba(18,23,61,0.45)' }}
          onClick={() => setContestandoId(null)}
        >
          <div
            className="bg-white w-full max-w-[480px] rounded-t-[24px] p-5 flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="rbr-display font-bold text-lg">Contestar pontuação</div>
              <button onClick={() => setContestandoId(null)}>
                <IconX width={18} height={18} style={{ color: 'var(--rbr-muted)' }} />
              </button>
            </div>
            <textarea
              className="border rounded-xl px-3.5 py-3 text-sm outline-none focus:border-[color:var(--rbr-navy)] min-h-[110px]"
              style={{ borderColor: 'var(--rbr-border)' }}
              placeholder="Explique por que você discorda desta pontuação…"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
            {errorMsg && <div className="text-xs" style={{ color: 'var(--rbr-danger)' }}>{errorMsg}</div>}
            <button
              onClick={enviarContestacao}
              disabled={enviando || !texto.trim()}
              className="w-full py-3 rounded-xl text-sm font-bold disabled:opacity-60"
              style={{ background: 'var(--rbr-gold)', color: 'var(--rbr-navy-dark)' }}
            >
              {enviando ? 'Enviando…' : 'Enviar contestação'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
