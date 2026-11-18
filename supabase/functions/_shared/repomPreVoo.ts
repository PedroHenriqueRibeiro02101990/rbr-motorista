// Pre-voo da Repom (Parte D etapa 26): lista, em portugues, EXATAMENTE o que falta no cadastro para a Repom aceitar o contrato.
// Derivado do estado gravado (passe as linhas lidas do banco), nunca de texto fixo (regra G5). Teste: node --test supabase/functions/_shared/repomPreVoo.test.ts
export interface MotoristaRepom {
  nome?: string | null; cpf?: string | null; cnh_numero_registro?: string | null; data_nascimento?: string | null; genero?: string | null
  rg_numero?: string | null; rg_orgao_emissor?: string | null; rg_uf?: string | null; numero_dependentes?: number | null
  cep?: string | null; logradouro?: string | null; numero_endereco?: string | null; bairro?: string | null; celular?: string | null
}
export interface PrestadorRepom { documento?: string | null; nome?: string | null; rntrc?: string | null; optante_simples_nacional?: boolean | null }
export interface VeiculoRepomPre { placa?: string | null; quantidade_eixos?: number | null; e_reboque?: boolean | null; tipo_veiculo?: string | null }
export interface OperacaoRepom {
  tipo_carga_antt?: number | null
  entrega_prevista?: string | null
  filial_repom?: string | null
  ncm?: string | null
}
export interface ItemFalta { campo: string; mensagem: string; onde: "motorista" | "veiculo" | "prestador" | "operacao" | "configuracao" }

const so = (s: unknown) => String(s ?? "").replace(/\D/g, "");

export function faltaParaRepom(e: { motorista?: MotoristaRepom | null; prestador?: PrestadorRepom | null; veiculos: VeiculoRepomPre[]; operacao?: OperacaoRepom | null }): ItemFalta[] {
  const out: ItemFalta[] = [];
  const add = (campo: string, mensagem: string, onde: ItemFalta["onde"]) => out.push({ campo, mensagem, onde });
  const m = e.motorista;
  if (!m) add("motorista", "Nenhum motorista na operacao.", "motorista");
  else {
    if (so(m.cpf).length !== 11) add("cpf", "CPF do motorista.", "motorista");
    if (!m.nome) add("nome", "Nome do motorista.", "motorista");
    if (!m.cnh_numero_registro) add("cnh_numero_registro", "Numero da CNH do motorista.", "motorista");
    if (!m.data_nascimento) add("data_nascimento", "Data de nascimento do motorista.", "motorista");
    if (!m.genero) add("genero", "Genero do motorista (M ou F).", "motorista");
    if (!m.rg_numero) add("rg_numero", "Numero do RG do motorista.", "motorista");
    if (!m.rg_orgao_emissor || !m.rg_uf) add("rg_orgao_emissor", "Orgao emissor e UF do RG do motorista.", "motorista");
    if (m.numero_dependentes == null) add("numero_dependentes", "Numero de dependentes do motorista.", "motorista");
    if (so(m.celular).length < 10) add("celular", "Telefone do motorista com DDD.", "motorista");
    if (so(m.cep).length !== 8 || !m.logradouro) add("endereco", "Endereco completo do motorista (leia do comprovante de residencia).", "motorista");
  }
  const p = e.prestador;
  if (!p || ![11, 14].includes(so(p.documento).length)) add("prestador_documento", "CPF/CNPJ do prestador (contratado).", "prestador");
  if (p && !p.rntrc) add("rntrc", "RNTRC do prestador.", "prestador");
  if (p && p.optante_simples_nacional == null) add("optante_simples_nacional", "Se o prestador e optante pelo Simples Nacional.", "prestador");
  if (!e.veiculos.length) add("veiculos", "Nenhum veiculo na operacao.", "veiculo");
  for (const v of e.veiculos) {
    const r = v.placa ?? "sem placa";
    if (!v.placa) add("placa", "Placa do veiculo.", "veiculo");
    if (!v.quantidade_eixos) add("quantidade_eixos", `Quantidade de eixos do veiculo ${r} (define o valor do vale-pedagio).`, "veiculo");
  }
  if (e.veiculos.some((v) => /cavalo|trator/i.test(v.tipo_veiculo ?? "")) && !e.veiculos.some((v) => v.e_reboque)) add("implemento", "Cavalo sem carreta (implemento) vinculada.", "veiculo");
  const o = e.operacao;
  if (!o?.tipo_carga_antt) add("tipo_carga_antt", "Tipo de carga da ANTT (codigos 1 a 8).", "operacao");
  if (!o?.entrega_prevista) add("entrega_prevista", "Data prevista de entrega da operacao.", "operacao");
  if (!so(o?.ncm)) add("ncm", "NCM da carga.", "operacao");
  if (!o?.filial_repom) add("filial_repom", "Codigo da filial da RBR na Repom (configuracao).", "configuracao");
  return out;
}

/** Tipos de carga da ANTT (codigos do guia da Repom, docs/repom/ESPECIFICACAO-FRETE.md secao 5). Lista editavel no banco: tipos_carga_antt. */
export const TIPOS_CARGA_ANTT: Record<number, string> = {
  1: "Granel solido", 2: "Granel liquido", 3: "Frigorificada", 4: "Conteinerizada", 5: "Carga Geral", 6: "Neogranel", 7: "Perigosa (granel solido)", 8: "Perigosa (granel liquido)",
};
