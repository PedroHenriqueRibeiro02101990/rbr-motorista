import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { mensagemClara } from '../../lib/mensagemClara'

// D02 · Assumir a operação. Mostra quem é o responsável; assumir uma operação livre é um clique; tomar de outra pessoa pede motivo.
type ChamaRpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>

export default function AssumirOperacao({ operacaoId }: { operacaoId: string }) {
  const [dono, setDono] = useState<{ id: string | null; nome: string | null } | null>(null)
  const [eu, setEu] = useState<string | null>(null)
  const [pedindoMotivo, setPedindoMotivo] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    const { data: o } = await supabase.from('operacoes').select('assumida_por').eq('id', operacaoId).maybeSingle()
    const id = (o as { assumida_por: string | null } | null)?.assumida_por ?? null
    if (!id) return setDono({ id: null, nome: null })
    const { data: p } = await supabase.from('pessoas').select('nome').eq('id', id).maybeSingle()
    setDono({ id, nome: p?.nome ?? null })
  }, [operacaoId])

  useEffect(() => {
    void carregar()
    void (supabase.rpc as unknown as ChamaRpc).call(supabase, 'current_pessoa_id').then(({ data }) => setEu(typeof data === 'string' ? data : null))
  }, [carregar])

  async function chamar(fn: string, args: Record<string, unknown>) {
    setOcupado(true)
    setErro(null)
    const { error } = await (supabase.rpc as unknown as ChamaRpc).call(supabase, fn, args)
    setOcupado(false)
    if (error) return setErro(mensagemClara(error, 'Não consegui agora.'))
    setPedindoMotivo(false)
    setMotivo('')
    await carregar()
  }

  if (!dono) return null
  const sou = !!eu && dono.id === eu
  const caixa = 'text-xs rounded-lg border px-2.5 py-1.5 bg-white'
  return (
    <div className="flex items-center gap-2 flex-wrap text-xs">
      {dono.id ? (
        <span className="font-bold text-[color:var(--rbr-navy-dark)]">{sou ? 'Você é o responsável' : `Responsável: ${dono.nome ?? 'outra pessoa'}`}</span>
      ) : (
        <span className="text-[color:var(--rbr-muted)]">Sem responsável</span>
      )}
      {!sou && !pedindoMotivo && (
        <button type="button" disabled={ocupado} onClick={() => (dono.id ? setPedindoMotivo(true) : void chamar('assumir_operacao', { p_operacao: operacaoId }))} className="font-bold underline text-[color:var(--rbr-navy)]">
          {dono.id ? 'Tomar para mim' : 'Assumir'}
        </button>
      )}
      {sou && (
        <button type="button" disabled={ocupado} onClick={() => void chamar('largar_operacao', { p_operacao: operacaoId })} className="font-bold underline text-[color:var(--rbr-muted)]">
          Largar
        </button>
      )}
      {pedindoMotivo && (
        <>
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className={caixa} style={{ borderColor: 'var(--rbr-border)' }} placeholder="Motivo (mín. 5 letras)" aria-label="Motivo para tomar a operação" />
          <button type="button" disabled={ocupado || motivo.trim().length < 5} onClick={() => void chamar('assumir_operacao', { p_operacao: operacaoId, p_tomar: true, p_motivo: motivo })} className="font-bold underline text-[color:var(--rbr-navy)] disabled:opacity-50">
            Confirmar
          </button>
          <button type="button" onClick={() => setPedindoMotivo(false)} className="underline text-[color:var(--rbr-muted)]">
            Voltar
          </button>
        </>
      )}
      {erro && <span style={{ color: 'var(--rbr-danger)' }}>{erro}</span>}
    </div>
  )
}
