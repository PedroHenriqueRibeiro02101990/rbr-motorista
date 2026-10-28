import { useEffect, useMemo, useState } from 'react'
import { jsPDF } from 'jspdf'
import { supabase } from '@rbr/shared/supabaseClient'
import { desenharOrdemColeta } from '@rbr/shared/ordemColetaPdf'
import { formatDateTime } from '@rbr/shared/format'
import { faltasOrdem, ordemCompleta, rascunhoOrdemColeta, type RascunhoOrdem } from '../../lib/ordemColeta'
import type { DetalheOperacao, Pessoa } from '../../lib/operacaoDetalhe'

// Ordem de coleta (menu "Mais ações" da operação): o gestor confere o rascunho, gera o PDF do motorista, guarda em
// operacao-documentos/<operacao>/ordem-coleta/v<n>.pdf e registra a versão em ordens_coleta. Não muda o status da
// operação nem o "Liberar para coleta". O motorista abre a ordem no app (gera o mesmo PDF a partir da linha).
const inputClass = 'border rounded-lg px-3 py-2 text-sm outline-none w-full bg-white'
const inputStyle = { borderColor: 'var(--rbr-border)' }
const labelClass = 'text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] mb-1 block'

type Versao = { versao: number; gerada_em: string; pdf_path: string | null }

// datetime-local usa horário local sem fuso; o banco guarda ISO.
const paraCampo = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export default function OrdemColeta({ d, gestor }: { d: DetalheOperacao; gestor: Pessoa }) {
  const fonte = useMemo(
    () => ({
      operacao: d.operacao,
      cotacao: d.cotacao,
      cliente: d.cliente,
      documentos: d.documentos,
      motorista: d.motorista,
      veiculo: d.veiculo,
      empresa: d.empresa,
    }),
    [d],
  )
  const [r, setR] = useState<RascunhoOrdem>(() => rascunhoOrdemColeta(fonte))
  const [versoes, setVersoes] = useState<Versao[]>([])
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const carregar = async () => {
    const { data } = await supabase
      .from('ordens_coleta')
      .select('versao, gerada_em, pdf_path')
      .eq('operacao_id', d.operacao.id)
      .is('cancelada_em', null)
      .order('versao', { ascending: false })
    setVersoes((data ?? []) as Versao[])
  }
  useEffect(() => {
    void carregar()
  }, [d.operacao.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const faltas = faltasOrdem(r)
  const campo = <K extends keyof RascunhoOrdem>(k: K, v: RascunhoOrdem[K]) => setR((x) => ({ ...x, [k]: v }))

  function baixar(blob: Blob, nome: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = nome
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  async function gerar() {
    setErro(null)
    setOk(null)
    if (!r.endereco_carregamento.trim() || !r.cidade_carregamento.trim() || r.uf_carregamento.trim().length !== 2) {
      setErro('Preencha o endereço, a cidade e a UF do carregamento.')
      return
    }
    setOcupado(true)
    try {
      const { data: ult } = await supabase.from('ordens_coleta').select('versao').eq('operacao_id', d.operacao.id).order('versao', { ascending: false }).limit(1)
      const versao = (ult?.[0]?.versao ?? 0) + 1
      const ordem = ordemCompleta(fonte, r, versao)
      const doc = new jsPDF({ unit: 'mm', format: 'a4' })
      desenharOrdemColeta(doc, ordem)
      const blob = doc.output('blob')
      const path = `${d.operacao.id}/ordem-coleta/v${versao}.pdf`
      const { error: upErr } = await supabase.storage.from('operacao-documentos').upload(path, blob, { contentType: 'application/pdf', upsert: false })
      if (upErr) throw new Error(`Não consegui guardar o PDF: ${upErr.message}`)
      const { error: insErr } = await supabase.from('ordens_coleta').insert({
        operacao_id: d.operacao.id,
        versao,
        endereco_carregamento: r.endereco_carregamento.trim(),
        cep_carregamento: (r.cep_carregamento ?? '').replace(/\D/g, '') || null,
        cidade_carregamento: r.cidade_carregamento.trim(),
        uf_carregamento: r.uf_carregamento.trim().toUpperCase(),
        contato_nome: r.contato_nome?.trim() || null,
        contato_telefone: r.contato_telefone?.trim() || null,
        coleta_prevista_em: r.coleta_prevista_em,
        carga_descricao: r.carga_descricao?.trim() || null,
        peso_kg: r.peso_kg,
        volumes: r.volumes,
        documentos: r.documentos,
        observacoes: r.observacoes?.trim() || null,
        pdf_path: path,
        gerada_por: gestor.id,
      })
      if (insErr) throw new Error(`O PDF foi guardado, mas não consegui registrar a ordem: ${insErr.message}`)
      baixar(blob, `ordem-coleta-${ordem.codigo}.pdf`)
      setOk(`Ordem ${ordem.codigo} gerada. O motorista já vê no app quando a carga estiver liberada.`)
      await carregar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }

  async function abrir(v: Versao) {
    if (!v.pdf_path) return
    const { data, error } = await supabase.storage.from('operacao-documentos').createSignedUrl(v.pdf_path, 300)
    if (error || !data) return setErro('Não consegui abrir o PDF.')
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  const celular = (d.motorista?.celular ?? '').replace(/\D/g, '')
  const whatsapp = celular
    ? `https://wa.me/${celular.length <= 11 ? `55${celular}` : celular}?text=${encodeURIComponent('Olá! A ordem de coleta da sua carga está no app da RBR, na aba Cargas. Confira o endereço, o contato e o horário.')}`
    : null

  return (
    <div className="flex flex-col gap-3 text-xs">
      <div className="text-[color:var(--rbr-muted)]">
        PDF para o motorista com local de carregamento, contato, data, carga e documentos. Não muda o status da operação nem o “Liberar para coleta”.
      </div>
      {faltas.length > 0 && (
        <div className="rounded-lg px-3 py-2" style={{ background: 'var(--rbr-warning-bg)', color: 'var(--rbr-navy-dark)' }}>
          Confira: {faltas.join(', ')}.
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <div className="md:col-span-4">
          <label className={labelClass}>Endereço de carregamento</label>
          <input className={inputClass} style={inputStyle} value={r.endereco_carregamento} onChange={(e) => campo('endereco_carregamento', e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>CEP</label>
          <input className={inputClass} style={inputStyle} inputMode="numeric" value={r.cep_carregamento ?? ''} onChange={(e) => campo('cep_carregamento', e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <label className={labelClass}>Cidade</label>
          <input className={inputClass} style={inputStyle} value={r.cidade_carregamento} onChange={(e) => campo('cidade_carregamento', e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>UF</label>
          <input className={inputClass} style={inputStyle} maxLength={2} value={r.uf_carregamento} onChange={(e) => campo('uf_carregamento', e.target.value.toUpperCase())} />
        </div>
        <div className="md:col-span-2">
          <label className={labelClass}>Contato no local</label>
          <input className={inputClass} style={inputStyle} value={r.contato_nome ?? ''} onChange={(e) => campo('contato_nome', e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Telefone do contato</label>
          <input className={inputClass} style={inputStyle} inputMode="tel" value={r.contato_telefone ?? ''} onChange={(e) => campo('contato_telefone', e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Data e hora da coleta</label>
          <input
            type="datetime-local"
            className={inputClass}
            style={inputStyle}
            value={paraCampo(r.coleta_prevista_em)}
            onChange={(e) => campo('coleta_prevista_em', e.target.value ? new Date(e.target.value).toISOString() : null)}
          />
        </div>
        <div className="md:col-span-2">
          <label className={labelClass}>Carga</label>
          <input className={inputClass} style={inputStyle} value={r.carga_descricao ?? ''} onChange={(e) => campo('carga_descricao', e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Peso (kg)</label>
          <input className={inputClass} style={inputStyle} inputMode="decimal" value={r.peso_kg ?? ''} onChange={(e) => campo('peso_kg', e.target.value ? Number(e.target.value.replace(',', '.')) : null)} />
        </div>
        <div>
          <label className={labelClass}>Volumes</label>
          <input className={inputClass} style={inputStyle} inputMode="numeric" value={r.volumes ?? ''} onChange={(e) => campo('volumes', e.target.value ? Number(e.target.value) : null)} />
        </div>
        <div className="md:col-span-4">
          <label className={labelClass}>Observações</label>
          <textarea className={inputClass} style={inputStyle} rows={2} value={r.observacoes ?? ''} onChange={(e) => campo('observacoes', e.target.value)} placeholder="Ex.: portaria fecha às 17h, levar EPI" />
        </div>
      </div>
      <div className="text-[color:var(--rbr-muted)]">
        Documentos na ordem: {r.documentos.length ? r.documentos.map((x) => `${x.tipo.toUpperCase()}${x.numero ? ` nº ${x.numero}` : ''}`).join(', ') : 'nenhum emitido ainda'}
      </div>
      {erro && (
        <div role="alert" className="rounded-lg px-3 py-2" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
          {erro}
        </div>
      )}
      {ok && (
        <div className="rounded-lg px-3 py-2 flex items-center gap-3 flex-wrap" style={{ background: '#E7F5EC', color: 'var(--rbr-positive)' }}>
          {ok}
          {whatsapp && (
            <a href={whatsapp} target="_blank" rel="noopener" className="font-bold underline">
              Avisar o motorista no WhatsApp
            </a>
          )}
        </div>
      )}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          disabled={ocupado}
          onClick={() => void gerar()}
          className="text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-60"
          style={{ background: 'var(--rbr-navy)', color: '#fff' }}
        >
          {ocupado ? 'Gerando…' : versoes.length ? `Gerar nova versão (v${versoes[0].versao + 1})` : 'Gerar ordem de coleta (PDF)'}
        </button>
        {versoes.map((v) => (
          <button key={v.versao} type="button" onClick={() => void abrir(v)} className="underline font-semibold" style={{ color: 'var(--rbr-navy)' }}>
            v{v.versao} · {formatDateTime(v.gerada_em)}
          </button>
        ))}
      </div>
    </div>
  )
}
