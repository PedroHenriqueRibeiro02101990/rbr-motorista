// Regras de senha (LGPD art. 46 + guia de segurança da ANPD: senha forte, sem dados óbvios).
// O mesmo mínimo deve estar configurado no painel do Supabase (Authentication → Senhas).

const COMUNS = new Set([
  '12345678', '123456789', '1234567890', '87654321', '11111111', '00000000', '12341234', 'abcd1234', 'a1b2c3d4',
  'password', 'password1', 'senha123', 'senha1234', 'mudar123', 'qwerty123', 'qwertyui', 'asdf1234', 'iloveyou',
  'brasil123', 'brasil2026', 'caminhao1', 'motorista1', 'rbrcargo1', 'rbr12345', 'admin123', 'teste123', 'mudar@123',
])

export type ChecagemSenha = { ok: boolean; problemas: string[]; forca: 0 | 1 | 2 | 3 }

export function checarSenha(senha: string, dados: { nome?: string; documento?: string; email?: string } = {}): ChecagemSenha {
  const problemas: string[] = []
  const s = senha ?? ''
  const baixa = s.toLowerCase()
  if (s.length < 8) problemas.push('Mínimo de 8 caracteres')
  if (!/[a-zA-Z]/.test(s)) problemas.push('Pelo menos uma letra')
  if (!/\d/.test(s)) problemas.push('Pelo menos um número')
  if (COMUNS.has(baixa)) problemas.push('Senha muito comum')
  if (/(.)\1{3,}/.test(s)) problemas.push('Sem repetir o mesmo caractere 4 vezes')
  if (/(0123|1234|2345|3456|4567|5678|6789|abcd|bcde|qwer|asdf)/.test(baixa)) problemas.push('Sem sequências (1234, abcd, qwer)')
  const doc = (dados.documento ?? '').replace(/\D/g, '')
  if (doc.length >= 6 && s.replace(/\D/g, '').includes(doc.slice(0, 6))) problemas.push('Não use o CPF/CNPJ')
  const primeiroNome = (dados.nome ?? '').trim().split(/\s+/)[0]?.toLowerCase() ?? ''
  if (primeiroNome.length >= 3 && baixa.includes(primeiroNome)) problemas.push('Não use o seu nome')
  const usuarioEmail = (dados.email ?? '').split('@')[0]?.toLowerCase() ?? ''
  if (usuarioEmail.length >= 4 && baixa.includes(usuarioEmail)) problemas.push('Não use o seu e-mail')

  let forca: 0 | 1 | 2 | 3 = 0
  if (problemas.length === 0) {
    const variedade = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z0-9]/].filter((r) => r.test(s)).length
    forca = s.length >= 12 && variedade >= 3 ? 3 : s.length >= 10 || variedade >= 3 ? 2 : 1
  }
  return { ok: problemas.length === 0, problemas, forca }
}

export const FORCA_LABEL = ['Fraca', 'Aceitável', 'Boa', 'Forte'] as const
