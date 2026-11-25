// Extracao de documentos: tipos, schemas, prompts e NORMALIZACAO (Parte A etapa 2 e Parte B etapa 10).
// Parte pura e testavel (sem rede); a chamada da IA fica em extrair-documento/index.ts.
// Regras: nunca inventar (null com motivo); pesos em kg (G1/G3/G4); valores em reais no formato brasileiro (G2);
// deducoes (idade, genero, cidade pelo CEP) sao SEMPRE sugestoes, nunca gravadas sozinhas.
// Teste: node --test supabase/functions/_shared/extracao-documentos.test.ts
import { derivarTaraCarreta } from "./tara-aproximada.ts";
import { cpfValido, eReboquePorTipoCrlv, idadeEm, placaValida } from "./validacoes-cadastro.ts";
import { normalizarCategoria } from "./combinacaoVeicular.ts";
import { paraNumeroBR, pesoDeDocumento } from "./unidades-br.ts";

export const TIPOS_DOCUMENTO = [
  "crlv", "cnh", "rg", "cpf", "rntrc", "comprovante_residencia", "dados_bancarios",
  "contrato_ciot_repom", "vpr_vale_pedagio", "outro",
] as const;
export type TipoDocumento = typeof TIPOS_DOCUMENTO[number];
export type Confianca = "alta" | "media" | "baixa";

type Tp = "string" | "number" | "integer" | "boolean";
export const CAMPOS_POR_TIPO: Record<Exclude<TipoDocumento, "outro">, Record<string, Tp>> = {
  crlv: {
    placa: "string", renavam: "string", chassi: "string", ano_fabricacao: "integer", ano_modelo: "integer", marca_modelo: "string",
    especie_tipo: "string", carroceria: "string", quantidade_eixos: "integer", tara: "number", capacidade_carga: "number", pbt: "number",
    cmt: "number", uf: "string", exercicio: "integer", nome_proprietario: "string", cpf_cnpj_proprietario: "string", observacoes: "string",
  },
  cnh: { nome: "string", cpf: "string", numero_registro: "string", categoria: "string", validade: "string", data_nascimento: "string", primeira_habilitacao: "string", sexo: "string" },
  rg: { nome: "string", numero_rg: "string", orgao_emissor: "string", uf_emissor: "string", data_nascimento: "string", filiacao: "string", cpf: "string" },
  cpf: { nome: "string", cpf: "string", data_nascimento: "string" },
  rntrc: { numero: "string", titular: "string", validade: "string", situacao: "string", tipo_transportador: "string" },
  comprovante_residencia: {
    nome_titular: "string", logradouro: "string", numero: "string", complemento: "string", bairro: "string", cidade: "string",
    uf: "string", cep: "string", data_emissao: "string", emissor: "string",
  },
  dados_bancarios: { titular: "string", cpf_cnpj: "string", banco_codigo: "string", agencia: "string", conta: "string", tipo_conta: "string", pix: "string" },
  contrato_ciot_repom: {
    ciot: "string", numero_contrato: "string", numero_viagem: "string", valor_frete: "string", adiantamento: "string", saldo: "string",
    placa: "string", cpf_cnpj_prestador: "string", data_emissao: "string",
  },
  vpr_vale_pedagio: {
    idvpo: "string", numero_viagem: "string", valor_total: "string", quantidade_eixos: "integer", numero_pracas: "integer", categoria: "string", placa: "string",
  },
};

/** Schema Gemini: cada campo vira {valor, confianca, trecho}; "tipo_documento" e a classificacao. */
export function schemaDoTipo(tipo: Exclude<TipoDocumento, "outro">) {
  const props: Record<string, unknown> = {};
  for (const [campo, t] of Object.entries(CAMPOS_POR_TIPO[tipo])) {
    props[campo] = {
      type: "object",
      properties: {
        valor: { type: t, nullable: true },
        confianca: { type: "string", enum: ["alta", "media", "baixa"] },
        trecho: { type: "string", nullable: true },
        motivo_nulo: { type: "string", nullable: true },
      },
      required: ["valor", "confianca"],
    };
  }
  props.legivel = { type: "boolean", nullable: true };
  props.suspeita_fraude = { type: "boolean", nullable: true };
  return { type: "object", properties: props, required: Object.keys(CAMPOS_POR_TIPO[tipo]) };
}

export const SCHEMA_CLASSIFICACAO = {
  type: "object",
  properties: { tipo: { type: "string", enum: [...TIPOS_DOCUMENTO] }, confianca: { type: "string", enum: ["alta", "media", "baixa"] } },
  required: ["tipo", "confianca"],
};
export const PROMPT_CLASSIFICACAO =
  "Classifique este documento brasileiro em UM tipo: crlv (CRLV/CRLV-e de veiculo), cnh, rg, cpf, rntrc (RNTRC/ANTT), comprovante_residencia, " +
  "dados_bancarios (cartao, extrato, comprovante de conta ou chave PIX), contrato_ciot_repom (contrato/CIOT da Repom), " +
  "vpr_vale_pedagio (VPR/recibo de vale-pedagio) ou outro. Responda so o JSON do schema.";

const COMUM =
  'Para CADA campo devolva {valor, confianca (alta|media|baixa), trecho (texto de origem no documento), motivo_nulo}. Se o campo nao estiver legivel ou nao existir, valor=null e explique em motivo_nulo. NUNCA invente. "*.*" no documento significa vazio (null). Datas em YYYY-MM-DD.';
export const PROMPTS_V2: Record<Exclude<TipoDocumento, "outro">, string> = {
  crlv: `Voce le um CRLV / CRLV-e brasileiro. PESO: o CRLV imprime PBT, capacidade e CMT em TONELADAS com ponto (ex.: 25.5, 16.33); devolva o numero impresso, sem converter. O CRLV digital NAO traz tara: devolva tara=null com motivo. Em caminhao trator o PBT e do cavalo sozinho (NUNCA e a tara) e a capacidade vem vazia. "especie_tipo" e a ESPECIE/TIPO impressa (ex.: CAMINHAO TRATOR, SEMIRREBOQUE, REBOQUE, CAMINHAO). ${COMUM}`,
  cnh: `Voce le uma CNH brasileira (fisica ou digital). "primeira_habilitacao" e a data da 1a habilitacao, se constar. "sexo": M ou F somente se o documento trouxer o campo. CPF so numeros. ${COMUM}`,
  rg: `Voce le um RG brasileiro. CPF so numeros se existir. ${COMUM}`,
  cpf: `Voce le um comprovante de CPF. CPF so numeros. ${COMUM}`,
  rntrc: `Voce le um comprovante/certificado de RNTRC da ANTT. "situacao" como aparece (ativo, inativo...). "tipo_transportador": TAC, ETC ou CTC. ${COMUM}`,
  comprovante_residencia: `Voce le um comprovante de residencia (agua, luz, gas, internet, fatura). "nome_titular" e o titular da conta, mesmo que seja familiar ou o dono da casa. CEP so numeros. "data_emissao" e a emissao/referencia. ${COMUM}`,
  dados_bancarios: `Voce le dados bancarios (cartao, extrato, comprovante de conta ou PIX). Nao copie numero completo de cartao. "tipo_conta": corrente, poupanca ou pagamento. ${COMUM}`,
  contrato_ciot_repom: `Voce le um contrato/CIOT da Repom. "ciot": o numero do CIOT exatamente como impresso (a Repom mostra 16 digitos). Valores em reais como impressos (ex.: R$ 24.210,33). Placa sem tracos. ${COMUM}`,
  vpr_vale_pedagio: `Voce le um VPR / recibo de vale-pedagio. "idvpo": numero de 20 digitos. "valor_total" como impresso (ex.: R$ 236,27). ${COMUM}`,
};

// ---------------------------- Normalizacao ----------------------------

export interface CampoLido { valor: unknown; confianca: Confianca; trecho?: string | null; motivo_nulo?: string | null }
export interface CampoNormalizado { valor: string | number | boolean | null; confianca: Confianca; trecho: string | null; motivo_nulo: string | null; observacao?: string }
export interface Normalizado {
  tipo: TipoDocumento;
  campos: Record<string, CampoNormalizado>;
  avisos: string[];
  /** Sugestoes (nunca gravadas sozinhas) */
  deducoes: Record<string, { valor: string | number | boolean; confianca: Confianca; origem: string }>;
}

const so = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const alfa = (s: unknown) => String(s ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");

/** Data para ISO (YYYY-MM-DD). Aceita ISO e DD/MM/AAAA (padrao brasileiro; NUNCA le como MM/DD). Invalida ou impossivel -> null. */
export function paraIso(v: unknown): string | null {
  const t = String(v ?? "").trim();
  if (!t) return null;
  let y: number, m: number, d: number;
  let r = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(t);
  if (r) { y = +r[1]; m = +r[2]; d = +r[3]; }
  else if ((r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t))) { d = +r[1]; m = +r[2]; y = +r[3]; }
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function base(tipo: TipoDocumento, bruto: Record<string, unknown>): Normalizado {
  const campos: Record<string, CampoNormalizado> = {};
  const spec = tipo === "outro" ? {} : CAMPOS_POR_TIPO[tipo];
  for (const k of Object.keys(spec)) {
    const c = (bruto?.[k] ?? {}) as Partial<CampoLido>;
    const conf: Confianca = c.confianca === "alta" || c.confianca === "media" || c.confianca === "baixa" ? c.confianca : "baixa";
    const v = c.valor === undefined || c.valor === "" ? null : (c.valor as CampoNormalizado["valor"]);
    campos[k] = { valor: v, confianca: v === null ? "baixa" : conf, trecho: c.trecho ?? null, motivo_nulo: v === null ? (c.motivo_nulo ?? "nao encontrado no documento") : null };
  }
  return { tipo, campos, avisos: [], deducoes: {} };
}

const GENEROS_F = new Set(["maria", "ana", "francisca", "antonia", "adriana", "juliana", "marcia", "fernanda", "patricia", "aline", "sandra", "camila", "amanda", "bruna", "jessica", "leticia", "luciana", "vanessa", "regina", "rosa", "sonia", "tereza", "teresa"]);
const GENEROS_M = new Set(["jose", "joao", "antonio", "francisco", "carlos", "paulo", "pedro", "lucas", "luiz", "luis", "marcos", "gabriel", "rafael", "daniel", "marcelo", "bruno", "eduardo", "felipe", "rodrigo", "manoel", "manuel", "sergio", "roberto", "anderson", "alan"]);

export function sugerirGenero(nome: string | null | undefined, sexoDoc?: string | null): { valor: "M" | "F"; confianca: Confianca; origem: string } | null {
  const s = (sexoDoc ?? "").toUpperCase();
  if (s === "M" || s === "F") return { valor: s, confianca: "alta", origem: "campo sexo do documento" };
  const p = (nome ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().split(/\s+/)[0];
  if (!p) return null;
  if (GENEROS_F.has(p)) return { valor: "F", confianca: "media", origem: "primeiro nome" };
  if (GENEROS_M.has(p)) return { valor: "M", confianca: "media", origem: "primeiro nome" };
  if (p.endsWith("a")) return { valor: "F", confianca: "baixa", origem: "primeiro nome" };
  if (/[oslr]$/.test(p)) return { valor: "M", confianca: "baixa", origem: "primeiro nome" };
  return null;
}

function diasEntre(a: string, b: string) { return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000); }

/** Normaliza o resultado cru da IA para o formato do sistema. `hoje` = YYYY-MM-DD. */
export function normalizarExtracao(tipo: TipoDocumento, bruto: Record<string, unknown>, hoje: string): Normalizado {
  const n = base(tipo, bruto);
  const c = n.campos;
  // Datas sempre ISO: "12/05/2030" lido como MM/DD gravaria 5 de dezembro sem erro nenhum.
  const DATAS: Partial<Record<TipoDocumento, string[]>> = {
    cnh: ["validade", "data_nascimento", "primeira_habilitacao"], rg: ["data_nascimento"], cpf: ["data_nascimento"], rntrc: ["validade"],
    comprovante_residencia: ["data_emissao"], contrato_ciot_repom: ["data_emissao"],
  };
  for (const k of DATAS[tipo] ?? []) {
    const bruta = c[k].valor;
    if (bruta === null) continue;
    const iso = paraIso(bruta);
    if (iso === null) { c[k].valor = null; c[k].confianca = "baixa"; c[k].motivo_nulo = `data "${String(bruta)}" nao reconhecida: digite no formato DD/MM/AAAA`; n.avisos.push(`${k}: data lida como "${String(bruta)}" nao foi aceita; confira o documento.`); }
    else c[k].valor = iso;
  }
  // CPF lido com digitos errados: avisa (a leitura da IA erra digito); nao bloqueia, a pessoa confere.
  if ((tipo === "cnh" || tipo === "rg" || tipo === "cpf") && c.cpf.valor !== null) {
    const d = so(c.cpf.valor);
    if (!cpfValido(d)) { c.cpf.confianca = "baixa"; n.avisos.push("CPF lido nao passa na conferencia dos digitos verificadores: confira com o documento."); }
  }

  if (tipo === "crlv") {
    c.placa.valor = c.placa.valor ? alfa(c.placa.valor) : null;
    if (c.placa.valor !== null && !placaValida(c.placa.valor)) { c.placa.confianca = "baixa"; n.avisos.push(`Placa lida (${c.placa.valor}) nao tem formato valido: confira.`); }
    if (c.renavam.valor !== null) { const r = so(c.renavam.valor); c.renavam.valor = r || null; if (!r) c.renavam.confianca = "baixa"; }
    if (c.chassi.valor !== null) c.chassi.valor = alfa(c.chassi.valor) || null;
    if (c.uf.valor !== null) { const u = String(c.uf.valor).trim().toUpperCase().slice(0, 2); c.uf.valor = /^[A-Z]{2}$/.test(u) ? u : null; }
    for (const campo of ["tara", "capacidade_carga", "pbt", "cmt"] as const) {
      const r = pesoDeDocumento(c[campo].valor);
      c[campo].valor = r.kg;
      c[campo].motivo_nulo = r.kg === null ? (c[campo].motivo_nulo ?? r.motivoNulo ?? null) : null;
      if (r.kg === null) c[campo].confianca = "baixa";
      if (r.convertidoDeTonelada) { c[campo].observacao = r.aviso; n.avisos.push(`${campo}: ${r.aviso} (confirme antes de gravar)`); }
    }
    // CRLV digital nao traz tara: se vier "tara" igual ao PBT, e erro (PBT nunca e tara)
    if (c.tara.valor !== null && c.tara.valor === c.pbt.valor) {
      c.tara.valor = null; c.tara.motivo_nulo = "tara igual ao PBT: o CRLV nao traz tara; informe em kg"; c.tara.confianca = "baixa";
    }
    const reb = eReboquePorTipoCrlv(c.especie_tipo.valor as string | null);
    if (reb !== null) n.deducoes.e_reboque = { valor: reb, confianca: "alta", origem: "especie do CRLV" };
    // Nivel 2 (so carreta): PBT - capacidade
    if (reb === true && c.tara.valor === null) {
      const d = derivarTaraCarreta({ pbt_kg: c.pbt.valor as number | null, capacidade_kg: c.capacidade_carga.valor as number | null });
      if (d !== null) n.deducoes.tara_derivada_crlv = { valor: d, confianca: "media", origem: "derivada_crlv: PBT menos capacidade (confirme)" };
      else if (c.pbt.valor !== null && c.pbt.valor === c.capacidade_carga.valor) n.avisos.push("Capacidade igual ao PBT: nao deriva tara; informe a tara em kg ou use a aproximada.");
    }
    if (reb === false && c.pbt.valor !== null) n.avisos.push("PBT do cavalo e do cavalo sozinho; nao e a tara.");
    const doc = alfa(c.cpf_cnpj_proprietario.valor);
    c.cpf_cnpj_proprietario.valor = doc || null;
  }

  if (tipo === "cnh") {
    c.cpf.valor = c.cpf.valor ? so(c.cpf.valor) : null;
    const nasc = c.data_nascimento.valor as string | null;
    if (nasc) n.deducoes.idade = { valor: idadeEm(nasc, hoje), confianca: "alta", origem: "data de nascimento" };
    const val = c.validade.valor as string | null;
    if (val && diasEntre(hoje, val) < 0) n.avisos.push("CNH vencida.");
    if (nasc && idadeEm(nasc, hoje) < 18) n.avisos.push("Motorista menor de 18 anos.");
    const g = sugerirGenero(c.nome.valor as string | null, c.sexo.valor as string | null);
    if (g) n.deducoes.genero = g;
  }
  if (tipo === "rg" || tipo === "cpf") {
    if (c.cpf.valor) c.cpf.valor = so(c.cpf.valor);
    const nasc = c.data_nascimento.valor as string | null;
    if (nasc) n.deducoes.idade = { valor: idadeEm(nasc, hoje), confianca: "alta", origem: "data de nascimento" };
    const g = sugerirGenero(c.nome.valor as string | null);
    if (g) n.deducoes.genero = g;
  }
  if (tipo === "comprovante_residencia") {
    if (c.cep.valor) c.cep.valor = so(c.cep.valor);
    const em = c.data_emissao.valor as string | null;
    if (em && diasEntre(em, hoje) > 90) n.avisos.push(`Comprovante emitido ha ${diasEntre(em, hoje)} dias (mais de 90): peca um mais novo.`);
    if ((!c.cidade.valor || !c.uf.valor) && c.cep.valor) n.deducoes.cidade_uf_pelo_cep = { valor: String(c.cep.valor), confianca: "media", origem: "completar cidade e UF pelo CEP (consulta no cadastro)" };
  }
  if (tipo === "contrato_ciot_repom") {
    const ciot = so(c.ciot.valor);
    if (ciot.length === 16) {
      c.ciot.valor = ciot.slice(0, 12);
      n.deducoes.ciot_verificador = { valor: ciot.slice(12), confianca: "alta", origem: "4 ultimos digitos do CIOT de 16" };
      c.ciot.observacao = `16 digitos separados em 12 + 4 (${ciot.slice(12)})`;
    } else if (ciot.length === 12) c.ciot.valor = ciot;
    else if (ciot) { n.avisos.push("CIOT com tamanho diferente de 12 ou 16 digitos."); c.ciot.confianca = "baixa"; }
    for (const k of ["valor_frete", "adiantamento", "saldo"] as const) { const v = paraNumeroBR(c[k].valor); c[k].valor = v; if (v === null) c[k].confianca = "baixa"; }
    if (c.placa.valor) c.placa.valor = alfa(c.placa.valor);
    if (c.cpf_cnpj_prestador.valor) c.cpf_cnpj_prestador.valor = alfa(c.cpf_cnpj_prestador.valor);
  }
  if (tipo === "vpr_vale_pedagio") {
    const id = so(c.idvpo.valor);
    c.idvpo.valor = id || null;
    if (id && id.length !== 20) { n.avisos.push("IDVPO deve ter 20 digitos."); c.idvpo.confianca = "baixa"; }
    const v = paraNumeroBR(c.valor_total.valor); c.valor_total.valor = v; if (v === null) c.valor_total.confianca = "baixa";
    if (c.placa.valor) c.placa.valor = alfa(c.placa.valor);
    // categoria de combinacao do VPO: 2 digitos da lista valida ("7" -> "07"); fora da lista nao entra
    if (c.categoria.valor !== null) {
      const cat = normalizarCategoria(c.categoria.valor as string | number);
      if (cat === null) { n.avisos.push(`Categoria "${String(c.categoria.valor)}" fora da lista valida: escolha na tela.`); c.categoria.valor = null; c.categoria.confianca = "baixa"; c.categoria.motivo_nulo = "categoria fora da lista valida"; }
      else c.categoria.valor = cat;
    }
  }
  if (tipo === "rntrc" && c.numero.valor) c.numero.valor = so(c.numero.valor);
  return n;
}

/** Conferencia cruzada: nome e CPF iguais entre documentos; devolve os campos divergentes. */
export function conferenciaCruzada(docs: Normalizado[]): string[] {
  const out: string[] = [];
  const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const nomes = docs.map((d) => ({ t: d.tipo, v: norm(d.campos.nome?.valor ?? d.campos.titular?.valor) })).filter((x) => x.v);
  if (new Set(nomes.map((x) => x.v)).size > 1) out.push(`Nome diferente entre documentos: ${nomes.map((x) => x.t).join(", ")}.`);
  const cpfs = docs.map((d) => ({ t: d.tipo, v: so(d.campos.cpf?.valor) })).filter((x) => x.v);
  if (new Set(cpfs.map((x) => x.v)).size > 1) out.push(`CPF diferente entre documentos: ${cpfs.map((x) => x.t).join(", ")}.`);
  const cr = docs.find((d) => d.tipo === "comprovante_residencia");
  const ref = nomes.find((x) => x.t !== "comprovante_residencia");
  if (cr && ref && norm(cr.campos.nome_titular.valor) && norm(cr.campos.nome_titular.valor) !== ref.v) out.push("Comprovante de residencia em nome de outra pessoa (titular diferente do motorista): confirme.");
  return out;
}
