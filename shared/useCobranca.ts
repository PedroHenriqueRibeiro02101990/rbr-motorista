import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

/** Chave global: false = ninguém é cobrado nem bloqueado por assinatura/taxa. */
export function useCobrancaAtiva(): boolean {
  const [ativa, setAtiva] = useState(false)
  useEffect(() => {
    let vivo = true
    void supabase.rpc('cobranca_ativa').then(({ data }) => { if (vivo) setAtiva(data === true) })
    return () => { vivo = false }
  }, [])
  return ativa
}
