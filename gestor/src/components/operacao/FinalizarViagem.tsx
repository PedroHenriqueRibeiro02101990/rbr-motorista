import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import type { Database } from '@rbr/shared/database.types'
import { formatDateTime } from '@rbr/shared/format'
import { Aviso, Campo, inputClass, inputStyle, Modal } from '../financeiro/ui'
import { extrairErro } from './EventoFiscalModal'

// "Finalizar viagem" = encerrar o MDF-e da operação. Por enquanto é SÓ manual: o gestor confere os
// dados já preenchidos e confirma. Não muda o status da operação (entregue/fechada), só o MDF-e.
// Usado no card da operação (Operações) e no bloco fiscal da operação (Fiscal).

type StatusOperacao = Database['public']['Enums']['status_operacao']
export type DocMdfe = Pick<
  Database['public']['Tables']['documentacao_operacao']['Row'],
  'id' | 'status' | 'numero_documento' | 'chave_acesso' | 'emitido_em' | 'encerrado_em' | 'encerramento_origem' | 'encerramento_erro'
>
type EventoFiscal = Pick<Database['public']['Tables']['eventos_fiscais_operacao']['Row'], 'id' | 'created_at' | 'evento' | 'sucesso' | 'mensagem' | 'origem'>
type DadosViagem = { placa: string | null; motorista: string | null; cidade: string | null; uf: string | null }

const COLUNAS_MDFE = 'id, status, numero_documento, chave_acesso, emitido_em, encerrado_em, encerramento_origem, encerramento_erro'
const PRAZO_DIAS = 30
const AVISAR_COM_DIAS = 5
const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO']
const NOME_EVENTO: Record<string, string> = {
  encerramento: 'Encerramento',
  cancelamento: 'Cancelamento',
  carta_correcao: 'Carta de correção',
  inclusao_condutor: 'Inclusão de condutor',
}

function dataBrasilia(d: Date | string) {
  return new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}
function dataCurta(d: Date) {
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

export default function FinalizarViagem({
  operacaoId,
  statusOperacao,
  entregueEm,
  mdfe: mdfeInicial,
  onAtualizado,
}: {
  operacaoId: string
  statusOperacao: StatusOperacao
  entregueEm: string | null
  // Quem já tem o MDF-e carregado (Fiscal) passa aqui; sem isso o componente busca sozinho.
  mdfe?: DocMdfe | null
  onAtualizado?: () => void
}) {
  const [mdfe, setMdfe] = useState<DocMdfe | null | undefined>(mdfeInicial)
  const [aberto, setAberto] = useState(false)
  const [sucesso, setSucesso] = useState<string | null>(null)
  const [eventos, setEventos] = useState<EventoFiscal[] | null>(null)
  const [verEventos, setVerEventos] = useState(false)

  useEffect(() => setMdfe(mdfeInicial), [mdfeInicial])

  const carregarMdfe = useCallback(async () => {
    const { data } = await supabase
      .from('documentacao_operacao')
      .select(COLUNAS_MDFE)
      .eq('operacao_id', operacaoId)
      .eq('tipo', 'mdfe')
      .order('atualizado_em', { ascending: false })
      .limit(1)
    setMdfe(data?.[0] ?? null)
  }, [operacaoId])

  const carregarEventos = useCallback(async () => {
    const { data } = await supabase
      .from('eventos_fiscais_operacao')
      .select('id, created_at, evento, sucesso, mensagem, origem')
      .eq('operacao_id', operacaoId)
      .eq('tipo_documento', 'mdfe')
      .order('created_at', { ascending: false })
      .limit(10)
    setEventos(data ?? [])
  }, [operacaoId])

  useEffect(() => {
    if (mdfeInicial === undefined) carregarMdfe()
  }, [mdfeInicial, carregarMdfe])

  useEffect(() => {
    if (verEventos) carregarEventos()
  }, [verEventos, carregarEventos])

  async function depoisDeTentar(ok: boolean, mensagem?: string) {
    await Promise.all([carregarMdfe(), verEventos ? carregarEventos() : Promise.resolve()])
    if (ok) {
      setSucesso(mensagem ?? 'Viagem finalizada. O MDF-e foi encerrado.')
      setAberto(false)
      onAtualizado?.()
    }
  }

  if (mdfe === undefined) return null

  const autorizado = mdfe?.status === 'emitido'
  const entregue = statusOperacao === 'entregue' || statusOperacao === 'fechada'
  const encerrado = !!mdfe?.encerrado_em

  // Prazo legal: 30 dias a partir da autorização.
  let prazo: { tipo: 'atencao' | 'erro'; texto: string } | null = null
  if (autorizado && !encerrado && mdfe?.emitido_em) {
    const limite = new Date(new Date(mdfe.emitido_em).getTime() + PRAZO_DIAS * 86400000)
    const faltam = (limite.getTime() - Date.now()) / 86400000
    if (faltam < 0) prazo = { tipo: 'erro', texto: `Prazo de ${PRAZO_DIAS} dias vencido. Fale com a contabilidade.` }
    else if (faltam <= AVISAR_COM_DIAS) prazo = { tipo: 'atencao', texto: `Encerre o MDF-e até ${dataCurta(limite)} (prazo de ${PRAZO_DIAS} dias).` }
  }

  const motivoDesativado = !autorizado ? 'Sem MDF-e autorizado. Emita o MDF-e primeiro.' : !entregue ? 'Aguardando a entrega da carga.' : null

  return (
    <div className="bg-white border rounded-2xl p-4 flex flex-col gap-3" style={{ borderColor: 'var(--rbr-border)' }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-sm font-bold text-[color:var(--rbr-navy-dark)]">Finalizar viagem</div>
          <div className="text-xs text-[color:var(--rbr-muted)]">
            {mdfe?.numero_documento ? `MDF-e nº ${mdfe.numero_documento}` : 'Encerra o MDF-e da operação'}
            {autorizado && mdfe?.emitido_em ? ` · autorizado em ${formatDateTime(mdfe.emitido_em)}` : ''}
          </div>
        </div>
        {encerrado ? (
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: '#E7F5EC', color: 'var(--rbr-positive)' }}>
            Viagem finalizada em {formatDateTime(mdfe!.encerrado_em)} ({mdfe!.encerramento_origem === 'automatico' ? 'automático' : 'manual'})
          </span>
        ) : (
          <div className="flex flex-col items-stretch sm:items-end gap-1 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => {
                setSucesso(null)
                setAberto(true)
              }}
              disabled={!!motivoDesativado}
              className="text-sm font-bold px-4 py-2.5 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ background: 'var(--rbr-navy)', color: '#fff' }}
            >
              Finalizar viagem
            </button>
            {motivoDesativado && <div className="text-xs text-[color:var(--rbr-muted)]">{motivoDesativado}</div>}
          </div>
        )}
      </div>

      {!encerrado && autorizado && mdfe?.encerramento_erro && (
        <div className="text-xs rounded-lg px-3 py-2.5 font-semibold" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
          A última tentativa não deu certo: {mdfe.encerramento_erro}
          <div className="font-normal mt-0.5">Confira os dados e tente de novo.</div>
        </div>
      )}
      {prazo && <Aviso tipo={prazo.tipo}>{prazo.texto}</Aviso>}
      {sucesso && (
        <Aviso tipo="ok" onFechar={() => setSucesso(null)}>
          {sucesso}
        </Aviso>
      )}

      {mdfe && (
        <div>
          <button
            type="button"
            onClick={() => setVerEventos((v) => !v)}
            aria-expanded={verEventos}
            className="text-xs font-bold text-[color:var(--rbr-navy)]"
          >
            {verEventos ? '▾' : '▸'} Eventos do MDF-e
          </button>
          {verEventos && (
            <div className="mt-2 flex flex-col gap-1.5">
              {eventos === null ? (
                <div className="text-xs text-[color:var(--rbr-muted)]">Carregando…</div>
              ) : eventos.length === 0 ? (
                <div className="text-xs text-[color:var(--rbr-muted)]">Nenhum evento registrado ainda.</div>
              ) : (
                eventos.map((e) => (
                  <div key={e.id} className="text-xs rounded-lg px-3 py-2 flex flex-col gap-0.5" style={{ background: 'var(--rbr-muted-bg)' }}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-[color:var(--rbr-navy-dark)]">{NOME_EVENTO[e.evento] ?? e.evento}</span>
                      <span className="font-bold" style={{ color: e.sucesso ? 'var(--rbr-positive)' : 'var(--rbr-danger)' }}>
                        {e.sucesso ? 'Deu certo' : 'Erro'}
                      </span>
                      <span className="text-[color:var(--rbr-muted)]">
                        {formatDateTime(e.created_at)} · {e.origem === 'automatico' ? 'automático' : 'manual'}
                      </span>
                    </div>
                    {e.mensagem && <div className="text-[color:var(--rbr-muted)] break-words">{e.mensagem}</div>}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {aberto && mdfe && (
        <ConfirmarFinalizacao
          operacaoId={operacaoId}
          mdfe={mdfe}
          entregueEm={entregueEm}
          onFechar={() => setAberto(false)}
          onTentou={depoisDeTentar}
        />
      )}
    </div>
  )
}

function ConfirmarFinalizacao({
  operacaoId,
  mdfe,
  entregueEm,
  onFechar,
  onTentou,
}: {
  operacaoId: string
  mdfe: DocMdfe
  entregueEm: string | null
  onFechar: () => void
  onTentou: (ok: boolean, mensagem?: string) => Promise<void>
}) {
  const [viagem, setViagem] = useState<DadosViagem | null>(null)
  const padrao = useRef<{ data: string; uf: string; municipio: string } | null>(null)
  const [data, setData] = useState(entregueEm ? dataBrasilia(entregueEm) : dataBrasilia(new Date()))
  const [uf, setUf] = useState('')
  const [municipio, setMunicipio] = useState('')
  const [enviando, setEnviando] = useState(false)
  const enviandoRef = useRef(false)
  const [erro, setErro] = useState<string | null>(null)

  // Placa, motorista e destino vêm da mesma visão que a Edge Function usa como padrão.
  useEffect(() => {
    supabase
      .from('v_checklist_prontidao')
      .select('placa, motorista_nome, cidade_destino, uf_destino')
      .eq('operacao_id', operacaoId)
      .maybeSingle()
      .then(({ data: v }) => {
        const d = { placa: v?.placa ?? null, motorista: v?.motorista_nome ?? null, cidade: v?.cidade_destino ?? null, uf: v?.uf_destino ?? null }
        setViagem(d)
        setUf(d.uf ?? '')
        setMunicipio(d.cidade ?? '')
        padrao.current = { data: entregueEm ? dataBrasilia(entregueEm) : dataBrasilia(new Date()), uf: d.uf ?? '', municipio: d.cidade ?? '' }
      })
  }, [operacaoId, entregueEm])

  async function confirmar() {
    if (enviandoRef.current) return
    enviandoRef.current = true
    setEnviando(true)
    setErro(null)
    // Só manda data/UF/município se o gestor mudou algo; senão a função usa o destino e a data da entrega.
    const p = padrao.current
    const alterou = !p || p.data !== data || p.uf !== uf.trim().toUpperCase() || p.municipio.trim() !== municipio.trim()
    const body: Record<string, unknown> = { acao: 'encerrar_mdfe', operacao_id: operacaoId }
    if (alterou) {
      body.data = data
      body.sigla_uf = uf.trim().toUpperCase()
      body.nome_municipio = municipio.trim()
    }
    try {
      const { data: resp, error } = await supabase.functions.invoke('eventos-fiscais', { body })
      if (error || resp?.sucesso === false) {
        setErro(error ? await extrairErro(error) : (resp?.erro ?? 'Não foi possível finalizar a viagem.'))
        await onTentou(false)
        return
      }
      await onTentou(true, resp?.ja_encerrado ? 'Esse MDF-e já estava encerrado.' : 'Viagem finalizada. O MDF-e foi encerrado.')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível finalizar a viagem.')
    } finally {
      enviandoRef.current = false
      setEnviando(false)
    }
  }

  const pode = !!viagem && !!data && uf.trim().length === 2 && municipio.trim().length >= 2

  return (
    <Modal titulo="Finalizar viagem" onFechar={enviando ? () => {} : onFechar} largura="max-w-md">
      <div className="text-xs text-[color:var(--rbr-muted)]">Confira os dados. Eles já vêm preenchidos; mude só se a viagem terminou em outro lugar ou outro dia.</div>

      <div className="rounded-xl px-3.5 py-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs" style={{ background: 'var(--rbr-muted-bg)' }}>
        <div className="text-[color:var(--rbr-muted)]">MDF-e</div>
        <div className="font-bold text-[color:var(--rbr-navy-dark)] text-right">{mdfe.numero_documento ? `nº ${mdfe.numero_documento}` : '—'}</div>
        <div className="text-[color:var(--rbr-muted)]">Placa</div>
        <div className="font-bold text-[color:var(--rbr-navy-dark)] text-right">{viagem ? (viagem.placa ?? '—') : '…'}</div>
        <div className="text-[color:var(--rbr-muted)]">Motorista</div>
        <div className="font-bold text-[color:var(--rbr-navy-dark)] text-right truncate">{viagem ? (viagem.motorista ?? '—') : '…'}</div>
      </div>

      <Campo label="Data do encerramento" dica={entregueEm ? 'Padrão: data da entrega.' : 'Padrão: hoje.'}>
        <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={inputClass} style={inputStyle} disabled={enviando} />
      </Campo>
      <div className="grid gap-3" style={{ gridTemplateColumns: '90px 1fr' }}>
        <Campo label="UF">
          <select value={uf} onChange={(e) => setUf(e.target.value)} className={inputClass} style={inputStyle} disabled={enviando || !viagem}>
            <option value="">—</option>
            {UFS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Município de descarga" dica="Padrão: destino da operação.">
          <input value={municipio} onChange={(e) => setMunicipio(e.target.value)} className={inputClass} style={inputStyle} disabled={enviando || !viagem} />
        </Campo>
      </div>

      <Aviso tipo="atencao">Depois de finalizar, o MDF-e não pode mais ser cancelado.</Aviso>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onFechar}
          disabled={enviando}
          className="text-sm font-bold px-4 py-2.5 rounded-xl border disabled:opacity-50"
          style={{ borderColor: 'var(--rbr-navy)', color: 'var(--rbr-navy)' }}
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={confirmar}
          disabled={!pode || enviando}
          className="text-sm font-bold px-4 py-2.5 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: 'var(--rbr-navy)', color: '#fff' }}
        >
          {enviando ? 'Encerrando...' : 'Confirmar e finalizar viagem'}
        </button>
      </div>
    </Modal>
  )
}
