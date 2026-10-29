// Edge Function: consulta-cadastros
//
// Consultas auxiliares da Focus NFe (APIs acessórias) para automatizar cadastros:
//   - acao "cnpj"  { cnpj }  -> GET /v2/cnpjs/{cnpj}   (razão social, situação, CNAE, Simples/MEI, endereço + IBGE)
//   - acao "cep"   { cep }   -> GET /v2/ceps/{cep}     (logradouro, bairro, cidade, UF, IBGE)
//   - acao "ncm"   { codigo } -> GET /v2/ncms?codigo=  (valida NCM e traz a descrição)
//   - acao "sincronizar_municipios" -> carrega os ~5.570 municípios (IBGE) em municipios_ibge via GET /v2/municipios
//
// Auth: JWT de gestor RBR ou agenciador aprovado (cnpj/cep/ncm); sincronizar_municipios: gestor ou header x-rbr-segredo (Vault).
// Observação: a Focus NÃO devolve inscrição estadual nem nome fantasia/telefone/e-mail no CNPJ — esses seguem manuais
// (a IE virá do XML da NF-e quando o parser existir).

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

const dig = (v: unknown) => String(v ?? "").replace(/\D/g, "");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  try {
    const body = await req.json();
    const acao = String(body?.acao ?? "");
    if (!["cnpj", "cep", "ncm", "sincronizar_municipios"].includes(acao)) {
      return jsonResponse({ sucesso: false, erro: "Ação inválida." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // --- Autenticação ---
    const segredoRecebido = req.headers.get("x-rbr-segredo");
    if (segredoRecebido) {
      const { data: segredo } = await supabaseAdmin.rpc("get_segredo_eventos_fiscais");
      if (!segredo || segredoRecebido !== segredo || acao !== "sincronizar_municipios") {
        return jsonResponse({ sucesso: false, erro: "Não autorizado" }, 401);
      }
    } else {
      const authHeader = req.headers.get("Authorization") ?? "";
      const supabaseAsUser = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: userData, error: userError } = await supabaseAsUser.auth.getUser();
      if (userError || !userData?.user) return jsonResponse({ sucesso: false, erro: "Não autenticado" }, 401);
      const { data: pessoa } = await supabaseAdmin
        .from("pessoas")
        .select("papel")
        .eq("auth_user_id", userData.user.id)
        .maybeSingle();
      const papel = pessoa?.papel as string | undefined;
      const permitido = acao === "sincronizar_municipios" ? papel === "gestor_rbr" : papel === "gestor_rbr" || papel === "agenciador";
      if (!permitido) return jsonResponse({ sucesso: false, erro: "Sem permissão para esta consulta." }, 403);
    }

    // As APIs acessórias respondem em qualquer ambiente; usamos o token que existe no Vault (homologação).
    const { data: token } = await supabaseAdmin.rpc("get_focus_nfe_token", { p_ambiente: "homologacao" });
    if (!token) return jsonResponse({ sucesso: false, erro: "Token Focus NFe não encontrado no Vault." }, 503);
    const base = "https://homologacao.focusnfe.com.br/v2";
    const headers = { Authorization: `Basic ${btoa(`${token}:`)}` };

    // ============================ CNPJ ============================
    if (acao === "cnpj") {
      const cnpj = dig(body.cnpj);
      if (cnpj.length !== 14) return jsonResponse({ sucesso: false, erro: "Informe um CNPJ com 14 dígitos." }, 400);
      const r = await fetch(`${base}/cnpjs/${cnpj}`, { headers });
      const j = await r.json().catch(() => null);
      if (r.status === 404) return jsonResponse({ sucesso: false, erro: "CNPJ não encontrado na Receita." }, 404);
      if (!r.ok || !j) return jsonResponse({ sucesso: false, erro: `Consulta de CNPJ falhou (${r.status}).` }, 502);
      const e = j.endereco ?? {};
      const situacao = String(j.situacao_cadastral ?? "");

      // Complemento (melhor esforço): IE, nome fantasia, telefone e e-mail via CNPJ.ws (a Focus não devolve isso).
      // Limite gratuito baixo (3 consultas/min) — se falhar, o front só pede preenchimento manual.
      let ie: string | null = null;
      let ieSituacao: string | null = null;
      let fantasia: string | null = null;
      let telefone: string | null = null;
      let email: string | null = null;
      let complementoStatus = "nao_tentado";
      try {
        const rw = await fetch(`https://publica.cnpj.ws/cnpj/${cnpj}`, { signal: AbortSignal.timeout(7000) });
        complementoStatus = `http_${rw.status}`;
        if (rw.ok) {
          const w = await rw.json();
          const est = w?.estabelecimento ?? {};
          fantasia = est.nome_fantasia ?? null;
          telefone = est.telefone1 ? `${est.ddd1 ?? ""}${est.telefone1}` : null;
          email = est.email ?? null;
          const lista = Array.isArray(est.inscricoes_estaduais) ? est.inscricoes_estaduais : [];
          const daUf = lista.filter((x: { estado?: { sigla?: string } }) => !e.uf || x?.estado?.sigla === e.uf);
          const escolhida = daUf.find((x: { ativo?: boolean }) => x.ativo) ?? daUf[0] ?? null;
          if (escolhida) {
            ie = dig(escolhida.inscricao_estadual) || null;
            ieSituacao = escolhida.ativo ? "ativa" : "baixada/inativa";
          }
        }
      } catch (_) {
        complementoStatus = "falhou";
      }
      return jsonResponse({
        sucesso: true,
        complemento_status: complementoStatus,
        dados: {
          cnpj,
          razao_social: j.razao_social ?? null,
          situacao_cadastral: situacao || null,
          ativa: /ativa/i.test(situacao),
          nome_fantasia: fantasia,
          telefone,
          email,
          inscricao_estadual: ie,
          ie_situacao: ieSituacao,
          cnae: j.cnae_principal != null ? String(j.cnae_principal) : null,
          optante_simples_nacional: j.optante_simples_nacional ?? null,
          optante_mei: j.optante_mei ?? null,
          cep: dig(e.cep) || null,
          logradouro: [e.tipo_logradouro, e.logradouro].filter(Boolean).join(" ") || null,
          numero_endereco: e.numero ?? null,
          complemento: e.complemento ?? null,
          bairro: e.bairro ?? null,
          cidade: e.nome_municipio ?? null,
          uf: e.uf ?? null,
          codigo_ibge: e.codigo_ibge != null ? String(e.codigo_ibge) : null,
        },
      });
    }

    // ============================ CEP ============================
    if (acao === "cep") {
      const cep = dig(body.cep);
      if (cep.length !== 8) return jsonResponse({ sucesso: false, erro: "Informe um CEP com 8 dígitos." }, 400);
      const r = await fetch(`${base}/ceps/${cep}`, { headers });
      const j = await r.json().catch(() => null);
      if (r.status === 404) return jsonResponse({ sucesso: false, erro: "CEP não encontrado." }, 404);
      if (!r.ok || !j) return jsonResponse({ sucesso: false, erro: `Consulta de CEP falhou (${r.status}).` }, 502);
      return jsonResponse({
        sucesso: true,
        dados: {
          cep,
          logradouro: [j.tipo_logradouro, j.nome_logradouro].filter(Boolean).join(" ") || j.nome || null,
          bairro: j.bairro ?? null,
          cidade: j.nome_localidade ?? null,
          uf: j.uf ?? null,
          codigo_ibge: j.codigo_ibge != null ? String(j.codigo_ibge) : null,
        },
      });
    }

    // ============================ NCM ============================
    if (acao === "ncm") {
      const codigo = dig(body.codigo);
      if (codigo.length !== 8) return jsonResponse({ sucesso: false, erro: "Informe um NCM com 8 dígitos." }, 400);
      const r = await fetch(`${base}/ncms?codigo=${codigo}`, { headers });
      const j = await r.json().catch(() => null);
      if (!r.ok) return jsonResponse({ sucesso: false, erro: `Consulta de NCM falhou (${r.status}).` }, 502);
      const item = Array.isArray(j) ? j.find((x: { codigo?: string }) => dig(x.codigo) === codigo) : null;
      if (!item) return jsonResponse({ sucesso: false, erro: "NCM não encontrado." }, 404);
      return jsonResponse({ sucesso: true, dados: { codigo, descricao: item.descricao_completa ?? item.descricao ?? null } });
    }

    // ============================ Sincronizar municípios ============================
    const limit = 100;
    let offset = 0;
    let total = Infinity;
    let gravados = 0;
    while (offset < total) {
      const r = await fetch(`${base}/municipios?limit=${limit}&offset=${offset}`, { headers });
      if (!r.ok) return jsonResponse({ sucesso: false, erro: `Focus respondeu ${r.status} em offset ${offset}.`, gravados }, 502);
      total = Number(r.headers.get("X-Total-Count") ?? 0) || 0;
      const lista = (await r.json().catch(() => [])) as { codigo_municipio?: string; nome_municipio?: string; sigla_uf?: string }[];
      if (!Array.isArray(lista) || lista.length === 0) break;
      const vistos = new Set<string>();
      const linhas = [];
      for (const m of lista) {
        if (!m.codigo_municipio || !m.nome_municipio || !m.sigla_uf) continue;
        const chave = `${m.nome_municipio}|${m.sigla_uf}`;
        if (vistos.has(chave)) continue;
        vistos.add(chave);
        linhas.push({ codigo_ibge: String(m.codigo_municipio), cidade: m.nome_municipio, uf: m.sigla_uf });
      }
      const { error } = await supabaseAdmin.from("municipios_ibge").upsert(linhas, { onConflict: "cidade,uf" });
      if (error) return jsonResponse({ sucesso: false, erro: `Erro ao gravar: ${error.message}`, gravados }, 500);
      gravados += linhas.length;
      offset += limit;
    }
    return jsonResponse({ sucesso: true, gravados, total_focus: Number.isFinite(total) ? total : null });
  } catch (e) {
    return jsonResponse({ sucesso: false, erro: String(e) }, 500);
  }
});
