// Tara em tres niveis (regra G3 do prompt mestre de 18/11/2026). NAO reescreve cadastro: so decide o valor a usar.
//  Nivel 1: tara confirmada plausivel ja gravada.
//  Nivel 2: so carreta com CRLV lido: PBT - capacidade (capacidade < PBT, capacidade >= 1000, resultado 2000..20000).
//  Nivel 3: tabela aproximada (valores PROVISORIOS e editaveis abaixo). Outros tipos pedem tara manual.
// Teste: node --test supabase/functions/_shared/tara-aproximada.test.ts

export type OrigemTara = "confirmada" | "derivada_crlv" | "aproximada_tabela";
export type ClasseVeiculo = "cavalo" | "carreta" | "caminhao";

export interface VeiculoTara {
  tipo_veiculo?: string | null;
  tipo_carroceria?: string | null;
  e_reboque?: boolean | null;
  quantidade_eixos?: number | string | null;
  tara_kg?: number | string | null;
}
export interface CrlvTara {
  pbt_kg?: number | null;
  capacidade_kg?: number | null;
}
export interface TaraResolvida {
  valor: number | null;
  origem: OrigemTara | null;
  /** aviso amarelo (nao bloqueia) */
  aviso: string | null;
  /** true quando nenhum nivel e possivel: pedir a tara em kg */
  pedirManual: boolean;
  /** tara gravada foi ignorada por parecer erro de unidade */
  ignorouGravada: boolean;
}

// Tabela provisoria (regra G3). Edite aqui; nao ha valor inventado para outros tipos.
export const TARA_APROXIMADA_KG = {
  cavalo_2_eixos: 7700,
  cavalo_3_eixos: 9500,
  carreta_3_eixos_aberta_ou_carga_seca: 7000,
  carreta_3_eixos_cacamba_ou_basculante: 9200,
} as const;

const sem = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function classeDoVeiculo(v: VeiculoTara): ClasseVeiculo {
  const t = sem(v.tipo_veiculo);
  if (t.includes("cavalo") || t.includes("trator")) return "cavalo";
  if (v.e_reboque === true || /carreta|semi|reboque/.test(t)) return "carreta";
  return "caminhao";
}

export function taraPlausivel(classe: ClasseVeiculo, kg: number): boolean {
  if (classe === "carreta") return kg >= 2000 && kg <= 20000;
  return kg >= 1000 && kg <= 30000; // cavalo e caminhao
}

const num = (x: unknown): number | null => {
  const n = typeof x === "string" ? Number(x.replace(",", ".")) : (x as number);
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

export function derivarTaraCarreta(crlv: CrlvTara | null | undefined): number | null {
  const pbt = num(crlv?.pbt_kg);
  const cap = num(crlv?.capacidade_kg);
  if (pbt === null || cap === null) return null;
  if (!(cap < pbt) || cap < 1000) return null; // LXX2816: capacidade igual ao PBT nao deriva
  const tara = pbt - cap;
  return tara >= 2000 && tara <= 20000 ? Math.round(tara) : null;
}

export function taraDaTabela(v: VeiculoTara, classe: ClasseVeiculo): number | null {
  const eixos = num(v.quantidade_eixos);
  const carroc = sem(v.tipo_carroceria);
  if (classe === "cavalo") {
    if (eixos === 2) return TARA_APROXIMADA_KG.cavalo_2_eixos;
    if (eixos === 3) return TARA_APROXIMADA_KG.cavalo_3_eixos;
    return null;
  }
  if (classe === "carreta" && eixos === 3) {
    if (/cacamba|basculante/.test(carroc)) return TARA_APROXIMADA_KG.carreta_3_eixos_cacamba_ou_basculante;
    if (/abert|carga seca|grade/.test(carroc)) return TARA_APROXIMADA_KG.carreta_3_eixos_aberta_ou_carga_seca;
  }
  return null; // carreta 2 eixos, chassi, prancha, sider, bau, frigorifico: sem valor inventado
}

export function resolverTara(veiculo: VeiculoTara, extracaoCrlv?: CrlvTara | null): TaraResolvida {
  const classe = classeDoVeiculo(veiculo);
  const gravada = num(veiculo.tara_kg);
  let ignorou = false;
  let avisoIgnorada: string | null = null;

  if (gravada !== null && gravada > 0) {
    if (taraPlausivel(classe, gravada)) {
      return { valor: Math.round(gravada), origem: "confirmada", aviso: null, pedirManual: false, ignorouGravada: false };
    }
    ignorou = true;
    avisoIgnorada = `tara cadastrada (${gravada}) parece erro de unidade e foi ignorada nesta emissao`;
  }

  if (classe === "carreta") {
    const d = derivarTaraCarreta(extracaoCrlv);
    if (d !== null) {
      return {
        valor: d, origem: "derivada_crlv",
        aviso: [avisoIgnorada, "tara derivada do CRLV (PBT menos capacidade); confirme com a ficha ou pesagem"].filter(Boolean).join("; "),
        pedirManual: false, ignorouGravada: ignorou,
      };
    }
  }

  const t = taraDaTabela(veiculo, classe);
  if (t !== null) {
    return {
      valor: t, origem: "aproximada_tabela",
      aviso: [avisoIgnorada, "tara aproximada, confirme com a ficha ou pesagem"].filter(Boolean).join("; "),
      pedirManual: false, ignorouGravada: ignorou,
    };
  }
  return {
    valor: null, origem: null,
    aviso: avisoIgnorada,
    pedirManual: true, ignorouGravada: ignorou,
  };
}

export const MENSAGEM_TARA_NAO_ENCONTRADA = "Tara nao encontrada; informe a tara em kg";
