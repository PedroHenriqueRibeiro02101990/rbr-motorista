import { useCallback, useEffect, useState } from 'react'
import { jsPDF } from 'jspdf'
import { supabase } from '@rbr/shared/supabaseClient'
import { dbNovo } from '@rbr/shared/dbNovo'
import { baixarBlob, gerarPdfContrato, sha256Hex } from '@rbr/shared/contratoPdf'

// Tarefa 8: contrato do agenciador assinado no gov.br. Sem contrato VALIDADO pela RBR, o agenciador não fecha carga,
// não abre operação e não baixa documentação. A validação da assinatura é feita à mão pelo gestor.

export type StatusContrato = 'sem_contrato' | 'aguardando_assinatura' | 'assinado_enviado' | 'validado' | 'recusado' | 'suspenso'
type Situacao = {
  status: StatusContrato
  motivo: string | null
  versao_publicada: number | null
  ultimo_envio: { versao: number; enviado_em: string; status: string; motivo: string | null } | null
}

export const STATUS_CONTRATO: Record<StatusContrato, { texto: string; bg: string; cor: string }> = {
  sem_contrato: { texto: 'Contrato pendente', bg: '#FBE9E9', cor: 'var(--rbr-danger)' },
  aguardando_assinatura: { texto: 'Aguardando sua assinatura', bg: '#FDF1DC', cor: '#8A5A00' },
  assinado_enviado: { texto: 'Enviado: a RBR está conferindo', bg: '#EEF1F8', cor: 'var(--rbr-navy)' },
  validado: { texto: 'Contrato validado', bg: '#E7F5EC', cor: 'var(--rbr-positive)' },
  recusado: { texto: 'Contrato recusado: envie de novo', bg: '#FBE9E9', cor: 'var(--rbr-danger)' },
  suspenso: { texto: 'Agenciador suspenso', bg: '#FBE9E9', cor: 'var(--rbr-danger)' },
}

export function useContratoAgenciador() {
  const [s, setS] = useState<Situacao | null | undefined>(undefined)
  const carregar = useCallback(async () => {
    const { data, error } = await dbNovo.rpc('meu_contrato_agenciador')
    // Função ainda não aplicada no banco: não mostra nada (e não trava a tela).
    setS(error ? null : ((data as Situacao | null) ?? null))
  }, [])
  useEffect(() => {
    void carregar()
  }, [carregar])
  return { situacao: s, recarregar: carregar }
}

export default function ContratoAgenciador({ pessoaId }: { pessoaId: string }) {
  const { situacao, recarregar } = useContratoAgenciador()
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const [ocupado, setOcupado] = useState(false)

  if (!situacao || situacao.status === 'validado') return null
  const st = STATUS_CONTRATO[situacao.status]

  async function baixar() {
    setOcupado(true)
    setMsg(null)
    try {
      const { data, error } = await dbNovo.rpc('contrato_agenciador_gerar')
      if (error) throw new Error(error.message)
      const c = data as { versao: number; titulo: string; minuta: boolean; texto: string }
      const blob = gerarPdfContrato(jsPDF, { titulo: c.titulo, versao: c.versao, minuta: c.minuta, texto: c.texto })
      baixarBlob(blob, `contrato-agenciador-rbr-v${c.versao}.pdf`)
      setMsg({ ok: true, t: `✓ Contrato (versão ${c.versao}) baixado. Assine no gov.br e envie o PDF assinado aqui.` })
      await recarregar()
    } catch (e) {
      setMsg({ ok: false, t: '✗ ' + (e instanceof Error ? e.message : String(e)) })
    } finally {
      setOcupado(false)
    }
  }

  async function enviar(f: File) {
    setOcupado(true)
    setMsg(null)
    try {
      if (f.type && f.type !== 'application/pdf') throw new Error('Envie o PDF assinado (arquivo .pdf).')
      const hash = await sha256Hex(f)
      const path = `agenciador/${pessoaId}/contrato-assinado-${Date.now()}.pdf`
      const { error: eu } = await supabase.storage.from('contratos').upload(path, f, { contentType: 'application/pdf' })
      if (eu) throw eu
      const { error } = await dbNovo.rpc('contrato_agenciador_enviar', { p_path: path, p_hash: hash })
      if (error) throw new Error(error.message)
      setMsg({ ok: true, t: '✓ PDF assinado enviado. A RBR confere a assinatura e avisa aqui.' })
      await recarregar()
    } catch (e) {
      setMsg({ ok: false, t: '✗ ' + (e instanceof Error ? e.message : String(e)) })
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="bg-white border rounded-[16px] p-3.5 flex flex-col gap-2.5" style={{ borderColor: st.cor }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-sm font-bold text-[color:var(--rbr-navy-dark)]">Contrato com a RBR</div>
        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full" style={{ background: st.bg, color: st.cor }}>
          {st.texto}
        </span>
      </div>
      {situacao.status === 'suspenso' ? (
        <div className="text-xs">Novas cargas estão travadas. {situacao.motivo ? `Motivo: ${situacao.motivo}.` : ''} Fale com a RBR.</div>
      ) : situacao.versao_publicada == null ? (
        <div className="text-xs text-[color:var(--rbr-muted)]">A RBR ainda está finalizando o contrato. Você será avisado aqui.</div>
      ) : (
        <>
          <div className="text-xs">
            Sem o contrato validado você não fecha carga, a carga não vira operação e a documentação não é liberada.
            {situacao.status === 'recusado' && situacao.motivo ? ` Motivo da recusa: ${situacao.motivo}.` : ''}
          </div>
          <ol className="text-xs list-decimal pl-4 flex flex-col gap-0.5">
            <li>Baixe o contrato (versão {situacao.versao_publicada}).</li>
            <li>
              Assine no{' '}
              <a href="https://assinador.iti.br" target="_blank" rel="noreferrer" className="underline font-bold text-[color:var(--rbr-navy)]">
                assinador do gov.br
              </a>{' '}
              (conta prata ou ouro), com o CPF do responsável.
            </li>
            <li>Envie aqui o PDF assinado.</li>
          </ol>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              disabled={ocupado}
              onClick={() => void baixar()}
              className="text-xs font-bold px-3 py-2 rounded-lg disabled:opacity-60"
              style={{ background: 'var(--rbr-navy)', color: '#fff' }}
            >
              {ocupado ? 'enviando…' : 'Baixar contrato'}
            </button>
            <label className="text-xs font-bold px-3 py-2 rounded-lg border cursor-pointer" style={{ borderColor: 'var(--rbr-navy)', color: 'var(--rbr-navy)' }}>
              Enviar PDF assinado
              <input type="file" accept="application/pdf" className="hidden" disabled={ocupado} onChange={(e) => e.target.files?.[0] && void enviar(e.target.files[0])} />
            </label>
          </div>
        </>
      )}
      {msg && (
        <div className="text-xs font-semibold" style={{ color: msg.ok ? 'var(--rbr-positive)' : 'var(--rbr-danger)' }}>
          {msg.t}
        </div>
      )}
    </div>
  )
}
