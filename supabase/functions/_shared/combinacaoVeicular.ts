// Categoria de combinacao veicular (VPO/MDF-e, rejeicao 731). Pelos eixos de cavalo + reboques:
// 02=2 eixos, 04=3, 06=4, 07=5, 08=6, 10=7, 11=8, 12=9, 13=10, 14=acima de 10. Truck sem reboque (3 eixos) = 04; cavalo 3 + carreta 3 = 08.
// Teste: node --test supabase/functions/_shared/combinacaoVeicular.test.ts
const MAPA: Record<number, string> = { 2: "02", 3: "04", 4: "06", 5: "07", 6: "08", 7: "10", 8: "11", 9: "12", 10: "13" };

export function categoriaCombinacao(eixos: number | null | undefined): string | null {
  if (eixos == null || !Number.isFinite(eixos) || eixos < 2) return null;
  if (eixos > 10) return "14";
  return MAPA[Math.trunc(eixos)] ?? null;
}

export function eixosDaCombinacao(tracao: { quantidade_eixos?: number | null } | null | undefined, reboques: { quantidade_eixos?: number | null }[]): number | null {
  const total = (tracao?.quantidade_eixos ?? 0) + reboques.reduce((s, r) => s + (r.quantidade_eixos ?? 0), 0);
  return total > 0 ? total : null;
}

/** Unicos valores que o banco aceita (constraint operacao_ciot_vpo_vpo_categoria_combinacao_check): TEXTO de 2 digitos. */
export const CATEGORIAS_VALIDAS = ["02", "04", "06", "07", "08", "10", "11", "12", "13", "14"] as const;

/** Texto de 2 digitos ("7" -> "07"); devolve null se vazio ou fora da lista. Nunca usa parseInt/Number no valor gravado. */
export function normalizarCategoria(v: string | number | null | undefined): string | null {
  const d = String(v ?? "").replace(/\D/g, "");
  if (!d) return null;
  const c = d.padStart(2, "0");
  return (CATEGORIAS_VALIDAS as readonly string[]).includes(c) ? c : null;
}

/** Texto do rotulo da tela: "6 eixos -> 08". */
export function rotuloCategoriaPorEixos(eixos: number | null | undefined): string {
  const c = categoriaCombinacao(eixos);
  return eixos && c ? `${eixos} eixos da combinação → ${c}` : "eixos não conhecidos";
}
