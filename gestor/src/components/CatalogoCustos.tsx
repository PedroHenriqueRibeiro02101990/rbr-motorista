import { useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import type { Database } from '@rbr/shared/database.types'
import { IconCheck } from '@rbr/shared/icons'

type TipoCusto = Database['public']['Tables']['tipos_custo_adicional']['Row']

const inputClass = 'border rounded-lg px-2.5 py-1.5 text-xs outline-none w-full'
const inputStyle = { borderColor: 'var(--rbr-border)', background: '#fff' }

const FORMAS: { value: string; label: string }[] = [
  { value: 'fixo', label: 'Valor fixo' },
  { value: 'por_km', label: 'Por km' },
  { value: 'por_dia', label: 'Por dia' },
  { value: 'por_unidade', label: 'Por unidade' },
  { value: 'pct_valor_nf', label: '% da NF' },
]

const RECEBEDORES: { value: string; label: string }[] = [
  { value: 'motorista', label: 'Motorista' },
  { value: 'fornecedor', label: 'Fornecedor' },
  { value: 'governo', label: 'Governo' },
  { value: 'rbr', label: 'RBR (interno)' },
]

const SINAIS: { value: string; label: string }[] = [
  { value: 'perigosa', label: 'Perigosa' },
  { value: 'superdimensionada', label: 'Superdimensionada' },
  { value: 'seguro_excedido', label: 'Acima do teto do seguro' },
]

interface Linha {
  id: string | null
  codigo: string
  nome: string
  descricao: string
  forma_calculo: string
  valor_padrao: string // em R$, ou em % quando pct_valor_nf
  recebedor: string
  obrigatorio: boolean
  sugerir_quando: string[]
  ativo: boolean
  ordem: number
}

function paraLinha(t: TipoCusto): Linha {
  return {
    id: t.id,
    codigo: t.codigo,
    nome: t.nome,
    descricao: t.descricao ?? '',
    forma_calculo: t.forma_calculo,
    valor_padrao:
      t.valor_padrao == null ? '' : t.forma_calculo === 'pct_valor_nf' ? String(Number((t.valor_padrao * 100).toFixed(4))) : String(t.valor_padrao),
    recebedor: t.recebedor,
    obrigatorio: t.obrigatorio,
    sugerir_quando: t.sugerir_quando,
    ativo: t.ativo,
    ordem: t.ordem,
  }
}

function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40)
}

// Tabela de custos padrão da cotação (GR, rastreamento, AET, escolta...). O que for salvo aqui vira
// o valor pré-preenchido quando o gestor adiciona aquele custo numa cotação — não muda cotações já feitas.
export default function CatalogoCustos({ tipos, onSalvo }: { tipos: TipoCusto[]; onSalvo: () => void }) {
  const [linhas, setLinhas] = useState<Linha[]>(() => tipos.map(paraLinha))
  const [salvandoId, setSalvandoId] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  function editar(idx: number, patch: Partial<Linha>) {
    setLinhas((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }

  function novo() {
    setLinhas((ls) => [
      ...ls,
      {
        id: null,
        codigo: '',
        nome: '',
        descricao: '',
        forma_calculo: 'fixo',
        valor_padrao: '',
        recebedor: 'fornecedor',
        obrigatorio: false,
        sugerir_quando: [],
        ativo: true,
        ordem: 500,
      },
    ])
  }

  async function salvar(idx: number) {
    const l = linhas[idx]
    setErro(null)
    setOk(null)
    if (!l.nome.trim()) {
      setErro('Informe o nome do custo.')
      return
    }
    const v = l.valor_padrao.trim() === '' ? null : Number(l.valor_padrao.replace(',', '.'))
    if (v != null && (!Number.isFinite(v) || v < 0)) {
      setErro(`Valor padrão inválido em "${l.nome}".`)
      return
    }
    const payload = {
      nome: l.nome.trim(),
      descricao: l.descricao.trim() || null,
      forma_calculo: l.forma_calculo,
      valor_padrao: v == null ? null : l.forma_calculo === 'pct_valor_nf' ? v / 100 : v,
      recebedor: l.recebedor,
      obrigatorio: l.obrigatorio,
      sugerir_quando: l.sugerir_quando,
      ativo: l.ativo,
      ordem: l.ordem,
    }
    const chave = l.id ?? `novo-${idx}`
    setSalvandoId(chave)
    const res = l.id
      ? await supabase.from('tipos_custo_adicional').update(payload).eq('id', l.id).select().single()
      : await supabase
          .from('tipos_custo_adicional')
          .insert({ ...payload, codigo: `${slug(l.nome) || 'custo'}_${Date.now().toString(36)}` })
          .select()
          .single()
    setSalvandoId(null)
    if (res.error || !res.data) {
      setErro(res.error?.message ?? 'Falha ao salvar.')
      return
    }
    editar(idx, paraLinha(res.data))
    setOk(`"${res.data.nome}" salvo.`)
    onSalvo()
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-[11px] text-[color:var(--rbr-muted)]">
        Valor padrão que já vem preenchido quando o custo é adicionado numa cotação (dá pra mudar em cada cotação). Alterar aqui
        não mexe em cotações já feitas. Custo “obrigatório” entra sozinho em toda cotação nova e é exigido pra converter em operação.
      </div>
      {erro && (
        <div className="text-xs rounded-lg px-3 py-2" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
          {erro}
        </div>
      )}
      {ok && (
        <div className="text-xs rounded-lg px-3 py-2 flex items-center gap-2" style={{ background: '#E7F5EC', color: 'var(--rbr-positive)' }}>
          <IconCheck width={12} height={12} />
          {ok}
        </div>
      )}
      <div className="flex flex-col gap-2">
        {linhas.map((l, idx) => {
          const chave = l.id ?? `novo-${idx}`
          return (
            <div
              key={chave}
              className="rounded-lg border p-2.5 grid grid-cols-2 md:grid-cols-12 gap-2 items-end"
              style={{ borderColor: 'var(--rbr-border)', opacity: l.ativo ? 1 : 0.55 }}
            >
              <div className="col-span-2 md:col-span-3">
                <label className="text-[10px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">Custo</label>
                <input value={l.nome} onChange={(e) => editar(idx, { nome: e.target.value })} className={inputClass} style={inputStyle} />
              </div>
              <div className="md:col-span-2">
                <label className="text-[10px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">Cálculo</label>
                <select
                  value={l.forma_calculo}
                  onChange={(e) => editar(idx, { forma_calculo: e.target.value })}
                  className={inputClass}
                  style={inputStyle}
                >
                  {FORMAS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-[10px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">
                  {l.forma_calculo === 'pct_valor_nf' ? 'Padrão (%)' : 'Padrão (R$)'}
                </label>
                <input
                  inputMode="decimal"
                  value={l.valor_padrao}
                  placeholder="sem padrão"
                  onChange={(e) => editar(idx, { valor_padrao: e.target.value })}
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-[10px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">Quem recebe</label>
                <select value={l.recebedor} onChange={(e) => editar(idx, { recebedor: e.target.value })} className={inputClass} style={inputStyle}>
                  {RECEBEDORES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2 md:col-span-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold">
                <label className="flex items-center gap-1">
                  <input type="checkbox" checked={l.obrigatorio} onChange={(e) => editar(idx, { obrigatorio: e.target.checked })} />
                  Obrigatório
                </label>
                <label className="flex items-center gap-1">
                  <input type="checkbox" checked={l.ativo} onChange={(e) => editar(idx, { ativo: e.target.checked })} />
                  Ativo
                </label>
              </div>
              <div className="col-span-2 md:col-span-9 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                <span className="text-[color:var(--rbr-muted)] font-semibold">Sugerir quando:</span>
                {SINAIS.map((s) => (
                  <label key={s.value} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={l.sugerir_quando.includes(s.value)}
                      onChange={(e) =>
                        editar(idx, {
                          sugerir_quando: e.target.checked
                            ? [...l.sugerir_quando, s.value]
                            : l.sugerir_quando.filter((x) => x !== s.value),
                        })
                      }
                    />
                    {s.label}
                  </label>
                ))}
              </div>
              <div className="col-span-2 md:col-span-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => salvar(idx)}
                  disabled={salvandoId === chave}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-60"
                  style={{ background: 'var(--rbr-navy)', color: '#fff' }}
                >
                  {salvandoId === chave ? 'Salvando…' : l.id ? 'Salvar' : 'Criar'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
      <button
        type="button"
        onClick={novo}
        className="self-start text-xs font-bold px-3 py-1.5 rounded-lg border"
        style={{ borderColor: 'var(--rbr-navy)', color: 'var(--rbr-navy)' }}
      >
        + Novo tipo de custo
      </button>
    </div>
  )
}
