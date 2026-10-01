import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import type { Database } from '@rbr/shared/database.types'
import { IconPlus, IconEdit, IconX, IconArchive } from '../icons-local'
import { IconCheck } from '@rbr/shared/icons'
import { consultarCnpj as consultarCnpjApi, consultarCep as consultarCepApi, resumoCnpj, preencherVazios, soDigitos } from '@rbr/shared/consultaCadastro'

type Pessoa = Database['public']['Tables']['pessoas']['Row']
type Cliente = Database['public']['Tables']['clientes']['Row']

interface FormState {
  id: string | null
  razao_social: string
  nome_fantasia: string
  cnpj: string
  inscricao_estadual: string
  email: string
  celular_whatsapp: string
  condicoes_pagamento_prazo: string
  cep: string
  logradouro: string
  numero_endereco: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
}

const EMPTY_FORM: FormState = {
  id: null,
  razao_social: '',
  nome_fantasia: '',
  cnpj: '',
  inscricao_estadual: '',
  email: '',
  celular_whatsapp: '',
  condicoes_pagamento_prazo: '',
  cep: '',
  logradouro: '',
  numero_endereco: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: '',
}

function clienteToForm(c: Cliente): FormState {
  return {
    id: c.id,
    razao_social: c.razao_social ?? '',
    nome_fantasia: c.nome_fantasia ?? '',
    cnpj: c.cnpj ?? '',
    inscricao_estadual: c.inscricao_estadual ?? '',
    email: c.email ?? '',
    celular_whatsapp: c.celular_whatsapp ?? '',
    condicoes_pagamento_prazo: c.condicoes_pagamento_prazo ?? '',
    cep: c.cep ?? '',
    logradouro: c.logradouro ?? '',
    numero_endereco: c.numero_endereco ?? '',
    complemento: c.complemento ?? '',
    bairro: c.bairro ?? '',
    cidade: c.cidade ?? '',
    uf: c.uf ?? '',
  }
}

const inputCls = 'border rounded-xl px-3 py-2.5 text-sm'
const labelCls = 'flex flex-col gap-1 text-xs font-semibold text-[color:var(--rbr-muted)]'

export default function Clientes({ pessoa }: { pessoa: Pessoa }) {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [showInativos, setShowInativos] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('clientes')
      .select('*')
      .eq('agenciador_id', pessoa.id)
      .order('razao_social', { ascending: true })
    if (err) setError(err.message)
    setClientes(data ?? [])
    setLoading(false)
  }, [pessoa.id])

  useEffect(() => {
    load()
  }, [load])

  const [consultando, setConsultando] = useState<'cnpj' | 'cep' | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  // Preenche tudo o que der a partir do CNPJ (Receita + IE) e do CEP; só completa campos vazios.
  async function consultarCnpj() {
    if (soDigitos(form.cnpj).length !== 14) return
    setConsultando('cnpj')
    setAviso(null)
    const r = await consultarCnpjApi(form.cnpj)
    setConsultando(null)
    if (!r.dados) {
      setAviso(r.erro)
      return
    }
    const d = r.dados
    setForm((f) =>
      preencherVazios(f, {
        razao_social: d.razao_social,
        nome_fantasia: d.nome_fantasia,
        inscricao_estadual: d.inscricao_estadual,
        email: d.email?.toLowerCase(),
        celular_whatsapp: d.telefone,
        cep: d.cep,
        logradouro: d.logradouro,
        numero_endereco: d.numero_endereco,
        complemento: d.complemento,
        bairro: d.bairro,
        cidade: d.cidade,
        uf: d.uf,
      }),
    )
    setAviso(resumoCnpj(d, r.ieIndisponivel))
  }

  async function consultarCep() {
    setConsultando('cep')
    const d = await consultarCepApi(form.cep)
    setConsultando(null)
    if (d) setForm((f) => preencherVazios(f, { logradouro: d.logradouro, bairro: d.bairro, cidade: d.cidade, uf: d.uf }))
  }

  function openNew() {
    setForm(EMPTY_FORM)
    setFormOpen(true)
  }

  function openEdit(c: Cliente) {
    setForm(clienteToForm(c))
    setFormOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.razao_social.trim()) {
      setError('Informe a razão social.')
      return
    }
    setSaving(true)
    setError(null)

    const payload = {
      razao_social: form.razao_social || null,
      nome_fantasia: form.nome_fantasia || null,
      cnpj: form.cnpj || null,
      inscricao_estadual: form.inscricao_estadual || null,
      email: form.email || null,
      celular_whatsapp: form.celular_whatsapp || null,
      condicoes_pagamento_prazo: form.condicoes_pagamento_prazo || null,
      cep: form.cep || null,
      logradouro: form.logradouro || null,
      numero_endereco: form.numero_endereco || null,
      complemento: form.complemento || null,
      bairro: form.bairro || null,
      cidade: form.cidade || null,
      uf: form.uf || null,
    }

    const result = form.id
      ? await supabase.from('clientes').update(payload).eq('id', form.id)
      : await supabase.from('clientes').insert({ ...payload, agenciador_id: pessoa.id, origem: 'agenciador' })

    setSaving(false)
    if (result.error) {
      setError(result.error.message)
      return
    }
    setFormOpen(false)
    load()
  }

  // status_ciclo_vida tem 4 valores: só ativo/inativo alternam por aqui — os
  // outros dois (anonimizado_retencao_fiscal, excluido) são de LGPD e não
  // podem ser revertidos pela tela.
  function podeAlternarStatus(c: Cliente) {
    return c.status === 'ativo' || c.status === 'inativo'
  }

  async function toggleStatus(c: Cliente) {
    if (!podeAlternarStatus(c)) return
    const next = c.status === 'ativo' ? 'inativo' : 'ativo'
    const { error: err } = await supabase.from('clientes').update({ status: next }).eq('id', c.id)
    if (err) {
      setError(err.message)
      return
    }
    load()
  }

  const visiveis = clientes.filter((c) => (showInativos ? true : c.status === 'ativo'))

  return (
    <div className="px-5 pt-8 md:px-0 md:pt-0 flex flex-col gap-3.5 md:gap-6">
      <div className="flex items-center justify-between">
        <h1 className="rbr-display font-bold text-2xl md:text-3xl text-[color:var(--rbr-navy-dark)]">Clientes</h1>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-sm font-bold"
          style={{ background: 'var(--rbr-gold)', color: 'var(--rbr-navy-dark)' }}
        >
          <IconPlus width={16} height={16} />
          Novo
        </button>
      </div>

      <label className="flex items-center gap-2 text-xs text-[color:var(--rbr-muted)] font-medium">
        <input type="checkbox" checked={showInativos} onChange={(e) => setShowInativos(e.target.checked)} />
        Mostrar inativos
      </label>

      {error && (
        <div className="text-xs text-[color:var(--rbr-danger)] bg-white border rounded-[14px] p-3" style={{ borderColor: 'var(--rbr-border)' }}>
          {error}
        </div>
      )}

      {formOpen && (
        <form
          onSubmit={handleSubmit}
          className="bg-white border rounded-[20px] p-[18px] flex flex-col gap-3"
          style={{ borderColor: 'var(--rbr-border)', boxShadow: '0 1px 2px rgba(18,23,61,0.03), 0 6px 18px rgba(18,23,61,0.05)' }}
        >
          <div className="flex items-center justify-between">
            <div className="text-[15px] font-bold text-[color:var(--rbr-navy-dark)]">
              {form.id ? 'Editar cliente' : 'Novo cliente'}
            </div>
            <button type="button" onClick={() => setFormOpen(false)} aria-label="Fechar">
              <IconX width={18} height={18} style={{ color: 'var(--rbr-muted)' }} />
            </button>
          </div>

          {aviso && (
            <div className="text-xs rounded-xl px-3 py-2.5" style={{ background: 'var(--rbr-bg, #F4F6FB)', color: 'var(--rbr-navy-dark)' }}>
              {aviso}
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-3">
            <label className={labelCls}>
              Razão social
              <input
                className={inputCls}
                style={{ borderColor: 'var(--rbr-border)' }}
                value={form.razao_social}
                onChange={(e) => setForm((f) => ({ ...f, razao_social: e.target.value }))}
                required
              />
            </label>
            <label className={labelCls}>
              Nome fantasia
              <input
                className={inputCls}
                style={{ borderColor: 'var(--rbr-border)' }}
                value={form.nome_fantasia}
                onChange={(e) => setForm((f) => ({ ...f, nome_fantasia: e.target.value }))}
              />
            </label>
            <label className={labelCls}>
              CNPJ
              <input
                className={inputCls}
                style={{ borderColor: 'var(--rbr-border)' }}
                value={form.cnpj}
                inputMode="numeric"
                placeholder="Digite o CNPJ — os dados vêm da Receita"
                onChange={(e) => setForm((f) => ({ ...f, cnpj: e.target.value }))}
                onBlur={consultarCnpj}
              />
              {consultando === 'cnpj' && <span className="font-normal">Consultando Receita…</span>}
            </label>
            <label className={labelCls}>
              Inscrição estadual (IE)
              <input
                className={inputCls}
                style={{ borderColor: 'var(--rbr-border)' }}
                placeholder="vem do CNPJ — ou digite (isento)"
                value={form.inscricao_estadual}
                onChange={(e) => setForm((f) => ({ ...f, inscricao_estadual: e.target.value }))}
              />
            </label>
            <label className={labelCls}>
              Condições de pagamento (prazo)
              <input
                className={inputCls}
                style={{ borderColor: 'var(--rbr-border)' }}
                placeholder="ex.: 28 dias"
                value={form.condicoes_pagamento_prazo}
                onChange={(e) => setForm((f) => ({ ...f, condicoes_pagamento_prazo: e.target.value }))}
              />
            </label>
            <label className={labelCls}>
              E-mail
              <input
                className={inputCls}
                style={{ borderColor: 'var(--rbr-border)' }}
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </label>
            <label className={labelCls}>
              Celular/WhatsApp
              <input
                className={inputCls}
                style={{ borderColor: 'var(--rbr-border)' }}
                value={form.celular_whatsapp}
                onChange={(e) => setForm((f) => ({ ...f, celular_whatsapp: e.target.value }))}
              />
            </label>
          </div>

          <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] mt-1">Endereço</div>
          <div className="grid md:grid-cols-3 gap-3">
            <label className={labelCls}>
              CEP
              <input
                className={inputCls}
                style={{ borderColor: 'var(--rbr-border)' }}
                value={form.cep}
                inputMode="numeric"
                onChange={(e) => setForm((f) => ({ ...f, cep: e.target.value }))}
                onBlur={consultarCep}
              />
            </label>
            <label className={`${labelCls} md:col-span-2`}>
              Logradouro
              <input
                className={inputCls}
                style={{ borderColor: 'var(--rbr-border)' }}
                value={form.logradouro}
                onChange={(e) => setForm((f) => ({ ...f, logradouro: e.target.value }))}
              />
            </label>
            <label className={labelCls}>
              Número
              <input
                className={inputCls}
                style={{ borderColor: 'var(--rbr-border)' }}
                value={form.numero_endereco}
                onChange={(e) => setForm((f) => ({ ...f, numero_endereco: e.target.value }))}
              />
            </label>
            <label className={labelCls}>
              Complemento
              <input
                className={inputCls}
                style={{ borderColor: 'var(--rbr-border)' }}
                value={form.complemento}
                onChange={(e) => setForm((f) => ({ ...f, complemento: e.target.value }))}
              />
            </label>
            <label className={labelCls}>
              Bairro
              <input
                className={inputCls}
                style={{ borderColor: 'var(--rbr-border)' }}
                value={form.bairro}
                onChange={(e) => setForm((f) => ({ ...f, bairro: e.target.value }))}
              />
            </label>
            <label className={labelCls}>
              Cidade
              <input
                className={inputCls}
                style={{ borderColor: 'var(--rbr-border)' }}
                value={form.cidade}
                onChange={(e) => setForm((f) => ({ ...f, cidade: e.target.value }))}
              />
            </label>
            <label className={labelCls}>
              UF
              <input
                className={inputCls}
                style={{ borderColor: 'var(--rbr-border)' }}
                maxLength={2}
                value={form.uf}
                onChange={(e) => setForm((f) => ({ ...f, uf: e.target.value.toUpperCase() }))}
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="rounded-xl py-3 font-bold text-sm disabled:opacity-60"
            style={{ background: 'var(--rbr-navy)', color: '#FFFFFF' }}
          >
            {saving ? 'Salvando…' : 'Salvar cliente'}
          </button>
        </form>
      )}

      {loading && <div className="text-sm text-[color:var(--rbr-muted)] py-6 text-center">Carregando…</div>}

      {!loading && visiveis.length === 0 && !formOpen && (
        <div className="text-sm text-[color:var(--rbr-muted)] bg-white border rounded-[20px] p-[18px]" style={{ borderColor: 'var(--rbr-border)' }}>
          Nenhum cliente cadastrado ainda.
        </div>
      )}

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
        {visiveis.map((c) => (
          <div
            key={c.id}
            className="bg-white border rounded-[14px] p-4 flex flex-col gap-2"
            style={{
              borderColor: 'var(--rbr-border)',
              boxShadow: '0 1px 2px rgba(18,23,61,0.03), 0 6px 18px rgba(18,23,61,0.05)',
              opacity: c.status === 'ativo' ? 1 : 0.6,
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-bold">{c.nome_fantasia || c.razao_social}</div>
                {c.nome_fantasia && c.razao_social && (
                  <div className="text-xs text-[color:var(--rbr-muted)]">{c.razao_social}</div>
                )}
              </div>
              {c.status !== 'ativo' && (
                <span
                  className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{ background: 'var(--rbr-muted-bg)', color: 'var(--rbr-muted)' }}
                >
                  {c.status === 'inativo' ? 'Inativo' : c.status === 'excluido' ? 'Excluído' : 'Dados anonimizados'}
                </span>
              )}
            </div>
            {c.cnpj && <div className="text-xs text-[color:var(--rbr-muted)]">CNPJ: {c.cnpj}</div>}
            {c.condicoes_pagamento_prazo && (
              <div className="text-xs text-[color:var(--rbr-muted)]">Prazo: {c.condicoes_pagamento_prazo}</div>
            )}
            <div className="flex gap-2 mt-1">
              <button
                onClick={() => openEdit(c)}
                className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border"
                style={{ borderColor: 'var(--rbr-border)', color: 'var(--rbr-navy)' }}
              >
                <IconEdit width={13} height={13} />
                Editar
              </button>
              {podeAlternarStatus(c) && (
                <button
                  onClick={() => toggleStatus(c)}
                  className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border"
                  style={{
                    borderColor: 'var(--rbr-border)',
                    color: c.status === 'ativo' ? 'var(--rbr-danger)' : 'var(--rbr-positive)',
                  }}
                >
                  {c.status === 'ativo' ? (
                    <>
                      <IconArchive width={13} height={13} />
                      Inativar
                    </>
                  ) : (
                    <>
                      <IconCheck width={13} height={13} />
                      Reativar
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
