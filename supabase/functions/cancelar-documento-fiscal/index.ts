// Edge Function: cancelar-documento-fiscal (v2)
//
// v2: NF-e também em PRODUÇÃO (ref rbr-nfe-prod-<cotacao_id>, ambiente de parametros_fiscais) e log de auditoria
// em eventos_fiscais_operacao para CT-e/MDF-e (a tabela não aceita NF-e).
//
// Cancela CT-e, MDF-e ou a NF-e DE TESTE já AUTORIZADOS pela Focus NFe (DELETE /v2/cte|mdfe|nfe/{ref}, síncrono, irreversível).
// Body: { operacao_id, tipo: "cte" | "mdfe" | "nfe", justificativa (15–255), confirmar: true }.
// Só gestor RBR. CT-e/MDF-e usam o ambiente gravado no documento; NF-e usa o ambiente atual de parametros_fiscais.
// Ordem obrigatória: MDF-e, depois CT-e, depois NF-e (se o documento seguinte ainda está emitido, bloqueia).
// NF-e: só a de teste (ref rbr-nfe-teste-<cotacao_id> em homologação ou rbr-nfe-prod-<cotacao_id> em produção); ao cancelar, limpa a chave na cotação. Prazo NF-e: 24 h (alguns estados mais).
// O prazo legal (CT-e: 7 dias) é decidido pela SEFAZ; a rejeição volta em mensagem_sefaz e o documento segue emitido.

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  try {
    const { operacao_id, tipo, justificativa, confirmar } = await req.json();
    if (!operacao_id || typeof operacao_id !== "string" || (tipo !== "cte" && tipo !== "mdfe" && tipo !== "nfe")) {
      return jsonResponse({ sucesso: false, erro: 'Informe operacao_id e tipo ("cte", "mdfe" ou "nfe").' }, 400);
    }
    const just = typeof justificativa === "string" ? justificativa.trim() : "";
    if (just.length < 15 || just.length > 255) {
      return jsonResponse({ sucesso: false, erro: "A justificativa precisa ter de 15 a 255 caracteres." }, 400);
    }
    if (confirmar !== true) {
      return jsonResponse({ sucesso: false, erro: "Cancelamento é definitivo: envie confirmar: true." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabaseAsUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: userData, error: userError } = await supabaseAsUser.auth.getUser();
    if (userError || !userData?.user) {
      return jsonResponse({ sucesso: false, erro: "Não autenticado" }, 401);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: pessoaAtor } = await supabaseAdmin
      .from("pessoas")
      .select("id, papel")
      .eq("auth_user_id", userData.user.id)
      .maybeSingle();
    if (!pessoaAtor || pessoaAtor.papel !== "gestor_rbr") {
      return jsonResponse({ sucesso: false, erro: "Só um gestor RBR pode cancelar documento fiscal." }, 403);
    }


    // ---- NF-e de teste: vive na cotação, não em documentacao_operacao ----
    if (tipo === "nfe") {
      const { data: opn } = await supabaseAdmin
        .from("v_checklist_prontidao")
        .select("cotacao_id, ambiente_fiscal")
        .eq("operacao_id", operacao_id)
        .maybeSingle();
      if (!opn?.cotacao_id) return jsonResponse({ sucesso: false, erro: "Operação sem cotação." }, 404);
      const { data: cotn } = await supabaseAdmin
        .from("cotacoes")
        .select("nf_chave_acesso")
        .eq("id", opn.cotacao_id)
        .maybeSingle();
      if (!cotn?.nf_chave_acesso) {
        return jsonResponse({ sucesso: false, erro: "A cotação não tem NF-e gravada para cancelar." }, 404);
      }
      const { data: cteDoc } = await supabaseAdmin
        .from("documentacao_operacao")
        .select("status")
        .eq("operacao_id", operacao_id)
        .eq("tipo", "cte")
        .maybeSingle();
      if (cteDoc?.status === "emitido") {
        return jsonResponse({ sucesso: false, erro: "Cancele o MDF-e e o CT-e desta operação antes de cancelar a NF-e." }, 422);
      }
      const ambN = opn.ambiente_fiscal === "producao" ? "producao" : "homologacao";
      const { data: tokenH } = await supabaseAdmin.rpc("get_focus_nfe_token", { p_ambiente: ambN });
      if (!tokenH) return jsonResponse({ sucesso: false, erro: `Token Focus NFe de ${ambN} não encontrado no Vault.` }, 503);
      const baseN = ambN === "producao" ? "https://api.focusnfe.com.br" : "https://homologacao.focusnfe.com.br";
      const refN = ambN === "producao" ? `rbr-nfe-prod-${opn.cotacao_id}` : `rbr-nfe-teste-${opn.cotacao_id}`;
      const respN = await fetch(
        `${baseN}/v2/nfe/${encodeURIComponent(refN)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Basic ${btoa(`${tokenH}:`)}`, "Content-Type": "application/json" },
          body: JSON.stringify({ justificativa: just }),
        },
      );
      const jsonN = await respN.json().catch(() => null);
      if (!respN.ok) {
        return jsonResponse({
          sucesso: false,
          erro: jsonN?.mensagem ? `Focus NFe recusou: ${jsonN.mensagem}${jsonN.codigo ? ` (${jsonN.codigo})` : ""}` : `Focus NFe respondeu ${respN.status}.`,
          detalhe: jsonN,
        }, 502);
      }
      if (jsonN?.status !== "cancelado") {
        return jsonResponse({
          sucesso: false,
          erro: `A SEFAZ não aceitou o cancelamento${jsonN?.mensagem_sefaz ? `: ${jsonN.mensagem_sefaz}` : ""}. A NF-e continua autorizada.`,
          detalhe: jsonN,
        }, 422);
      }
      await supabaseAdmin
        .from("cotacoes")
        .update({ nf_chave_acesso: null, nf_numero: null, nf_serie: null, nf_data_emissao: null })
        .eq("id", opn.cotacao_id);
      return jsonResponse({
        sucesso: true,
        status: "cancelado",
        tipo: "nfe",
        ambiente: ambN,
        mensagem_sefaz: jsonN?.mensagem_sefaz,
        xml_cancelamento: jsonN?.caminho_xml_cancelamento ?? null,
      });
    }

    const { data: docs } = await supabaseAdmin
      .from("documentacao_operacao")
      .select("tipo, status, referencia, ambiente, chave_acesso, payload_resposta")
      .eq("operacao_id", operacao_id)
      .in("tipo", ["cte", "mdfe"]);
    const doc = (docs ?? []).find((d) => d.tipo === tipo);
    const mdfe = (docs ?? []).find((d) => d.tipo === "mdfe");

    if (!doc || !doc.referencia) {
      return jsonResponse({ sucesso: false, erro: `Esta operação não tem ${tipo.toUpperCase()} emitido.` }, 404);
    }
    if (doc.status !== "emitido") {
      return jsonResponse({
        sucesso: false,
        erro: `Só dá para cancelar documento autorizado. Status atual do ${tipo.toUpperCase()}: ${doc.status}. Se acabou de autorizar, use "Consultar" para atualizar o status antes.`,
      }, 422);
    }
    if (tipo === "cte" && mdfe && mdfe.status === "emitido") {
      return jsonResponse({
        sucesso: false,
        erro: "Cancele o MDF-e desta operação antes de cancelar o CT-e.",
      }, 422);
    }

    const ambiente = doc.ambiente === "producao" ? "producao" : "homologacao";
    const { data: token, error: tokenError } = await supabaseAdmin.rpc("get_focus_nfe_token", {
      p_ambiente: ambiente,
    });
    if (tokenError || !token) {
      return jsonResponse({ sucesso: false, erro: "Token Focus NFe não encontrado no Vault." }, 503);
    }
    const baseUrl = ambiente === "producao" ? "https://api.focusnfe.com.br" : "https://homologacao.focusnfe.com.br";

    const resp = await fetch(`${baseUrl}/v2/${tipo}/${encodeURIComponent(doc.referencia)}`, {
      method: "DELETE",
      headers: { Authorization: `Basic ${btoa(`${token}:`)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ justificativa: just }),
    });
    const json = await resp.json().catch(() => null);

    if (!resp.ok) {
      return jsonResponse({
        sucesso: false,
        erro: json?.mensagem ? `Focus NFe recusou: ${json.mensagem}${json.codigo ? ` (${json.codigo})` : ""}` : `Focus NFe respondeu ${resp.status}.`,
        detalhe: json,
      }, 502);
    }

    if (json?.status !== "cancelado") {
      // Ex.: erro_cancelamento, status_sefaz 220 "autorizada há mais de 7 dias". O documento continua válido.
      return jsonResponse({
        sucesso: false,
        erro: `A SEFAZ não aceitou o cancelamento${json?.mensagem_sefaz ? `: ${json.mensagem_sefaz}` : ""}${json?.status_sefaz ? ` (${json.status_sefaz})` : ""}. O ${tipo.toUpperCase()} continua autorizado.`,
        detalhe: json,
      }, 422);
    }

    const anterior = (doc.payload_resposta && typeof doc.payload_resposta === "object") ? doc.payload_resposta : {};
    const xmlCancelamento = json?.caminho_xml_cancelamento ?? json?.caminho_xml ?? null;
    await supabaseAdmin
      .from("documentacao_operacao")
      .update({
        status: "cancelado",
        mensagem_erro: null,
        payload_resposta: {
          ...anterior,
          cancelamento: { justificativa: just, resposta: json, em: new Date().toISOString(), por: userData.user.id },
        },
        atualizado_em: new Date().toISOString(),
      })
      .eq("operacao_id", operacao_id)
      .eq("tipo", tipo);

    await supabaseAdmin.from("eventos_fiscais_operacao").insert({
      operacao_id,
      tipo_documento: tipo,
      evento: "cancelamento",
      origem: "manual",
      ator_id: pessoaAtor.id,
      sucesso: true,
      mensagem: json?.mensagem_sefaz ?? "Cancelado",
      requisicao: { justificativa: just, ambiente },
      resposta: json,
    });

    return jsonResponse({
      sucesso: true,
      status: "cancelado",
      tipo,
      ambiente,
      chave: doc.chave_acesso,
      mensagem_sefaz: json?.mensagem_sefaz,
      xml_cancelamento: xmlCancelamento,
    });
  } catch (e) {
    return jsonResponse({ sucesso: false, erro: String(e) }, 500);
  }
});
