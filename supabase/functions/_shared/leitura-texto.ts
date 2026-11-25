// Leitura SEM IA dos PDFs gerados por sistema (19/11/2026): o Gemini gratuito devolve 503 com frequencia.
// PDF da Repom (VPR e contrato/CIOT) tem camada de texto: extrai o texto e acha os campos por rotulo.
// Devolve o MESMO formato cru que a IA devolveria ({campo: {valor, confianca, trecho}}), entao normalizarExtracao segue igual.
// Parte pura (sem rede) testavel; textoDoPdf usa npm:unpdf.

import { cpfValido, cnpjValido, placaValida } from "./validacoes-cadastro.ts";

type Campo = { valor: string | number | null; confianca: "alta" | "media" | "baixa"; trecho: string | null; motivo_nulo?: string | null };
export type Bruto = Record<string, Campo | boolean | null>;

export async function textoDoPdf(bytes: Uint8Array): Promise<string> {
  try {
    const { extractText, getDocumentProxy } = await import("npm:unpdf@1.9.1");
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    return typeof text === "string" ? text : String(text ?? "");
  } catch (_e) {
    return "";
  }
}

const achar = (texto: string, re: RegExp): { v: string | null; trecho: string | null } => {
  const m = texto.match(re);
  return m ? { v: m[1], trecho: m[0].slice(0, 120) } : { v: null, trecho: null };
};
const campo = (r: { v: string | number | null; trecho: string | null }, motivo = "nao encontrado no texto do PDF"): Campo =>
  r.v === null || r.v === "" ? { valor: null, confianca: "baixa", trecho: null, motivo_nulo: motivo } : { valor: r.v, confianca: "alta", trecho: r.trecho };

export type TipoPorTexto = "vpr_vale_pedagio" | "contrato_ciot_repom" | "crlv" | "cnh" | "rntrc";

/** Classifica pelo texto. null = nao reconheceu (segue para a fila/IA). */
export function classificarPorTexto(texto: string): TipoPorTexto | null {
  const t = texto.replace(/\s+/g, " ");
  if (/Vale Ped[aá]gio Repom|Comprovante de Entrega de Vales Ped[aá]gio/i.test(t) && /IdVpo/i.test(t)) return "vpr_vale_pedagio";
  if (/Contrato de Transporte de Carga/i.test(t) && /CIOT/i.test(t)) return "contrato_ciot_repom";
  if (/CRLV|CERTIFICADO DE REGISTRO E LICENCIAMENTO DE VE[IÍ]CULO/i.test(t) && /RENAVAM/i.test(t)) return "crlv";
  if (/CARTEIRA NACIONAL DE HABILITA[CÇ][AÃ]O|CNH|CARTEIRA DIGITAL DE TR[AÂ]NSITO/i.test(t) && /(REGISTRO|CAT\.? ?HAB|HABILITA[CÇ][AÃ]O)/i.test(t)) return "cnh";
  if (/RNTRC|REGISTRO NACIONAL DE TRANSPORTADORES RODOVI[AÁ]RIOS DE CARGAS/i.test(t)) return "rntrc";
  return null;
}

export function lerVpr(texto: string): Bruto | null {
  const t = texto.replace(/[ \t]+/g, " ");
  const idvpo = achar(t, /IdVpo:\s*(\d{20})/i);
  const total = achar(t, /\bTotal:\s*(\d[\d.,]*\d)/);
  if (!idvpo.v || !total.v) return null; // sem os dois principais, deixa para a IA
  const eixos = achar(t, /Total Eixos:\s*(\d{1,2})/i);
  const viagem = achar(t, /\bViagem:\s*0*(\d+)/);
  const placa = achar(t, /Placa Ve[ií]culo:\s*([A-Z]{3}-?\d[A-Z0-9]\d{2})/i);
  const pracas = (t.match(/\bVPR\d+\s*-/g) ?? []).length;
  return {
    idvpo: campo(idvpo),
    numero_viagem: campo(viagem),
    valor_total: campo(total),
    quantidade_eixos: campo({ v: eixos.v ? Number(eixos.v) : null, trecho: eixos.trecho }),
    numero_pracas: campo({ v: pracas || null, trecho: pracas ? `${pracas} pracas (VPR1..VPR${pracas})` : null }),
    categoria: { valor: null, confianca: "baixa", trecho: null, motivo_nulo: "o VPR nao traz a categoria; o sistema calcula pelos eixos" },
    placa: campo(placa),
    legivel: true,
    suspeita_fraude: null,
  };
}

export function lerContratoRepom(texto: string): Bruto | null {
  const t = texto.replace(/[ \t]+/g, " ");
  const ciotM = t.match(/CIOT:\s*(\d{12})(\d{4}|X{4})?/i);
  const frete = achar(t, /Frete Inicial:[^\d\n]{0,20}([\d.]+,\d{2})/i);
  if (!ciotM || !frete.v) return null;
  const ciot = ciotM[1] + (ciotM[2] && /^\d{4}$/.test(ciotM[2]) ? ciotM[2] : "");
  const adiant = achar(t, /\bAdiantamento:[^\d\n]{0,20}([\d.]+,\d{2})/i);
  const saldo = achar(t, /Valor l[ií]quido do frete:[^\d\n]{0,20}([\d.]+,\d{2})/i);
  const contrato = achar(t, /C[oó]digo Contrato:\s*(\d+)/i);
  const viagem = achar(t, /C[oó]digo Viagem:\s*(\d+)/i);
  const placa = achar(t, /Placa Ve[ií]culo:\s*([A-Z]{3}-?\d[A-Z0-9]\d{2})/i);
  const prest = achar(t, /CNPJ\/CPF Prestador:\s*([\d./-]{11,18})/i);
  const data = achar(t, /Data de Emiss[aã]o:\s*(\d{2}\/\d{2}\/\d{4})/i);
  return {
    ciot: { valor: ciot, confianca: "alta", trecho: ciotM[0].slice(0, 60), motivo_nulo: null },
    numero_contrato: campo(contrato),
    numero_viagem: campo(viagem),
    valor_frete: campo(frete),
    adiantamento: campo(adiant),
    saldo: campo(saldo),
    placa: campo(placa),
    cpf_cnpj_prestador: campo(prest),
    data_emissao: campo(data),
    legivel: true,
    suspeita_fraude: null,
  };
}


// ---------------------------------------------------------------------------------------------------------------------
// 25/11/2026: CNH digital, CRLV-e e RNTRC lidos pelo texto do PDF (sem IA). Os rotulos mudam de lugar conforme o gerador do PDF
// (valor ao lado do rotulo ou linha de rotulos seguida da linha de valores); por isso os valores sao achados pelo FORMATO
// (CPF valido, placa, chassi de 17, datas) e a data e atribuida ao rotulo pela posicao. Nada e inventado: sem certeza = null.
// ---------------------------------------------------------------------------------------------------------------------

const ISO = (d: string, m: string, a: string) => `${a}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const nulo = (motivo = "nao encontrado no texto do PDF"): Campo => ({ valor: null, confianca: "baixa", trecho: null, motivo_nulo: motivo });
const ok = (valor: string | number, trecho: string, confianca: "alta" | "media" = "alta"): Campo => ({ valor, confianca, trecho: trecho.replace(/\s+/g, " ").slice(0, 80), motivo_nulo: null });

/** Texto sem acento e em maiusculas (para achar rotulos); as quebras de linha ficam. */
const prep = (texto: string) => semAcento(texto).toUpperCase().replace(/[ \t\u00a0]+/g, " ");

/** Datas DD/MM/AAAA do texto com a posicao. */
function datasDoTexto(t: string): { iso: string; pos: number; raw: string }[] {
  const out: { iso: string; pos: number; raw: string }[] = [];
  for (const m of t.matchAll(/\b(\d{2})[/.](\d{2})[/.](\d{4})\b/g)) {
    const [d, mo] = [Number(m[1]), Number(m[2])];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) continue;
    out.push({ iso: ISO(m[1], m[2], m[3]), pos: m.index ?? 0, raw: m[0] });
  }
  return out;
}

/**
 * Liga cada rotulo (na ordem em que aparecem) a uma data. Layout 1: a data vem logo depois do rotulo, antes do proximo rotulo.
 * Layout 2: linha de rotulos e depois linha de datas, na mesma ordem (so quando a quantidade de datas bate com a de rotulos).
 */
function datasPorRotulo(t: string, rotulos: Record<string, RegExp>): Record<string, { iso: string; raw: string } | null> {
  const achados: { chave: string; pos: number; fim: number }[] = [];
  for (const [chave, re] of Object.entries(rotulos)) {
    const m = new RegExp(re.source).exec(t);
    if (m) achados.push({ chave, pos: m.index, fim: m.index + m[0].length });
  }
  achados.sort((a, b) => a.pos - b.pos);
  const datas = datasDoTexto(t);
  const out: Record<string, { iso: string; raw: string } | null> = {};
  for (const k of Object.keys(rotulos)) out[k] = null;
  const usadas = new Set<number>();
  achados.forEach((a, i) => {
    const limite = i + 1 < achados.length ? achados[i + 1].pos : a.fim + 60;
    const idx = datas.findIndex((d, j) => !usadas.has(j) && d.pos >= a.fim && d.pos < Math.min(limite, a.fim + 60));
    if (idx >= 0) { out[a.chave] = { iso: datas[idx].iso, raw: datas[idx].raw }; usadas.add(idx); }
  });
  if (!achados.length || achados.every((a) => out[a.chave])) return out;
  // layout 2 (rotulos juntos, depois valores): so se a ordem e inequivoca (mesma quantidade de datas e de rotulos)
  const depois = datas.filter((d) => d.pos >= achados[0].fim);
  if (depois.length === achados.length) {
    achados.forEach((a, i) => { out[a.chave] = { iso: depois[i].iso, raw: depois[i].raw }; });
    return out;
  }
  // ambiguo: so fica a data colada no rotulo (ate 30 caracteres); o resto vira null (a pessoa digita) em vez de chute
  for (const a of achados) {
    const o = out[a.chave];
    const d = o ? datas.find((x) => x.raw === o.raw) : null;
    if (!d || d.pos - a.fim > 30) out[a.chave] = null;
  }
  return out;
}

/** CPFs validos do texto. formatado=true exige pontos e traco: o numero de registro da CNH (11 digitos) pode "passar" como CPF por acaso. */
const cpfsDoTexto = (t: string, formatado = false): string[] =>
  [...t.matchAll(formatado ? /\b(\d{3}\.\d{3}\.\d{3}-\d{2})\b/g : /\b(\d{3}\.?\d{3}\.?\d{3}-?\d{2})\b/g)].map((m) => m[1].replace(/\D/g, "")).filter((c) => cpfValido(c));
const cnpjsDoTexto = (t: string): string[] => [...t.matchAll(/\b(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b/g)].map((m) => m[1].replace(/\D/g, "")).filter((c) => cnpjValido(c));

/** Nome em maiusculas logo depois do rotulo (mesma linha ou linha seguinte). Confianca media: a pessoa confere sempre. */
function nomeApos(t: string, rotulo: RegExp, parar: RegExp): string | null {
  const m = new RegExp(rotulo.source).exec(t);
  if (!m) return null;
  const resto = t.slice(m.index + m[0].length, m.index + m[0].length + 160).replace(/^[\s:/-]+/, "");
  const linha = resto.split(/\n/)[0] ?? "";
  const corte = linha.search(parar);
  const cand = (corte >= 0 ? linha.slice(0, corte) : linha).trim();
  return /^[A-Z][A-Z' .]{3,60}$/.test(cand) && cand.split(" ").filter((p) => p.length > 1).length >= 2 ? cand : null;
}

function proximoValor(t: string, rotulo: RegExp, padrao: RegExp, janela = 80): RegExpExecArray | null {
  const m = new RegExp(rotulo.source).exec(t);
  if (!m) return null;
  const ini = m.index + m[0].length;
  return new RegExp(padrao.source, padrao.flags.replace("g", "")).exec(t.slice(ini, ini + janela));
}

// ---- CNH digital ----
export function lerCnh(texto: string): Bruto | null {
  const t = prep(texto);
  const cpfs = cpfsDoTexto(t, true);
  const reg = /N[O°º]?\.? ?REGISTRO[^\d]{0,25}(\d{11})\b/.exec(t) ?? /\bREGISTRO[^\d]{0,25}(\d{11})\b/.exec(t);
  const cat = /CAT(?:EGORIA)?\.? ?(?:DE )?HAB\.?[^A-E]{0,25}\b(AB|AC|AD|AE|A|B|C|D|E)\b/.exec(t) ?? /\bCATEGORIA\b[^A-E]{0,20}\b(AB|AC|AD|AE|A|B|C|D|E)\b/.exec(t);
  const d = datasPorRotulo(t, {
    nascimento: /\bDATA (?:DE )?NASC(?:IMENTO)?\b|\bNASCIMENTO\b/,
    primeira: /\b1[ªAO°º]?\.? ?HABILITA[CÇ][AÃ]O\b|\bPRIMEIRA HABILITA[CÇ][AÃ]O\b|\b1A HAB\b/,
    validade: /\bVALIDADE\b/,
  });
  const nome = nomeApos(t, /\bNOME(?: E SOBRENOME)?\b/, /\b(?:DOC|CPF|DATA|FILIA|IDENTIDADE|NASC)/);
  const mCpf = /\bCPF\b/.exec(t);
  const janelaCpf = mCpf ? t.slice(mCpf.index, mCpf.index + 60).split(/REGISTRO/)[0] : "";
  const cpfRot = mCpf ? (cpfsDoTexto(janelaCpf, true)[0] ?? cpfsDoTexto(janelaCpf)[0] ?? null) : null;
  const cpf = cpfRot ?? (cpfs.length === 1 ? cpfs[0] : null);
  const out: Bruto = {
    nome: nome ? ok(nome, nome, "media") : nulo(),
    cpf: cpf ? ok(cpf, cpf.slice(0, 3) + "...", cpfRot ? "alta" : "media") : nulo("CPF nao encontrado ou ambiguo no texto do PDF"),
    numero_registro: reg ? ok(reg[1], "REGISTRO ***") : nulo(),
    categoria: cat ? ok(cat[1], `CAT. HAB. ${cat[1]}`) : nulo(),
    validade: d.validade ? ok(d.validade.iso, `VALIDADE ${d.validade.raw}`) : nulo(),
    data_nascimento: d.nascimento ? ok(d.nascimento.iso, `NASCIMENTO ${d.nascimento.raw}`) : nulo(),
    primeira_habilitacao: d.primeira ? ok(d.primeira.iso, `1a HABILITACAO ${d.primeira.raw}`) : nulo("1a habilitacao nao consta no documento"),
    sexo: nulo("o documento digital nao traz o campo sexo"),
    legivel: true,
    suspeita_fraude: null,
  };
  const principais = ["nome", "cpf", "numero_registro", "categoria", "validade"] as const;
  return principais.some((k) => (out[k] as Campo).valor !== null) ? out : null;
}

// ---- CRLV-e ----
const UFS = new Set("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" "));

export function lerCrlv(texto: string): Bruto | null {
  const t = prep(texto);
  const placas = [...t.matchAll(/\b([A-Z]{3}-?\d[A-Z0-9]\d{2})\b/g)].map((m) => m[1].replace("-", "")).filter((p) => placaValida(p));
  const placaRot = proximoValor(t, /\bPLACA\b(?! ANTERIOR)/, /\b([A-Z]{3}-?\d[A-Z0-9]\d{2})\b/);
  const placa = placaRot && placaValida(placaRot[1].replace("-", "")) ? placaRot[1].replace("-", "") : (placas[0] ?? null);
  const ren = proximoValor(t, /\bRENAVAM\b/, /\b(\d{9,11})\b/, 60);
  const chM = /\b([A-HJ-NPR-Z0-9]{17})\b/.exec(t);
  const chassi = chM && /\d/.test(chM[1]) && /[A-Z]/.test(chM[1]) ? chM[1] : null;
  const exer = proximoValor(t, /\bEXERCICIO\b/, /\b(20\d{2})\b/, 40);
  // ano fabricacao / modelo: "ANO FABRICACAO 2015 ANO MODELO 2016" ou rotulos juntos e depois "2015 2016"
  let anoFab: string | null = null, anoMod: string | null = null;
  const mF = /\bANO (?:DE )?FABRICA[CÇ][AÃ]O\b/.exec(t), mM = /\bANO (?:DO )?MODELO\b/.exec(t);
  if (mF && mM) {
    const fabPrimeiro = mF.index < mM.index;
    const [p, s] = fabPrimeiro ? [mF, mM] : [mM, mF];
    const entre = t.slice(p.index + p[0].length, s.index);
    const anoEntre = /\b((?:19|20)\d{2})\b/.exec(entre);
    const aposS = t.slice(s.index + s[0].length, s.index + s[0].length + 60);
    const anos = [...aposS.matchAll(/\b((?:19|20)\d{2})\b/g)].map((x) => x[1]);
    if (anoEntre && anos[0]) { if (fabPrimeiro) { anoFab = anoEntre[1]; anoMod = anos[0]; } else { anoMod = anoEntre[1]; anoFab = anos[0]; } }
    else if (!anoEntre && anos.length >= 2) { if (fabPrimeiro) { anoFab = anos[0]; anoMod = anos[1]; } else { anoMod = anos[0]; anoFab = anos[1]; } }
  }
  const tipoM = /\bESPECIE ?\/ ?TIPO\b[: ]*\n?\s*([A-Z][A-Z /-]{3,40}?)(?=\s*(?:\n|CARROCERIA|COMBUSTIVEL|CAT\b|COR\b|$))/.exec(t);
  const carM = /\bCARROCERIA\b[: ]*\n?\s*([A-Z][A-Z /-]{2,40}?)(?=\s*(?:\n|COMBUSTIVEL|CAT\b|COR\b|CAPACIDADE|$))/.exec(t);
  const marcaM = /\bMARCA ?\/ ?MODELO(?: ?\/ ?VERSAO)?\b[: ]*\n?\s*([A-Z0-9][A-Z0-9 /.-]{3,60}?)(?=\s*(?:\n|ESPECIE|CHASSI|CARROCERIA|$))/.exec(t);
  const nomeProp = nomeApos(t, /\bNOME\b/, /\b(?:CPF|CNPJ|LOCAL|DATA|ASSINADO)/);
  const docRot = proximoValor(t, /\bCPF ?\/ ?CNPJ\b/, /\b(\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b/, 40);
  let doc: string | null = docRot ? docRot[1].replace(/\D/g, "") : null;
  if (doc && !(cpfValido(doc) || cnpjValido(doc))) doc = null;
  if (!doc) { const unicos = [...new Set([...cnpjsDoTexto(t), ...cpfsDoTexto(t)])]; doc = unicos.length === 1 ? unicos[0] : null; }
  const loc = /\bLOCAL\b[: ]*\n?\s*[A-Z .'-]{2,40}?\s+([A-Z]{2})\b/.exec(t);
  const ufProp = loc && UFS.has(loc[1]) ? loc[1] : null;
  const pbt = proximoValor(t, /\bPESO BRUTO TOTAL\b/, /\b(\d{1,3}(?:[.,]\d{1,3})?)\b/, 40);
  const cap = proximoValor(t, /\bCAPACIDADE(?: DE CARGA)?\b/, /\b(\d{1,3}(?:[.,]\d{1,3})?)\b/, 40);
  const cmt = proximoValor(t, /\bCMT\b/, /\b(\d{1,3}(?:[.,]\d{1,3})?)\b/, 30);
  const eixos = proximoValor(t, /\bEIXOS\b/, /\b(\d{1,2})\b/, 20);
  const out: Bruto = {
    placa: placa ? ok(placa, `PLACA ${placa}`) : nulo(),
    renavam: ren ? ok(ren[1], "RENAVAM ***") : nulo(),
    chassi: chassi ? ok(chassi, "CHASSI " + chassi.slice(0, 5) + "...") : nulo(),
    ano_fabricacao: anoFab ? ok(Number(anoFab), `ANO FABRICACAO ${anoFab}`) : nulo(),
    ano_modelo: anoMod ? ok(Number(anoMod), `ANO MODELO ${anoMod}`) : nulo(),
    marca_modelo: marcaM ? ok(marcaM[1].trim(), marcaM[1].trim(), "media") : nulo(),
    especie_tipo: tipoM ? ok(tipoM[1].trim(), tipoM[1].trim(), "media") : nulo(),
    carroceria: carM ? ok(carM[1].trim(), carM[1].trim(), "media") : nulo(),
    quantidade_eixos: eixos ? ok(Number(eixos[1]), `EIXOS ${eixos[1]}`, "media") : nulo(),
    tara: nulo("o CRLV digital nao traz tara"),
    capacidade_carga: cap ? ok(cap[1], `CAPACIDADE ${cap[1]}`, "media") : nulo(),
    pbt: pbt ? ok(pbt[1], `PBT ${pbt[1]}`, "media") : nulo(),
    cmt: cmt ? ok(cmt[1], `CMT ${cmt[1]}`, "media") : nulo(),
    uf: ufProp ? ok(ufProp, `LOCAL ${ufProp}`, "media") : nulo(),
    exercicio: exer ? ok(Number(exer[1]), `EXERCICIO ${exer[1]}`) : nulo(),
    nome_proprietario: nomeProp ? ok(nomeProp, nomeProp, "media") : nulo(),
    cpf_cnpj_proprietario: doc ? ok(doc, doc.slice(0, 3) + "...") : nulo("CPF/CNPJ do proprietario nao encontrado ou ambiguo"),
    observacoes: nulo("sem observacoes lidas"),
    legivel: true,
    suspeita_fraude: null,
  };
  return placa || ren || chassi ? out : null;
}

// ---- RNTRC / ANTT ----
export function lerRntrc(texto: string): Bruto | null {
  const t = prep(texto);
  const num = /\bRNTRC\b[^\d\n]{0,25}(\d{8,9})\b/.exec(t) ?? /\bNUMERO\b[^\d\n]{0,20}(\d{8,9})\b/.exec(t);
  const tipo = /\b(TAC|ETC|CTC)\b/.exec(t);
  const sit = /\bSITUACAO\b[: ]*\n?\s*(ATIVO|ATIVA|INATIVO|INATIVA|VENCIDO|VENCIDA|SUSPENSO|SUSPENSA|CANCELADO|CANCELADA|BLOQUEADO|EM ANALISE|REGULAR|IRREGULAR)\b/.exec(t)
    ?? /\b(ATIVO|INATIVO|VENCIDO|SUSPENSO|CANCELADO|BLOQUEADO)\b/.exec(t);
  const d = datasPorRotulo(t, { validade: /\b(?:VALIDADE|VALIDO ATE|VENCIMENTO|VENCE EM)\b/ });
  const titular = nomeApos(t, /\b(?:TRANSPORTADOR|TITULAR|RAZAO SOCIAL|NOME)\b/, /\b(?:CPF|CNPJ|RNTRC|TIPO|SITUACAO|REGISTRO)/);
  const out: Bruto = {
    numero: num ? ok(num[1], `RNTRC ${num[1]}`) : nulo(),
    titular: titular ? ok(titular, titular, "media") : nulo(),
    tipo_transportador: tipo ? ok(tipo[1], tipo[1]) : nulo("tipo (TAC/ETC/CTC) nao encontrado"),
    situacao: sit ? ok(sit[1].toLowerCase(), sit[1]) : nulo(),
    validade: d.validade ? ok(d.validade.iso, `VALIDADE ${d.validade.raw}`) : nulo(),
    legivel: true,
    suspeita_fraude: null,
  };
  return num ? out : null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Orquestracao
// ---------------------------------------------------------------------------------------------------------------------

/** Campos sem os quais o cadastro nao segue: faltando algum, a leitura e PARCIAL (vai para a fila da IA gratuita). */
export const OBRIGATORIOS_TEXTO: Record<string, string[]> = {
  cnh: ["nome", "cpf", "numero_registro", "categoria", "validade", "data_nascimento"],
  crlv: ["placa", "renavam", "chassi", "especie_tipo", "cpf_cnpj_proprietario"],
  rntrc: ["numero", "titular", "validade"],
  vpr_vale_pedagio: ["idvpo", "valor_total"],
  contrato_ciot_repom: ["ciot", "valor_frete"],
};

export function camposFaltantes(tipo: string, bruto: Bruto | null): string[] {
  return (OBRIGATORIOS_TEXTO[tipo] ?? []).filter((k) => !bruto || ((bruto[k] as Campo | undefined)?.valor ?? null) === null);
}

export function lerPorTipo(tipo: string, texto: string): Bruto | null {
  switch (tipo) {
    case "vpr_vale_pedagio": return lerVpr(texto);
    case "contrato_ciot_repom": return lerContratoRepom(texto);
    case "cnh": return lerCnh(texto);
    case "crlv": return lerCrlv(texto);
    case "rntrc": return lerRntrc(texto);
    default: return null;
  }
}

/** XML (quando existir): vira linhas de texto, que os mesmos parsers por rotulo entendem. */
export function textoDoXml(bytes: Uint8Array): string {
  const s = new TextDecoder("utf-8").decode(bytes);
  return s.replace(/<\?xml[^>]*\?>/g, "").replace(/<\/?[A-Za-z0-9_:.-]+[^>]*>/g, "\n").replace(/&amp;/g, "&").replace(/\n\s*\n+/g, "\n");
}

export interface LeituraSemIa {
  /** texto extraido (a IA gratuita le TEXTO em vez de imagem: mais rapido e mais provedores servem) */
  texto: string;
  /** tipo (pedido na tela ou reconhecido pelo texto); null = nao reconhecido */
  tipo: string | null;
  tipoAutomatico: boolean;
  bruto: Bruto | null;
  faltantes: string[];
  /** true = todos os campos obrigatorios do tipo vieram do texto: nao precisa de IA */
  completo: boolean;
}

/**
 * Le sem IA. null = arquivo sem texto (foto/scan): so a IA le. PDF/XML com texto: devolve o que o parser achou (completo ou parcial).
 * tipoPedido = tipo escolhido na tela (opcional). Sem tipo, classifica pelo texto.
 */
export async function lerSemIa(bytes: Uint8Array, mime: string, tipoPedido: string | null): Promise<LeituraSemIa | null> {
  let texto = "";
  if (/pdf/i.test(mime)) texto = await textoDoPdf(bytes);
  else if (/xml/i.test(mime)) texto = textoDoXml(bytes);
  else return null;
  if (texto.replace(/\s/g, "").length < 80) return null; // scan/foto: sem texto
  const pedido = tipoPedido && tipoPedido in OBRIGATORIOS_TEXTO ? tipoPedido : null;
  const tipo = pedido ?? classificarPorTexto(texto);
  if (!tipo) return { texto, tipo: tipoPedido && tipoPedido !== "outro" ? tipoPedido : null, tipoAutomatico: false, bruto: null, faltantes: [], completo: false };
  const bruto = lerPorTipo(tipo, texto);
  const faltantes = camposFaltantes(tipo, bruto);
  return { texto, tipo, tipoAutomatico: !pedido, bruto, faltantes, completo: !!bruto && faltantes.length === 0 };
}
