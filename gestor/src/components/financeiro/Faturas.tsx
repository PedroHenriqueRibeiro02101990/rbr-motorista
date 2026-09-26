import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { lerBoleto } from '@rbr/shared/boleto'
import {
  type Apoio,
  type Fatura,
  type Lancamento,
  brl,
  digitos,
  enviarDocumento,
  erroMsg,
  fmtData,
  hojeISO,
  invocarIA,
  lerParametro,
  nomeCliente,
  whatsappLink,
} from '../../lib/financeiro'
import type { BancoFatura, EmpresaFatura } from '../../lib/faturaPdf'
import { Aviso, Botao, Campo, Card, Carregando, Chips, Modal, Pill, Vazio, inputClass, inputStyle } from './ui'
import { BaixaModal, Copiar } from './LancamentoModais'

type Filtro = 'abertas' | 'vencidas' | 'pagas' | 'canceladas' | 'todas'

export default function Faturas({ apoio, versao, onMudou }: { apoio: Apoio; versao: number; onMudou: () => void }) {
  const [filtro, setFiltro] = useState<Filtro>('abertas')
  const [dados, setDados] = useState<Fatura[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [nova, setNova] = useState(false)
  const [aberta, setAberta] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    let q = supabase.from('v_faturas').select('*')
    if (filtro === 'abertas') q = q.in('situacao', ['aguardando_pagamento', 'vencido'])
    else if (filtro === 'vencidas') q = q.eq('situacao', 'vencido')
    else if (filtro === 'pagas') q = q.eq('situacao', 'pago')
    else if (filtro === 'canceladas') q = q.eq('situacao', 'cancelada')
    const { data, error } = await q.order('data_vencimento', { ascending: filtro === 'abertas' || filtro === 'vencidas' }).limit(500)
    if (error) setErro(error.message)
    setDados(data ?? [])
  }, [filtro])

  useEffect(() => {
    carregar()
  }, [carregar, versao])

  const total = useMemo(() => (dados ?? []).reduce((s, f) => s + Number(f.saldo_aberto ?? 0), 0), [dados])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Chips
          opcoes={[
            { valor: 'abertas', label: 'Em aberto' },
            { valor: 'vencidas', label: 'Vencidas' },
            { valor: 'pagas', label: 'Pagas' },
            { valor: 'canceladas', label: 'Canceladas' },
            { valor: 'todas', label: 'Todas' },
          ]}
          valor={filtro}
          onChange={setFiltro}
        />
        <Botao onClick={() => setNova(true)}>+ Nova fatura</Botao>
      </div>
      <div className="text-[11px] text-[color:var(--rbr-muted)]">
        A fatura junta um ou mais fretes do mesmo cliente num só documento de cobrança (com boleto ou Pix). Cada frete convertido já cria o recebível sozinho — a fatura é
        opcional, para clientes que pagam agrupado.
      </div>
      {erro && <Aviso>{erro}</Aviso>}
      {!dados ? (
        <Carregando />
      ) : dados.length === 0 ? (
        <Card>
          <Vazio>Nenhuma fatura neste filtro.</Vazio>
        </Card>
      ) : (
        <Card className="!p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10.5px] uppercase tracking-wide text-[color:var(--rbr-muted)] border-b" style={{ borderColor: 'var(--rbr-border)' }}>
                  <th className="p-3">Nº</th>
                  <th className="p-3">Cliente</th>
                  <th className="p-3">Vencimento</th>
                  <th className="p-3 text-right">Valor</th>
                  <th className="p-3 text-right hidden md:table-cell">Em aberto</th>
                  <th className="p-3">Situação</th>
                  <th className="p-3 hidden md:table-cell">Enviada</th>
                </tr>
              </thead>
              <tbody>
                {dados.map((f) => (
                  <tr key={f.id} className="border-b last:border-b-0 hover:bg-[#FAFBFD] cursor-pointer" style={{ borderColor: 'var(--rbr-border)' }} onClick={() => setAberta(f.id!)}>
                    <td className="p-3 font-semibold tabular-nums">{f.numero}</td>
                    <td className="p-3">
                      <div className="font-semibold truncate max-w-[240px]">{f.cliente_nome ?? '—'}</div>
                      <div className="text-[10.5px] text-[color:var(--rbr-muted)]">{f.qtd_lancamentos} item(ns)</div>
                    </td>
                    <td className="p-3 tabular-nums">{fmtData(f.data_vencimento)}</td>
                    <td className="p-3 text-right tabular-nums font-semibold">{brl(Number(f.valor_total))}</td>
                    <td className="p-3 text-right tabular-nums hidden md:table-cell">{brl(Number(f.saldo_aberto))}</td>
                    <td className="p-3">
                      <Pill situacao={f.situacao ?? ''} />
                    </td>
                    <td className="p-3 hidden md:table-cell text-xs text-[color:var(--rbr-muted)]">{f.enviada_em ? new Date(f.enviada_em).toLocaleDateString('pt-BR') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(filtro === 'abertas' || filtro === 'vencidas') && (
            <div className="px-3 py-2 text-xs border-t" style={{ borderColor: 'var(--rbr-border)' }}>
              Em aberto nas faturas: <b className="tabular-nums">{brl(total)}</b>
            </div>
          )}
        </Card>
      )}

      {nova && (
        <NovaFaturaModal
          apoio={apoio}
          onFechar={() => setNova(false)}
          onCriada={(id) => {
            setNova(false)
            onMudou()
            setAberta(id)
          }}
        />
      )}
      {aberta && <DetalheFatura id={aberta} apoio={apoio} onFechar={() => setAberta(null)} onMudou={onMudou} />}
    </div>
  )
}

export function NovaFaturaModal({
  apoio,
  clienteId,
  preSelecionados,
  onFechar,
  onCriada,
}: {
  apoio: Apoio
  clienteId?: string
  preSelecionados?: string[]
  onFechar: () => void
  onCriada: (id: string) => void
}) {
  const [cliente, setCliente] = useState(clienteId ?? '')
  const [itens, setItens] = useState<Lancamento[]>([])
  const [sel, setSel] = useState<Set<string>>(new Set(preSelecionados ?? []))
  const [venc, setVenc] = useState('')
  const [forma, setForma] = useState('boleto')
  const [obs, setObs] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!cliente) {
      setItens([])
      return
    }
    supabase
      .from('v_lancamentos')
      .select('*')
      .eq('tipo', 'receber')
      .eq('cliente_id', cliente)
      .in('status', ['aberto', 'previsto'])
      .is('fatura_id', null)
      .order('data_vencimento')
      .then(({ data, error }) => {
        if (error) setErro(error.message)
        setItens(data ?? [])
        if (!preSelecionados?.length) setSel(new Set((data ?? []).map((l) => l.id!)))
      })
  }, [cliente, preSelecionados])

  const escolhidos = itens.filter((l) => l.id && sel.has(l.id))
  const total = escolhidos.reduce((s, l) => s + Number(l.saldo_aberto ?? 0), 0)
  useEffect(() => {
    if (!venc && escolhidos.length) {
      const maior = escolhidos.map((l) => l.data_vencimento!).sort().pop()!
      setVenc(maior < hojeISO() ? hojeISO() : maior)
    }
  }, [escolhidos, venc])

  async function criar() {
    setErro(null)
    if (!escolhidos.length) return setErro('Selecione ao menos um item.')
    if (!venc) return setErro('Informe o vencimento.')
    setSalvando(true)
    const { data, error } = await supabase.rpc('criar_fatura', { p_lancamentos: escolhidos.map((l) => l.id!), p_vencimento: venc, p_forma: forma, p_obs: obs || undefined })
    setSalvando(false)
    if (error) return setErro(error.message)
    onCriada(data as string)
  }

  return (
    <Modal titulo="Nova fatura" onFechar={onFechar}>
      <Campo label="Cliente">
        <select value={cliente} onChange={(e) => setCliente(e.target.value)} className={inputClass} style={inputStyle} disabled={!!clienteId}>
          <option value="">Escolha…</option>
          {apoio.clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {nomeCliente(c)}
            </option>
          ))}
        </select>
      </Campo>
      {cliente && (
        <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
          {itens.length === 0 && <div className="text-xs text-[color:var(--rbr-muted)]">Nenhum valor em aberto sem fatura para este cliente.</div>}
          {itens.map((l) => (
            <label key={l.id} className="flex items-center gap-2 text-xs border rounded-lg px-3 py-2 cursor-pointer" style={{ borderColor: 'var(--rbr-border)' }}>
              <input
                type="checkbox"
                checked={!!l.id && sel.has(l.id)}
                onChange={() =>
                  setSel((s) => {
                    const n = new Set(s)
                    if (n.has(l.id!)) n.delete(l.id!)
                    else n.add(l.id!)
                    return n
                  })
                }
              />
              <span className="flex-1 truncate">{l.descricao}</span>
              <span className="text-[color:var(--rbr-muted)] tabular-nums">
                {fmtData(l.data_vencimento)}
                {l.vencimento_estimado ? ' (est.)' : ''}
              </span>
              <span className="tabular-nums font-semibold">{brl(l.saldo_aberto)}</span>
            </label>
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Campo label="Vencimento da fatura">
          <input type="date" value={venc} onChange={(e) => setVenc(e.target.value)} className={inputClass} style={inputStyle} />
        </Campo>
        <Campo label="Forma de cobrança">
          <select value={forma} onChange={(e) => setForma(e.target.value)} className={inputClass} style={inputStyle}>
            <option value="boleto">Boleto</option>
            <option value="pix">Pix</option>
            <option value="transferencia">Transferência</option>
          </select>
        </Campo>
        <div className="flex flex-col justify-end">
          <div className="text-[11px] text-[color:var(--rbr-muted)]">Total</div>
          <div className="rbr-display text-lg font-bold tabular-nums">{brl(total)}</div>
        </div>
      </div>
      <Campo label="Observações (saem na fatura)">
        <input value={obs} onChange={(e) => setObs(e.target.value)} className={inputClass} style={inputStyle} />
      </Campo>
      <div className="text-[11px] text-[color:var(--rbr-muted)]">Ao criar, o vencimento de todos os itens passa a ser o da fatura.</div>
      {erro && <Aviso>{erro}</Aviso>}
      <div className="flex justify-end gap-2">
        <Botao variante="secundario" onClick={onFechar}>
          Cancelar
        </Botao>
        <Botao onClick={criar} disabled={salvando}>
          {salvando ? 'Criando…' : 'Criar fatura'}
        </Botao>
      </div>
    </Modal>
  )
}

function DetalheFatura({ id, apoio, onFechar, onMudou }: { id: string; apoio: Apoio; onFechar: () => void; onMudou: () => void }) {
  const [f, setF] = useState<Fatura | null>(null)
  const [itens, setItens] = useState<Lancamento[]>([])
  const [linha, setLinha] = useState('')
  const [pix, setPix] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [baixa, setBaixa] = useState(false)

  const carregar = useCallback(async () => {
    const [a, b] = await Promise.all([
      supabase.from('v_faturas').select('*').eq('id', id).maybeSingle(),
      supabase.from('v_lancamentos').select('*').eq('fatura_id', id).order('data_vencimento'),
    ])
    setF(a.data ?? null)
    setLinha(a.data?.linha_digitavel ?? '')
    setPix(a.data?.pix_copia_cola ?? '')
    setItens(b.data ?? [])
  }, [id])
  useEffect(() => {
    carregar()
  }, [carregar])

  const boleto = digitos(linha).length >= 44 ? lerBoleto(linha) : null

  async function salvarPagamento(boletoDocId?: string) {
    setErro(null)
    setOk(null)
    if (boleto && !boleto.valido) return setErro('Linha digitável inválida.')
    const { error } = await supabase
      .from('faturas')
      .update({ linha_digitavel: digitos(linha) || null, pix_copia_cola: pix.trim() || null, ...(boletoDocId ? { boleto_documento_id: boletoDocId } : {}) })
      .eq('id', id)
    if (error) return setErro(error.message)
    if (itens.length === 1 && digitos(linha)) await supabase.from('lancamentos_financeiros').update({ linha_digitavel: digitos(linha) }).eq('id', itens[0].id!)
    if (boleto?.valido && boleto.vencimento && f && boleto.vencimento !== f.data_vencimento) {
      if (window.confirm(`O boleto vence em ${fmtData(boleto.vencimento)} e a fatura em ${fmtData(f.data_vencimento)}. Ajustar a fatura para a data do boleto?`)) {
        await supabase.rpc('alterar_vencimento_fatura', { p_fatura: id, p_vencimento: boleto.vencimento })
      }
    }
    setOk('Dados de pagamento salvos.')
    carregar()
    onMudou()
  }

  async function anexarBoleto(file: File) {
    if (!f) return
    setErro(null)
    setOcupado('boleto')
    try {
      const doc = await enviarDocumento(file, { tipo: 'boleto', direcao: 'emitido', cliente_id: f.cliente_id })
      for (const l of itens) await supabase.rpc('vincular_documento_lancamento', { p_documento: doc.id, p_lancamento: l.id!, p_atualizar: false })
      try {
        const r = await invocarIA<{ sugestao?: { lancamento?: { linha_digitavel?: string; pix_copia_cola?: string } } }>('ler_documento', { documento_id: doc.id })
        const s = r.sugestao?.lancamento
        if (s?.linha_digitavel) setLinha(s.linha_digitavel)
        if (s?.pix_copia_cola) setPix(s.pix_copia_cola)
        setOk(s?.linha_digitavel ? 'A IA leu a linha digitável do boleto — confira e salve.' : 'Boleto anexado. A IA não achou a linha digitável; cole manualmente.')
      } catch (e) {
        setOk(`Boleto anexado (a IA não leu: ${erroMsg(e)}).`)
      }
      await supabase.from('faturas').update({ boleto_documento_id: doc.id }).eq('id', id)
    } catch (e) {
      setErro(erroMsg(e))
    } finally {
      setOcupado(null)
    }
  }

  async function montarPdf() {
    if (!f) return null
    const [{ gerarFaturaPdf }, empresa, banco] = await Promise.all([
      import('../../lib/faturaPdf'),
      lerParametro<EmpresaFatura>('dados_empresa'),
      lerParametro<BancoFatura>('dados_bancarios_rbr'),
    ])
    return gerarFaturaPdf(f, itens, empresa ?? {}, banco ?? {})
  }

  async function baixarPdf() {
    setOcupado('pdf')
    try {
      const blob = await montarPdf()
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `fatura-${f?.numero}-${(f?.cliente_nome ?? '').replace(/[^\w]+/g, '-').slice(0, 30)}.pdf`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } catch (e) {
      setErro(erroMsg(e))
    } finally {
      setOcupado(null)
    }
  }

  function textoEnvio() {
    if (!f) return ''
    return [
      `Olá! Segue a fatura nº ${f.numero} da RBR Cargo.`,
      `Valor: ${brl(Number(f.valor_total))} · Vencimento: ${fmtData(f.data_vencimento)}`,
      ...itens.map((l) => `• ${l.descricao} — ${brl(Number(l.valor))}`),
      f.linha_digitavel ? `Linha digitável: ${f.linha_digitavel}` : '',
      f.pix_copia_cola ? `Pix copia e cola: ${f.pix_copia_cola}` : '',
      'Qualquer dúvida, estamos à disposição.',
    ]
      .filter(Boolean)
      .join('\n')
  }

  // O PDF fica pronto antes do clique: o navegador só deixa compartilhar/abrir janela
  // dentro do próprio clique (sem esperas no meio).
  const [pdfPronto, setPdfPronto] = useState<Blob | null>(null)
  useEffect(() => {
    let vivo = true
    setPdfPronto(null)
    if (f && itens.length) {
      montarPdf()
        .then((b) => vivo && setPdfPronto(b))
        .catch(() => undefined)
    }
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f, itens])

  function compartilhar() {
    setErro(null)
    const arquivo = pdfPronto ? new File([pdfPronto], `fatura-${f?.numero}.pdf`, { type: 'application/pdf' }) : null
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
    if (arquivo && nav.share && nav.canShare?.({ files: [arquivo] })) {
      nav
        .share({ files: [arquivo], text: textoEnvio(), title: `Fatura ${f?.numero}` })
        .then(() => marcarEnviada())
        .catch((e) => {
          if ((e as Error)?.name !== 'AbortError') setErro(erroMsg(e))
        })
      return
    }
    // Sem compartilhamento nativo (computador): abre o WhatsApp já no clique e baixa o PDF para anexar.
    window.open(whatsappLink(f?.cliente_whatsapp, textoEnvio()), '_blank', 'noopener')
    baixarPdf().then(() => {
      setOk('PDF baixado. Anexe-o na conversa do WhatsApp que abriu.')
      marcarEnviada()
    })
  }

  async function marcarEnviada() {
    await supabase.from('faturas').update({ enviada_em: new Date().toISOString() }).eq('id', id)
    carregar()
  }

  async function alterarVenc() {
    const nova = window.prompt('Novo vencimento (DD/MM/AAAA):', f ? fmtData(f.data_vencimento) : '')
    if (!nova) return
    const m = nova.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    if (!m) return setErro('Use o formato DD/MM/AAAA.')
    const { error } = await supabase.rpc('alterar_vencimento_fatura', { p_fatura: id, p_vencimento: `${m[3]}-${m[2]}-${m[1]}` })
    if (error) return setErro(error.message)
    carregar()
    onMudou()
  }

  async function cancelar() {
    const motivo = window.prompt('Motivo do cancelamento da fatura (os valores voltam a ficar em aberto, sem fatura):')
    if (!motivo?.trim()) return
    const { error } = await supabase.rpc('cancelar_fatura', { p_fatura: id, p_motivo: motivo.trim() })
    if (error) return setErro(error.message)
    onMudou()
    onFechar()
  }

  if (!f) return null
  const abertos = itens.filter((l) => l.status === 'aberto' || l.status === 'previsto')
  const ativa = f.situacao !== 'cancelada' && f.situacao !== 'pago'

  return (
    <>
      <Modal titulo={`Fatura nº ${f.numero} · ${f.cliente_nome ?? ''}`} onFechar={onFechar} largura="max-w-3xl">
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <Pill situacao={f.situacao ?? ''} />
          <span>Vence {fmtData(f.data_vencimento)}</span>
          <span>· Total {brl(Number(f.valor_total))}</span>
          <span>· Em aberto {brl(Number(f.saldo_aberto))}</span>
          {f.enviada_em && <span className="text-[color:var(--rbr-muted)]">· enviada em {new Date(f.enviada_em).toLocaleDateString('pt-BR')}</span>}
        </div>
        {f.cancelada_motivo && <Aviso tipo="info">Cancelada: {f.cancelada_motivo}</Aviso>}
        <div className="flex flex-col gap-1.5">
          {itens.map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-2 text-xs border rounded-lg px-3 py-2" style={{ borderColor: 'var(--rbr-border)' }}>
              <span className="truncate">{l.descricao}</span>
              <span className="flex items-center gap-2">
                <span className="tabular-nums font-semibold">{brl(Number(l.valor))}</span>
                <Pill situacao={l.situacao ?? ''} />
              </span>
            </div>
          ))}
        </div>

        {ativa && (
          <div className="rounded-xl p-3 flex flex-col gap-2.5" style={{ background: 'var(--rbr-muted-bg)' }}>
            <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">Como o cliente paga</div>
            <div className="text-[11px] text-[color:var(--rbr-muted)]">
              Gere o boleto no app do banco e anexe o PDF aqui — a IA lê a linha digitável. Ou cole a linha / Pix copia e cola. Sem nada disso, a fatura sai com os dados
              bancários da RBR (Configurações).
            </div>
            <Campo
              label="Linha digitável"
              dica={
                boleto ? (
                  boleto.valido ? (
                    <span style={{ color: 'var(--rbr-positive)' }}>
                      Válida{boleto.valor ? ` · ${brl(boleto.valor)}` : ''}
                      {boleto.valor && Math.abs(boleto.valor - Number(f.valor_total)) > 0.01 ? ' · ATENÇÃO: valor diferente da fatura' : ''}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--rbr-danger)' }}>Inválida</span>
                  )
                ) : undefined
              }
            >
              <input value={linha} onChange={(e) => setLinha(e.target.value)} className={`${inputClass} font-mono`} style={inputStyle} />
            </Campo>
            <Campo label="Pix copia e cola">
              <input value={pix} onChange={(e) => setPix(e.target.value)} className={`${inputClass} font-mono`} style={inputStyle} />
            </Campo>
            <div className="flex gap-2 flex-wrap">
              <Botao onClick={() => salvarPagamento()}>Salvar</Botao>
              <label className="text-xs font-bold px-3 py-2 rounded-lg cursor-pointer" style={{ background: 'var(--rbr-gold)', color: '#fff' }}>
                {ocupado === 'boleto' ? 'Lendo boleto…' : 'Anexar PDF do boleto (IA lê)'}
                <input
                  type="file"
                  accept=".pdf,image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (file) anexarBoleto(file)
                  }}
                />
              </label>
              {f.linha_digitavel && <Copiar texto={f.linha_digitavel} rotulo="Copiar linha" />}
            </div>
          </div>
        )}

        {ok && <Aviso tipo="ok">{ok}</Aviso>}
        {erro && <Aviso>{erro}</Aviso>}
        <div className="flex flex-wrap gap-2">
          <Botao variante="secundario" onClick={baixarPdf} disabled={!!ocupado}>
            {ocupado === 'pdf' ? 'Gerando…' : 'Baixar PDF'}
          </Botao>
          {ativa && (
            <>
              <Botao onClick={compartilhar} disabled={!!ocupado}>
                {ocupado === 'enviar' ? 'Preparando…' : 'Enviar ao cliente'}
              </Botao>
              {f.cliente_email && (
                <a
                  className="text-xs font-bold px-3 py-2 rounded-lg border"
                  style={{ borderColor: 'var(--rbr-border)', color: 'var(--rbr-navy)' }}
                  href={`mailto:${f.cliente_email}?subject=${encodeURIComponent(`Fatura ${f.numero} — RBR Cargo`)}&body=${encodeURIComponent(textoEnvio())}`}
                  onClick={() => marcarEnviada()}
                >
                  E-mail
                </a>
              )}
              {abertos.length > 0 && (
                <Botao variante="ouro" onClick={() => setBaixa(true)}>
                  Registrar recebimento
                </Botao>
              )}
              <Botao variante="secundario" onClick={alterarVenc}>
                Alterar vencimento
              </Botao>
              <Botao variante="perigo" onClick={cancelar}>
                Cancelar fatura
              </Botao>
            </>
          )}
        </div>
      </Modal>
      {baixa && (
        <BaixaModal
          lancamentos={abertos}
          apoio={apoio}
          onFechar={() => setBaixa(false)}
          onFeito={() => {
            carregar()
            onMudou()
          }}
        />
      )}
    </>
  )
}
