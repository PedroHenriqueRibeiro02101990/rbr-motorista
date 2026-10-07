// NF-e de TESTE (homologação) emitida pela RBR, só para o CT-e de homologação ter uma NF-e real para citar:
// a SEFAZ-SP confere se a NF-e do grupo infNFe existe na base do mesmo ambiente (rejeição 661 do CT-e).
// Sem I/O — montagem e bloqueios testados em nfe.test.ts. Campos conferidos com a doc da Focus
// (campos.focusnfe.com.br/nfe/NotaFiscalXML.html e doc.focusnfe.com.br/reference/emitir_nfe.md).
//
// RBR no Simples Nacional (Anexo III, transporte): CRT 1. Como é uma remessa de teste sem venda, o item vai com
// CSOSN 400 (não tributada pelo Simples Nacional) e PIS/COFINS CST 49 (outras operações de saída).

export const NOME_DEST_HOMOLOGACAO = "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL";

// NCM genérico usado quando a cotação não tem NCM (49111090 = impressos publicitários, o da doc da Focus).
export const NCM_PADRAO = "49111090";

// deno-lint-ignore no-explicit-any
type Linha = Record<string, any>;

export interface EnderecoDest {
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
  cep: string | null;
  telefone: string | null;
}

export interface DadosNfeTeste {
  ambiente: string | null; // parametros_fiscais.ambiente
  emitente: {
    cnpj: string | null;
    ie: string | null;
    razao_social: string | null;
    logradouro: string | null;
    numero: string | null;
    bairro: string | null;
    municipio: string | null; // nome, de municipios_ibge
    uf: string | null;
    cep: string | null;
  };
  cotacao: {
    nf_remetente_cnpj: string | null;
    nf_destinatario_cnpj: string | null;
    valor_nf: number | null;
    peso_bruto_kg: number | null;
    produto: string | null;
    ncm: string | null;
  };
  destinatario: EnderecoDest;
  agora: Date;
}

function digitos(v: unknown): string {
  return String(v ?? "").replace(/\D/g, "");
}

export function montarNfeTeste(d: DadosNfeTeste): { bloqueios: string[]; payload: Linha } {
  const bloqueios: string[] = [];
  const { emitente: e, cotacao: c, destinatario: dest } = d;

  if (d.ambiente !== "homologacao") {
    bloqueios.push("NF-e de teste só pode ser emitida com o ambiente fiscal em homologação.");
  }
  if (!e.cnpj || !e.ie || !e.razao_social || !e.logradouro || !e.numero || !e.bairro || !e.municipio || !e.uf || !e.cep) {
    bloqueios.push("Dados da RBR incompletos em parametros_fiscais (CNPJ, IE, razão social ou endereço).");
  }
  // A NF-e é da RBR; para o CT-e citar esta nota, o remetente da cotação tem que ser a própria RBR.
  if (digitos(c.nf_remetente_cnpj) !== digitos(e.cnpj)) {
    bloqueios.push(
      "O remetente da cotação não é a RBR — a NF-e de teste é emitida pela RBR, então só serve para cotação em que a RBR é o remetente.",
    );
  }
  if (digitos(c.nf_destinatario_cnpj).length !== 14) {
    bloqueios.push("Cotação sem CNPJ do destinatário (aba NF-e).");
  }
  if (!dest.logradouro || !dest.numero || !dest.bairro || !dest.municipio || !dest.uf || !dest.cep) {
    bloqueios.push("Endereço do destinatário incompleto (aba NF-e da cotação ou cadastro do cliente).");
  }
  const valor = c.valor_nf != null ? Number(c.valor_nf) : 0;
  if (!(valor > 0)) bloqueios.push("Cotação sem valor da NF (valor da mercadoria).");
  const peso = c.peso_bruto_kg != null ? Number(c.peso_bruto_kg) : 0;
  if (!(peso > 0)) bloqueios.push("Cotação sem peso bruto (kg).");

  const interna = Boolean(e.uf && dest.uf && e.uf === dest.uf);
  const ncm = digitos(c.ncm).length === 8 ? digitos(c.ncm) : NCM_PADRAO;
  const valor2 = Number(valor.toFixed(2));

  const payload: Linha = {
    natureza_operacao: "REMESSA PARA TESTE DE TRANSPORTE (HOMOLOGACAO)",
    data_emissao: d.agora.toISOString(),
    data_entrada_saida: d.agora.toISOString(),
    tipo_documento: 1, // saída
    local_destino: interna ? 1 : 2,
    finalidade_emissao: 1,
    // Destinatário como não contribuinte (indIEDest 9) exige consumidor final = 1.
    consumidor_final: 1,
    presenca_comprador: 9,

    cnpj_emitente: digitos(e.cnpj),
    inscricao_estadual_emitente: digitos(e.ie),
    nome_emitente: e.razao_social,
    logradouro_emitente: e.logradouro,
    numero_emitente: e.numero,
    bairro_emitente: e.bairro,
    municipio_emitente: e.municipio,
    uf_emitente: e.uf,
    cep_emitente: digitos(e.cep),
    regime_tributario_emitente: 1,

    // Homologação: a SEFAZ exige este nome literal no destinatário.
    nome_destinatario: NOME_DEST_HOMOLOGACAO,
    cnpj_destinatario: digitos(c.nf_destinatario_cnpj),
    indicador_inscricao_estadual_destinatario: 9,
    logradouro_destinatario: dest.logradouro,
    numero_destinatario: dest.numero,
    bairro_destinatario: dest.bairro,
    municipio_destinatario: dest.municipio,
    uf_destinatario: dest.uf,
    cep_destinatario: digitos(dest.cep),
    pais_destinatario: "Brasil",
    telefone_destinatario: digitos(dest.telefone) || undefined,

    valor_frete: 0,
    valor_seguro: 0,
    valor_desconto: 0,
    valor_outras_despesas: 0,
    valor_produtos: valor2,
    valor_total: valor2,
    modalidade_frete: 0, // por conta do remetente (a RBR)
    volumes: [{ quantidade: 1, especie: "VOLUME", peso_bruto: peso, peso_liquido: peso }],

    items: [
      {
        numero_item: 1,
        codigo_produto: "TESTE-CTE",
        descricao: (c.produto || "MERCADORIA PARA TESTE DE TRANSPORTE").slice(0, 120),
        cfop: interna ? "5949" : "6949",
        codigo_ncm: ncm,
        unidade_comercial: "UN",
        quantidade_comercial: 1,
        valor_unitario_comercial: valor2,
        unidade_tributavel: "UN",
        quantidade_tributavel: 1,
        valor_unitario_tributavel: valor2,
        valor_bruto: valor2,
        inclui_no_total: 1,
        icms_origem: 0,
        icms_situacao_tributaria: "400",
        pis_situacao_tributaria: "49",
        cofins_situacao_tributaria: "49",
      },
    ],
  };

  return { bloqueios, payload };
}

// Chave da NF-e autorizada como a Focus devolve ("NFe3526..."), só os 44 dígitos.
export function chaveDaResposta(r: Linha | null | undefined): string | null {
  const k = digitos(r?.chave_nfe);
  return k.length === 44 ? k : null;
}
