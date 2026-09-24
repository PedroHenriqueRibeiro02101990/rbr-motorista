import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import type { Json } from '@rbr/shared/database.types'
import {
  type Apoio,
  type ExtratoItem,
  type ItemExtrato,
  type Lancamento,
  brl,
  enviarDocumento,
  erroMsg,
  fmtData,
  hojeISO,
  invocarIA,
  parseCSV,
  parseValor,
  parseOFX,
} from '../../lib/financeiro'
import { Aviso, Botao, Campo, Card, Carregando, Chips, Modal, Vazio, inputClass, inputStyle } from './ui'
import { OpcoesCategoria } from './CategoriaOpcoes'

interface Candidato {
  lancamento_id: string
  descricao: string
  contraparte: string | null
  valor: number
  vencimento: string
  score: number
}
interface SugestaoItem {
  candidatos?: Candidato[]
  regra?: { categoria_id: string | null; fornecedor_id: string | null; contraparte_nome: string | null; padrao: string } | null
  ia?: {
    categoria_id: string | null
    categoria_nome: string | null
    contraparte: string | null
    descricao: string | null
    transferencia_entre_contas: boolean
    lancamento_id: string | null
    lancamento_descricao: string | null
    confianca: string
  } | null
}

export default function Conciliacao({ apoio, versao, onMudou }: { apoio: Apoio; versao: number; onMudou: () => void }) {
  const contasAtivas = apoio.contas.filter((c) => c.ativa)
  const [conta, setConta] = useState(contasAtivas.find((c) => c.padrao)?.id ?? contasAtivas[0]?.id ?? '')
  const [status, setStatus] = useState<'pendente' | 'conciliado' | 'ignorado'>('pendente')
  const [itens, setItens] = useState<ExtratoItem[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [importando, setImportando] = useState(false)
  const [previa, setPrevia] = useState<{ itens: ItemExtrato[]; saldo: number | null; arquivo: string; formato: 'ofx' | 'csv' | 'pdf' } | null>(null)
  const [tratar, setTratar] = useState<ExtratoItem | null>(null)
  const [iaRodando, setIaRodando] = useState(false)
  const [lote, setLote] = useState(false)
  const contaInfo = apoio.contas.find((c) => c.id === conta)

  const carregar = useCallback(async () => {
    if (!conta) return
    const { data, error } = await supabase
      .from('extrato_itens')
      .select('*')
      .eq('conta_bancaria_id', conta)
      .eq('status', status)
      .order('data', { ascending: status !== 'pendente' ? false : true })
      .limit(500)
    if (error) setErro(error.message)
    setItens(data ?? [])
  }, [conta, status])
  useEffect(() => {
    carregar()
  }, [carregar, versao])

  async function lerArquivo(file: File) {
    setErro(null)
    setOk(null)
    const nome = file.name.toLowerCase()
    try {
      if (nome.endsWith('.ofx')) {
        const t = await file.text()
        const r = parseOFX(t)
        if (!r.itens.length) throw new Error('Não encontrei movimentações neste OFX.')
        setPrevia({ itens: r.itens, saldo: r.saldoFinal, arquivo: file.name, formato: 'ofx' })
      } else if (nome.endsWith('.csv') || nome.endsWith('.txt')) {
        const buf = await file.arrayBuffer()
        let t = new TextDecoder('utf-8').decode(buf)
        if (t.includes('�')) t = new TextDecoder('windows-1252').decode(buf)
        const r = parseCSV(t)
        if (r.erro) throw new Error(r.erro)
        if (!r.itens.length) throw new Error('Não encontrei movimentações neste CSV.')
        setPrevia({ itens: r.itens, saldo: null, arquivo: file.name, formato: 'csv' })
      } else {
        setImportando(true)
        const doc = await enviarDocumento(file, { tipo: 'extrato', direcao: 'recebido', revisado: true })
        const r = await invocarIA<{ transacoes: ItemExtrato[]; saldo_final: number | null }>('ler_extrato_pdf', { arquivo_path: doc.arquivo_path })
        if (!r.transacoes?.length) throw new Error('A IA não encontrou movimentações neste PDF.')
        setPrevia({ itens: r.transacoes, saldo: r.saldo_final, arquivo: file.name, formato: 'pdf' })
      }
    } catch (e) {
      setErro(erroMsg(e))
    } finally {
      setImportando(false)
    }
  }

  async function importar() {
    if (!previa || !conta) return
    setImportando(true)
    setErro(null)
    const { data, error } = await supabase.rpc('importar_extrato', {
      p_conta: conta,
      p_formato: previa.formato,
      p_arquivo: previa.arquivo,
      p_saldo_final: previa.saldo as unknown as number,
      p_itens: previa.itens as unknown as Json,
    })
    setImportando(false)
    if (error) return setErro(error.message)
    const r = data as { importados: number; repetidos: number; extrato_id: string }
    setPrevia(null)
    setOk(`${r.importados} movimentação(ões) importada(s)${r.repetidos ? `, ${r.repetidos} já existiam (ignoradas)` : ''}. O sistema já sugeriu os pares.`)
    setStatus('pendente')
    await carregar()
    onMudou()
    // Deixa a IA classificar o que ficou sem par
    if (r.importados > 0) {
      setIaRodando(true)
      invocarIA('classificar_extrato', { extrato_id: r.extrato_id })
        .then(() => carregar())
        .catch((e) => setErro(`IA: ${erroMsg(e)}`))
        .finally(() => setIaRodando(false))
    }
  }

  async function pedirIA() {
    const ids = [...new Set((itens ?? []).map((i) => i.extrato_id))]
    setIaRodando(true)
    setErro(null)
    try {
      for (const id of ids) await invocarIA('classificar_extrato', { extrato_id: id })
      await carregar()
    } catch (e) {
      setErro(erroMsg(e))
    } finally {
      setIaRodando(false)
    }
  }

  const fortes = useMemo(
    () =>
      (itens ?? []).filter((i) => {
        const s = (i.sugestao ?? {}) as SugestaoItem
        const c = s.candidatos?.[0]
        return i.status === 'pendente' && c && c.score >= 85 && (s.candidatos!.length === 1 || s.candidatos![1].score < c.score - 10)
      }),
    [itens],
  )

  async function confirmarFortes() {
    setLote(true)
    setErro(null)
    const falhas: string[] = []
    for (const i of fortes) {
      const c = ((i.sugestao ?? {}) as SugestaoItem).candidatos![0]
      const { error } = await supabase.rpc('conciliar_extrato_item', { p_item: i.id, p_lancamento: c.lancamento_id })
      if (error) falhas.push(`${i.descricao}: ${error.message}`)
    }
    setLote(false)
    if (falhas.length) setErro(falhas.join('\n'))
    else setOk(`${fortes.length} conciliação(ões) confirmada(s).`)
    carregar()
    onMudou()
  }

  // Compara com o saldo do sistema NA DATA do extrato (o que foi pago depois não entra).
  const [saldoNaData, setSaldoNaData] = useState<number | null>(null)
  useEffect(() => {
    const d = contaInfo?.ultimo_extrato_em
    setSaldoNaData(null)
    if (!d || !conta) return
    if (d >= hojeISO()) {
      setSaldoNaData(Number(contaInfo?.saldo_atual ?? 0))
      return
    }
    supabase.rpc('fluxo_caixa', { p_de: d, p_ate: d, p_conta: conta }).then(({ data }) => {
      const linha = (data ?? [])[0] as { saldo: number } | undefined
      if (linha) setSaldoNaData(Number(linha.saldo))
    })
  }, [conta, contaInfo?.ultimo_extrato_em, contaInfo?.saldo_atual, versao])
  const diferenca = contaInfo?.ultimo_saldo_extrato != null && saldoNaData != null ? saldoNaData - Number(contaInfo.ultimo_saldo_extrato) : null

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <div className="grid grid-cols-1 md:grid-cols-[240px_1fr_auto] gap-3 items-end">
          <Campo label="Conta">
            <select value={conta} onChange={(e) => setConta(e.target.value)} className={inputClass} style={inputStyle}>
              {contasAtivas.map((c) => (
                <option key={c.id!} value={c.id!}>
                  {c.nome}
                </option>
              ))}
            </select>
          </Campo>
          <div className="text-xs flex flex-col gap-0.5">
            <span>
              Saldo no sistema: <b className="tabular-nums">{brl(Number(contaInfo?.saldo_atual ?? 0))}</b>
            </span>
            {contaInfo?.ultimo_saldo_extrato != null && (
              <span>
                Saldo no último extrato ({fmtData(contaInfo.ultimo_extrato_em)}): <b className="tabular-nums">{brl(Number(contaInfo.ultimo_saldo_extrato))}</b>
                {diferenca != null && Math.abs(diferenca) > 0.009 && (
                  <span style={{ color: 'var(--rbr-danger)' }}>
                    {' '}
                    · sistema nessa data {brl(saldoNaData)} · diferença {brl(diferenca)} (concilie os itens pendentes ou ajuste o saldo inicial)
                  </span>
                )}
              </span>
            )}
          </div>
          <label className="text-xs font-bold px-4 py-2.5 rounded-lg cursor-pointer text-center" style={{ background: 'var(--rbr-navy)', color: '#fff' }}>
            {importando ? 'Lendo…' : 'Importar extrato (OFX, CSV ou PDF)'}
            <input
              type="file"
              accept=".ofx,.csv,.txt,.pdf,image/*"
              className="hidden"
              disabled={importando}
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) lerArquivo(f)
              }}
            />
          </label>
        </div>
        <div className="text-[11px] text-[color:var(--rbr-muted)] mt-2">
          Baixe o extrato no app/site do banco (OFX é o melhor; CSV e PDF também servem). O sistema junta cada movimentação com a conta a pagar/receber certa; o que
          sobrar, a IA classifica (tarifa, transferência, etc.). Nada é baixado sem você confirmar.
        </div>
      </Card>

      {ok && (
        <Aviso tipo="ok" onFechar={() => setOk(null)}>
          {ok}
        </Aviso>
      )}
      {erro && (
        <Aviso onFechar={() => setErro(null)}>
          {erro}
        </Aviso>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Chips
          opcoes={[
            { valor: 'pendente', label: 'Pendentes', qtd: status === 'pendente' ? itens?.length : undefined },
            { valor: 'conciliado', label: 'Conciliados' },
            { valor: 'ignorado', label: 'Ignorados' },
          ]}
          valor={status}
          onChange={setStatus}
        />
        {status === 'pendente' && (itens?.length ?? 0) > 0 && (
          <div className="flex gap-2 flex-wrap">
            {fortes.length > 0 && (
              <Botao onClick={confirmarFortes} disabled={lote}>
                {lote ? 'Confirmando…' : `Confirmar ${fortes.length} par(es) certeiro(s)`}
              </Botao>
            )}
            <Botao variante="ouro" onClick={pedirIA} disabled={iaRodando}>
              {iaRodando ? 'IA analisando…' : 'Pedir ajuda à IA'}
            </Botao>
          </div>
        )}
      </div>

      {!itens ? (
        <Carregando />
      ) : itens.length === 0 ? (
        <Card>
          <Vazio>{status === 'pendente' ? 'Nada pendente nesta conta.' : 'Nada aqui.'}</Vazio>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {itens.map((i) => {
            const s = (i.sugestao ?? {}) as SugestaoItem
            const c = s.candidatos?.[0]
            const cat = s.regra?.categoria_id ? apoio.categorias.find((x) => x.id === s.regra!.categoria_id)?.nome : null
            return (
              <div key={i.id} className="bg-white border rounded-xl px-3.5 py-3 flex items-center gap-3 flex-wrap" style={{ borderColor: 'var(--rbr-border)' }}>
                <div className="w-20 text-xs tabular-nums text-[color:var(--rbr-muted)]">{fmtData(i.data)}</div>
                <div className="flex-1 min-w-[200px]">
                  <div className="text-sm truncate">{i.descricao}</div>
                  {i.status === 'pendente' && (
                    <div className="text-[11px] mt-0.5">
                      {c ? (
                        <span style={{ color: c.score >= 85 ? 'var(--rbr-positive)' : '#8A5A00' }}>
                          Par sugerido ({Math.round(c.score)}%): {c.contraparte ?? ''} · {c.descricao} · venc. {fmtData(c.vencimento)}
                        </span>
                      ) : cat ? (
                        <span style={{ color: 'var(--rbr-navy)' }}>Regra aprendida: {cat}</span>
                      ) : s.ia ? (
                        <span style={{ color: 'var(--rbr-gold)' }}>
                          IA ({s.ia.confianca}):{' '}
                          {s.ia.transferencia_entre_contas
                            ? 'transferência entre contas'
                            : s.ia.lancamento_descricao
                              ? `paga "${s.ia.lancamento_descricao}"`
                              : `${s.ia.categoria_nome ?? 'sem categoria'}${s.ia.contraparte ? ` · ${s.ia.contraparte}` : ''}`}
                        </span>
                      ) : (
                        <span className="text-[color:var(--rbr-muted)]">Sem par encontrado</span>
                      )}
                    </div>
                  )}
                  {i.status === 'ignorado' && i.ignorado_motivo && <div className="text-[11px] text-[color:var(--rbr-muted)]">Ignorado: {i.ignorado_motivo}</div>}
                </div>
                <div className="tabular-nums font-semibold text-sm" style={{ color: Number(i.valor) < 0 ? 'var(--rbr-danger)' : 'var(--rbr-positive)' }}>
                  {brl(Number(i.valor))}
                </div>
                {i.status === 'pendente' && (
                  <div className="flex gap-2">
                    {c && (
                      <Botao
                        onClick={async () => {
                          const { error } = await supabase.rpc('conciliar_extrato_item', { p_item: i.id, p_lancamento: c.lancamento_id })
                          if (error) setErro(error.message)
                          carregar()
                          onMudou()
                        }}
                      >
                        Confirmar par
                      </Botao>
                    )}
                    <Botao variante="secundario" onClick={() => setTratar(i)}>
                      {c ? 'Outro' : 'Tratar'}
                    </Botao>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {previa && (
        <Modal titulo={`Importar ${previa.arquivo}`} onFechar={() => setPrevia(null)}>
          <div className="text-xs">
            {previa.itens.length} movimentação(ões) de {fmtData(previa.itens.map((x) => x.data).sort()[0])} a {fmtData(previa.itens.map((x) => x.data).sort().pop())}
            {previa.saldo != null && ` · saldo final ${brl(previa.saldo)}`} · conta <b>{contaInfo?.nome}</b>
          </div>
          <div className="max-h-72 overflow-y-auto flex flex-col gap-1">
            {previa.itens.slice(0, 200).map((x, k) => (
              <div key={k} className="flex gap-2 text-xs border-b py-1" style={{ borderColor: 'var(--rbr-border)' }}>
                <span className="w-20 tabular-nums">{fmtData(x.data)}</span>
                <span className="flex-1 truncate">{x.descricao}</span>
                <span className="tabular-nums" style={{ color: x.valor < 0 ? 'var(--rbr-danger)' : 'var(--rbr-positive)' }}>
                  {brl(x.valor)}
                </span>
              </div>
            ))}
          </div>
          {previa.formato === 'pdf' && <Aviso tipo="atencao">Lido do PDF pela IA — confira se o total bate com o extrato antes de importar.</Aviso>}
          <div className="flex justify-end gap-2">
            <Botao variante="secundario" onClick={() => setPrevia(null)}>
              Cancelar
            </Botao>
            <Botao onClick={importar} disabled={importando}>
              {importando ? 'Importando…' : 'Importar'}
            </Botao>
          </div>
        </Modal>
      )}
      {tratar && (
        <TratarItem
          item={tratar}
          apoio={apoio}
          onFechar={() => setTratar(null)}
          onFeito={() => {
            setTratar(null)
            carregar()
            onMudou()
          }}
        />
      )}
    </div>
  )
}

function TratarItem({ item, apoio, onFechar, onFeito }: { item: ExtratoItem; apoio: Apoio; onFechar: () => void; onFeito: () => void }) {
  const s = (item.sugestao ?? {}) as SugestaoItem
  const entrada = Number(item.valor) > 0
  const [modo, setModo] = useState<'par' | 'novo' | 'transferencia' | 'ignorar'>(s.ia?.transferencia_entre_contas ? 'transferencia' : s.candidatos?.length || s.ia?.lancamento_id ? 'par' : 'novo')
  const [busca, setBusca] = useState('')
  const [abertos, setAbertos] = useState<Lancamento[]>([])
  const [escolhido, setEscolhido] = useState(s.candidatos?.[0]?.lancamento_id ?? s.ia?.lancamento_id ?? '')
  const [juros, setJuros] = useState('')
  const [categoria, setCategoria] = useState(s.regra?.categoria_id ?? s.ia?.categoria_id ?? '')
  const [descricao, setDescricao] = useState(s.ia?.descricao ?? item.descricao)
  const [contraparte, setContraparte] = useState(s.regra?.contraparte_nome ?? s.ia?.contraparte ?? '')
  const [lembrar, setLembrar] = useState(true)
  const [padrao, setPadrao] = useState(item.descricao.replace(/\d{2}\/\d{2}(\/\d{2,4})?/g, '').replace(/\s+\d+[\d.,-]*\s*$/, '').trim().slice(0, 40).toLowerCase())
  const [outraConta, setOutraConta] = useState(apoio.contas.find((c) => c.ativa && c.id !== item.conta_bancaria_id)?.id ?? '')
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    supabase
      .from('v_lancamentos')
      .select('*')
      .eq('tipo', entrada ? 'receber' : 'pagar')
      .in('status', ['aberto', 'previsto'])
      .order('data_vencimento')
      .limit(400)
      .then(({ data }) => setAbertos(data ?? []))
  }, [entrada])

  const lista = abertos.filter((l) => {
    const t = busca.trim().toLowerCase()
    return !t || [l.descricao, l.contraparte].some((x) => x?.toLowerCase().includes(t))
  })
  const escolhidoL = abertos.find((l) => l.id === escolhido)

  async function confirmar() {
    setErro(null)
    setSalvando(true)
    try {
      if (modo === 'par') {
        if (!escolhido) throw new Error('Escolha o lançamento.')
        const excedente = escolhidoL ? Math.max(0, Math.round((Math.abs(Number(item.valor)) - Number(escolhidoL.saldo_aberto)) * 100) / 100) : 0
        const j = juros.trim() ? parseValor(juros) || 0 : excedente
        const { error } = await supabase.rpc('conciliar_extrato_item', { p_item: item.id, p_lancamento: escolhido, p_juros: j })
        if (error) throw new Error(error.message)
      } else if (modo === 'novo') {
        if (!categoria) throw new Error('Escolha a categoria.')
        const { error } = await supabase.rpc('lancar_extrato_item', {
          p_item: item.id,
          p_categoria: categoria,
          p_descricao: descricao,
          p_contraparte: contraparte || undefined,
          p_lembrar: lembrar,
          p_padrao: lembrar ? padrao : undefined,
        })
        if (error) throw new Error(error.message)
      } else if (modo === 'transferencia') {
        if (!outraConta) throw new Error('Escolha a outra conta.')
        const { error } = await supabase.rpc('transferencia_extrato_item', { p_item: item.id, p_outra_conta: outraConta })
        if (error) throw new Error(error.message)
      } else {
        if (!motivo.trim()) throw new Error('Diga por que ignorar.')
        const { error } = await supabase.from('extrato_itens').update({ status: 'ignorado', ignorado_motivo: motivo.trim() }).eq('id', item.id)
        if (error) throw new Error(error.message)
      }
      onFeito()
    } catch (e) {
      setErro(erroMsg(e))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal titulo={`${entrada ? 'Entrada' : 'Saída'} de ${brl(Math.abs(Number(item.valor)))} em ${fmtData(item.data)}`} onFechar={onFechar}>
      <div className="text-sm rounded-lg px-3 py-2" style={{ background: 'var(--rbr-muted-bg)' }}>
        {item.descricao}
      </div>
      <Chips
        opcoes={[
          { valor: 'par', label: entrada ? 'É recebimento de uma conta a receber' : 'É pagamento de uma conta a pagar' },
          { valor: 'novo', label: 'Lançar agora (ex.: tarifa)' },
          { valor: 'transferencia', label: 'Transferência entre contas' },
          { valor: 'ignorar', label: 'Ignorar' },
        ]}
        valor={modo}
        onChange={setModo}
      />
      {modo === 'par' && (
        <div className="flex flex-col gap-2">
          <input value={busca} onChange={(e) => setBusca(e.target.value)} className={inputClass} style={inputStyle} placeholder="Buscar por nome ou descrição" />
          <div className="max-h-64 overflow-y-auto flex flex-col gap-1">
            {lista.map((l) => (
              <label key={l.id} className="flex items-center gap-2 text-xs border rounded-lg px-3 py-2 cursor-pointer" style={{ borderColor: l.id === escolhido ? 'var(--rbr-navy)' : 'var(--rbr-border)' }}>
                <input type="radio" checked={l.id === escolhido} onChange={() => setEscolhido(l.id!)} />
                <span className="flex-1 truncate">
                  {l.contraparte ?? '—'} · {l.descricao}
                </span>
                <span className="tabular-nums">{fmtData(l.data_vencimento)}</span>
                <span className="tabular-nums font-semibold">{brl(l.saldo_aberto)}</span>
              </label>
            ))}
          </div>
          {escolhidoL && Math.abs(Number(escolhidoL.saldo_aberto) - Math.abs(Number(item.valor))) > 0.009 && (
            <div className="text-[11px]">
              {Math.abs(Number(item.valor)) < Number(escolhidoL.saldo_aberto)
                ? `Pagamento parcial: continua em aberto ${brl(Number(escolhidoL.saldo_aberto) - Math.abs(Number(item.valor)))}.`
                : 'O valor do extrato é maior que o saldo — informe a parte de juros/multa:'}
            </div>
          )}
          {escolhidoL && Math.abs(Number(item.valor)) > Number(escolhidoL.saldo_aberto) + 0.009 && (
            <Campo label="Juros / multa (R$)">
              <input
                inputMode="decimal"
                value={juros}
                onChange={(e) => setJuros(e.target.value)}
                className={inputClass}
                style={inputStyle}
                placeholder={(Math.abs(Number(item.valor)) - Number(escolhidoL.saldo_aberto)).toFixed(2).replace('.', ',')}
              />
            </Campo>
          )}
        </div>
      )}
      {modo === 'novo' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Campo label="Categoria">
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={inputClass} style={inputStyle}>
              <option value="">Escolha…</option>
              <OpcoesCategoria categorias={apoio.categorias} tipo={entrada ? 'receita' : 'despesa'} />
            </select>
          </Campo>
          <Campo label="Contraparte">
            <input value={contraparte} onChange={(e) => setContraparte(e.target.value)} className={inputClass} style={inputStyle} />
          </Campo>
          <Campo label="Descrição" className="md:col-span-2">
            <input value={descricao} onChange={(e) => setDescricao(e.target.value)} className={inputClass} style={inputStyle} />
          </Campo>
          <label className="flex items-center gap-2 text-xs md:col-span-2">
            <input type="checkbox" checked={lembrar} onChange={(e) => setLembrar(e.target.checked)} /> Sempre que o extrato tiver
            <input value={padrao} onChange={(e) => setPadrao(e.target.value)} className="border rounded px-2 py-1 text-xs flex-1" style={inputStyle} />
            usar esta categoria
          </label>
        </div>
      )}
      {modo === 'transferencia' && (
        <Campo label={entrada ? 'Veio da conta' : 'Foi para a conta'}>
          <select value={outraConta} onChange={(e) => setOutraConta(e.target.value)} className={inputClass} style={inputStyle}>
            <option value="">Escolha…</option>
            {apoio.contas
              .filter((c) => c.ativa && c.id !== item.conta_bancaria_id)
              .map((c) => (
                <option key={c.id!} value={c.id!}>
                  {c.nome}
                </option>
              ))}
          </select>
        </Campo>
      )}
      {modo === 'ignorar' && (
        <Campo label="Motivo">
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className={inputClass} style={inputStyle} placeholder="Ex.: estorno do próprio banco no mesmo dia" />
        </Campo>
      )}
      {erro && <Aviso>{erro}</Aviso>}
      <div className="flex justify-end gap-2">
        <Botao variante="secundario" onClick={onFechar}>
          Cancelar
        </Botao>
        <Botao onClick={confirmar} disabled={salvando}>
          {salvando ? 'Salvando…' : 'Confirmar'}
        </Botao>
      </div>
    </Modal>
  )
}
