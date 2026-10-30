import { useEffect, useRef, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { andamentoDoCancelamento, planoDeCancelamentoOperacao, type EstadoEtapaCancelamento, type EtapaCancelamento } from '@rbr/shared/regrasFluxo'
import { Aviso, Botao, Campo, inputClass, inputStyle, Modal } from '../financeiro/ui'
import { mensagemClara } from '../../lib/mensagemClara'

// B15 · Cancelar a operação inteira (quadro 56). Desfaz na ordem MDF-e → CIOT → vale-pedágio → averbação → CT-e e, só se tudo deu certo,
// cancela a operação. Para no primeiro passo que trava ou falha e mostra onde parou. Os prazos são conferidos de novo pelo servidor em
// cada passo (cancelar-documento-fiscal, efrete-ciot-operacao, nspedagio-vpo); aqui o plano só mostra o que vai ser tentado.
// Cancelamento é definitivo e, em produção, tem efeito fiscal e financeiro: só roda depois do botão e da caixa "Entendo".

const NOME: Record<EtapaCancelamento, string> = { mdfe: 'MDF-e', ciot: 'CIOT', vpo: 'Vale-pedágio', averbacao: 'Averbação', cte: 'CT-e' }
const ORDEM: EtapaCancelamento[] = ['mdfe', 'ciot', 'vpo', 'averbacao', 'cte']
type Resultado = Partial<Record<EtapaCancelamento, 'feito' | 'falhou'>>
type LinhaPasso = { operacao_id: string; ordem: number; etapa: string; status: string; motivo_operacao: string; detalhe: string | null }

async function detalheDoErro(error: unknown, padrao: string): Promise<string> {
  const ctx = (error as { context?: Response } | null)?.context
  if (ctx && typeof ctx.json === 'function') {
    try {
      const j = await ctx.json()
      return String(j?.erro ?? j?.motivo ?? padrao)
    } catch {
      /* mantém o padrão */
    }
  }
  return mensagemClara(error, padrao)
}

export default function CancelarOperacaoInteira({ operacaoId, onFechar, onFeito }: { operacaoId: string; onFechar: () => void; onFeito: () => void }) {
  const [estado, setEstado] = useState<Record<EtapaCancelamento, EstadoEtapaCancelamento> | null>(null)
  const [motivo, setMotivo] = useState('')
  const [entendo, setEntendo] = useState(false)
  const [rodando, setRodando] = useState(false)
  const [resultados, setResultados] = useState<Resultado>({})
  const [erro, setErro] = useState<string | null>(null)
  const [concluido, setConcluido] = useState(false)
  const ocupado = useRef(false)

  useEffect(() => {
    let vivo = true
    void (async () => {
      const [docs, cv] = await Promise.all([
        supabase.from('documentacao_operacao').select('tipo, status').eq('operacao_id', operacaoId).in('tipo', ['mdfe', 'cte', 'atm']),
        supabase.from('operacao_ciot_vpo').select('ciot_origem, ciot_status, vpo_idvpo').eq('operacao_id', operacaoId).maybeSingle(),
      ])
      if (!vivo) return
      const doc = (t: string) => (docs.data ?? []).find((d) => d.tipo === t)?.status ?? null
      const livre = { dentroDoPrazo: true }
      setEstado({
        mdfe: { existe: doc('mdfe') === 'emitido' || doc('mdfe') === 'cancelado', jaCancelada: doc('mdfe') === 'cancelado', ...livre },
        ciot: { existe: cv.data?.ciot_origem === 'efrete' && ['emitido', 'cancelado'].includes(String(cv.data.ciot_status)), jaCancelada: cv.data?.ciot_status === 'cancelado', ...livre },
        vpo: { existe: !!cv.data?.vpo_idvpo, ...livre },
        // Não há função de cancelamento de averbação: se existir, o plano trava e mostra o aviso para fazer na seguradora.
        averbacao: doc('atm') === 'emitido' ? { existe: true, dentroDoPrazo: false, motivoPrazo: 'Cancele a averbação direto na seguradora e depois volte aqui.' } : { existe: false, dentroDoPrazo: true },
        cte: { existe: doc('cte') === 'emitido' || doc('cte') === 'cancelado', jaCancelada: doc('cte') === 'cancelado', ...livre },
      })
    })()
    return () => {
      vivo = false
    }
  }, [operacaoId])

  const plano = estado ? planoDeCancelamentoOperacao(estado) : null
  const justificativaOk = motivo.trim().length >= 15 && motivo.trim().length <= 255

  async function registrar(etapa: EtapaCancelamento, status: string, detalhe: string | null) {
    const linha: LinhaPasso = { operacao_id: operacaoId, ordem: ORDEM.indexOf(etapa) + 1, etapa, status, motivo_operacao: motivo.trim(), detalhe }
    const tabela = supabase.from as unknown as (t: string) => { insert: (l: LinhaPasso) => Promise<unknown> }
    await tabela.call(supabase, 'operacao_cancelamento_passos').insert(linha)
  }

  async function executarPasso(etapa: EtapaCancelamento): Promise<string | null> {
    const just = motivo.trim()
    if (etapa === 'mdfe' || etapa === 'cte') {
      const { data, error } = await supabase.functions.invoke<{ sucesso?: boolean; erro?: string }>('cancelar-documento-fiscal', {
        body: { operacao_id: operacaoId, tipo: etapa, justificativa: just, confirmar: true },
      })
      return error || !data?.sucesso ? await detalheDoErro(error, data?.erro ?? 'o servidor não explicou o motivo') : null
    }
    if (etapa === 'ciot') {
      const { data, error } = await supabase.functions.invoke<{ ok?: boolean; motivo?: string; erro?: string }>('efrete-ciot-operacao', { body: { acao: 'cancelar', operacao_id: operacaoId, motivo: just } })
      return error || data?.ok === false ? await detalheDoErro(error, data?.motivo ?? data?.erro ?? 'o servidor não explicou o motivo') : null
    }
    if (etapa === 'vpo') {
      const { data, error } = await supabase.functions.invoke<{ ok?: boolean; erro?: string }>('nspedagio-vpo', { body: { acao: 'cancelar', operacao_id: operacaoId, confirmar: true, motivo: just } })
      return error || data?.ok === false ? await detalheDoErro(error, data?.erro ?? 'o servidor não explicou o motivo') : null
    }
    return null
  }

  async function cancelarTudo() {
    if (ocupado.current || !plano) return
    ocupado.current = true
    setRodando(true)
    setErro(null)
    try {
      const feitos: Resultado = { ...resultados }
      for (const passo of plano) {
        if (passo.acao === 'pular') continue
        if (passo.acao === 'travar') break
        if (feitos[passo.etapa] === 'feito') continue
        const falha = await executarPasso(passo.etapa)
        feitos[passo.etapa] = falha ? 'falhou' : 'feito'
        setResultados({ ...feitos })
        await registrar(passo.etapa, falha ? 'falhou' : 'feito', falha)
        if (falha) {
          setErro(`Parou em ${NOME[passo.etapa]}: ${falha}`)
          return
        }
      }
      const a = andamentoDoCancelamento(plano, feitos)
      if (a.paradoEm) {
        setErro(`Parou em ${NOME[a.paradoEm]}: ${a.motivo ?? 'fora do prazo.'}`)
        return
      }
      const { data, error } = await supabase.rpc('cancelar_operacao', { p_operacao: operacaoId, p_motivo: motivo.trim() })
      const r = data as { cancelada?: boolean } | null
      if (error || !r?.cancelada) {
        setErro(`Os documentos foram desfeitos, mas a operação não cancelou: ${error ? mensagemClara(error, '') : 'confira na tela Operações'}`)
        return
      }
      setConcluido(true)
      onFeito()
    } catch (e) {
      setErro(mensagemClara(e, 'Não foi possível cancelar agora. O que já foi desfeito fica registrado; tente de novo.'))
    } finally {
      ocupado.current = false
      setRodando(false)
    }
  }

  return (
    <Modal titulo="Cancelar a operação inteira" onFechar={rodando ? () => {} : onFechar} largura="max-w-md">
      <div className="text-xs font-bold" style={{ color: 'var(--rbr-danger)' }}>
        Cancelamento é definitivo. Em produção, desfaz documentos com validade fiscal e vale-pedágio pago.
      </div>
      {!plano ? (
        <div className="text-xs text-[color:var(--rbr-muted)]">Conferindo o que existe nesta operação…</div>
      ) : (
        <ol className="flex flex-col gap-1.5 list-none m-0 p-0 text-xs" aria-label="Ordem do cancelamento">
          {plano.map((p) => {
            const r = resultados[p.etapa]
            const marca = r === 'feito' ? '✓' : r === 'falhou' ? '✗' : p.acao === 'cancelar' ? '•' : p.acao === 'travar' ? '!' : '–'
            return (
              <li key={p.etapa} className="flex gap-2" style={{ color: p.acao === 'travar' || r === 'falhou' ? 'var(--rbr-danger)' : 'var(--rbr-navy-dark)' }}>
                <span className="w-4 text-center font-bold">{marca}</span>
                <span>
                  <b>{NOME[p.etapa]}</b> · {p.acao === 'cancelar' ? 'vai cancelar' : (p.motivo ?? '')}
                </span>
              </li>
            )
          })}
        </ol>
      )}
      <Campo label="Motivo (15 a 255 letras; vai para a SEFAZ e para os registros)">
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className={inputClass} style={inputStyle} disabled={rodando || concluido} placeholder="Ex.: cliente cancelou a carga antes da coleta" />
      </Campo>
      <label className="flex items-start gap-2 text-xs">
        <input type="checkbox" checked={entendo} onChange={(e) => setEntendo(e.target.checked)} disabled={rodando || concluido} className="mt-0.5" />
        <span>Entendo que isso não pode ser desfeito.</span>
      </label>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {concluido && <Aviso tipo="ok">Operação cancelada. Tudo foi desfeito na ordem.</Aviso>}
      <div className="flex justify-end gap-2">
        <Botao variante="secundario" onClick={onFechar} disabled={rodando}>
          {concluido ? 'Fechar' : 'Voltar'}
        </Botao>
        {!concluido && (
          <Botao variante="perigo" disabled={rodando || !plano || !entendo || !justificativaOk} onClick={() => void cancelarTudo()}>
            {rodando ? 'Cancelando…' : 'Cancelar tudo'}
          </Botao>
        )}
      </div>
    </Modal>
  )
}
