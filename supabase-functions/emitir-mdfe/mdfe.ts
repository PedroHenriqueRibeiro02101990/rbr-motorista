// Regras e montagem do payload do MDF-e (Focus NFe /v2/mdfe), sem I/O.
// v18 (2026-10-16): tipo de carga vazio na cotacao assume "Carga geral" (05) e avisa (origem rbr), em vez de bloquear. Tipo preenchido e nao reconhecido continua bloqueando.
// v17 (2026-10-16): tipo_transporte so vai no payload quando ha proprietario do veiculo de tracao (veiculo que nao e da frota da RBR). SEFAZ rejeita o campo sem proprietario.
// v6: RNTRC do proprietario normalizado para 8 digitos; homologacao relaxa regras so do nosso sistema; data_emissao -03:00.
// v7: o mesmo vale para operacao de TESTE em producao (cotacao.teste_producao).
// v8: tipo_transporte = 2 (TAC) quando o proprietario da tracao e pessoa fisica (rejeicao da SEFAZ).
// v9/v10: numero_averbacao (campo Focus) no seguro, vindo de operacao_ciot_vpo.numero_averbacao - rejeicao 699.
// v11: conhecimentos_transporte dentro de municipios_descarregamento (rejeicao "Municipio sem documento").
// v12: cep_carregamento / cep_descarregamento (grupo de carga lotacao).
// v13: valores monetarios do pagamento com 2 casas decimais e nParcela com 3 digitos (schema da SEFAZ).
// v15: NCM (8 digitos) sempre bloqueia, inclusive em teste (regra da SEFAZ, nao so do nosso sistema).
// v16 (2026-10-15): cada regra tem origem (sefaz/antt bloqueiam; rbr so avisa) e sai em `regras`. CEP e numero da
//   averbacao bloqueiam sempre (SEFAZ), inclusive no teste. Destino e condicao de pagamento do motorista viram
//   aviso "Regra da RBR" e o MDF-e sai sem o grupo de pagamento. CIOT do TAC: bloqueia em operacao real; no teste,
//   dispensa de teste; em homologacao, aviso. "relaxar" deixou de existir (teste e homologacao sao separados).

// deno-lint-ignore no-explicit-any
type Linha = Record<string, any>;

// Origem de cada regra (C1, 2026-10-15). Bloqueia só o que é regra real:
//  - "sefaz": rejeição/exigência da SEFAZ ou da Focus (campo obrigatório, formato) — sempre bloqueia;
//  - "antt":  ANTT ou lei (RNTRC, CIOT do TAC, Vale-Pedágio Lei 10.209, apólice RCTR-C) — bloqueia em operação real;
//  - "rbr":   política interna da RBR — só AVISA (teste e produção), o gestor segue por conta própria;
//  - "info":  aviso informativo (homologação, dispensa de teste, o que só a SEFAZ confere).
// A trava do modo teste (só RBR, até R$ 5) vem de trava_teste_fiscal e não entra nessa classificação.
export type OrigemRegra = "sefaz" | "antt" | "rbr" | "info";
export interface ItemRegra {
  tipo: "bloqueio" | "aviso";
  origem: OrigemRegra;
  mensagem: string;
}
type Bloquear = (origem: "sefaz" | "antt", mensagem: string) => void;

export interface VeiculoMdfe {
  placa: string | null;
  renavam: string | null;
  tara_kg: number | string | null;
  capacidade_carga: number | string | null;
  tipo_veiculo: string | null;
  tipo_carroceria: string | null;
  uf_licenciamento: string | null;
  is_veiculo_proprio: boolean | null;
  quantidade_eixos: number | null;
  titular: {
    nome: string | null;
    cpf: string | null;
    cnpj: string | null;
    inscricao_estadual: string | null;
    uf: string | null;
    rntrc_numero: string | null;
  } | null;
}

export interface DadosMdfe {
  op: Linha;
  pf: Linha | null;
  municipioEmitente: string | null;
  cte: { status: string | null; chave_acesso: string | null } | null;
  tracao: VeiculoMdfe | null;
  reboques: VeiculoMdfe[];
  carregamento: { codigo_ibge: string; cidade: string } | null;
  descarregamento: { codigo_ibge: string; cidade: string } | null;
  cotacao: {
    peso_bruto_kg: number | null;
    tipo_carga: string | null;
    produto: string | null;
    ncm: string | null;
    pedagio: number;
    teste_producao?: boolean;
  };
  // CEPs de carregamento/descarregamento (carga lotação): vêm dos endereços da NF-e (remetente / destinatário).
  cepCarregamento?: string | null;
  cepDescarregamento?: string | null;
  apolice: Linha | null;
  motorista: { pix: string | null; banco_codigo: string | null; banco_agencia: string | null } | null;
  cliente: { cnpj: string | null; cpf: string | null; razao_social: string | null } | null;
  ciotVpo: Linha | null;
  condicao: { valor_total_contrato: number | null; valor_adiantamento: number | null; saldo_prazo_dias: number | null } | null;
  agora: Date;
}

// Resposta de trava_teste_fiscal(operacao, 'mdfe'). Só ela decide se é teste em produção: o flag da cotação pode
// ter sido mexido, a trava confere RBR nos dois lados, cliente RBR e valores até R$ 5.
export function testeDaTrava(trava: unknown): boolean {
  return typeof trava === "object" && trava !== null && (trava as { teste?: unknown }).teste === true;
}

// CEP de carregamento: o do endereço do remetente na NF-e; quando o remetente é a própria RBR, o CEP do
// endereço da RBR em parametros_fiscais (a cotação costuma não trazer o endereço da RBR com CEP).
export function cepCarregamentoDe(
  remetenteCnpj: unknown,
  emitenteCnpj: unknown,
  enderecoRemetente: { cep?: unknown } | null | undefined,
  cepRbr: unknown,
): string | null {
  const daNota = digitos(enderecoRemetente?.cep);
  if (daNota.length === 8) return daNota;
  const remetenteEhRbr = digitos(remetenteCnpj).length === 14 && digitos(remetenteCnpj) === digitos(emitenteCnpj);
  return remetenteEhRbr && digitos(cepRbr).length === 8 ? digitos(cepRbr) : daNota || null;
}

export function digitos(v: unknown): string {
  return String(v ?? "").replace(/\D/g, "");
}

export function rntrc8(v: unknown): string {
  return digitos(v).replace(/^0+(?=\d{8}$)/, "");
}

export function dataEmissaoBrasilia(agora: Date): string {
  const local = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
  return `${local.toISOString().slice(0, 19)}-03:00`;
}

export function mapearTipoRodado(texto: string | null | undefined): string | null {
  const t = (texto ?? "").toLowerCase();
  if (!t) return null;
  if (t.includes("truck")) return "01";
  if (t.includes("toco")) return "02";
  if (t.includes("cavalo")) return "03";
  if (t.includes("van")) return "04";
  if (t.includes("utilit") || t.includes("fiorino") || t.includes(" hr") || t === "hr" || t.includes("3/4") || t.includes("vuc")) return "05";
  return null;
}

export function mapearTipoCarroceria(texto: string | null | undefined): string | null {
  const t = (texto ?? "").toLowerCase();
  if (!t) return null;
  if (t.includes("sider")) return "05";
  if (t.includes("container") || t.includes("conteiner")) return "04";
  if (t.includes("graneleir") || t.includes("granel")) return "03";
  if (t.includes("baú") || t.includes("bau") || t.includes("fechad")) return "02";
  if (t.includes("abert") || t.includes("grade") || t.includes("prancha")) return "01";
  if (t.includes("não aplic") || t.includes("nao aplic")) return "00";
  return null;
}

export function mapearTipoCarga(texto: string | null | undefined): string | null {
  const t = (texto ?? "").toLowerCase();
  if (!t) return null;
  const perigosa = t.includes("perigos");
  if (t.includes("granel") && t.includes("sólid")) return perigosa ? "07" : "01";
  if (t.includes("granel") && t.includes("líquid")) return perigosa ? "08" : "02";
  if (t.includes("neogranel")) return "06";
  if (t.includes("pressuriz")) return "12";
  if (t.includes("frigorific") || t.includes("refriger")) return perigosa ? "09" : "03";
  if (t.includes("conteiner") || t.includes("container")) return perigosa ? "10" : "04";
  if (t.includes("geral")) return perigosa ? "11" : "05";
  return null;
}

export function categoriaCombinacao(eixos: number | null | undefined): string | null {
  const mapa: Record<number, string> = { 2: "02", 3: "04", 4: "06", 5: "07", 6: "08", 7: "10", 8: "11" };
  return eixos != null ? (mapa[eixos] ?? null) : null;
}

function mapearResponsavelSeguro(texto: string | null | undefined): string | null {
  const t = (texto ?? "").toLowerCase();
  if (t.includes("emitente")) return "1";
  if (t.includes("contratante")) return "2";
  return null;
}

// SEFAZ: valores monetários com sempre 2 casas decimais (ex.: "0.40"); número da parcela com 3 dígitos ("001").
function dinheiro(v: number): string {
  return (Math.round(v * 100) / 100).toFixed(2);
}

function dataMaisDias(base: Date, dias: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

function inteiro(v: unknown): number | null {
  const n = Number(v);
  return v != null && v !== "" && Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

// Proprietario: so quando o veiculo NAO e da frota da RBR. tpProp: 1 = TAC independente (PF), 2 = outros (PJ).
function proprietario(v: VeiculoMdfe, rotulo: string, bloqueio: Bloquear) {
  if (v.is_veiculo_proprio) return null;
  const t = v.titular;
  if (!t) {
    bloqueio("sefaz", `${rotulo}: sem proprietário (titular) vinculado — obrigatório no MDF-e quando o veículo não é da frota da RBR.`);
    return null;
  }
  if (!t.cpf && !t.cnpj) bloqueio("sefaz", `${rotulo}: proprietário sem CPF/CNPJ cadastrado.`);
  const rntrcProp = rntrc8(t.rntrc_numero);
  if (rntrcProp.length !== 8) bloqueio("antt", `${rotulo}: proprietário sem RNTRC (8 dígitos) — obrigatório no MDF-e.`);
  if (!t.uf) bloqueio("sefaz", `${rotulo}: proprietário sem UF cadastrada.`);
  return {
    doc: t.cnpj ? { tipo: "cnpj" as const, valor: digitos(t.cnpj) } : { tipo: "cpf" as const, valor: digitos(t.cpf) },
    rntrc: rntrcProp,
    nome: t.nome,
    ie: t.inscricao_estadual || "ISENTO",
    uf: t.uf,
    tipo: t.cnpj ? "2" : "1",
  };
}

export function montarMdfe(
  d: DadosMdfe,
): { ambiente: string; bloqueios: string[]; avisos: string[]; regras: ItemRegra[]; payload: Linha } {
  const { op, pf } = d;
  const ambiente = op.ambiente_fiscal === "producao" ? "producao" : "homologacao";
  const bloqueios: string[] = [];
  const avisos: string[] = [];
  const regras: ItemRegra[] = [];
  const bloqueio: Bloquear = (origem, mensagem) => {
    bloqueios.push(mensagem);
    regras.push({ tipo: "bloqueio", origem, mensagem });
  };
  const aviso = (origem: OrigemRegra, mensagem: string) => {
    avisos.push(mensagem);
    regras.push({ tipo: "aviso", origem, mensagem });
  };
  const cnpjEmitente = digitos(op.emitente_cnpj);
  // Dois conceitos separados: homologação (sem validade fiscal) e teste em produção (só pela trava_teste_fiscal).
  const homologacao = ambiente === "homologacao";
  const teste = d.cotacao.teste_producao === true;

  if (!d.cte || d.cte.status !== "emitido" || !d.cte.chave_acesso) {
    bloqueio("sefaz", "O CT-e desta operação ainda não está autorizado (status 'emitido' com chave de acesso) — o MDF-e só pode ser emitido depois do CT-e, porque ele referencia a chave do CT-e.",);
  }
  if (!op.ie_configurada) bloqueio("sefaz", "Inscrição Estadual da RBR ainda não cadastrada em parametros_fiscais.inscricao_estadual.");
  if (!op.veiculo_id) bloqueio("sefaz", "Nenhum veículo alocado nesta operação.");
  if (op.veiculo_id && !op.veiculo_rntrc_ativo) bloqueio("antt", "RNTRC do veículo não está ativo.");
  if (!op.motorista_id) bloqueio("sefaz", "Nenhum motorista alocado nesta operação.");
  if (op.motorista_id && !op.motorista_rntrc_ativo) bloqueio("antt", "RNTRC do motorista não está ativo.");
  if (op.motorista_id && digitos(op.motorista_cpf).length !== 11) bloqueio("sefaz", "Motorista sem CPF (11 dígitos) — obrigatório no condutor do MDF-e.");
  if (!op.uf_origem || !op.uf_destino) bloqueio("sefaz", "Cotação sem UF de origem/destino preenchidas.");

  const v = d.tracao;
  let tipoRodado: string | null = null;
  let carroceriaTracao: string | null = null;
  let propTracao: ReturnType<typeof proprietario> = null;
  if (v) {
    if (!inteiro(v.tara_kg)) bloqueio("sefaz", "Veículo de tração sem tara (kg) cadastrada — obrigatória no MDF-e.");
    if (!v.uf_licenciamento) bloqueio("sefaz", "Veículo de tração sem UF de licenciamento cadastrada.");
    tipoRodado = mapearTipoRodado(v.tipo_veiculo);
    if (!tipoRodado) {
      bloqueio("sefaz", `Não consegui identificar o tipo de rodado do veículo a partir do cadastro ("${v.tipo_veiculo ?? "vazio"}") — ajuste o cadastro do veículo (truck, toco, cavalo, van, utilitário).`,);
    }
    carroceriaTracao = tipoRodado === "03" ? "00" : mapearTipoCarroceria(v.tipo_carroceria);
    if (!carroceriaTracao) {
      bloqueio("sefaz", `Não consegui identificar o tipo de carroceria do veículo a partir do cadastro ("${v.tipo_carroceria ?? "vazio"}") — ajuste o cadastro (aberta, baú/fechada, sider, graneleira, container).`,);
    }
    propTracao = proprietario(v, "Veículo de tração", bloqueio);
  }

  if (tipoRodado === "03" && d.reboques.length === 0) {
    bloqueio("sefaz", "Cavalo mecânico sem reboque/semirreboque vinculado à operação — o MDF-e exige a carreta (veiculos_reboque).");
  }
  if (d.reboques.length > 3) bloqueio("sefaz", "O MDF-e aceita no máximo 3 reboques por veículo de tração.");
  const veiculosReboque = d.reboques.slice(0, 3).map((r, i) => {
    const rotulo = `Reboque ${i + 1} (${r.placa ?? "sem placa"})`;
    if (!r.placa) bloqueio("sefaz", `${rotulo}: sem placa.`);
    if (!inteiro(r.tara_kg)) bloqueio("sefaz", `${rotulo}: sem tara (kg) cadastrada.`);
    if (!inteiro(r.capacidade_carga)) bloqueio("sefaz", `${rotulo}: sem capacidade (kg) cadastrada.`);
    if (!r.uf_licenciamento) bloqueio("sefaz", `${rotulo}: sem UF de licenciamento.`);
    const carroceria = mapearTipoCarroceria(r.tipo_carroceria);
    if (!carroceria) bloqueio("sefaz", `${rotulo}: tipo de carroceria não reconhecido ("${r.tipo_carroceria ?? "vazio"}").`);
    const prop = proprietario(r, rotulo, bloqueio);
    return {
      placa: r.placa,
      renavam: digitos(r.renavam) || undefined,
      tara: inteiro(r.tara_kg),
      capacidade_kg: inteiro(r.capacidade_carga),
      ...(prop
        ? {
          [prop.doc.tipo === "cnpj" ? "cnpj_proprietario" : "cpf_proprietario"]: prop.doc.valor,
          rntrc: prop.rntrc,
          razao_social_proprietario: prop.nome,
          inscricao_estadual_proprietario: prop.ie,
          uf_proprietario: prop.uf,
          tipo_proprietario: prop.tipo,
        }
        : {}),
      tipo_carroceria: carroceria,
      uf_licenciamento: r.uf_licenciamento,
    };
  });

  if (!d.carregamento) {
    bloqueio("sefaz", `Município de carregamento "${op.cidade_origem ?? "vazio"}/${op.uf_origem ?? ""}" não foi encontrado na tabela do IBGE (confira a grafia da cidade e a UF na cotação).`,);
  }
  if (!d.descarregamento) {
    bloqueio("sefaz", `Município de descarregamento "${op.cidade_destino ?? "vazio"}/${op.uf_destino ?? ""}" não foi encontrado na tabela do IBGE (confira a grafia da cidade e a UF na cotação).`,);
  }
  const pesoBrutoKg = d.cotacao.peso_bruto_kg;
  if (!pesoBrutoKg || pesoBrutoKg <= 0) bloqueio("sefaz", "Cotação sem peso bruto da carga (kg) — totalizador do MDF-e.");
  const valorCarga = op.valor_nf != null ? Number(op.valor_nf) : null;
  if (!valorCarga || valorCarga <= 0) bloqueio("sefaz", "Cotação sem valor da carga (valor da NF) — totalizador do MDF-e.");
  // Tipo de carga: vazio na cotacao assume Carga geral (05) e avisa (regra da RBR); preenchido e nao reconhecido bloqueia (SEFAZ).
  const tipoCargaVazio = !String(d.cotacao.tipo_carga ?? "").trim();
  const tipoCarga = tipoCargaVazio ? "05" : mapearTipoCarga(d.cotacao.tipo_carga);
  if (tipoCargaVazio) {
    aviso("rbr", "Cotação sem tipo de carga: assumido 'Carga geral' no MDF-e. Confira se a carga não é granel, frigorificada ou perigosa e ajuste o tipo na cotação se for o caso.");
  } else if (!tipoCarga) {
    bloqueio("sefaz", `Tipo de carga da cotação ("${d.cotacao.tipo_carga}") não reconhecido (ex.: carga geral, granel sólido, frigorificada) — obrigatório no MDF-e.`);
  }
  const descricaoProduto = d.cotacao.produto ? String(d.cotacao.produto).slice(0, 120) : null;
  if (!descricaoProduto) bloqueio("sefaz", "Cotação sem produto predominante da NF-e — obrigatório no MDF-e (descrição do produto).");
  const ncm = digitos(d.cotacao.ncm);
  // Regra da SEFAZ (carga lotação): NCM do produto predominante com 8 dígitos. Sempre bloqueia, inclusive em teste.
  if (ncm.length !== 8) {
    bloqueio("sefaz", "NCM do produto predominante (8 dígitos) não informado — a SEFAZ exige no MDF-e de carga lotação. Leia da NF-e ou preencha na cotação.");
  }

  // Carga lotação (SEFAZ: "O grupo de informações da carga lotação deve ser informado"): CEP de carregamento e descarregamento.
  const cepCarreg = digitos(d.cepCarregamento);
  const cepDescarreg = digitos(d.cepDescarregamento);
  // SEFAZ: bloqueia sempre, inclusive no teste e em homologação.
  if (cepCarreg.length !== 8 || cepDescarreg.length !== 8) {
    bloqueio(
      "sefaz",
      "CEP de carregamento e/ou descarregamento não encontrado (8 dígitos) nos endereços da NF-e — obrigatório no MDF-e de carga lotação.",
    );
  }

  const apolice = d.apolice;
  let respSeguro: string | null = null;
  if (!apolice) {
    bloqueio("antt", "Nenhuma apólice RCTR-C vigente cadastrada — obrigatória pro grupo seguros_carga do MDF-e.");
  } else {
    if (!apolice.numero_apolice || !apolice.seguradora_cnpj) {
      bloqueio("sefaz", "Apólice RCTR-C vigente sem número ou CNPJ da seguradora preenchidos.");
    }
    respSeguro = mapearResponsavelSeguro(apolice.responsavel_seguro);
    if (!respSeguro) {
      bloqueio("sefaz", `Campo responsavel_seguro da apólice RCTR-C ("${apolice.responsavel_seguro ?? "vazio"}") não reconhecido — use "emitente" ou "contratante".`);
    }
  }

  // Averbação do seguro: a SEFAZ (rej. 699) exige o número no grupo de seguros do MDF-e rodoviário.
  const numeroAverbacao = String(d.ciotVpo?.numero_averbacao ?? "").trim();
  // SEFAZ (rejeição 699): bloqueia sempre, inclusive no teste e em homologação.
  if (!numeroAverbacao) {
    bloqueio(
      "sefaz",
      "Número da averbação do seguro (RCTR-C) não informado — averbe o CT-e e preencha o número; a SEFAZ exige no MDF-e rodoviário.",
    );
  }

  if (!pf?.responsavel_tecnico_cnpj || !pf?.responsavel_tecnico_email) {
    bloqueio("sefaz", "Dados do responsável técnico incompletos em parametros_fiscais (cnpj/email).");
  }
  if (!pf?.endereco_logradouro || !pf?.endereco_numero || !pf?.endereco_bairro || !pf?.endereco_codigo_municipio) {
    bloqueio("sefaz", "Endereço do emitente incompleto em parametros_fiscais (logradouro/número/bairro/município) — obrigatório no MDF-e.");
  }
  const rntrcEmitente = digitos(pf?.rntrc).replace(/^0+(?=\d{8}$)/, "");
  if (rntrcEmitente.length !== 8) bloqueio("antt", "RNTRC da RBR (8 dígitos) não cadastrado em parametros_fiscais.rntrc — obrigatório no modal rodoviário.");

  const cliente = d.cliente;
  if (!cliente || (!cliente.cnpj && !cliente.cpf)) bloqueio("sefaz", "Cliente contratante sem CNPJ/CPF — obrigatório no grupo de contratantes do MDF-e.");

  const ciotVpo = d.ciotVpo;
  const ehTac = Boolean(v && !v.is_veiculo_proprio);
  const ciotNum = digitos(ciotVpo?.ciot);
  if (ehTac && ciotNum.length !== 12) {
    const msgCiot =
      "CIOT não informado (12 dígitos) — gere no portal da Repom e preencha aqui. Obrigatório quando o veículo é de transportador autônomo (TAC).";
    if (teste) {
      // Dispensa de teste (decisão do Pedro por causa da trava da Repom), não regra regulatória: a ANTT exige
      // CIOT do TAC (Portaria SUROC 6/2026) em operação real.
      aviso("info", `Teste em produção: ${msgCiot} Dispensa de teste: o MDF-e de teste segue sem CIOT.`);
    } else if (homologacao) {
      aviso("info", `Homologação: ${msgCiot} Sem validade fiscal: segue sem CIOT.`);
    } else {
      bloqueio("antt", msgCiot);
    }
  }
  const idvpo = digitos(ciotVpo?.vpo_idvpo);
  const vpoValor = ciotVpo?.vpo_valor != null ? Number(ciotVpo.vpo_valor) : null;
  if (d.cotacao.pedagio > 0) {
    if (!idvpo) bloqueio("antt", "Vale-Pedágio (IDVPO) não informado — a rota tem pedágio e o VPO é obrigatório (Lei 10.209/2001). Compre na Repom e preencha o IDVPO.");
    if (idvpo && !vpoValor) bloqueio("sefaz", "Valor do Vale-Pedágio não informado.");
    if (idvpo && !ciotVpo?.vpo_cnpj_fornecedora) bloqueio("sefaz", "CNPJ da empresa fornecedora do Vale-Pedágio (Repom) não informado.");
  }
  const eixosCombinacao = (v?.quantidade_eixos ?? 0) + d.reboques.reduce((s, r) => s + (r.quantidade_eixos ?? 0), 0) || null;

  const cond = d.condicao;
  const valorContratoFrete = cond?.valor_total_contrato != null ? Number(cond.valor_total_contrato) : null;
  const adiant = cond?.valor_adiantamento != null ? Number(cond.valor_adiantamento) : 0;
  const prazoDias = cond?.saldo_prazo_dias != null ? Number(cond.saldo_prazo_dias) : 0;
  const aPrazo = adiant > 0 || prazoDias > 0;
  let pagamentos: Linha[] | undefined;
  if (valorContratoFrete && valorContratoFrete > 0) {
    const componentesNum: { tipo: string; valor: number }[] = [{ tipo: "04", valor: valorContratoFrete }];
    if (vpoValor && vpoValor > 0) componentesNum.unshift({ tipo: "01", valor: vpoValor });
    const totalContrato = Math.round(componentesNum.reduce((a, c) => a + c.valor, 0) * 100) / 100;
    const componentes = componentesNum.map((c) => ({ tipo: c.tipo, valor: dinheiro(c.valor) }));
    const saldo = Math.round((valorContratoFrete - adiant) * 100) / 100;
    const parcelas = Array.isArray(ciotVpo?.pagto_parcelas) && ciotVpo.pagto_parcelas.length
      ? ciotVpo.pagto_parcelas
      : aPrazo && saldo > 0
      ? [{ numero: "001", data_vencimento: dataMaisDias(d.agora, prazoDias || 1), valor: dinheiro(saldo) }]
      : undefined;
    const pix = ciotVpo?.pagto_pix || d.motorista?.pix || undefined;
    const banco = ciotVpo?.pagto_banco || d.motorista?.banco_codigo || undefined;
    const agencia = ciotVpo?.pagto_agencia || d.motorista?.banco_agencia || undefined;
    const cnpjIpef = digitos(ciotVpo?.pagto_cnpj_ipef) || undefined;
    const destinoPagamento = pix
      ? { pix }
      : banco && agencia
      ? { numero_banco: banco, numero_agencia: agencia }
      : cnpjIpef
      ? { cnpj_instituicao_pagamento: cnpjIpef }
      : null;
    // Regra da RBR (C2.1): avisa e o MDF-e sai sem o grupo de pagamento; se a SEFAZ exigir, a rejeição dela aparece.
    if (!destinoPagamento) {
      aviso("rbr", "Destino de pagamento do motorista não definido (regra da RBR). Defina antes de pagar.");
    }
    pagamentos = !destinoPagamento
      ? undefined
      : [
        {
          nome: op.emitente_razao_social,
          cnpj: cnpjEmitente,
          componentes,
          valor_total_contrato: dinheiro(totalContrato),
          forma_pagamento: aPrazo ? "1" : "0",
          valor_adiantamento: aPrazo && adiant > 0 ? dinheiro(adiant) : undefined,
          indicador_adiantamento: aPrazo ? (adiant > 0 ? "1" : "0") : undefined,
          parcelas: aPrazo ? parcelas : undefined,
          tipo_permissao_antecipacao: aPrazo ? "0" : undefined,
          ...(destinoPagamento ?? {}),
        },
      ];
  } else if (ehTac) {
    // Regra da RBR (C2.2): avisa; o MDF-e sai sem o grupo de pagamento.
    aviso("rbr", "Condição de pagamento do motorista não definida (regra da RBR). Defina antes de pagar.");
  }

  if (homologacao) {
    aviso("info", "Homologação: o MDF-e cita a chave do CT-e de homologação desta operação — sem validade fiscal.");
  }

  const payload: Linha = {
    data_emissao: dataEmissaoBrasilia(d.agora),
    emitente: "1",
    // SEFAZ: o tipo de transportador (tpTransp) so pode ser informado quando ha proprietario do veiculo de tracao.
    // Com CPF de proprietario o tipo tem de ser TAC (2). Veiculo da frota da RBR (sem proprietario): campo omitido.
    tipo_transporte: propTracao ? (propTracao.doc.tipo === "cpf" ? "2" : "1") : undefined, // 1 = ETC, 2 = TAC
    uf_inicio: op.uf_origem,
    uf_fim: op.uf_destino,

    cnpj_emitente: cnpjEmitente,
    inscricao_estadual_emitente: op.emitente_ie,
    nome_emitente: op.emitente_razao_social,
    logradouro_emitente: pf?.endereco_logradouro,
    numero_emitente: pf?.endereco_numero,
    complemento_emitente: pf?.endereco_complemento || undefined,
    bairro_emitente: pf?.endereco_bairro,
    codigo_municipio_emitente: pf?.endereco_codigo_municipio,
    municipio_emitente: d.municipioEmitente,
    cep_emitente: digitos(pf?.endereco_cep) || undefined,
    uf_emitente: pf?.endereco_uf,
    telefone_emitente: digitos(pf?.telefone_contato) || undefined,
    email_emitente: pf?.email_contato || undefined,

    municipios_carregamento: d.carregamento ? [{ codigo: d.carregamento.codigo_ibge, nome: d.carregamento.cidade }] : [],
    // SEFAZ: cada município de descarga precisa ter seus documentos (infCTe) dentro dele ("Município sem documento").
    municipios_descarregamento: d.descarregamento
      ? [{
        codigo: d.descarregamento.codigo_ibge,
        nome: d.descarregamento.cidade,
        conhecimentos_transporte: [{ chave_cte: digitos(d.cte?.chave_acesso) || null }],
      }]
      : [],
    quantidade_total_cte: 1,

    tipo_carga: tipoCarga,
    descricao_produto: descricaoProduto,
    codigo_ncm_produto: ncm.length === 8 ? ncm : undefined,
    cep_carregamento: cepCarreg.length === 8 ? cepCarreg : undefined,
    cep_descarregamento: cepDescarreg.length === 8 ? cepDescarreg : undefined,

    valor_total_carga: valorCarga,
    codigo_unidade_medida_peso_bruto: "01",
    peso_bruto: pesoBrutoKg,

    seguros_carga: [
      {
        responsavel_seguro: respSeguro,
        cnpj_responsavel: cnpjEmitente,
        nome_seguradora: apolice?.seguradora_nome,
        cnpj_seguradora: digitos(apolice?.seguradora_cnpj),
        numero_apolice: apolice?.numero_apolice,
        numero_averbacao: numeroAverbacao ? [numeroAverbacao] : undefined,
      },
    ],

    modal_rodoviario: {
      registro_nacional_transporte: rntrcEmitente || undefined,
      ciot: ciotNum.length === 12
        ? [{ ciot: ciotNum, cnpj_responsavel: digitos(ciotVpo?.ciot_cnpj_responsavel) || cnpjEmitente }]
        : undefined,
      dispositivos_vale_pedagio: idvpo
        ? [
          {
            cnpj_empresa_fornecedora: digitos(ciotVpo?.vpo_cnpj_fornecedora),
            cnpj_responsavel_pagamento: cnpjEmitente,
            numero_comprovante_compra: idvpo,
            valor_vale_pedagio: vpoValor != null ? dinheiro(vpoValor) : vpoValor,
            tipo_vale_pedagio: ciotVpo?.vpo_tipo || undefined,
            categoria_combinacao_veicular: ciotVpo?.vpo_categoria_combinacao || categoriaCombinacao(eixosCombinacao) ||
              undefined,
          },
        ]
        : undefined,
      contratantes: cliente
        ? [{ nome: cliente.razao_social, ...(cliente.cnpj ? { cnpj: digitos(cliente.cnpj) } : { cpf: digitos(cliente.cpf) }) }]
        : [],
      pagamentos,

      placa_veiculo: v?.placa,
      renavam_veiculo: digitos(v?.renavam) || undefined,
      tara_veiculo: inteiro(v?.tara_kg),
      capacidade_kg_veiculo: inteiro(v?.capacidade_carga) ?? undefined,
      ...(propTracao
        ? {
          [propTracao.doc.tipo === "cnpj" ? "cnpj_proprietario_veiculo" : "cpf_proprietario_veiculo"]: propTracao.doc.valor,
          rntrc_proprietario_veiculo: propTracao.rntrc,
          razao_social_proprietario_veiculo: propTracao.nome,
          inscricao_estadual_proprietario_veiculo: propTracao.ie,
          uf_proprietario_veiculo: propTracao.uf,
          tipo_proprietario_veiculo: propTracao.tipo,
        }
        : {}),
      condutores: [{ nome: op.motorista_nome, cpf: digitos(op.motorista_cpf) }],
      tipo_rodado_veiculo: tipoRodado,
      tipo_carroceria_veiculo: carroceriaTracao,
      uf_licenciamento_veiculo: v?.uf_licenciamento,
      veiculos_reboque: veiculosReboque.length ? veiculosReboque : undefined,
    },

    cnpj_responsavel_tecnico: digitos(pf?.responsavel_tecnico_cnpj) || undefined,
    contato_responsavel_tecnico: pf?.responsavel_tecnico_contato || "RBR Cargo",
    email_responsavel_tecnico: pf?.responsavel_tecnico_email,
    telefone_responsavel_tecnico: digitos(pf?.responsavel_tecnico_telefone) || undefined,
  };

  return { ambiente, bloqueios, avisos, regras, payload };
}
