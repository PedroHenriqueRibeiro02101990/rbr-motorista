// Edge Function: enviar-averbacao (v9, 2026-10-16)
// v9 (2026-10-16): numero da averbacao = Averbado.DadosSeguro[].NumeroAverbacao (numero da averbadora/seguradora, o que vai no MDF-e).
//   Antes (v7/v8) pegava Averbado.Protocolo (protocolo da AT&M). Resposta real vista em producao (CT-e no 3):
//   { Infos?, Serie, TpDoc, Numero, CNPJCli, Averbado: { Protocolo, DadosSeguro: [{ NumeroAverbacao }], dhAverbacao } }.
//   Ordem de preferencia: NumeroAverbacao > Averbado.Protocolo > busca generica.
// v8 (2026-10-16): o CT-e (RCTR-C, Allianz) passa a usar a integracao da caixa postal 11486306 (provedor nstech_atm_allianz, usuario
// WS_RBR_ALLIANZ, senha no Vault em nstech_averba_senha_integracao_allianz). A caixa 11486292 (provedor nstech_atm) e da Sompo (RC-V) e
// respondia erro 027 (apolice nao cadastrada para o ramo) por nao ter a RCTR-C. A senha vem de get_nstech_averba_senha_allianz().
// v7 (2026-10-16): o POST /rest/CTe agora envia o XML autorizado do CT-e como corpo cru com Content-Type application/xml
// (a Averba respondeu erro 107 "Header Content-Type invalido. Deve ser application/xml." ao receber JSON). Resposta 200 com
// bloco Erros passa a contar como erro.
// v6 (2026-10-15): resposta de bloqueio traz `regras` com a origem de cada um (antt = apólice RCTR-C; tecnico = sem isso
// o envio à AT&M é impossível). Nenhum bloqueio daqui é regra só da RBR.
//
// Envia o CT-e ja autorizado de uma operacao para averbacao automatica na plataforma Averba (AT&M/NSTech),
// que atende a apolice RCTR-C. Sem a averbacao a seguradora pode negar indenizacao em sinistro e o MDF-e e
// rejeitado (rej. 699).
//
// v3: verify_jwt desligado no gateway; autenticacao aqui (gestor_rbr logado OU cabecalho x-sync-secret do Vault);
//     modo { teste_login: true } so faz o login e devolve o resultado (nunca devolve o token).
// v4: a Averba exige o cabecalho Accept: application/json (erro 104 no primeiro teste).
// v5: login com token no campo "Bearer" (a API usa nomes em PascalCase).
//
// A resposta crua e gravada integralmente em payload_resposta. Nunca finge sucesso.

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
// Integracao usada para o CT-e (apolice RCTR-C da Allianz, caixa postal 11486306).
const PROVEDOR_CTE = "nstech_atm_allianz";
const RPC_SENHA_CTE = "get_nstech_averba_senha_allianz";

// Busca em profundidade o primeiro valor de uma chave (sem diferenciar maiusculas), dentro de objetos e listas.
function buscarChave(valor: unknown, chave: string, profundidade = 0): string | null {
  if (profundidade > 6 || valor === null || typeof valor !== "object") return null;
  if (Array.isArray(valor)) {
    for (const item of valor) {
      const achou = buscarChave(item, chave, profundidade + 1);
      if (achou) return achou;
    }
    return null;
  }
  for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
    if (k.toLowerCase() === chave && (typeof v === "string" || typeof v === "number") && String(v).trim() !== "") {
      return String(v).trim();
    }
  }
  for (const v of Object.values(valor as Record<string, unknown>)) {
    const achou = buscarChave(v, chave, profundidade + 1);
    if (achou) return achou;
  }
  return null;
}

// Numero da averbacao do CT-e: NumeroAverbacao (DadosSeguro) > Averbado.Protocolo > outras chaves conhecidas.
// Nao usa "Numero" (na resposta da Averba e o numero do CT-e).
function acharNumeroAverbacao(json: Record<string, unknown> | null): string | null {
  if (!json) return null;
  const doSeguro = buscarChave(json, "numeroaverbacao");
  if (doSeguro) return doSeguro;
  const protocolo = (json as { Averbado?: { Protocolo?: unknown } }).Averbado?.Protocolo;
  if ((typeof protocolo === "string" || typeof protocolo === "number") && String(protocolo).trim() !== "") return String(protocolo).trim();
  for (const chave of ["averbacao", "protocolo", "protocoloaverbacao", "numeroaverba"]) {
    const achou = buscarChave(json, chave);
    if (achou) return achou;
  }
  return null;
}

// A Averba devolve erros no bloco Erros.Erro (lista ou objeto unico), as vezes ate com HTTP 200.
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

    // ---- Integracao cadastrada (login precisa dela, mesmo no teste) ----
    const { data: integracao } = await supabase
      .from("integracao_averbacao")
      .select("id, codigo_atm, usuario_integracao, ativo")
      .eq("provedor", PROVEDOR_CTE)
      .maybeSingle();

    async function loginAverba(): Promise<{ ok: boolean; status: number; token?: string; corpo: string; erro?: string }> {
      const { data: senha, error: senhaError } = await supabase.rpc(RPC_SENHA_CTE);
      if (senhaError || !senha) return { ok: false, status: 0, corpo: "", erro: "Nao foi possivel obter a senha da integracao AT&M armazenada no Vault." };
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

    // ---- Modo teste de login: nao envia nada, nao devolve o token ----
    if (teste_login === true) {
      if (!integracao) return jsonResponse({ sucesso: false, erro: "Integracao AT&M nao cadastrada." }, 422);
      const r = await loginAverba();
      let formato = "vazio";
      try {
        const j = JSON.parse(r.corpo);
        formato = j && typeof j === "object" ? `json com campos: ${Object.keys(j).join(", ")}` : "json simples";
      } catch {
        formato = r.corpo ? "texto puro (token direto)" : "vazio";
      }
      return jsonResponse({
        sucesso: r.ok,
        login_status_http: r.status,
        token_recebido: r.ok && !!r.token && r.token.length > 10,
        tamanho_token: r.token?.length ?? 0,
        formato_resposta: formato,
        erro: r.erro ?? (r.ok ? undefined : "A Averba recusou o login."),
        resposta_recusa: r.ok ? undefined : r.corpo.slice(0, 300),
        integracao_ativa: integracao.ativo,
      }, r.ok ? 200 : 502);
    }

    if (!operacao_id || typeof operacao_id !== "string") {
      return jsonResponse({ sucesso: false, erro: "Informe operacao_id." }, 400);
    }

    // Origem de cada bloqueio (C1, 2026-10-15): "antt" = lei (seguro RCTR-C obrigatório); "tecnico" = sem isso o
    // envio à AT&M é impossível (não é regra nossa). Nada aqui é regra só da RBR.
    const bloqueios: string[] = [];
    const regras: { tipo: "bloqueio"; origem: "antt" | "tecnico"; mensagem: string }[] = [];
    const bloqueio = (origem: "antt" | "tecnico", mensagem: string) => {
      bloqueios.push(mensagem);
      regras.push({ tipo: "bloqueio", origem, mensagem });
    };

    // 1. CT-e precisa estar emitido, com chave e XML capturados
    const { data: cte } = await supabase
      .from("documentacao_operacao")
      .select("status, chave_acesso, url_xml, numero_documento")
      .eq("operacao_id", operacao_id)
      .eq("tipo", "cte")
      .maybeSingle();

    if (!cte || cte.status !== "emitido" || !cte.chave_acesso) {
      bloqueio("tecnico", "CT-e desta operacao ainda nao foi emitido/autorizado. Emita o CT-e antes de enviar a averbacao.");
    } else if (!cte.url_xml) {
      bloqueio("tecnico", "XML do CT-e autorizado ainda nao foi capturado. Consulte o status do CT-e novamente antes de enviar a averbacao.");
    }

    // 2. Ja existe averbacao confirmada?
    const { data: averbacaoExistente } = await supabase
      .from("documentacao_operacao")
      .select("status")
      .eq("operacao_id", operacao_id)
      .eq("tipo", "atm")
      .maybeSingle();
    if (averbacaoExistente?.status === "emitido") {
      return jsonResponse({ sucesso: false, erro: "Averbacao ja foi confirmada para esta operacao. Nao ha necessidade de reenviar." }, 409);
    }

    // 3. Integracao AT&M cadastrada e ativa
    if (!integracao) {
      bloqueio("tecnico", "Integracao com a AT&M/NSTech (Averba, caixa da Allianz) nao esta cadastrada no sistema.");
    } else if (!integracao.ativo) {
      bloqueio("tecnico", "Integracao com a AT&M/NSTech (Averba) esta cadastrada mas marcada como inativa. Ative-a antes de enviar averbacoes automaticas.");
    } else if (!integracao.codigo_atm || !integracao.usuario_integracao) {
      bloqueio("tecnico", "Integracao com a AT&M/NSTech esta incompleta (falta codigo ATM ou usuario).");
    }

    // 4. Apolice RCTR-C vigente com numero
    const hoje = new Date().toISOString().slice(0, 10);
    const { data: apolice } = await supabase
      .from("apolices_seguro")
      .select("numero_apolice, seguradora_cnpj, tipo")
      .eq("tipo", "RCTR-C")
      .lte("vigencia_inicio", hoje)
      .or(`vigencia_fim.is.null,vigencia_fim.gte.${hoje}`)
      .maybeSingle();
    if (!apolice || !apolice.numero_apolice) {
      bloqueio("antt", "Apolice RCTR-C vigente nao encontrada ou sem numero de apolice cadastrado.");
    }

    // Modo teste (cotacoes.eh_teste): trava invertida no banco — RBR remetente E destinatária, cliente = RBR,
    // valores até R$ 5. Fora do modo teste devolve teste=false e nada muda.
    const { data: trava, error: travaErr } = await supabase.rpc("trava_teste_fiscal", { p_operacao_id: operacao_id, p_tipo: "atm" });
    if (travaErr) {
      return jsonResponse({ sucesso: false, erro: `Não consegui verificar o modo teste: ${travaErr.message}` }, 500);
    }
    if (trava?.teste && Array.isArray(trava.bloqueios)) bloqueios.push(...trava.bloqueios);

    const gravar = (campos: Record<string, unknown>) =>
      supabase.from("documentacao_operacao").upsert(
        { operacao_id, tipo: "atm", atualizado_em: new Date().toISOString(), ...campos },
        { onConflict: "operacao_id,tipo" },
      );

    if (bloqueios.length > 0) {
      const mensagem = bloqueios.join(" ");
      await gravar({ status: "bloqueado", mensagem_erro: mensagem });
      return jsonResponse({ sucesso: false, bloqueado: true, motivos: bloqueios, regras, erro: mensagem }, 422);
    }

    // 5. Baixa o XML autorizado do CT-e
    let cteXml: string;
    try {
      const xmlResp = await fetch(cte!.url_xml as string);
      if (!xmlResp.ok) throw new Error(`status ${xmlResp.status}`);
      cteXml = await xmlResp.text();
    } catch (e) {
      const erroMsg = `Nao foi possivel baixar o XML do CT-e autorizado: ${e instanceof Error ? e.message : String(e)}`;
      await gravar({ status: "erro", mensagem_erro: erroMsg });
      return jsonResponse({ sucesso: false, erro: erroMsg }, 502);
    }

    // 6-7. Login na Averba
    const login = await loginAverba();
    if (!login.ok) {
      const erroMsg = login.erro ?? `Falha no login da integracao AT&M/NSTech (status ${login.status}): ${login.corpo}`;
      await gravar({ status: "erro", mensagem_erro: erroMsg, payload_resposta: { auth_status: login.status, auth_body: login.corpo } });
      return jsonResponse({ sucesso: false, erro: erroMsg }, 502);
    }

    // 8. Envia o CT-e para averbacao: corpo = XML autorizado cru, Content-Type application/xml (erro 107 da Averba)
    const averbaResp = await fetch(`${AVERBA_BASE_URL}/rest/CTe`, {
      method: "POST",
      headers: { "Content-Type": "application/xml", Accept: "application/json", Authorization: `Bearer ${login.token}` },
      body: cteXml,
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
      const detalheErros = errosAverba.length > 0 ? ` ${errosAverba.join(" | ")}.` : "";
      const erroMsg = `AT&M/NSTech recusou o envio da averbacao (status ${averbaResp.status}).${detalheErros} Resposta bruta gravada para diagnostico.`;
      await gravar({ status: "erro", mensagem_erro: erroMsg, payload_resposta: { averba_status: averbaResp.status, averba_body: averbaJson ?? averbaText } });
      return jsonResponse({ sucesso: false, erro: erroMsg, detalhe: averbaJson ?? averbaText }, 502);
    }

    // 9. Sucesso: grava tudo o que a AT&M devolveu, sem inventar campos
    const numeroAverbacao = acharNumeroAverbacao(averbaJson);
    await gravar({
      status: "emitido",
      numero_documento: numeroAverbacao,
      mensagem_erro: numeroAverbacao
        ? null
        : "Averbacao aceita pela AT&M, mas nao identifiquei o numero na resposta. Confira a resposta gravada e informe o numero da averbacao na operacao (o MDF-e exige).",
      payload_resposta: averbaJson ?? { raw: averbaText },
    });

    // O MDF-e le o numero daqui: se a Averba devolveu numero, ja deixa gravado na operacao.
    if (numeroAverbacao) {
      await supabase.from("operacao_ciot_vpo").upsert(
        { operacao_id, numero_averbacao: String(numeroAverbacao), updated_at: new Date().toISOString() },
        { onConflict: "operacao_id" },
      );
    }

    return jsonResponse({
      sucesso: true,
      numero_averbacao: numeroAverbacao,
      aviso: numeroAverbacao ? undefined : "Numero da averbacao nao identificado na resposta; confira a resposta gravada.",
      detalhe: averbaJson ?? averbaText,
    });
  } catch (e) {
    console.error(e);
    return jsonResponse({ sucesso: false, erro: e instanceof Error ? e.message : "Erro desconhecido." }, 500);
  }
});
