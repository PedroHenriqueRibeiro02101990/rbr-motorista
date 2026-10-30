import { useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { mensagemClara } from '../../lib/mensagemClara'

// D05 · O fiscal devolve a operação dizendo QUAL item está errado e por quê. O aviso vai a quem errou (quem alocou, senão quem gerou)
// e aos gestores. Só aparece enquanto a operação aguarda a liberação do fiscal.
const ITENS = ['CT-e', 'MDF-e', 'CIOT', 'Vale-pedágio', 'NF-e', 'Motorista ou veículo', 'Valor', 'Outro']
type ChamaRpc = (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>

export default function DevolverOperacao({ operacaoId, onDevolvida }: { operacaoId: string; onDevolvida: () => void }) {
  const [aberto, setAberto] = useState(false)
  const [item, setItem] = useState(ITENS[0])
  const [motivo, setMotivo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function devolver() {
    setOcupado(true)
    setErro(null)
    const { error } = await (supabase.rpc as unknown as ChamaRpc).call(supabase, 'devolver_pelo_fiscal', { p_operacao: operacaoId, p_item: item, p_motivo: motivo })
    setOcupado(false)
    if (error) return setErro(mensagemClara(error, 'Não consegui devolver agora.'))
    setAberto(false)
    setMotivo('')
    onDevolvida()
  }

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className="text-xs font-bold underline self-start" style={{ color: 'var(--rbr-danger)' }}>
        Devolver esta operação (item errado)
      </button>
    )
  }
  const caixa = 'text-xs rounded-lg border px-2.5 py-1.5 bg-white'
  return (
    <div className="flex items-center gap-2 flex-wrap text-xs rounded-xl px-3 py-2" style={{ background: '#FBE9E9' }}>
      <select value={item} onChange={(e) => setItem(e.target.value)} className={caixa} style={{ borderColor: 'var(--rbr-border)' }} aria-label="Item errado" disabled={ocupado}>
        {ITENS.map((i) => (
          <option key={i}>{i}</option>
        ))}
      </select>
      <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className={caixa} style={{ borderColor: 'var(--rbr-border)', flex: '1 1 200px' }} placeholder="O que está errado (mín. 5 letras)" aria-label="Motivo da devolução" disabled={ocupado} />
      <button type="button" onClick={() => void devolver()} disabled={ocupado || motivo.trim().length < 5} className="font-bold underline disabled:opacity-50" style={{ color: 'var(--rbr-danger)' }}>
        {ocupado ? 'Devolvendo…' : 'Devolver'}
      </button>
      <button type="button" onClick={() => setAberto(false)} className="underline text-[color:var(--rbr-muted)]">
        Voltar
      </button>
      {erro && <span style={{ color: 'var(--rbr-danger)' }}>{erro}</span>}
    </div>
  )
}
