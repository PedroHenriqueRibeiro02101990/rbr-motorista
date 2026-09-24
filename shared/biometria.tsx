import { useEffect, useRef, useState } from 'react'

// Desbloqueio pela biometria do próprio celular/computador (digital ou rosto), via WebAuthn.
// Não substitui a senha: depois do login, a pessoa pode ligar a biometria e o app passa a pedir
// a digital/rosto ao abrir (e ao voltar depois de 5 minutos fora). "Usar senha" sai da conta.
// A credencial fica só no aparelho; nada biométrico chega à RBR.

const CHAVE = (uid: string) => `rbr_bio_${uid}`
const MINUTOS_FORA_PARA_TRAVAR = 5

function aleatorio(n = 32): ArrayBuffer {
  const a = new Uint8Array(n)
  crypto.getRandomValues(a)
  return a.buffer as ArrayBuffer
}
function paraB64(buf: ArrayBuffer): string {
  let s = ''
  new Uint8Array(buf).forEach((b) => (s += String.fromCharCode(b)))
  return btoa(s)
}
function deB64(b64: string): ArrayBuffer {
  const bin = atob(b64)
  const a = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i)
  return a.buffer as ArrayBuffer
}

function ler(uid: string): string | null {
  try {
    return localStorage.getItem(CHAVE(uid))
  } catch {
    return null
  }
}

export async function biometriaDisponivel(): Promise<boolean> {
  try {
    return (
      typeof window !== 'undefined' &&
      !!window.PublicKeyCredential &&
      window.isSecureContext &&
      (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
    )
  } catch {
    return false
  }
}

export function biometriaAtiva(uid: string): boolean {
  return !!ler(uid)
}

export async function ativarBiometria(uid: string, nome: string, email: string | null): Promise<void> {
  const idUsuario = new TextEncoder().encode(uid).slice(0, 64)
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: aleatorio(),
      rp: { name: 'RBR Cargo' },
      user: { id: idUsuario.buffer as ArrayBuffer, name: email || uid, displayName: nome || 'RBR Cargo' },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60000,
      attestation: 'none',
    },
  })) as PublicKeyCredential | null
  if (!cred) throw new Error('Biometria não confirmada.')
  try {
    localStorage.setItem(CHAVE(uid), paraB64(cred.rawId))
  } catch {
    throw new Error('Este navegador não permite guardar a configuração.')
  }
}

export function desativarBiometria(uid: string) {
  try {
    localStorage.removeItem(CHAVE(uid))
  } catch {
    /* sem armazenamento: nada a remover */
  }
}

export async function confirmarBiometria(uid: string): Promise<boolean> {
  const id = ler(uid)
  if (!id) return true
  const r = await navigator.credentials.get({
    publicKey: {
      challenge: aleatorio(),
      allowCredentials: [{ type: 'public-key', id: deB64(id) }],
      userVerification: 'required',
      timeout: 60000,
    },
  })
  return !!r
}

// Tela de bloqueio: envolve o app depois do login.
export function BiometriaGate({
  userId,
  onUsarSenha,
  children,
}: {
  userId: string
  onUsarSenha: () => void
  children: React.ReactNode
}) {
  const [travado, setTravado] = useState(() => biometriaAtiva(userId))
  const [erro, setErro] = useState<string | null>(null)
  const [tentando, setTentando] = useState(false)
  const saiuEm = useRef<number | null>(null)
  const tentouAuto = useRef(false)

  useEffect(() => {
    function mudou() {
      if (document.visibilityState === 'hidden') {
        saiuEm.current = Date.now()
      } else if (saiuEm.current && Date.now() - saiuEm.current > MINUTOS_FORA_PARA_TRAVAR * 60000 && biometriaAtiva(userId)) {
        tentouAuto.current = false
        setTravado(true)
      }
    }
    document.addEventListener('visibilitychange', mudou)
    return () => document.removeEventListener('visibilitychange', mudou)
  }, [userId])

  async function desbloquear() {
    setTentando(true)
    setErro(null)
    try {
      if (await confirmarBiometria(userId)) setTravado(false)
      else setErro('Não foi possível confirmar. Tente de novo.')
    } catch {
      setErro('Biometria cancelada ou indisponível. Tente de novo ou entre com a senha.')
    } finally {
      setTentando(false)
    }
  }

  useEffect(() => {
    if (travado && !tentouAuto.current) {
      tentouAuto.current = true
      desbloquear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [travado])

  if (!travado) return <>{children}</>

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-4 px-6 bg-white text-center">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center font-bold text-white text-lg"
        style={{ background: 'var(--rbr-navy)' }}
      >
        RBR
      </div>
      <div className="rbr-display text-xl font-bold text-[color:var(--rbr-navy-dark)]">App bloqueado</div>
      <p className="text-sm text-[color:var(--rbr-muted)] max-w-[300px]">Use a digital ou o reconhecimento de rosto do aparelho para continuar.</p>
      {erro && <p className="text-xs text-[color:var(--rbr-danger)] max-w-[300px]">{erro}</p>}
      <button
        onClick={desbloquear}
        disabled={tentando}
        className="rounded-xl px-6 py-3 font-bold text-sm text-[color:var(--rbr-navy-dark)] disabled:opacity-60"
        style={{ background: 'var(--rbr-gold)' }}
      >
        {tentando ? 'Aguardando…' : 'Desbloquear'}
      </button>
      <button
        onClick={() => {
          desativarBiometria(userId)
          onUsarSenha()
        }}
        className="text-sm font-semibold text-[color:var(--rbr-navy)] underline"
      >
        Entrar com a senha
      </button>
    </div>
  )
}

// Liga/desliga no Perfil.
export function BiometriaToggle({ userId, nome, email }: { userId: string; nome: string; email: string | null }) {
  const [disponivel, setDisponivel] = useState<boolean | null>(null)
  const [ativa, setAtiva] = useState(() => biometriaAtiva(userId))
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    biometriaDisponivel().then(setDisponivel)
  }, [])

  if (disponivel === false) return null
  if (disponivel === null) return null

  async function alternar() {
    setErro(null)
    if (ativa) {
      desativarBiometria(userId)
      setAtiva(false)
      return
    }
    setOcupado(true)
    try {
      await ativarBiometria(userId, nome, email)
      setAtiva(true)
    } catch (e) {
      setErro(e instanceof Error && e.message ? e.message : 'Não foi possível ativar.')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-center justify-between gap-3">
        <span className="flex flex-col">
          <span className="text-sm font-semibold text-[color:var(--rbr-navy-dark)]">Entrar com digital ou rosto</span>
          <span className="text-xs text-[color:var(--rbr-muted)]">O app pede a biometria do aparelho ao abrir.</span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={ativa}
          disabled={ocupado}
          onClick={alternar}
          className="relative w-11 h-6 rounded-full flex-shrink-0 transition-colors disabled:opacity-60"
          style={{ background: ativa ? 'var(--rbr-positive)' : 'var(--rbr-border)' }}
        >
          <span
            className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all"
            style={{ left: ativa ? 22 : 2, boxShadow: '0 1px 2px rgba(0,0,0,.2)' }}
          />
        </button>
      </label>
      {erro && <span className="text-xs text-[color:var(--rbr-danger)]">{erro}</span>}
    </div>
  )
}
