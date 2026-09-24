import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import type { Database } from '@rbr/shared/database.types'
import { formatMoney, formatDateTime } from '@rbr/shared/format'

type Operacao = Database['public']['Tables']['operacoes']['Row']
type DocumentacaoOperacao = Pick<
  Database['public']['Tables']['documentacao_operacao']['Row'],
  | 'id'
  | 'operacao_id'
  | 'tipo'
  | 'status'
  | 'referencia'
  | 'numero_documento'
  | 'chave_acesso'
  | 'url_pdf'
  | 'emitido_em'
  | 'disponivel_para_agenciador'
  | 'mensagem_erro'
  | 'atualizado_em'
  | 'provedor'
  | 'ambiente'
>
type StatusDocumentoFiscal = Database['public']['Enums']['status_documento_fiscal']
type TipoDocumentoFiscal = Database['public']['Enums']['tipo_documento_fiscal']

type OperacaoEnriquecida = Operacao & {
  clienteNome?: string | null
  valorTotal?: number | null
  cidadeOrigem?: string | null
  ufOrigem?: string | null
  cidadeDestino?: string | null
  ufDestino?: string | null
}

// Tipos de documento fiscal exibidos nesta tela — a esteira também grava
// atm/wialon/apolice_seguro em documentacao_operacao, mas esses têm
// telas/fluxos próprios (AT&M/Wialon em monitoramento). Esta tela cobre
// CT-e, MDF-e e CIOT (a integração automatizada desses três ainda não
// existe — por ora eles são emitidos manualmente em portais externos e
// apenas registrados aqui, ver TIPOS_DOC_MANUAL) e NFS-e (emissão
// automatizada via Edge Function).
const TIPOS_EXIBIDOS: TipoDocumentoFiscal[] = ['cte', 'mdfe', 'ciot', 'nfse']

// Tipos que este app ainda não emite automaticamente: o gestor apenas
// registra aqui o que já foi emitido manualmente fora do sistema (site/portal
// do fornecedor), para manter o controle financeiro/documental. Por isso
// entram como ambiente 'producao' (documentos reais), não 'homologacao'.
const TIPOS_DOC_MANUAL: TipoDocumentoFiscal[] = ['cte', 'mdfe', 'ciot']

// Status que fazem sentido para um registro manual: emitido (já saiu do
// fornecedor) ou pendente (já solicitado, aguardando o fornecedor emitir).
// bloqueado/erro/cancelado pertencem ao fluxo automatizado futuro.
const STATUS_DOC_MANUAL_OPCOES: StatusDocumentoFiscal[] = ['emitido', 'pendente']

type DocumentoManualForm = {
  tipo: TipoDocumentoFiscal
  numero_documento: string
  chave_acesso: string
  provedor: string
  url_pdf: string
  emitido_em: string
  referencia: string
  status: StatusDocumentoFiscal
  disponivel_para_agenciador: boolean
}

function criarFormDocumentoManual(tipo: TipoDocumentoFiscal): DocumentoManualForm {
  return {
    tipo,
    numero_documento: '',
    chave_acesso: '',
    provedor: '',
    url_pdf: '',
    emitido_em: new Date().toISOString().slice(0, 10),
    referencia: '',
    status: 'emitido',
    disponivel_para_agenciador: false,
  }
}

const TIPO_DOC_LABEL: Record<TipoDocumentoFiscal, string> = {
  cte: 'CT-e',
  mdfe: 'MDF-e',
  nfse: 'NFS-e',
  ciot: 'CIOT',
  atm: 'Averbação do seguro',
  wialon: 'Rastreamento por satélite',
  apolice_seguro: 'Apólice de seguro',
  vpo: 'Vale-pedágio (VPO)',
  gr: 'Pesquisa GR',
  aet: 'AET (DNIT)',
}

const STATUS_DOC_LABEL: Record<StatusDocumentoFiscal, string> = {
  pendente: 'Pendente',
  emitido: 'Emitido',
  bloqueado: 'Bloqueado',
  erro: 'Erro',
  cancelado: 'Cancelado',
}

function statusDocBackground(status: StatusDocumentoFiscal): string {
  if (status === 'emitido') return 'var(--rbr-positive)'
  if (status === 'erro') return 'var(--rbr-danger)'
  if (status === 'bloqueado') return 'var(--rbr-gold)'
  if (status === 'cancelado') return 'var(--rbr-muted)'
  return 'var(--rbr-navy)' // pendente
}

const cardStyle = {
  borderColor: 'var(--rbr-border)',
  boxShadow: '0 1px 2px rgba(18,23,61,0.03), 0 6px 18px rgba(18,23,61,0.05)',
}

// Resposta das funções emitir-cte / emitir-nfse-intramunicipal.
type RespostaEmissao = {
  sucesso: boolean
  bloqueado?: boolean
  motivos?: string[]
  erro?: string
  referencia?: string
  status?: string
  aviso?: string
}

// Resposta da consultar-documento-fiscal.
type RespostaConsulta = {
  sucesso: boolean
  status?: string
  erro?: string
}

type DetalheErro = { erro?: string; motivos?: string[] }

// supabase-js, quando a Edge Function responde 4xx/5xx, devolve
// { data: null, error: FunctionsHttpError }. O corpo JSON que a função
// devolveu (com `erro`/`motivos`) não está em `error.message` — está em
// `error.context`, que é o objeto Response cru da chamada (confirmado no
// código-fonte de @supabase/functions-js: `throw new FunctionsHttpError(response)`,
// e a doc oficial lê com `await error.context.json()`). Por segurança,
// qualquer formato inesperado cai no fallback de error.message, sem nunca
// derrubar a tela.
async function extrairDetalheErroInvoke(error: unknown): Promise<DetalheErro> {
  try {
    const context = (error as { context?: unknown } | null | undefined)?.context
    if (context && typeof (context as Response).json === 'function') {
      const body = await (context as Response).json()
      if (body && typeof body === 'object') {
        const b = body as { erro?: string; motivos?: string[] }
        if (b.erro || (b.motivos && b.motivos.length > 0)) {
          return { erro: b.erro, motivos: b.motivos }
        }
      }
    } else if (context && typeof context === 'object') {
      const b = context as { erro?: string; motivos?: string[] }
      if (b.erro || (b.motivos && b.motivos.length > 0)) {
        return { erro: b.erro, motivos: b.motivos }
      }
    }
  } catch {
    // Corpo não veio como JSON válido (ou o stream já tinha sido consumido) —
    // cai no fallback abaixo em vez de quebrar a tela.
  }
  const mensagem = error instanceof Error ? error.message : 'Erro desconhecido ao chamar a função.'
  return { erro: mensagem }
}

export default function Fiscal() {
  const [operacoes, setOperacoes] = useState<OperacaoEnriquecida[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [docsPorOperacao, setDocsPorOperacao] = useState<Map<string, DocumentacaoOperacao[]>>(new Map())
  const [emAndamento, setEmAndamento] = useState<Set<string>>(new Set())
  const [erroPorOperacao, setErroPorOperacao] = useState<Record<string, DetalheErro | null>>({})

  // Registro manual de CT-e/MDF-e/CIOT emitidos fora do sistema.
  const [formNovoDocOperacaoId, setFormNovoDocOperacaoId] = useState<string | null>(null)
  const [novoDocForm, setNovoDocForm] = useState<DocumentoManualForm>(criarFormDocumentoManual('cte'))
  const [editandoDocId, setEditandoDocId] = useState<string | null>(null)
  const [editDocForm, setEditDocForm] = useState<DocumentoManualForm>(criarFormDocumentoManual('cte'))
  const [salvandoDoc, setSalvandoDoc] = useState(false)
  const [erroDocPorOperacao, setErroDocPorOperacao] = useState<Record<string, string | null>>({})

  const carregarDocumentos = useCallback(async (operacaoIds: string[]) => {
    if (operacaoIds.length === 0) return
    const { data } = await supabase
      .from('documentacao_operacao')
      .select(
        'id, operacao_id, tipo, status, referencia, numero_documento, chave_acesso, url_pdf, emitido_em, disponivel_para_agenciador, mensagem_erro, atualizado_em, provedor, ambiente',
      )
      .in('operacao_id', operacaoIds)

    setDocsPorOperacao((prev) => {
      const proximo = new Map(prev)
      for (const id of operacaoIds) proximo.set(id, [])
      for (const doc of data ?? []) {
        const lista = proximo.get(doc.operacao_id) ?? []
        lista.push(doc)
        proximo.set(doc.operacao_id, lista)
      }
      return proximo
    })
  }, [])

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
    await carregarDocumentos(mapeadas.map((op) => op.id))
  }, [carregarDocumentos])

  useEffect(() => {
    load()
  }, [load])

  function marcarEmAndamento(chave: string, ativo: boolean) {
    setEmAndamento((prev) => {
      const proximo = new Set(prev)
      if (ativo) proximo.add(chave)
      else proximo.delete(chave)
      return proximo
    })
  }

  async function emitirDocumento(op: OperacaoEnriquecida, tipo: 'cte' | 'nfse') {
    const chave = `${op.id}:${tipo}`
    const funcao = tipo === 'cte' ? 'emitir-cte' : 'emitir-nfse-intramunicipal'
    marcarEmAndamento(chave, true)
    setErroPorOperacao((prev) => ({ ...prev, [op.id]: null }))
    try {
      const { data, error } = await supabase.functions.invoke<RespostaEmissao>(funcao, {
        body: { operacao_id: op.id },
      })
      if (error) {
        const detalhe = await extrairDetalheErroInvoke(error)
        setErroPorOperacao((prev) => ({ ...prev, [op.id]: detalhe }))
      } else if (data && data.sucesso === false) {
        setErroPorOperacao((prev) => ({ ...prev, [op.id]: { erro: data.erro, motivos: data.motivos } }))
      }
    } catch (e) {
      setErroPorOperacao((prev) => ({
        ...prev,
        [op.id]: { erro: e instanceof Error ? e.message : 'Erro inesperado ao emitir documento.' },
      }))
    } finally {
      marcarEmAndamento(chave, false)
      await carregarDocumentos([op.id])
    }
  }

  async function consultarStatus(op: OperacaoEnriquecida, tipo: 'cte' | 'nfse') {
    const chave = `${op.id}:consultar:${tipo}`
    marcarEmAndamento(chave, true)
    setErroPorOperacao((prev) => ({ ...prev, [op.id]: null }))
    try {
      const { data, error } = await supabase.functions.invoke<RespostaConsulta>('consultar-documento-fiscal', {
        body: { operacao_id: op.id, tipo },
      })
      if (error) {
        const detalhe = await extrairDetalheErroInvoke(error)
        setErroPorOperacao((prev) => ({ ...prev, [op.id]: detalhe }))
      } else if (data && data.sucesso === false) {
        setErroPorOperacao((prev) => ({ ...prev, [op.id]: { erro: data.erro } }))
      }
    } catch (e) {
      setErroPorOperacao((prev) => ({
        ...prev,
        [op.id]: { erro: e instanceof Error ? e.message : 'Erro inesperado ao consultar status.' },
      }))
    } finally {
      marcarEmAndamento(chave, false)
      await carregarDocumentos([op.id])
    }
  }

  function abrirFormNovoDocumento(opId: string, tipoInicial: TipoDocumentoFiscal) {
    setFormNovoDocOperacaoId(opId)
    setNovoDocForm(criarFormDocumentoManual(tipoInicial))
    setErroDocPorOperacao((prev) => ({ ...prev, [opId]: null }))
  }

  function fecharFormNovoDocumento(opId: string) {
    setFormNovoDocOperacaoId(null)
    setErroDocPorOperacao((prev) => ({ ...prev, [opId]: null }))
  }

  async function salvarNovoDocumento(op: OperacaoEnriquecida) {
    if (!novoDocForm.numero_documento.trim()) {
      setErroDocPorOperacao((prev) => ({ ...prev, [op.id]: 'Informe o número do documento.' }))
      return
    }
    setSalvandoDoc(true)
    setErroDocPorOperacao((prev) => ({ ...prev, [op.id]: null }))
    const { error } = await supabase.from('documentacao_operacao').insert({
      operacao_id: op.id,
      tipo: novoDocForm.tipo,
      numero_documento: novoDocForm.numero_documento.trim(),
      chave_acesso: novoDocForm.chave_acesso.trim() || null,
      provedor: novoDocForm.provedor.trim() || null,
      url_pdf: novoDocForm.url_pdf.trim() || null,
      emitido_em: novoDocForm.emitido_em ? new Date(`${novoDocForm.emitido_em}T00:00:00`).toISOString() : null,
      referencia: novoDocForm.referencia.trim() || null,
      status: novoDocForm.status,
      disponivel_para_agenciador: novoDocForm.disponivel_para_agenciador,
      // Registro manual de um documento real, emitido fora do sistema —
      // nunca 'homologacao' (o default da tabela), que é reservado aos
      // testes do fluxo automatizado.
      ambiente: 'producao',
    })
    setSalvandoDoc(false)
    if (error) {
      setErroDocPorOperacao((prev) => ({ ...prev, [op.id]: error.message }))
      return
    }
    setFormNovoDocOperacaoId(null)
    await carregarDocumentos([op.id])
  }

  function iniciarEdicaoDocumento(doc: DocumentacaoOperacao) {
    setEditandoDocId(doc.id)
    setEditDocForm({
      tipo: doc.tipo,
      numero_documento: doc.numero_documento ?? '',
      chave_acesso: doc.chave_acesso ?? '',
      provedor: doc.provedor ?? '',
      url_pdf: doc.url_pdf ?? '',
      emitido_em: doc.emitido_em ? doc.emitido_em.slice(0, 10) : '',
      referencia: doc.referencia ?? '',
      status: doc.status === 'pendente' ? 'pendente' : 'emitido',
      disponivel_para_agenciador: doc.disponivel_para_agenciador,
    })
    setErroDocPorOperacao((prev) => ({ ...prev, [doc.operacao_id]: null }))
  }

  function cancelarEdicaoDocumento(opId: string) {
    setEditandoDocId(null)
    setErroDocPorOperacao((prev) => ({ ...prev, [opId]: null }))
  }

  async function salvarEdicaoDocumento(op: OperacaoEnriquecida, docId: string) {
    if (!editDocForm.numero_documento.trim()) {
      setErroDocPorOperacao((prev) => ({ ...prev, [op.id]: 'Informe o número do documento.' }))
      return
    }
    setSalvandoDoc(true)
    setErroDocPorOperacao((prev) => ({ ...prev, [op.id]: null }))
    const { error } = await supabase
      .from('documentacao_operacao')
      .update({
        numero_documento: editDocForm.numero_documento.trim(),
        chave_acesso: editDocForm.chave_acesso.trim() || null,
        provedor: editDocForm.provedor.trim() || null,
        url_pdf: editDocForm.url_pdf.trim() || null,
        emitido_em: editDocForm.emitido_em ? new Date(`${editDocForm.emitido_em}T00:00:00`).toISOString() : null,
        referencia: editDocForm.referencia.trim() || null,
        status: editDocForm.status,
        disponivel_para_agenciador: editDocForm.disponivel_para_agenciador,
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', docId)
    setSalvandoDoc(false)
    if (error) {
      setErroDocPorOperacao((prev) => ({ ...prev, [op.id]: error.message }))
      return
    }
    setEditandoDocId(null)
    await carregarDocumentos([op.id])
  }

  async function excluirDocumento(op: OperacaoEnriquecida, docId: string) {
    const confirmado = window.confirm(
      'Excluir este documento registrado manualmente? Esta ação não pode ser desfeita.',
    )
    if (!confirmado) return
    setSalvandoDoc(true)
    setErroDocPorOperacao((prev) => ({ ...prev, [op.id]: null }))
    const { error } = await supabase.from('documentacao_operacao').delete().eq('id', docId)
    setSalvandoDoc(false)
    if (error) {
      setErroDocPorOperacao((prev) => ({ ...prev, [op.id]: error.message }))
      return
    }
    await carregarDocumentos([op.id])
  }

  const lista = operacoes ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="rbr-display font-bold text-2xl md:text-3xl text-[color:var(--rbr-navy-dark)]">Fiscal</h1>
      </div>

      {errorMsg && (
        <div className="text-xs rounded-xl px-3 py-2.5" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
          {errorMsg}
        </div>
      )}

      {loading && <div className="text-sm text-[color:var(--rbr-muted)] py-6 text-center">Carregando…</div>}

      {!loading && lista.length === 0 && (
        <div className="text-sm text-[color:var(--rbr-muted)] bg-white border rounded-[20px] p-[18px]" style={cardStyle}>
          Nenhuma operação encontrada.
        </div>
      )}

      <div className="flex flex-col gap-3">
        {!loading &&
          lista.map((op) => {
            const docs = docsPorOperacao.get(op.id) ?? []
            const docsExibidos = TIPOS_EXIBIDOS.map((tipo) => docs.find((d) => d.tipo === tipo)).filter(
              (d): d is DocumentacaoOperacao => Boolean(d),
            )
            const docCte = docs.find((d) => d.tipo === 'cte')
            const docNfse = docs.find((d) => d.tipo === 'nfse')
            const erroCard = erroPorOperacao[op.id]

            const chaveCte = `${op.id}:cte`
            const chaveNfse = `${op.id}:nfse`
            const chaveConsultarCte = `${op.id}:consultar:cte`
            const chaveConsultarNfse = `${op.id}:consultar:nfse`

            const tiposDisponiveisParaRegistro = TIPOS_DOC_MANUAL.filter(
              (tipo) => !docs.some((d) => d.tipo === tipo),
            )
            const formNovoDocAberto = formNovoDocOperacaoId === op.id
            const erroDoc = erroDocPorOperacao[op.id]

            return (
              <div key={op.id} className="bg-white border rounded-[20px] p-[18px] flex flex-col gap-3" style={cardStyle}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="text-[15px] font-bold">{op.clienteNome ?? 'Cliente a confirmar'}</div>
                  {op.valorTotal != null && <div className="text-sm font-bold">{formatMoney(op.valorTotal)}</div>}
                </div>
                <div className="text-xs text-[color:var(--rbr-muted)]">
                  {op.cidadeOrigem ?? '?'}/{op.ufOrigem ?? '?'} → {op.cidadeDestino ?? '?'}/{op.ufDestino ?? '?'}
                </div>

                {docsExibidos.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {docsExibidos.map((doc) => {
                      const documentoManual = TIPOS_DOC_MANUAL.includes(doc.tipo)
                      const emEdicao = editandoDocId === doc.id
                      return (
                        <div key={doc.tipo} className="flex flex-col gap-1.5">
                          {emEdicao ? (
                            <div
                              className="flex flex-col gap-2 bg-white rounded-lg p-2.5 border"
                              style={{ borderColor: 'var(--rbr-border)' }}
                            >
                              <div className="text-xs font-bold">{TIPO_DOC_LABEL[doc.tipo]} — editar registro manual</div>
                              <div className="grid grid-cols-2 gap-2">
                                <input
                                  placeholder="Número do documento"
                                  value={editDocForm.numero_documento}
                                  onChange={(e) => setEditDocForm((f) => ({ ...f, numero_documento: e.target.value }))}
                                  className="border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                                  style={{ borderColor: 'var(--rbr-border)' }}
                                />
                                <input
                                  placeholder="Chave de acesso (opcional)"
                                  value={editDocForm.chave_acesso}
                                  onChange={(e) => setEditDocForm((f) => ({ ...f, chave_acesso: e.target.value }))}
                                  className="border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                                  style={{ borderColor: 'var(--rbr-border)' }}
                                />
                                <input
                                  placeholder="Provedor / portal usado"
                                  value={editDocForm.provedor}
                                  onChange={(e) => setEditDocForm((f) => ({ ...f, provedor: e.target.value }))}
                                  className="border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                                  style={{ borderColor: 'var(--rbr-border)' }}
                                />
                                <input
                                  placeholder="Link do PDF / comprovante (opcional)"
                                  value={editDocForm.url_pdf}
                                  onChange={(e) => setEditDocForm((f) => ({ ...f, url_pdf: e.target.value }))}
                                  className="border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                                  style={{ borderColor: 'var(--rbr-border)' }}
                                />
                                <input
                                  type="date"
                                  value={editDocForm.emitido_em}
                                  onChange={(e) => setEditDocForm((f) => ({ ...f, emitido_em: e.target.value }))}
                                  className="border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                                  style={{ borderColor: 'var(--rbr-border)' }}
                                />
                                <select
                                  value={editDocForm.status}
                                  onChange={(e) =>
                                    setEditDocForm((f) => ({ ...f, status: e.target.value as StatusDocumentoFiscal }))
                                  }
                                  className="border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                                  style={{ borderColor: 'var(--rbr-border)' }}
                                >
                                  {STATUS_DOC_MANUAL_OPCOES.map((s) => (
                                    <option key={s} value={s}>
                                      {STATUS_DOC_LABEL[s]}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <textarea
                                placeholder="Referência / observações (opcional)"
                                value={editDocForm.referencia}
                                onChange={(e) => setEditDocForm((f) => ({ ...f, referencia: e.target.value }))}
                                className="border rounded-lg px-2.5 py-1.5 text-xs outline-none resize-none"
                                style={{ borderColor: 'var(--rbr-border)' }}
                                rows={2}
                              />
                              <label className="flex items-center gap-2 text-[11px] text-[color:var(--rbr-muted)]">
                                <input
                                  type="checkbox"
                                  checked={editDocForm.disponivel_para_agenciador}
                                  onChange={(e) =>
                                    setEditDocForm((f) => ({ ...f, disponivel_para_agenciador: e.target.checked }))
                                  }
                                />
                                Disponibilizar este documento para o agenciador
                              </label>
                              <div className="flex gap-2 flex-wrap">
                                <button
                                  onClick={() => salvarEdicaoDocumento(op, doc.id)}
                                  disabled={salvandoDoc}
                                  className="text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-60"
                                  style={{ background: 'var(--rbr-navy)', color: '#fff' }}
                                >
                                  {salvandoDoc ? 'Salvando…' : 'Salvar'}
                                </button>
                                <button
                                  onClick={() => cancelarEdicaoDocumento(op.id)}
                                  disabled={salvandoDoc}
                                  className="text-xs font-bold px-3 py-1.5 rounded-lg border disabled:opacity-60"
                                  style={{ borderColor: 'var(--rbr-navy)', color: 'var(--rbr-navy)' }}
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold w-14 flex-shrink-0">{TIPO_DOC_LABEL[doc.tipo]}</span>
                                <span
                                  className="text-[11px] font-bold uppercase tracking-wide text-white px-2.5 py-1 rounded-full"
                                  style={{ background: statusDocBackground(doc.status) }}
                                >
                                  {STATUS_DOC_LABEL[doc.status]}
                                </span>
                                {doc.numero_documento && (
                                  <span className="text-[11px] text-[color:var(--rbr-muted)]">
                                    Nº {doc.numero_documento}
                                  </span>
                                )}
                                {doc.provedor && (
                                  <span className="text-[11px] text-[color:var(--rbr-muted)]">via {doc.provedor}</span>
                                )}
                                {doc.atualizado_em && (
                                  <span className="text-[11px] text-[color:var(--rbr-muted)]">
                                    atualizado em {formatDateTime(doc.atualizado_em)}
                                  </span>
                                )}
                                {doc.ambiente === 'homologacao' && (
                                  <span
                                    className="text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                                    style={{ background: 'var(--rbr-warning-bg)', color: 'var(--rbr-navy-dark)' }}
                                    title="Emitido no ambiente de testes do provedor — não tem validade fiscal."
                                  >
                                    Homologação — sem validade fiscal
                                  </span>
                                )}
                                {documentoManual && (
                                  <span className="flex gap-2 ml-auto">
                                    <button
                                      onClick={() => iniciarEdicaoDocumento(doc)}
                                      className="text-[11px] font-bold underline"
                                      style={{ color: 'var(--rbr-navy)' }}
                                    >
                                      Editar
                                    </button>
                                    <button
                                      onClick={() => excluirDocumento(op, doc.id)}
                                      disabled={salvandoDoc}
                                      className="text-[11px] font-bold underline disabled:opacity-60"
                                      style={{ color: 'var(--rbr-danger)' }}
                                    >
                                      Excluir
                                    </button>
                                  </span>
                                )}
                              </div>
                              {(doc.status === 'bloqueado' || doc.status === 'erro') && doc.mensagem_erro && (
                                <div
                                  className="text-[11px] rounded-lg px-3 py-2"
                                  style={{
                                    background: doc.status === 'erro' ? '#FBE9E9' : 'var(--rbr-warning-bg)',
                                    color: doc.status === 'erro' ? 'var(--rbr-danger)' : 'var(--rbr-navy-dark)',
                                  }}
                                >
                                  {doc.mensagem_erro}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  {!formNovoDocAberto && tiposDisponiveisParaRegistro.length > 0 && (
                    <button
                      onClick={() => abrirFormNovoDocumento(op.id, tiposDisponiveisParaRegistro[0])}
                      className="self-start text-xs font-bold px-3.5 py-2 rounded-lg border"
                      style={{ borderColor: 'var(--rbr-navy)', color: 'var(--rbr-navy)' }}
                    >
                      Registrar documento emitido manualmente
                    </button>
                  )}

                  {formNovoDocAberto && (
                    <div
                      className="flex flex-col gap-2 bg-white rounded-lg p-2.5 border"
                      style={{ borderColor: 'var(--rbr-border)' }}
                    >
                      <div className="text-xs font-bold">Registrar documento emitido manualmente</div>
                      <div className="text-[11px] text-[color:var(--rbr-muted)]">
                        Para CT-e/MDF-e/CIOT já emitidos fora do sistema (portal do fornecedor). Fica registrado como
                        ambiente produção.
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={novoDocForm.tipo}
                          onChange={(e) => setNovoDocForm((f) => ({ ...f, tipo: e.target.value as TipoDocumentoFiscal }))}
                          className="border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                          style={{ borderColor: 'var(--rbr-border)' }}
                        >
                          {tiposDisponiveisParaRegistro.map((tipo) => (
                            <option key={tipo} value={tipo}>
                              {TIPO_DOC_LABEL[tipo]}
                            </option>
                          ))}
                        </select>
                        <select
                          value={novoDocForm.status}
                          onChange={(e) =>
                            setNovoDocForm((f) => ({ ...f, status: e.target.value as StatusDocumentoFiscal }))
                          }
                          className="border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                          style={{ borderColor: 'var(--rbr-border)' }}
                        >
                          {STATUS_DOC_MANUAL_OPCOES.map((s) => (
                            <option key={s} value={s}>
                              {STATUS_DOC_LABEL[s]}
                            </option>
                          ))}
                        </select>
                        <input
                          placeholder="Número do documento"
                          value={novoDocForm.numero_documento}
                          onChange={(e) => setNovoDocForm((f) => ({ ...f, numero_documento: e.target.value }))}
                          className="border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                          style={{ borderColor: 'var(--rbr-border)' }}
                        />
                        <input
                          placeholder="Chave de acesso (opcional)"
                          value={novoDocForm.chave_acesso}
                          onChange={(e) => setNovoDocForm((f) => ({ ...f, chave_acesso: e.target.value }))}
                          className="border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                          style={{ borderColor: 'var(--rbr-border)' }}
                        />
                        <input
                          placeholder="Provedor / portal usado"
                          value={novoDocForm.provedor}
                          onChange={(e) => setNovoDocForm((f) => ({ ...f, provedor: e.target.value }))}
                          className="border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                          style={{ borderColor: 'var(--rbr-border)' }}
                        />
                        <input
                          placeholder="Link do PDF / comprovante (opcional)"
                          value={novoDocForm.url_pdf}
                          onChange={(e) => setNovoDocForm((f) => ({ ...f, url_pdf: e.target.value }))}
                          className="border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                          style={{ borderColor: 'var(--rbr-border)' }}
                        />
                        <input
                          type="date"
                          value={novoDocForm.emitido_em}
                          onChange={(e) => setNovoDocForm((f) => ({ ...f, emitido_em: e.target.value }))}
                          className="border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                          style={{ borderColor: 'var(--rbr-border)' }}
                        />
                      </div>
                      <textarea
                        placeholder="Referência / observações (opcional)"
                        value={novoDocForm.referencia}
                        onChange={(e) => setNovoDocForm((f) => ({ ...f, referencia: e.target.value }))}
                        className="border rounded-lg px-2.5 py-1.5 text-xs outline-none resize-none"
                        style={{ borderColor: 'var(--rbr-border)' }}
                        rows={2}
                      />
                      <label className="flex items-center gap-2 text-[11px] text-[color:var(--rbr-muted)]">
                        <input
                          type="checkbox"
                          checked={novoDocForm.disponivel_para_agenciador}
                          onChange={(e) =>
                            setNovoDocForm((f) => ({ ...f, disponivel_para_agenciador: e.target.checked }))
                          }
                        />
                        Disponibilizar este documento para o agenciador
                      </label>
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => salvarNovoDocumento(op)}
                          disabled={salvandoDoc}
                          className="text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-60"
                          style={{ background: 'var(--rbr-navy)', color: '#fff' }}
                        >
                          {salvandoDoc ? 'Salvando…' : 'Salvar registro'}
                        </button>
                        <button
                          onClick={() => fecharFormNovoDocumento(op.id)}
                          disabled={salvandoDoc}
                          className="text-xs font-bold px-3 py-1.5 rounded-lg border disabled:opacity-60"
                          style={{ borderColor: 'var(--rbr-navy)', color: 'var(--rbr-navy)' }}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}

                  {erroDoc && (
                    <div
                      className="text-xs rounded-lg px-3 py-2.5"
                      style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}
                    >
                      {erroDoc}
                    </div>
                  )}
                </div>

                {erroCard && (
                  <div
                    className="text-xs rounded-lg px-3 py-2.5 flex flex-col gap-1"
                    style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}
                  >
                    {erroCard.motivos && erroCard.motivos.length > 0 ? (
                      <ul className="list-disc pl-4 flex flex-col gap-0.5">
                        {erroCard.motivos.map((motivo, i) => (
                          <li key={i}>{motivo}</li>
                        ))}
                      </ul>
                    ) : (
                      <span>{erroCard.erro ?? 'Erro ao processar solicitação.'}</span>
                    )}
                  </div>
                )}

                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => emitirDocumento(op, 'cte')}
                    disabled={emAndamento.has(chaveCte)}
                    className="text-xs font-bold px-3.5 py-2 rounded-lg disabled:opacity-60"
                    style={{ background: 'var(--rbr-navy)', color: '#fff' }}
                  >
                    {emAndamento.has(chaveCte) ? 'Enviando…' : 'Emitir CT-e'}
                  </button>
                  <button
                    onClick={() => emitirDocumento(op, 'nfse')}
                    disabled={emAndamento.has(chaveNfse)}
                    className="text-xs font-bold px-3.5 py-2 rounded-lg disabled:opacity-60"
                    style={{ background: 'var(--rbr-navy)', color: '#fff' }}
                  >
                    {emAndamento.has(chaveNfse) ? 'Enviando…' : 'Emitir NFS-e (intramunicipal)'}
                  </button>
                  {docCte?.status === 'pendente' && (
                    <button
                      onClick={() => consultarStatus(op, 'cte')}
                      disabled={emAndamento.has(chaveConsultarCte)}
                      className="text-xs font-bold px-3.5 py-2 rounded-lg border disabled:opacity-60"
                      style={{ borderColor: 'var(--rbr-navy)', color: 'var(--rbr-navy)' }}
                    >
                      {emAndamento.has(chaveConsultarCte) ? 'Consultando…' : 'Atualizar status CT-e'}
                    </button>
                  )}
                  {docNfse?.status === 'pendente' && (
                    <button
                      onClick={() => consultarStatus(op, 'nfse')}
                      disabled={emAndamento.has(chaveConsultarNfse)}
                      className="text-xs font-bold px-3.5 py-2 rounded-lg border disabled:opacity-60"
                      style={{ borderColor: 'var(--rbr-navy)', color: 'var(--rbr-navy)' }}
                    >
                      {emAndamento.has(chaveConsultarNfse) ? 'Consultando…' : 'Atualizar status NFS-e'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
      </div>
    </div>
  )
}
