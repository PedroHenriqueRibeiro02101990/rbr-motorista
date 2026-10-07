// Edge Function: emitir-cte (v15)
//
// Emite o CT-e de uma operação via Focus NFe (POST /v2/cte, resposta assíncrona 202; status final via
// consultar-documento-fiscal). Valida pré-requisitos -> monta payload -> chama Focus -> grava em
// documentacao_operacao (upsert por operacao_id+tipo).
//
// v15 (2026-10-01): (1) modo `previa: true` — devolve o payload que SERIA enviado + bloqueios, sem gravar nem
// chamar a Focus (alimenta o card de conferência da tela Fiscal); (2) CORREÇÃO: o peso bruto ia sempre 0
// (a view v_checklist_prontidao não tem peso_bruto_kg) — agora vem de cotacoes.peso_bruto_kg e bloqueia se vazio.
//
// Histórico técnico (v1–v14, 2026-09-29): Simples Nacional => icms_situacao_tributaria "90_simples_nacional" +
// icms_indicador_simples_nacional "1" + observação de regime (não usa CSOSN); grupo modal_rodoviario com RNTRC
// de 8 dígitos (formatarRntrc); endereço/telefone estruturados de remetente e destinatário; municipio_inicio/
// codigo_municipio_inicio (cMunIni) distinto de municipio_envio; retira (retirar_mercadoria "1" + detalhes);
// tomador "0" + indicador_inscricao_estadual_tomador "1" + inscricao_estadual_remetente; nfes[].chave_nfe.
// Frete intramunicipal (mesma cidade) é NFS-e/ISS — bloqueia e aponta pra emitir-nfse-intramunicipal.
// CFOP assume destinatário estabelecimento comercial (5353 intra / 6353 inter) — revisar com o contador se mudar.

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

function normalizarCidade(nome: string | null | undefined): string {
  if (!nome) return "";
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

// A tag <RNTRC> do CT-e exige exatamente 8 dígitos ou "ISENTO" (schema SEFAZ).
function formatarRntrc(valor: string): string {
  const limpo = valor.trim().toUpperCase();
  if (limpo === "ISENTO") return limpo;
  return limpo.replace(/^0+(?=\d{8}$)/, "");
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
      return jsonResponse({ sucesso: false, erro: "Só um gestor RBR pode emitir CT-e." }, 403);
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

    const mesmoMunicipio =
      op.uf_origem &&
      op.uf_destino &&
      op.uf_origem === op.uf_destino &&
      op.cidade_origem &&
      op.cidade_destino &&
      normalizarCidade(op.cidade_origem) === normalizarCidade(op.cidade_destino);

    if (mesmoMunicipio) {
      bloqueios.push(
        `Frete intramunicipal (${op.cidade_origem}/${op.uf_origem} -> ${op.cidade_destino}/${op.uf_destino}) — transporte que começa e termina na mesma cidade não é tributado por ICMS/CT-e, e sim por ISS/NFS-e (LC 116/2003, item 16). Esta função não emite CT-e pra esse caso — use a função emitir-nfse-intramunicipal.`,
      );
    }

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
    if (!op.nf_remetente_cnpj || !op.nf_destinatario_cnpj) {
      bloqueios.push("Cotação sem remetente/destinatário da NF-e preenchidos.");
    }
    if (!op.nf_chave_acesso) {
      bloqueios.push(
        "Cotação sem chave de acesso da NF-e (44 dígitos) — o CT-e exige o grupo Documentos Transportados (SEFAZ rejeita sem ele).",
      );
    }
    if (!op.cidade_origem || !op.uf_origem || !op.cidade_destino || !op.uf_destino) {
      bloqueios.push("Cotação sem origem/destino completos.");
    }
    if (!op.valor_total_cotacao) {
      bloqueios.push("Cotação sem valor_total (valor do serviço de transporte) preenchido.");
    }

    // Endereço do remetente: só sabemos montar quando o remetente é a própria RBR (usa parametros_fiscais).
    const remetenteEhRBR = Boolean(op.nf_remetente_cnpj) && op.nf_remetente_cnpj === op.emitente_cnpj;
    if (!remetenteEhRBR) {
      bloqueios.push(
        "Endereço estruturado do remetente não disponível — o CNPJ do remetente é diferente do CNPJ da RBR e ainda não existe cadastro de endereço pra remetentes terceiros. Sem isso o CT-e não pode ser montado (endereço é campo obrigatório da SEFAZ).",
      );
    }

    // Endereço/telefone do destinatário vêm do cadastro do cliente vinculado à cotação.
    if (
      !op.destinatario_logradouro ||
      !op.destinatario_numero ||
      !op.destinatario_bairro ||
      !op.destinatario_cep ||
      !op.destinatario_cidade ||
      !op.destinatario_uf
    ) {
      bloqueios.push(
        "Endereço do destinatário incompleto no cadastro do cliente (logradouro/número/bairro/CEP/cidade/UF) — obrigatório no CT-e. Complete o cadastro do cliente.",
      );
    }
    if (!op.destinatario_telefone) {
      bloqueios.push("Telefone do destinatário não cadastrado no cliente — obrigatório no CT-e.");
    }

    const intraestadual = op.uf_origem && op.uf_destino && op.uf_origem === op.uf_destino;
    const cfop = intraestadual ? "5353" : "6353";

    const { data: pf } = await supabaseAdmin
      .from("parametros_fiscais")
      .select(
        "endereco_logradouro, endereco_numero, endereco_complemento, endereco_bairro, endereco_cep, endereco_codigo_municipio, endereco_uf, responsavel_tecnico_cnpj, responsavel_tecnico_contato, responsavel_tecnico_email, responsavel_tecnico_telefone, csosn, icms_aliquota_credito_simples, rntrc, telefone_contato",
      )
      .eq("id", op.parametros_fiscais_id)
      .maybeSingle();

    if (!pf?.endereco_logradouro || !pf?.endereco_numero || !pf?.endereco_bairro || !pf?.endereco_cep) {
      bloqueios.push("Endereço do emitente incompleto em parametros_fiscais (logradouro/número/bairro/CEP) — obrigatório no CT-e.");
    }
    if (!pf?.responsavel_tecnico_cnpj || !pf?.responsavel_tecnico_email) {
      bloqueios.push("Dados do responsável técnico incompletos em parametros_fiscais (cnpj/email) — exigência da SEFAZ.");
    }
    if (!pf?.rntrc) {
      bloqueios.push(
        "RNTRC da RBR não configurado em parametros_fiscais.rntrc — obrigatório no grupo modal rodoviário (modal_rodoviario) do CT-e.",
      );
    }
    if (remetenteEhRBR && !pf?.telefone_contato) {
      bloqueios.push(
        "Telefone não configurado em parametros_fiscais.telefone_contato — obrigatório como telefone do remetente quando o remetente é a própria RBR.",
      );
    }
    // cMunIni só pode vir de parametros_fiscais.endereco_codigo_municipio quando a origem é São Paulo/SP.
    const origemEhEnderecoRBR =
      remetenteEhRBR &&
      normalizarCidade(op.cidade_origem) === normalizarCidade("São Paulo") &&
      op.uf_origem === pf?.endereco_uf;
    if (remetenteEhRBR && !origemEhEnderecoRBR) {
      bloqueios.push(
        "Município de origem da cotação não é São Paulo/SP (endereço cadastrado da RBR em parametros_fiscais) — ainda não há como resolver o código IBGE do município de início da prestação (cMunIni) pra uma origem diferente. Sem esse código, a SEFAZ recusa o CT-e por erro de schema.",
      );
    }

    // Peso bruto da carga: a view não traz esse campo — vem direto da cotação.
    let pesoBrutoKg: number | null = null;
    if (op.cotacao_id) {
      const { data: cot } = await supabaseAdmin
        .from("cotacoes")
        .select("peso_bruto_kg")
        .eq("id", op.cotacao_id)
        .maybeSingle();
      pesoBrutoKg = cot?.peso_bruto_kg != null ? Number(cot.peso_bruto_kg) : null;
    }
    if (!pesoBrutoKg || pesoBrutoKg <= 0) {
      bloqueios.push("Cotação sem peso bruto da carga (kg) — obrigatório no CT-e (quantidades).");
    }

    const ref = `rbr-cte-${operacao_id}`;

    // ICMS pra Simples Nacional no CT-e: código fixo "90_simples_nacional" + indicador "1", sem destaque de valor.
    const icmsCampos: Record<string, unknown> = {
      icms_origem: "0",
      icms_situacao_tributaria: "90_simples_nacional",
      icms_indicador_simples_nacional: "1",
    };

    const payload = {
      natureza_operacao: op.natureza_operacao || "Prestação de serviço de transporte",
      data_emissao: new Date().toISOString(),
      tipo_documento: "0",
      tipo_servico: "0",
      modal: "01",
      modal_rodoviario: {
        rntrc: pf?.rntrc ? formatarRntrc(pf.rntrc as string) : null,
      },
      cfop,
      // "envio" e "início" são grupos diferentes na Focus (cMunIni vem de municipio_inicio).
      municipio_envio: op.cidade_origem,
      uf_envio: op.uf_origem,
      codigo_municipio_envio: pf?.endereco_codigo_municipio,
      municipio_inicio: op.cidade_origem,
      uf_inicio: op.uf_origem,
      codigo_municipio_inicio: pf?.endereco_codigo_municipio,
      municipio_fim: op.cidade_destino,
      uf_fim: op.uf_destino,
      // A RBR sempre entrega no endereço do destinatário: retirar_mercadoria "1" = Não.
      retirar_mercadoria: "1",
      detalhes_retirar: "Entrega no endereço do destinatário — sem retirada em filial/porto/aeroporto.",

      // Tomador = remetente (a RBR), contribuinte de ICMS.
      tomador: "0",
      indicador_inscricao_estadual_tomador: "1",

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
      nome_remetente: op.nf_remetente_razao_social,
      inscricao_estadual_remetente: op.emitente_ie,
      telefone_remetente: pf?.telefone_contato,
      logradouro_remetente: pf?.endereco_logradouro,
      numero_remetente: pf?.endereco_numero,
      complemento_remetente: pf?.endereco_complemento || undefined,
      bairro_remetente: pf?.endereco_bairro,
      municipio_remetente: "São Paulo",
      uf_remetente: pf?.endereco_uf,
      cep_remetente: pf?.endereco_cep,
      codigo_pais_remetente: "1058",
      pais_remetente: "Brasil",

      cnpj_destinatario: op.nf_destinatario_cnpj,
      nome_destinatario: op.nf_destinatario_razao_social,
      telefone_destinatario: op.destinatario_telefone,
      logradouro_destinatario: op.destinatario_logradouro,
      numero_destinatario: op.destinatario_numero,
      complemento_destinatario: op.destinatario_complemento || undefined,
      bairro_destinatario: op.destinatario_bairro,
      municipio_destinatario: op.destinatario_cidade,
      uf_destinatario: op.destinatario_uf,
      cep_destinatario: op.destinatario_cep,
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
      nfes: op.nf_chave_acesso ? [{ chave_nfe: op.nf_chave_acesso }] : [],

      ...icmsCampos,

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
          tipo: "cte",
          status: "bloqueado",
          mensagem_erro: mensagem,
          ambiente: op.ambiente_fiscal ?? "homologacao",
          atualizado_em: new Date().toISOString(),
        },
        { onConflict: "operacao_id,tipo" },
      );
      return jsonResponse({
        sucesso: false,
        bloqueado: true,
        intramunicipal: Boolean(mesmoMunicipio),
        motivos: bloqueios,
        erro: mensagem,
      }, 422);
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

    const focusResp = await fetch(`${baseUrl}/v2/cte?ref=${encodeURIComponent(ref)}`, {
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
          tipo: "cte",
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
        tipo: "cte",
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
          ? "Ambiente de homologação — este CT-e NÃO tem validade fiscal."
          : undefined,
    });
  } catch (e) {
    return jsonResponse({ sucesso: false, erro: String(e) }, 500);
  }
});
