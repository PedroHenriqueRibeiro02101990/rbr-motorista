import { useState } from 'react'
import { useAuth } from '@rbr/shared/useAuth'

export default function AuthScreen() {
  const { signInWithPassword, error } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setLocalError(null)
    const result = await signInWithPassword(email, password)
    if (result.error) setLocalError(result.error.message)
    setSubmitting(false)
  }

  return (
    <div className="min-h-dvh flex flex-col justify-center px-6 py-10 bg-white">
      <div className="mx-auto w-full max-w-[380px]">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6 font-bold text-white text-lg"
          style={{ background: 'var(--rbr-navy)' }}
        >
          RBR
        </div>
        <h1 className="rbr-display text-2xl font-bold text-[color:var(--rbr-navy-dark)] mb-1">
          Painel interno RBR Cargo
        </h1>
        <p className="text-sm text-[color:var(--rbr-muted)] mb-6">
          Acesso restrito à equipe RBR. Entre com sua conta de gestor.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            className="border border-[color:var(--rbr-border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[color:var(--rbr-navy)]"
            placeholder="E-mail"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="border border-[color:var(--rbr-border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[color:var(--rbr-navy)]"
            placeholder="Senha"
            type="password"
            autoComplete="current-password"
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {(localError || error) && (
            <p className="text-xs text-[color:var(--rbr-danger)]">{localError ?? error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded-xl py-3 font-bold text-sm text-[color:var(--rbr-navy-dark)] disabled:opacity-60"
            style={{ background: 'var(--rbr-gold)' }}
          >
            {submitting ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <p className="mt-5 text-xs text-[color:var(--rbr-muted)] text-center">
          Contas de gestor são criadas internamente pela RBR — não há cadastro público nesta tela.
        </p>
      </div>
    </div>
  )
}
