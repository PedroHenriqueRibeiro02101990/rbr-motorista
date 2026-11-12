// Utilidades HTTP das edge functions Repom, sem Deno (testes em repomHttp.test.ts).
// CORS restrito ao domínio do app: nunca "*". Origens permitidas: produção, os previews do time na Vercel e o que vier em REPOM_CORS_ORIGENS
// (lista separada por vírgula; variável de ambiente da função, não é segredo).

const ORIGENS_FIXAS = ['https://rbr-motorista.vercel.app']
const PADRAO_PREVIEW = /^https:\/\/rbr-[a-z0-9-]+-rbr4\.vercel\.app$/

export function origemPermitida(origem: string | null | undefined, extras: string | null | undefined): boolean {
  const o = String(origem ?? '').trim()
  if (!o) return false
  if (ORIGENS_FIXAS.includes(o) || PADRAO_PREVIEW.test(o)) return true
  return String(extras ?? '').split(',').map((x) => x.trim()).filter(Boolean).includes(o)
}

/** Cabeçalhos CORS para a origem da requisição. Origem não permitida não recebe Allow-Origin (o navegador bloqueia). */
export function corsPara(origem: string | null | undefined, extras: string | null | undefined): Record<string, string> {
  const base: Record<string, string> = { 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' }
  return origemPermitida(origem, extras) ? { ...base, 'Access-Control-Allow-Origin': String(origem).trim() } : base
}
