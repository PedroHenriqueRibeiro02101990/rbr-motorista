// Edge Function: sincronizar-documentos-fiscais (v1, 2026-10-09)
//
// Robo de status: chamado todo minuto pelo pg_cron (job 'sincronizar-documentos-fiscais') SO quando existe CT-e,
// MDF-e ou NFS-e com status 'pendente'. Consulta a Focus NFe por referencia e atualiza documentacao_operacao,
// com a mesma regra de consultar-documento-fiscal v4 (o botao 'Atualizar status' continua funcionando).
// Nao emite, nao cancela e nao averba nada: so le o status que a SEFAZ devolveu.
//
// Seguranca: verify_jwt desligado porque quem chama e o banco; exige o cabecalho x-sync-secret igual ao segredo
// 'sync_documentos_secret' do Vault (validado pela RPC validar_sync_secret, so service_role executa).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const PATH_POR_TIPO: Record<string, string> = { cte: "cte", mdfe: "mdfe", nfse: "nfse" };
const LIMITE_POR_RODADA = 25;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const segredo = req.headers.get("x-sync-secret") ?? "";
    const { data: autorizado } = await supabase.rpc("validar_sync_secret", { p_secret: segredo });
    if (autorizado !== true) return jsonResponse({ sucesso: false, erro: "Nao autorizado" }, 401);

    const { data: pendentes, error } = await supabase
      .from("documentacao_operacao")
      .select("id, operacao_id, tipo, referencia, ambiente, provedor, encerrado_em")
      .eq("status", "pendente")
      .not("referencia", "is", null)
      .in("tipo", ["cte", "mdfe", "nfse"])
      .gt("atualizado_em", new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString())
      .order("atualizado_em", { ascending: true })
      .limit(LIMITE_POR_RODADA);
    if (error) return jsonResponse({ sucesso: false, erro: error.message }, 500);

    const tokens: Record<string, string | null> = {};
    const resultado: { id: string; tipo: string; status: string }[] = [];

    for (const doc of pendentes ?? []) {
      const ambiente = doc.ambiente === "producao" ? "producao" : "homologacao";
      if (!(ambiente in tokens)) {
        const { data: t } = await supabase.rpc("get_focus_nfe_token", { p_ambiente: ambiente });
        tokens[ambiente] = t ?? null;
      }
      const token = tokens[ambiente];
      if (!token) continue;

      const baseUrl = ambiente === "producao" ? "https://api.focusnfe.com.br" : "https://homologacao.focusnfe.com.br";
      const segmento = doc.tipo === "nfse" && doc.provedor === "nfsen" ? "nfsen" : PATH_POR_TIPO[doc.tipo as string];

      let focusJson: Record<string, unknown> | null = null;
      try {
        const resp = await fetch(`${baseUrl}/v2/${segmento}/${encodeURIComponent(doc.referencia as string)}`, {
          headers: { Authorization: `Basic ${btoa(`${token}:`)}` },
        });
        if (!resp.ok) continue;
        focusJson = await resp.json().catch(() => null);
      } catch {
        continue;
      }
      if (!focusJson) continue;

      const statusFocus = focusJson.status as string | undefined;
      let statusInterno: "pendente" | "emitido" | "erro" | "cancelado" = "pendente";
      let encerrado = false;
      if (statusFocus === "autorizado") statusInterno = "emitido";
      else if (statusFocus === "encerrado") {
        statusInterno = "emitido";
        encerrado = true;
      } else if (statusFocus === "erro_autorizacao" || statusFocus === "denegado" || statusFocus === "negado") {
        statusInterno = "erro";
      } else if (statusFocus === "cancelado") statusInterno = "cancelado";

      // Ainda processando: nada a gravar, tenta de novo no proximo minuto.
      if (statusInterno === "pendente") continue;

      const erros = focusJson.erros as { mensagem?: string }[] | undefined;
      const mensagemErro = statusInterno === "erro"
        ? (focusJson.mensagem_sefaz as string | undefined) || erros?.[0]?.mensagem || "Rejeitado — ver payload_resposta."
        : null;

      const urlPdf = (focusJson.caminho_dacte ?? focusJson.caminho_damdfe ?? focusJson.caminho_pdf ?? focusJson.url ?? null) as string | null;
      const urlXml = (focusJson.caminho_xml_cte ?? focusJson.caminho_xml ?? focusJson.xml ?? null) as string | null;
      const numero = (focusJson.numero ?? focusJson.numero_rps ?? null) as string | number | null;
      const chave = (focusJson.chave_cte ?? focusJson.chave ?? focusJson.codigo_verificacao ?? null) as string | null;

      // deno-lint-ignore no-explicit-any
      const atualizacao: Record<string, any> = {
        status: statusInterno,
        mensagem_erro: mensagemErro,
        payload_resposta: focusJson,
        atualizado_em: new Date().toISOString(),
      };
      // So grava o que a Focus devolveu: nunca apaga numero/chave/links ja salvos.
      if (numero != null) atualizacao.numero_documento = numero;
      if (chave) atualizacao.chave_acesso = chave;
      if (urlPdf) atualizacao.url_pdf = urlPdf;
      if (urlXml) atualizacao.url_xml = urlXml;
      if (encerrado && !doc.encerrado_em) {
        atualizacao.encerrado_em = new Date().toISOString();
        atualizacao.encerramento_origem = "manual";
        atualizacao.encerramento_erro = null;
      }

      // Guarda: so atualiza se continua pendente (evita sobrescrever um cancelamento feito agora por um gestor).
      const { error: erroUpdate } = await supabase
        .from("documentacao_operacao")
        .update(atualizacao)
        .eq("id", doc.id)
        .eq("status", "pendente");
      if (!erroUpdate) resultado.push({ id: doc.id as string, tipo: doc.tipo as string, status: statusInterno });
    }

    return jsonResponse({ sucesso: true, verificados: pendentes?.length ?? 0, atualizados: resultado });
  } catch (e) {
    return jsonResponse({ sucesso: false, erro: String(e) }, 500);
  }
});
