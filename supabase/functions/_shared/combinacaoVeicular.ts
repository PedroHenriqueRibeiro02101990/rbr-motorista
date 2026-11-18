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
