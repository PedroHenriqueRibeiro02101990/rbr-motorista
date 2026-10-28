// O Supabase devolve um objeto simples ({ message, code, details }), não um Error:
// `e instanceof Error` dava falso e a tela mostrava só a mensagem genérica.
type ErroBanco = { message?: unknown; code?: unknown; details?: unknown } | null | undefined

const POR_RESTRICAO: Array<[RegExp, string]> = [
  [/pessoas_cpf|cpf/i, 'Já existe um cadastro com esse CPF.'],
  [/celular/i, 'Esse celular já está em outro cadastro.'],
  [/email/i, 'Esse e-mail já está em outro cadastro.'],
]

export function mensagemErroSalvar(e: unknown, padrao: string): string {
  const err = (e ?? null) as ErroBanco
  const msg = err && typeof err.message === 'string' ? err.message.trim() : ''
  const code = err && typeof err.code === 'string' ? err.code : ''
  const detalhe = err && typeof err.details === 'string' ? err.details : ''
  const texto = `${msg} ${detalhe}`
  if (code === '23505') {
    const achada = POR_RESTRICAO.find(([re]) => re.test(texto))
    return achada ? achada[1] : `Cadastro duplicado: ${msg || 'já existe um registro igual.'}`
  }
  if (code === '23502') {
    const campo = /column "([^"]+)"/.exec(msg)?.[1]
    return campo ? `Falta preencher o campo obrigatório "${campo}".` : `Falta preencher um campo obrigatório: ${msg}`
  }
  if (code === '23514') return `Um valor não é aceito pela regra do cadastro: ${msg || detalhe || 'confira os campos.'}`
  if (code === '42501' || /row-level security/i.test(msg)) return 'Sem permissão para salvar este cadastro. Entre de novo ou fale com o suporte.'
  if (/Could not find the .* column/i.test(msg)) return `O sistema ainda não tem um campo novo no banco (${msg}). Avise o suporte.`
  return msg || padrao
}
