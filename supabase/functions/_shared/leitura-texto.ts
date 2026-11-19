// Leitura SEM IA dos PDFs gerados por sistema (19/11/2026): o Gemini gratuito devolve 503 com frequencia.
// PDF da Repom (VPR e contrato/CIOT) tem camada de texto: extrai o texto e acha os campos por rotulo.
// Devolve o MESMO formato cru que a IA devolveria ({campo: {valor, confianca, trecho}}), entao normalizarExtracao segue igual.
// Parte pura (sem rede) testavel; textoDoPdf usa npm:unpdf.

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

/** Classifica pelo texto. null = nao reconheceu (deixa para a IA). */
export function classificarPorTexto(texto: string): "vpr_vale_pedagio" | "contrato_ciot_repom" | null {
  const t = texto.replace(/\s+/g, " ");
  if (/Vale Ped[aá]gio Repom|Comprovante de Entrega de Vales Ped[aá]gio/i.test(t) && /IdVpo/i.test(t)) return "vpr_vale_pedagio";
  if (/Contrato de Transporte de Carga/i.test(t) && /CIOT/i.test(t)) return "contrato_ciot_repom";
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

/** Tenta ler sem IA. Devolve {tipo, bruto} ou null (segue para a IA). tipoPedido = tipo escolhido na tela (opcional). */
export async function lerSemIa(bytes: Uint8Array, mime: string, tipoPedido: string | null): Promise<{ tipo: string; bruto: Bruto } | null> {
  if (!/pdf/i.test(mime)) return null;
  const texto = await textoDoPdf(bytes);
  if (texto.replace(/\s/g, "").length < 80) return null; // scan/foto: sem texto
  const tipo = (tipoPedido === "vpr_vale_pedagio" || tipoPedido === "contrato_ciot_repom") ? tipoPedido : classificarPorTexto(texto);
  if (tipo === "vpr_vale_pedagio") { const b = lerVpr(texto); return b ? { tipo, bruto: b } : null; }
  if (tipo === "contrato_ciot_repom") { const b = lerContratoRepom(texto); return b ? { tipo, bruto: b } : null; }
  return null;
}
