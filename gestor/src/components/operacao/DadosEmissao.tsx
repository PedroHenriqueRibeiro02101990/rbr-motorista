import { useEffect, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import type { Json } from '@rbr/shared/database.types'
import { IconCheck } from '@rbr/shared/icons'
import type { AssessoriaContato, Apolice } from '../../lib/operacaoDetalhe'
import { parseBRL } from './OperacaoFluxo'

const inputClass = 'border rounded-lg px-3 py-2 text-sm outline-none w-full bg-white'
const inputStyle = { borderColor: 'var(--rbr-border)' }
const labelClass = 'text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] mb-1.5 block'

type TipoApolice = 'RCTR-C' | 'RCDC' | 'RCV'

const TIPOS_APOLICE: { tipo: TipoApolice; titulo: string; descricao: string; labelTeto: string }[] = [
  {
    tipo: 'RCTR-C',
    titulo: 'RCTR-C — dano à carga em trânsito',
    descricao: 'Cobre avaria/dano material à carga de terceiros durante o transporte. É a que liga a checagem automática de "valor acima do teto do seguro" nas cotações.',
    labelTeto: 'Teto por embarque (R$)',
  },
  {
    tipo: 'RCDC',
    titulo: 'RCDC — desaparecimento de carga',
    descricao: 'Cobre roubo, furto ou desaparecimento da carga durante o trânsito.',
    labelTeto: 'Teto por embarque (R$)',
  },
  {
    tipo: 'RCV',
    titulo: 'RCV — responsabilidade civil do veículo',
    descricao: 'Cobre danos materiais e corporais causados a terceiros pelo veículo ou pela carga (obrigatório). Danos corporais e materiais têm tetos independentes — o campo abaixo guarda o de danos materiais.',
    labelTeto: 'Teto — danos materiais (R$)',
  },
]

type ApolicesPorTipo = Record<TipoApolice, Partial<Apolice>>

function apoliceVazia(tipo: TipoApolice): Partial<Apolice> {
  return { tipo, responsavel_seguro: 'emitente' }
}

// Dados fixos que toda ficha de emissão usa: contato da assessoria, IE da RBR e as
// apólices de seguro vigentes — RCTR-C (dano à carga), RCDC (desaparecimento de
// carga) e RCV (responsabilidade civil do veículo), contratadas em separado mas
// mantidas juntas aqui porque cobrem a mesma operação de principio a fim.
export default function DadosEmissao({ onSalvo }: { onSalvo: (a: AssessoriaContato) => void }) {
  const [assessoria, setAssessoria] = useState<AssessoriaContato>({ nome: '', whatsapp: '', email: '' })
  const [empresa, setEmpresa] = useState<Record<string, unknown>>({})
  const [ie, setIe] = useState('')
  const [apolices, setApolices] = useState<ApolicesPorTipo>({
    'RCTR-C': apoliceVazia('RCTR-C'),
    RCDC: apoliceVazia('RCDC'),
    RCV: apoliceVazia('RCV'),
  })
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('parametros_sistema').select('chave, valor').in('chave', ['assessoria_contato', 'dados_empresa']),
      supabase.from('apolices_seguro').select('*').order('vigencia_inicio', { ascending: false }),
    ]).then(([p, a]) => {
      for (const r of p.data ?? []) {
        if (r.chave === 'assessoria_contato') setAssessoria({ nome: '', whatsapp: '', email: '', ...(r.valor as object) })
        if (r.chave === 'dados_empresa') {
          const emp = (r.valor ?? {}) as Record<string, unknown>
          setEmpresa(emp)
          setIe(String(emp.inscricao_estadual ?? ''))
        }
      }
      const porTipo: ApolicesPorTipo = {
        'RCTR-C': apoliceVazia('RCTR-C'),
        RCDC: apoliceVazia('RCDC'),
        RCV: apoliceVazia('RCV'),
      }
      for (const linha of (a.data ?? []) as Apolice[]) {
        const tipo = linha.tipo as TipoApolice
        // Uma linha por tipo já vem ordenada por vigência desc — a primeira que
        // encontrarmos pra cada tipo é a mais recente (a "vigente").
        if (tipo in porTipo && !porTipo[tipo].id) porTipo[tipo] = linha
      }
      setApolices(porTipo)
    })
  }, [])

  function setCampo(tipo: TipoApolice, k: keyof Apolice, v: string) {
    setApolices((atual) => ({ ...atual, [tipo]: { ...atual[tipo], [k]: v } }))
  }

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

      const atualizadas: Partial<Record<TipoApolice, Apolice>> = {}
      for (const { tipo, titulo } of TIPOS_APOLICE) {
        const apolice = apolices[tipo]
        const temApolice = apolice.seguradora_nome || apolice.numero_apolice || apolice.teto_cobertura_por_embarque
        if (!temApolice) continue
        const teto = parseBRL(String(apolice.teto_cobertura_por_embarque ?? ''))
        if (!Number.isFinite(teto) || teto <= 0) throw new Error(`Informe o teto de cobertura da apólice ${titulo} (ex.: 500.000,00).`)
        const premioStr = String(apolice.premio_minimo_mensal ?? '').trim()
        const premio = premioStr ? parseBRL(premioStr) : null
        const payload = {
          tipo,
          seguradora_nome: apolice.seguradora_nome?.trim() || null,
          seguradora_cnpj: apolice.seguradora_cnpj?.trim() || null,
          numero_apolice: apolice.numero_apolice?.trim() || null,
          responsavel_seguro: apolice.responsavel_seguro ?? 'emitente',
          teto_cobertura_por_embarque: teto,
          premio_minimo_mensal: premio != null && Number.isFinite(premio) ? premio : null,
          vigencia_inicio: apolice.vigencia_inicio || null,
          vigencia_fim: apolice.vigencia_fim || null,
        }
        const r3 = apolice.id
          ? await supabase.from('apolices_seguro').update(payload).eq('id', apolice.id).select().single()
          : await supabase.from('apolices_seguro').insert(payload).select().single()
        if (r3.error) throw r3.error
        if (r3.data) atualizadas[tipo] = r3.data as Apolice
      }
      if (Object.keys(atualizadas).length > 0) {
        setApolices((atual) => ({ ...atual, ...atualizadas }))
      }
      onSalvo(assessoria)
      setOk('Dados de emissão salvos.')
    } catch (e) {
      setErro((e as { message?: string })?.message ?? String(e))
    } finally {
      setSalvando(false)
    }
  }

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

      <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">Apólices de seguro vigentes</div>
      {TIPOS_APOLICE.map(({ tipo, titulo, descricao, labelTeto }) => {
        const apolice = apolices[tipo]
        const resumo = (apolice.detalhes as { resumo_coberturas?: string } | null)?.resumo_coberturas
        return (
          <div key={tipo} className="rounded-lg border p-3 flex flex-col gap-2" style={{ borderColor: 'var(--rbr-border)' }}>
            <div className="flex flex-col gap-0.5">
              <div className="text-xs font-bold text-[color:var(--rbr-navy-dark)]">{titulo}</div>
              <div className="text-[11px] text-[color:var(--rbr-muted)]">{descricao}</div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="col-span-2">
                <label className={labelClass}>Seguradora</label>
                <input value={apolice.seguradora_nome ?? ''} onChange={(e) => setCampo(tipo, 'seguradora_nome', e.target.value)} className={inputClass} style={inputStyle} />
              </div>
              <div>
                <label className={labelClass}>CNPJ da seguradora</label>
                <input value={apolice.seguradora_cnpj ?? ''} onChange={(e) => setCampo(tipo, 'seguradora_cnpj', e.target.value)} className={inputClass} style={inputStyle} />
              </div>
              <div>
                <label className={labelClass}>Nº da apólice</label>
                <input value={apolice.numero_apolice ?? ''} onChange={(e) => setCampo(tipo, 'numero_apolice', e.target.value)} className={inputClass} style={inputStyle} placeholder="ainda em cotação" />
              </div>
              <div>
                <label className={labelClass}>{labelTeto}</label>
                <input inputMode="decimal" value={apolice.teto_cobertura_por_embarque ?? ''} onChange={(e) => setCampo(tipo, 'teto_cobertura_por_embarque', e.target.value)} className={inputClass} style={inputStyle} />
              </div>
              <div>
                <label className={labelClass}>Prêmio mínimo mensal (R$)</label>
                <input inputMode="decimal" value={apolice.premio_minimo_mensal ?? ''} onChange={(e) => setCampo(tipo, 'premio_minimo_mensal', e.target.value)} className={inputClass} style={inputStyle} />
              </div>
              <div>
                <label className={labelClass}>Vigência — início</label>
                <input type="date" value={apolice.vigencia_inicio ?? ''} onChange={(e) => setCampo(tipo, 'vigencia_inicio', e.target.value)} className={inputClass} style={inputStyle} />
              </div>
              <div>
                <label className={labelClass}>Vigência — fim</label>
                <input type="date" value={apolice.vigencia_fim ?? ''} onChange={(e) => setCampo(tipo, 'vigencia_fim', e.target.value)} className={inputClass} style={inputStyle} />
              </div>
              <div>
                <label className={labelClass}>Quem contratou</label>
                <select value={apolice.responsavel_seguro ?? 'emitente'} onChange={(e) => setCampo(tipo, 'responsavel_seguro', e.target.value)} className={inputClass} style={inputStyle}>
                  <option value="emitente">RBR (emitente)</option>
                  <option value="tomador">O cliente (tomador)</option>
                </select>
              </div>
            </div>
            {resumo && <div className="text-[11px] text-[color:var(--rbr-muted)] italic">{resumo}</div>}
          </div>
        )
      })}
      <div className="text-[11px] text-[color:var(--rbr-muted)]">
        O teto por embarque da RCTR-C liga a checagem automática de "valor acima do teto do seguro" nas cotações.
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
