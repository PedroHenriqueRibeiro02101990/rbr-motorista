import { useState } from 'react'
import { supabase } from './supabaseClient'
import { checarSenha, FORCA_LABEL } from './senha'
import { cnpjValido, cpfValido, mascaraCelular, mascaraDocDigitando, normalizarDoc, soDigitos } from './documento'
import { lerCadastroPendente, type DadosCadastro } from './useAuth'

type App = 'motorista' | 'agenciador' | 'gestor'

type AuthApi = {
  signInWithPassword: (email: string, password: string) => Promise<{ error: { message: string } | null }>
  cadastrar: (email: string, password: string, dados: DadosCadastro) => Promise<{ error: string | null; confirmarEmail: boolean }>
  registrar: (dados: DadosCadastro) => Promise<{ error: string | null }>
  definirNovaSenha: (senha: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  erroCadastro?: string | null
}

const input =
  'border border-[color:var(--rbr-border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[color:var(--rbr-navy)] w-full bg-white'
const botaoPrimario = 'rounded-xl py-3 font-bold text-sm text-[color:var(--rbr-navy-dark)] disabled:opacity-60 w-full'
const VERSAO_TERMOS: Record<App, string> = { motorista: 'motorista-v1', agenciador: 'agenciador-v1', gestor: '' }

function traduzLogin(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.'
  if (/email not confirmed/i.test(msg)) return 'Confirme seu e-mail antes de entrar (veja a caixa de entrada e o spam).'
  if (/banned/i.test(msg)) return 'O acesso desta conta está bloqueado. Fale com a RBR.'
  if (/rate|too many/i.test(msg)) return 'Muitas tentativas. Aguarde alguns minutos.'
  return msg
}

function Marca() {
  return (
    <div
      className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6 font-bold text-white text-lg"
      style={{ background: 'var(--rbr-navy)' }}
    >
      RBR
    </div>
  )
}

function Caixa({ tom, children }: { tom: 'erro' | 'aviso' | 'ok'; children: React.ReactNode }) {
  const estilo =
    tom === 'erro'
      ? { background: '#FBE9E9', color: 'var(--rbr-danger)' }
      : tom === 'ok'
        ? { background: '#E7F6EE', color: 'var(--rbr-navy-dark)' }
        : { background: 'var(--rbr-warning-bg)', color: 'var(--rbr-navy-dark)' }
  return (
    <div className="text-xs rounded-xl px-3.5 py-3 leading-relaxed" style={estilo}>
      {children}
    </div>
  )
}

export function CampoSenha({
  valor,
  onChange,
  confirmar,
  onConfirmar,
  dados,
}: {
  valor: string
  onChange: (v: string) => void
  confirmar: string
  onConfirmar: (v: string) => void
  dados: { nome?: string; documento?: string; email?: string }
}) {
  const [ver, setVer] = useState(false)
  const c = checarSenha(valor, dados)
  const cores = ['var(--rbr-danger)', '#D9A400', 'var(--rbr-positive)', 'var(--rbr-positive)']
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <input
          className={input + ' pr-16'}
          placeholder="Crie uma senha"
          type={ver ? 'text' : 'password'}
          autoComplete="new-password"
          value={valor}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          onClick={() => setVer((v) => !v)}
          className="absolute right-3 top-3 text-xs font-bold text-[color:var(--rbr-navy)]"
        >
          {ver ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>
      {valor && (
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-1.5 flex-1 rounded-full"
                style={{ background: c.ok && c.forca > i ? cores[c.forca] : 'var(--rbr-border)' }}
              />
            ))}
          </div>
          <div className="text-[11px] text-[color:var(--rbr-muted)]">
            {c.ok ? `Senha ${FORCA_LABEL[c.forca].toLowerCase()}` : c.problemas.join(' · ')}
          </div>
        </div>
      )}
      <input
        className={input}
        placeholder="Repita a senha"
        type={ver ? 'text' : 'password'}
        autoComplete="new-password"
        value={confirmar}
        onChange={(e) => onConfirmar(e.target.value)}
      />
      {confirmar && confirmar !== valor && <span className="text-[11px] text-[color:var(--rbr-danger)]">As senhas não são iguais.</span>}
    </div>
  )
}

function AvisoPrivacidade({ app }: { app: App }) {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setAberto((v) => !v)} className="underline font-semibold">
        Termos de uso e Política de privacidade
      </button>
      {aberto && (
        <span className="block mt-2 text-[11px] leading-relaxed text-[color:var(--rbr-muted)]">
          A RBR Cargo usa seus dados para: criar e manter sua conta; conferir seus documentos (a leitura das fotos é automática,
          por inteligência artificial, e pode ser revisada por uma pessoa da RBR); {app === 'motorista' ? 'oferecer cargas, emitir os documentos do transporte e pagar os fretes' : 'registrar suas cotações, cargas e comissões'};
          e cumprir obrigações fiscais e da ANTT. Dados ligados a transportes realizados são guardados pelo prazo da lei (até 11 anos).
          Você pode ver, baixar ou pedir a exclusão dos seus dados a qualquer momento em Perfil → Meus dados.
        </span>
      )}
    </>
  )
}

// ---------- Tela de entrada (login / cadastro / esqueci a senha) ----------
export function TelaEntrada({ app, auth }: { app: App; auth: AuthApi }) {
  const [modo, setModo] = useState<'login' | 'cadastro' | 'esqueci'>('login')
  const titulo = {
    motorista: { login: 'Acesse sua conta RBR Cargo', cad: 'Criar conta de motorista' },
    agenciador: { login: 'Acesse seu painel de parceiro RBR Cargo', cad: 'Criar conta de agenciador' },
    gestor: { login: 'Painel do gestor RBR Cargo', cad: '' },
  }[app]

  return (
    <div className="min-h-dvh flex flex-col justify-center px-6 py-10 bg-white">
      <div className="mx-auto w-full max-w-[400px]">
        <Marca />
        {modo === 'login' && (
          <Login auth={auth} subtitulo={titulo.login} onEsqueci={() => setModo('esqueci')} onCadastro={app === 'gestor' ? null : () => setModo('cadastro')} />
        )}
        {modo === 'cadastro' && app !== 'gestor' && <Cadastro app={app} auth={auth} titulo={titulo.cad} onVoltar={() => setModo('login')} />}
        {modo === 'esqueci' && <Esqueci onVoltar={() => setModo('login')} />}
      </div>
    </div>
  )
}

function Login({
  auth,
  subtitulo,
  onEsqueci,
  onCadastro,
}: {
  auth: AuthApi
  subtitulo: string
  onEsqueci: () => void
  onCadastro: (() => void) | null
}) {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setErro(null)
    const r = await auth.signInWithPassword(email.trim(), senha)
    if (r.error) setErro(traduzLogin(r.error.message))
    setEnviando(false)
  }

  return (
    <>
      <h1 className="rbr-display text-2xl font-bold text-[color:var(--rbr-navy-dark)] mb-1">Entrar</h1>
      <p className="text-sm text-[color:var(--rbr-muted)] mb-6">{subtitulo}</p>
      <form onSubmit={entrar} className="flex flex-col gap-3">
        <input className={input} placeholder="E-mail" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className={input} placeholder="Senha" type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
        {erro && <p className="text-xs text-[color:var(--rbr-danger)]">{erro}</p>}
        <button type="submit" disabled={enviando} className={botaoPrimario + ' mt-2'} style={{ background: 'var(--rbr-gold)' }}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
      <button className="mt-4 text-sm font-semibold text-[color:var(--rbr-navy)] w-full text-center" onClick={onEsqueci}>
        Esqueci minha senha
      </button>
      {onCadastro && (
        <button className="mt-3 text-sm text-[color:var(--rbr-muted)] w-full text-center" onClick={onCadastro}>
          Ainda não tem conta? <span className="font-semibold text-[color:var(--rbr-navy)]">Criar uma</span>
        </button>
      )}
    </>
  )
}

async function pedirLinkSenha(p: { documento?: string; email?: string }) {
  const { data, error } = await supabase.functions.invoke('conta-publica', {
    body: { acao: 'recuperar_senha', ...p, redirect_to: window.location.origin },
  })
  if (error) {
    // functions.invoke devolve o corpo do erro em error.context
    try {
      const corpo = await (error as unknown as { context: Response }).context.json()
      return { ok: false, mensagem: corpo?.mensagem as string | undefined }
    } catch {
      return { ok: false, mensagem: 'Não foi possível enviar agora. Tente de novo em instantes.' }
    }
  }
  return data as { ok: boolean; email_mascarado?: string | null; mensagem?: string }
}

function Esqueci({ onVoltar }: { onVoltar: () => void }) {
  const [valor, setValor] = useState('')
  const [msg, setMsg] = useState<{ tom: 'erro' | 'ok'; texto: string } | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    const ehEmail = valor.includes('@')
    const doc = normalizarDoc(valor)
    if (!ehEmail && !(cpfValido(doc) || cnpjValido(doc))) {
      setMsg({ tom: 'erro', texto: 'Digite um e-mail ou um CPF/CNPJ válido.' })
      return
    }
    setEnviando(true)
    const r = await pedirLinkSenha(ehEmail ? { email: valor.trim() } : { documento: doc })
    setEnviando(false)
    if (!r.ok) {
      setMsg({ tom: 'erro', texto: r.mensagem ?? 'Não foi possível enviar agora.' })
      return
    }
    setMsg({
      tom: 'ok',
      texto: r.email_mascarado
        ? `Se existir conta, enviamos o link para ${r.email_mascarado}. Abra o e-mail neste aparelho (veja também o spam). O link vale por pouco tempo.`
        : 'Se existir uma conta com esses dados, você vai receber o link no e-mail cadastrado. Veja também o spam.',
    })
  }

  return (
    <>
      <h1 className="rbr-display text-2xl font-bold text-[color:var(--rbr-navy-dark)] mb-1">Recuperar acesso</h1>
      <p className="text-sm text-[color:var(--rbr-muted)] mb-6">Informe seu CPF/CNPJ ou e-mail. Mandamos um link para criar uma nova senha no e-mail da conta.</p>
      <form onSubmit={enviar} className="flex flex-col gap-3">
        <input className={input} placeholder="CPF, CNPJ ou e-mail" value={valor} onChange={(e) => setValor(e.target.value)} required />
        {msg && <Caixa tom={msg.tom}>{msg.texto}</Caixa>}
        <button type="submit" disabled={enviando} className={botaoPrimario + ' mt-1'} style={{ background: 'var(--rbr-gold)' }}>
          {enviando ? 'Enviando…' : 'Enviar link'}
        </button>
      </form>
      <button className="mt-5 text-sm font-semibold text-[color:var(--rbr-navy)] w-full text-center" onClick={onVoltar}>
        Voltar para entrar
      </button>
    </>
  )
}

type Verif = { valido: boolean; existe?: boolean; encerrado?: boolean; email_mascarado?: string | null; pode_recuperar?: boolean }

async function verificarDocumento(doc: string): Promise<Verif | null> {
  const { data, error } = await supabase.functions.invoke('conta-publica', { body: { acao: 'verificar_documento', documento: doc } })
  if (error || !data?.ok) return null
  return data as Verif
}

function CamposPessoa({
  app,
  tipo,
  setTipo,
  doc,
  setDoc,
  nome,
  setNome,
  celular,
  setCelular,
  verif,
  onBlurDoc,
  bloquearTipoDoc,
}: {
  app: App
  tipo: 'PF' | 'PJ'
  setTipo: (t: 'PF' | 'PJ') => void
  doc: string
  setDoc: (v: string) => void
  nome: string
  setNome: (v: string) => void
  celular: string
  setCelular: (v: string) => void
  verif: Verif | null
  onBlurDoc: () => void
  bloquearTipoDoc?: boolean
}) {
  const opcoes =
    app === 'motorista'
      ? [
          { v: 'PF' as const, t: 'Motorista autônomo', s: 'CPF' },
          { v: 'PJ' as const, t: 'Empresa / frota', s: 'CNPJ' },
        ]
      : [
          { v: 'PF' as const, t: 'Pessoa física', s: 'CPF' },
          { v: 'PJ' as const, t: 'Empresa', s: 'CNPJ' },
        ]
  return (
    <>
      {!bloquearTipoDoc && (
        <div className="grid grid-cols-2 gap-2">
          {opcoes.map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => {
                setTipo(o.v)
                setDoc('')
              }}
              className="border rounded-xl px-3 py-2.5 text-left"
              style={{
                borderColor: tipo === o.v ? 'var(--rbr-navy)' : 'var(--rbr-border)',
                background: tipo === o.v ? 'var(--rbr-muted-bg)' : '#fff',
              }}
            >
              <div className="text-sm font-bold text-[color:var(--rbr-navy-dark)]">{o.t}</div>
              <div className="text-[11px] text-[color:var(--rbr-muted)]">{o.s}</div>
            </button>
          ))}
        </div>
      )}
      <input
        className={input}
        placeholder={tipo === 'PF' ? 'CPF' : 'CNPJ'}
        inputMode={tipo === 'PF' ? 'numeric' : 'text'}
        value={doc}
        onChange={(e) => setDoc(mascaraDocDigitando(e.target.value, tipo))}
        onBlur={onBlurDoc}
        required
      />
      {verif && !verif.valido && <span className="text-[11px] text-[color:var(--rbr-danger)] -mt-1.5">{tipo === 'PF' ? 'CPF' : 'CNPJ'} inválido.</span>}
      <input
        className={input}
        placeholder={tipo === 'PF' ? 'Nome completo (como na CNH)' : 'Razão social'}
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        required
      />
      <input className={input} placeholder="Celular com DDD (WhatsApp)" inputMode="tel" value={celular} onChange={(e) => setCelular(mascaraCelular(e.target.value))} required />
    </>
  )
}

function BlocoContaExistente({ verif, doc }: { verif: Verif; doc: string }) {
  const [msg, setMsg] = useState<{ tom: 'erro' | 'ok'; texto: string } | null>(null)
  const [enviando, setEnviando] = useState(false)
  if (verif.encerrado) {
    return <Caixa tom="erro">Este documento pertence a um cadastro encerrado. Fale com a RBR.</Caixa>
  }
  return (
    <Caixa tom="aviso">
      <div className="font-bold text-[13px] mb-1">Já existe uma conta com este documento</div>
      Por segurança, cada CPF/CNPJ só pode ter uma conta.{' '}
      {verif.pode_recuperar ? (
        <>
          Se a conta é sua, mandamos um link de nova senha para o e-mail dela{verif.email_mascarado ? ` (${verif.email_mascarado})` : ''}.
          <button
            type="button"
            disabled={enviando}
            onClick={async () => {
              setEnviando(true)
              const r = await pedirLinkSenha({ documento: doc })
              setEnviando(false)
              setMsg(r.ok ? { tom: 'ok', texto: `Link enviado${r.email_mascarado ? ` para ${r.email_mascarado}` : ''}. Veja também o spam.` } : { tom: 'erro', texto: r.mensagem ?? 'Não foi possível enviar.' })
            }}
            className="block mt-2 rounded-lg px-3 py-2 font-bold text-[12px] disabled:opacity-60"
            style={{ background: 'var(--rbr-gold)', color: 'var(--rbr-navy-dark)' }}
          >
            {enviando ? 'Enviando…' : 'Recuperar senha'}
          </button>
        </>
      ) : (
        <>O cadastro não tem e-mail. Fale com a RBR pelo WhatsApp para receber o acesso.</>
      )}
      {msg && <div className="mt-2">{msg.texto}</div>}
    </Caixa>
  )
}

function Cadastro({ app, auth, titulo, onVoltar }: { app: 'motorista' | 'agenciador'; auth: AuthApi; titulo: string; onVoltar: () => void }) {
  const [tipo, setTipo] = useState<'PF' | 'PJ'>('PF')
  const [doc, setDoc] = useState('')
  const [nome, setNome] = useState('')
  const [celular, setCelular] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [senha2, setSenha2] = useState('')
  const [aceite, setAceite] = useState(false)
  const [verif, setVerif] = useState<Verif | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [confirmarEmail, setConfirmarEmail] = useState(false)

  const docNorm = normalizarDoc(doc)
  const docOk = tipo === 'PF' ? cpfValido(docNorm) : cnpjValido(docNorm)

  async function checarDoc() {
    if (!docNorm) return setVerif(null)
    if (!docOk) return setVerif({ valido: false })
    setVerif(await verificarDocumento(docNorm))
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!docOk) return setErro(`${tipo === 'PF' ? 'CPF' : 'CNPJ'} inválido.`)
    if (nome.trim().length < 3) return setErro('Informe o nome completo.')
    if (soDigitos(celular).length < 10) return setErro('Informe o celular com DDD.')
    const s = checarSenha(senha, { nome, documento: docNorm, email })
    if (!s.ok) return setErro('A senha precisa de: ' + s.problemas.join(', ').toLowerCase() + '.')
    if (senha !== senha2) return setErro('As senhas não são iguais.')
    if (!aceite) return setErro('É preciso aceitar os termos e a política de privacidade.')
    setEnviando(true)
    const v = await verificarDocumento(docNorm)
    setVerif(v)
    if (!v) {
      setEnviando(false)
      return setErro('Não foi possível conferir o documento agora. Aguarde um instante e tente de novo.')
    }
    if (v.existe) {
      setEnviando(false)
      return
    }
    const r = await auth.cadastrar(email.trim().toLowerCase(), senha, {
      papel: app === 'motorista' ? 'titular_motorista' : 'agenciador',
      tipo_pessoa_doc: tipo,
      documento: docNorm,
      nome: nome.trim(),
      celular: soDigitos(celular),
      aceite_termos: true,
      versao_termos: VERSAO_TERMOS[app],
    })
    setEnviando(false)
    if (r.error) setErro(r.error)
    else if (r.confirmarEmail) setConfirmarEmail(true)
  }

  if (confirmarEmail) {
    return (
      <>
        <h1 className="rbr-display text-2xl font-bold text-[color:var(--rbr-navy-dark)] mb-3">Confirme seu e-mail</h1>
        <Caixa tom="ok">
          Enviamos um link de confirmação para <b>{email}</b>. Abra o e-mail, confirme e depois entre com sua senha — o cadastro termina
          automaticamente.
        </Caixa>
        <button className="mt-5 text-sm font-semibold text-[color:var(--rbr-navy)] w-full text-center" onClick={onVoltar}>
          Ir para entrar
        </button>
      </>
    )
  }

  const bloqueado = !!verif?.existe
  return (
    <>
      <h1 className="rbr-display text-2xl font-bold text-[color:var(--rbr-navy-dark)] mb-1">{titulo}</h1>
      <p className="text-sm text-[color:var(--rbr-muted)] mb-6">
        Leva 1 minuto. Depois você envia as fotos dos documentos e a liberação sai automaticamente quando está tudo certo.
      </p>
      <form onSubmit={enviar} className="flex flex-col gap-3">
        <CamposPessoa
          app={app}
          tipo={tipo}
          setTipo={(t) => {
            setTipo(t)
            setVerif(null)
          }}
          doc={doc}
          setDoc={(v) => {
            setDoc(v)
            if (verif) setVerif(null)
          }}
          nome={nome}
          setNome={setNome}
          celular={celular}
          setCelular={setCelular}
          verif={verif}
          onBlurDoc={checarDoc}
        />
        {bloqueado && verif && <BlocoContaExistente verif={verif} doc={docNorm} />}
        {!bloqueado && (
          <>
            <input className={input} placeholder="E-mail" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <CampoSenha valor={senha} onChange={setSenha} confirmar={senha2} onConfirmar={setSenha2} dados={{ nome, documento: docNorm, email }} />
            <label className="flex items-start gap-2.5 text-xs text-[color:var(--rbr-muted)] leading-relaxed">
              <input type="checkbox" className="mt-0.5" checked={aceite} onChange={(e) => setAceite(e.target.checked)} />
              <span>
                Li e aceito os <AvisoPrivacidade app={app} />.
              </span>
            </label>
            {erro && <Caixa tom="erro">{erro}</Caixa>}
            <button type="submit" disabled={enviando} className={botaoPrimario + ' mt-1'} style={{ background: 'var(--rbr-gold)' }}>
              {enviando ? 'Criando conta…' : 'Criar conta'}
            </button>
          </>
        )}
      </form>
      <button className="mt-5 text-sm font-semibold text-[color:var(--rbr-navy)] w-full text-center" onClick={onVoltar}>
        Já tem conta? Entrar
      </button>
    </>
  )
}

// ---------- Logado, mas ainda sem cadastro (ex.: confirmou o e-mail agora) ----------
export function TelaConcluirCadastro({ app, auth, email }: { app: 'motorista' | 'agenciador'; auth: AuthApi; email: string | null }) {
  const pend = lerCadastroPendente()
  const [tipo, setTipo] = useState<'PF' | 'PJ'>(pend?.tipo_pessoa_doc ?? 'PF')
  const [doc, setDoc] = useState(pend ? mascaraDocDigitando(pend.documento, pend.tipo_pessoa_doc) : '')
  const [nome, setNome] = useState(pend?.nome ?? '')
  const [celular, setCelular] = useState(pend ? mascaraCelular(pend.celular) : '')
  const [aceite, setAceite] = useState(pend?.aceite_termos ?? false)
  const [verif, setVerif] = useState<Verif | null>(null)
  const [erro, setErro] = useState<string | null>(auth.erroCadastro ?? null)
  const [enviando, setEnviando] = useState(false)
  const docNorm = normalizarDoc(doc)
  const docOk = tipo === 'PF' ? cpfValido(docNorm) : cnpjValido(docNorm)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!docOk) return setErro(`${tipo === 'PF' ? 'CPF' : 'CNPJ'} inválido.`)
    if (!aceite) return setErro('É preciso aceitar os termos e a política de privacidade.')
    setEnviando(true)
    const r = await auth.registrar({
      papel: app === 'motorista' ? 'titular_motorista' : 'agenciador',
      tipo_pessoa_doc: tipo,
      documento: docNorm,
      nome: nome.trim(),
      celular: soDigitos(celular),
      aceite_termos: true,
      versao_termos: VERSAO_TERMOS[app],
    })
    setEnviando(false)
    if (r.error) setErro(r.error)
  }

  return (
    <div className="min-h-dvh flex flex-col justify-center px-6 py-10 bg-white">
      <div className="mx-auto w-full max-w-[400px]">
        <Marca />
        <h1 className="rbr-display text-2xl font-bold text-[color:var(--rbr-navy-dark)] mb-1">Concluir cadastro</h1>
        <p className="text-sm text-[color:var(--rbr-muted)] mb-6">Conta {email ?? ''}. Falta só confirmar seus dados.</p>
        <form onSubmit={enviar} className="flex flex-col gap-3">
          <CamposPessoa
            app={app}
            tipo={tipo}
            setTipo={setTipo}
            doc={doc}
            setDoc={(v) => {
              setDoc(v)
              setVerif(null)
            }}
            nome={nome}
            setNome={setNome}
            celular={celular}
            setCelular={setCelular}
            verif={verif}
            onBlurDoc={async () => {
              if (!docNorm) return
              if (!docOk) return setVerif({ valido: false })
              setVerif(await verificarDocumento(docNorm))
            }}
          />
          {verif?.existe && <BlocoContaExistente verif={verif} doc={docNorm} />}
          <label className="flex items-start gap-2.5 text-xs text-[color:var(--rbr-muted)] leading-relaxed">
            <input type="checkbox" className="mt-0.5" checked={aceite} onChange={(e) => setAceite(e.target.checked)} />
            <span>
              Li e aceito os <AvisoPrivacidade app={app} />.
            </span>
          </label>
          {erro && <Caixa tom="erro">{erro}</Caixa>}
          <button type="submit" disabled={enviando || !!verif?.existe} className={botaoPrimario} style={{ background: 'var(--rbr-gold)' }}>
            {enviando ? 'Salvando…' : 'Concluir'}
          </button>
        </form>
        <button className="mt-5 text-sm font-semibold text-[color:var(--rbr-navy)] w-full text-center" onClick={() => auth.signOut()}>
          Sair
        </button>
      </div>
    </div>
  )
}

// ---------- Link de nova senha aberto ----------
export function TelaNovaSenha({ auth, dados }: { auth: AuthApi; dados: { nome?: string; documento?: string; email?: string } }) {
  const [senha, setSenha] = useState('')
  const [senha2, setSenha2] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    const c = checarSenha(senha, dados)
    if (!c.ok) return setErro('A senha precisa de: ' + c.problemas.join(', ').toLowerCase() + '.')
    if (senha !== senha2) return setErro('As senhas não são iguais.')
    setEnviando(true)
    const r = await auth.definirNovaSenha(senha)
    setEnviando(false)
    if (r.error) setErro(r.error)
  }

  return (
    <div className="min-h-dvh flex flex-col justify-center px-6 py-10 bg-white">
      <div className="mx-auto w-full max-w-[400px]">
        <Marca />
        <h1 className="rbr-display text-2xl font-bold text-[color:var(--rbr-navy-dark)] mb-1">Crie sua nova senha</h1>
        <p className="text-sm text-[color:var(--rbr-muted)] mb-6">Ao salvar, os outros aparelhos conectados nesta conta serão desconectados.</p>
        <form onSubmit={salvar} className="flex flex-col gap-3">
          <CampoSenha valor={senha} onChange={setSenha} confirmar={senha2} onConfirmar={setSenha2} dados={dados} />
          {erro && <Caixa tom="erro">{erro}</Caixa>}
          <button type="submit" disabled={enviando} className={botaoPrimario + ' mt-1'} style={{ background: 'var(--rbr-gold)' }}>
            {enviando ? 'Salvando…' : 'Salvar nova senha'}
          </button>
        </form>
      </div>
    </div>
  )
}
