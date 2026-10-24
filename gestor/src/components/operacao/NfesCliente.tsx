import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { formatMoney } from '@rbr/shared/format'
import {
  conferirNotas,
  dadosDaChave,
  lerXmlNotaOuCte,
  notaDaCotacao,
  notaDigitada,
  totaisNotas,
  type AvisoNota,
  type NfDaCotacao,
  type NotaOperacao,
} from '@rbr/shared/nfeOperacao'

// Passo 4: NF-e do CLIENTE na operação. A RBR não emite NF-e em operação real; o CT-e/MDF-e citam as notas do
// embarcador. Uma carga pode ter várias notas (operacao_nfes). XML no bucket privado operacao-nfe/<operacao>/<chave>.xml.
// Conferências só avisam. Usado na etapa do CT-e (linha do tempo) e na tela Fiscal.

type Linha = NotaOperacao & { id: string; arquivo_xml_path: string | null }
type Pendente = { nota: NotaOperacao; xml: string; nomeArquivo: string }

const inputClass = 'border rounded-lg px-3 py-2 text-sm outline-none w-full bg-white'
const inputStyle = { borderColor: 'var(--rbr-border)' }
const labelClass = 'text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] mb-1.5 block'
const COLUNAS =
  'id, chave_acesso, numero, serie, emitente_cnpj, emitente_nome, destinatario_cnpj, destinatario_nome, valor, peso_kg, ncm, ncms, produto_predominante, quantidade_volumes, data_emissao, municipio_origem, uf_origem, municipio_destino, uf_destino, origem, arquivo_xml_path'

const numOuNull = (v: string) => {
  const t = v.trim()
  if (!t) return null
  const n = Number(t.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}

// Resumo das notas da operação (para o pré-voo e cards). Exportado para a tela Fiscal.
export function resumoNfes(qtd: number, valor: number) {
  return qtd === 0 ? 'NF-e do cliente: nenhuma nota' : `NF-e do cliente: ${qtd} nota(s), valor ${formatMoney(valor)}`
}

export default function NfesCliente({ operacaoId, onMudou }: { operacaoId: string; onMudou?: () => void }) {
  const [notas, setNotas] = useState<Linha[] | null>(null)
  const [cotacao, setCotacao] = useState<NfDaCotacao | null>(null)
  const [clienteCnpj, setClienteCnpj] = useState<string | null>(null)
  const [duplicadas, setDuplicadas] = useState<string[]>([])
  const [pendentes, setPendentes] = useState<Pendente[]>([])
  const [erros, setErros] = useState<string[]>([])
  const [salvando, setSalvando] = useState(false)
  const [arrastando, setArrastando] = useState(false)
  const [digitar, setDigitar] = useState(false)
  const [form, setForm] = useState({ chave: '', numero: '', serie: '', emitente: '', destinatario: '', valor: '', peso: '', ncm: '' })
  const inputArquivo = useRef<HTMLInputElement>(null)

  const carregar = useCallback(async () => {
    const [n, o] = await Promise.all([
      supabase.from('operacao_nfes').select(COLUNAS).eq('operacao_id', operacaoId).order('created_at'),
      supabase
        .from('operacoes')
        .select(
          'cliente_id, cotacoes(nf_chave_acesso, nf_numero, nf_serie, nf_remetente_cnpj, nf_remetente_razao_social, nf_destinatario_cnpj, nf_destinatario_razao_social, nf_data_emissao, nf_produto_predominante, nf_quantidade_volumes, valor_nf, peso_bruto_kg, ncms_produtos, cidade_origem, uf_origem, cidade_destino, uf_destino, cliente_id)',
        )
        .eq('id', operacaoId)
        .maybeSingle(),
    ])
    const lista = (n.data ?? []) as unknown as Linha[]
    setNotas(lista)
    const cot = ((o.data as { cotacoes?: unknown } | null)?.cotacoes ?? null) as (NfDaCotacao & { cliente_id: string | null }) | null
    setCotacao(cot)
    const clienteId = (o.data as { cliente_id?: string | null } | null)?.cliente_id ?? cot?.cliente_id ?? null
    if (clienteId) {
      const { data: cl } = await supabase.from('clientes').select('cnpj, cpf').eq('id', clienteId).maybeSingle()
      setClienteCnpj((cl as { cnpj?: string | null; cpf?: string | null } | null)?.cnpj ?? (cl as { cpf?: string | null } | null)?.cpf ?? null)
    }
    if (lista.length) {
      const { data: dup } = await supabase.rpc('nfes_em_outra_operacao', { p_operacao: operacaoId, p_chaves: lista.map((x) => x.chave_acesso) })
      setDuplicadas((dup as string[] | null) ?? [])
    } else setDuplicadas([])
  }, [operacaoId])

  useEffect(() => {
    void carregar()
  }, [carregar])

  if (notas === null) return null
  const jaTem = new Set([...notas.map((x) => x.chave_acesso), ...pendentes.map((p) => p.nota.chave_acesso)])

  async function lerArquivos(files: FileList | File[]) {
    const novos: Pendente[] = []
    const problemas: string[] = []
    for (const f of Array.from(files)) {
      const xml = await f.text()
      const r = lerXmlNotaOuCte(xml)
      if (r.tipo === 'invalido') {
        problemas.push(`${f.name}: ${r.motivo}`)
      } else if (r.tipo === 'nfe') {
        if (jaTem.has(r.nota.chave_acesso) || novos.some((p) => p.nota.chave_acesso === r.nota.chave_acesso)) problemas.push(`${f.name}: nota já está na lista.`)
        else novos.push({ nota: r.nota, xml, nomeArquivo: f.name })
      } else {
        // XML do CT-e autorizado: entram as chaves das NF-e que ele cita (dados mínimos tirados da própria chave).
        for (const chave of r.chaves) {
          if (jaTem.has(chave) || novos.some((p) => p.nota.chave_acesso === chave)) continue
          const k = dadosDaChave(chave)
          const d = notaDigitada({ chave, numero: k.numero, serie: k.serie, emitenteCnpj: k.cnpjEmitente })
          if (d.ok) novos.push({ nota: { ...d.nota, origem: 'xml' }, xml, nomeArquivo: f.name })
        }
      }
    }
    setPendentes((p) => [...p, ...novos])
    setErros(problemas)
  }

  async function gravar(nota: NotaOperacao, xml: string | null) {
    let path: string | null = null
    if (xml) {
      path = `${operacaoId}/${nota.chave_acesso}.xml`
      const { error: eu } = await supabase.storage.from('operacao-nfe').upload(path, new Blob([xml], { type: 'text/xml' }), { upsert: true, contentType: 'text/xml' })
      if (eu) throw new Error(`Não consegui guardar o XML: ${eu.message}`)
    }
    const { data: pid } = await supabase.rpc('current_pessoa_id')
    const { error } = await supabase.from('operacao_nfes').insert({ ...nota, operacao_id: operacaoId, arquivo_xml_path: path, criado_por: (pid as string | null) ?? null })
    if (error) throw new Error(error.code === '23505' ? 'Esta nota já está na operação.' : error.message)
  }

  async function executar(fn: () => Promise<void>) {
    setSalvando(true)
    setErros([])
    try {
      await fn()
      await carregar()
      onMudou?.()
    } catch (e) {
      setErros([e instanceof Error ? e.message : 'Erro ao salvar a nota.'])
    } finally {
      setSalvando(false)
    }
  }

  const confirmarPendentes = () =>
    executar(async () => {
      for (const p of pendentes) await gravar(p.nota, p.xml)
      setPendentes([])
    })

  const salvarDigitada = () =>
    executar(async () => {
      const valor = numOuNull(form.valor)
      const peso = numOuNull(form.peso)
      if (Number.isNaN(valor) || Number.isNaN(peso)) throw new Error('Valor ou peso inválido.')
      const r = notaDigitada({ chave: form.chave, numero: form.numero, serie: form.serie, emitenteCnpj: form.emitente, destinatarioCnpj: form.destinatario, valor, pesoKg: peso, ncm: form.ncm })
      if (!r.ok) throw new Error(r.mensagem)
      await gravar(r.nota, null)
      setForm({ chave: '', numero: '', serie: '', emitente: '', destinatario: '', valor: '', peso: '', ncm: '' })
      setDigitar(false)
    })

  const usarDaCotacao = () =>
    executar(async () => {
      if (!cotacao) throw new Error('Operação sem cotação.')
      const r = notaDaCotacao(cotacao)
      if (!r.ok) throw new Error(r.mensagem)
      await gravar(r.nota, null)
    })

  const remover = (n: Linha) =>
    executar(async () => {
      if (!window.confirm(`Tirar a NF ${n.numero ?? ''} desta operação?`)) return
      const { error } = await supabase.from('operacao_nfes').delete().eq('id', n.id)
      if (error) throw error
      if (n.arquivo_xml_path) await supabase.storage.from('operacao-nfe').remove([n.arquivo_xml_path])
    })

  async function baixarXml(n: Linha) {
    if (!n.arquivo_xml_path) return
    const { data } = await supabase.storage.from('operacao-nfe').createSignedUrl(n.arquivo_xml_path, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener')
  }

  const totais = totaisNotas(notas)
  const avisos: AvisoNota[] = conferirNotas(notas, {
    clienteCnpj,
    cidadeOrigem: cotacao?.cidade_origem ?? null,
    ufOrigem: cotacao?.uf_origem ?? null,
    cidadeDestino: cotacao?.cidade_destino ?? null,
    ufDestino: cotacao?.uf_destino ?? null,
    valorCargaCotacao: cotacao?.valor_nf ?? null,
    duplicadasEmOutraOperacao: duplicadas,
  })
  const cotacaoTemNf = Boolean(cotacao?.nf_chave_acesso) && !jaTem.has(String(cotacao?.nf_chave_acesso).replace(/\D/g, ''))

  return (
    <div className="rounded-xl border p-3.5 flex flex-col gap-3" style={{ borderColor: 'var(--rbr-border)' }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-sm font-bold text-[color:var(--rbr-navy-dark)]">NF-e do cliente</div>
        <span className="text-xs tabular-nums" style={{ color: totais.quantidade ? 'var(--rbr-positive)' : 'var(--rbr-danger)' }}>
          {resumoNfes(totais.quantidade, totais.valor)}
          {totais.pesoKg > 0 && ` · ${totais.pesoKg.toLocaleString('pt-BR')} kg`}
        </span>
      </div>

      {notas.length > 0 && (
        <div className="flex flex-col gap-2">
          {notas.map((n) => (
            <ResumoNota key={n.id} n={n} acoes={
              <div className="flex gap-3 text-[11px]">
                {n.arquivo_xml_path && (
                  <button type="button" onClick={() => void baixarXml(n)} className="underline font-semibold" style={{ color: 'var(--rbr-navy)' }}>
                    XML
                  </button>
                )}
                <button type="button" disabled={salvando} onClick={() => void remover(n)} className="underline font-semibold disabled:opacity-60" style={{ color: 'var(--rbr-danger)' }}>
                  Tirar
                </button>
              </div>
            } />
          ))}
        </div>
      )}

      {avisos.map((a, i) => (
        <div key={`${a.codigo}-${a.chave ?? 'todas'}-${i}`} className="text-xs rounded-lg px-3 py-2" style={{ background: '#FDF1DC', color: '#8A5A00' }}>
          {a.mensagem}
        </div>
      ))}

      {pendentes.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg p-2.5" style={{ background: 'var(--rbr-muted-bg)' }}>
          <div className="text-xs font-bold text-[color:var(--rbr-navy-dark)]">Confira antes de salvar ({pendentes.length})</div>
          {pendentes.map((p) => (
            <ResumoNota key={p.nota.chave_acesso} n={p.nota} arquivo={p.nomeArquivo} acoes={
              <button type="button" onClick={() => setPendentes((xs) => xs.filter((x) => x.nota.chave_acesso !== p.nota.chave_acesso))} className="text-[11px] underline font-semibold" style={{ color: 'var(--rbr-danger)' }}>
                Descartar
              </button>
            } />
          ))}
          <button type="button" disabled={salvando} onClick={() => void confirmarPendentes()} className="self-start text-xs font-bold px-3.5 py-2 rounded-lg disabled:opacity-60" style={{ background: 'var(--rbr-navy)', color: '#fff' }}>
            {salvando ? 'Salvando…' : `Salvar ${pendentes.length} nota(s)`}
          </button>
        </div>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setArrastando(true)
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault()
          setArrastando(false)
          void lerArquivos(e.dataTransfer.files)
        }}
        onClick={() => inputArquivo.current?.click()}
        className="rounded-lg border-2 border-dashed px-3 py-4 text-center text-xs cursor-pointer"
        style={{ borderColor: arrastando ? 'var(--rbr-navy)' : 'var(--rbr-border)', color: 'var(--rbr-muted)' }}
      >
        Arraste aqui o XML de uma ou várias NF-e (ou o XML do CT-e/NF-e autorizado), ou clique para escolher. Não precisa de PDF.
        <input
          ref={inputArquivo}
          type="file"
          accept=".xml,text/xml,application/xml"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void lerArquivos(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      <div className="flex gap-3 flex-wrap text-xs">
        {cotacaoTemNf && (
          <button type="button" disabled={salvando} onClick={() => void usarDaCotacao()} className="font-bold underline disabled:opacity-60" style={{ color: 'var(--rbr-navy)' }}>
            Usar a NF da cotação (NF {cotacao?.nf_numero ?? ''})
          </button>
        )}
        <button type="button" onClick={() => setDigitar((v) => !v)} className="font-bold underline" style={{ color: 'var(--rbr-navy)' }}>
          {digitar ? 'Fechar digitação' : 'Sem XML: digitar a chave'}
        </button>
      </div>

      {digitar && (
        <div className="flex flex-col gap-2 rounded-lg p-2.5 border" style={{ borderColor: 'var(--rbr-border)' }}>
          <div>
            <label className={labelClass}>Chave de acesso (44 dígitos)</label>
            <input inputMode="numeric" value={form.chave} onChange={(e) => setForm({ ...form, chave: e.target.value })} className={inputClass} style={inputStyle} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {(
              [
                ['numero', 'Número'],
                ['serie', 'Série'],
                ['emitente', 'CNPJ emitente'],
                ['destinatario', 'CNPJ destinatário'],
                ['valor', 'Valor total (R$)'],
                ['peso', 'Peso bruto (kg)'],
                ['ncm', 'NCM'],
              ] as const
            ).map(([k, rotulo]) => (
              <div key={k}>
                <label className={labelClass}>{rotulo}</label>
                <input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className={inputClass} style={inputStyle} />
              </div>
            ))}
          </div>
          <div className="text-[11px] text-[color:var(--rbr-muted)]">Fica marcada como "digitado, sem XML". Número, série e emitente saem da chave se ficarem em branco.</div>
          <button type="button" disabled={salvando} onClick={() => void salvarDigitada()} className="self-start text-xs font-bold px-3.5 py-2 rounded-lg disabled:opacity-60" style={{ background: 'var(--rbr-navy)', color: '#fff' }}>
            Salvar nota digitada
          </button>
        </div>
      )}

      {erros.map((e) => (
        <div key={e} className="text-xs rounded-lg px-3 py-2" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
          {e}
        </div>
      ))}
    </div>
  )
}

const ORIGEM_LABEL: Record<string, string> = { xml: 'XML', digitada: 'digitado, sem XML', cotacao: 'da cotação' }

function ResumoNota({ n, acoes, arquivo }: { n: NotaOperacao; acoes?: React.ReactNode; arquivo?: string }) {
  const cidades = [n.municipio_origem && `${n.municipio_origem}/${n.uf_origem ?? ''}`, n.municipio_destino && `${n.municipio_destino}/${n.uf_destino ?? ''}`].filter(Boolean).join(' → ')
  return (
    <div className="rounded-lg border px-3 py-2 text-xs flex flex-col gap-1 bg-white" style={{ borderColor: 'var(--rbr-border)' }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <b>
          NF {n.numero ?? '—'} · série {n.serie ?? '—'}
        </b>
        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full" style={{ background: 'var(--rbr-muted-bg)', color: 'var(--rbr-navy)' }}>
          {ORIGEM_LABEL[n.origem] ?? n.origem}
        </span>
      </div>
      <div className="tabular-nums break-all text-[color:var(--rbr-muted)]">{n.chave_acesso}</div>
      <div>
        Emitente {n.emitente_nome ?? ''} {n.emitente_cnpj ? `(${n.emitente_cnpj})` : ''} · Destinatário {n.destinatario_nome ?? ''} {n.destinatario_cnpj ? `(${n.destinatario_cnpj})` : ''}
      </div>
      <div className="tabular-nums">
        {formatMoney(n.valor)} · {n.peso_kg != null ? `${n.peso_kg.toLocaleString('pt-BR')} kg` : 'peso —'} · NCM {n.ncm ?? '—'}
        {cidades && ` · ${cidades}`}
      </div>
      {arquivo && <div className="text-[color:var(--rbr-muted)]">arquivo: {arquivo}</div>}
      {acoes}
    </div>
  )
}
