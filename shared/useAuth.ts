import { useEffect, useState, useCallback } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'
import type { Database } from './database.types'

type Pessoa = Database['public']['Tables']['pessoas']['Row']

interface AuthState {
  session: Session | null
  pessoa: Pessoa | null
  loading: boolean
  error: string | null
}

/**
 * Sessão Supabase + linha correspondente em `pessoas` (via auth_user_id).
 * Se a sessão existe mas não há pessoa ainda, `pessoa` fica null — a tela de
 * cadastro (onboarding) usa isso para saber que precisa criar o registro.
 */
export function useAuth(papelEsperado?: Pessoa['papel']) {
  const [state, setState] = useState<AuthState>({
    session: null,
    pessoa: null,
    loading: true,
    error: null,
  })

  const loadPessoa = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('pessoas')
      .select('*')
      .eq('auth_user_id', userId)
      .maybeSingle()
    if (error) {
      setState((s) => ({ ...s, error: error.message, loading: false }))
      return
    }
    setState((s) => ({ ...s, pessoa: data, loading: false, error: null }))
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setState((s) => ({ ...s, session }))
      if (session?.user.id) {
        loadPessoa(session.user.id)
      } else {
        setState((s) => ({ ...s, loading: false }))
      }
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setState((s) => ({ ...s, session, loading: true }))
      if (session?.user.id) {
        loadPessoa(session.user.id)
      } else {
        setState({ session: null, pessoa: null, loading: false, error: null })
      }
    })

    return () => sub.subscription.unsubscribe()
  }, [loadPessoa])

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setState((s) => ({ ...s, error: error.message }))
    return { error }
  }, [])

  const signUp = useCallback(
    async (email: string, password: string, nome: string, papel: Pessoa['papel']) => {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error || !data.user) {
        setState((s) => ({ ...s, error: error?.message ?? 'Falha ao criar usuário' }))
        return { error }
      }
      const { error: pessoaError } = await supabase.from('pessoas').insert({
        auth_user_id: data.user.id,
        nome,
        email,
        papel,
      })
      if (pessoaError) {
        setState((s) => ({ ...s, error: pessoaError.message }))
        return { error: pessoaError }
      }
      await loadPessoa(data.user.id)
      return { error: null }
    },
    [loadPessoa],
  )

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const papelDivergente = Boolean(
    papelEsperado && state.pessoa && state.pessoa.papel !== papelEsperado,
  )

  return { ...state, signInWithPassword, signUp, signOut, papelDivergente }
}
