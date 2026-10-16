// Edge Function: consultar-documento-fiscal
//
// Fecha o loop assíncrono da Focus NFe: emitir-cte/emitir-mdfe/
// emitir-nfse-intramunicipal mandam o documento e recebem só "entrou na
// fila" (202). O status final (autorizado / rejeitado) só existe depois, e a
// Focus oferece duas formas de saber: webhook (não configurado ainda) ou
// consulta por ref — esta função faz a consulta.
//
// Uso: chamar sob demanda (botão "Atualizar status" na tela de emissão manual)
// ou de um cron/scheduled job simples que varre documentacao_operacao com
// status='pendente' e tem mais de N minutos.
//
// NFS-e: pra tipo='nfse', o path muda conforme qual endpoint foi usado na
// emissão — gravamos isso em documentacao_operacao.provedor ('nfse' = municipal
// comum, 'nfsen' = Nacional).
//
// v4 (2026-10-01), conforme doc da Focus: (1) status 'encerrado' do MDF-e não volta
// mais pra 'pendente' — continua 'emitido' (autorizado) e marca encerrado_em (origem
// 'manual' quando o encerramento foi feito fora do sistema); (2) link do PDF do MDF-e
// (caminho_damdfe); (3) campos de URL não são mais sobrescritos com null quando a
// Focus não devolve o link naquela consulta.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PATH_POR_TIPO: Record<string, string> = {
  cte: "cte",
  mdfe: "mdfe",
  nfse: "nfse",
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
    const { operacao_id, tipo } = await req.json();
    if (!operacao_id || !tipo || !PATH_POR_TIPO[tipo]) {
      return jsonResponse({ sucesso: false, erro: "Informe operacao_id e tipo ('cte', 'mdfe' ou 'nfse')." }, 400);
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

    const { data: doc, error: docError } = await supabaseAdmin
      .from("documentacao_operacao")
      .select("id, referencia, ambiente, provedor, encerrado_em")
      .eq("operacao_id", operacao_id)
      .eq("tipo", tipo)
      .maybeSingle();

    if (docError || !doc || !doc.referencia) {
      return jsonResponse({ sucesso: false, erro: "Nenhuma emissão em andamento pra essa operação/tipo." }, 404);
    }

    const { data: token, error: tokenError } = await supabaseAdmin.rpc("get_focus_nfe_token", {
      p_ambiente: doc.ambiente ?? "homologacao",
    });
    if (tokenError || !token) {
      return jsonResponse({ sucesso: false, erro: "Token Focus NFe não encontrado no Vault." }, 503);
    }

    const baseUrl =
      (doc.ambiente ?? "homologacao") === "producao"
        ? "https://api.focusnfe.com.br"
        : "https://homologacao.focusnfe.com.br";

    // Pra NFS-e, o path depende de qual endpoint foi usado na emissão
    // (municipal comum vs. Nacional) — gravado em documentacao_operacao.provedor.
    const pathSegmento = tipo === "nfse" && doc.provedor === "nfsen" ? "nfsen" : PATH_POR_TIPO[tipo];

    const focusResp = await fetch(`${baseUrl}/v2/${pathSegmento}/${encodeURIComponent(doc.referencia)}`, {
      headers: { Authorization: `Basic ${btoa(`${token}:`)}` },
    });
    const focusJson = await focusResp.json().catch(() => null);

    if (!focusResp.ok) {
      return jsonResponse({ sucesso: false, erro: `Focus NFe respondeu ${focusResp.status}.`, detalhe: focusJson }, 502);
    }

    // Focus usa "status": autorizado / erro_autorizacao / processando_autorizacao / cancelado,
    // e no MDF-e também "encerrado" — mapeando pro vocabulário interno.
    const statusFocus = focusJson?.status as string | undefined;
    let statusInterno: "pendente" | "emitido" | "erro" | "cancelado" = "pendente";
    let encerrado = false;
    if (statusFocus === "autorizado") statusInterno = "emitido";
    else if (statusFocus === "encerrado") {
      statusInterno = "emitido"; // continua um documento autorizado; o encerramento é rastreado em encerrado_em
      encerrado = true;
    } else if (statusFocus === "erro_autorizacao" || statusFocus === "denegado" || statusFocus === "negado") statusInterno = "erro";
    else if (statusFocus === "cancelado") statusInterno = "cancelado";

    const mensagemErro =
      statusInterno === "erro"
        ? focusJson?.mensagem_sefaz || focusJson?.erros?.[0]?.mensagem || "Rejeitado — ver payload_resposta."
        : null;

    const urlPdf = focusJson?.caminho_dacte ?? focusJson?.caminho_damdfe ?? focusJson?.caminho_pdf ?? focusJson?.url ?? null;
    const urlXml = focusJson?.caminho_xml_cte ?? focusJson?.caminho_xml ?? focusJson?.xml ?? null;

    // deno-lint-ignore no-explicit-any
    const atualizacao: Record<string, any> = {
      status: statusInterno,
      numero_documento: focusJson?.numero ?? focusJson?.numero_rps ?? null,
      chave_acesso: focusJson?.chave_cte ?? focusJson?.chave ?? focusJson?.codigo_verificacao ?? null,
      mensagem_erro: mensagemErro,
      payload_resposta: focusJson,
      atualizado_em: new Date().toISOString(),
    };
    if (urlPdf) atualizacao.url_pdf = urlPdf;
    if (urlXml) atualizacao.url_xml = urlXml;
    if (encerrado && !doc.encerrado_em) {
      atualizacao.encerrado_em = new Date().toISOString();
      atualizacao.encerramento_origem = "manual";
      atualizacao.encerramento_erro = null;
    }

    await supabaseAdmin.from("documentacao_operacao").update(atualizacao).eq("id", doc.id);

    return jsonResponse({ sucesso: true, status: statusInterno, encerrado, focus: focusJson });
  } catch (e) {
    return jsonResponse({ sucesso: false, erro: String(e) }, 500);
  }
});
