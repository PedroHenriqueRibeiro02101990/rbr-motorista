// Conversao e formatacao brasileira de PESO e DINHEIRO (regras G1 e G2 do prompt mestre de 18/11/2026).
// Modulo unico, sem dependencias: usado pelo gestor (telas) e pelas funcoes (servidor).
// Teste: node --test supabase/functions/_shared/unidades-br.test.ts

// ---------- PESO (G1): so KG, inteiro ----------

export type ResultadoPeso = { ok: true; kg: number } | { ok: false; mensagem: string };

/** Mensagem unica da regra G1 (usada na tela, no cadastro e nas funcoes). */
export function mensagemPesoDecimal(rotulo = "Tara", sugestaoKg?: number): string {
  const s = sugestaoKg !== undefined ? sugestaoKg : 25500;
  return `${rotulo} e em kg. Voce quis dizer ${formatarNumeroBR(s)}?`;
}

/**
 * Le o que a pessoa digitou num campo de peso. Aceita SO kg inteiro: "25500", "25.500" (milhar) e "25500 kg".
 * Recusa "25,5" e "25.5" (parece tonelada): a tela nunca converte sozinha.
 */
export function lerPesoKg(entrada: unknown, rotulo = "Tara"): ResultadoPeso {
  if (typeof entrada === "number") {
    if (!Number.isFinite(entrada) || !Number.isInteger(entrada) || entrada < 0) {
      return { ok: false, mensagem: mensagemPesoDecimal(rotulo, Number.isFinite(entrada) ? Math.round(entrada * 1000) : undefined) };
    }
    return { ok: true, kg: entrada };
  }
  if (typeof entrada !== "string") return { ok: false, mensagem: `${rotulo} deve ser um numero em kg.` };
  const t = entrada.replace(/\s*kg\s*$/i, "").trim();
  if (!t) return { ok: false, mensagem: `${rotulo} deve ser um numero em kg.` };
  if (/^\d+$/.test(t)) return { ok: true, kg: Number(t) };
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return { ok: true, kg: Number(t.replace(/\./g, "")) }; // 25.500 = milhar
  if (/^\d+([.,]\d+)$/.test(t)) {
    const tonelada = Number(t.replace(",", "."));
    return { ok: false, mensagem: mensagemPesoDecimal(rotulo, Math.round(tonelada * 1000)) };
  }
  return { ok: false, mensagem: `${rotulo} deve ser um numero em kg (so digitos).` };
}

export function formatarNumeroBR(n: number): string {
  return Math.trunc(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** 25500 -> "25.500 kg" */
export function formatarKg(kg: number | null | undefined): string {
  return typeof kg === "number" && Number.isFinite(kg) ? `${formatarNumeroBR(kg)} kg` : "";
}

/** Servidor: recusa texto ou decimal no lugar de peso em kg. */
export function exigirPesoKg(valor: unknown, rotulo: string): number {
  if (typeof valor !== "number") throw new Error(`${rotulo}: esperava numero (kg), recebi ${typeof valor}.`);
  const r = lerPesoKg(valor, rotulo);
  if (!r.ok) throw new Error(r.mensagem);
  return r.kg;
}

// ---------- DINHEIRO (G2): mascara de centavos ----------

export const TETO_MOEDA_PADRAO = 100_000;

/** Converte os digitos digitados em centavos: "150025" -> 150025 (R$ 1.500,25). Ignora qualquer nao-digito. */
export function centavosDeDigitos(texto: string): number {
  const d = (texto ?? "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (!d) return 0;
  return Math.min(Number(d), Number.MAX_SAFE_INTEGER);
}

export function formatarMoeda(valor: number | null | undefined): string {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return "";
  const cent = Math.round(valor * 100);
  const neg = cent < 0;
  const abs = Math.abs(cent);
  const inteiro = Math.trunc(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${neg ? "-" : ""}R$ ${formatarNumeroBR(inteiro)},${frac}`;
}

/** Texto do campo enquanto a pessoa digita: "150" -> "R$ 1,50". Vazio vira "". */
export function mascaraMoeda(digitos: string): string {
  const c = centavosDeDigitos(digitos);
  if (!c && !(digitos ?? "").replace(/\D/g, "")) return "";
  return formatarMoeda(c / 100);
}

export function valorDeDigitos(digitos: string): number {
  return centavosDeDigitos(digitos) / 100;
}

export function precisaConfirmarTeto(valor: number, teto = TETO_MOEDA_PADRAO): boolean {
  return valor >= teto;
}

export function textoConfirmacaoTeto(valor: number): string {
  return `Confirma ${formatarMoeda(valor)}?`;
}

/**
 * Unico lugar que converte o formato brasileiro ("R$ 24.210,33", "24.210,33", "1.500") em numero.
 * Usado na leitura de PDF de CIOT, VPO e contrato. Devolve null se nao for numero valido.
 */
export function paraNumeroBR(texto: unknown): number | null {
  if (typeof texto === "number") return Number.isFinite(texto) ? texto : null;
  if (typeof texto !== "string") return null;
  const t = texto.replace(/R\$\s*/i, "").replace(/\s/g, "");
  if (!t || !/^-?[\d.,]+$/.test(t)) return null;
  let norm: string;
  if (t.includes(",")) norm = t.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) norm = t.replace(/\./g, "");
  else norm = t;
  const n = Number(norm);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** Servidor: recusa texto no lugar de numero para valores em reais (numeric(14,2)). */
export function exigirValorReais(valor: unknown, rotulo: string): number {
  if (typeof valor !== "number" || !Number.isFinite(valor)) {
    throw new Error(`${rotulo}: esperava numero em reais, recebi ${typeof valor === "string" ? "texto" : typeof valor}.`);
  }
  if (valor < 0) throw new Error(`${rotulo}: nao pode ser negativo.`);
  if (Math.abs(valor * 100 - Math.round(valor * 100)) > 1e-6) throw new Error(`${rotulo}: no maximo 2 casas decimais.`);
  return Math.round(valor * 100) / 100;
}

// ---------- Leitura de documento (CRLV): toneladas -> kg com registro ----------

export interface PesoLido {
  kg: number | null;
  convertidoDeTonelada: boolean;
  motivoNulo?: string;
  /** "25,5 t para 25.500 kg", para a pessoa confirmar antes de gravar */
  aviso?: string;
}

/** CRLV imprime em toneladas com ponto ("25.5", "16.33"); "*.*" e vazio. Numero < 100 = tonelada; >= 100 = kg. */
export function pesoDeDocumento(bruto: unknown): PesoLido {
  if (bruto === null || bruto === undefined) return { kg: null, convertidoDeTonelada: false, motivoNulo: "campo ausente no documento" };
  if (typeof bruto === "string") {
    const t = bruto.trim();
    if (!t || /^[*.\s-]+$/.test(t)) return { kg: null, convertidoDeTonelada: false, motivoNulo: 'documento traz "*.*" (vazio)' };
    if (/^\d{1,3}(\.\d{3})+$/.test(t)) return { kg: Number(t.replace(/\./g, "")), convertidoDeTonelada: false }; // 7.980 = kg
    const n = Number(t.replace(",", "."));
    if (!Number.isFinite(n)) return { kg: null, convertidoDeTonelada: false, motivoNulo: `valor ilegivel ("${t}")` };
    return pesoDeDocumento(n);
  }
  if (typeof bruto !== "number" || !Number.isFinite(bruto) || bruto <= 0) {
    return { kg: null, convertidoDeTonelada: false, motivoNulo: "valor ausente ou zerado no documento" };
  }
  if (bruto < 100) {
    const kg = Math.round(bruto * 1000);
    const txt = String(bruto).replace(".", ",");
    return { kg, convertidoDeTonelada: true, aviso: `${txt} t para ${formatarNumeroBR(kg)} kg` };
  }
  return { kg: Math.round(bruto), convertidoDeTonelada: false };
}
