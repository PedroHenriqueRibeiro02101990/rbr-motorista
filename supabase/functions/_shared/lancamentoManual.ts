// Lancamento manual de vale-pedagio e CIOT (Parte B etapas 9 a 11 e 15). Funcoes puras: validacao, esteira e pre-voo derivados do
// ESTADO GRAVADO (operacao_ciot_vpo + documentacao_operacao), nunca de estado de tela (regra G5).
// Teste: node --test supabase/functions/_shared/lancamentoManual.test.ts
import { categoriaCombinacao, normalizarCategoria } from "./combinacaoVeicular.ts";

export const IPEF_REPOM_CNPJ = "65697260000103"; // IPEF da Repom (destino do pagamento quando a origem do CIOT e a Repom)
export type Nivel = "ok" | "aviso" | "bloqueio";
export interface Item { nivel: Nivel; campo: string; mensagem: string }
const so = (s: unknown) => String(s ?? "").replace(/\D/g, "");

/** Fonte unica da regra "operacao manual": nao e demo/teste e o CIOT/VPO nao sai por API em producao. */
export function ehOperacaoManual(o: { modo_demonstracao?: boolean | null; eh_teste?: boolean | null; ciot_origem?: string | null; fornecedor?: string | null }): boolean {
  if (o.modo_demonstracao === true || o.eh_teste === true) return false;
  const origem = (o.ciot_origem ?? "").toLowerCase();
  const forn = (o.fornecedor ?? "").toLowerCase();
  if (origem === "rbr_repom" || origem === "manual" || forn === "repom") return true;
  return origem !== "efrete" && origem !== "nstech"; // qualquer operacao real enquanto nao houver emissao por API em producao
}

/** Verificador de verdade: 4 digitos e diferente de "0000" (marcador interno gravado na OP-3771 quando a Repom mascarou o verificador). */
export function verificadorReal(v: unknown): string | null {
  const d = so(v);
  return d.length === 4 && d !== "0000" ? d : null;
}

/** "5200480384321483" (16) vira 12 + 4; 12 digitos sozinhos ficam sem verificador. A Repom mascara o verificador ("520048413061XXXX"): o "XXXX" e ignorado (so() tira o que nao e digito). */
export function separarCiot(texto: unknown): { ciot: string; verificador: string } | null {
  const d = so(texto);
  if (d.length === 16) return { ciot: d.slice(0, 12), verificador: d.slice(12) };
  if (d.length === 12) return { ciot: d, verificador: "" };
  return null;
}

export interface FormularioManual {
  idvpo?: string | null;
  vpo_valor?: number | null;
  vpo_cnpj_fornecedora?: string | null;
  categoria_combinacao?: string | null;
  ciot?: string | null;
  ciot_verificador?: string | null;
  valor_frete?: number | null;
  adiantamento?: number | null;
  saldo?: number | null;
  pagto_cnpj_ipef?: string | null;
  ciot_cnpj_responsavel?: string | null;
  piso_antt?: number | null;
  origem_repom?: boolean;
  /** quando vier de PDF lido, a pessoa ja confirmou */
}

const ok = (campo: string): Item => ({ nivel: "ok", campo, mensagem: "ok" });

export function validarLancamento(f: FormularioManual): Item[] {
  const out: Item[] = [];
  const idv = so(f.idvpo);
  if (f.idvpo) out.push(idv.length === 20 && idv === String(f.idvpo).trim() ? ok("idvpo") : { nivel: "bloqueio", campo: "idvpo", mensagem: "IDVPO deve ter 20 digitos (so numeros)." });
  if (f.vpo_valor != null) out.push(f.vpo_valor > 0 ? ok("vpo_valor") : { nivel: "bloqueio", campo: "vpo_valor", mensagem: "Valor do vale-pedagio deve ser maior que zero." });
  if (f.vpo_cnpj_fornecedora && so(f.vpo_cnpj_fornecedora).length !== 14) out.push({ nivel: "bloqueio", campo: "vpo_cnpj_fornecedora", mensagem: "CNPJ da fornecedora do vale deve ter 14 digitos." });
  if (f.categoria_combinacao && !normalizarCategoria(f.categoria_combinacao)) out.push({ nivel: "bloqueio", campo: "categoria_combinacao", mensagem: "Categoria de combinacao invalida: use 02, 04, 06, 07, 08, 10, 11, 12, 13 ou 14 (pelo total de eixos do cavalo e reboques)." });
  if (f.ciot) {
    const c = so(f.ciot);
    if (c.length === 16) { /* sera separado ao gravar */ out.push(ok("ciot")); }
    else if (c.length !== 12 || c !== String(f.ciot).trim()) out.push({ nivel: "bloqueio", campo: "ciot", mensagem: "CIOT: 12 digitos (ou os 16 que a Repom mostra, que o sistema separa em 12 + 4)." });
    else if (so(f.ciot_verificador) && so(f.ciot_verificador).length !== 4) out.push({ nivel: "bloqueio", campo: "ciot_verificador", mensagem: "O verificador do CIOT tem 4 digitos (ou deixe vazio: o MDF-e usa so os 12 primeiros)." });
    else out.push(ok("ciot"));
  }
  if (f.valor_frete != null && !(f.valor_frete > 0)) out.push({ nivel: "bloqueio", campo: "valor_frete", mensagem: "Valor do frete do CIOT deve ser maior que zero." });
  if (f.valor_frete != null && f.adiantamento != null && f.adiantamento > f.valor_frete) out.push({ nivel: "bloqueio", campo: "adiantamento", mensagem: "Adiantamento maior que o valor do frete." });
  if (f.valor_frete != null && f.adiantamento != null && f.saldo != null && Math.abs(f.adiantamento + f.saldo - f.valor_frete) > 0.01) {
    out.push({ nivel: "aviso", campo: "saldo", mensagem: "Adiantamento mais saldo nao soma o valor do frete (rejeicao 738 no MDF-e)." });
  }
  if (f.valor_frete != null && f.piso_antt != null && f.valor_frete < f.piso_antt) out.push({ nivel: "aviso", campo: "valor_frete", mensagem: "Valor do contrato abaixo do piso minimo ANTT." });
  if (f.origem_repom && f.pagto_cnpj_ipef && so(f.pagto_cnpj_ipef) !== IPEF_REPOM_CNPJ) out.push({ nivel: "aviso", campo: "pagto_cnpj_ipef", mensagem: "Destino do pagamento diferente da IPEF da Repom." });
  if (f.ciot_cnpj_responsavel && so(f.ciot_cnpj_responsavel).length !== 14) out.push({ nivel: "bloqueio", campo: "ciot_cnpj_responsavel", mensagem: "CNPJ responsavel do CIOT deve ter 14 digitos." });
  return out;
}

/** Defaults derivados (nada que o sistema ja sabe deve ser pedido). */
export function completarPadroes(f: FormularioManual, o: { cnpj_rbr?: string | null; eixos_combinacao?: number | null }): FormularioManual {
  return {
    ...f,
    categoria_combinacao: normalizarCategoria(f.categoria_combinacao) || categoriaCombinacao(o.eixos_combinacao ?? null),
    pagto_cnpj_ipef: f.pagto_cnpj_ipef || (f.origem_repom ? IPEF_REPOM_CNPJ : null),
    ciot_cnpj_responsavel: f.ciot_cnpj_responsavel || o.cnpj_rbr || null,
  };
}

// ---------------------------- Esteira real (etapa 11) ----------------------------
export interface LinhaCiotVpo {
  vpo_idvpo?: string | null; vpo_valor?: number | string | null; ciot?: string | null; ciot_verificador?: string | null
  ciot_emitido_em?: string | null; updated_at?: string | null; ciot_status?: string | null; ciot_ambiente?: string | null
  ciot_origem?: string | null; vpo_categoria_combinacao?: string | null; pagto_cnpj_ipef?: string | null; numero_averbacao?: string | null
}
export interface EtapaEsteira { concluida: boolean; texto: string; faltam: string[] }

export function mascaraCiot(ciot: string, ver: string): string {
  return `${ciot.slice(0, 4)} ${ciot.slice(4, 8)} ${ciot.slice(8, 12)}${ver ? `-${ver}` : ""}`.trim();
}

export function etapaVpo(l: LinhaCiotVpo | null, temPedagio = true): EtapaEsteira {
  if (!temPedagio) return { concluida: true, texto: "Rota sem pedagio: nao precisa", faltam: [] };
  const valor = Number(l?.vpo_valor ?? 0);
  const faltam: string[] = [];
  if (!so(l?.vpo_idvpo)) faltam.push("IDVPO");
  if (!(valor > 0)) faltam.push("valor do vale");
  if (!faltam.length) return { concluida: true, texto: `VPO ${l!.vpo_idvpo!.slice(0, 4)}... R$ ${valor.toFixed(2).replace(".", ",")}`, faltam };
  return { concluida: false, texto: l ? `Em andamento: falta ${faltam.join(", ")}` : "Ainda nao lancado", faltam };
}

export function etapaCiot(l: LinhaCiotVpo | null): EtapaEsteira {
  const c = so(l?.ciot), v = so(l?.ciot_verificador);
  const faltam: string[] = [];
  if (c.length !== 12) faltam.push(c.length === 16 ? "separar o verificador (16 digitos gravados)" : "CIOT (12 digitos)");
  // O verificador e opcional: a Repom o mascara (XXXX) e o MDF-e usa so os 12 digitos. Se vier, tem de ter 4.
  if (v && v.length !== 4) faltam.push("verificador (4 digitos ou vazio)");
  if (!faltam.length) return { concluida: true, texto: `CIOT ${mascaraCiot(c, v)}`, faltam };
  return { concluida: false, texto: l?.ciot ? `Em andamento: falta ${faltam.join(", ")}` : "Ainda nao lancado", faltam };
}

// ---------------------------- Pre-voo do MDF-e (etapa 15) ----------------------------
export interface EstadoPreVoo {
  cte: { status?: string | null; chave_acesso?: string | null } | null
  averbacaoCte: { status?: string | null } | null
  ciotVpo: LinhaCiotVpo | null
  temPedagio: boolean
  contratoExigeCiot: boolean
  cepCarregamento?: string | null
  cepDescarregamento?: string | null
  ncm?: string | null
  tracao?: { tara_kg?: number | null; eixos?: number | null; tipo?: string | null } | null
  reboques: { tara_kg?: number | null; e_reboque?: boolean | null }[]
  ufInicio?: string | null
  ufFim?: string | null
  ufsVizinhas?: boolean
  percursoInformado?: boolean
}

/** Regra de 16/11: so BLOQUEIA o que SEFAZ, ANTT, CIOT ou VPO bloqueiam; regra interna da RBR e aviso. */
export function preVooMdfe(e: EstadoPreVoo): Item[] {
  const out: Item[] = [];
  const add = (nivel: Nivel, campo: string, mensagem: string) => out.push({ nivel, campo, mensagem });
  if (e.cte?.status === "emitido" && e.cte.chave_acesso) add("ok", "cte", "CT-e autorizado");
  else add("bloqueio", "cte", "CT-e ainda nao autorizado (o MDF-e referencia a chave do CT-e).");
  if (e.averbacaoCte?.status === "emitido" || e.averbacaoCte?.status === "averbado") add("ok", "averbacao_cte", "CT-e averbado");
  else add("aviso", "averbacao_cte", "Averbacao do CT-e ainda nao concluida (a averbacao e automatica).");

  const ciot = etapaCiot(e.ciotVpo);
  if (e.contratoExigeCiot) {
    if (ciot.concluida) add("ok", "ciot", ciot.texto);
    else add("bloqueio", "ciot", `CIOT incompleto: ${ciot.faltam.join(", ") || "nao lancado"}.`);
    if (e.ciotVpo?.ciot_ambiente && e.ciotVpo.ciot_ambiente !== "producao") add("bloqueio", "ciot_ambiente", "CIOT de homologacao nao vale para MDF-e de producao.");
    const st = e.ciotVpo?.ciot_status ?? "";
    if (st.startsWith("refazer")) add("aviso", "ciot_status", `CIOT em "${st}": refaca antes de emitir.`);
    else if (st && st !== "emitido") add("aviso", "ciot_status", `Status do CIOT: ${st}.`);
  }
  if (e.temPedagio) {
    const v = etapaVpo(e.ciotVpo, true);
    if (v.concluida) add("ok", "vpo", v.texto); else add("bloqueio", "vpo", `Vale-pedagio incompleto: ${v.faltam.join(", ")}.`);
  }
  const cat = e.ciotVpo?.vpo_categoria_combinacao || categoriaCombinacao(((e.tracao?.eixos ?? 0) + 0) || null);
  if (e.temPedagio) add(cat ? "ok" : "bloqueio", "categoria", cat ? `Categoria de combinacao ${cat}` : "Categoria de combinacao veicular nao definida (eixos do cavalo e reboques).");
  if (e.ciotVpo?.ciot_origem === "rbr_repom") {
    if (so(e.ciotVpo.pagto_cnpj_ipef) === IPEF_REPOM_CNPJ) add("ok", "destino_pagamento", "Destino do pagamento: IPEF da Repom");
    else add("bloqueio", "destino_pagamento", "Informacoes de pagamento obrigatorias (carga lotacao): destino IPEF da Repom nao definido.");
  }
  for (const [campo, rot, cep] of [["cep_carregamento", "carregamento", e.cepCarregamento], ["cep_descarregamento", "descarregamento", e.cepDescarregamento]] as const) {
    if (so(cep).length === 8) add("ok", campo, `CEP de ${rot} ${so(cep)}`); else add("bloqueio", campo, `CEP de ${rot} com 8 digitos nao encontrado.`);
  }
  if (so(e.ncm).length >= 8) add("ok", "ncm", "NCM presente"); else add("aviso", "ncm", "NCM nao encontrado nas NF-e.");
  const tara = e.tracao?.tara_kg;
  if (tara && tara >= 1000 && tara <= 30000) add("ok", "tara", "Tara em kg dentro da faixa"); else add("aviso", "tara", "Tara fora da faixa: o sistema usara a derivada do CRLV ou a aproximada (aviso).");
  const cavalo = /cavalo|trator/i.test(e.tracao?.tipo ?? "");
  if (cavalo) add(e.reboques.length ? "ok" : "bloqueio", "reboque", e.reboques.length ? "Reboque vinculado" : "Cavalo sem reboque vinculado (a SEFAZ exige a carreta).");
  if (e.ufInicio && e.ufFim && e.ufsVizinhas === false) add(e.percursoInformado ? "ok" : "aviso", "percurso", e.percursoInformado ? "Percurso de UFs informado" : "UFs de inicio e fim nao sao vizinhas: o sistema calcula o percurso; confira.");
  if (e.ciotVpo?.numero_averbacao) add("ok", "numero_averbacao", "Numero da averbacao presente"); else add("aviso", "numero_averbacao", "Numero da averbacao ainda nao presente.");
  return out;
}

export const temBloqueio = (itens: Item[]) => itens.some((i) => i.nivel === "bloqueio");
export function resumoFaltaMdfe(itens: Item[]): string {
  const f = itens.filter((i) => i.nivel === "bloqueio");
  return f.length ? `Falta: ${f.map((i) => i.campo === "cte" ? "CT-e" : i.campo === "ciot" ? "CIOT" : i.campo === "vpo" ? "vale-pedagio" : i.campo).join(", ")}` : "";
}
