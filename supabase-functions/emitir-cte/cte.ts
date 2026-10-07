// Regras e montagem do payload do CT-e (Focus NFe /v2/cte), sem I/O: recebe os dados já lidos do banco e
// devolve payload + bloqueios + avisos. Separado do index.ts para ser testado (cte.test.ts) sem Supabase/Focus.
//
// Princípio: homologação e produção passam pelo MESMO caminho. A única diferença é a que a SEFAZ exige em
// homologação (tpAmb=2): o nome (xNome) de remetente/destinatário tem que ser o texto literal
// NOME_HOMOLOGACAO (rejeições 646/647/648/649). Todo o resto — NF-e, endereços, IBGE, tomador — é igual.

export const NOME_HOMOLOGACAO = "CT-E EMITIDO EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL";

export type Ambiente = "homologacao" | "producao";

// Endereço como o parser de NF-e grava em cotacoes.nf_remetente_endereco / nf_destinatario_endereco.
export interface EnderecoNf {
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  municipio?: string | null;
  uf?: string | null;
  cep?: string | null;
  codigo_ibge?: string | null;
}

// deno-lint-ignore no-explicit-any
type Linha = Record<string, any>;

export interface DadosCte {
  op: Linha; // linha de v_checklist_prontidao
  pf: Linha | null; // parametros_fiscais
  cotacao: {
    peso_bruto_kg: number | null;
    nf_remetente_endereco: EnderecoNf | null;
    nf_remetente_ie: string | null;
    nf_destinatario_endereco: EnderecoNf | null;
    nf_destinatario_ie: string | null;
    tomador_papel: string | null;
  } | null;
  // Códigos IBGE resolvidos em municipios_ibge (null = não encontrado).
  ibge: { inicio: string | null; fim: string | null };
  // Nome do município da sede da RBR (de parametros_fiscais.endereco_codigo_municipio).
  municipioEmitente: string | null;
  agora: Date;
}

export interface ResultadoCte {
  ambiente: Ambiente;
  bloqueios: string[];
  // O que muda só porque é homologação + checagens que só a SEFAZ responde (para conferir depois).
  avisos: string[];
  intramunicipal: boolean;
  payload: Linha;
}

export function normalizarCidade(nome: string | null | undefined): string {
  if (!nome) return "";
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

// A tag <RNTRC> do CT-e exige exatamente 8 dígitos ou "ISENTO" (schema SEFAZ).
export function formatarRntrc(valor: string): string {
  const limpo = valor.trim().toUpperCase();
  if (limpo === "ISENTO") return limpo;
  return limpo.replace(/^0+(?=\d{8}$)/, "");
}

function digitos(v: unknown): string {
  return String(v ?? "").replace(/\D/g, "");
}

export function cnpjValido(valor: unknown): boolean {
  const c = digitos(valor);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const dv = (base: string, pesos: number[]) => {
    const r = pesos.reduce((s, p, i) => s + Number(base[i]) * p, 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  return dv(c, p1) === Number(c[12]) && dv(c, [6, ...p1]) === Number(c[13]);
}

// Chave de acesso NF-e: 44 dígitos, modelo 55 (posições 21-22) e dígito verificador módulo 11.
export function chaveNfeValida(valor: unknown): boolean {
  const k = digitos(valor);
  if (k.length !== 44 || k.slice(20, 22) !== "55") return false;
  let soma = 0;
  let peso = 2;
  for (let i = 42; i >= 0; i--) {
    soma += Number(k[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const r = soma % 11;
  return (r < 2 ? 0 : 11 - r) === Number(k[43]);
}

function enderecoCompleto(e: EnderecoNf | null | undefined): e is EnderecoNf {
  return Boolean(e?.logradouro && e?.numero && e?.bairro && e?.cep && e?.municipio && e?.uf);
}

// tomador_papel da cotação -> código da Focus (toma3): 0 remetente, 3 destinatário.
// null mantém o comportamento anterior (remetente).
const TOMADOR: Record<string, { codigo: string; descricao: string }> = {
  remetente: { codigo: "0", descricao: "remetente" },
  destinatario: { codigo: "3", descricao: "destinatário" },
};

export function montarCte(d: DadosCte): ResultadoCte {
  const { op, pf, cotacao, ibge } = d;
  const ambiente: Ambiente = op.ambiente_fiscal === "producao" ? "producao" : "homologacao";
  const bloqueios: string[] = [];
  const avisos: string[] = [];

  const intramunicipal = Boolean(
    op.uf_origem &&
      op.uf_destino &&
      op.uf_origem === op.uf_destino &&
      op.cidade_origem &&
      op.cidade_destino &&
      normalizarCidade(op.cidade_origem) === normalizarCidade(op.cidade_destino),
  );
  if (intramunicipal) {
    bloqueios.push(
      `Frete intramunicipal (${op.cidade_origem}/${op.uf_origem} -> ${op.cidade_destino}/${op.uf_destino}) — transporte que começa e termina na mesma cidade não é tributado por ICMS/CT-e, e sim por ISS/NFS-e (LC 116/2003, item 16). Esta função não emite CT-e pra esse caso — use a função emitir-nfse-intramunicipal.`,
    );
  }

  // --- Emitente, veículo, motorista, cotação -----------------------------------------------------------
  if (!op.ie_configurada) {
    bloqueios.push(
      "Inscrição Estadual da RBR ainda não cadastrada em parametros_fiscais.inscricao_estadual — bloqueia o emitente do CT-e.",
    );
  }
  if (!op.veiculo_id) bloqueios.push("Nenhum veículo alocado nesta operação.");
  if (op.veiculo_id && !op.veiculo_rntrc_ativo) bloqueios.push("RNTRC do veículo não está ativo.");
  if (!op.motorista_id) bloqueios.push("Nenhum motorista alocado nesta operação.");
  if (op.motorista_id && !op.motorista_rntrc_ativo) bloqueios.push("RNTRC do motorista não está ativo.");
  if (!op.cotacao_id) bloqueios.push("Operação sem cotação vinculada — não há dados de NF-e/rota pra montar o CT-e.");
  if (!op.cidade_origem || !op.uf_origem || !op.cidade_destino || !op.uf_destino) {
    bloqueios.push("Cotação sem origem/destino completos.");
  }
  if (!op.valor_total_cotacao) {
    bloqueios.push("Cotação sem valor_total (valor do serviço de transporte) preenchido.");
  }

  if (!pf?.endereco_logradouro || !pf?.endereco_numero || !pf?.endereco_bairro || !pf?.endereco_cep) {
    bloqueios.push("Endereço do emitente incompleto em parametros_fiscais (logradouro/número/bairro/CEP) — obrigatório no CT-e.");
  }
  if (!pf?.endereco_codigo_municipio || !d.municipioEmitente) {
    bloqueios.push(
      "Município da RBR não resolvido: parametros_fiscais.endereco_codigo_municipio vazio ou não encontrado em municipios_ibge.",
    );
  }
  if (!pf?.responsavel_tecnico_cnpj || !pf?.responsavel_tecnico_email) {
    bloqueios.push("Dados do responsável técnico incompletos em parametros_fiscais (cnpj/email) — exigência da SEFAZ.");
  }
  if (!pf?.rntrc) {
    bloqueios.push(
      "RNTRC da RBR não configurado em parametros_fiscais.rntrc — obrigatório no grupo modal rodoviário (modal_rodoviario) do CT-e.",
    );
  }

  // --- Percurso: códigos IBGE de início e fim (cMunIni/cMunFim) ----------------------------------------
  if (op.cidade_origem && op.uf_origem && !ibge.inicio) {
    bloqueios.push(
      `Município de origem "${op.cidade_origem}/${op.uf_origem}" não encontrado em municipios_ibge — sem o código IBGE de início da prestação (cMunIni) a SEFAZ recusa o CT-e. Confira a grafia da cidade na cotação.`,
    );
  }
  if (op.cidade_destino && op.uf_destino && !ibge.fim) {
    bloqueios.push(
      `Município de destino "${op.cidade_destino}/${op.uf_destino}" não encontrado em municipios_ibge — sem o código IBGE de fim da prestação (cMunFim) a SEFAZ recusa o CT-e. Confira a grafia da cidade na cotação.`,
    );
  }

  // --- Documento transportado: NF-e --------------------------------------------------------------------
  if (!op.nf_chave_acesso) {
    bloqueios.push(
      "Cotação sem chave de acesso da NF-e (44 dígitos) — o CT-e exige o grupo Documentos Transportados (SEFAZ rejeita sem ele).",
    );
  } else if (!chaveNfeValida(op.nf_chave_acesso)) {
    bloqueios.push(
      "Chave de acesso da NF-e inválida (precisa de 44 dígitos, modelo 55 e dígito verificador correto) — confira na aba NF-e da cotação.",
    );
  } else {
    const cnpjEmitenteNf = digitos(op.nf_chave_acesso).slice(6, 20);
    if (op.nf_remetente_cnpj && cnpjEmitenteNf !== digitos(op.nf_remetente_cnpj)) {
      avisos.push(
        "O CNPJ dentro da chave da NF-e (emitente da nota) é diferente do CNPJ do remetente informado na cotação — confira se a chave é da nota certa.",
      );
    }
    if (op.uf_origem === "SP") {
      avisos.push(
        ambiente === "homologacao"
          ? "SEFAZ-SP confere se a NF-e existe (rejeição 661): em homologação a chave precisa ser de uma NF-e AUTORIZADA EM HOMOLOGAÇÃO — chave de produção ou inventada é recusada."
          : "SEFAZ-SP confere se a NF-e existe (rejeição 661): a chave precisa ser de uma NF-e autorizada em produção.",
      );
    }
  }

  // --- Remetente: a própria RBR (parametros_fiscais) ou terceiro (endereço da NF-e na cotação) -----------
  if (!op.nf_remetente_cnpj || !op.nf_destinatario_cnpj) {
    bloqueios.push("Cotação sem remetente/destinatário da NF-e preenchidos.");
  }
  if (op.nf_remetente_cnpj && !cnpjValido(op.nf_remetente_cnpj)) {
    bloqueios.push("CNPJ do remetente inválido (dígito verificador) — confira na aba NF-e da cotação.");
  }
  if (op.nf_destinatario_cnpj && !cnpjValido(op.nf_destinatario_cnpj)) {
    bloqueios.push("CNPJ do destinatário inválido (dígito verificador) — confira na aba NF-e da cotação.");
  }

  const remetenteEhRBR = Boolean(op.nf_remetente_cnpj) && digitos(op.nf_remetente_cnpj) === digitos(op.emitente_cnpj);
  const endRemNf = cotacao?.nf_remetente_endereco ?? null;
  let remetente: Linha;
  if (remetenteEhRBR) {
    if (!pf?.telefone_contato) {
      bloqueios.push(
        "Telefone não configurado em parametros_fiscais.telefone_contato — obrigatório como telefone do remetente quando o remetente é a própria RBR.",
      );
    }
    remetente = {
      inscricao_estadual_remetente: op.emitente_ie,
      telefone_remetente: pf?.telefone_contato,
      logradouro_remetente: pf?.endereco_logradouro,
      numero_remetente: pf?.endereco_numero,
      complemento_remetente: pf?.endereco_complemento || undefined,
      bairro_remetente: pf?.endereco_bairro,
      municipio_remetente: d.municipioEmitente,
      uf_remetente: pf?.endereco_uf,
      cep_remetente: pf?.endereco_cep,
    };
  } else {
    if (op.nf_remetente_cnpj && !enderecoCompleto(endRemNf)) {
      bloqueios.push(
        "Endereço do remetente incompleto na aba NF-e da cotação (logradouro/número/bairro/CEP/cidade/UF) — obrigatório no CT-e. Importe o XML da NF-e ou complete à mão.",
      );
    }
    remetente = {
      inscricao_estadual_remetente: cotacao?.nf_remetente_ie || undefined,
      logradouro_remetente: endRemNf?.logradouro,
      numero_remetente: endRemNf?.numero,
      complemento_remetente: endRemNf?.complemento || undefined,
      bairro_remetente: endRemNf?.bairro,
      municipio_remetente: endRemNf?.municipio,
      uf_remetente: endRemNf?.uf,
      cep_remetente: digitos(endRemNf?.cep) || undefined,
    };
  }

  // --- Destinatário: endereço da NF-e (cotação) ou, sem ele, o cadastro do cliente ----------------------
  const endDestNf = cotacao?.nf_destinatario_endereco ?? null;
  let destinatario: Linha;
  if (enderecoCompleto(endDestNf)) {
    destinatario = {
      inscricao_estadual_destinatario: cotacao?.nf_destinatario_ie || undefined,
      logradouro_destinatario: endDestNf.logradouro,
      numero_destinatario: endDestNf.numero,
      complemento_destinatario: endDestNf.complemento || undefined,
      bairro_destinatario: endDestNf.bairro,
      municipio_destinatario: endDestNf.municipio,
      uf_destinatario: endDestNf.uf,
      cep_destinatario: digitos(endDestNf.cep),
    };
  } else {
    if (
      !op.destinatario_logradouro ||
      !op.destinatario_numero ||
      !op.destinatario_bairro ||
      !op.destinatario_cep ||
      !op.destinatario_cidade ||
      !op.destinatario_uf
    ) {
      bloqueios.push(
        "Endereço do destinatário incompleto: a aba NF-e da cotação não tem o endereço e o cadastro do cliente também está incompleto (logradouro/número/bairro/CEP/cidade/UF) — obrigatório no CT-e.",
      );
    }
    destinatario = {
      inscricao_estadual_destinatario: cotacao?.nf_destinatario_ie || undefined,
      telefone_destinatario: op.destinatario_telefone || undefined,
      logradouro_destinatario: op.destinatario_logradouro,
      numero_destinatario: op.destinatario_numero,
      complemento_destinatario: op.destinatario_complemento || undefined,
      bairro_destinatario: op.destinatario_bairro,
      municipio_destinatario: op.destinatario_cidade,
      uf_destinatario: op.destinatario_uf,
      cep_destinatario: op.destinatario_cep,
    };
  }

  // --- Tomador do serviço ------------------------------------------------------------------------------
  const papel = cotacao?.tomador_papel ?? "remetente";
  const tomador = TOMADOR[papel];
  if (!tomador) {
    bloqueios.push(
      `Tomador do serviço "${papel}" ainda não suportado na emissão automática (só remetente ou destinatário). Ajuste o tomador na cotação ou emita este CT-e fora do sistema.`,
    );
  }
  const ieTomador = papel === "destinatario"
    ? destinatario.inscricao_estadual_destinatario
    : remetente.inscricao_estadual_remetente;

  // --- Peso ------------------------------------------------------------------------------------------
  const pesoBrutoKg = cotacao?.peso_bruto_kg ?? null;
  if (!pesoBrutoKg || pesoBrutoKg <= 0) {
    bloqueios.push("Cotação sem peso bruto da carga (kg) — obrigatório no CT-e (quantidades).");
  }

  // --- Nomes: em homologação a SEFAZ exige o texto literal (646/649) ------------------------------------
  let nomeRemetente = op.nf_remetente_razao_social;
  let nomeDestinatario = op.nf_destinatario_razao_social;
  if (ambiente === "homologacao") {
    nomeRemetente = NOME_HOMOLOGACAO;
    nomeDestinatario = NOME_HOMOLOGACAO;
    avisos.push(
      `Homologação: nome do remetente e do destinatário enviados como "${NOME_HOMOLOGACAO}" (exigência da SEFAZ, rejeições 646/649). Em produção vão os nomes reais: ${op.nf_remetente_razao_social ?? "—"} / ${op.nf_destinatario_razao_social ?? "—"}.`,
    );
  }

  const intraestadual = op.uf_origem && op.uf_destino && op.uf_origem === op.uf_destino;
  const cfop = intraestadual ? "5353" : "6353";

  const payload: Linha = {
    natureza_operacao: op.natureza_operacao || "Prestação de serviço de transporte",
    data_emissao: d.agora.toISOString(),
    tipo_documento: "0",
    tipo_servico: "0",
    modal: "01",
    modal_rodoviario: {
      rntrc: pf?.rntrc ? formatarRntrc(String(pf.rntrc)) : null,
    },
    cfop,
    // "envio" = onde o CT-e é emitido (sede da RBR); "início"/"fim" = percurso da prestação (cMunIni/cMunFim).
    municipio_envio: d.municipioEmitente,
    uf_envio: pf?.endereco_uf,
    codigo_municipio_envio: pf?.endereco_codigo_municipio,
    municipio_inicio: op.cidade_origem,
    uf_inicio: op.uf_origem,
    codigo_municipio_inicio: ibge.inicio,
    municipio_fim: op.cidade_destino,
    uf_fim: op.uf_destino,
    codigo_municipio_fim: ibge.fim,
    // A RBR sempre entrega no endereço do destinatário: retirar_mercadoria "1" = Não.
    retirar_mercadoria: "1",
    detalhes_retirar: "Entrega no endereço do destinatário — sem retirada em filial/porto/aeroporto.",

    tomador: tomador?.codigo ?? "0",
    indicador_inscricao_estadual_tomador: ieTomador ? "1" : "9",

    cnpj_emitente: op.emitente_cnpj,
    inscricao_estadual_emitente: op.emitente_ie,
    nome_emitente: op.emitente_razao_social,
    logradouro_emitente: pf?.endereco_logradouro,
    numero_emitente: pf?.endereco_numero,
    complemento_emitente: pf?.endereco_complemento || undefined,
    bairro_emitente: pf?.endereco_bairro,
    cep_emitente: pf?.endereco_cep,
    codigo_municipio_emitente: pf?.endereco_codigo_municipio,
    uf_emitente: pf?.endereco_uf,

    cnpj_remetente: op.nf_remetente_cnpj,
    nome_remetente: nomeRemetente,
    ...remetente,
    codigo_pais_remetente: "1058",
    pais_remetente: "Brasil",

    cnpj_destinatario: op.nf_destinatario_cnpj,
    nome_destinatario: nomeDestinatario,
    ...destinatario,
    codigo_pais_destinatario: "1058",
    pais_destinatario: "Brasil",

    valor_total: op.valor_total_cotacao,
    valor_receber: op.valor_total_cotacao,
    valor_total_carga: op.valor_nf ?? op.valor_total_cotacao,
    produto_predominante: op.tipo_carga || "Carga geral",
    quantidades: [
      {
        codigo_unidade_medida: "01",
        tipo_medida: "PESO BRUTO",
        quantidade: pesoBrutoKg ?? 0,
      },
    ],
    nfes: op.nf_chave_acesso ? [{ chave_nfe: digitos(op.nf_chave_acesso) }] : [],

    // ICMS pra Simples Nacional no CT-e: código fixo "90_simples_nacional" + indicador "1", sem destaque de valor.
    icms_origem: "0",
    icms_situacao_tributaria: "90_simples_nacional",
    icms_indicador_simples_nacional: "1",

    observacoes_contribuinte: [
      {
        campo: "Regime Tributário",
        conteudo: "Documento emitido por ME ou EPP optante pelo SIMPLES Nacional",
      },
    ],

    responsavel_tecnico: {
      cnpj: pf?.responsavel_tecnico_cnpj,
      contato: pf?.responsavel_tecnico_contato || "RBR Cargo",
      email: pf?.responsavel_tecnico_email,
      fone: pf?.responsavel_tecnico_telefone || undefined,
    },
  };

  return { ambiente, bloqueios, avisos, intramunicipal, payload };
}
