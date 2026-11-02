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

  const BADGE: Record<string, { t: string; bg: string; c: string }> = {
    cancelar: { t: 'pode cancelar', bg: '#d6ecdf', c: '#1a6b3c' },
    conferir: { t: 'cancela e confere', bg: '#fff0d6', c: '#7a5200' },
    pular: { t: 'não se aplica', bg: '#eef0fa', c: '#6b7390' },
    travar: { t: 'fora do prazo', bg: '#fbe3e1', c: '#b42318' },
    feito: { t: 'desfeito', bg: '#d6ecdf', c: '#1a6b3c' },
    falhou: { t: 'falhou', bg: '#fbe3e1', c: '#b42318' },
  }
  const OUTROS: [string, string][] = [
    ['Ordem de coleta cancelada', 'O motorista é avisado no app e o caminhão é liberado.'],
    ['Financeiro', 'Os lançamentos da operação são estornados. Pagamentos já feitos aparecem como pendência.'],
    ['Seguradora', 'O sistema gera o aviso (cláusulas 23 e 24). O gestor envia.'],
    ['Cliente', 'Não é avisado sozinho. Quem cotou recebe o aviso e decide.'],
  ]

  return (
    <Modal titulo="Cancelar a operação inteira" onFechar={rodando ? () => {} : onFechar} largura="max-w-4xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs font-bold" style={{ color: 'var(--rbr-danger)' }}>
          Cancelamento é definitivo. Em produção, desfaz documentos com validade fiscal e vale-pedágio pago.
        </div>
        <span className="text-[11px] font-extrabold rounded-full px-3 py-1" style={{ background: '#eef0fa', color: '#1c2559' }}>só gestor</span>
      </div>
      <Campo label="Motivo (15 a 255 letras; vai para a SEFAZ e para os registros)">
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className={inputClass} style={inputStyle} disabled={rodando || concluido} placeholder="Ex.: cliente cancelou a carga antes da coleta" />
      </Campo>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-start">
        <div className="flex flex-col gap-2">
          <div className="text-[11px] font-extrabold tracking-[0.08em] text-[color:var(--rbr-muted)]">SERÁ DESFEITO, UM PASSO POR VEZ, NESTA ORDEM</div>
          {!plano ? (
            <div className="text-xs text-[color:var(--rbr-muted)]">Conferindo o que existe nesta operação…</div>
          ) : (
            <ol className="list-none m-0 p-0 border rounded-xl divide-y text-xs" style={{ borderColor: 'var(--rbr-border)' }} aria-label="Ordem do cancelamento">
              {plano.map((p, i) => {
                const r = resultados[p.etapa]
                const chave = r ?? (p.acao === 'cancelar' && p.etapa === 'vpo' ? 'conferir' : p.acao)
                const b = BADGE[chave] ?? BADGE.cancelar
                return (
                  <li key={p.etapa} className="flex items-center gap-3 px-3 py-2.5" style={{ borderColor: 'var(--rbr-border)' }}>
                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-extrabold flex-shrink-0" style={{ background: '#eef0fa' }}>{i + 1}</span>
                    <span className="flex-1 min-w-0">
                      <b className="block text-[13px] text-[color:var(--rbr-navy-dark)]">{NOME[p.etapa]}</b>
                      <span className="text-[color:var(--rbr-muted)]">{p.acao === 'cancelar' ? (p.etapa === 'vpo' ? 'Devolução conforme a operadora.' : 'O servidor confere o prazo antes de cancelar.') : (p.motivo ?? '')}</span>
                    </span>
                    <span className="text-[11px] font-extrabold rounded-full px-2.5 py-1 whitespace-nowrap" style={{ background: b.bg, color: b.c }}>{b.t}</span>
                  </li>
                )
              })}
            </ol>
          )}
          <div className="text-[11px] text-[color:var(--rbr-muted)]">
            Cada passo só começa se o anterior deu certo. Se um travar, o sistema para ali, mostra o que já foi desfeito e avisa o gestor.
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <div className="text-[11px] font-extrabold tracking-[0.08em] text-[color:var(--rbr-muted)]">O QUE MAIS ACONTECE</div>
          {OUTROS.map(([t, d]) => (
            <div key={t} className="text-xs border-b pb-2" style={{ borderColor: 'var(--rbr-border)' }}>
              <b className="block text-[13px] text-[color:var(--rbr-navy-dark)]">{t}</b>
              <span className="text-[color:var(--rbr-muted)]">{d}</span>
            </div>
          ))}
          <div className="text-xs rounded-xl px-3 py-2.5" style={{ background: '#fff4d9', color: '#7a5200', border: '1px solid #f0d9a8' }}>
            <b>Se algum passo estiver fora do prazo</b> (CT-e com mais de 7 dias, por exemplo), o sistema para ali e só o gestor decide o que fazer com a contabilidade.
          </div>
        </div>
      </div>
      <label className="flex items-start gap-2 text-xs">
        <input type="checkbox" checked={entendo} onChange={(e) => setEntendo(e.target.checked)} disabled={rodando || concluido} className="mt-0.5" />
        <span>Entendo que isso não pode ser desfeito.</span>
      </label>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {concluido && <Aviso tipo="ok">Operação cancelada. Tudo foi desfeito na ordem.</Aviso>}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[11px] text-[color:var(--rbr-muted)]">Fica na trilha: quem cancelou, quando e o motivo.</span>
        <div className="flex gap-2">
          <Botao variante="secundario" onClick={onFechar} disabled={rodando}>
            {concluido ? 'Fechar' : 'Voltar'}
          </Botao>
          {!concluido && (
            <Botao variante="perigo" disabled={rodando || !plano || !entendo || !justificativaOk} onClick={() => void cancelarTudo()}>
              {rodando ? 'Cancelando…' : 'Cancelar a operação'}
            </Botao>
          )}
        </div>
      </div>
    </Modal>
  )
}
