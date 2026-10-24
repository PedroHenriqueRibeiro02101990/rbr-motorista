// Trava da emissão de CIOT pela efrete a partir da operação.
//
// Enquanto a conta de produção da efrete (NSTech) não existir, EFRETE_BASE_URL aponta para a homologação.
// Nessa situação só operação marcada como TESTE (operacoes.eh_teste = true) pode gerar CIOT; uma operação real
// recebe a recusa antes de qualquer chamada à efrete. Produção (URL que não é a homologação) não é afetada por esta trava.
// Sem dependências do Deno (testes em travaEfreteOperacao.test.ts).

export const MENSAGEM_HOMOLOGACAO_OPERACAO_REAL = "Emissão de CIOT pela efrete está em homologação. Use o CIOT manual nesta operação."

export type ResultadoTrava = { ok: true } | { ok: false; motivo: string }

export function travaEfreteOperacao(p: { baseUrl: string; operacaoEhTeste: boolean | null }): ResultadoTrava {
  const homologacao = p.baseUrl.includes("dev.efrete")
  if (!homologacao) return { ok: true }
  if (p.operacaoEhTeste === true) return { ok: true }
  return { ok: false, motivo: MENSAGEM_HOMOLOGACAO_OPERACAO_REAL }
}
