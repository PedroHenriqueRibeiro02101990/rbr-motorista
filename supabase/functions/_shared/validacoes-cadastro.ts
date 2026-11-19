// Validacoes do cadastro por documentos (Parte A, etapa 3). Cada regra devolve bloqueio, aviso ou ok com mensagem em portugues.
// Sem dependencias (roda no navegador e na funcao). Teste: node --test supabase/functions/_shared/validacoes-cadastro.test.ts
import { classeDoVeiculo, type VeiculoTara } from "./tara-aproximada.ts";

export type Nivel = "ok" | "aviso" | "bloqueio";
export interface Achado { nivel: Nivel; campo: string; mensagem: string }
const ok = (campo: string, mensagem = "ok"): Achado => ({ nivel: "ok", campo, mensagem });
const aviso = (campo: string, mensagem: string): Achado => ({ nivel: "aviso", campo, mensagem });
const bloqueio = (campo: string, mensagem: string): Achado => ({ nivel: "bloqueio", campo, mensagem });

const dig = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const alfa = (s: unknown) => String(s ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function placaValida(p: unknown): boolean {
  const t = alfa(p);
  return /^[A-Z]{3}\d{4}$/.test(t) || /^[A-Z]{3}\d[A-Z]\d{2}$/.test(t);
}
export function cpfValido(v: unknown): boolean {
  const c = dig(v);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}
export function cnpjValido(v: unknown): boolean {
  const c = alfa(v);
  if (c.length !== 14 || !/^\d{2}$/.test(c.slice(12)) || /^(.)\1{13}$/.test(c)) return false;
  const val = (ch: string) => ch.charCodeAt(0) - 48; // 0-9 e A-Z (CNPJ alfanumerico)
  const dv = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let s = 0;
    for (let i = 0; i < n; i++) s += val(c[i]) * pesos[i];
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(c[12]) && dv(13) === Number(c[13]);
}
export function documentoValido(v: unknown): boolean {
  const d = alfa(v);
  return d.length === 11 ? cpfValido(d) : d.length === 14 ? cnpjValido(d) : false;
}

export interface VeiculoCadastro extends VeiculoTara {
  placa?: string | null;
  capacidade_carga?: number | string | null;
  pbt_kg?: number | string | null;
  tipo_crlv?: string | null;
  carreta_vinculada?: boolean;
}
const n = (x: unknown): number | null => {
  const v = typeof x === "string" ? Number(x.replace(",", ".")) : (x as number);
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};

export const MSG_TARA_KG = "Tara e em kg. Voce quis dizer 25.500?";

/** Especie do CRLV define e_reboque: semirreboque/reboque = true; caminhao trator = false; outros = null (nao decide). */
export function eReboquePorTipoCrlv(tipoCrlv: string | null | undefined): boolean | null {
  const t = semAcento(tipoCrlv ?? "");
  if (!t) return null;
  if (/reboque/.test(t)) return true;
  if (t.includes("trator")) return false;
  return null;
}

/** Tipo do veiculo (o que o emissor do MDF-e le em veiculos.tipo_veiculo) a partir da ESPECIE/TIPO do CRLV.
 *  Antes todo CRLV que nao era reboque virava "cavalo mecanico": um truck ou toco saia no MDF-e como cavalo e exigia carreta.
 *  Truck x toco so se decide pelos eixos (3+ = truck, 2 = toco); sem certeza devolve null (nao inventa). */
export function tipoVeiculoDoCrlv(especie: string | null | undefined, eixos: number | null | undefined): { tipo: string | null; inferido: boolean } {
  const t = semAcento(especie ?? "");
  if (!t) return { tipo: null, inferido: false };
  if (/reboque/.test(t)) return { tipo: "semirreboque", inferido: false };
  if (t.includes("trator")) return { tipo: "cavalo mecanico", inferido: false };
  if (/\bvan\b|micro-?onibus/.test(t)) return { tipo: "van", inferido: false };
  if (/utilitario|camioneta|camionete|furgao|automovel|caminhonete/.test(t)) return { tipo: "utilitario", inferido: false };
  if (/caminhao|carga/.test(t)) {
    if (typeof eixos === "number" && eixos >= 3) return { tipo: "truck", inferido: true };
    if (eixos === 2) return { tipo: "toco", inferido: true };
  }
  return { tipo: null, inferido: false };
}

export function validarTara(v: VeiculoCadastro): Achado[] {
  const classe = classeDoVeiculo({ ...v, e_reboque: v.e_reboque ?? eReboquePorTipoCrlv(v.tipo_crlv) });
  const tara = n(v.tara_kg);
  const out: Achado[] = [];
  if (tara === null) return [aviso("tara_kg", "Tara nao informada; o MDF-e usara a derivada do CRLV ou a aproximada, com aviso.")];
  const [min, max] = classe === "carreta" ? [2000, 20000] : [1000, 30000];
  if (!Number.isInteger(tara) || tara < min || tara > max) return [bloqueio("tara_kg", MSG_TARA_KG)];
  const pbt = n(v.pbt_kg);
  if (classe === "cavalo" && pbt !== null && tara === pbt) {
    out.push(bloqueio("tara_kg", "A tara do cavalo nao pode ser o PBT do CRLV (PBT e o peso maximo, nao a tara)."));
  }
  const eixos = n(v.quantidade_eixos);
  if (classe === "cavalo" && (tara < 6500 || tara > 11500)) out.push(aviso("tara_kg", "Tara do cavalo fora da faixa usual (6.500 a 11.500 kg). Confirme com a ficha ou pesagem."));
  if (classe === "carreta" && eixos === 3 && (tara < 5000 || tara > 10500)) out.push(aviso("tara_kg", "Tara da carreta de 3 eixos fora da faixa usual (5.000 a 10.500 kg). Confirme com a ficha ou pesagem."));
  if (!out.length) out.push(ok("tara_kg"));
  return out;
}

export function validarCapacidade(v: VeiculoCadastro): Achado[] {
  const tara = n(v.tara_kg), cap = n(v.capacidade_carga), pbt = n(v.pbt_kg);
  if (cap === null) return [ok("capacidade_carga", "sem capacidade informada")];
  if (!Number.isInteger(cap)) return [bloqueio("capacidade_carga", `Capacidade e em kg. Voce quis dizer ${Math.round(cap * 1000)}?`)];
  if (tara !== null && pbt !== null && pbt > tara) {
    const esperado = pbt - tara;
    if (Math.abs(cap - esperado) / esperado > 0.1) return [aviso("capacidade_carga", `Capacidade (${cap} kg) diverge de PBT menos tara (${esperado} kg) em mais de 10%.`)];
  }
  return [ok("capacidade_carga")];
}

export function validarEixos(v: VeiculoCadastro): Achado[] {
  const e = n(v.quantidade_eixos);
  if (e === null) return [aviso("quantidade_eixos", "Quantidade de eixos nao informada.")];
  const classe = classeDoVeiculo(v);
  if (e < 2 || e > 9) return [bloqueio("quantidade_eixos", "Quantidade de eixos fora do possivel (2 a 9).")];
  if (classe === "cavalo" && e > 3) return [aviso("quantidade_eixos", "Cavalo com mais de 3 eixos: confira o CRLV.")];
  return [ok("quantidade_eixos")];
}

export function validarVeiculo(v: VeiculoCadastro, opts: { placaDigitada?: string | null; placaCrlv?: string | null } = {}): Achado[] {
  const out: Achado[] = [];
  out.push(placaValida(v.placa) ? ok("placa") : bloqueio("placa", "Placa invalida: use o formato antigo (ABC1234) ou Mercosul (ABC1D23)."));
  if (opts.placaDigitada && opts.placaCrlv && alfa(opts.placaDigitada) !== alfa(opts.placaCrlv)) {
    out.push(bloqueio("placa", "A placa do CRLV e diferente da digitada. Corrija a placa ou envie o CRLV certo."));
  }
  const reb = eReboquePorTipoCrlv(v.tipo_crlv);
  if (reb !== null && v.e_reboque !== undefined && v.e_reboque !== null && v.e_reboque !== reb) {
    out.push(aviso("e_reboque", `O CRLV diz ${v.tipo_crlv}; o sistema vai marcar reboque = ${reb ? "sim" : "nao"}.`));
  }
  const eReb = reb ?? v.e_reboque ?? null;
  const base = { ...v, e_reboque: eReb };
  out.push(...validarTara(base), ...validarCapacidade(base), ...validarEixos(base));
  if (classeDoVeiculo(base) === "cavalo" && !v.carreta_vinculada) {
    out.push(aviso("carreta", "Cavalo sem carreta vinculada: o MDF-e vai exigir o reboque. Vincule a carreta."));
  }
  return out;
}

const diasAte = (iso: string, hoje: string) => Math.round((Date.parse(iso + "T00:00:00Z") - Date.parse(hoje + "T00:00:00Z")) / 86400000);

export function idadeEm(nascimento: string, hoje: string): number {
  const [ya, ma, da] = nascimento.split("-").map(Number), [yb, mb, db] = hoje.split("-").map(Number);
  return yb - ya - (mb < ma || (mb === ma && db < da) ? 1 : 0);
}

export function validarCnh(c: { validade?: string | null; data_nascimento?: string | null }, hoje: string): Achado[] {
  const out: Achado[] = [];
  if (!c.validade) out.push(aviso("cnh_validade", "Validade da CNH nao lida; confirme no documento."));
  else {
    const d = diasAte(c.validade, hoje);
    if (d < 0) out.push(bloqueio("cnh_validade", "CNH vencida. Peca a CNH renovada."));
    else if (d <= 30) out.push(aviso("cnh_validade", `CNH vence em ${d} dia(s).`));
    else out.push(ok("cnh_validade"));
  }
  if (c.data_nascimento) {
    const idade = idadeEm(c.data_nascimento, hoje);
    if (idade < 18) out.push(bloqueio("data_nascimento", `Idade calculada: ${idade} anos (menor de 18).`));
  }
  return out;
}

/** RNTRC: so bloqueia se a ANTT confirmou inativo (decisao de 16/11: so o que o orgao externo bloqueia). */
export function validarRntrc(r: { status?: string | null; validade?: string | null }, hoje: string): Achado[] {
  const s = (r.status ?? "").toLowerCase();
  if (s === "inativo" || s === "cancelado" || s === "suspenso") return [bloqueio("rntrc", "RNTRC inativo na ANTT.")];
  if (r.validade && diasAte(r.validade, hoje) < 0) return [aviso("rntrc", "RNTRC com validade vencida no documento; confirme na ANTT.")];
  if (!s) return [aviso("rntrc", "RNTRC ainda nao consultado na ANTT.")];
  return [ok("rntrc")];
}

export function tipoTransportadorMdfe(proprietarioDoc: string | null | undefined): "TAC" | "ETC" | null {
  const d = dig(proprietarioDoc);
  if (d.length === 11) return "TAC";
  if (d.length === 14) return "ETC";
  return null;
}

export function validarProprietario(p: { proprietario_documento?: string | null; motorista_documento?: string | null }): Achado[] {
  const out: Achado[] = [];
  if (p.proprietario_documento && !documentoValido(p.proprietario_documento)) out.push(bloqueio("proprietario_documento", "CPF/CNPJ do proprietario invalido."));
  if (p.motorista_documento && !documentoValido(p.motorista_documento)) out.push(bloqueio("cpf", "CPF do motorista invalido."));
  const a = dig(p.proprietario_documento), b = dig(p.motorista_documento);
  if (a && b && a !== b) {
    const t = tipoTransportadorMdfe(a);
    out.push(aviso("proprietario_documento", `Proprietario diferente do motorista: tipo de transportador do MDF-e sera ${t === "TAC" ? "TAC (proprietario pessoa fisica)" : "ETC (proprietario empresa)"}.`));
  }
  return out;
}

/** D6 (19/11/2026): o emissor do MDF-e (emitir-mdfe/mdfe.ts mapearTipoCarroceria) so entende sider, container, graneleira, bau/fechada,
 *  aberta/grade/prancha e "nao aplicavel". O CRLV traz texto livre ("CARROCERIA ABERTA", "TANQUE"...). Esta funcao devolve, para o que
 *  o emissor entende, o texto canonico; para o resto, `reconhecida: false` e NAO inventa equivalente (o texto cru fica para a pessoa decidir). */
export function carroceriaParaMdfe(texto: string | null | undefined): { valor: string | null; reconhecida: boolean } {
  const t = semAcento(String(texto ?? "")).trim();
  if (!t) return { valor: null, reconhecida: false };
  if (/sider/.test(t)) return { valor: "sider", reconhecida: true };
  if (/cont[ae]i?ner|conteiner/.test(t)) return { valor: "container", reconhecida: true };
  if (/granel/.test(t)) return { valor: "graneleira", reconhecida: true };
  if (/\bbau\b|fechad|furgao/.test(t)) return { valor: "bau", reconhecida: true };
  if (/abert|grade|prancha|plataforma/.test(t)) return { valor: "aberta", reconhecida: true };
  if (/nao aplic|sem carroceria|nenhuma/.test(t)) return { valor: "nao aplicavel", reconhecida: true };
  return { valor: String(texto).trim(), reconhecida: false };
}

/** C1 (19/11/2026): tipo de documento do proprietario do CRLV. 11 caracteres = CPF, 14 = CNPJ (aceita o CNPJ alfanumerico). */
export function tipoDocumentoProprietario(v: unknown): "cpf" | "cnpj" | null {
  const d = alfa(v);
  return d.length === 11 ? "cpf" : d.length === 14 ? "cnpj" : null;
}
