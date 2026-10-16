import { useEffect, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { formatDateTime } from '@rbr/shared/format'
import SeloProcessando from '../SeloProcessando'
import { estadoSompo, precisaAvisoSompo, type AverbacaoRcv, type DocMin, type EstadoSompo } from '../../lib/averbacaoSompo'
import { useMensagemTemporaria } from '@rbr/shared/useMensagemTemporaria'

// Averbação do MDF-e na apólice RC-V (Sompo). A apólice exige averbar TODA viagem antes da saída do veículo, com base
// no MDF-e. É automática: quando o MDF-e vira 'emitido' em produção, o gatilho trg_averbar_automatico_ao_emitir chama a
// função enviar-averbacao-rcv, que grava o resultado em operacao_ciot_vpo (averbacao_rcv_*). Aqui só se mostra o
// resultado e se oferece reenvio. Ordem: CT-e -> averbação Allianz (RCTR-C) -> MDF-e -> averbação Sompo (RC-V) -> saída.

const ESPERA_REENVIO_MS = 2 * 60 * 1000

export function LinhaAverbacaoSompo({
  operacaoId,
  mdfe,
  rcv,
  onMudou,
  rotulo = 'Averb. RC-V',
}: {
  operacaoId: string
  mdfe: DocMin
  rcv: AverbacaoRcv | null | undefined
  onMudou: () => void
  rotulo?: string
}) {
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useMensagemTemporaria<string>()
  const [verResposta, setVerResposta] = useState(false)
  const [agora, setAgora] = useState(() => Date.now())
  const estado = estadoSompo(mdfe, rcv)

  // Enquanto processa, o relógio anda para liberar o reenvio depois de 2 minutos sem resultado.
  useEffect(() => {
    if (estado !== 'processando') return
    const t = setInterval(() => setAgora(Date.now()), 15000)
    return () => clearInterval(t)
  }, [estado])

  const desdeMdfe = mdfe?.emitido_em ?? mdfe?.atualizado_em ?? null
  const travadoHaMais2Min = estado === 'processando' && !!desdeMdfe && agora - new Date(desdeMdfe).getTime() > ESPERA_REENVIO_MS
  const podeReenviar = estado === 'erro' || estado === 'bloqueado' || travadoHaMais2Min

  async function reenviar() {
    setEnviando(true)
    setErro(null)
    setOk(null)
    try {
      const { data, error } = await supabase.functions.invoke<{ sucesso: boolean; erro?: string; numero_averbacao?: string | null }>(
        'enviar-averbacao-rcv',
        { body: { operacao_id: operacaoId } },
      )
      if (error) {
        // A função grava erro/bloqueio em operacao_ciot_vpo; a linha mostra o motivo depois da releitura.
        let msg = error.message
        try {
          const corpo = await (error as { context?: Response }).context?.json()
          if (corpo?.erro) msg = corpo.erro
        } catch {
          /* corpo não é JSON */
        }
        setErro(msg)
      } else if (data && data.sucesso === false) {
        setErro(data.erro ?? 'A Averba não confirmou a averbação.')
      } else {
        setOk(data?.numero_averbacao ? `Averbado na Sompo: ${data.numero_averbacao}.` : 'Averbação enviada. Confira a resposta.')
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro inesperado ao reenviar.')
    } finally {
      setEnviando(false)
      onMudou()
    }
  }

  const corSelo = estado === 'averbado' ? '#137A45' : estado === 'erro' ? 'var(--rbr-danger)' : estado === 'bloqueado' ? 'var(--rbr-gold)' : 'var(--rbr-navy)'
  const texto: Record<Exclude<EstadoSompo, 'processando'>, string> = {
    pendente: 'Pendente',
    homologacao: 'Não se aplica',
    averbado: 'Averbado',
    erro: 'Erro',
    bloqueado: 'Bloqueado',
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        {rotulo && <span className="text-xs font-bold flex-shrink-0" style={{ minWidth: '3.5rem' }}>{rotulo}</span>}
        {estado === 'processando' ? (
          <SeloProcessando texto="Processando na Averba…" />
        ) : (
          <span className="text-[11px] font-bold uppercase tracking-wide text-white px-2.5 py-1 rounded-full" style={{ background: corSelo }}>
            {texto[estado]}
          </span>
        )}
        {estado === 'averbado' && rcv?.averbacao_rcv_numero && (
          <span className="text-[11px] text-[color:var(--rbr-muted)] tabular-nums">Nº {rcv.averbacao_rcv_numero}</span>
        )}
        <span className="text-[11px] text-[color:var(--rbr-muted)]">seguro RC-V (Sompo) · MDF-e</span>
        {rcv?.averbacao_rcv_em && (
          <span className="text-[11px] text-[color:var(--rbr-muted)]">atualizado em {formatDateTime(rcv.averbacao_rcv_em)}</span>
        )}
        {podeReenviar && (
          <button
            type="button"
            onClick={() => void reenviar()}
            disabled={enviando}
            className="text-[11px] font-bold px-3 py-1.5 rounded-lg disabled:opacity-60"
            style={{ background: 'var(--rbr-navy)', color: '#fff' }}
          >
            {enviando ? 'Enviando…' : 'Reenviar averbação Sompo'}
          </button>
        )}
        {rcv?.averbacao_rcv_resposta != null && (
          <button type="button" onClick={() => setVerResposta((v) => !v)} className="text-[11px] font-bold underline" style={{ color: 'var(--rbr-navy)' }}>
            {verResposta ? 'Ocultar resposta' : 'Ver resposta da Averba'}
          </button>
        )}
      </div>
      {estado === 'pendente' && (
        <div className="text-[11px] text-[color:var(--rbr-muted)]">A averbação na Sompo sai sozinha quando o MDF-e for autorizado.</div>
      )}
      {estado === 'homologacao' && (
        <div className="text-[11px] text-[color:var(--rbr-muted)]">MDF-e de homologação não é averbado (sem validade fiscal).</div>
      )}
      {(estado === 'erro' || estado === 'bloqueado') && rcv?.averbacao_rcv_erro && (
        <div
          className="text-[11px] rounded-lg px-3 py-2"
          style={{
            background: estado === 'erro' ? '#FBE9E9' : 'var(--rbr-warning-bg)',
            color: estado === 'erro' ? 'var(--rbr-danger)' : 'var(--rbr-navy-dark)',
          }}
        >
          {rcv.averbacao_rcv_erro}
        </div>
      )}
      {erro && (
        <div className="text-[11px] rounded-lg px-3 py-2" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
          {erro}
        </div>
      )}
      {ok && <div className="text-[11px]" style={{ color: 'var(--rbr-positive)' }}>{ok}</div>}
      {verResposta && rcv?.averbacao_rcv_resposta != null && (
        <pre className="text-[10px] rounded-lg p-2.5 overflow-x-auto" style={{ background: 'var(--rbr-muted-bg)' }}>
          {JSON.stringify(rcv.averbacao_rcv_resposta, null, 2)}
        </pre>
      )}
    </div>
  )
}

// Aviso amarelo de orientação: não bloqueia nada.
export function AvisoSompo({ mdfe, rcv }: { mdfe: DocMin; rcv: AverbacaoRcv | null | undefined }) {
  if (!precisaAvisoSompo(mdfe, rcv)) return null
  return (
    <div className="text-xs rounded-lg px-3 py-2" style={{ background: '#FDF8EC', color: '#5C3B00', border: '1px solid #F0D6A0' }}>
      Averbe na Sompo (RC-V) antes de o caminhão sair. Sem averbação a Sompo pode negar indenização.
    </div>
  )
}

// A ordem do fluxo, com o que já foi feito marcado.
export function OrdemDocumentos({
  cte,
  atm,
  mdfe,
  rcv,
}: {
  cte: DocMin
  atm: DocMin
  mdfe: DocMin
  rcv: AverbacaoRcv | null | undefined
}) {
  const passos: Array<{ rotulo: string; feito: boolean }> = [
    { rotulo: 'CT-e', feito: cte?.status === 'emitido' },
    { rotulo: 'Averbação Allianz', feito: atm?.status === 'emitido' },
    { rotulo: 'MDF-e', feito: mdfe?.status === 'emitido' },
    { rotulo: 'Averbação Sompo', feito: rcv?.averbacao_rcv_status === 'emitido' },
  ]
  return (
    <ol className="flex items-center gap-1.5 flex-wrap text-[11px] list-none m-0 p-0" aria-label="Ordem dos documentos antes da saída">
      {passos.map((p, i) => (
        <li key={p.rotulo} className="flex items-center gap-1.5">
          <span
            className="font-bold px-2 py-0.5 rounded-full"
            style={p.feito ? { background: '#E7F5EC', color: '#137A45' } : { background: 'var(--rbr-muted-bg)', color: 'var(--rbr-navy-dark)' }}
          >
            {i + 1}. {p.rotulo}
            {p.feito ? ' ✓' : ''}
          </span>
          <span aria-hidden="true" className="text-[color:var(--rbr-muted)]">→</span>
        </li>
      ))}
      <li className="font-semibold text-[color:var(--rbr-muted)]">saída do caminhão</li>
    </ol>
  )
}
