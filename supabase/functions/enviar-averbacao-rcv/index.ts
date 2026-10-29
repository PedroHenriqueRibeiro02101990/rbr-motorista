// Edge Function: enviar-averbacao-rcv (v2, 2026-10-16)
// v2: TESTADO EM PRODUCAO (MDF-e no 2 da operacao de teste, 00:51): POST /rest/MDFe funciona. Resposta de sucesso:
//   { Serie, Filial, Numero, Declarado: {Protocolo, dhChancela}, AverbadoRCV: {IdViagem, Protocolo, dhAverbacao} }.
//   O numero da averbacao RC-V e AverbadoRCV.Protocolo (Declarado.Protocolo e so a declaracao do MDF-e). IdViagem fica na resposta crua.
// Averba o MDF-e autorizado na apolice RC-V (Sompo) pela Averba (AT&M/NSTech), caixa 11486292 (provedor nstech_atm,
// usuario WS_pedroe24, senha no Vault via get_nstech_averba_senha). A apolice RC-V exige averbacao de TODA viagem antes da saida
// do veiculo, com base no MDF-e (frota propria) - ver claude/apolice-rcv-sompo-texto-integral.md. A RCTR-C (Allianz, CT-e) segue na
// funcao enviar-averbacao.
// Ordem: CT-e -> averbacao Allianz -> MDF-e -> averbacao Sompo (esta funcao). Tudo antes da saida do caminhao.
// Resultado gravado em operacao_ciot_vpo (averbacao_rcv_status / _numero / _erro / _resposta / _em), sem mexer no enum de documentos.
// A resposta crua e sempre gravada em averbacao_rcv_resposta. Nunca finge sucesso.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-secret",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const AVERBA_BASE_URL = "https://webserver.averba.com.br";
const PROVEDOR = "nstech_atm"; // caixa 11486292 (Sompo, RC-V)
const RPC_SENHA = "get_nstech_averba_senha";

// Numero da averbacao RC-V = AverbadoRCV.Protocolo. Nao usa Declarado.Protocolo (e so a declaracao do MDF-e).
function acharNumeroAverbacao(json: Record<string, unknown> | null): string | null {
  const rcv = (json as { AverbadoRCV?: { Protocolo?: unknown } } | null)?.AverbadoRCV;
  const v = rcv?.Protocolo;
  return typeof v === "string" || typeof v === "number" ? (String(v).trim() || null) : null;
}

function errosDaAverba(json: Record<string, unknown> | null): string[] {
  const erros = (json as { Erros?: { Erro?: unknown } } | null)?.Erros?.Erro;
  if (!erros) return [];
  const lista = Array.isArray(erros) ? erros : [erros];
  return lista
    .map((e) => {
      const o = e as { Codigo?: unknown; Descricao?: unknown };
      return `${o?.Codigo ?? "?"}: ${o?.Descricao ?? "sem descricao"}`;
    })
    .filter((s) => s.trim() !== "");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { operacao_id, teste_login } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // ---- Autenticacao: segredo do robo OU gestor_rbr logado ----
    const segredo = req.headers.get("x-sync-secret") ?? "";
    let autorizado = false;
    if (segredo) {
      const { data: ok } = await supabase.rpc("validar_sync_secret", { p_secret: segredo });
      autorizado = ok === true;
    }
    if (!autorizado) {
      const authHeader = req.headers.get("Authorization") ?? "";
      const supabaseAsUser = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: userData, error: userError } = await supabaseAsUser.auth.getUser();
      if (userError || !userData?.user) return jsonResponse({ sucesso: false, erro: "Nao autenticado." }, 401);
      const { data: pessoa } = await supabase.from("pessoas").select("papel").eq("auth_user_id", userData.user.id).maybeSingle();
      if (!pessoa || pessoa.papel !== "gestor_rbr") {
        return jsonResponse({ sucesso: false, erro: "Somente o gestor RBR pode enviar averbacao." }, 403);
      }
    }

    const { data: integracao } = await supabase
      .from("integracao_averbacao")
      .select("id, codigo_atm, usuario_integracao, ativo")
      .eq("provedor", PROVEDOR)
      .maybeSingle();

    async function loginAverba(): Promise<{ ok: boolean; status: number; token?: string; corpo: string; erro?: string }> {
      const { data: senha, error: senhaError } = await supabase.rpc(RPC_SENHA);
      if (senhaError || !senha) return { ok: false, status: 0, corpo: "", erro: "Nao foi possivel obter a senha da integracao AT&M (Sompo) no Vault." };
      const resp = await fetch(`${AVERBA_BASE_URL}/rest/Auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ usuario: integracao!.usuario_integracao, senha, codigoatm: integracao!.codigo_atm }),
      });
      const texto = await resp.text();
      if (!resp.ok) return { ok: false, status: resp.status, corpo: texto };
      let token: string;
      try {
        const j = JSON.parse(texto);
        token = String(j?.Bearer ?? j?.bearer ?? j?.token ?? j?.Token ?? j?.access_token ?? j?.jwt ?? texto);
      } catch {
        token = texto;
      }
      token = token.replace(/^Bearer\s+/i, "").trim();
      return { ok: true, status: resp.status, token, corpo: texto };
    }

    if (teste_login === true) {
      if (!integracao) return jsonResponse({ sucesso: false, erro: "Integracao AT&M (Sompo) nao cadastrada." }, 422);
      const r = await loginAverba();
      return jsonResponse({
        sucesso: r.ok,
        login_status_http: r.status,
        token_recebido: r.ok && !!r.token && r.token.length > 10,
        erro: r.erro ?? (r.ok ? undefined : "A Averba recusou o login."),
        resposta_recusa: r.ok ? undefined : r.corpo.slice(0, 300),
      }, r.ok ? 200 : 502);
    }

    if (!operacao_id || typeof operacao_id !== "string") {
      return jsonResponse({ sucesso: false, erro: "Informe operacao_id." }, 400);
    }

    const bloqueios: string[] = [];
    const regras: { tipo: "bloqueio"; origem: "tecnico"; mensagem: string }[] = [];
    const bloqueio = (mensagem: string) => {
      bloqueios.push(mensagem);
      regras.push({ tipo: "bloqueio", origem: "tecnico", mensagem });
    };

    // 1. MDF-e autorizado com chave e XML capturado
    const { data: mdfe } = await supabase
      .from("documentacao_operacao")
      .select("status, chave_acesso, url_xml, numero_documento")
      .eq("operacao_id", operacao_id)
      .eq("tipo", "mdfe")
      .maybeSingle();
    if (!mdfe || mdfe.status !== "emitido" || !mdfe.chave_acesso) {
      bloqueio("MDF-e desta operacao ainda nao foi emitido/autorizado. Emita o MDF-e antes de averbar na Sompo (RC-V).");
    } else if (!mdfe.url_xml) {
      bloqueio("XML do MDF-e autorizado ainda nao foi capturado. Consulte o status do MDF-e novamente antes de averbar na Sompo.");
    }

    // 2. Ja averbado?
    const { data: atual } = await supabase
      .from("operacao_ciot_vpo")
      .select("averbacao_rcv_status")
      .eq("operacao_id", operacao_id)
      .maybeSingle();
    if (atual?.averbacao_rcv_status === "emitido") {
      return jsonResponse({ sucesso: false, erro: "Averbacao na Sompo (RC-V) ja foi confirmada para esta operacao." }, 409);
    }

    // 3. Integracao ativa
    if (!integracao) bloqueio("Integracao AT&M/NSTech da Sompo (caixa 11486292) nao esta cadastrada.");
    else if (!integracao.ativo) bloqueio("Integracao AT&M/NSTech da Sompo esta inativa.");
    else if (!integracao.codigo_atm || !integracao.usuario_integracao) bloqueio("Integracao AT&M/NSTech da Sompo esta incompleta.");

    // 4. Modo teste (mesma trava dos outros documentos)
    const { data: trava, error: travaErr } = await supabase.rpc("trava_teste_fiscal", { p_operacao_id: operacao_id, p_tipo: "atm" });
    if (travaErr) return jsonResponse({ sucesso: false, erro: `Nao consegui verificar o modo teste: ${travaErr.message}` }, 500);
    if (trava?.teste && Array.isArray(trava.bloqueios)) bloqueios.push(...trava.bloqueios);

    const gravar = (campos: Record<string, unknown>) =>
      supabase.from("operacao_ciot_vpo").upsert(
        { operacao_id, averbacao_rcv_em: new Date().toISOString(), ...campos },
        { onConflict: "operacao_id" },
      );

    if (bloqueios.length > 0) {
      const mensagem = bloqueios.join(" ");
      await gravar({ averbacao_rcv_status: "bloqueado", averbacao_rcv_erro: mensagem });
      return jsonResponse({ sucesso: false, bloqueado: true, motivos: bloqueios, regras, erro: mensagem }, 422);
    }

    // 5. XML autorizado do MDF-e
    let mdfeXml: string;
    try {
      const xmlResp = await fetch(mdfe!.url_xml as string);
      if (!xmlResp.ok) throw new Error(`status ${xmlResp.status}`);
      mdfeXml = await xmlResp.text();
    } catch (e) {
      const erroMsg = `Nao foi possivel baixar o XML do MDF-e autorizado: ${e instanceof Error ? e.message : String(e)}`;
      await gravar({ averbacao_rcv_status: "erro", averbacao_rcv_erro: erroMsg });
      return jsonResponse({ sucesso: false, erro: erroMsg }, 502);
    }

    // 6. Login
    const login = await loginAverba();
    if (!login.ok) {
      const erroMsg = login.erro ?? `Falha no login da integracao AT&M/NSTech (status ${login.status}): ${login.corpo}`;
      await gravar({ averbacao_rcv_status: "erro", averbacao_rcv_erro: erroMsg, averbacao_rcv_resposta: { auth_status: login.status, auth_body: login.corpo } });
      return jsonResponse({ sucesso: false, erro: erroMsg }, 502);
    }

    // 7. Envia o MDF-e (mesmo formato do CT-e: XML autorizado cru, application/xml)
    const averbaResp = await fetch(`${AVERBA_BASE_URL}/rest/MDFe`, {
      method: "POST",
      headers: { "Content-Type": "application/xml", Accept: "application/json", Authorization: `Bearer ${login.token}` },
      body: mdfeXml,
    });
    const averbaText = await averbaResp.text();
    let averbaJson: Record<string, unknown> | null = null;
    try {
      averbaJson = JSON.parse(averbaText);
    } catch {
      averbaJson = null;
    }

    const errosAverba = errosDaAverba(averbaJson);
    if (!averbaResp.ok || errosAverba.length > 0) {
      const detalhe = errosAverba.length > 0 ? ` ${errosAverba.join(" | ")}.` : "";
      const erroMsg = `AT&M/NSTech recusou a averbacao do MDF-e na Sompo (status ${averbaResp.status}).${detalhe} Resposta bruta gravada para diagnostico.`;
      await gravar({
        averbacao_rcv_status: "erro",
        averbacao_rcv_erro: erroMsg,
        averbacao_rcv_resposta: { averba_status: averbaResp.status, averba_body: averbaJson ?? averbaText },
      });
      return jsonResponse({ sucesso: false, erro: erroMsg, detalhe: averbaJson ?? averbaText }, 502);
    }

    const numero = acharNumeroAverbacao(averbaJson);
    await gravar({
      averbacao_rcv_status: "emitido",
      averbacao_rcv_numero: numero,
      averbacao_rcv_erro: numero ? null : "Averbacao aceita pela AT&M, mas nao identifiquei o numero (AverbadoRCV.Protocolo) na resposta. Confira a resposta gravada.",
      averbacao_rcv_resposta: averbaJson ?? { raw: averbaText },
    });

    return jsonResponse({
      sucesso: true,
      numero_averbacao: numero,
      aviso: numero ? undefined : "Numero da averbacao nao identificado na resposta; confira a resposta gravada.",
      detalhe: averbaJson ?? averbaText,
    });
  } catch (e) {
    console.error(e);
    return jsonResponse({ sucesso: false, erro: e instanceof Error ? e.message : "Erro desconhecido." }, 500);
  }
});
