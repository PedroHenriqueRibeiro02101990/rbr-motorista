import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@rbr/shared/supabaseClient'
import type { Json } from '@rbr/shared/database.types'
import { lerBoleto, formatarLinhaDigitavel } from '@rbr/shared/boleto'
import { IconCopy } from '../../icons-local'
import {
  type Apoio,
  type Lancamento,
  type TipoLanc,
  type RegraPrazo,
  FORMA_LABEL,
  addDias,
  brl,
  diffDias,
  digitos,
  enviarDocumento,
  erroMsg,
  fmtData,
  hojeISO,
  invocarIA,
  lerParametro,
  nomeCliente,
  nomeFornecedor,
  parseValor,
  previewVencimentos,
  regraDeCondicao,
  valorParaInput,
  whatsappLink,
  abrirArquivo,
} from '../../lib/financeiro'
import { Aviso, Botao, Campo, Modal, Pill, inputClass, inputStyle } from './ui'
import { OpcoesCategoria } from './CategoriaOpcoes'

export function Copiar({ texto, rotulo = 'Copiar' }: { texto: string; rotulo?: string }) {
  const [ok, setOk] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto)
          setOk(true)
          setTimeout(() => setOk(false), 1500)
        } catch {
          window.prompt('Copie o texto:', texto)
        }
      }}
      className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-md border"
      style={{ borderColor: 'var(--rbr-border)', color: 'var(--rbr-navy)' }}
    >
      <IconCopy width={11} height={11} /> {ok ? 'Copiado' : rotulo}
    </button>
  )
}

function dadosBancariosRecentes(l: Pick<Lancamento, 'tipo' | 'dados_bancarios_alterados_em'>) {
  if (l.tipo !== 'pagar' || !l.dados_bancarios_alterados_em) return false
  return Date.now() - new Date(l.dados_bancarios_alterados_em).getTime() < 7 * 86400000
}

// ============================================================ BAIXA (pagar / receber)
export function BaixaModal({
  lancamentos,
  apoio,
  comprovante,
  onFechar,
  onFeito,
}: {
  lancamentos: Lancamento[]
  apoio: Apoio
  comprovante?: { documento_id: string; data?: string | null; valor?: number | null }
  onFechar: () => void
  onFeito: () => void
}) {
  const unico = lancamentos.length === 1 ? lancamentos[0] : null
  const tipo = lancamentos[0]?.tipo as TipoLanc
  const contaPadrao = unico?.conta_bancaria_id ?? apoio.contas.find((c) => c.padrao && c.ativa)?.id ?? apoio.contas[0]?.id ?? ''
  const [data, setData] = useState(comprovante?.data ?? hojeISO())
  const [valor, setValor] = useState(valorParaInput(comprovante?.valor ?? unico?.saldo_aberto ?? null))
  const [juros, setJuros] = useState('')
  const [desconto, setDesconto] = useState('')
  const [conta, setConta] = useState(contaPadrao ?? '')
  const [forma, setForma] = useState(unico?.forma_pagamento ?? (tipo === 'pagar' ? 'pix' : ''))
  const [obs, setObs] = useState('')
  const [antifraude, setAntifraude] = useState('')
  const [docId, setDocId] = useState<string | null>(comprovante?.documento_id ?? null)
  const [lendo, setLendo] = useState(false)
  const [infoIA, setInfoIA] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const precisaAntifraude = lancamentos.some(dadosBancariosRecentes)
  const total = lancamentos.reduce((s, l) => s + Number(l.saldo_aberto ?? 0), 0)
  const principal = unico ? parseValor(valor) - (parseValor(juros) || 0) + (parseValor(desconto) || 0) : total
  const sobra = unico ? Number(unico.saldo_aberto ?? 0) - principal : 0

  async function anexar(file: File) {
    setErro(null)
    setLendo(true)
    try {
      const doc = await enviarDocumento(file, { tipo: 'comprovante', direcao: tipo === 'pagar' ? 'recebido' : 'emitido' })
      setDocId(doc.id)
      try {
        const r = await invocarIA<{ sugestao?: { lancamento?: { valor_total?: number; data_pagamento?: string } } }>('ler_documento', { documento_id: doc.id })
        const lido = r.sugestao?.lancamento
        if (lido?.data_pagamento) setData(lido.data_pagamento)
        if (unico && lido?.valor_total) setValor(valorParaInput(lido.valor_total))
        if (lido?.valor_total) setInfoIA(`A IA leu o comprovante: ${brl(lido.valor_total)}${lido.data_pagamento ? ` em ${fmtData(lido.data_pagamento)}` : ''}. Confira.`)
      } catch (e) {
        setInfoIA(`Comprovante anexado (a IA não conseguiu ler: ${erroMsg(e)}).`)
      }
    } catch (e) {
      setErro(erroMsg(e))
    } finally {
      setLendo(false)
    }
  }

  async function confirmar() {
    setErro(null)
    if (!conta) return setErro('Escolha a conta bancária.')
    if (!data) return setErro('Informe a data.')
    if (precisaAntifraude && antifraude.trim().length < 5) return setErro('Os dados bancários mudaram há pouco: descreva como confirmou (ex.: "liguei no número do cadastro").')
    if (unico) {
      const v = parseValor(valor)
      if (!Number.isFinite(v) || v <= 0) return setErro('Valor inválido.')
    }
    setSalvando(true)
    const falhas: string[] = []
    for (const l of lancamentos) {
      const { error } = await supabase.rpc('registrar_baixa', {
        p: {
          lancamento_id: l.id,
          data,
          valor: unico ? parseValor(valor) : Number(l.saldo_aberto),
          juros_multa: unico ? parseValor(juros) || 0 : 0,
          desconto: unico ? parseValor(desconto) || 0 : 0,
          conta_bancaria_id: conta,
          forma_pagamento: forma || null,
          comprovante_documento_id: docId,
          observacao: obs || null,
          confirmacao_antifraude: antifraude || null,
        } as unknown as Json,
      })
      if (error) falhas.push(`${l.descricao}: ${error.message}`)
    }
    setSalvando(false)
    if (falhas.length) {
      setErro(falhas.join('\n'))
      if (falhas.length < lancamentos.length) onFeito()
      return
    }
    onFeito()
    onFechar()
  }

  const verbo = tipo === 'pagar' ? 'Pagar' : 'Receber'
  return (
    <Modal titulo={unico ? `${tipo === 'pagar' ? 'Registrar pagamento' : 'Registrar recebimento'}` : `${verbo} ${lancamentos.length} lançamentos`} onFechar={onFechar}>
      {unico ? (
        <div className="rounded-lg p-3 flex flex-col gap-1" style={{ background: 'var(--rbr-muted-bg)' }}>
          <div className="text-sm font-semibold">{unico.descricao}</div>
          <div className="text-xs text-[color:var(--rbr-muted)]">
            {unico.contraparte ?? '—'} · vence {fmtData(unico.data_vencimento)} · em aberto <b>{brl(unico.saldo_aberto)}</b>
          </div>
          {tipo === 'pagar' && (unico.chave_pix_destino || unico.contraparte_pix || unico.linha_digitavel || unico.pix_copia_cola) && (
            <div className="flex flex-col gap-1.5 mt-1.5">
              {(unico.chave_pix_destino || unico.contraparte_pix) && (
                <div className="flex items-center gap-2 text-xs flex-wrap">
                  <span className="text-[color:var(--rbr-muted)]">Chave Pix:</span>
                  <span className="font-mono">{unico.chave_pix_destino || unico.contraparte_pix}</span>
                  <Copiar texto={(unico.chave_pix_destino || unico.contraparte_pix) as string} />
                </div>
              )}
              {unico.linha_digitavel && (
                <div className="flex items-center gap-2 text-xs flex-wrap">
                  <span className="text-[color:var(--rbr-muted)]">Boleto:</span>
                  <span className="font-mono break-all">{formatarLinhaDigitavel(unico.linha_digitavel)}</span>
                  <Copiar texto={unico.linha_digitavel} />
                </div>
              )}
              {unico.pix_copia_cola && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-[color:var(--rbr-muted)]">Pix copia e cola</span>
                  <Copiar texto={unico.pix_copia_cola} />
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg p-3 flex flex-col gap-1 max-h-48 overflow-y-auto" style={{ background: 'var(--rbr-muted-bg)' }}>
          {lancamentos.map((l) => (
            <div key={l.id} className="flex justify-between gap-3 text-xs">
              <span className="truncate">
                {l.contraparte ?? '—'} · {l.descricao}
              </span>
              <span className="tabular-nums font-semibold">{brl(l.saldo_aberto)}</span>
            </div>
          ))}
          <div className="flex justify-between text-sm font-bold border-t pt-1.5 mt-1" style={{ borderColor: 'var(--rbr-border)' }}>
            <span>Total</span>
            <span className="tabular-nums">{brl(total)}</span>
          </div>
        </div>
      )}

      {precisaAntifraude && (
        <Aviso tipo="atencao">
          Os dados bancários de {lancamentos.filter(dadosBancariosRecentes).map((l) => l.contraparte).join(', ')} foram alterados nos últimos 7 dias. Antes de pagar,
          confirme a chave/conta por telefone com alguém que você conhece (golpe comum: trocar o Pix do fornecedor).
        </Aviso>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Campo label={`Data do ${tipo === 'pagar' ? 'pagamento' : 'recebimento'}`}>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={inputClass} style={inputStyle} />
        </Campo>
        {unico && (
          <Campo label="Valor movimentado (R$)">
            <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} className={inputClass} style={inputStyle} />
          </Campo>
        )}
        <Campo label="Conta">
          <select value={conta} onChange={(e) => setConta(e.target.value)} className={inputClass} style={inputStyle}>
            <option value="">Escolha…</option>
            {apoio.contas
              .filter((c) => c.ativa)
              .map((c) => (
                <option key={c.id!} value={c.id!}>
                  {c.nome}
                </option>
              ))}
          </select>
        </Campo>
        <Campo label="Forma">
          <select value={forma ?? ''} onChange={(e) => setForma(e.target.value)} className={inputClass} style={inputStyle}>
            <option value="">—</option>
            {Object.entries(FORMA_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Campo>
        {unico && (
          <>
            <Campo label="Juros / multa (R$)" dica="Parte do valor que é encargo">
              <input inputMode="decimal" value={juros} onChange={(e) => setJuros(e.target.value)} className={inputClass} style={inputStyle} placeholder="0,00" />
            </Campo>
            <Campo label="Desconto (R$)" dica="Abatimento concedido">
              <input inputMode="decimal" value={desconto} onChange={(e) => setDesconto(e.target.value)} className={inputClass} style={inputStyle} placeholder="0,00" />
            </Campo>
          </>
        )}
      </div>
      {unico && Number.isFinite(principal) && sobra > 0.009 && (
        <div className="text-[11px] text-[color:var(--rbr-muted)]">Baixa parcial: continua em aberto {brl(sobra)}.</div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-xs font-bold px-3 py-2 rounded-lg border cursor-pointer" style={{ borderColor: 'var(--rbr-border)', color: 'var(--rbr-navy)' }}>
          {lendo ? 'Lendo comprovante…' : docId ? 'Trocar comprovante' : 'Anexar comprovante (a IA confere)'}
          <input
            type="file"
            accept=".pdf,image/*"
            className="hidden"
            disabled={lendo}
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) anexar(f)
            }}
          />
        </label>
        {docId && <span className="text-[11px] text-[color:var(--rbr-positive)] font-semibold">Comprovante anexado</span>}
      </div>
      {infoIA && <Aviso tipo="info">{infoIA}</Aviso>}

      {precisaAntifraude && (
        <Campo label="Como você confirmou os dados bancários?">
          <input value={antifraude} onChange={(e) => setAntifraude(e.target.value)} className={inputClass} style={inputStyle} placeholder="Ex.: liguei para o João no (11) 9..." />
        </Campo>
      )}
      <Campo label="Observação">
        <input value={obs} onChange={(e) => setObs(e.target.value)} className={inputClass} style={inputStyle} />
      </Campo>

      {erro && <Aviso>{erro}</Aviso>}
      <div className="flex justify-end gap-2">
        <Botao variante="secundario" onClick={onFechar}>
          Cancelar
        </Botao>
        <Botao onClick={confirmar} disabled={salvando || lendo}>
          {salvando ? 'Registrando…' : unico ? `Confirmar ${tipo === 'pagar' ? 'pagamento' : 'recebimento'}` : `Confirmar ${brl(total)}`}
        </Botao>
      </div>
    </Modal>
  )
}

// ============================================================ NOVO / EDITAR LANÇAMENTO
export interface LancamentoInicial {
  descricao?: string | null
  categoria_id?: string | null
  fornecedor_id?: string | null
  cliente_id?: string | null
  pessoa_id?: string | null
  contraparte_nome?: string | null
  contraparte_documento?: string | null
  operacao_id?: string | null
  valor_total?: number | null
  data_emissao?: string | null
  competencia?: string | null
  numero_documento?: string | null
  linha_digitavel?: string | null
  pix_copia_cola?: string | null
  forma_pagamento?: string | null
  parcelas?: { vencimento: string; valor: number }[]
  data_pagamento?: string | null
}

interface ParcelaForm {
  vencimento: string
  valor: string
}

export function LancamentoForm({
  tipoInicial,
  apoio,
  editar,
  inicial,
  documentoIds,
  jaPagoInicial,
  onFechar,
  onSalvo,
}: {
  tipoInicial: TipoLanc
  apoio: Apoio
  editar?: Lancamento
  inicial?: LancamentoInicial
  documentoIds?: string[]
  jaPagoInicial?: boolean
  onFechar: () => void
  onSalvo: () => void
}) {
  const base = editar ?? null
  const [tipo, setTipo] = useState<TipoLanc>((base?.tipo as TipoLanc) ?? tipoInicial)
  const [descricao, setDescricao] = useState(base?.descricao ?? inicial?.descricao ?? '')
  const [categoria, setCategoria] = useState(base?.categoria_id ?? inicial?.categoria_id ?? '')
  const temCadastro = !!(base?.fornecedor_id || base?.cliente_id || inicial?.fornecedor_id || inicial?.cliente_id)
  const [modoContra, setModoContra] = useState<'cadastro' | 'livre'>(
    temCadastro || !(base?.contraparte_nome || inicial?.contraparte_nome) ? 'cadastro' : 'livre',
  )
  const [fornecedor, setFornecedor] = useState(base?.fornecedor_id ?? inicial?.fornecedor_id ?? '')
  const [cliente, setCliente] = useState(base?.cliente_id ?? inicial?.cliente_id ?? '')
  const [contraNome, setContraNome] = useState(base?.contraparte_nome ?? inicial?.contraparte_nome ?? '')
  const [contraDoc, setContraDoc] = useState(base?.contraparte_documento ?? inicial?.contraparte_documento ?? '')
  const [valor, setValor] = useState(valorParaInput(base?.valor ?? inicial?.valor_total ?? null))
  const [emissao, setEmissao] = useState(base?.data_emissao ?? inicial?.data_emissao ?? hojeISO())
  const [competencia, setCompetencia] = useState((base?.competencia ?? inicial?.competencia ?? inicial?.data_emissao ?? hojeISO()).slice(0, 7))
  const [vencModo, setVencModo] = useState<'unico' | 'parcelado' | 'regra' | 'manual'>(
    inicial?.parcelas && inicial.parcelas.length > 1 ? 'manual' : 'unico',
  )
  const [vencUnico, setVencUnico] = useState(base?.data_vencimento ?? inicial?.parcelas?.[0]?.vencimento ?? hojeISO())
  const [nParc, setNParc] = useState('2')
  const [intervalo, setIntervalo] = useState('30')
  const [regraId, setRegraId] = useState('')
  const [parcelasManuais, setParcelasManuais] = useState<ParcelaForm[]>(
    (inicial?.parcelas ?? []).map((p) => ({ vencimento: p.vencimento, valor: valorParaInput(p.valor) })),
  )
  const [forma, setForma] = useState(base?.forma_pagamento ?? inicial?.forma_pagamento ?? '')
  const [conta, setConta] = useState(base?.conta_bancaria_id ?? '')
  const [numeroDoc, setNumeroDoc] = useState(base?.numero_documento ?? inicial?.numero_documento ?? '')
  const [linha, setLinha] = useState(base?.linha_digitavel ?? inicial?.linha_digitavel ?? '')
  const [pixCC, setPixCC] = useState(base?.pix_copia_cola ?? inicial?.pix_copia_cola ?? '')
  const [chavePix, setChavePix] = useState(base?.chave_pix_destino ?? '')
  const [obs, setObs] = useState(base?.observacoes ?? '')
  const [previsto, setPrevisto] = useState(base?.status === 'previsto')
  const [jaPago, setJaPago] = useState(!!jaPagoInicial)
  const [dataPago, setDataPago] = useState(inicial?.data_pagamento ?? hojeISO())
  const [contaPago, setContaPago] = useState(apoio.contas.find((c) => c.padrao && c.ativa)?.id ?? apoio.contas.find((c) => c.ativa)?.id ?? '')
  const [recorrente, setRecorrente] = useState(false)
  const [freq, setFreq] = useState('mensal')
  const [diaRec, setDiaRec] = useState('10')
  const [inicioRec, setInicioRec] = useState(hojeISO())
  const [fimRec, setFimRec] = useState('')
  const [valorVariavel, setValorVariavel] = useState(false)
  const [lembrar, setLembrar] = useState(!!documentoIds?.length)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [docs, setDocs] = useState<string[]>(documentoIds ?? [])
  const [operacaoId, setOperacaoId] = useState<string | null>(inicial?.operacao_id ?? null)
  const [pessoaId, setPessoaId] = useState<string | null>(inicial?.pessoa_id ?? null)
  const [lendoDoc, setLendoDoc] = useState(false)

  const pago = base?.status === 'pago' || Number(base?.valor_pago ?? 0) > 0
  const boleto = useMemo(() => (digitos(linha).length >= 44 ? lerBoleto(linha) : null), [linha])

  // Fornecedor escolhido → puxa categoria, prazo e Pix padrão
  useEffect(() => {
    if (editar || !fornecedor) return
    const f = apoio.fornecedores.find((x) => x.id === fornecedor)
    if (!f) return
    if (!categoria && f.categoria_id) setCategoria(f.categoria_id)
    if (!chavePix && f.pix) setChavePix(f.pix)
    if (f.condicao_prazo_id && vencModo === 'unico' && !inicial?.parcelas?.length) {
      setRegraId(f.condicao_prazo_id)
      setVencModo('regra')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fornecedor])

  function aoMudarLinha(v: string) {
    setLinha(v)
    const info = digitos(v).length >= 44 ? lerBoleto(v) : null
    if (info?.valido) {
      if (!valor && info.valor) setValor(valorParaInput(info.valor))
      if (info.vencimento && vencModo === 'unico') setVencUnico(info.vencimento)
      if (!forma) setForma('boleto')
    }
  }

  const parcelas: { vencimento: string; valor: number }[] = useMemo(() => {
    const total = parseValor(valor)
    if (!Number.isFinite(total) || total <= 0) return []
    if (vencModo === 'unico') return [{ vencimento: vencUnico, valor: total }]
    if (vencModo === 'manual') return parcelasManuais.map((p) => ({ vencimento: p.vencimento, valor: parseValor(p.valor) }))
    if (vencModo === 'parcelado') {
      const n = Math.max(1, Math.min(24, Number(nParc) || 1))
      const passo = Math.max(1, Number(intervalo) || 30)
      const r: RegraPrazo = { base: 'emissao', modo: 'dias', ajustar_dia_util: false, parcelas: Array.from({ length: n }, (_, i) => ({ dias: i * passo, percentual: 100 / n })) }
      return previewVencimentos(r, { emissao: vencUnico }, total).map((p) => ({ vencimento: p.vencimento, valor: p.valor }))
    }
    const cond = apoio.condicoes.find((c) => c.id === regraId)
    if (!cond) return []
    return previewVencimentos(regraDeCondicao(cond), { emissao: emissao, aprovacao: emissao, liberacao: emissao, coleta: emissao, entrega: emissao }, total, apoio.feriados).map((p) => ({
      vencimento: p.vencimento,
      valor: p.valor,
    }))
  }, [valor, vencModo, vencUnico, parcelasManuais, nParc, intervalo, regraId, emissao, apoio])

  async function lerDocumentoNovo(file: File) {
    setErro(null)
    setLendoDoc(true)
    try {
      const doc = await enviarDocumento(file, { direcao: tipo === 'pagar' ? 'recebido' : 'emitido' })
      setDocs((d) => [...d, doc.id])
      const r = await invocarIA<{ sugestao?: { lancamento?: LancamentoInicial; alertas?: string[]; contraparte?: { nome?: string } | null } }>('ler_documento', {
        documento_id: doc.id,
      })
      const s = r.sugestao?.lancamento
      if (s) {
        if (s.descricao && !descricao) setDescricao(s.descricao)
        if (s.categoria_id && !categoria) setCategoria(s.categoria_id)
        if (s.operacao_id) setOperacaoId(s.operacao_id)
        if (s.fornecedor_id) {
          setModoContra('cadastro')
          setFornecedor(s.fornecedor_id)
        } else if (s.pessoa_id) {
          setPessoaId(s.pessoa_id)
          setModoContra('livre')
          setContraNome(r.sugestao?.contraparte?.nome ?? s.contraparte_nome ?? '')
          setContraDoc(s.contraparte_documento ?? '')
        } else if (s.cliente_id) {
          setModoContra('cadastro')
          setCliente(s.cliente_id)
        } else if (s.contraparte_nome) {
          setModoContra('livre')
          setContraNome(s.contraparte_nome)
          setContraDoc(s.contraparte_documento ?? '')
        }
        if (s.valor_total) setValor(valorParaInput(s.valor_total))
        if (s.data_emissao) setEmissao(s.data_emissao)
        if (s.competencia) setCompetencia(s.competencia.slice(0, 7))
        if (s.numero_documento) setNumeroDoc(s.numero_documento)
        if (s.linha_digitavel) setLinha(s.linha_digitavel)
        if (s.pix_copia_cola) setPixCC(s.pix_copia_cola)
        if (s.forma_pagamento) setForma(s.forma_pagamento)
        if (s.parcelas?.length === 1) {
          setVencModo('unico')
          setVencUnico(s.parcelas[0].vencimento)
        } else if (s.parcelas && s.parcelas.length > 1) {
          setVencModo('manual')
          setParcelasManuais(s.parcelas.map((p) => ({ vencimento: p.vencimento, valor: valorParaInput(p.valor) })))
        }
        setLembrar(true)
      }
      const al = r.sugestao?.alertas ?? []
      setAviso(`A IA preencheu o formulário a partir do arquivo. Confira antes de salvar.${al.length ? `\n• ${al.join('\n• ')}` : ''}`)
    } catch (e) {
      setErro(erroMsg(e))
    } finally {
      setLendoDoc(false)
    }
  }

  async function salvar() {
    setErro(null)
    const total = parseValor(valor)
    if (!descricao.trim()) return setErro('Informe a descrição.')
    if (!Number.isFinite(total) || total <= 0) return setErro('Informe o valor.')
    if (boleto && !boleto.valido) return setErro('A linha digitável não confere nos dígitos verificadores. Corrija ou apague.')
    const contraparte =
      modoContra === 'cadastro'
        ? tipo === 'pagar'
          ? { fornecedor_id: fornecedor || null, cliente_id: null, contraparte_nome: null }
          : { cliente_id: cliente || null, fornecedor_id: null, contraparte_nome: null }
        : { fornecedor_id: null, cliente_id: null, contraparte_nome: contraNome.trim() || null }
    const docContra =
      modoContra === 'livre'
        ? contraDoc.trim() || null
        : tipo === 'pagar'
          ? (apoio.fornecedores.find((f) => f.id === fornecedor)?.cnpj ?? apoio.fornecedores.find((f) => f.id === fornecedor)?.cpf ?? null)
          : (apoio.clientes.find((c) => c.id === cliente)?.cnpj ?? apoio.clientes.find((c) => c.id === cliente)?.cpf ?? null)

    setSalvando(true)
    try {
      if (editar) {
        if (!vencUnico) throw new Error('Informe o vencimento.')
        const mudouValorOuData = (!pago && Math.abs(total - Number(editar.valor)) > 0.004) || vencUnico !== editar.data_vencimento
        const { error } = await supabase
          .from('lancamentos_financeiros')
          .update({
            descricao: descricao.trim(),
            categoria_id: categoria || null,
            ...contraparte,
            pessoa_id: modoContra === 'cadastro' ? editar.pessoa_id : null,
            contraparte_documento: modoContra === 'livre' ? contraDoc.trim() || null : editar.contraparte_documento,
            valor: pago ? Number(editar.valor) : total,
            data_vencimento: vencUnico,
            vencimento_estimado: vencUnico !== editar.data_vencimento ? false : !!editar.vencimento_estimado,
            status: editar.status === 'previsto' || editar.status === 'aberto' ? (previsto ? 'previsto' : 'aberto') : (editar.status ?? 'aberto'),
            competencia: `${competencia}-01`,
            data_emissao: emissao,
            forma_pagamento: forma || null,
            conta_bancaria_id: conta || null,
            numero_documento: numeroDoc.trim() || null,
            linha_digitavel: digitos(linha) || null,
            pix_copia_cola: pixCC.trim() || null,
            chave_pix_destino: chavePix.trim() || null,
            observacoes: obs.trim() || null,
            ajustado_manualmente: editar.ajustado_manualmente || mudouValorOuData,
          })
          .eq('id', editar.id!)
        if (error) throw new Error(error.message)
        onSalvo()
        onFechar()
        return
      }

      if (recorrente) {
        const { data: rec, error } = await supabase
          .from('recorrencias_financeiras')
          .insert({
            tipo,
            descricao: descricao.trim(),
            categoria_id: categoria || null,
            fornecedor_id: contraparte.fornecedor_id,
            cliente_id: contraparte.cliente_id,
            contraparte_nome: contraparte.contraparte_nome,
            valor: total,
            valor_variavel: valorVariavel,
            frequencia: freq,
            dia_vencimento: Math.min(31, Math.max(1, Number(diaRec) || 10)),
            inicio: inicioRec,
            fim: fimRec || null,
            forma_pagamento: forma || null,
            conta_bancaria_id: conta || null,
          })
          .select()
          .single()
        if (error) throw new Error(error.message)
        const g = await supabase.rpc('gerar_lancamentos_recorrentes', {})
        if (g.error) throw new Error(g.error.message)
        if (docs.length && rec) {
          const { data: primeiro } = await supabase.from('lancamentos_financeiros').select('id').eq('recorrencia_id', rec.id).order('data_vencimento').limit(1)
          if (primeiro?.[0]) for (const d of docs) await supabase.rpc('vincular_documento_lancamento', { p_documento: d, p_lancamento: primeiro[0].id, p_atualizar: false })
        }
        onSalvo()
        onFechar()
        return
      }

      if (!parcelas.length || parcelas.some((p) => !p.vencimento || !Number.isFinite(p.valor) || p.valor <= 0)) throw new Error('Confira os vencimentos e valores das parcelas.')
      const soma = parcelas.reduce((s, p) => s + p.valor, 0)
      if (Math.abs(soma - total) > 0.01) throw new Error(`As parcelas somam ${brl(soma)} e o total é ${brl(total)}.`)

      const { data: dups } = await supabase.rpc('possiveis_duplicados', {
        p_tipo: tipo,
        p_valor: parcelas[0].valor,
        p_vencimento: parcelas[0].vencimento,
        p_fornecedor: contraparte.fornecedor_id ?? undefined,
        p_numero: numeroDoc.trim() || undefined,
        p_linha: digitos(linha) || undefined,
        p_documento: docContra ?? undefined,
      })
      if (dups && dups.length) {
        const lista = dups.map((d) => `• ${d.descricao} — ${brl(d.valor)} — ${fmtData(d.data_vencimento)} (${d.motivo})`).join('\n')
        if (!window.confirm(`Parece que isto já foi lançado:\n${lista}\n\nLançar mesmo assim?`)) {
          setSalvando(false)
          return
        }
      }

      const { error } = await supabase.rpc('criar_lancamentos', {
        p: {
          tipo,
          status: previsto ? 'previsto' : 'aberto',
          descricao: descricao.trim(),
          categoria_id: categoria || null,
          ...contraparte,
          pessoa_id: pessoaId,
          contraparte_documento: docContra,
          operacao_id: operacaoId,
          valor_total: total,
          data_emissao: emissao,
          competencia: `${competencia}-01`,
          forma_pagamento: forma || null,
          conta_bancaria_id: conta || null,
          numero_documento: numeroDoc.trim() || null,
          linha_digitavel: digitos(linha) || null,
          pix_copia_cola: pixCC.trim() || null,
          chave_pix_destino: chavePix.trim() || null,
          observacoes: obs.trim() || null,
          parcelas: parcelas.map((p) => ({ vencimento: p.vencimento, valor: p.valor })),
          documento_ids: docs,
          lembrar_regra: lembrar,
          pago: jaPago ? { data: dataPago, conta_bancaria_id: contaPago || null } : null,
        } as unknown as Json,
      })
      if (error) throw new Error(error.message)
      onSalvo()
      onFechar()
    } catch (e) {
      setErro(erroMsg(e))
    } finally {
      setSalvando(false)
    }
  }

  const listaContra =
    tipo === 'pagar'
      ? apoio.fornecedores.filter((f) => f.status === 'ativo' || f.id === fornecedor).map((f) => ({ id: f.id, nome: nomeFornecedor(f) }))
      : apoio.clientes.filter((c) => c.status === 'ativo' || c.id === cliente).map((c) => ({ id: c.id, nome: nomeCliente(c) }))

  return (
    <Modal titulo={editar ? 'Editar lançamento' : tipo === 'pagar' ? 'Nova conta a pagar' : 'Nova conta a receber'} onFechar={onFechar} largura="max-w-3xl">
      {!editar && (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex gap-1.5">
            {(['pagar', 'receber'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setTipo(t)
                  setCategoria('')
                }}
                className="text-xs font-bold px-3 py-1.5 rounded-full border"
                style={{
                  borderColor: tipo === t ? 'var(--rbr-navy)' : 'var(--rbr-border)',
                  background: tipo === t ? 'var(--rbr-navy)' : '#fff',
                  color: tipo === t ? '#fff' : 'var(--rbr-navy-dark)',
                }}
              >
                {t === 'pagar' ? 'A pagar' : 'A receber'}
              </button>
            ))}
          </div>
          <label className="text-xs font-bold px-3 py-2 rounded-lg cursor-pointer" style={{ background: 'var(--rbr-gold)', color: '#fff' }}>
            {lendoDoc ? 'IA lendo o arquivo…' : 'Preencher com IA a partir de NF/boleto'}
            <input
              type="file"
              accept=".pdf,.xml,image/*"
              className="hidden"
              disabled={lendoDoc}
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) lerDocumentoNovo(f)
              }}
            />
          </label>
        </div>
      )}
      {aviso && (
        <Aviso tipo="info" onFechar={() => setAviso(null)}>
          {aviso}
        </Aviso>
      )}
      {editar?.origem === 'operacao' && (
        <Aviso tipo="info">Lançamento automático da operação. Se você mudar valor ou vencimento aqui, o sistema para de recalculá-lo sozinho.</Aviso>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Campo label="Descrição" className="md:col-span-2">
          <input value={descricao} onChange={(e) => setDescricao(e.target.value)} className={inputClass} style={inputStyle} placeholder={tipo === 'pagar' ? 'Ex.: Mensalidade do contador' : 'Ex.: Frete avulso'} />
        </Campo>

        <div className="md:col-span-2 flex flex-col gap-2">
          <div className="flex items-center gap-3 text-xs">
            <span className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">{tipo === 'pagar' ? 'Para quem' : 'De quem'}</span>
            <label className="flex items-center gap-1">
              <input type="radio" checked={modoContra === 'cadastro'} onChange={() => setModoContra('cadastro')} /> {tipo === 'pagar' ? 'Fornecedor cadastrado' : 'Cliente cadastrado'}
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" checked={modoContra === 'livre'} onChange={() => setModoContra('livre')} /> Outro
            </label>
          </div>
          {modoContra === 'cadastro' ? (
            <select
              value={tipo === 'pagar' ? fornecedor : cliente}
              onChange={(e) => (tipo === 'pagar' ? setFornecedor(e.target.value) : setCliente(e.target.value))}
              className={inputClass}
              style={inputStyle}
            >
              <option value="">{editar?.pessoa_id ? `${editar.contraparte} (motorista)` : 'Escolha…'}</option>
              {listaContra.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input value={contraNome} onChange={(e) => setContraNome(e.target.value)} className={inputClass} style={inputStyle} placeholder="Nome" />
              <input value={contraDoc} onChange={(e) => setContraDoc(e.target.value)} className={inputClass} style={inputStyle} placeholder="CPF/CNPJ (opcional)" />
            </div>
          )}
        </div>

        <Campo label="Categoria">
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={inputClass} style={inputStyle}>
            <option value="">Sem categoria</option>
            <OpcoesCategoria categorias={apoio.categorias} tipo={tipo === 'receber' ? 'receita' : 'despesa'} incluirInativas={categoria} />
          </select>
        </Campo>
        <Campo label={pago ? 'Valor (já tem pagamento — não muda)' : 'Valor total (R$)'}>
          <input inputMode="decimal" value={valor} disabled={pago} onChange={(e) => setValor(e.target.value)} className={inputClass} style={inputStyle} placeholder="0,00" />
        </Campo>
        <Campo label="Data do documento / emissão">
          <input type="date" value={emissao} onChange={(e) => setEmissao(e.target.value)} className={inputClass} style={inputStyle} />
        </Campo>
        <Campo label="Competência (mês do resultado)">
          <input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} className={inputClass} style={inputStyle} />
        </Campo>
      </div>

      {/* Vencimentos */}
      {editar ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Campo label="Vencimento">
            <input type="date" value={vencUnico} onChange={(e) => setVencUnico(e.target.value)} className={inputClass} style={inputStyle} />
          </Campo>
          {(editar.status === 'previsto' || editar.status === 'aberto') && (
            <label className="flex items-center gap-2 text-xs mt-6">
              <input type="checkbox" checked={previsto} onChange={(e) => setPrevisto(e.target.checked)} /> Ainda é só previsão (valor/data podem mudar)
            </label>
          )}
        </div>
      ) : (
        !recorrente && (
          <div className="rounded-xl p-3 flex flex-col gap-2.5" style={{ background: 'var(--rbr-muted-bg)' }}>
            <div className="flex gap-1.5 flex-wrap">
              {(
                [
                  ['unico', 'Vencimento único'],
                  ['parcelado', 'Parcelado'],
                  ['regra', 'Usar regra de prazo'],
                  ['manual', 'Parcelas à mão'],
                ] as const
              ).map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    if (k === 'manual' && !parcelasManuais.length) setParcelasManuais(parcelas.map((p) => ({ vencimento: p.vencimento, valor: valorParaInput(p.valor) })))
                    setVencModo(k)
                  }}
                  className="text-[11px] font-bold px-2.5 py-1 rounded-full border"
                  style={{
                    borderColor: vencModo === k ? 'var(--rbr-navy)' : 'var(--rbr-border)',
                    background: vencModo === k ? 'var(--rbr-navy)' : '#fff',
                    color: vencModo === k ? '#fff' : 'var(--rbr-navy-dark)',
                  }}
                >
                  {l}
                </button>
              ))}
            </div>
            {(vencModo === 'unico' || vencModo === 'parcelado') && (
              <div className="grid grid-cols-3 gap-2">
                <Campo label={vencModo === 'unico' ? 'Vencimento' : '1º vencimento'}>
                  <input type="date" value={vencUnico} onChange={(e) => setVencUnico(e.target.value)} className={inputClass} style={inputStyle} />
                </Campo>
                {vencModo === 'parcelado' && (
                  <>
                    <Campo label="Parcelas">
                      <input inputMode="numeric" value={nParc} onChange={(e) => setNParc(e.target.value)} className={inputClass} style={inputStyle} />
                    </Campo>
                    <Campo label="A cada (dias)">
                      <input inputMode="numeric" value={intervalo} onChange={(e) => setIntervalo(e.target.value)} className={inputClass} style={inputStyle} />
                    </Campo>
                  </>
                )}
              </div>
            )}
            {vencModo === 'regra' && (
              <Campo label="Regra (contada a partir da data do documento)">
                <select value={regraId} onChange={(e) => setRegraId(e.target.value)} className={inputClass} style={inputStyle}>
                  <option value="">Escolha…</option>
                  {apoio.condicoes
                    .filter((c) => c.ativa && (c.aplica_a === 'ambos' || c.aplica_a === tipo))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                </select>
              </Campo>
            )}
            {vencModo === 'manual' ? (
              <div className="flex flex-col gap-1.5">
                {parcelasManuais.map((p, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <span className="text-[11px] w-6 text-[color:var(--rbr-muted)]">{i + 1}ª</span>
                    <input
                      type="date"
                      value={p.vencimento}
                      onChange={(e) => setParcelasManuais((ps) => ps.map((x, j) => (j === i ? { ...x, vencimento: e.target.value } : x)))}
                      className={inputClass}
                      style={inputStyle}
                    />
                    <input
                      inputMode="decimal"
                      value={p.valor}
                      onChange={(e) => setParcelasManuais((ps) => ps.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))}
                      className={inputClass}
                      style={inputStyle}
                    />
                    <button type="button" className="text-xs text-[color:var(--rbr-danger)] px-1" onClick={() => setParcelasManuais((ps) => ps.filter((_, j) => j !== i))} aria-label="Remover parcela">
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="self-start text-[11px] font-bold text-[color:var(--rbr-navy)]"
                  onClick={() => setParcelasManuais((ps) => [...ps, { vencimento: ps.length ? addDias(ps[ps.length - 1].vencimento, 30) : hojeISO(), valor: '' }])}
                >
                  + parcela
                </button>
              </div>
            ) : (
              parcelas.length > 1 && (
                <div className="text-[11px] text-[color:var(--rbr-navy-dark)] flex flex-wrap gap-x-3 gap-y-1">
                  {parcelas.map((p, i) => (
                    <span key={i} className="tabular-nums">
                      {i + 1}ª {fmtData(p.vencimento)} · {brl(p.valor)}
                    </span>
                  ))}
                </div>
              )
            )}
            {vencModo === 'regra' && parcelas.length === 1 && <div className="text-[11px] tabular-nums">Vence {fmtData(parcelas[0].vencimento)}</div>}
          </div>
        )
      )}

      <details className="rounded-xl border p-3" style={{ borderColor: 'var(--rbr-border)' }} open={!!(linha || pixCC || numeroDoc)}>
        <summary className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] cursor-pointer">Forma de pagamento, boleto e conta</summary>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
          <Campo label="Forma">
            <select value={forma ?? ''} onChange={(e) => setForma(e.target.value)} className={inputClass} style={inputStyle}>
              <option value="">—</option>
              {Object.entries(FORMA_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Conta prevista">
            <select value={conta ?? ''} onChange={(e) => setConta(e.target.value)} className={inputClass} style={inputStyle}>
              <option value="">Conta padrão</option>
              {apoio.contas
                .filter((c) => c.ativa)
                .map((c) => (
                  <option key={c.id!} value={c.id!}>
                    {c.nome}
                  </option>
                ))}
            </select>
          </Campo>
          <Campo label="Nº do documento / NF">
            <input value={numeroDoc} onChange={(e) => setNumeroDoc(e.target.value)} className={inputClass} style={inputStyle} />
          </Campo>
          <Campo
            label="Linha digitável do boleto"
            className="md:col-span-3"
            dica={
              boleto ? (
                boleto.valido ? (
                  <span style={{ color: 'var(--rbr-positive)' }}>
                    Linha válida{boleto.valor ? ` · ${brl(boleto.valor)}` : ''}
                    {boleto.vencimento ? ` · vence ${fmtData(boleto.vencimento)}` : ''}
                    {boleto.valor && parseValor(valor) && Math.abs(boleto.valor - parseValor(valor)) > 0.01 ? ' · ATENÇÃO: valor diferente do lançamento' : ''}
                  </span>
                ) : (
                  <span style={{ color: 'var(--rbr-danger)' }}>Linha inválida — confira os números</span>
                )
              ) : undefined
            }
          >
            <input value={linha} onChange={(e) => aoMudarLinha(e.target.value)} className={`${inputClass} font-mono`} style={inputStyle} placeholder="Cole a linha digitável ou o código de barras" />
          </Campo>
          {tipo === 'pagar' && (
            <Campo label="Chave Pix do favorecido">
              <input value={chavePix} onChange={(e) => setChavePix(e.target.value)} className={inputClass} style={inputStyle} />
            </Campo>
          )}
          <Campo label="Pix copia e cola" className={tipo === 'pagar' ? 'md:col-span-2' : 'md:col-span-3'}>
            <input value={pixCC} onChange={(e) => setPixCC(e.target.value)} className={`${inputClass} font-mono`} style={inputStyle} />
          </Campo>
        </div>
      </details>

      <Campo label="Observações">
        <input value={obs} onChange={(e) => setObs(e.target.value)} className={inputClass} style={inputStyle} />
      </Campo>

      {!editar && (
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={previsto} onChange={(e) => setPrevisto(e.target.checked)} disabled={jaPago} /> É só uma previsão (entra no fluxo de caixa como previsto)
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={jaPago}
              onChange={(e) => {
                setJaPago(e.target.checked)
                if (e.target.checked) {
                  setRecorrente(false)
                  setPrevisto(false)
                }
              }}
            />
            Já foi {tipo === 'pagar' ? 'pago' : 'recebido'}
          </label>
          {jaPago && (
            <div className="grid grid-cols-2 gap-2 pl-5">
              <input type="date" value={dataPago} onChange={(e) => setDataPago(e.target.value)} className={inputClass} style={inputStyle} />
              <select value={contaPago} onChange={(e) => setContaPago(e.target.value)} className={inputClass} style={inputStyle}>
                {apoio.contas
                  .filter((c) => c.ativa)
                  .map((c) => (
                    <option key={c.id!} value={c.id!}>
                      {c.nome}
                    </option>
                  ))}
              </select>
            </div>
          )}
          {!jaPago && (
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={recorrente} onChange={(e) => setRecorrente(e.target.checked)} /> Repete todo mês/período (despesa ou receita fixa)
            </label>
          )}
          {recorrente && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pl-5">
              <Campo label="Frequência">
                <select value={freq} onChange={(e) => setFreq(e.target.value)} className={inputClass} style={inputStyle}>
                  <option value="semanal">Semanal</option>
                  <option value="mensal">Mensal</option>
                  <option value="bimestral">Bimestral</option>
                  <option value="trimestral">Trimestral</option>
                  <option value="semestral">Semestral</option>
                  <option value="anual">Anual</option>
                </select>
              </Campo>
              <Campo label="Dia do vencimento">
                <input inputMode="numeric" value={diaRec} onChange={(e) => setDiaRec(e.target.value)} className={inputClass} style={inputStyle} />
              </Campo>
              <Campo label="Começa em">
                <input type="date" value={inicioRec} onChange={(e) => setInicioRec(e.target.value)} className={inputClass} style={inputStyle} />
              </Campo>
              <Campo label="Termina em (opcional)">
                <input type="date" value={fimRec} onChange={(e) => setFimRec(e.target.value)} className={inputClass} style={inputStyle} />
              </Campo>
              <label className="flex items-center gap-2 text-xs col-span-2 md:col-span-4">
                <input type="checkbox" checked={valorVariavel} onChange={(e) => setValorVariavel(e.target.checked)} /> O valor muda todo mês (ex.: energia) — entra como previsão até chegar a conta
              </label>
            </div>
          )}
          {docs.length > 0 && (
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={lembrar} onChange={(e) => setLembrar(e.target.checked)} /> Lembrar esta categoria para as próximas notas deste CNPJ/CPF
            </label>
          )}
        </div>
      )}

      {erro && <Aviso>{erro}</Aviso>}
      <div className="flex justify-end gap-2">
        <Botao variante="secundario" onClick={onFechar}>
          Cancelar
        </Botao>
        <Botao onClick={salvar} disabled={salvando || lendoDoc}>
          {salvando ? 'Salvando…' : editar ? 'Salvar alterações' : recorrente ? 'Criar recorrência' : 'Lançar'}
        </Botao>
      </div>
    </Modal>
  )
}

// ============================================================ COBRANÇA
export function CobrancaModal({ lancamentos, onFechar }: { lancamentos: Lancamento[]; onFechar: () => void }) {
  const [texto, setTexto] = useState('')
  const [assunto, setAssunto] = useState('Pagamento em aberto — RBR Cargo')
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const alvo = lancamentos[0]
  const total = lancamentos.reduce((s, l) => s + Number(l.saldo_aberto ?? 0), 0)

  useEffect(() => {
    lerParametro<Record<string, string>>('dados_bancarios_rbr').then((banco) => {
      const vencidos = lancamentos.some((l) => (l.dias_atraso ?? 0) > 0)
      const linhas = lancamentos.map(
        (l) => `• ${l.descricao}${l.fatura_numero ? ` (fatura ${l.fatura_numero})` : ''} — venc. ${fmtData(l.data_vencimento)} — ${brl(l.saldo_aberto)}`,
      )
      const pagto: string[] = []
      const comLinha = lancamentos.find((l) => l.linha_digitavel)
      const comPix = lancamentos.find((l) => l.pix_copia_cola)
      if (comLinha?.linha_digitavel) pagto.push(`Linha digitável: ${formatarLinhaDigitavel(comLinha.linha_digitavel)}`)
      if (comPix?.pix_copia_cola) pagto.push(`Pix copia e cola: ${comPix.pix_copia_cola}`)
      if (!pagto.length && banco) {
        if (banco.pix) pagto.push(`Pix: ${banco.pix}${banco.favorecido ? ` (${banco.favorecido})` : ''}`)
        if (banco.banco && banco.conta) pagto.push(`Banco ${banco.banco} · ag. ${banco.agencia ?? ''} · conta ${banco.conta}`)
      }
      setTexto(
        [
          `Olá${alvo?.contraparte ? `, ${alvo.contraparte}` : ''}! Tudo bem? Aqui é da RBR Cargo.`,
          vencidos ? 'Identificamos em aberto:' : 'Passando para lembrar do vencimento:',
          ...linhas,
          lancamentos.length > 1 ? `Total: ${brl(total)}` : '',
          ...pagto,
          'Se já pagou, pode desconsiderar e nos enviar o comprovante por aqui. Obrigado!',
        ]
          .filter(Boolean)
          .join('\n'),
      )
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function melhorarComIA() {
    setErro(null)
    setGerando(true)
    try {
      const r = await invocarIA<{ mensagem: string; assunto_email: string }>('mensagem_cobranca', { lancamento_ids: lancamentos.map((l) => l.id) })
      setTexto(r.mensagem)
      if (r.assunto_email) setAssunto(r.assunto_email)
    } catch (e) {
      setErro(erroMsg(e))
    } finally {
      setGerando(false)
    }
  }

  return (
    <Modal titulo={`Cobrar ${alvo?.contraparte ?? ''}`} onFechar={onFechar}>
      <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={11} className={`${inputClass} text-[13px] leading-relaxed`} style={inputStyle} />
      {erro && <Aviso>{erro}</Aviso>}
      <div className="flex flex-wrap gap-2 justify-between">
        <Botao variante="ouro" onClick={melhorarComIA} disabled={gerando}>
          {gerando ? 'Escrevendo…' : 'Reescrever com IA (tom pelo atraso)'}
        </Botao>
        <div className="flex gap-2 flex-wrap">
          <Copiar texto={texto} rotulo="Copiar texto" />
          {alvo?.contraparte_email && (
            <a
              className="text-xs font-bold px-3 py-2 rounded-lg border"
              style={{ borderColor: 'var(--rbr-border)', color: 'var(--rbr-navy)' }}
              href={`mailto:${alvo.contraparte_email}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(texto)}`}
            >
              E-mail
            </a>
          )}
          <a className="text-xs font-bold px-3 py-2 rounded-lg" style={{ background: '#1FA855', color: '#fff' }} href={whatsappLink(alvo?.contraparte_whatsapp, texto)} target="_blank" rel="noreferrer">
            Abrir WhatsApp
          </a>
        </div>
      </div>
      {!alvo?.contraparte_whatsapp && <div className="text-[11px] text-[color:var(--rbr-muted)]">Cliente sem WhatsApp no cadastro — o WhatsApp abre para você escolher o contato.</div>}
    </Modal>
  )
}

// ============================================================ DETALHE
interface DocLink {
  papel: string
  documentos_financeiros: { id: string; tipo: string; arquivo_path: string | null; arquivo_nome: string | null; descricao: string | null; valor: number | null } | null
}

export function DetalheLancamento({ id, apoio, onFechar, onMudou }: { id: string; apoio: Apoio; onFechar: () => void; onMudou: () => void }) {
  const [l, setL] = useState<Lancamento | null>(null)
  const [baixas, setBaixas] = useState<{ id: string; data: string; valor: number; juros_multa: number; desconto: number; estornada: boolean; estorno_motivo: string | null; conta_bancaria_id: string | null; forma_pagamento: string | null; comprovante_documento_id: string | null; observacao: string | null; confirmacao_antifraude: string | null }[]>([])
  const [docs, setDocs] = useState<DocLink[]>([])
  const [historico, setHistorico] = useState<{ operacao_log: string; executado_em: string; payload_antes: unknown; payload_depois: unknown }[]>([])
  const [modal, setModal] = useState<'baixa' | 'editar' | 'cobrar' | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [anexando, setAnexando] = useState(false)

  async function carregar() {
    const [a, b, c, d] = await Promise.all([
      supabase.from('v_lancamentos').select('*').eq('id', id).maybeSingle(),
      supabase.from('baixas_financeiras').select('*').eq('lancamento_id', id).order('data'),
      supabase.from('lancamento_documentos').select('papel, documentos_financeiros(id, tipo, arquivo_path, arquivo_nome, descricao, valor)').eq('lancamento_id', id),
      supabase.from('auditoria_financeira').select('operacao_log, executado_em, payload_antes, payload_depois').eq('registro_id', id).order('executado_em', { ascending: false }).limit(20),
    ])
    setL(a.data ?? null)
    setBaixas((b.data ?? []) as typeof baixas)
    setDocs((c.data ?? []) as unknown as DocLink[])
    setHistorico((d.data ?? []) as typeof historico)
  }
  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function cancelar() {
    const motivo = window.prompt('Motivo do cancelamento:')
    if (!motivo?.trim()) return
    const { error } = await supabase.from('lancamentos_financeiros').update({ status: 'cancelado', cancelado_motivo: motivo.trim() }).eq('id', id)
    if (error) return setErro(error.message)
    onMudou()
    carregar()
  }
  async function reabrir() {
    const { error } = await supabase.from('lancamentos_financeiros').update({ status: 'aberto' }).eq('id', id)
    if (error) return setErro(error.message)
    onMudou()
    carregar()
  }
  async function estornar(baixaId: string) {
    const motivo = window.prompt('Motivo do estorno (ex.: pagamento devolvido, lançado errado):')
    if (!motivo?.trim()) return
    const { error } = await supabase.from('baixas_financeiras').update({ estornada: true, estorno_motivo: motivo.trim() }).eq('id', baixaId)
    if (error) return setErro(error.message)
    onMudou()
    carregar()
  }
  async function anexar(file: File) {
    if (!l) return
    setErro(null)
    setAnexando(true)
    try {
      const doc = await enviarDocumento(file, { direcao: l.tipo === 'pagar' ? 'recebido' : 'emitido', operacao_id: l.operacao_id })
      const { error } = await supabase.rpc('vincular_documento_lancamento', { p_documento: doc.id, p_lancamento: l.id!, p_atualizar: false })
      if (error) throw new Error(error.message)
      invocarIA('ler_documento', { documento_id: doc.id }).catch(() => undefined)
      carregar()
    } catch (e) {
      setErro(erroMsg(e))
    } finally {
      setAnexando(false)
    }
  }

  if (!l) return null
  const conta = (cid: string | null) => apoio.contas.find((c) => c.id === cid)?.nome ?? '—'
  const aberto = l.status === 'aberto' || l.status === 'previsto'

  return (
    <>
      <Modal titulo={l.descricao} onFechar={onFechar} largura="max-w-3xl">
        <div className="flex items-center gap-2 flex-wrap">
          <Pill situacao={l.situacao ?? ''} />
          <span className="text-xs text-[color:var(--rbr-muted)]">
            {l.tipo === 'pagar' ? 'A pagar' : 'A receber'} · {l.categoria_nome ?? 'sem categoria'}
            {l.parcela_total ? ` · parcela ${l.parcela_numero}/${l.parcela_total}` : ''}
            {l.fatura_numero ? ` · fatura nº ${l.fatura_numero}` : ''}
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            ['Contraparte', l.contraparte ?? '—'],
            ['Valor', brl(l.valor)],
            ['Em aberto', brl(l.saldo_aberto)],
            ['Vencimento', `${fmtData(l.data_vencimento)}${l.vencimento_estimado ? ' (estimado)' : ''}`],
            ['Competência', fmtData(l.competencia).slice(3)],
            ['Forma', FORMA_LABEL[l.forma_pagamento ?? ''] ?? '—'],
            ['Nº documento', l.numero_documento ?? '—'],
            ['Origem', l.origem === 'operacao' ? 'Operação (automático)' : l.origem === 'recorrencia' ? 'Recorrência' : l.origem === 'imposto' ? 'Imposto (automático)' : l.origem ?? '—'],
          ].map(([k, v]) => (
            <div key={k}>
              <div className="text-[10.5px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">{k}</div>
              <div className="text-sm break-words">{v}</div>
            </div>
          ))}
        </div>
        {l.dias_atraso != null && l.dias_atraso > 0 && aberto && <Aviso tipo="atencao">Vencido há {l.dias_atraso} dia(s).</Aviso>}
        {l.status === 'cancelado' && <Aviso tipo="info">Cancelado: {l.cancelado_motivo}</Aviso>}
        {l.observacoes && <div className="text-xs text-[color:var(--rbr-muted)]">Obs.: {l.observacoes}</div>}
        {l.linha_digitavel && (
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <span className="text-[color:var(--rbr-muted)]">Linha digitável:</span>
            <span className="font-mono break-all">{formatarLinhaDigitavel(l.linha_digitavel)}</span>
            <Copiar texto={l.linha_digitavel} />
          </div>
        )}
        {(l.chave_pix_destino || l.contraparte_pix) && l.tipo === 'pagar' && (
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <span className="text-[color:var(--rbr-muted)]">Pix:</span>
            <span className="font-mono">{l.chave_pix_destino || l.contraparte_pix}</span>
            <Copiar texto={(l.chave_pix_destino || l.contraparte_pix) as string} />
          </div>
        )}
        {l.operacao_id && (
          <Link to={`/operacoes?op=${l.operacao_id}`} className="text-xs font-bold text-[color:var(--rbr-navy)] underline self-start">
            Ver operação
          </Link>
        )}

        <div className="flex flex-wrap gap-2">
          {aberto && <Botao onClick={() => setModal('baixa')}>{l.tipo === 'pagar' ? 'Registrar pagamento' : 'Registrar recebimento'}</Botao>}
          {l.status !== 'cancelado' && (
            <Botao variante="secundario" onClick={() => setModal('editar')}>
              Editar
            </Botao>
          )}
          {aberto && l.tipo === 'receber' && (
            <Botao variante="secundario" onClick={() => setModal('cobrar')}>
              Cobrar
            </Botao>
          )}
          <label className="text-xs font-bold px-3 py-2 rounded-lg border cursor-pointer" style={{ borderColor: 'var(--rbr-border)', color: 'var(--rbr-navy)' }}>
            {anexando ? 'Anexando…' : 'Anexar documento'}
            <input
              type="file"
              accept=".pdf,.xml,image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) anexar(f)
              }}
            />
          </label>
          {aberto && Number(l.valor_pago) === 0 && (
            <Botao variante="perigo" onClick={cancelar}>
              Cancelar lançamento
            </Botao>
          )}
          {l.status === 'cancelado' && l.origem !== 'operacao' && (
            <Botao variante="secundario" onClick={reabrir}>
              Reabrir
            </Botao>
          )}
        </div>
        {erro && <Aviso>{erro}</Aviso>}

        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] mb-1.5">Pagamentos registrados</div>
          {baixas.length === 0 ? (
            <div className="text-xs text-[color:var(--rbr-muted)]">Nenhum.</div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {baixas.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-2 text-xs border rounded-lg px-3 py-2 flex-wrap" style={{ borderColor: 'var(--rbr-border)', opacity: b.estornada ? 0.55 : 1 }}>
                  <span>
                    {fmtData(b.data)} · <b className="tabular-nums">{brl(Number(b.valor))}</b>
                    {Number(b.juros_multa) > 0 && ` (juros ${brl(Number(b.juros_multa))})`}
                    {Number(b.desconto) > 0 && ` (desconto ${brl(Number(b.desconto))})`} · {conta(b.conta_bancaria_id)}
                    {b.forma_pagamento ? ` · ${FORMA_LABEL[b.forma_pagamento] ?? b.forma_pagamento}` : ''}
                    {b.confirmacao_antifraude ? ` · confirmado: ${b.confirmacao_antifraude}` : ''}
                    {b.estornada ? ` · ESTORNADO: ${b.estorno_motivo}` : ''}
                  </span>
                  {!b.estornada && (
                    <button type="button" className="text-[11px] font-bold text-[color:var(--rbr-danger)]" onClick={() => estornar(b.id)}>
                      Estornar
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] mb-1.5">Documentos</div>
          {docs.length === 0 ? (
            <div className="text-xs text-[color:var(--rbr-muted)]">Nenhum documento anexado.</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {docs.map((d) =>
                d.documentos_financeiros ? (
                  <button
                    key={d.documentos_financeiros.id}
                    type="button"
                    className="text-xs px-3 py-1.5 rounded-lg border"
                    style={{ borderColor: 'var(--rbr-border)' }}
                    onClick={() => d.documentos_financeiros?.arquivo_path && abrirArquivo(d.documentos_financeiros.arquivo_path).catch((e) => setErro(erroMsg(e)))}
                  >
                    {d.papel === 'comprovante' ? 'Comprovante' : d.documentos_financeiros.descricao ?? d.documentos_financeiros.arquivo_nome ?? 'Documento'}
                  </button>
                ) : null,
              )}
            </div>
          )}
        </div>

        {historico.length > 0 && (
          <details>
            <summary className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] cursor-pointer">Histórico ({historico.length})</summary>
            <div className="flex flex-col gap-1 mt-2">
              {historico.map((h, i) => {
                const antes = (h.payload_antes ?? {}) as Record<string, unknown>
                const depois = (h.payload_depois ?? {}) as Record<string, unknown>
                const campos = ['status', 'valor', 'data_vencimento', 'valor_pago', 'descricao', 'categoria_id'].filter((k) => JSON.stringify(antes[k]) !== JSON.stringify(depois[k]))
                return (
                  <div key={i} className="text-[11px] text-[color:var(--rbr-muted)]">
                    {new Date(h.executado_em).toLocaleString('pt-BR')} · {h.operacao_log === 'insert' ? 'criado' : h.operacao_log === 'update' ? 'alterado' : h.operacao_log}
                    {h.operacao_log === 'update' && campos.length > 0 && `: ${campos.map((k) => `${k} ${String(antes[k] ?? '—')} → ${String(depois[k] ?? '—')}`).join('; ')}`}
                  </div>
                )
              })}
            </div>
          </details>
        )}
        {l.data_vencimento && l.data_vencimento_original && l.data_vencimento !== l.data_vencimento_original && (
          <div className="text-[11px] text-[color:var(--rbr-muted)]">
            Vencimento original {fmtData(l.data_vencimento_original)} ({diffDias(l.data_vencimento, l.data_vencimento_original) > 0 ? '+' : ''}
            {diffDias(l.data_vencimento, l.data_vencimento_original)} dias)
          </div>
        )}
      </Modal>
      {modal === 'baixa' && (
        <BaixaModal
          lancamentos={[l]}
          apoio={apoio}
          onFechar={() => setModal(null)}
          onFeito={() => {
            onMudou()
            carregar()
          }}
        />
      )}
      {modal === 'editar' && (
        <LancamentoForm
          tipoInicial={l.tipo as TipoLanc}
          apoio={apoio}
          editar={l}
          onFechar={() => setModal(null)}
          onSalvo={() => {
            onMudou()
            carregar()
          }}
        />
      )}
      {modal === 'cobrar' && <CobrancaModal lancamentos={[l]} onFechar={() => setModal(null)} />}
    </>
  )
}

