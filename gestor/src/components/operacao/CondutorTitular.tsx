import { useEffect, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { mostrarToast } from '../../lib/toast'
import { mensagemClara } from '../../lib/mensagemClara'

// Condutor (quem dirige: vai no MDF-e e no CIOT) e Titular/recebedor (dono do veículo e quem recebe o pagamento).
// Colunas operacoes.condutor_id e titular_id (anuláveis). Em branco = usa o motorista da operação, como sempre foi.
// Gravar só mexe nessas duas colunas; quem pode gravar é decidido pelo banco (RLS).
type PessoaMini = { id: string; nome: string; cpf: string | null }

export default function CondutorTitular({ operacaoId, motoristaNome, onSalvo }: { operacaoId: string; motoristaNome: string | null; onSalvo: () => void }) {
  const [pessoas, setPessoas] = useState<PessoaMini[]>([])
  const [condutorId, setCondutorId] = useState('')
  const [titularId, setTitularId] = useState('')
  const [original, setOriginal] = useState({ condutor: '', titular: '' })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    void (async () => {
      const [ops, ps] = await Promise.all([
        supabase.from('operacoes').select('*').eq('id', operacaoId).maybeSingle(),
        supabase.from('pessoas').select('id, nome, cpf').in('papel', ['titular_motorista', 'condutor'] as never).eq('status', 'ativo').order('nome', { ascending: true }),
      ])
      if (!vivo) return
      const linha = (ops.data ?? {}) as { condutor_id?: string | null; titular_id?: string | null }
      const c = linha.condutor_id ?? ''
      const t = linha.titular_id ?? ''
      setCondutorId(c)
      setTitularId(t)
      setOriginal({ condutor: c, titular: t })
      setPessoas((ps.data ?? []) as PessoaMini[])
    })()
    return () => {
      vivo = false
    }
  }, [operacaoId])

  const mudou = condutorId !== original.condutor || titularId !== original.titular

  async function salvar() {
    setSalvando(true)
    setErro(null)
    try {
      const atualizar = supabase.from('operacoes').update as unknown as (v: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<{ error: { message: string } | null }> }
      const { error } = await atualizar.call(supabase.from('operacoes'), { condutor_id: condutorId || null, titular_id: titularId || null }).eq('id', operacaoId)
      if (error) throw new Error(error.message)
      setOriginal({ condutor: condutorId, titular: titularId })
      mostrarToast('Condutor e titular da operação salvos.', 'sucesso')
      onSalvo()
    } catch (e) {
      const msg = mensagemClara(e, 'Não consegui salvar o condutor e o titular agora.')
      setErro(msg)
      mostrarToast(msg, 'erro')
    } finally {
      setSalvando(false)
    }
  }

  const campo = 'border rounded-xl px-3 py-2 text-[13px] bg-white w-full'
  return (
    <div className="bg-white border rounded-2xl p-4 flex flex-col gap-3" style={{ borderColor: 'var(--rbr-border)' }}>
      <div className="text-[11px] font-extrabold tracking-[0.08em] text-[color:var(--rbr-muted)]">CONDUTOR E TITULAR</div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-[11px] text-[color:var(--rbr-muted)]">
          Condutor (quem dirige · vai no MDF-e e no CIOT)
          <select value={condutorId} onChange={(e) => setCondutorId(e.target.value)} className={campo} style={{ borderColor: 'var(--rbr-border)' }} disabled={salvando}>
            <option value="">Igual ao motorista{motoristaNome ? ` (${motoristaNome})` : ''}</option>
            {pessoas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-[color:var(--rbr-muted)]">
          Titular / recebedor (dono do veículo · recebe o pagamento)
          <select value={titularId} onChange={(e) => setTitularId(e.target.value)} className={campo} style={{ borderColor: 'var(--rbr-border)' }} disabled={salvando}>
            <option value="">Igual ao titular do veículo / motorista</option>
            {pessoas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="text-[11px]" style={{ color: 'var(--rbr-muted)' }}>
        Em branco, tudo continua como antes. Se o condutor informado não existir mais no cadastro, a emissão do MDF-e é bloqueada com aviso.
      </div>
      {erro && <div className="text-xs rounded-lg px-3 py-2" style={{ background: '#fbe3e1', color: '#7d1a12' }}>{erro}</div>}
      <div className="flex justify-end">
        <button type="button" onClick={() => void salvar()} disabled={!mudou || salvando} className="text-[12px] font-extrabold px-4 py-2 rounded-[10px] text-white disabled:opacity-50 disabled:cursor-not-allowed" style={{ background: '#1c2559' }}>
          {salvando ? 'Salvando…' : 'Salvar condutor e titular'}
        </button>
      </div>
    </div>
  )
}
