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
  const [confirmando, setConfirmando] = useState(false)
  const [li, setLi] = useState(false)

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

  const caixa = 'w-full rounded-xl border px-3 py-2.5 text-[15px] font-bold bg-white'
  const valor = Number(dados?.proposta.valor_total ?? 0)
  return (
    <div className="min-h-dvh flex items-start justify-center md:p-8" style={{ background: '#e9ecf4' }}>
      <div className="w-full max-w-md md:rounded-[28px] overflow-hidden flex flex-col min-h-dvh md:min-h-[640px]" style={{ background: '#f3f5f9', boxShadow: '0 12px 40px rgba(28,37,89,0.18)' }}>
        <div className="px-5 pt-5 pb-5 text-white" style={{ background: '#1c2559' }}>
          <div className="flex items-center justify-between">
            <div className="text-[16px] font-extrabold">RBR Cargo</div>
            <span className="text-[11px] font-extrabold rounded-full px-3 py-1" style={{ background: 'rgba(255,255,255,0.18)' }}>
              proposta {codigo.slice(0, 4).toUpperCase()}
            </span>
          </div>
          <div className="text-[12px] mt-2 opacity-80">Proposta de frete</div>
        </div>
        <div className="flex-1 flex flex-col gap-3.5 p-5">
          {!dados && !msg && <div className="text-sm text-[color:var(--rbr-muted)]">Abrindo a proposta…</div>}
          {msg && <div className="text-sm font-semibold" style={{ color: 'var(--rbr-danger)' }}>{msg}</div>}
          {dados && !confirmando && (
            <>
              <div>
                <div className="text-[12px]" style={{ color: 'var(--rbr-muted)' }}>Frete por viagem</div>
                <div className="text-[34px] leading-tight font-extrabold tabular-nums" style={{ color: '#1c2559' }}>{formatMoney(valor)}</div>
                {dados.proposta.valido_ate && <div className="text-[12px]" style={{ color: 'var(--rbr-muted)' }}>válida até {dataCurta(dados.proposta.valido_ate)}</div>}
              </div>
              <div className="bg-white border rounded-2xl px-4 py-3 flex flex-col gap-1.5 text-[13px]" style={{ borderColor: 'var(--rbr-border)' }}>
                <div className="flex justify-between gap-3"><span style={{ color: 'var(--rbr-muted)' }}>Origem</span><b className="text-right">{dados.proposta.origem ?? '—'}</b></div>
                <div className="flex justify-between gap-3"><span style={{ color: 'var(--rbr-muted)' }}>Destino</span><b className="text-right">{dados.proposta.destino ?? '—'}</b></div>
                {dados.proposta.carga && <div className="flex justify-between gap-3"><span style={{ color: 'var(--rbr-muted)' }}>Carga</span><b className="text-right">{dados.proposta.carga}</b></div>}
              </div>
              {dados.situacao === 'aceito' ? (
                <div className="rounded-xl px-4 py-3 text-sm font-semibold" style={{ background: '#E7F5EC', color: '#137A45' }}>
                  ✓ Proposta aceita{dados.aceite?.nome ? ` por ${dados.aceite.nome}` : ''}{dados.aceite?.em ? ` em ${dataCurta(dados.aceite.em)}` : ''}. A RBR Cargo vai entrar em contato.
                </div>
              ) : dados.situacao === 'valido' ? (
                <>
                  <div className="flex gap-2">
                    <button type="button" disabled title="Ainda não disponível" className="flex-1 text-[13px] font-extrabold py-2.5 rounded-xl border bg-white opacity-50 cursor-not-allowed" style={{ borderColor: 'var(--rbr-border)', color: '#1c2559' }}>
                      Baixar PDF
                    </button>
                  </div>
                  <div className="mt-auto flex flex-col gap-2">
                    <button type="button" onClick={() => setConfirmando(true)} className="rounded-xl py-3.5 text-[15px] font-extrabold text-white" style={{ background: '#1c2559' }}>
                      Aceitar proposta
                    </button>
                    <div className="text-center text-[11px]" style={{ color: 'var(--rbr-muted)' }}>Valor e condições fechados até a validade.</div>
                  </div>
                </>
              ) : (
                <div className="rounded-xl px-4 py-3 text-sm font-semibold" style={{ background: '#fff4d9', color: '#7a5200' }}>Proposta expirada. Peça uma nova à RBR Cargo.</div>
              )}
            </>
          )}
          {dados && confirmando && dados.situacao !== 'aceito' && (
            <form onSubmit={(e) => void aceitar(e)} className="flex-1 flex flex-col gap-3">
              <div className="text-[20px] font-extrabold" style={{ color: '#0f1535' }}>Confirmar o aceite</div>
              <label className="flex flex-col gap-1 text-[11px]" style={{ color: 'var(--rbr-muted)' }}>
                Seu nome
                <input value={nome} onChange={(e) => setNome(e.target.value)} className={caixa} style={{ borderColor: 'var(--rbr-border)' }} autoComplete="name" disabled={enviando} />
              </label>
              <label className="flex flex-col gap-1 text-[11px]" style={{ color: 'var(--rbr-muted)' }}>
                Cargo
                <input value={cargo} onChange={(e) => setCargo(e.target.value)} className={caixa} style={{ borderColor: 'var(--rbr-border)' }} autoComplete="organization-title" disabled={enviando} />
              </label>
              <label className="flex items-start gap-2.5 text-[12px]" style={{ color: '#4a5275' }}>
                <input type="checkbox" checked={li} onChange={(e) => setLi(e.target.checked)} className="mt-0.5" />
                Li a proposta e aceito o frete de <b>{formatMoney(valor)}</b> nas condições acima.
              </label>
              {erro && <div className="text-xs font-semibold" style={{ color: 'var(--rbr-danger)' }}>{erro}</div>}
              <div className="mt-auto flex flex-col gap-2">
                <button type="submit" disabled={enviando || !li || nome.trim().length < 3 || cargo.trim().length < 2} className="rounded-xl py-3.5 text-[15px] font-extrabold text-white disabled:opacity-50" style={{ background: '#1a6b3c' }}>
                  {enviando ? 'Enviando…' : 'Confirmar aceite'}
                </button>
                <button type="button" onClick={() => setConfirmando(false)} disabled={enviando} className="text-[12px] font-bold underline" style={{ color: 'var(--rbr-muted)' }}>
                  Voltar
                </button>
                <div className="text-center text-[11px]" style={{ color: '#8a91ad' }}>Registramos nome, cargo, data, hora e endereço de acesso como comprovante.</div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
