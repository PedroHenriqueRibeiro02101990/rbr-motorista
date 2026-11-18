// Regras que separam "o órgão externo rejeitaria" (bloqueia) de "política da RBR" (só avisa). Sem I/O.
// Origem: pedido de 16/11/2026 (operação Itupeva -> Timóteo ficou presa por regra nossa e por dado que o sistema não montava).

// CNPJ da Repom (instituição de pagamento) gravado hoje em operacao_ciot_vpo.pagto_cnpj_ipef.
// CONFIRMAR na documentação da Repom antes de ligar em produção.
export const CNPJ_IPEF_REPOM = "65697260000103";

const soDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");

// ---- 1. Status do RNTRC ----
// "impeditivo": a ANTT consultou e disse que não vale (bloqueia). NULL/vazio = nunca consultado (só avisa:
// a ANTT valida no CIOT e a SEFAZ no MDF-e). "ativo" = ok.
export type SituacaoRntrc = "ativo" | "impeditivo" | "nao_consultado" | "desconhecido";
export function situacaoRntrc(status: unknown): SituacaoRntrc {
  const t = String(status ?? "").trim().toLowerCase();
  if (!t) return "nao_consultado";
  if (t === "ativo") return "ativo";
  if (/(inativ|cancel|suspens|vencid|baix|bloquead)/.test(t)) return "impeditivo";
  return "desconhecido";
}

// ---- 2. Tração x reboque ----
export function ehTipoReboque(tipo: unknown): boolean {
  return /(semi\s*-?\s*reboque|semirreboque|reboque|carreta)/i.test(String(tipo ?? "")) && !/cavalo|trator/i.test(String(tipo ?? ""));
}

export interface VeiculoRef {
  id?: string | null;
  placa: string | null;
  tipo_veiculo: string | null;
}

// Fonte única: tração = operacoes.veiculo_id; reboques = operacao_reboques. Para dados antigos, se veiculo_id for uma
// carreta e houver cavalo_veiculo_id, o cavalo vira tração e a carreta entra como primeiro reboque.
export function resolverTracaoReboques<T extends VeiculoRef>(
  veiculoOp: T | null,
  cavaloOp: T | null,
  reboques: T[],
): { tracao: T | null; reboques: T[]; corrigido: boolean; erro: string | null } {
  if (!veiculoOp) return { tracao: null, reboques, corrigido: false, erro: null };
  if (!ehTipoReboque(veiculoOp.tipo_veiculo)) return { tracao: veiculoOp, reboques, corrigido: false, erro: null };
  if (cavaloOp && !ehTipoReboque(cavaloOp.tipo_veiculo)) {
    const jaTem = reboques.some((r) => (r.id && r.id === veiculoOp.id) || r.placa === veiculoOp.placa);
    return { tracao: cavaloOp, reboques: jaTem ? reboques : [veiculoOp, ...reboques], corrigido: true, erro: null };
  }
  return {
    tracao: veiculoOp,
    reboques,
    corrigido: false,
    erro: `O veículo ${veiculoOp.placa ?? "sem placa"} (${veiculoOp.tipo_veiculo}) está no campo de tração; troque pelo cavalo e coloque a carreta em reboques.`,
  };
}

// ---- 3. CRLV: normaliza tipo e calcula tara ----
export function normalizarTipoVeiculo(texto: unknown): string | null {
  const t = String(texto ?? "").toLowerCase();
  if (!t.trim()) return null;
  if (/semi\s*-?\s*reboque|semirreboque/.test(t)) return "Semirreboque";
  if (/reboque/.test(t)) return "Reboque";
  if (/trator|cavalo/.test(t)) return "Cavalo mecânico";
  if (/truck/.test(t)) return "Truck";
  if (/toco/.test(t)) return "Toco";
  if (/\bvan\b|furg[aã]o/.test(t) && !/caminh/.test(t)) return "Van";
  if (/utilit|fiorino|vuc|3\/4/.test(t)) return "Utilitário";
  return null;
}

// Tara = PBT - capacidade de carga, só quando o CRLV traz os dois. É SUGESTÃO: o gestor confirma.
export function sugerirTara(pbtKg: unknown, capacidadeKg: unknown): number | null {
  const pbt = Number(pbtKg);
  const cap = Number(capacidadeKg);
  if (!Number.isFinite(pbt) || !Number.isFinite(cap) || pbt <= 0 || cap <= 0 || cap >= pbt) return null;
  return Math.round(pbt - cap);
}

// ---- 8. CIOT: aceita os 16 dígitos colados (12 + 4 verificador) ----
export function separarCiotDigitado(texto: unknown): { ciot: string; verificador: string | null } | null {
  const d = soDigitos(texto);
  if (d.length === 12) return { ciot: d, verificador: null };
  if (d.length === 16) return { ciot: d.slice(0, 12), verificador: d.slice(12) };
  return null;
}

// ---- 4. Destino de pagamento do MDF-e (lotação) ----
// Ordem: o que o gestor já gravou; senão deriva do CIOT (Repom -> CNPJ da Repom; efrete/NSTech -> IPEF do retorno).
export function ipefDerivado(ciotOrigem: unknown, pagtoCnpjIpef: unknown): { cnpj: string; origem: "informado" | "repom" } | null {
  const informado = soDigitos(pagtoCnpjIpef);
  if (informado.length === 14) return { cnpj: informado, origem: "informado" };
  if (String(ciotOrigem ?? "") === "rbr_repom") return { cnpj: CNPJ_IPEF_REPOM, origem: "repom" };
  return null;
}

// Condição de pagamento vem do CONTRATO do CIOT quando ele existe (a SEFAZ confere parcelas + adiantamento = contrato).
export interface CondicaoPagto {
  valor_total_contrato: number | null;
  valor_adiantamento: number | null;
  saldo_prazo_dias: number | null;
}
export function condicaoDoContratoCiot(
  atual: CondicaoPagto | null,
  contrato: { valor_frete?: unknown; valor_adiantamento?: unknown } | null,
): { condicao: CondicaoPagto | null; divergencia: string | null } {
  const frete = contrato?.valor_frete != null ? Number(contrato.valor_frete) : null;
  if (!frete || !(frete > 0)) return { condicao: atual, divergencia: null };
  const adiant = contrato?.valor_adiantamento != null ? Number(contrato.valor_adiantamento) : (atual?.valor_adiantamento ?? null);
  const divergente = atual?.valor_total_contrato != null && Math.abs(Number(atual.valor_total_contrato) - frete) >= 0.01;
  return {
    condicao: { valor_total_contrato: frete, valor_adiantamento: adiant, saldo_prazo_dias: atual?.saldo_prazo_dias ?? null },
    divergencia: divergente
      ? `A condição de pagamento da operação (R$ ${Number(atual!.valor_total_contrato).toFixed(2)}) estava diferente do contrato do CIOT (R$ ${frete.toFixed(2)}). O MDF-e usou o valor do CIOT.`
      : null,
  };
}

// ---- C. Rejeição da SEFAZ em linguagem simples + onde corrigir ----
export interface RejeicaoTraduzida {
  mensagem: string;
  campo: string;
  aba: "ciot" | "pedagio" | "seguro" | "veiculo" | "pagamento" | "documentos" | "cadastro";
}
export function traduzirRejeicaoMdfe(bruta: unknown): RejeicaoTraduzida | null {
  const t = String(bruta ?? "").toLowerCase();
  if (/informa[cç][oõ]es de pagamento/.test(t)) {
    return { mensagem: "A SEFAZ exige o grupo de pagamento do frete em carga lotação. Informe o destino de pagamento (Pix, banco/agência ou CNPJ da instituição de pagamento) e a condição de pagamento.", campo: "pagamento", aba: "pagamento" };
  }
  if (/738/.test(t) || /valor do contrato/.test(t)) {
    return { mensagem: "O valor do contrato não bate com as parcelas + adiantamento. Ajuste a condição de pagamento para o mesmo valor do CIOT.", campo: "valor_total_contrato", aba: "pagamento" };
  }
  if (/699/.test(t) || /averba/.test(t)) {
    return { mensagem: "A SEFAZ exige o número da averbação do seguro. Averbe o CT-e e preencha o número.", campo: "numero_averbacao", aba: "seguro" };
  }
  if (/684/.test(t) || /\bciot\b/.test(t)) {
    return { mensagem: "A SEFAZ exige o CIOT do transportador autônomo. Emita o CIOT e preencha o número.", campo: "ciot", aba: "ciot" };
  }
  if (/vale.?ped[aá]gio|\bvpo\b/.test(t)) {
    return { mensagem: "A SEFAZ exige o vale-pedágio da rota. Compre o vale e confira IDVPO, valor e fornecedora.", campo: "vpo_idvpo", aba: "pedagio" };
  }
  if (/seguro|ap[oó]lice/.test(t)) {
    return { mensagem: "A SEFAZ não aceitou os dados do seguro. Confira a apólice RCTR-C (número, seguradora) e a averbação.", campo: "apolice", aba: "seguro" };
  }
  if (/tara|rodado|carroceria|reboque|ve[ií]culo/.test(t)) {
    return { mensagem: "A SEFAZ não aceitou os dados do veículo. Confira tara, tipo de rodado, carroceria e UF no cadastro.", campo: "veiculo", aba: "veiculo" };
  }
  return null;
}
