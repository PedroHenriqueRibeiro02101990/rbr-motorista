import { useEffect, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { formatMoney } from '@rbr/shared/format'

// E04/E05 · Página pública de aceite (sem login). O cliente vê origem, destino e valor, informa nome e cargo e aceita.
// Tudo passa pela função proposta-publica; a página nunca lê o banco direto.

type Proposta = { origem: string | null; destino: string | null; carga: string | null; valor_total: number | null; valido_ate: string | null }
type Dados = { situacao: string; proposta: Proposta; aceite: { nome: string | null; em: string | null } | null }
type Resp = { ok: boolean; mensagem?: string; erro?: string; situacao?: string; proposta?: Proposta; aceite?: Dados['aceite']; aceito?: boolean }

async function chamar(corpo: Record<string, unknown>): Promise<Resp> {
  const { data, error } = await supabase.functions.invoke<Resp>('proposta-publica', { body: corpo })
  if (!error && data) return data
  const ctx = (error as { context?: Response } | null)?.context
  if (ctx && typeof ctx.json === 'function') {
    try {
      return (await ctx.json()) as Resp
    } catch {
      /* cai na mensagem padrão */
    }
  }
  return { ok: false, mensagem: 'Não consegui abrir agora. Tente de novo em instantes.' }
}

const dataCurta = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '')

export default function PropostaPublica({ codigo }: { codigo: string }) {
  const [dados, setDados] = useState<Dados | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [cargo, setCargo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    void chamar({ acao: 'ver', codigo }).then((r) => {
      if (!vivo) return
      if (r.ok && r.proposta) setDados({ situacao: r.situacao ?? 'valido', proposta: r.proposta, aceite: r.aceite ?? null })
      else setMsg(r.mensagem ?? r.erro ?? 'Este link não é válido.')
    })
    return () => {
      vivo = false
    }
  }, [codigo])

  async function aceitar(e: React.FormEvent) {
    e.preventDefault()
    if (enviando) return
    setEnviando(true)
    setErro(null)
    const r = await chamar({ acao: 'aceitar', codigo, nome, cargo })
    setEnviando(false)
    if (r.ok) setDados((d) => (d ? { ...d, situacao: 'aceito', aceite: { nome: nome.trim(), em: new Date().toISOString() } } : d))
    else setErro(r.mensagem ?? r.erro ?? 'Não foi possível aceitar agora.')
  }

  const caixa = 'w-full rounded-xl border px-3 py-2.5 text-sm bg-white'
  return (
    <div className="min-h-dvh flex items-start justify-center p-4 md:p-8" style={{ background: 'var(--rbr-muted-bg)' }}>
      <div className="w-full max-w-md bg-white rounded-2xl p-5 md:p-6 flex flex-col gap-4" style={{ boxShadow: '0 12px 40px rgba(30,39,97,0.10)' }}>
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">RBR Cargo</div>
          <h1 className="rbr-display font-bold text-2xl text-[color:var(--rbr-navy-dark)]">Proposta de frete</h1>
        </div>
        {!dados && !msg && <div className="text-sm text-[color:var(--rbr-muted)]">Abrindo a proposta…</div>}
        {msg && <div className="text-sm font-semibold" style={{ color: 'var(--rbr-danger)' }}>{msg}</div>}
        {dados && (
          <>
            <div className="rounded-xl px-4 py-3 flex flex-col gap-1.5 text-sm" style={{ background: 'var(--rbr-muted-bg)' }}>
              <div><b>Origem:</b> {dados.proposta.origem ?? '—'}</div>
              <div><b>Destino:</b> {dados.proposta.destino ?? '—'}</div>
              {dados.proposta.carga && <div><b>Carga:</b> {dados.proposta.carga}</div>}
              <div className="text-lg font-bold text-[color:var(--rbr-navy-dark)] tabular-nums">{formatMoney(Number(dados.proposta.valor_total ?? 0))}</div>
              {dados.proposta.valido_ate && <div className="text-xs text-[color:var(--rbr-muted)]">Válida até {dataCurta(dados.proposta.valido_ate)}</div>}
            </div>
            {dados.situacao === 'aceito' ? (
              <div className="rounded-xl px-4 py-3 text-sm font-semibold" style={{ background: '#E7F5EC', color: '#137A45' }}>
                ✓ Proposta aceita{dados.aceite?.nome ? ` por ${dados.aceite.nome}` : ''}{dados.aceite?.em ? ` em ${dataCurta(dados.aceite.em)}` : ''}. A RBR Cargo vai entrar em contato.
              </div>
            ) : (
              <form onSubmit={(e) => void aceitar(e)} className="flex flex-col gap-3">
                <label className="flex flex-col gap-1 text-xs text-[color:var(--rbr-muted)]">
                  Seu nome completo
                  <input value={nome} onChange={(e) => setNome(e.target.value)} className={caixa} style={{ borderColor: 'var(--rbr-border)' }} autoComplete="name" disabled={enviando} />
                </label>
                <label className="flex flex-col gap-1 text-xs text-[color:var(--rbr-muted)]">
                  Seu cargo
                  <input value={cargo} onChange={(e) => setCargo(e.target.value)} className={caixa} style={{ borderColor: 'var(--rbr-border)' }} autoComplete="organization-title" disabled={enviando} />
                </label>
                <div className="text-[11px] text-[color:var(--rbr-muted)]">Ao aceitar, registramos seu nome, cargo, data e o endereço de rede (IP) desta conexão.</div>
                {erro && <div className="text-xs font-semibold" style={{ color: 'var(--rbr-danger)' }}>{erro}</div>}
                <button type="submit" disabled={enviando || nome.trim().length < 3 || cargo.trim().length < 2} className="rounded-xl py-3 text-sm font-bold text-white disabled:opacity-50" style={{ background: 'var(--rbr-navy)' }}>
                  {enviando ? 'Enviando…' : 'Aceitar proposta'}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  )
}
