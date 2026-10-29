// Edge Function: eventos-fiscais
//
// Eventos pós-emissão via Focus NFe, com log de auditoria em eventos_fiscais_operacao:
//   - encerrar_mdfe          POST   /v2/mdfe/{ref}/encerrar         (manual pelo gestor OU automático ao finalizar a entrega)
//   - cancelar_mdfe          DELETE /v2/mdfe/{ref}                  (só autorizado e ainda não encerrado)
//   - cancelar_cte           DELETE /v2/cte/{ref}                   (só autorizado; bloqueia se houver MDF-e ativo)
//   - carta_correcao_cte     POST   /v2/cte/{ref}/carta_correcao
//   - incluir_condutor_mdfe  POST   /v2/mdfe/{ref}/inclusao_condutor
//
// Autenticação (verify_jwt desligado no gateway; validamos aqui):
//   (a) Bearer JWT de gestor RBR -> qualquer ação;
//   (b) header x-rbr-segredo (segredo do Vault, usado pelo trigger de entrega) -> SÓ encerrar_mdfe automático.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-rbr-segredo",
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

function dataSP(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); // YYYY-MM-DD
}

type Acao = "encerrar_mdfe" | "cancelar_mdfe" | "cancelar_cte" | "carta_correcao_cte" | "incluir_condutor_mdfe";
const ACOES: Acao[] = ["encerrar_mdfe", "cancelar_mdfe", "cancelar_cte", "carta_correcao_cte", "incluir_condutor_mdfe"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  try {
    const body = await req.json();
    const acao = body?.acao as Acao;
    const operacao_id = body?.operacao_id as string;
    if (!ACOES.includes(acao) || !operacao_id || typeof operacao_id !== "string") {
      return jsonResponse({ sucesso: false, erro: "Informe acao válida e operacao_id." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // --- Autenticação ---
    let origem: "manual" | "automatico" = "manual";
    let atorId: string | null = null;

    const segredoRecebido = req.headers.get("x-rbr-segredo");
    if (segredoRecebido) {
      const { data: segredo } = await supabaseAdmin.rpc("get_segredo_eventos_fiscais");
      if (!segredo || segredoRecebido !== segredo) return jsonResponse({ sucesso: false, erro: "Não autorizado" }, 401);
      if (acao !== "encerrar_mdfe") return jsonResponse({ sucesso: false, erro: "Chamada interna só pode encerrar MDF-e." }, 403);
      origem = "automatico";
    } else {
      const authHeader = req.headers.get("Authorization") ?? "";
      const supabaseAsUser = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: userData, error: userError } = await supabaseAsUser.auth.getUser();
      if (userError || !userData?.user) return jsonResponse({ sucesso: false, erro: "Não autenticado" }, 401);
      const { data: pessoaAtor } = await supabaseAdmin
        .from("pessoas")
        .select("id, papel")
        .eq("auth_user_id", userData.user.id)
        .maybeSingle();
      if (!pessoaAtor || pessoaAtor.papel !== "gestor_rbr") {
        return jsonResponse({ sucesso: false, erro: "Só um gestor RBR pode executar eventos fiscais." }, 403);
      }
      atorId = pessoaAtor.id;
    }

    // --- Dados da operação e documentos ---
    const { data: op } = await supabaseAdmin
      .from("v_checklist_prontidao")
      .select("ambiente_fiscal, cidade_destino, uf_destino")
      .eq("operacao_id", operacao_id)
      .maybeSingle();
    if (!op) return jsonResponse({ sucesso: false, erro: "Operação não encontrada." }, 404);

    const { data: opRow } = await supabaseAdmin.from("operacoes").select("entregue_em").eq("id", operacao_id).maybeSingle();

    const { data: docs } = await supabaseAdmin
      .from("documentacao_operacao")
      .select("tipo, status, referencia, encerrado_em")
      .eq("operacao_id", operacao_id)
      .in("tipo", ["cte", "mdfe"]);
    const docCte = docs?.find((d) => d.tipo === "cte");
    const docMdfe = docs?.find((d) => d.tipo === "mdfe");

    const ambiente = op.ambiente_fiscal ?? "homologacao";
    const baseUrl = ambiente === "producao" ? "https://api.focusnfe.com.br" : "https://homologacao.focusnfe.com.br";

    async function registrarEvento(
      tipo_documento: "cte" | "mdfe",
      evento: "encerramento" | "cancelamento" | "carta_correcao" | "inclusao_condutor",
      sucesso: boolean,
      mensagem: string | null,
      requisicao: unknown,
      resposta: unknown,
    ) {
      await supabaseAdmin.from("eventos_fiscais_operacao").insert({
        operacao_id,
        tipo_documento,
        evento,
        origem,
        ator_id: atorId,
        sucesso,
        mensagem,
        requisicao: requisicao as never,
        resposta: resposta as never,
      });
    }

    // Retorno de bloqueio local (sem chamar a Focus).
    async function bloquear(
      tipo_documento: "cte" | "mdfe",
      evento: "encerramento" | "cancelamento" | "carta_correcao" | "inclusao_condutor",
      motivo: string,
    ) {
      if (acao === "encerrar_mdfe") {
        await supabaseAdmin
          .from("documentacao_operacao")
          .update({ encerramento_erro: motivo })
          .eq("operacao_id", operacao_id)
          .eq("tipo", "mdfe");
      }
      await registrarEvento(tipo_documento, evento, false, motivo, body, null);
      return jsonResponse({ sucesso: false, bloqueado: true, erro: motivo }, 422);
    }

    const { data: token, error: tokenError } = await supabaseAdmin.rpc("get_focus_nfe_token", { p_ambiente: ambiente });
    if (tokenError || !token) return jsonResponse({ sucesso: false, erro: "Token Focus NFe não encontrado no Vault." }, 503);
    const authFocus = `Basic ${btoa(`${token}:`)}`;

    async function focus(metodo: string, caminho: string, corpo?: unknown) {
      const resp = await fetch(`${baseUrl}${caminho}`, {
        method: metodo,
        headers: { Authorization: authFocus, "Content-Type": "application/json" },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
      });
      const json = await resp.json().catch(() => null);
      return { ok: resp.ok, status: resp.status, json };
    }

    function msgFocus(r: { status: number; json: Record<string, unknown> | null }): string {
      const j = r.json;
      const base = j?.mensagem ? String(j.mensagem) : `Focus NFe respondeu ${r.status}.`;
      const msgSefaz = j?.mensagem_sefaz ? ` (SEFAZ: ${String(j.mensagem_sefaz)})` : "";
      return `${base}${msgSefaz}`;
    }

    // ============================ ENCERRAR MDF-e ============================
    if (acao === "encerrar_mdfe") {
      if (!docMdfe?.referencia) return await bloquear("mdfe", "encerramento", "Esta operação não tem MDF-e emitido.");
      if (docMdfe.encerrado_em) {
        return jsonResponse({ sucesso: true, ja_encerrado: true, mensagem: "MDF-e já está encerrado." });
      }
      if (docMdfe.status !== "emitido") {
        return await bloquear("mdfe", "encerramento", `MDF-e está com status "${docMdfe.status}" — só é possível encerrar um MDF-e autorizado.`);
      }

      const uf = String(body.sigla_uf ?? op.uf_destino ?? "").toUpperCase();
      const municipio = String(body.nome_municipio ?? op.cidade_destino ?? "");
      const data = String(body.data ?? dataSP(opRow?.entregue_em ? new Date(opRow.entregue_em) : new Date()));
      if (!uf || !municipio) {
        return await bloquear("mdfe", "encerramento", "Informe UF e município de encerramento (a cotação não tem cidade/UF de destino).");
      }

      const corpo = { data, sigla_uf: uf, nome_municipio: municipio };
      const r = await focus("POST", `/v2/mdfe/${encodeURIComponent(docMdfe.referencia)}/encerrar`, corpo);
      const jaEncerrado = r.json?.codigo === "mdfe_ja_encerrado";

      if ((r.ok && (r.json?.status === "encerrado" || r.json?.status_sefaz)) || jaEncerrado) {
        await supabaseAdmin
          .from("documentacao_operacao")
          .update({
            encerrado_em: new Date().toISOString(),
            encerramento_origem: origem,
            encerramento_erro: null,
            atualizado_em: new Date().toISOString(),
          })
          .eq("operacao_id", operacao_id)
          .eq("tipo", "mdfe");
        await registrarEvento("mdfe", "encerramento", true, jaEncerrado ? "MDF-e já constava como encerrado na Focus." : "MDF-e encerrado.", corpo, r.json);
        return jsonResponse({ sucesso: true, status: "encerrado", origem, municipio, uf, data });
      }

      const mensagem = msgFocus(r);
      await supabaseAdmin
        .from("documentacao_operacao")
        .update({ encerramento_erro: mensagem })
        .eq("operacao_id", operacao_id)
        .eq("tipo", "mdfe");
      await registrarEvento("mdfe", "encerramento", false, mensagem, corpo, r.json);
      return jsonResponse({ sucesso: false, erro: mensagem, detalhe: r.json }, 502);
    }

    // ============================ CANCELAR MDF-e ============================
    if (acao === "cancelar_mdfe") {
      const justificativa = String(body.justificativa ?? "").trim();
      if (justificativa.length < 15 || justificativa.length > 255) {
        return await bloquear("mdfe", "cancelamento", "A justificativa do cancelamento precisa ter entre 15 e 255 caracteres.");
      }
      if (!docMdfe?.referencia) return await bloquear("mdfe", "cancelamento", "Esta operação não tem MDF-e emitido.");
      if (docMdfe.encerrado_em) return await bloquear("mdfe", "cancelamento", "MDF-e já foi encerrado — não pode mais ser cancelado.");
      if (docMdfe.status !== "emitido") {
        return await bloquear("mdfe", "cancelamento", `MDF-e está com status "${docMdfe.status}" — só é possível cancelar um MDF-e autorizado.`);
      }
      const corpo = { justificativa };
      const r = await focus("DELETE", `/v2/mdfe/${encodeURIComponent(docMdfe.referencia)}`, corpo);
      if (r.ok && r.json?.status === "cancelado") {
        await supabaseAdmin
          .from("documentacao_operacao")
          .update({ status: "cancelado", mensagem_erro: null, atualizado_em: new Date().toISOString() })
          .eq("operacao_id", operacao_id)
          .eq("tipo", "mdfe");
        await registrarEvento("mdfe", "cancelamento", true, "MDF-e cancelado.", corpo, r.json);
        return jsonResponse({ sucesso: true, status: "cancelado" });
      }
      const mensagem = msgFocus(r);
      await registrarEvento("mdfe", "cancelamento", false, mensagem, corpo, r.json);
      return jsonResponse({ sucesso: false, erro: mensagem, detalhe: r.json }, 502);
    }

    // ============================ CANCELAR CT-e ============================
    if (acao === "cancelar_cte") {
      const justificativa = String(body.justificativa ?? "").trim();
      if (justificativa.length < 15 || justificativa.length > 255) {
        return await bloquear("cte", "cancelamento", "A justificativa do cancelamento precisa ter entre 15 e 255 caracteres.");
      }
      if (!docCte?.referencia) return await bloquear("cte", "cancelamento", "Esta operação não tem CT-e emitido.");
      if (docCte.status !== "emitido") {
        return await bloquear("cte", "cancelamento", `CT-e está com status "${docCte.status}" — só é possível cancelar um CT-e autorizado.`);
      }
      if (docMdfe && (docMdfe.status === "emitido" || docMdfe.status === "pendente")) {
        return await bloquear("cte", "cancelamento", "Existe um MDF-e ativo vinculado a esta operação — cancele o MDF-e antes de cancelar o CT-e.");
      }
      const corpo = { justificativa };
      const r = await focus("DELETE", `/v2/cte/${encodeURIComponent(docCte.referencia)}`, corpo);
      if (r.ok && r.json?.status === "cancelado") {
        await supabaseAdmin
          .from("documentacao_operacao")
          .update({ status: "cancelado", mensagem_erro: null, atualizado_em: new Date().toISOString() })
          .eq("operacao_id", operacao_id)
          .eq("tipo", "cte");
        await registrarEvento("cte", "cancelamento", true, "CT-e cancelado.", corpo, r.json);
        return jsonResponse({ sucesso: true, status: "cancelado" });
      }
      const mensagem = msgFocus(r);
      await registrarEvento("cte", "cancelamento", false, mensagem, corpo, r.json);
      return jsonResponse({ sucesso: false, erro: mensagem, detalhe: r.json }, 502);
    }

    // ============================ CARTA DE CORREÇÃO CT-e ============================
    if (acao === "carta_correcao_cte") {
      const campo = String(body.campo_corrigido ?? "").trim();
      const valor = String(body.valor_corrigido ?? "").trim();
      if (!campo || !valor) return await bloquear("cte", "carta_correcao", "Informe o campo e o novo valor da correção.");
      if (!docCte?.referencia || docCte.status !== "emitido") {
        return await bloquear("cte", "carta_correcao", "A carta de correção só pode ser enviada para um CT-e autorizado.");
      }
      const corpo: Record<string, unknown> = { campo_corrigido: campo, valor_corrigido: valor };
      if (body.grupo_corrigido) corpo.grupo_corrigido = String(body.grupo_corrigido);
      if (body.numero_item_grupo_corrigido) corpo.numero_item_grupo_corrigido = Number(body.numero_item_grupo_corrigido);
      const r = await focus("POST", `/v2/cte/${encodeURIComponent(docCte.referencia)}/carta_correcao`, corpo);
      if (r.ok && r.json?.status && r.json.status !== "erro_autorizacao") {
        await registrarEvento("cte", "carta_correcao", true, `Carta de correção nº ${r.json.numero_carta_correcao ?? "?"} registrada.`, corpo, r.json);
        return jsonResponse({ sucesso: true, status: r.json.status, numero_carta_correcao: r.json.numero_carta_correcao ?? null, aviso: "A carta de correção é cumulativa: a última enviada vale." });
      }
      const mensagem = msgFocus(r);
      await registrarEvento("cte", "carta_correcao", false, mensagem, corpo, r.json);
      return jsonResponse({ sucesso: false, erro: mensagem, detalhe: r.json }, 502);
    }

    // ============================ INCLUIR CONDUTOR MDF-e ============================
    if (acao === "incluir_condutor_mdfe") {
      const nome = String(body.nome ?? "").trim();
      const cpf = somenteDigitos(String(body.cpf ?? ""));
      if (nome.length < 2 || cpf.length !== 11) return await bloquear("mdfe", "inclusao_condutor", "Informe o nome e o CPF (11 dígitos) do condutor.");
      if (!docMdfe?.referencia || docMdfe.status !== "emitido" || docMdfe.encerrado_em) {
        return await bloquear("mdfe", "inclusao_condutor", "O condutor só pode ser incluído em um MDF-e autorizado e ainda não encerrado.");
      }
      const corpo = { nome, cpf };
      const r = await focus("POST", `/v2/mdfe/${encodeURIComponent(docMdfe.referencia)}/inclusao_condutor`, corpo);
      if (r.ok && r.json?.status === "incluido") {
        await registrarEvento("mdfe", "inclusao_condutor", true, `Condutor ${nome} incluído.`, corpo, r.json);
        return jsonResponse({ sucesso: true, status: "incluido" });
      }
      const mensagem = msgFocus(r);
      await registrarEvento("mdfe", "inclusao_condutor", false, mensagem, corpo, r.json);
      return jsonResponse({ sucesso: false, erro: mensagem, detalhe: r.json }, 502);
    }

    return jsonResponse({ sucesso: false, erro: "Ação não suportada." }, 400);
  } catch (e) {
    return jsonResponse({ sucesso: false, erro: String(e) }, 500);
  }
});
