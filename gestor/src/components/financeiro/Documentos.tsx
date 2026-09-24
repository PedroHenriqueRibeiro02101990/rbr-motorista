import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import {
  type Apoio,
  type Documento,
  type Lancamento,
  type TipoLanc,
  ACAO_DOC_LABEL,
  TIPO_DOC_LABEL,
  abrirArquivo,
  brl,
  enviarDocumento,
  erroMsg,
  fmtData,
  invocarIA,
} from '../../lib/financeiro'
import { Aviso, Botao, Card, Carregando, Chips, Modal, Pill, Vazio } from './ui'
import { BaixaModal, LancamentoForm, type LancamentoInicial } from './LancamentoModais'

type Filtro = 'revisar' | 'recebidos' | 'emitidos' | 'comprovantes' | 'todos' | 'notas_emitidas'

interface Sugestao {
  acao?: string
  tipo_lancamento?: TipoLanc
  categoria_origem?: string
  categoria_motivo?: string | null
  contraparte?: { tipo: string; id: string; nome: string } | null
  lancamento?: LancamentoInicial & { data_pagamento?: string | null }
  candidatos?: { lancamento_id: string; descricao: string; contraparte: string | null; saldo_aberto: number; data_vencimento: string; score: number }[]
  alertas?: string[]
}

export default function Documentos({ apoio, versao, onMudou, filtroInicial }: { apoio: Apoio; versao: number; onMudou: () => void; filtroInicial?: string }) {
  const [filtro, setFiltro] = useState<Filtro>(filtroInicial === 'emitidos' ? 'notas_emitidas' : 'revisar')
  const [docs, setDocs] = useState<Documento[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [fila, setFila] = useState<string[]>([])
  const [revisar, setRevisar] = useState<Documento | null>(null)
  const [arrastando, setArrastando] = useState(false)
  const processando = useRef(false)
  const tentados = useRef<Set<string>>(new Set())

  const carregar = useCallback(async () => {
    if (filtro === 'notas_emitidas') return
    let q = supabase.from('documentos_financeiros').select('*')
    if (filtro === 'revisar') q = q.eq('revisado', false)
    else if (filtro === 'recebidos') q = q.eq('direcao', 'recebido').neq('tipo', 'comprovante')
    else if (filtro === 'emitidos') q = q.eq('direcao', 'emitido').neq('tipo', 'comprovante')
    else if (filtro === 'comprovantes') q = q.eq('tipo', 'comprovante')
    const { data, error } = await q.order('created_at', { ascending: false }).limit(300)
    if (error) setErro(error.message)
    setDocs(data ?? [])
    // Documentos que ficaram sem leitura (ex.: saiu da aba no meio da fila) voltam para a fila uma vez.
    const parados = (data ?? []).filter(
      (d) =>
        !tentados.current.has(d.id) &&
        (d.status_ia === 'pendente' || (d.status_ia === 'processando' && Date.now() - new Date(d.updated_at).getTime() > 3 * 60000)),
    )
    if (parados.length) {
      parados.forEach((d) => tentados.current.add(d.id))
      setFila((q) => [...q, ...parados.map((d) => d.id).filter((id) => !q.includes(id))])
    }
  }, [filtro])

  useEffect(() => {
    carregar()
  }, [carregar, versao])

  // Lê um documento por vez (plano gratuito da IA tem limite por minuto).
  useEffect(() => {
    if (processando.current || !fila.length) return
    processando.current = true
    const id = fila[0]
    invocarIA('ler_documento', { documento_id: id })
      .catch((e) => setErro(`Leitura falhou: ${erroMsg(e)}`))
      .finally(() => {
        processando.current = false
        setFila((f) => f.slice(1))
        carregar()
      })
  }, [fila, carregar])

  async function subir(files: FileList | File[]) {
    setErro(null)
    const lista = Array.from(files)
    const novos: string[] = []
    for (const f of lista) {
      try {
        const d = await enviarDocumento(f)
        novos.push(d.id)
      } catch (e) {
        setErro(erroMsg(e))
      }
    }
    if (novos.length) {
      novos.forEach((id) => tentados.current.add(id))
      setFiltro('revisar')
      setFila((q) => [...q, ...novos])
      carregar()
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setArrastando(true)
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault()
          setArrastando(false)
          if (e.dataTransfer.files?.length) subir(e.dataTransfer.files)
        }}
        className="rounded-2xl border-2 border-dashed p-5 flex flex-col md:flex-row items-center gap-3 justify-between"
        style={{ borderColor: arrastando ? 'var(--rbr-gold)' : 'var(--rbr-border)', background: arrastando ? '#FBF6EC' : '#FAFBFD' }}
      >
        <div className="text-sm">
          <div className="font-bold text-[color:var(--rbr-navy-dark)]">Solte aqui notas, boletos, faturas, guias e comprovantes</div>
          <div className="text-xs text-[color:var(--rbr-muted)] mt-0.5">
            PDF, XML ou foto. A IA identifica o que é, quem cobra, valor, vencimento e linha digitável, acha o fornecedor e a operação, sugere a categoria e avisa se
            já foi lançado. Você só confere e confirma.
          </div>
        </div>
        <label className="text-xs font-bold px-4 py-2.5 rounded-lg cursor-pointer whitespace-nowrap" style={{ background: 'var(--rbr-navy)', color: '#fff' }}>
          Escolher arquivos
          <input
            type="file"
            multiple
            accept=".pdf,.xml,image/*"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) subir(e.target.files)
              e.target.value = ''
            }}
          />
        </label>
      </div>
      {fila.length > 0 && <Aviso tipo="info">IA lendo {fila.length} documento(s)… pode continuar usando o sistema.</Aviso>}

      <Chips
        opcoes={[
          { valor: 'revisar', label: 'Para revisar' },
          { valor: 'recebidos', label: 'Recebidos (fornecedores)' },
          { valor: 'emitidos', label: 'Emitidos pela RBR' },
          { valor: 'comprovantes', label: 'Comprovantes' },
          { valor: 'notas_emitidas', label: 'CT-e / NFS-e das operações' },
          { valor: 'todos', label: 'Todos' },
        ]}
        valor={filtro}
        onChange={setFiltro}
      />
      {erro && (
        <Aviso onFechar={() => setErro(null)}>
          {erro}
        </Aviso>
      )}

      {filtro === 'notas_emitidas' ? (
        <NotasEmitidas versao={versao} />
      ) : !docs ? (
        <Carregando />
      ) : docs.length === 0 ? (
        <Card>
          <Vazio>{filtro === 'revisar' ? 'Tudo revisado.' : 'Nenhum documento.'}</Vazio>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {docs.map((d) => {
            const s = (d.sugestao ?? {}) as Sugestao
            const naFila = fila.includes(d.id)
            const lendo = naFila || d.status_ia === 'processando' || d.status_ia === 'pendente'
            const parado = lendo && !naFila
            return (
              <div key={d.id} className="bg-white border rounded-xl px-3.5 py-3 flex items-center gap-3 flex-wrap" style={{ borderColor: 'var(--rbr-border)' }}>
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10.5px] font-bold uppercase tracking-wide px-2 py-0.5 rounded" style={{ background: 'var(--rbr-muted-bg)' }}>
                      {TIPO_DOC_LABEL[d.tipo] ?? d.tipo}
                    </span>
                    <span className="text-sm font-semibold truncate max-w-[360px]">{d.descricao ?? d.arquivo_nome}</span>
                    {d.revisado && <Pill situacao="pago" texto="Tratado" />}
                  </div>
                  <div className="text-xs text-[color:var(--rbr-muted)] mt-0.5">
                    {parado
                      ? 'Leitura não concluída — toque em “Ler de novo”.'
                      : lendo
                      ? 'IA lendo…'
                      : d.status_ia === 'erro'
                        ? `Não consegui ler: ${d.erro_ia ?? ''}`
                        : [d.emitente_nome, d.valor != null ? brl(Number(d.valor)) : null, d.data_vencimento ? `vence ${fmtData(d.data_vencimento)}` : null]
                            .filter(Boolean)
                            .join(' · ')}
                  </div>
                  {!lendo && !d.revisado && s.acao && <div className="text-[11px] mt-0.5" style={{ color: 'var(--rbr-gold)' }}>Sugestão: {ACAO_DOC_LABEL[s.acao] ?? s.acao}</div>}
                  {!lendo && (s.alertas?.length ?? 0) > 0 && !d.revisado && (
                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--rbr-danger)' }}>
                      ⚠ {s.alertas![0]}
                      {s.alertas!.length > 1 ? ` (+${s.alertas!.length - 1})` : ''}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  {d.arquivo_path && (
                    <Botao variante="fantasma" onClick={() => abrirArquivo(d.arquivo_path!).catch((e) => setErro(erroMsg(e)))}>
                      Abrir
                    </Botao>
                  )}
                  {(d.status_ia === 'erro' || parado) && (
                    <Botao variante="secundario" onClick={() => setFila((q) => (q.includes(d.id) ? q : [...q, d.id]))}>
                      Ler de novo
                    </Botao>
                  )}
                  {!lendo && d.status_ia !== 'erro' && (
                    <Botao variante={d.revisado ? 'secundario' : 'primario'} onClick={() => setRevisar(d)}>
                      {d.revisado ? 'Ver' : 'Revisar'}
                    </Botao>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {revisar && (
        <RevisaoDocumento
          doc={revisar}
          apoio={apoio}
          onFechar={() => setRevisar(null)}
          onFeito={() => {
            setRevisar(null)
            carregar()
            onMudou()
          }}
          onReler={() => {
            setFila((q) => [...q, revisar.id])
            setRevisar(null)
          }}
        />
      )}
    </div>
  )
}

function RevisaoDocumento({ doc, apoio, onFechar, onFeito, onReler }: { doc: Documento; apoio: Apoio; onFechar: () => void; onFeito: () => void; onReler: () => void }) {
  const s = (doc.sugestao ?? {}) as Sugestao
  const [acao, setAcao] = useState(s.acao ?? 'criar_lancamento')
  const [candidato, setCandidato] = useState(s.candidatos?.[0]?.lancamento_id ?? '')
  const [form, setForm] = useState<null | { pago: boolean }>(null)
  const [baixa, setBaixa] = useState<Lancamento | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [fornecedorCriado, setFornecedorCriado] = useState<string | null>(null)
  const lanc = { ...(s.lancamento ?? {}) }
  if (fornecedorCriado) lanc.fornecedor_id = fornecedorCriado
  const tipoLanc: TipoLanc = s.tipo_lancamento ?? 'pagar'

  async function executar() {
    setErro(null)
    setSalvando(true)
    try {
      if (acao === 'criar_lancamento' || acao === 'criar_lancamento_pago') {
        setForm({ pago: acao === 'criar_lancamento_pago' })
        return
      }
      if (acao === 'vincular_lancamento') {
        if (!candidato) throw new Error('Escolha o lançamento.')
        const { error } = await supabase.rpc('vincular_documento_lancamento', { p_documento: doc.id, p_lancamento: candidato, p_atualizar: true })
        if (error) throw new Error(error.message)
        onFeito()
        return
      }
      if (acao === 'baixar_lancamento') {
        if (!candidato) throw new Error('Escolha o lançamento.')
        const { data, error } = await supabase.from('v_lancamentos').select('*').eq('id', candidato).single()
        if (error) throw new Error(error.message)
        setBaixa(data)
        return
      }
      if (acao === 'nota_emitida') {
        const alvos = candidato === '__todos' || !candidato ? (s.candidatos ?? []).map((c) => c.lancamento_id) : [candidato]
        if (!alvos.length) throw new Error('Não achei o recebível desta nota. Escolha "Criar" para lançar a receita ou "Só arquivar".')
        for (const id of alvos) {
          const { error } = await supabase.rpc('vincular_documento_lancamento', { p_documento: doc.id, p_lancamento: id, p_atualizar: false })
          if (error) throw new Error(error.message)
        }
        onFeito()
        return
      }
      // arquivar / importar_extrato
      const { error } = await supabase.from('documentos_financeiros').update({ revisado: true, revisado_em: new Date().toISOString() }).eq('id', doc.id)
      if (error) throw new Error(error.message)
      onFeito()
    } catch (e) {
      setErro(erroMsg(e))
    } finally {
      setSalvando(false)
    }
  }

  async function cadastrarFornecedor() {
    setErro(null)
    const docNum = (doc.emitente_documento ?? '').replace(/\D/g, '')
    if (!doc.emitente_nome) return setErro('A IA não leu o nome do emitente.')
    const { data, error } = await supabase
      .from('fornecedores')
      .insert({
        nome: doc.emitente_nome,
        razao_social: doc.emitente_nome,
        tipo_pessoa_doc: docNum.length === 11 ? 'PF' : 'PJ',
        cnpj: docNum.length === 14 ? docNum : null,
        cpf: docNum.length === 11 ? docNum : null,
        categoria_id: lanc.categoria_id ?? null,
      })
      .select('id')
      .single()
    if (error) return setErro(error.message)
    setFornecedorCriado(data.id)
    await supabase.from('documentos_financeiros').update({ fornecedor_id: data.id }).eq('id', doc.id)
  }

  const opcoes: string[] =
    tipoLanc === 'receber' && doc.direcao === 'emitido'
      ? ['nota_emitida', 'criar_lancamento', 'arquivar']
      : doc.tipo === 'comprovante'
        ? ['baixar_lancamento', 'criar_lancamento_pago', 'arquivar']
        : doc.tipo === 'extrato'
          ? ['importar_extrato', 'arquivar']
          : ['vincular_lancamento', 'criar_lancamento', 'criar_lancamento_pago', 'arquivar']
  const precisaCandidato = acao === 'vincular_lancamento' || acao === 'baixar_lancamento' || acao === 'nota_emitida'

  return (
    <>
      <Modal titulo={`${TIPO_DOC_LABEL[doc.tipo] ?? 'Documento'}${doc.numero ? ` nº ${doc.numero}` : ''}`} onFechar={onFechar} largura="max-w-3xl">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            ['Emitente', `${doc.emitente_nome ?? '—'}${doc.emitente_documento ? ` (${doc.emitente_documento})` : ''}`],
            ['Destinatário', doc.destinatario_nome ?? '—'],
            ['Valor', doc.valor != null ? brl(Number(doc.valor)) : '—'],
            ['Vencimento', fmtData(doc.data_vencimento)],
            ['Emissão', fmtData(doc.data_emissao)],
            ['Categoria sugerida', apoio.categorias.find((c) => c.id === (lanc.categoria_id ?? doc.categoria_id))?.nome ?? '—'],
            ['Por que', s.categoria_origem ? `${s.categoria_origem}${s.categoria_motivo ? ` — ${s.categoria_motivo}` : ''}` : '—'],
            ['Contraparte no cadastro', s.contraparte?.nome ?? (fornecedorCriado ? 'cadastrado agora' : 'não encontrada')],
          ].map(([k, v]) => (
            <div key={k} className="min-w-0">
              <div className="text-[10.5px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">{k}</div>
              <div className="text-sm break-words">{v}</div>
            </div>
          ))}
        </div>
        {(lanc.parcelas?.length ?? 0) > 1 && (
          <div className="text-xs">
            Parcelas: {lanc.parcelas!.map((p, i) => `${i + 1}ª ${fmtData(p.vencimento)} ${brl(p.valor)}`).join(' · ')}
          </div>
        )}
        {(s.alertas ?? []).map((a, i) => (
          <Aviso key={i} tipo="atencao">
            {a}
          </Aviso>
        ))}
        {!s.contraparte && !fornecedorCriado && tipoLanc === 'pagar' && doc.emitente_documento && doc.tipo !== 'comprovante' && (
          <Botao variante="secundario" onClick={cadastrarFornecedor} className="self-start">
            Cadastrar “{doc.emitente_nome}” como fornecedor
          </Botao>
        )}

        {!doc.revisado && (
          <>
            <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">O que fazer</div>
            <div className="flex flex-col gap-1.5">
              {opcoes.map((o) => (
                <label key={o} className="flex items-center gap-2 text-sm">
                  <input type="radio" checked={acao === o} onChange={() => setAcao(o)} />
                  {o === 'arquivar' ? 'Só arquivar (já está tratado)' : o === 'criar_lancamento' && tipoLanc === 'receber' ? 'Criar conta a receber' : ACAO_DOC_LABEL[o] ?? o}
                  {o === s.acao && <span className="text-[10.5px] font-bold" style={{ color: 'var(--rbr-gold)' }}>sugerido</span>}
                </label>
              ))}
            </div>
            {precisaCandidato && (
              <div className="flex flex-col gap-1.5">
                {(s.candidatos ?? []).length === 0 && <div className="text-xs text-[color:var(--rbr-muted)]">Nenhum lançamento em aberto combina com este documento.</div>}
                {acao === 'nota_emitida' && (s.candidatos ?? []).length > 1 && (
                  <label className="flex items-center gap-2 text-xs">
                    <input type="radio" checked={candidato === '__todos'} onChange={() => setCandidato('__todos')} /> Todos os recebíveis da operação
                  </label>
                )}
                {(s.candidatos ?? []).map((c) => (
                  <label key={c.lancamento_id} className="flex items-center gap-2 text-xs border rounded-lg px-3 py-2 cursor-pointer" style={{ borderColor: 'var(--rbr-border)' }}>
                    <input type="radio" checked={candidato === c.lancamento_id} onChange={() => setCandidato(c.lancamento_id)} />
                    <span className="flex-1 truncate">
                      {c.contraparte ?? '—'} · {c.descricao}
                    </span>
                    <span className="tabular-nums">{fmtData(c.data_vencimento)}</span>
                    <span className="tabular-nums font-semibold">{brl(Number(c.saldo_aberto))}</span>
                    <span className="text-[10px] text-[color:var(--rbr-muted)]">{Math.round(Number(c.score))}%</span>
                  </label>
                ))}
              </div>
            )}
          </>
        )}
        {erro && <Aviso>{erro}</Aviso>}
        <div className="flex justify-between gap-2 flex-wrap">
          <div className="flex gap-2">
            {doc.arquivo_path && (
              <Botao variante="secundario" onClick={() => abrirArquivo(doc.arquivo_path!).catch((e) => setErro(erroMsg(e)))}>
                Abrir arquivo
              </Botao>
            )}
            <Botao variante="fantasma" onClick={onReler}>
              Ler de novo com IA
            </Botao>
          </div>
          {!doc.revisado && (
            <Botao onClick={executar} disabled={salvando}>
              {salvando ? 'Aplicando…' : 'Confirmar'}
            </Botao>
          )}
        </div>
      </Modal>
      {form && (
        <LancamentoForm
          tipoInicial={tipoLanc}
          apoio={apoio}
          inicial={lanc}
          documentoIds={[doc.id]}
          jaPagoInicial={form.pago}
          onFechar={() => setForm(null)}
          onSalvo={onFeito}
        />
      )}
      {baixa && (
        <BaixaModal
          lancamentos={[baixa]}
          apoio={apoio}
          comprovante={{ documento_id: doc.id, data: lanc.data_pagamento ?? null, valor: lanc.valor_total ?? null }}
          onFechar={() => setBaixa(null)}
          onFeito={onFeito}
        />
      )}
    </>
  )
}

interface NotaOp {
  id: string
  tipo: string
  numero_documento: string | null
  emitido_em: string | null
  arquivo_path: string | null
  conferencia_status: string | null
  conferencia_resultado: { extraido?: { valor_principal?: number | null } } | null
  operacao_id: string
  operacoes: { status: string; clientes: { razao_social: string | null; nome_fantasia: string | null } | null; cotacoes: { cidade_origem: string | null; uf_origem: string | null; cidade_destino: string | null; uf_destino: string | null; valor_total: number | null } | null } | null
}

function NotasEmitidas({ versao }: { versao: number }) {
  const [notas, setNotas] = useState<NotaOp[] | null>(null)
  const [receb, setReceb] = useState<Record<string, { aberto: number; pago: number; situacao: string }>>({})
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const { data, error } = await supabase
        .from('documentacao_operacao')
        .select(
          'id, tipo, numero_documento, emitido_em, arquivo_path, conferencia_status, conferencia_resultado, operacao_id, operacoes(status, clientes(razao_social, nome_fantasia), cotacoes(cidade_origem, uf_origem, cidade_destino, uf_destino, valor_total))',
        )
        .in('tipo', ['cte', 'nfse'])
        .not('arquivo_path', 'is', null)
        .order('emitido_em', { ascending: false, nullsFirst: false })
        .limit(300)
      if (error) setErro(error.message)
      const lista = (data ?? []) as unknown as NotaOp[]
      setNotas(lista)
      const ops = [...new Set(lista.map((n) => n.operacao_id))]
      if (ops.length) {
        const { data: ls } = await supabase.from('v_lancamentos').select('operacao_id, saldo_aberto, valor_pago, situacao, status').eq('tipo', 'receber').neq('status', 'cancelado').in('operacao_id', ops)
        const m: Record<string, { aberto: number; pago: number; situacao: string }> = {}
        for (const l of ls ?? []) {
          const k = l.operacao_id!
          m[k] ??= { aberto: 0, pago: 0, situacao: 'pago' }
          if (l.status !== 'pago') m[k].aberto += Number(l.saldo_aberto ?? 0)
          m[k].pago += Number(l.valor_pago ?? 0)
          if (l.situacao === 'vencido') m[k].situacao = 'vencido'
          else if (l.status !== 'pago' && m[k].situacao !== 'vencido') m[k].situacao = l.situacao ?? 'a_vencer'
        }
        setReceb(m)
      }
    })()
  }, [versao])

  async function abrir(path: string) {
    const { data, error } = await supabase.storage.from('operacao-documentos').createSignedUrl(path, 300)
    if (error || !data) return setErro(error?.message ?? 'Não abriu.')
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  if (!notas) return <Carregando />
  if (!notas.length)
    return (
      <Card>
        <Vazio>Nenhum CT-e/NFS-e anexado nas operações ainda.</Vazio>
      </Card>
    )
  return (
    <Card className="!p-0 overflow-hidden">
      {erro && <Aviso>{erro}</Aviso>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10.5px] uppercase tracking-wide text-[color:var(--rbr-muted)] border-b" style={{ borderColor: 'var(--rbr-border)' }}>
              <th className="p-3">Nota</th>
              <th className="p-3">Cliente / rota</th>
              <th className="p-3 text-right">Valor na nota</th>
              <th className="p-3">Recebimento</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {notas.map((n) => {
              const c = n.operacoes?.cotacoes
              const r = receb[n.operacao_id]
              const valorNota = n.conferencia_resultado?.extraido?.valor_principal ?? null
              return (
                <tr key={n.id} className="border-b last:border-b-0" style={{ borderColor: 'var(--rbr-border)' }}>
                  <td className="p-3">
                    <div className="font-semibold">
                      {n.tipo === 'cte' ? 'CT-e' : 'NFS-e'} {n.numero_documento ?? ''}
                    </div>
                    <div className="text-[10.5px] text-[color:var(--rbr-muted)]">{n.emitido_em ? new Date(n.emitido_em).toLocaleDateString('pt-BR') : 'sem data'}</div>
                  </td>
                  <td className="p-3">
                    <div className="truncate max-w-[240px]">{n.operacoes?.clientes?.nome_fantasia ?? n.operacoes?.clientes?.razao_social ?? '—'}</div>
                    <div className="text-[10.5px] text-[color:var(--rbr-muted)]">{c ? `${c.cidade_origem}/${c.uf_origem} → ${c.cidade_destino}/${c.uf_destino}` : ''}</div>
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    {valorNota != null ? brl(valorNota) : '—'}
                    {valorNota != null && c?.valor_total != null && Math.abs(valorNota - Number(c.valor_total)) > 0.01 && (
                      <div className="text-[10.5px]" style={{ color: 'var(--rbr-danger)' }}>
                        cotação {brl(Number(c.valor_total))}
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    {r ? (
                      <div className="flex flex-col gap-0.5">
                        <Pill situacao={r.aberto > 0.004 ? r.situacao : 'pago'} />
                        {r.aberto > 0.004 && <span className="text-[10.5px] text-[color:var(--rbr-muted)]">falta {brl(r.aberto)}</span>}
                      </div>
                    ) : (
                      <span className="text-xs text-[color:var(--rbr-muted)]">sem recebível</span>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    {n.arquivo_path && (
                      <Botao variante="fantasma" onClick={() => abrir(n.arquivo_path!)}>
                        Abrir
                      </Botao>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
