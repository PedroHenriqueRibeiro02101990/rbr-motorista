// Regras puras da receber-lead (testes: regras.test.ts — rodar `node --test supabase/functions/receber-lead/regras.test.ts`).

export const PADRAO_PRIMEIRA_ACAO_MIN = 15 // padrão a revisar (Pedro): 1ª ação em até 15 min em horário comercial
const INICIO_H = 8
const FIM_H = 18
const FUSO_H = -3 // Brasília (sem horário de verão desde 2019)

// Prazo da primeira ação: +15 min se agora é dia útil entre 8h e 18h (Brasília); senão 8h15 do próximo dia útil.
// Feriados não são considerados nesta etapa.
export function prazoPrimeiraAcao(agora: Date, minutos = PADRAO_PRIMEIRA_ACAO_MIN): Date {
  const local = new Date(agora.getTime() + FUSO_H * 3600_000) // "relógio" de Brasília em campos UTC
  const util = (d: Date) => d.getUTCDay() !== 0 && d.getUTCDay() !== 6
  const h = local.getUTCHours() + local.getUTCMinutes() / 60
  if (util(local) && h >= INICIO_H && h < FIM_H) return new Date(agora.getTime() + minutos * 60_000)
  const prox = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), INICIO_H, minutos))
  if (h >= INICIO_H || !util(local)) prox.setUTCDate(prox.getUTCDate() + 1)
  while (!util(prox)) prox.setUTCDate(prox.getUTCDate() + 1)
  return new Date(prox.getTime() - FUSO_H * 3600_000)
}

const txt = (v: unknown, max = 300) => {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim()
  return s ? s.slice(0, max) : null
}
const uf = (v: unknown) => {
  const s = String(v ?? '').trim().toUpperCase()
  return /^[A-Z]{2}$/.test(s) ? s : null
}
// "Campinas/SP", "Campinas - SP", "Campinas, SP" → cidade e UF
export function cidadeUf(v: unknown): { cidade: string | null; uf: string | null } {
  const s = txt(v, 120)
  if (!s) return { cidade: null, uf: null }
  const m = /^(.*?)[\s]*[/,-][\s]*([A-Za-z]{2})$/.exec(s)
  return m ? { cidade: m[1].trim() || null, uf: m[2].toUpperCase() } : { cidade: s, uf: null }
}

export type LeadNovo = {
  nome: string
  empresa: string | null
  cnpj: string | null
  tipo_pessoa: 'PJ' | 'PF' | null
  whatsapp: string | null
  email: string | null
  origem_cidade: string | null
  origem_uf: string | null
  destino_cidade: string | null
  destino_uf: string | null
  veiculo: string | null
  mensagem: string | null
  origem: 'site'
  gclid: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_term: string | null
  utm_content: string | null
  pagina: string | null
}

// Valida e normaliza o corpo do formulário. Aceita os nomes de campo da LP atual ("Nome", "WhatsApp", "Origem"…)
// e os nomes em minúsculas. Devolve { robo: true } quando o campo-isca (_honey / website) vem preenchido.
export function normalizarLead(corpo: Record<string, unknown>): { erro: string } | { robo: true } | { lead: LeadNovo } {
  const c: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(corpo ?? {})) c[k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_]/g, '_')] = v
  if (txt(c._honey) || txt(c.website)) return { robo: true }
  const nome = txt(c.nome, 120)
  const whatsapp = txt(c.whatsapp ?? c.telefone ?? c.celular, 30)
  const email = txt(c.e_mail ?? c.email, 160)
  if (!nome) return { erro: 'Informe o nome.' }
  if (!whatsapp && !email) return { erro: 'Informe o WhatsApp ou o e-mail.' }
  if (whatsapp && (whatsapp.replace(/\D/g, '').length < 10 || whatsapp.replace(/\D/g, '').length > 13)) return { erro: 'WhatsApp inválido.' }
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { erro: 'E-mail inválido.' }
  const o = c.origem_uf ? { cidade: txt(c.origem_cidade ?? c.origem, 120), uf: uf(c.origem_uf) } : cidadeUf(c.origem)
  const d = c.destino_uf ? { cidade: txt(c.destino_cidade ?? c.destino, 120), uf: uf(c.destino_uf) } : cidadeUf(c.destino)
  const tipoBruto = String(c.tipo_pessoa ?? c.tipo_de_cliente ?? '').toUpperCase()
  const tipo_pessoa = /PJ|EMPRESA/.test(tipoBruto) ? 'PJ' : /PF|FISICA/.test(tipoBruto.normalize('NFD').replace(/[\u0300-\u036f]/g, '')) ? 'PF' : null
  const cnpj = txt(c.cnpj, 20)?.replace(/[^0-9A-Za-z]/g, '') || null
  return {
    lead: {
      nome,
      empresa: txt(c.empresa ?? c.razao_social, 160),
      cnpj,
      tipo_pessoa: tipo_pessoa ?? (cnpj ? 'PJ' : null),
      whatsapp,
      email,
      origem_cidade: o.cidade,
      origem_uf: o.uf,
      destino_cidade: d.cidade,
      destino_uf: d.uf,
      veiculo: txt(c.veiculo ?? c.veiculo_desejado, 60),
      mensagem: txt(c.mensagem ?? c.observacoes, 1000),
      origem: 'site',
      gclid: txt(c.gclid, 200),
      utm_source: txt(c.utm_source, 120),
      utm_medium: txt(c.utm_medium, 120),
      utm_campaign: txt(c.utm_campaign, 200),
      utm_term: txt(c.utm_term, 200),
      utm_content: txt(c.utm_content, 200),
      pagina: txt(c.pagina ?? c.page, 300),
    },
  }
}
