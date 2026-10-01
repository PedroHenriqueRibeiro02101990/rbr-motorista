// Edge Function: emitir-mdfe
//
// Emite o MDF-e de uma operação via Focus NFe (POST /v2/mdfe, resposta assíncrona 202).
// Pré-requisito: CT-e já AUTORIZADO (status 'emitido' + chave) — o MDF-e referencia a chave do CT-e.
//
// v3 (2026-10-01): alinhado à doc completa da Focus (campos.focusnfe.com.br/mdfe/MDFeXML.html +
// TransporteRodoviarioXML.html): condutores DENTRO de veiculo_tracao, uf_licenciamento, códigos de 2 dígitos
// (tpRod/tpCar), responsável técnico em campos planos, RNTRC do emitente (registro_nacional_transporte),
// tipo_carga/descricao_produto/NCM, proprietário do veículo (TAC), e os blocos novos do modal rodoviário:
// ciot, dispositivos_vale_pedagio (IDVPO), contratantes e pagamentos (IPEF). CIOT/VPO vêm de
// operacao_ciot_vpo (manual pelo portal da Repom ou, no futuro, por API).
// v2 (2026-10-01): (1) modo `previa: true` — devolve o payload que SERIA enviado + bloqueios, sem gravar
// nem chamar a Focus (alimenta o card de conferência da tela Fiscal); (2) campos conforme
// campos.focusnfe.com.br/mdfe: seguros_carga (plural), municipios_descarregamento, valor_total_carga,
// codigo_unidade_medida_peso_bruto, peso_bruto, dados do emitente. Subgrupos veiculo_tracao/condutores
// seguem a convenção snake_case da Focus (a doc pública não detalha) — se a Focus recusar, o erro dela
// aparece em documentacao_operacao.mensagem_erro e é só ajustar o nome do campo.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function somenteDigitos(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

// Códigos SEFAZ padrão -- tpRod (2 dígitos).
function mapearTipoRodado(texto: string | null | undefined): string | null {
  const t = (texto ?? "").toLowerCase();
  if (!t) return null;
  if (t.includes("truck")) return "01";
  if (t.includes("toco")) return "02";
  if (t.includes("cavalo")) return "03";
  if (t.includes("van")) return "04";
  if (t.includes("utilit") || t.includes("fiorino") || t.includes(" hr") || t === "hr" || t.includes("3/4") || t.includes("vuc")) return "05";
  return null;
}

// Códigos SEFAZ padrão -- tpCar (2 dígitos).
function mapearTipoCarroceria(texto: string | null | undefined): string | null {
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

// tpCarga (Resolução ANTT 5.849/2019).
function mapearTipoCarga(texto: string | null | undefined): string | null {
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

// categCombVeic a partir da quantidade de eixos.
function categoriaCombinacao(eixos: number | null | undefined): string | null {
  const mapa: Record<number, string> = { 2: "02", 3: "04", 4: "06", 5: "07", 6: "08", 7: "10", 8: "11" };
  return eixos != null ? (mapa[eixos] ?? null) : null;
}

function dataMaisDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

function mapearResponsavelSeguro(texto: string | null | undefined): string | null {
  const t = (texto ?? "").toLowerCase();
  if (t.includes("emitente")) return "1";
  if (t.includes("contratante")) return "2";
  return null;
}

async function buscarMunicipio(
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: any,
  cidade: string | null,
  uf: string | null,
): Promise<{ codigo_ibge: string; cidade: string } | null> {
  if (!cidade || !uf) return null;
  // Tolerante a acento/caixa ("SAO PAULO" == "São Paulo"); tabela carregada com os 5.571 municípios do IBGE.
  const { data } = await supabaseAdmin.rpc("buscar_municipio", { p_cidade: cidade, p_uf: uf });
  return Array.isArray(data) && data.length ? data[0] : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const { operacao_id, previa } = await req.json();
    if (!operacao_id || typeof operacao_id !== "string") {
      return jsonResponse({ sucesso: false, erro: "Informe operacao_id." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseAsUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await supabaseAsUser.auth.getUser();
    if (userError || !userData?.user) {
      return jsonResponse({ sucesso: false, erro: "Não autenticado" }, 401);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: pessoaAtor } = await supabaseAdmin
      .from("pessoas")
      .select("papel")
      .eq("auth_user_id", userData.user.id)
      .maybeSingle();
    if (!pessoaAtor || pessoaAtor.papel !== "gestor_rbr") {
      return jsonResponse({ sucesso: false, erro: "Só um gestor RBR pode emitir MDF-e." }, 403);
    }

    const { data: op, error: opError } = await supabaseAdmin
      .from("v_checklist_prontidao")
      .select("*")
      .eq("operacao_id", operacao_id)
      .maybeSingle();

    if (opError || !op) {
      return jsonResponse({ sucesso: false, erro: "Operação não encontrada." }, 404);
    }

    const bloqueios: string[] = [];
    const hoje = new Date().toISOString().slice(0, 10);

    const { data: cteDoc } = await supabaseAdmin
      .from("documentacao_operacao")
      .select("status, chave_acesso")
      .eq("operacao_id", operacao_id)
      .eq("tipo", "cte")
      .maybeSingle();

    if (!cteDoc || cteDoc.status !== "emitido" || !cteDoc.chave_acesso) {
      bloqueios.push(
        "O CT-e desta operação ainda não está autorizado (status 'emitido' com chave de acesso) — o MDF-e só pode ser emitido depois do CT-e, porque ele referencia a chave do CT-e.",
      );
    }

    if (!op.ie_configurada) bloqueios.push("Inscrição Estadual da RBR ainda não cadastrada em parametros_fiscais.inscricao_estadual.");
    if (!op.veiculo_id) bloqueios.push("Nenhum veículo alocado nesta operação.");
    if (op.veiculo_id && !op.veiculo_rntrc_ativo) bloqueios.push("RNTRC do veículo não está ativo.");
    if (!op.motorista_id) bloqueios.push("Nenhum motorista alocado nesta operação.");
    if (op.motorista_id && !op.motorista_rntrc_ativo) bloqueios.push("RNTRC do motorista não está ativo.");
    if (!op.uf_origem || !op.uf_destino) bloqueios.push("Cotação sem UF de origem/destino preenchidas.");

    // deno-lint-ignore no-explicit-any
    let veiculo: Record<string, any> | null = null;
    if (op.veiculo_id) {
      const { data: v } = await supabaseAdmin
        .from("veiculos")
        .select("placa, renavam, tara_kg, capacidade_carga, tipo_veiculo, tipo_carroceria, uf_licenciamento, titular_id, is_veiculo_proprio, quantidade_eixos")
        .eq("id", op.veiculo_id)
        .maybeSingle();
      veiculo = v;
    }

    let tipoRodado: string | null = null;
    let tipoCarroceria: string | null = null;
    if (veiculo) {
      if (!veiculo.tara_kg) bloqueios.push("Veículo sem tara (peso) cadastrada -- obrigatório no MDF-e.");
      if (!veiculo.uf_licenciamento) bloqueios.push("Veículo sem UF de licenciamento cadastrada.");
      tipoRodado = mapearTipoRodado(veiculo.tipo_veiculo);
      if (!tipoRodado) {
        bloqueios.push(
          `Não consegui identificar o tipo de rodado do veículo a partir do cadastro ("${veiculo.tipo_veiculo ?? "vazio"}") -- ajuste o cadastro do veículo (truck, toco, cavalo, van, utilitário).`,
        );
      }
      if (tipoRodado === "03") {
        bloqueios.push(
          "Cavalo mecânico exige a placa da carreta/semirreboque no MDF-e (veiculos_reboque), e o sistema ainda não vincula reboque à operação.",
        );
      }
      tipoCarroceria = mapearTipoCarroceria(veiculo.tipo_carroceria);
      if (!tipoCarroceria) {
        bloqueios.push(
          `Não consegui identificar o tipo de carroceria do veículo a partir do cadastro ("${veiculo.tipo_carroceria ?? "vazio"}") -- ajuste o cadastro (aberta, baú/fechada, sider, graneleira, container).`,
        );
      }
    }

    // Proprietário do veículo (obrigatório quando o caminhão é de TAC parceiro; omitido se o veículo é da própria RBR).
    // deno-lint-ignore no-explicit-any
    let titular: Record<string, any> | null = null;
    if (veiculo && !veiculo.is_veiculo_proprio) {
      if (!veiculo.titular_id) {
        bloqueios.push("Veículo sem proprietário (titular) vinculado -- obrigatório no MDF-e quando o veículo não é da RBR.");
      } else {
        const { data: t } = await supabaseAdmin
          .from("pessoas")
          .select("nome, cpf, cnpj, uf, rntrc_numero, tipo_pessoa_doc")
          .eq("id", veiculo.titular_id)
          .maybeSingle();
        titular = t;
        if (!t) {
          bloqueios.push("Proprietário (titular) do veículo não encontrado no cadastro de pessoas.");
        } else {
          if (!t.cpf && !t.cnpj) bloqueios.push("Proprietário do veículo sem CPF/CNPJ cadastrado.");
          if (!t.rntrc_numero) bloqueios.push("Proprietário do veículo sem RNTRC cadastrado -- obrigatório no MDF-e.");
          if (!t.uf) bloqueios.push("Proprietário do veículo sem UF cadastrada.");
        }
      }
    }

    const munCarregamento = await buscarMunicipio(supabaseAdmin, op.cidade_origem, op.uf_origem);
    if (!munCarregamento) {
      bloqueios.push(
        `Município de carregamento "${op.cidade_origem ?? "vazio"}/${op.uf_origem ?? ""}" não está em municipios_ibge (código IBGE necessário pro MDF-e).`,
      );
    }
    const munDescarregamento = await buscarMunicipio(supabaseAdmin, op.cidade_destino, op.uf_destino);
    if (!munDescarregamento) {
      bloqueios.push(
        `Município de descarregamento "${op.cidade_destino ?? "vazio"}/${op.uf_destino ?? ""}" não está em municipios_ibge (código IBGE necessário pro MDF-e).`,
      );
    }

    // Cotação: peso, tipo de carga, produto predominante, NCM e pedágio.
    let pesoBrutoKg: number | null = null;
    let tipoCarga: string | null = null;
    let descricaoProduto: string | null = null;
    let ncm: string | null = null;
    let pedagioCotacao = 0;
    if (op.cotacao_id) {
      const { data: cot } = await supabaseAdmin
        .from("cotacoes")
        .select("peso_bruto_kg, tipo_carga, nf_produto_predominante, ncms_produtos, pedagio")
        .eq("id", op.cotacao_id)
        .maybeSingle();
      pesoBrutoKg = cot?.peso_bruto_kg != null ? Number(cot.peso_bruto_kg) : null;
      tipoCarga = mapearTipoCarga(cot?.tipo_carga);
      descricaoProduto = cot?.nf_produto_predominante ? String(cot.nf_produto_predominante).slice(0, 120) : null;
      const ncmBruto = Array.isArray(cot?.ncms_produtos) && cot.ncms_produtos.length ? String(cot.ncms_produtos[0]) : (op.ncm as string | null);
      ncm = somenteDigitos(ncmBruto) || null;
      pedagioCotacao = Number(cot?.pedagio ?? 0);
    }
    if (!pesoBrutoKg || pesoBrutoKg <= 0) bloqueios.push("Cotação sem peso bruto da carga (kg) — totalizador do MDF-e.");
    const valorCarga = op.valor_nf != null ? Number(op.valor_nf) : null;
    if (!valorCarga || valorCarga <= 0) bloqueios.push("Cotação sem valor da carga (valor da NF) — totalizador do MDF-e.");
    if (!tipoCarga) bloqueios.push("Cotação sem tipo de carga reconhecido (ex.: carga geral, granel sólido, frigorificada) — obrigatório no MDF-e.");
    if (!descricaoProduto) bloqueios.push("Cotação sem produto predominante da NF-e — obrigatório no MDF-e (descrição do produto).");

    const { data: apolice } = await supabaseAdmin
      .from("apolices_seguro")
      .select("seguradora_nome, seguradora_cnpj, numero_apolice, responsavel_seguro")
      .eq("tipo", "RCTR-C")
      .lte("vigencia_inicio", hoje)
      .or(`vigencia_fim.is.null,vigencia_fim.gte.${hoje}`)
      .maybeSingle();

    let respSeguro: string | null = null;
    if (!apolice) {
      bloqueios.push("Nenhuma apólice RCTR-C vigente cadastrada -- obrigatória pro grupo seguros_carga do MDF-e.");
    } else {
      if (!apolice.numero_apolice || !apolice.seguradora_cnpj) {
        bloqueios.push("Apólice RCTR-C vigente sem número ou CNPJ da seguradora preenchidos.");
      }
      respSeguro = mapearResponsavelSeguro(apolice.responsavel_seguro);
      if (!respSeguro) {
        bloqueios.push(`Campo responsavel_seguro da apólice RCTR-C ("${apolice.responsavel_seguro ?? "vazio"}") não reconhecido -- use "emitente" ou "contratante".`);
      }
    }

    const { data: pf } = await supabaseAdmin
      .from("parametros_fiscais")
      .select(
        "responsavel_tecnico_cnpj, responsavel_tecnico_contato, responsavel_tecnico_email, responsavel_tecnico_telefone, endereco_logradouro, endereco_numero, endereco_complemento, endereco_bairro, endereco_cep, endereco_uf, endereco_codigo_municipio, rntrc, telefone_contato, email_contato",
      )
      .eq("id", op.parametros_fiscais_id)
      .maybeSingle();
    if (!pf?.responsavel_tecnico_cnpj || !pf?.responsavel_tecnico_email) {
      bloqueios.push("Dados do responsável técnico incompletos em parametros_fiscais (cnpj/email).");
    }
    if (!pf?.endereco_logradouro || !pf?.endereco_numero || !pf?.endereco_bairro || !pf?.endereco_codigo_municipio) {
      bloqueios.push("Endereço do emitente incompleto em parametros_fiscais (logradouro/número/bairro/município) — obrigatório no MDF-e.");
    }
    const rntrcEmitente = somenteDigitos(pf?.rntrc as string);
    if (rntrcEmitente.length !== 8) bloqueios.push("RNTRC da RBR (8 dígitos) não cadastrado em parametros_fiscais.rntrc — obrigatório no modal rodoviário.");

    let municipioEmitente: string | null = null;
    if (pf?.endereco_codigo_municipio) {
      const { data: m } = await supabaseAdmin
        .from("municipios_ibge")
        .select("cidade")
        .eq("codigo_ibge", String(pf.endereco_codigo_municipio))
        .maybeSingle();
      municipioEmitente = m?.cidade ?? null;
    }

    // Motorista (conta/PIX para o pagamento do frete) e cliente contratante.
    // deno-lint-ignore no-explicit-any
    let motoristaPessoa: Record<string, any> | null = null;
    if (op.motorista_id) {
      const { data: m } = await supabaseAdmin
        .from("pessoas")
        .select("banco_codigo, banco_agencia, pix")
        .eq("id", op.motorista_id)
        .maybeSingle();
      motoristaPessoa = m;
    }
    const { data: opRow } = await supabaseAdmin.from("operacoes").select("cliente_id").eq("id", operacao_id).maybeSingle();
    // deno-lint-ignore no-explicit-any
    let cliente: Record<string, any> | null = null;
    if (opRow?.cliente_id) {
      const { data: c } = await supabaseAdmin.from("clientes").select("cnpj, cpf, razao_social").eq("id", opRow.cliente_id).maybeSingle();
      cliente = c;
    }
    if (!cliente || (!cliente.cnpj && !cliente.cpf)) bloqueios.push("Cliente contratante sem CNPJ/CPF — obrigatório no grupo de contratantes do MDF-e.");

    // CIOT / VPO / pagamento do frete.
    const { data: ciotVpo } = await supabaseAdmin.from("operacao_ciot_vpo").select("*").eq("operacao_id", operacao_id).maybeSingle();
    const { data: cond } = await supabaseAdmin
      .from("condicoes_pagamento_operacao")
      .select("valor_total_contrato, valor_adiantamento, saldo_prazo_dias")
      .eq("operacao_id", operacao_id)
      .maybeSingle();

    const ehTac = !!veiculo && !veiculo.is_veiculo_proprio;
    const ciotNum = somenteDigitos(ciotVpo?.ciot as string);
    if (ehTac && ciotNum.length !== 12) {
      bloqueios.push("CIOT não informado (12 dígitos) — gere no portal da Repom e preencha aqui. Obrigatório quando o veículo é de transportador autônomo (TAC).");
    }
    const idvpo = somenteDigitos(ciotVpo?.vpo_idvpo as string);
    const vpoValor = ciotVpo?.vpo_valor != null ? Number(ciotVpo.vpo_valor) : null;
    if (pedagioCotacao > 0) {
      if (!idvpo) bloqueios.push("Vale-Pedágio (IDVPO) não informado — a rota tem pedágio e o VPO é obrigatório (Lei 10.209/2001). Compre na Repom e preencha o IDVPO.");
      if (idvpo && !vpoValor) bloqueios.push("Valor do Vale-Pedágio não informado.");
      if (idvpo && !ciotVpo?.vpo_cnpj_fornecedora) bloqueios.push("CNPJ da empresa fornecedora do Vale-Pedágio (Repom) não informado.");
    }

    // Pagamento do frete (infPag) — só quando há valor de contrato conhecido.
    const valorContratoFrete = cond?.valor_total_contrato != null ? Number(cond.valor_total_contrato) : null;
    const adiant = cond?.valor_adiantamento != null ? Number(cond.valor_adiantamento) : 0;
    const prazoDias = cond?.saldo_prazo_dias != null ? Number(cond.saldo_prazo_dias) : 0;
    const aPrazo = adiant > 0 || prazoDias > 0;
    // deno-lint-ignore no-explicit-any
    let pagamentos: any[] | undefined;
    if (valorContratoFrete && valorContratoFrete > 0) {
      const componentes: { tipo: string; valor: number }[] = [{ tipo: "04", valor: valorContratoFrete }];
      if (vpoValor && vpoValor > 0) componentes.unshift({ tipo: "01", valor: vpoValor });
      const totalContrato = Math.round(componentes.reduce((a, c) => a + c.valor, 0) * 100) / 100;
      const saldo = Math.round((valorContratoFrete - adiant) * 100) / 100;
      const parcelas =
        Array.isArray(ciotVpo?.pagto_parcelas) && ciotVpo.pagto_parcelas.length
          ? ciotVpo.pagto_parcelas
          : aPrazo && saldo > 0
            ? [{ numero: 1, data_vencimento: dataMaisDias(prazoDias || 1), valor: saldo }]
            : undefined;
      const pix = (ciotVpo?.pagto_pix as string) || (motoristaPessoa?.pix as string) || undefined;
      const banco = (ciotVpo?.pagto_banco as string) || (motoristaPessoa?.banco_codigo as string) || undefined;
      const agencia = (ciotVpo?.pagto_agencia as string) || (motoristaPessoa?.banco_agencia as string) || undefined;
      const cnpjIpef = somenteDigitos(ciotVpo?.pagto_cnpj_ipef as string) || undefined;
      const destinoPagamento = pix
        ? { pix }
        : banco && agencia
          ? { numero_banco: banco, numero_agencia: agencia }
          : cnpjIpef
            ? { cnpj_instituicao_pagamento: cnpjIpef }
            : null;
      if (!destinoPagamento) bloqueios.push("Pagamento do frete sem destino (PIX, banco/agência ou IPEF) — cadastre o PIX do motorista.");
      pagamentos = [
        {
          nome: op.emitente_razao_social,
          cnpj: somenteDigitos(op.emitente_cnpj as string),
          componentes,
          valor_total_contrato: totalContrato,
          forma_pagamento: aPrazo ? "1" : "0",
          valor_adiantamento: aPrazo && adiant > 0 ? adiant : undefined,
          indicador_adiantamento: aPrazo ? (adiant > 0 ? "1" : "0") : undefined,
          parcelas: aPrazo ? parcelas : undefined,
          tipo_permissao_antecipacao: aPrazo ? "0" : undefined,
          ...(destinoPagamento ?? {}),
        },
      ];
    } else if (ehTac) {
      bloqueios.push("Condição de pagamento do motorista (valor do contrato) ainda não definida na operação — obrigatória no MDF-e.");
    }

    const ref = `rbr-mdfe-${operacao_id}`;

    const payload = {
      data_emissao: new Date().toISOString(),
      emitente: "1", // 1 = prestador de serviço de transporte
      tipo_transporte: "1", // 1 = ETC
      uf_inicio: op.uf_origem,
      uf_fim: op.uf_destino,

      cnpj_emitente: somenteDigitos(op.emitente_cnpj as string),
      inscricao_estadual_emitente: op.emitente_ie,
      nome_emitente: op.emitente_razao_social,
      logradouro_emitente: pf?.endereco_logradouro,
      numero_emitente: pf?.endereco_numero,
      complemento_emitente: pf?.endereco_complemento || undefined,
      bairro_emitente: pf?.endereco_bairro,
      codigo_municipio_emitente: pf?.endereco_codigo_municipio,
      municipio_emitente: municipioEmitente,
      cep_emitente: somenteDigitos(pf?.endereco_cep as string) || undefined,
      uf_emitente: pf?.endereco_uf,
      telefone_emitente: somenteDigitos(pf?.telefone_contato as string) || undefined,
      email_emitente: pf?.email_contato || undefined,

      municipios_carregamento: munCarregamento ? [{ codigo: munCarregamento.codigo_ibge, nome: munCarregamento.cidade }] : [],
      municipios_descarregamento: munDescarregamento ? [{ codigo: munDescarregamento.codigo_ibge, nome: munDescarregamento.cidade }] : [],

      conhecimentos_transporte: [{ chave_cte: cteDoc?.chave_acesso ?? null }],
      quantidade_total_cte: 1,

      tipo_carga: tipoCarga,
      descricao_produto: descricaoProduto,
      codigo_ncm_produto: ncm && ncm.length === 8 ? ncm : undefined,

      valor_total_carga: valorCarga,
      codigo_unidade_medida_peso_bruto: "01", // 01 = KG
      peso_bruto: pesoBrutoKg,

      seguros_carga: [
        {
          responsavel_seguro: respSeguro,
          cnpj_responsavel: somenteDigitos(op.emitente_cnpj as string),
          nome_seguradora: apolice?.seguradora_nome,
          cnpj_seguradora: somenteDigitos(apolice?.seguradora_cnpj as string),
          numero_apolice: apolice?.numero_apolice,
        },
      ],

      // --- Modal rodoviário ---
      registro_nacional_transporte: rntrcEmitente || undefined,
      ciot: ciotNum.length === 12 ? [{ ciot: ciotNum, cnpj_responsavel: somenteDigitos(ciotVpo?.ciot_cnpj_responsavel as string) || somenteDigitos(op.emitente_cnpj as string) }] : undefined,
      dispositivos_vale_pedagio: idvpo
        ? [
            {
              cnpj_empresa_fornecedora: somenteDigitos(ciotVpo?.vpo_cnpj_fornecedora as string),
              cnpj_responsavel_pagamento: somenteDigitos(op.emitente_cnpj as string),
              numero_comprovante_compra: idvpo,
              valor_vale_pedagio: vpoValor,
              tipo_vale_pedagio: ciotVpo?.vpo_tipo || undefined,
              categoria_combinacao_veicular: ciotVpo?.vpo_categoria_combinacao || categoriaCombinacao(veiculo?.quantidade_eixos) || undefined,
            },
          ]
        : undefined,
      contratantes: cliente
        ? [
            {
              nome: cliente.razao_social,
              ...(cliente.cnpj ? { cnpj: somenteDigitos(cliente.cnpj) } : { cpf: somenteDigitos(cliente.cpf) }),
            },
          ]
        : [],
      pagamentos,

      veiculo_tracao: {
        placa: veiculo?.placa,
        renavam: veiculo?.renavam || undefined,
        tara: veiculo?.tara_kg,
        capacidade_kg: veiculo?.capacidade_carga || undefined,
        tipo_rodado: tipoRodado,
        tipo_carroceria: tipoCarroceria,
        uf_licenciamento: veiculo?.uf_licenciamento,
        ...(titular
          ? {
              ...(titular.cnpj ? { cnpj_proprietario: somenteDigitos(titular.cnpj) } : { cpf_proprietario: somenteDigitos(titular.cpf) }),
              rntrc_proprietario: somenteDigitos(titular.rntrc_numero),
              razao_social_proprietario: titular.nome,
              uf_proprietario: titular.uf,
              tipo_proprietario: "1", // 1 = TAC independente (0 = TAC agregado, 2 = outros)
            }
          : {}),
        condutores: [{ nome: op.motorista_nome, cpf: somenteDigitos(op.motorista_cpf as string) }],
      },

      cnpj_responsavel_tecnico: somenteDigitos(pf?.responsavel_tecnico_cnpj as string) || undefined,
      contato_responsavel_tecnico: pf?.responsavel_tecnico_contato || "RBR Cargo",
      email_responsavel_tecnico: pf?.responsavel_tecnico_email,
      telefone_responsavel_tecnico: somenteDigitos(pf?.responsavel_tecnico_telefone as string) || undefined,
    };

    // Modo prévia (card de conferência): devolve o que SERIA enviado + o que falta, sem gravar nem chamar a Focus.
    if (previa === true) {
      return jsonResponse({
        sucesso: true,
        previa: true,
        ambiente: op.ambiente_fiscal ?? "homologacao",
        bloqueios,
        payload,
      });
    }

    if (bloqueios.length > 0) {
      const mensagem = bloqueios.join(" ");
      await supabaseAdmin.from("documentacao_operacao").upsert(
        {
          operacao_id,
          tipo: "mdfe",
          status: "bloqueado",
          mensagem_erro: mensagem,
          ambiente: op.ambiente_fiscal ?? "homologacao",
          atualizado_em: new Date().toISOString(),
        },
        { onConflict: "operacao_id,tipo" },
      );
      return jsonResponse({ sucesso: false, bloqueado: true, motivos: bloqueios, erro: mensagem }, 422);
    }

    const { data: token, error: tokenError } = await supabaseAdmin.rpc("get_focus_nfe_token", {
      p_ambiente: op.ambiente_fiscal ?? "homologacao",
    });
    if (tokenError || !token) {
      return jsonResponse({ sucesso: false, erro: "Token Focus NFe não encontrado no Vault." }, 503);
    }

    const baseUrl =
      (op.ambiente_fiscal ?? "homologacao") === "producao"
        ? "https://api.focusnfe.com.br"
        : "https://homologacao.focusnfe.com.br";

    const focusResp = await fetch(`${baseUrl}/v2/mdfe?ref=${encodeURIComponent(ref)}`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${token}:`)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const focusJson = await focusResp.json().catch(() => null);

    if (focusResp.status !== 202 && !focusResp.ok) {
      const mensagemErro = focusJson?.mensagem
        ? `Focus NFe recusou: ${focusJson.mensagem}${focusJson.codigo ? ` (código ${focusJson.codigo})` : ""}`
        : `Focus NFe respondeu ${focusResp.status}.`;

      await supabaseAdmin.from("documentacao_operacao").upsert(
        {
          operacao_id,
          tipo: "mdfe",
          status: "erro",
          referencia: ref,
          ambiente: op.ambiente_fiscal ?? "homologacao",
          mensagem_erro: mensagemErro,
          payload_enviado: payload,
          payload_resposta: focusJson,
          atualizado_em: new Date().toISOString(),
        },
        { onConflict: "operacao_id,tipo" },
      );
      return jsonResponse({ sucesso: false, erro: mensagemErro, detalhe: focusJson }, 502);
    }

    await supabaseAdmin.from("documentacao_operacao").upsert(
      {
        operacao_id,
        tipo: "mdfe",
        status: "pendente",
        referencia: ref,
        ambiente: op.ambiente_fiscal ?? "homologacao",
        mensagem_erro: null,
        payload_enviado: payload,
        payload_resposta: focusJson,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: "operacao_id,tipo" },
    );

    return jsonResponse({
      sucesso: true,
      status: "processando_autorizacao",
      referencia: ref,
      aviso:
        (op.ambiente_fiscal ?? "homologacao") === "homologacao"
          ? "Ambiente de homologação — este MDF-e NÃO tem validade fiscal."
          : undefined,
    });
  } catch (e) {
    return jsonResponse({ sucesso: false, erro: String(e) }, 500);
  }
});
