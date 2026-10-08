// Edge Function: emitir-cte (v19)
//
// Emite o CT-e de uma operação via Focus NFe (POST /v2/cte, resposta assíncrona 202; status final via
// consultar-documento-fiscal). Lê os dados -> monta payload e bloqueios (cte.ts, testado em cte.test.ts) ->
// chama Focus -> grava em documentacao_operacao (upsert por operacao_id+tipo).
//
// v19 (2026-10-08): data_emissao do CT-e vai com o fuso de Brasília (-03:00) em vez de UTC (+00:00). Mesmo
// instante, só muda a forma de escrever — elimina o fuso como dúvida na investigação da rejeição 230.
//
// v18 (2026-10-08): comparado com um CT-e real autorizado em SP: telefone do destinatário vira aviso (a SEFAZ
// aceita sem); componentes_valor com o frete.
//
// v17 (2026-10-07): conferido com a doc de campos da Focus (ConhecimentoTransporteXML): telefone de remetente e
// destinatário é obrigatório na Focus (volta a bloquear; vem do <fone> da NF-e ou do cadastro do cliente);
// municipio_emitente e códigos IBGE de remetente/destinatário; responsável técnico em campos planos
// (cnpj_/contato_/email_/telefone_responsavel_tecnico — o objeto aninhado não existe na Focus); sem icms_origem
// (não existe no CT-e); tomador "terceiro" = toma 4 com os dados do cadastro do cliente (nome literal em homologação).
//
// v16 (2026-10-07): homologação passa pelo MESMO caminho da produção. (1) Em homologação, nome de remetente e
// destinatário vão como "CT-E EMITIDO EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL" (exigência SEFAZ, rejeições
// 646/649); (2) remetente terceiro: endereço/IE vêm da aba NF-e da cotação (antes só aceitava a RBR como
// remetente); (3) cMunIni/cMunFim resolvidos em municipios_ibge (antes só origem São Paulo); municipio_envio
// passa a ser a sede da RBR; (4) destinatário usa o endereço da NF-e e, sem ele, o cadastro do cliente;
// telefone do destinatário deixa de bloquear (é opcional no leiaute); (5) tomador segue cotacoes.tomador_papel
// (remetente/destinatário; terceiro bloqueia); (6) valida CNPJs e a chave da NF-e (DV) antes de enviar;
// (7) `avisos` na resposta: o que muda por ser homologação e o que só a SEFAZ confere (ex.: SP valida se a NF-e
// existe — rejeição 661). O payload enviado continua salvo em documentacao_operacao.payload_enviado.
//
// v15 (2026-10-01): modo `previa: true` (payload + bloqueios, sem gravar nem chamar a Focus); peso bruto vem de
// cotacoes.peso_bruto_kg. v1–v14 (2026-09-29): Simples Nacional => icms_situacao_tributaria "90_simples_nacional"
// + indicador "1"; RNTRC de 8 dígitos; retirar_mercadoria "1"; nfes[].chave_nfe. Frete intramunicipal é NFS-e/ISS.
// CFOP assume destinatário estabelecimento comercial (5353 intra / 6353 inter) — revisar com o contador se mudar.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { montarCte, normalizarCidade } from "./cte.ts";

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

    const { data: pf } = await supabaseAdmin
      .from("parametros_fiscais")
      .select(
        "endereco_logradouro, endereco_numero, endereco_complemento, endereco_bairro, endereco_cep, endereco_codigo_municipio, endereco_uf, responsavel_tecnico_cnpj, responsavel_tecnico_contato, responsavel_tecnico_email, responsavel_tecnico_telefone, rntrc, telefone_contato",
      )
      .eq("id", op.parametros_fiscais_id)
      .maybeSingle();

    // Dados da aba NF-e que a view não traz (endereços estruturados, IEs, tomador, peso) + cadastro do cliente
    // (tomador "terceiro" e reserva de telefone).
    let cotacao = null;
    let cliente = null;
    if (op.cotacao_id) {
      const { data: cot } = await supabaseAdmin
        .from("cotacoes")
        .select("cliente_id, peso_bruto_kg, nf_remetente_endereco, nf_remetente_ie, nf_destinatario_endereco, nf_destinatario_ie, tomador_papel")
        .eq("id", op.cotacao_id)
        .maybeSingle();
      if (cot) cotacao = { ...cot, peso_bruto_kg: cot.peso_bruto_kg != null ? Number(cot.peso_bruto_kg) : null };
      if (cot?.cliente_id) {
        const { data: cl } = await supabaseAdmin
          .from("clientes")
          .select("cnpj, cpf, razao_social, nome_fantasia, inscricao_estadual, celular_whatsapp, email, logradouro, numero_endereco, complemento, bairro, cidade, uf, cep")
          .eq("id", cot.cliente_id)
          .maybeSingle();
        cliente = cl;
      }
    }

    // Código IBGE pela cidade/UF da cotação (comparação sem acento/caixa, como no resto do sistema).
    async function codigoIbge(cidade: string | null, uf: string | null): Promise<string | null> {
      if (!cidade || !uf) return null;
      const { data } = await supabaseAdmin.from("municipios_ibge").select("cidade, codigo_ibge").eq("uf", uf);
      const alvo = normalizarCidade(cidade);
      return data?.find((m) => normalizarCidade(m.cidade) === alvo)?.codigo_ibge ?? null;
    }
    let municipioEmitente: string | null = null;
    if (pf?.endereco_codigo_municipio) {
      const { data: m } = await supabaseAdmin
        .from("municipios_ibge")
        .select("cidade")
        .eq("codigo_ibge", pf.endereco_codigo_municipio)
        .maybeSingle();
      municipioEmitente = m?.cidade ?? null;
    }

    const { ambiente, bloqueios, avisos, intramunicipal, payload } = montarCte({
      op,
      pf,
      cotacao,
      cliente,
      ibge: {
        inicio: await codigoIbge(op.cidade_origem, op.uf_origem),
        fim: await codigoIbge(op.cidade_destino, op.uf_destino),
      },
      municipioEmitente,
      agora: new Date(),
    });

    const ref = `rbr-cte-${operacao_id}`;

    // Modo prévia (card de conferência): devolve o que SERIA enviado + o que falta, sem gravar nem chamar a Focus.
    if (previa === true) {
      return jsonResponse({
        sucesso: true,
        previa: true,
        ambiente,
        bloqueios,
        avisos,
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
          ambiente,
          atualizado_em: new Date().toISOString(),
        },
        { onConflict: "operacao_id,tipo" },
      );
      return jsonResponse({
        sucesso: false,
        bloqueado: true,
        intramunicipal,
        motivos: bloqueios,
        avisos,
        erro: mensagem,
      }, 422);
    }

    const { data: token, error: tokenError } = await supabaseAdmin.rpc("get_focus_nfe_token", {
      p_ambiente: ambiente,
    });
    if (tokenError || !token) {
      return jsonResponse({ sucesso: false, erro: "Token Focus NFe não encontrado no Vault." }, 503);
    }

    const baseUrl =
      ambiente === "producao"
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
          ambiente,
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
        ambiente,
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
        ambiente === "homologacao"
          ? "Ambiente de homologação — este CT-e NÃO tem validade fiscal."
          : undefined,
      avisos,
    });
  } catch (e) {
    return jsonResponse({ sucesso: false, erro: String(e) }, 500);
  }
});
