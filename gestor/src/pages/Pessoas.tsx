import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import type { Database } from '@rbr/shared/database.types'
import { initials } from '@rbr/shared/format'
import { IconChevronRight } from '@rbr/shared/icons'
import { IconSearch, IconX } from '../icons-local'

type Pessoa = Database['public']['Tables']['pessoas']['Row']
type PapelPessoa = Database['public']['Enums']['papel_pessoa']
type StatusCicloVida = Database['public']['Enums']['status_ciclo_vida']
type TipoPessoaDoc = Database['public']['Enums']['tipo_pessoa_doc']

const PAPEL_LABEL: Record<PapelPessoa, string> = {
  titular_motorista: 'Titular motorista',
  condutor: 'Condutor',
  agenciador: 'Agenciador',
  gestor_rbr: 'Gestor RBR',
  prestador_parceiro: 'Prestador parceiro',
}

const STATUS_LABEL: Record<StatusCicloVida, string> = {
  ativo: 'Ativo',
  inativo: 'Inativo',
  anonimizado_retencao_fiscal: 'Anonimizado (retenção fiscal)',
  excluido: 'Excluído',
}

const PAPEIS: PapelPessoa[] = ['titular_motorista', 'condutor', 'agenciador', 'gestor_rbr', 'prestador_parceiro']
const STATUS_OPCOES: StatusCicloVida[] = ['ativo', 'inativo', 'anonimizado_retencao_fiscal', 'excluido']
const TIPO_DOC_OPCOES: TipoPessoaDoc[] = ['PF', 'PJ']

const cardStyle = {
  borderColor: 'var(--rbr-border)',
  boxShadow: '0 1px 2px rgba(18,23,61,0.03), 0 6px 18px rgba(18,23,61,0.05)',
}

function statusBadgeStyle(status: StatusCicloVida) {
  if (status === 'ativo') return { background: 'var(--rbr-positive)', color: '#fff' }
  if (status === 'excluido' || status === 'anonimizado_retencao_fiscal')
    return { background: '#FBE9E9', color: 'var(--rbr-danger)' }
  return { background: 'var(--rbr-warning-bg)', color: 'var(--rbr-navy-dark)' }
}

export default function Pessoas() {
  const [pessoas, setPessoas] = useState<Pessoa[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroPapel, setFiltroPapel] = useState<PapelPessoa | 'todos'>('todos')
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null)
  const [titulares, setTitulares] = useState<Pessoa[]>([])

  const [form, setForm] = useState<Partial<Pessoa> | null>(null)
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('pessoas').select('*').order('nome', { ascending: true }).limit(500)
    if (error) setErrorMsg(error.message)
    setPessoas(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    supabase
      .from('pessoas')
      .select('*')
      .eq('papel', 'titular_motorista')
      .order('nome', { ascending: true })
      .then(({ data }) => setTitulares(data ?? []))
  }, [load])

  function selecionar(p: Pessoa) {
    setErrorMsg(null)
    if (selecionadoId === p.id) {
      setSelecionadoId(null)
      setForm(null)
      return
    }
    setSelecionadoId(p.id)
    setForm({ ...p })
  }

  async function salvar() {
    if (!form || !selecionadoId) return
    setSaving(true)
    setErrorMsg(null)
    // CPF/CNPJ são salvos só com dígitos (o banco agora exige esse formato) —
    // a pessoa pode digitar com ponto/traço normalmente, a gente limpa aqui.
    const somenteDigitos = (v: string | null | undefined) => {
      const limpo = (v ?? '').replace(/\D/g, '')
      return limpo === '' ? null : limpo
    }
    const patch: Database['public']['Tables']['pessoas']['Update'] = {
      nome: form.nome?.trim(),
      papel: form.papel,
      status: form.status,
      titular_id: form.titular_id ?? null,
      tipo_pessoa_doc: form.tipo_pessoa_doc,
      email: form.email ?? null,
      celular: form.celular ?? null,
      cpf: somenteDigitos(form.cpf),
      cnpj: somenteDigitos(form.cnpj),
      pix: form.pix ?? null,
      cidade: form.cidade ?? null,
      uf: form.uf ? form.uf.trim().toUpperCase() : null,
    }
    const { error } = await supabase.from('pessoas').update(patch).eq('id', selecionadoId)
    setSaving(false)
    if (error) {
      setErrorMsg(error.message)
      return
    }
    await load()
  }

  const buscaLower = busca.trim().toLowerCase()
  const lista = (pessoas ?? []).filter((p) => {
    if (filtroPapel !== 'todos' && p.papel !== filtroPapel) return false
    if (!buscaLower) return true
    return (
      p.nome.toLowerCase().includes(buscaLower) ||
      (p.cpf ?? '').includes(buscaLower) ||
      (p.cnpj ?? '').includes(buscaLower) ||
      (p.email ?? '').toLowerCase().includes(buscaLower)
    )
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="rbr-display font-bold text-2xl md:text-3xl text-[color:var(--rbr-navy-dark)]">Pessoas</h1>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <IconSearch width={16} height={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--rbr-muted)' }} />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, CPF, CNPJ ou e-mail"
            className="w-full border rounded-xl pl-9 pr-9 py-2.5 text-sm outline-none focus:border-[color:var(--rbr-navy)]"
            style={{ borderColor: 'var(--rbr-border)' }}
          />
          {busca && (
            <button onClick={() => setBusca('')} style={{ position: 'absolute', right: 10, top: 10, color: 'var(--rbr-muted)' }}>
              <IconX width={14} height={14} />
            </button>
          )}
        </div>
        <select
          value={filtroPapel}
          onChange={(e) => setFiltroPapel(e.target.value as PapelPessoa | 'todos')}
          className="border rounded-xl px-3 py-2.5 text-sm font-semibold outline-none"
          style={{ borderColor: 'var(--rbr-border)' }}
        >
          <option value="todos">Todos os papéis</option>
          {PAPEIS.map((p) => (
            <option key={p} value={p}>
              {PAPEL_LABEL[p]}
            </option>
          ))}
        </select>
      </div>

      {errorMsg && (
        <div className="text-xs text-[color:var(--rbr-danger)] bg-white border rounded-[14px] p-3" style={{ borderColor: 'var(--rbr-border)' }}>
          {errorMsg}
        </div>
      )}

      {loading && <div className="text-sm text-[color:var(--rbr-muted)] py-6 text-center">Carregando…</div>}

      {!loading && lista.length === 0 && (
        <div className="text-sm text-[color:var(--rbr-muted)] bg-white border rounded-[20px] p-[18px]" style={cardStyle}>
          Nenhuma pessoa encontrada.
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {!loading &&
          lista.map((p) => {
            const isSelected = selecionadoId === p.id
            return (
              <div key={p.id} className="bg-white border rounded-[16px] overflow-hidden" style={cardStyle}>
                <button className="w-full text-left px-4 py-3.5 flex items-center gap-3" onClick={() => selecionar(p)}>
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{ background: 'var(--rbr-muted-bg)', color: 'var(--rbr-navy)' }}
                  >
                    {initials(p.nome)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold truncate">{p.nome}</div>
                    <div className="text-xs text-[color:var(--rbr-muted)]">{PAPEL_LABEL[p.papel]}</div>
                  </div>
                  <span
                    className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full flex-shrink-0"
                    style={statusBadgeStyle(p.status)}
                  >
                    {STATUS_LABEL[p.status]}
                  </span>
                  <IconChevronRight
                    width={16}
                    height={16}
                    style={{
                      color: 'var(--rbr-muted)',
                      transform: isSelected ? 'rotate(90deg)' : 'none',
                      transition: 'transform 0.15s',
                      flexShrink: 0,
                    }}
                  />
                </button>

                {isSelected && form && (
                  <div className="border-t px-4 pb-4 pt-4 flex flex-col gap-3" style={{ borderColor: 'var(--rbr-border)' }}>
                    <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">
                      Campos exclusivos do gestor
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <Field label="Papel">
                        <select
                          value={form.papel}
                          onChange={(e) => setForm({ ...form, papel: e.target.value as PapelPessoa })}
                          className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                          style={{ borderColor: 'var(--rbr-border)' }}
                        >
                          {PAPEIS.map((v) => (
                            <option key={v} value={v}>
                              {PAPEL_LABEL[v]}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Status">
                        <select
                          value={form.status}
                          onChange={(e) => setForm({ ...form, status: e.target.value as StatusCicloVida })}
                          className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                          style={{ borderColor: 'var(--rbr-border)' }}
                        >
                          {STATUS_OPCOES.map((v) => (
                            <option key={v} value={v}>
                              {STATUS_LABEL[v]}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Vinculado ao titular">
                        <select
                          value={form.titular_id ?? ''}
                          onChange={(e) => setForm({ ...form, titular_id: e.target.value || null })}
                          className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                          style={{ borderColor: 'var(--rbr-border)' }}
                        >
                          <option value="">Nenhum</option>
                          {titulares
                            .filter((t) => t.id !== p.id)
                            .map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.nome}
                              </option>
                            ))}
                        </select>
                      </Field>
                    </div>

                    <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] mt-1">
                      Dados de perfil
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <Field label="Nome">
                        <input
                          value={form.nome ?? ''}
                          onChange={(e) => setForm({ ...form, nome: e.target.value })}
                          className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                          style={{ borderColor: 'var(--rbr-border)' }}
                        />
                      </Field>
                      <Field label="Tipo de documento">
                        <select
                          value={form.tipo_pessoa_doc}
                          onChange={(e) => setForm({ ...form, tipo_pessoa_doc: e.target.value as TipoPessoaDoc })}
                          className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                          style={{ borderColor: 'var(--rbr-border)' }}
                        >
                          {TIPO_DOC_OPCOES.map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="E-mail">
                        <input
                          value={form.email ?? ''}
                          onChange={(e) => setForm({ ...form, email: e.target.value })}
                          className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                          style={{ borderColor: 'var(--rbr-border)' }}
                        />
                      </Field>
                      <Field label="Celular">
                        <input
                          value={form.celular ?? ''}
                          onChange={(e) => setForm({ ...form, celular: e.target.value })}
                          className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                          style={{ borderColor: 'var(--rbr-border)' }}
                        />
                      </Field>
                      <Field label="CPF">
                        <input
                          value={form.cpf ?? ''}
                          onChange={(e) => setForm({ ...form, cpf: e.target.value })}
                          className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                          style={{ borderColor: 'var(--rbr-border)' }}
                        />
                      </Field>
                      <Field label="CNPJ">
                        <input
                          value={form.cnpj ?? ''}
                          onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
                          className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                          style={{ borderColor: 'var(--rbr-border)' }}
                        />
                      </Field>
                      <Field label="Pix">
                        <input
                          value={form.pix ?? ''}
                          onChange={(e) => setForm({ ...form, pix: e.target.value })}
                          className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                          style={{ borderColor: 'var(--rbr-border)' }}
                        />
                      </Field>
                      <Field label="Cidade">
                        <input
                          value={form.cidade ?? ''}
                          onChange={(e) => setForm({ ...form, cidade: e.target.value })}
                          className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                          style={{ borderColor: 'var(--rbr-border)' }}
                        />
                      </Field>
                      <Field label="UF">
                        <input
                          value={form.uf ?? ''}
                          onChange={(e) => setForm({ ...form, uf: e.target.value })}
                          maxLength={2}
                          className="w-full border rounded-lg px-3 py-2 text-sm outline-none uppercase"
                          style={{ borderColor: 'var(--rbr-border)' }}
                        />
                      </Field>
                    </div>

                    <div className="text-xs text-[color:var(--rbr-muted)]">
                      Online agora: {p.status_online ? 'Sim' : 'Não'}
                    </div>

                    <button
                      onClick={salvar}
                      disabled={saving}
                      className="self-start text-sm font-bold px-4 py-2.5 rounded-lg disabled:opacity-60"
                      style={{ background: 'var(--rbr-gold)', color: 'var(--rbr-navy-dark)' }}
                    >
                      {saving ? 'Salvando…' : 'Salvar alterações'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold text-[color:var(--rbr-muted)]">{label}</span>
      {children}
    </label>
  )
}
