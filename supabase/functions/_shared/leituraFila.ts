// Fila de leitura pela IA gratuita (FreeLLM no PC, via Agente RBR) - 25/11/2026. Parte PURA (sem rede/banco), testavel.
// Teste: node --test supabase/functions/_shared/leituraFila.test.ts
import { CAMPOS_POR_TIPO, TIPOS_DOCUMENTO, type Confianca, type Normalizado, type TipoDocumento } from "./extracao-documentos.ts";
import type { Bruto } from "./leitura-texto.ts";

export const MSG_FOTO_SEM_LEITURA = "Foto nao pode ser lida agora; envie o PDF original (CNH digital, CRLV-e) ou preencha manualmente.";
export const MSG_PARCIAL_SEM_IA = "Li parte do documento pelo texto; a leitura automatica esta ocupada. Preencha os campos que faltam ou tente de novo.";
export const AVISO_IA_GRATIS = "Lido por IA gratuita - confira todos os campos com o documento.";
export const MAX_TENTATIVAS_FILA = 3;
/** Passou disso em 'lendo' sem resposta, a linha volta para a fila (agente caiu no meio). */
export const LENDO_EXPIRA_S = 120;
export const MAX_TEXTO_FILA = 12000;

export const ehTipoLeitura = (t: unknown): t is Exclude<TipoDocumento, "outro"> =>
  typeof t === "string" && t !== "outro" && (TIPOS_DOCUMENTO as readonly string[]).includes(t);

const CONF_IA: Confianca = "media"; // leitura de IA gratuita nunca e "alta": sempre pede conferencia

/**
 * O que o modelo devolve vem em dois jeitos: {campo: {valor, confianca, trecho}} (schema seguido) ou {campo: valor} (modelo simples).
 * Converte para o formato cru que normalizarExtracao espera. So aceita campos do tipo; confianca limitada a "media".
 */
export function paraBruto(tipo: Exclude<TipoDocumento, "outro">, obj: unknown): Bruto {
  const src = (obj && typeof obj === "object" ? obj : {}) as Record<string, unknown>;
  const out: Bruto = {};
  for (const k of Object.keys(CAMPOS_POR_TIPO[tipo])) {
    const c = src[k];
    let valor: unknown = c, trecho: string | null = null, motivo: string | null = null, conf: Confianca = CONF_IA;
    if (c && typeof c === "object" && !Array.isArray(c)) {
      const o = c as Record<string, unknown>;
      valor = o.valor; trecho = typeof o.trecho === "string" ? o.trecho.slice(0, 80) : null;
      motivo = typeof o.motivo_nulo === "string" ? o.motivo_nulo : null;
      if (o.confianca === "baixa") conf = "baixa";
    }
    const nuloOuVazio = valor === undefined || valor === null || valor === "" || valor === "*.*" || typeof valor === "object" || typeof valor === "boolean";
    out[k] = nuloOuVazio
      ? { valor: null, confianca: "baixa", trecho: null, motivo_nulo: motivo ?? "a IA nao encontrou este campo" }
      : { valor: typeof valor === "number" ? valor : String(valor).trim(), confianca: conf, trecho, motivo_nulo: null };
  }
  out.legivel = typeof src.legivel === "boolean" ? src.legivel : null;
  out.suspeita_fraude = typeof src.suspeita_fraude === "boolean" ? src.suspeita_fraude : null;
  return out;
}

const vazio = (c: unknown) => !c || typeof c !== "object" || (c as { valor?: unknown }).valor === null || (c as { valor?: unknown }).valor === undefined || (c as { valor?: unknown }).valor === "";

/** Junta o que o parser de texto leu (prioridade, pois e exato) com o que a IA completou nos campos que ficaram vazios. */
export function mesclarBrutos(tipo: Exclude<TipoDocumento, "outro">, texto: Bruto | null, ia: Bruto | null): Bruto {
  const out: Bruto = {};
  for (const k of Object.keys(CAMPOS_POR_TIPO[tipo])) {
    const t = texto?.[k], i = ia?.[k];
    out[k] = !vazio(t) ? (t as never) : (!vazio(i) ? (i as never) : ((t ?? i ?? { valor: null, confianca: "baixa", trecho: null, motivo_nulo: "nao encontrado" }) as never));
  }
  out.legivel = (ia?.legivel ?? texto?.legivel ?? null) as never;
  out.suspeita_fraude = (ia?.suspeita_fraude ?? texto?.suspeita_fraude ?? null) as never;
  return out;
}

/** Marca o resultado como vindo de IA gratuita (sempre conferencia humana). */
export function marcarIaGratis(n: Normalizado): Normalizado {
  if (!n.avisos.includes(AVISO_IA_GRATIS)) n.avisos.unshift(AVISO_IA_GRATIS);
  return n;
}

/** Lista de campos que ficaram vazios no normalizado (para o front destacar o que falta). */
export function faltantesDoNormalizado(n: Normalizado | null, obrigatorios: string[]): string[] {
  if (!n) return obrigatorios;
  return obrigatorios.filter((k) => (n.campos[k]?.valor ?? null) === null);
}

/** Nome do provedor so com caracteres seguros (vem do cabecalho X-Routed-Via do FreeLLM; nunca chave). */
export const provedorSeguro = (p: unknown): string | null => {
  const s = String(p ?? "").trim().slice(0, 80);
  return /^[A-Za-z0-9/._:@-]+$/.test(s) ? s : null;
};

export type StatusFila = "pendente" | "lendo" | "ok" | "erro";
export interface LinhaFila { id: string; status: StatusFila; tentativas: number; atualizado_em: string }

/** A linha 'lendo' esta parada ha mais de LENDO_EXPIRA_S? */
export const lendoExpirou = (l: Pick<LinhaFila, "status" | "atualizado_em">, agoraMs: number) =>
  l.status === "lendo" && agoraMs - Date.parse(l.atualizado_em) > LENDO_EXPIRA_S * 1000;
