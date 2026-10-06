import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@rbr/shared/supabaseClient'
import { soDigitos } from '@rbr/shared/consultaCadastro'

// Consulta de protesto (IEPTB Online, via Direct Data): tipos, leitura e regras de prazo.
// Usado pelo card "Risco comercial", pelos selos da lista de clientes e pelo relatório em PDF.
// A tabela consultas_externas e o parâmetro 'consulta_protesto' ainda não estão em
// shared/database.types.ts: cliente sem tipos e tipos locais mínimos.
const db = supabase as unknown as SupabaseClient

// Formato do jsonb `resultado` gravado pela função consultar-protesto (Direct Data).
export type TituloProtesto = { dataProtesto?: string | null; valorProtestado?: string | number | null; documento?: string | null }
export type CartorioProtesto = {
  codigoCidade?: string | number | null
  cidade?: string | null
  numeroProtestos?: number | string | null
  valorTotalProtestosCartorio?: string | number | null
  titulos?: TituloProtesto[] | null
}
export type EstadoProtesto = {
  estado?: string | null
  numeroTotalProtestosUF?: number | string | null
  valorTotalProtestosEstado?: string | number | null
  cartorios?: CartorioProtesto[] | null
}
export type ResultadoProtesto = {
  documentoConsultado?: string | null
  constamProtestos?: boolean | null
  numeroTotalProtestos?: number | string | null
  valorTotalProtestos?: string | number | null
  observacoes?: string | null
  protestos?: EstadoProtesto[] | null
}

export type ConsultaProtesto = {
  cnpj: string
  created_at: string
  tem_protesto: boolean | null
  resultado: ResultadoProtesto | null
  consultado_por: string | null
}

// Tudo vem do parâmetro 'consulta_protesto' (validade e custo nunca ficam fixos no código).
export type RegraProtesto = { validade_dias: number; custo_centavos: number; fonte: string }

export type SituacaoProtesto = 'sem' | 'com' | 'indefinido'
export type EstadoConsulta = { situacao: SituacaoProtesto; vencida: boolean; valeAte: Date; idadeDias: number }

export const FONTE_PROTESTO = 'ieptb_online'
export const FONTE_DESCRICAO = 'IEPTB - Instituto de Estudos de Protesto de Títulos do Brasil, consulta nacional online, via Direct Data'
const DIA_MS = 86400000
const COLUNAS = 'cnpj, created_at, tem_protesto, resultado, consultado_por'

const numeroValido = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}

export async function lerRegraProtesto(): Promise<RegraProtesto | null> {
  const { data } = await db.from('parametros_sistema').select('valor').eq('chave', 'consulta_protesto').maybeSingle()
  const v = (data?.valor ?? null) as Partial<RegraProtesto> | null
  const validade = numeroValido(v?.validade_dias)
  const custo = numeroValido(v?.custo_centavos)
  if (validade == null || custo == null) return null
  return { validade_dias: validade, custo_centavos: custo, fonte: v?.fonte || FONTE_PROTESTO }
}

// Os CNPJs do cadastro podem estar com pontuação e os da consulta, só com dígitos: busca pelos dois.
function formasDoCnpj(cnpj: string): string[] {
  const d = soDigitos(cnpj)
  if (d.length !== 14) return []
  return [d, `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`]
}

export async function lerUltimaConsulta(cnpj: string): Promise<ConsultaProtesto | null> {
  const formas = formasDoCnpj(cnpj)
  if (!formas.length) return null
  const { data } = await db
    .from('consultas_externas')
    .select(COLUNAS)
    .in('cnpj', formas)
    .eq('fonte', FONTE_PROTESTO)
    .order('created_at', { ascending: false })
    .limit(1)
  return ((data ?? [])[0] as ConsultaProtesto | undefined) ?? null
}

// Uma consulta só para a lista inteira: devolve a mais recente de cada CNPJ (chave = 14 dígitos).
export async function lerUltimasConsultas(cnpjs: string[]): Promise<Record<string, ConsultaProtesto>> {
  const formas = [...new Set(cnpjs.flatMap(formasDoCnpj))]
  if (!formas.length) return {}
  const { data } = await db
    .from('consultas_externas')
    .select('cnpj, created_at, tem_protesto, resultado->constamProtestos, consultado_por')
    .in('cnpj', formas)
    .eq('fonte', FONTE_PROTESTO)
    .order('created_at', { ascending: false })
  const mapa: Record<string, ConsultaProtesto> = {}
  for (const l of (data ?? []) as (Omit<ConsultaProtesto, 'resultado'> & { constamProtestos?: boolean | null })[]) {
    const chave = soDigitos(l.cnpj)
    if (mapa[chave]) continue
    mapa[chave] = { ...l, resultado: l.constamProtestos == null ? null : { constamProtestos: l.constamProtestos } }
  }
  return mapa
}

export function estadoDaConsulta(c: ConsultaProtesto, regra: RegraProtesto, agora = Date.now()): EstadoConsulta {
  const feita = new Date(c.created_at).getTime()
  const consta = c.resultado?.constamProtestos ?? c.tem_protesto
  return {
    situacao: consta === true ? 'com' : consta === false ? 'sem' : 'indefinido',
    valeAte: new Date(feita + regra.validade_dias * DIA_MS),
    vencida: agora > feita + regra.validade_dias * DIA_MS,
    idadeDias: Math.max(0, Math.floor((agora - feita) / DIA_MS)),
  }
}

// ---- formatação (nunca devolve "undefined"/"null": quem chama omite a linha se vier null) ----

export function textoValor(v: string | number | null | undefined): string | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const s = String(v).trim()
  // Espaço que não quebra entre "R$" e o número.
  if (/^R\$/.test(s)) return s.replace(/^R\$\s*/, 'R$\u00a0')
  // "1234.56" ou "1.234,56"
  const n = /,\d{1,2}$/.test(s) ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s)
  return Number.isFinite(n) ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : s
}

export function textoQuantidade(v: number | string | null | undefined): string | null {
  const n = numeroValido(v)
  return n == null ? null : String(n)
}

// Datas de protesto podem vir "2024-05-10", "2024-05-10T00:00:00" ou "10/05/2024".
export function textoDataProtesto(v: string | null | undefined): string | null {
  if (!v) return null
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(v)
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`
  return v
}

export const dataHoraBr = (d: Date | string) =>
  new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
export const dataBr = (d: Date | string) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' })
export const dataCurtaBr = (d: Date | string) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })
export const dataArquivo = (d: Date | string) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
export const reaisDeCentavos = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
