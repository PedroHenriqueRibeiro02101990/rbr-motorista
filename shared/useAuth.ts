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
  recuperandoSenha: boolean
  registrando: boolean
  erroCadastro: string | null
}

export type DadosCadastro = {
  papel: 'titular_motorista' | 'agenciador'
  tipo_pessoa_doc: 'PF' | 'PJ'
  documento: string
  nome: string
  celular: string
  aceite_termos: boolean
  versao_termos?: string
}

const CHAVE_PENDENTE = 'rbr_cadastro_pendente'

export function lerCadastroPendente(): DadosCadastro | null {
  try {
    const t = localStorage.getItem(CHAVE_PENDENTE)
    return t ? (JSON.parse(t) as DadosCadastro) : null
  } catch {
    return null
  }
}
function salvarCadastroPendente(d: DadosCadastro | null) {
  try {
    if (d) localStorage.setItem(CHAVE_PENDENTE, JSON.stringify(d))
    else localStorage.removeItem(CHAVE_PENDENTE)
  } catch {
    /* sem armazenamento: a pessoa preenche de novo no primeiro login */
  }
}

// Traduz os códigos que o banco devolve no cadastro.
export function mensagemErroCadastro(msg: string | undefined | null): string {
  const m = msg ?? ''
  if (m.includes('DOCUMENTO_JA_CADASTRADO')) return 'Já existe uma conta com este CPF/CNPJ. Use "Esqueci minha senha" para recuperar o acesso.'
  if (m.includes('CELULAR_JA_CADASTRADO')) return 'Este celular já está em outra conta. Use outro número ou recupere o acesso da conta existente.'
  if (m.includes('CPF_INVALIDO')) return 'CPF inválido. Confira os números.'
  if (m.includes('CNPJ_INVALIDO')) return 'CNPJ inválido. Confira os caracteres.'
  if (m.includes('CONTA_JA_TEM_CADASTRO')) return 'Esta conta já tem cadastro.'
  if (/already registered|already been registered|User already/i.test(m)) return 'Este e-mail já tem conta. Entre com a senha ou use "Esqueci minha senha".'
  if (/weak|pwned|leaked/i.test(m)) return 'Essa senha já apareceu em vazamentos de dados. Escolha outra.'
  return m || 'Não foi possível concluir o cadastro.'
}

/**
 * Sessão Supabase + linha correspondente em `pessoas` (via auth_user_id).
 * Se a sessão existe mas não há pessoa ainda, `pessoa` fica null — o app mostra a tela
 * de concluir cadastro. `recuperandoSenha` fica true quando a pessoa abriu o link de nova senha.
 */
export function useAuth(papelEsperado?: Pessoa['papel']) {
  const [state, setState] = useState<AuthState>({
    session: null,
    pessoa: null,
    loading: true,
    error: null,
    recuperandoSenha: typeof window !== 'undefined' && /type=recovery/.test(window.location.hash),
    registrando: false,
    erroCadastro: null,
  })

  const loadPessoa = useCallback(async (userId: string) => {
    const { data, error } = await supabase.from('pessoas').select('*').eq('auth_user_id', userId).maybeSingle()
    if (error) {
      setState((s) => ({ ...s, error: error.message, loading: false }))
      return
    }
    setState((s) => ({ ...s, pessoa: data, loading: false, error: null }))
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setState((s) => ({ ...s, session }))
      if (session?.user.id) loadPessoa(session.user.id)
      else setState((s) => ({ ...s, loading: false }))
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setState((s) => ({ ...s, recuperandoSenha: true }))
      if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        setState((s) => ({ ...s, session }))
        return
      }
      // Evita piscar "Carregando…" quando é o mesmo usuário (ex.: voltar para a aba).
      setState((s) => ({ ...s, session, loading: !s.pessoa || s.pessoa.auth_user_id !== session?.user.id }))
      if (session?.user.id) loadPessoa(session.user.id)
      else setState((s) => ({ ...s, session: null, pessoa: null, loading: false, error: null, recuperandoSenha: false }))
    })

    return () => sub.subscription.unsubscribe()
  }, [loadPessoa])

  const recarregar = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    if (data.session?.user.id) await loadPessoa(data.session.user.id)
  }, [loadPessoa])

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setState((s) => ({ ...s, error: error.message }))
    return { error }
  }, [])

  // Conclui o cadastro (quem já está logado sem pessoa).
  const registrar = useCallback(
    async (dados: DadosCadastro) => {
      const { error } = await supabase.rpc('registrar_meu_cadastro', { p: dados })
      if (error) {
        const msg = mensagemErroCadastro(error.message)
        setState((s) => ({ ...s, erroCadastro: msg }))
        return { error: msg }
      }
      salvarCadastroPendente(null)
      setState((s) => ({ ...s, erroCadastro: null }))
      await recarregar()
      return { error: null }
    },
    [recarregar],
  )

  // Cria a conta (e-mail + senha) e o cadastro. Se o projeto exigir confirmação de e-mail,
  // guarda os dados e termina no primeiro login.
  const cadastrar = useCallback(
    async (email: string, password: string, dados: DadosCadastro) => {
      // Guarda antes: se o app trocar de tela no meio (login automático), o formulário de concluir já vem preenchido.
      salvarCadastroPendente(dados)
      setState((s) => ({ ...s, registrando: true, erroCadastro: null }))
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      })
      if (error || !data.user) {
        setState((s) => ({ ...s, registrando: false }))
        return { error: mensagemErroCadastro(error?.message), confirmarEmail: false }
      }
      if (!data.session) {
        setState((s) => ({ ...s, registrando: false }))
        return { error: null, confirmarEmail: true }
      }
      const r = await registrar(dados)
      setState((s) => ({ ...s, registrando: false }))
      return { error: r.error, confirmarEmail: false }
    },
    [registrar],
  )

  const definirNovaSenha = useCallback(async (novaSenha: string) => {
    const { error } = await supabase.auth.updateUser({ password: novaSenha })
    if (error) return { error: mensagemErroCadastro(error.message) }
    // Troca de senha derruba as outras sessões (outros aparelhos).
    await supabase.auth.signOut({ scope: 'others' })
    if (typeof window !== 'undefined' && window.location.hash) {
      history.replaceState(null, '', window.location.pathname + window.location.search)
    }
    setState((s) => ({ ...s, recuperandoSenha: false }))
    return { error: null }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const papelDivergente = Boolean(papelEsperado && state.pessoa && state.pessoa.papel !== papelEsperado)

  return { ...state, signInWithPassword, cadastrar, registrar, definirNovaSenha, recarregar, signOut, papelDivergente }
}
