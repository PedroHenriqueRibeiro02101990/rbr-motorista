import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import type { Database } from '@rbr/shared/database.types'
import { BadgeAprovacao, enviarDocumentoPessoal, itensDe, ListaItens } from '@rbr/shared/cadastro'
import { cpfValido, linkWhatsApp, mascaraCelular, mascaraDocDigitando, mascararDoc, normalizarDoc, soDigitos } from '@rbr/shared/documento'
import { IconCamera } from '@rbr/shared/icons'

type Pessoa = Database['public']['Tables']['pessoas']['Row']

const inputClass = 'border rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-[color:var(--rbr-navy)] w-full'
const inputStyle = { borderColor: 'var(--rbr-border)' }
const cardStyle = { borderColor: 'var(--rbr-border)', boxShadow: '0 1px 2px rgba(18,23,61,0.03), 0 6px 18px rgba(18,23,61,0.05)' }

// Dono de frota cadastra quem dirige os veículos dele. Cada condutor passa pela mesma conferência automática (CNH).
export default function Condutores({ titular }: { titular: Pessoa }) {
  const [lista, setLista] = useState<Pessoa[]>([])
  const [aberto, setAberto] = useState(false)
  const [form, setForm] = useState({ nome: '', cpf: '', celular: '', email: '' })
  const [erro, setErro] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [expandido, setExpandido] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from('pessoas')
      .select('*')
      .eq('titular_id', titular.id)
      .eq('papel', 'condutor')
      .order('nome')
    setLista(data ?? [])
  }, [titular.id])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function salvar() {
    setErro(null)
    const cpf = normalizarDoc(form.cpf)
    if (form.nome.trim().length < 3) return setErro('Informe o nome completo.')
    if (!cpfValido(cpf)) return setErro('CPF inválido.')
    if (soDigitos(form.celular).length < 10) return setErro('Informe o celular com DDD.')
    setOcupado('novo')
    const { error } = await supabase.from('pessoas').insert({
      papel: 'condutor',
      tipo_pessoa_doc: 'PF',
      titular_id: titular.id,
      nome: form.nome.trim(),
      cpf,
      celular: soDigitos(form.celular),
      email: form.email.trim().toLowerCase() || null,
      origem_cadastro: 'app_titular',
    })
    setOcupado(null)
    if (error) {
      setErro(
        /cpf/i.test(error.message)
          ? 'Este CPF já tem cadastro na RBR. Fale com a RBR para vincular o condutor.'
          : /celular/i.test(error.message)
            ? 'Este celular já está em outro cadastro.'
            : error.message,
      )
      return
    }
    setForm({ nome: '', cpf: '', celular: '', email: '' })
    setAberto(false)
    setMsg('Condutor cadastrado. Agora envie a foto da CNH dele.')
    carregar()
  }

  async function enviarCnh(c: Pessoa, file: File) {
    setOcupado(c.id)
    setMsg(null)
    const r = await enviarDocumentoPessoal({ tipo: 'cnh', arquivo: file, pessoaId: c.id, pastaPessoaId: c.id })
    setOcupado(null)
    if (r.erro) return setMsg(r.erro)
    setMsg(`CNH de ${c.nome.split(' ')[0]} recebida e conferida.`)
    setExpandido(c.id)
    carregar()
  }

  async function enviarAcesso(c: Pessoa) {
    setOcupado(c.id)
    setMsg(null)
    const { data, error } = await supabase.functions.invoke('acesso-app', {
      body: { acao: 'link_acesso', pessoa_id: c.id, redirect_to: window.location.origin },
    })
    setOcupado(null)
    if (error || !data?.ok) {
      let texto = 'Não foi possível gerar o acesso.'
      try {
        const corpo = await (error as unknown as { context: Response }).context.json()
        texto = corpo?.erro ?? texto
      } catch {
        texto = data?.erro ?? texto
      }
      return setMsg(texto)
    }
    const texto = `Olá, ${c.nome.split(' ')[0]}! Seu acesso ao app da RBR Cargo está pronto. Toque no link para criar sua senha: ${data.link}`
    window.open(linkWhatsApp(c.celular, texto), '_blank', 'noopener')
  }

  return (
    <div className="bg-white border rounded-[20px] p-[18px] flex flex-col gap-3" style={cardStyle}>
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">Condutores da frota</div>
        {!aberto && (
          <button type="button" onClick={() => setAberto(true)} className="text-xs font-bold underline" style={{ color: 'var(--rbr-navy)' }}>
            + Adicionar
          </button>
        )}
      </div>
      {lista.length === 0 && !aberto && (
        <div className="text-xs text-[color:var(--rbr-muted)]">Se outras pessoas dirigem seus veículos, cadastre cada uma aqui.</div>
      )}

      {lista.map((c) => {
        const temCnh = !!c.cnh_foto_url || itensDe(c.verificacao).some((i) => i.codigo === 'doc_identidade' && i.nivel === 'ok')
        return (
          <div key={c.id} className="border rounded-[14px] p-3 flex flex-col gap-2" style={{ borderColor: 'var(--rbr-border)' }}>
            <button type="button" onClick={() => setExpandido(expandido === c.id ? null : c.id)} className="flex items-center gap-2 text-left">
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-bold truncate">{c.nome}</div>
                <div className="text-xs text-[color:var(--rbr-muted)]">
                  CPF {mascararDoc(c.cpf)} {c.cnh_categoria ? `· CNH ${c.cnh_categoria}` : ''}
                </div>
              </div>
              <BadgeAprovacao status={c.aprovacao_status} />
            </button>
            {expandido === c.id && <ListaItens itens={itensDe(c.verificacao).filter((i) => i.nivel !== 'info')} />}
            <div className="flex gap-2 flex-wrap">
              <label
                className="flex items-center gap-1.5 border rounded-lg px-2.5 py-1.5 text-xs font-semibold cursor-pointer"
                style={{ borderColor: 'var(--rbr-navy)', color: 'var(--rbr-navy)', opacity: ocupado === c.id ? 0.6 : 1 }}
              >
                <IconCamera width={14} height={14} />
                {temCnh ? 'Trocar CNH' : 'Enviar CNH'}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  disabled={ocupado === c.id}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (f) enviarCnh(c, f)
                  }}
                />
              </label>
              {c.email && !c.auth_user_id && (
                <button
                  type="button"
                  disabled={ocupado === c.id}
                  onClick={() => enviarAcesso(c)}
                  className="border rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-60"
                  style={{ borderColor: 'var(--rbr-border)', color: 'var(--rbr-navy-dark)' }}
                >
                  Enviar acesso pelo WhatsApp
                </button>
              )}
              {c.auth_user_id && <span className="text-[11px] text-[color:var(--rbr-muted)] self-center">Já tem acesso ao app</span>}
            </div>
          </div>
        )
      })}

      {aberto && (
        <div className="flex flex-col gap-2.5 border-t pt-3" style={{ borderColor: 'var(--rbr-border)' }}>
          <input className={inputClass} style={inputStyle} placeholder="Nome completo" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          <input
            className={inputClass}
            style={inputStyle}
            placeholder="CPF"
            inputMode="numeric"
            value={form.cpf}
            onChange={(e) => setForm({ ...form, cpf: mascaraDocDigitando(e.target.value, 'PF') })}
          />
          <input
            className={inputClass}
            style={inputStyle}
            placeholder="Celular com DDD"
            inputMode="tel"
            value={form.celular}
            onChange={(e) => setForm({ ...form, celular: mascaraCelular(e.target.value) })}
          />
          <input
            className={inputClass}
            style={inputStyle}
            placeholder="E-mail (para ele entrar no app — opcional)"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          {erro && (
            <div className="text-xs rounded-xl px-3 py-2" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
              {erro}
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setAberto(false)
                setErro(null)
              }}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold border"
              style={{ borderColor: 'var(--rbr-border)', color: 'var(--rbr-muted)' }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={salvar}
              disabled={ocupado === 'novo'}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold disabled:opacity-60"
              style={{ background: 'var(--rbr-gold)', color: 'var(--rbr-navy-dark)' }}
            >
              {ocupado === 'novo' ? 'Salvando…' : 'Salvar condutor'}
            </button>
          </div>
        </div>
      )}
      {msg && <div className="text-xs text-[color:var(--rbr-navy-dark)]">{msg}</div>}
    </div>
  )
}
