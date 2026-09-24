import { useEffect, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import type { Json } from '@rbr/shared/database.types'
import { IconCheck } from '@rbr/shared/icons'
import type { AssessoriaContato, Apolice } from '../../lib/operacaoDetalhe'
import { parseBRL } from './OperacaoFluxo'

const inputClass = 'border rounded-lg px-3 py-2 text-sm outline-none w-full bg-white'
const inputStyle = { borderColor: 'var(--rbr-border)' }
const labelClass = 'text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] mb-1.5 block'

// Dados fixos que toda ficha de emissão usa: contato da assessoria, IE da RBR e apólice de seguro vigente.
export default function DadosEmissao({ onSalvo }: { onSalvo: (a: AssessoriaContato) => void }) {
  const [assessoria, setAssessoria] = useState<AssessoriaContato>({ nome: '', whatsapp: '', email: '' })
  const [empresa, setEmpresa] = useState<Record<string, unknown>>({})
  const [ie, setIe] = useState('')
  const [apolice, setApolice] = useState<Partial<Apolice>>({})
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('parametros_sistema').select('chave, valor').in('chave', ['assessoria_contato', 'dados_empresa']),
      supabase.from('apolices_seguro').select('*').order('vigencia_inicio', { ascending: false }).limit(1),
    ]).then(([p, a]) => {
      for (const r of p.data ?? []) {
        if (r.chave === 'assessoria_contato') setAssessoria({ nome: '', whatsapp: '', email: '', ...(r.valor as object) })
        if (r.chave === 'dados_empresa') {
          const emp = (r.valor ?? {}) as Record<string, unknown>
          setEmpresa(emp)
          setIe(String(emp.inscricao_estadual ?? ''))
        }
      }
      setApolice(a.data?.[0] ?? { responsavel_seguro: 'emitente', tipo: 'RCTR-C' })
    })
  }, [])

  async function salvar() {
    setErro(null)
    setOk(null)
    setSalvando(true)
    try {
      const r1 = await supabase
        .from('parametros_sistema')
        .update({ valor: assessoria as unknown as Json, updated_at: new Date().toISOString() })
        .eq('chave', 'assessoria_contato')
      if (r1.error) throw r1.error
      const r2 = await supabase
        .from('parametros_sistema')
        .update({ valor: { ...empresa, inscricao_estadual: ie.trim() || null } as unknown as Json, updated_at: new Date().toISOString() })
        .eq('chave', 'dados_empresa')
      if (r2.error) throw r2.error
      const temApolice = apolice.seguradora_nome || apolice.numero_apolice || apolice.teto_cobertura_por_embarque
      if (temApolice) {
        const teto = parseBRL(String(apolice.teto_cobertura_por_embarque ?? ''))
        if (!Number.isFinite(teto) || teto <= 0) throw new Error('Informe o teto de cobertura por embarque da apólice (ex.: 500.000,00).')
        const payload = {
          seguradora_nome: apolice.seguradora_nome?.trim() || null,
          seguradora_cnpj: apolice.seguradora_cnpj?.trim() || null,
          numero_apolice: apolice.numero_apolice?.trim() || null,
          responsavel_seguro: apolice.responsavel_seguro ?? 'emitente',
          teto_cobertura_por_embarque: teto,
          vigencia_inicio: apolice.vigencia_inicio || null,
          vigencia_fim: apolice.vigencia_fim || null,
        }
        const r3 = apolice.id
          ? await supabase.from('apolices_seguro').update(payload).eq('id', apolice.id)
          : await supabase.from('apolices_seguro').insert(payload).select().single()
        if (r3.error) throw r3.error
        if (!apolice.id && 'data' in r3 && r3.data) setApolice(r3.data as Apolice)
      }
      onSalvo(assessoria)
      setOk('Dados de emissão salvos.')
    } catch (e) {
      setErro((e as { message?: string })?.message ?? String(e))
    } finally {
      setSalvando(false)
    }
  }

  const setA = (k: keyof Apolice, v: string) => setApolice((a) => ({ ...a, [k]: v }))

  return (
    <div className="flex flex-col gap-3">
      {erro && <div className="text-xs rounded-lg px-3 py-2" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>{erro}</div>}
      {ok && (
        <div className="text-xs rounded-lg px-3 py-2 flex items-center gap-2" style={{ background: '#E7F5EC', color: 'var(--rbr-positive)' }}>
          <IconCheck width={12} height={12} /> {ok}
        </div>
      )}
      <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">Assessoria (emite CT-e, MDF-e, CIOT e VPO)</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <div>
          <label className={labelClass}>Nome / contato</label>
          <input value={assessoria.nome} onChange={(e) => setAssessoria((a) => ({ ...a, nome: e.target.value }))} className={inputClass} style={inputStyle} />
        </div>
        <div>
          <label className={labelClass}>WhatsApp (com DDD)</label>
          <input value={assessoria.whatsapp} onChange={(e) => setAssessoria((a) => ({ ...a, whatsapp: e.target.value }))} className={inputClass} style={inputStyle} placeholder="11 99999-9999" />
        </div>
        <div>
          <label className={labelClass}>E-mail</label>
          <input type="email" value={assessoria.email} onChange={(e) => setAssessoria((a) => ({ ...a, email: e.target.value }))} className={inputClass} style={inputStyle} />
        </div>
      </div>

      <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">RBR Cargo</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <div>
          <label className={labelClass}>Inscrição estadual</label>
          <input value={ie} onChange={(e) => setIe(e.target.value)} className={inputClass} style={inputStyle} placeholder="aguardando o contador" />
        </div>
      </div>

      <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">Apólice de seguro da carga (RCTR-C) vigente</div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="col-span-2">
          <label className={labelClass}>Seguradora</label>
          <input value={apolice.seguradora_nome ?? ''} onChange={(e) => setA('seguradora_nome', e.target.value)} className={inputClass} style={inputStyle} />
        </div>
        <div>
          <label className={labelClass}>CNPJ da seguradora</label>
          <input value={apolice.seguradora_cnpj ?? ''} onChange={(e) => setA('seguradora_cnpj', e.target.value)} className={inputClass} style={inputStyle} />
        </div>
        <div>
          <label className={labelClass}>Nº da apólice</label>
          <input value={apolice.numero_apolice ?? ''} onChange={(e) => setA('numero_apolice', e.target.value)} className={inputClass} style={inputStyle} />
        </div>
        <div>
          <label className={labelClass}>Teto por embarque (R$)</label>
          <input inputMode="decimal" value={apolice.teto_cobertura_por_embarque ?? ''} onChange={(e) => setA('teto_cobertura_por_embarque', e.target.value)} className={inputClass} style={inputStyle} />
        </div>
        <div>
          <label className={labelClass}>Vigência — início</label>
          <input type="date" value={apolice.vigencia_inicio ?? ''} onChange={(e) => setA('vigencia_inicio', e.target.value)} className={inputClass} style={inputStyle} />
        </div>
        <div>
          <label className={labelClass}>Vigência — fim</label>
          <input type="date" value={apolice.vigencia_fim ?? ''} onChange={(e) => setA('vigencia_fim', e.target.value)} className={inputClass} style={inputStyle} />
        </div>
        <div>
          <label className={labelClass}>Quem contratou</label>
          <select value={apolice.responsavel_seguro ?? 'emitente'} onChange={(e) => setA('responsavel_seguro', e.target.value)} className={inputClass} style={inputStyle}>
            <option value="emitente">RBR (emitente)</option>
            <option value="tomador">O cliente (tomador)</option>
          </select>
        </div>
      </div>
      <div className="text-[11px] text-[color:var(--rbr-muted)]">
        O teto por embarque também liga a checagem automática de “valor acima do teto do seguro” nas cotações.
      </div>
      <button
        type="button"
        disabled={salvando}
        onClick={salvar}
        className="self-start text-xs font-bold px-3.5 py-2 rounded-lg disabled:opacity-60"
        style={{ background: 'var(--rbr-navy)', color: '#fff' }}
      >
        {salvando ? 'Salvando…' : 'Salvar dados de emissão'}
      </button>
    </div>
  )
}
