// Escolha dos segredos do Repom Frete por ambiente (sem Deno, sem rede; testes em repomFreteConfig.test.ts).
// qa  (padrão, inclusive quando REPOM_AMBIENTE falta): usa SOMENTE REPOM_QA_FRETE_*; NUNCA lê REPOM_FRETE_* (produção).
// prd: usa SOMENTE REPOM_FRETE_*.
import { ambienteRepom } from './repomClient.ts'
import { lerFormatoToken, type ConfigRepomFrete } from './repomFreteClient.ts'

export type LerSegredo = (nome: string) => Promise<string | null>

export const NOMES_SEGREDO_FRETE = {
  qa: { user: 'REPOM_QA_FRETE_USER', password: 'REPOM_QA_FRETE_PASSWORD', partner: 'REPOM_QA_FRETE_PARTNER', urlToken: 'REPOM_QA_FRETE_URL_TOKEN', urlBase: 'REPOM_QA_FRETE_URL_BASE', version: 'REPOM_QA_FRETE_VERSION', formato: 'REPOM_QA_FRETE_TOKEN_FORMATO' },
  prd: { user: 'REPOM_FRETE_USER', password: 'REPOM_FRETE_PASSWORD', partner: 'REPOM_FRETE_PARTNER', urlToken: 'REPOM_FRETE_URL_TOKEN', urlBase: 'REPOM_FRETE_URL_BASE', version: 'REPOM_FRETE_VERSION', formato: 'REPOM_FRETE_TOKEN_FORMATO' },
} as const

/** Monta a config do Frete para o ambiente pedido. `ambienteBruto` é o valor de REPOM_AMBIENTE (qualquer coisa diferente de "prd" vira qa). */
export async function configFreteDoAmbiente(ambienteBruto: string | null | undefined, ler: LerSegredo): Promise<ConfigRepomFrete> {
  const ambiente = ambienteRepom(ambienteBruto)
  const n = NOMES_SEGREDO_FRETE[ambiente]
  const [user, password, partner, urlToken, urlBase, version, formato] = await Promise.all([n.user, n.password, n.partner, n.urlToken, n.urlBase, n.version, n.formato].map((x) => ler(x)))
  return {
    ambiente,
    credenciais: { user: user ?? '', version: version ?? '', password: password ?? '', partner: partner ?? '' },
    urlToken: urlToken ?? undefined,
    urlBase: urlBase ?? undefined,
    tokenFormato: lerFormatoToken(formato),
  }
}
