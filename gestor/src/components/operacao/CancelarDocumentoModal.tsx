import { useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { extrairErro } from './EventoFiscalModal'

// Cancelamento de CT-e, MDF-e e NF-e de teste pela Edge Function `cancelar-documento-fiscal`.
// A função valida a ordem (MDF-e → CT-e → NF-e), usa o ambiente gravado no documento e devolve
// a mensagem da SEFAZ no `erro` quando o cancelamento é recusado (ex.: fora do prazo).

export type TipoCancelamento = 'mdfe' | 'cte' | 'nfe'

export type RespostaCancelamento = {
  sucesso: boolean
  status?: string
  tipo?: TipoCancelamento
  ambiente?: string
  chave?: string | null
  mensagem_sefaz?: string
  xml_cancelamento?: string | null
  erro?: string
}

const TITULOS: Record<TipoCancelamento, string> = {
  mdfe: 'MDF-e',
  cte: 'CT-e',
  nfe: 'NF-e de teste',
}

const PRAZOS: Record<TipoCancelamento, string> = {
  mdfe: 'MDF-e: até 24 h após a autorização e antes de a viagem começar (depois disso o caminho é encerrar).',
  cte: 'CT-e: até 7 dias após a autorização.',
  nfe: 'NF-e: até 24 h após a autorização.',
}

const ORDEM: TipoCancelamento[] = ['mdfe', 'cte', 'nfe']

// O caminho do XML vem relativo ao host da Focus (ex.: /arquivos_development/...-can.xml).
export function urlXmlCancelamento(caminho: string, ambiente: string | null | undefined): string {
  if (/^https?:\/\//i.test(caminho)) return caminho
  const host = ambiente === 'producao' ? 'https://api.focusnfe.com.br' : 'https://homologacao.focusnfe.com.br'
  return `${host}${caminho.startsWith('/') ? '' : '/'}${caminho}`
}

export default function CancelarDocumentoModal({
  operacaoId,
  tipo,
  ambiente,
  chave,
  onFechar,
  onCancelado,
}: {
  operacaoId: string
  tipo: TipoCancelamento
  ambiente: string | null
  chave: string | null
  onFechar: () => void
  onCancelado: (resposta: RespostaCancelamento) => void
}) {
  const [justificativa, setJustificativa] = useState('')
  const [entendo, setEntendo] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const tamanho = justificativa.trim().length
  const justificativaValida = tamanho >= 15 && tamanho <= 255
  const producao = ambiente === 'producao'

  async function cancelar() {
    setEnviando(true)
    setErro(null)
    try {
      const { data, error } = await supabase.functions.invoke<RespostaCancelamento>('cancelar-documento-fiscal', {
        body: { operacao_id: operacaoId, tipo, justificativa: justificativa.trim(), confirmar: true },
      })
      if (error || !data || data.sucesso === false) {
        setErro(error ? await extrairErro(error) : (data?.erro ?? 'Não foi possível cancelar o documento.'))
        return
      }
      onCancelado(data)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro inesperado ao cancelar o documento.')
    } finally {
      setEnviando(false)
    }
  }

  const campoCls = 'text-xs rounded-lg border px-2.5 py-1.5 w-full bg-white'
  const rotulo = 'flex flex-col gap-1 text-[11px] text-[color:var(--rbr-muted)]'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3" style={{ background: 'rgba(18,23,61,0.55)' }}>
      <div className="bg-white rounded-xl w-full max-w-md max-h-[92vh] flex flex-col" style={{ boxShadow: '0 20px 60px rgba(18,23,61,0.35)' }}>
        <div className="px-5 pt-4 pb-3 border-b" style={{ borderColor: 'var(--rbr-border)' }}>
          <div className="text-sm font-extrabold text-[color:var(--rbr-navy-dark)]">Cancelar {TITULOS[tipo]}</div>
          <div className="text-xs font-bold mt-1" style={{ color: 'var(--rbr-danger)' }}>
            Cancelamento é definitivo e não pode ser desfeito.
          </div>
        </div>

        <div className="px-5 py-3 overflow-y-auto flex flex-col gap-2.5">
          <div className="flex items-center gap-2 flex-wrap text-[11px] text-[color:var(--rbr-muted)]">
            Ambiente:
            {producao ? (
              <span
                className="text-[11px] font-extrabold uppercase tracking-wide text-white px-2.5 py-1 rounded-full"
                style={{ background: 'var(--rbr-danger)' }}
              >
                Produção — documento com validade fiscal
              </span>
            ) : (
              <span
                className="text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                style={{ background: 'var(--rbr-warning-bg)', color: 'var(--rbr-navy-dark)' }}
              >
                Homologação
              </span>
            )}
          </div>

          <div className={rotulo}>
            Chave do documento
            <span className="text-xs font-mono break-all text-[color:var(--rbr-navy-dark)]">{chave ?? '—'}</span>
          </div>

          <div className="text-[11px] text-[color:var(--rbr-muted)] flex flex-col gap-1">
            <span>
              Ordem de cancelamento:{' '}
              {ORDEM.map((t, i) => (
                <span key={t}>
                  {i > 0 && ' → '}
                  <span className={t === tipo ? 'font-bold text-[color:var(--rbr-navy-dark)]' : undefined}>{TITULOS[t]}</span>
                </span>
              ))}
              .
            </span>
            <span>Prazo — {PRAZOS[tipo]} Quem decide é a SEFAZ; se recusar, a mensagem dela aparece abaixo.</span>
          </div>

          <label className={rotulo}>
            Justificativa (mín. 15 caracteres) — {tamanho}/255
            <textarea
              className={campoCls}
              style={{ borderColor: 'var(--rbr-border)' }}
              rows={3}
              maxLength={255}
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
            />
          </label>

          <label className="flex items-center gap-2 text-[11px] text-[color:var(--rbr-navy-dark)] font-bold">
            <input type="checkbox" checked={entendo} onChange={(e) => setEntendo(e.target.checked)} />
            Entendo que é definitivo
          </label>

          {erro && (
            <div className="text-xs rounded-lg px-3 py-2.5" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
              {erro}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t flex items-center justify-end gap-2" style={{ borderColor: 'var(--rbr-border)' }}>
          <button
            onClick={onFechar}
            disabled={enviando}
            className="text-xs font-bold px-3.5 py-2 rounded-lg border disabled:opacity-60"
            style={{ borderColor: 'var(--rbr-navy)', color: 'var(--rbr-navy)' }}
          >
            Voltar
          </button>
          <button
            onClick={cancelar}
            disabled={!justificativaValida || !entendo || enviando}
            className="text-xs font-bold px-3.5 py-2 rounded-lg disabled:opacity-50"
            style={{ background: 'var(--rbr-danger)', color: '#fff' }}
          >
            {enviando ? 'Cancelando…' : 'Cancelar documento'}
          </button>
        </div>
      </div>
    </div>
  )
}
