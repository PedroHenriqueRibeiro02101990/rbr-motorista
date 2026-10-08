// Edge Function: emitir-nfe-teste (v2)
//
// SÓ HOMOLOGAÇÃO. A RBR emite uma NF-e de teste (Focus NFe POST /v2/nfe, assíncrona) com os dados da cotação da
// operação e, quando autorizada, grava a chave na cotação (nf_chave_acesso/nf_numero/nf_serie/nf_data_emissao).
// Assim o CT-e de homologação cita uma NF-e que existe na base da SEFAZ (SP confere — rejeição 661).
//
// v2: destinatário contribuinte de ICMS — se a cotação tem nf_destinatario_ie, a NF-e vai com indIEDest 1 + IE
// (sem IE continua como não contribuinte, indIEDest 9).
//
// Body: { operacao_id, acao: "emitir" | "consultar" }. Regras e payload em nfe.ts (testado em nfe.test.ts).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { chaveDaResposta, montarNfeTeste } from "./nfe.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Fixo de propósito: esta função nunca fala com a Focus de produção.
const FOCUS_HOMOLOGACAO = "https://homologacao.focusnfe.com.br";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function enderecoCompleto(e: Record<string, unknown> | null | undefined): boolean {
  return Boolean(e?.logradouro && e?.numero && e?.bairro && e?.cep && e?.municipio && e?.uf);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const { operacao_id, acao } = await req.json();
    if (!operacao_id || typeof operacao_id !== "string" || (acao !== "emitir" && acao !== "consultar")) {
      return jsonResponse({ sucesso: false, erro: 'Informe operacao_id e acao ("emitir" ou "consultar").' }, 400);
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
      .select("papel")
      .eq("auth_user_id", userData.user.id)
      .maybeSingle();
    if (!pessoaAtor || pessoaAtor.papel !== "gestor_rbr") {
      return jsonResponse({ sucesso: false, erro: "Só um gestor RBR pode emitir a NF-e de teste." }, 403);
    }

    const { data: op } = await supabaseAdmin
      .from("v_checklist_prontidao")
      .select("*")
      .eq("operacao_id", operacao_id)
      .maybeSingle();
    if (!op?.cotacao_id) {
      return jsonResponse({ sucesso: false, erro: "Operação não encontrada ou sem cotação." }, 404);
    }
    if (op.ambiente_fiscal !== "homologacao") {
      return jsonResponse({ sucesso: false, erro: "NF-e de teste só existe com o ambiente fiscal em homologação." }, 422);
    }

    const ref = `rbr-nfe-teste-${op.cotacao_id}`;
    const { data: token, error: tokenError } = await supabaseAdmin.rpc("get_focus_nfe_token", {
      p_ambiente: "homologacao",
    });
    if (tokenError || !token) {
      return jsonResponse({ sucesso: false, erro: "Token Focus NFe de homologação não encontrado no Vault." }, 503);
    }
    const auth = `Basic ${btoa(`${token}:`)}`;

    if (acao === "consultar") {
      const resp = await fetch(`${FOCUS_HOMOLOGACAO}/v2/nfe/${encodeURIComponent(ref)}`, {
        headers: { Authorization: auth },
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok) {
        return jsonResponse({ sucesso: false, erro: json?.mensagem ?? `Focus NFe respondeu ${resp.status}.`, detalhe: json }, 502);
      }
      const chave = chaveDaResposta(json);
      if (json?.status === "autorizado" && chave) {
        // Grava a NF-e autorizada na cotação: é ela que o CT-e vai citar.
        const { error: upErr } = await supabaseAdmin
          .from("cotacoes")
          .update({
            nf_chave_acesso: chave,
            nf_numero: json.numero ?? null,
            nf_serie: json.serie ?? null,
            nf_data_emissao: new Date().toISOString().slice(0, 10),
          })
          .eq("id", op.cotacao_id);
        if (upErr) {
          return jsonResponse({ sucesso: false, erro: `NF-e autorizada, mas não consegui gravar na cotação: ${upErr.message}`, chave }, 500);
        }
      }
      return jsonResponse({
        sucesso: true,
        status: json?.status,
        status_sefaz: json?.status_sefaz,
        mensagem_sefaz: json?.mensagem_sefaz,
        chave,
        gravada_na_cotacao: json?.status === "autorizado" && Boolean(chave),
      });
    }

    // acao === "emitir"
    const { data: pf } = await supabaseAdmin
      .from("parametros_fiscais")
      .select("ambiente, cnpj, inscricao_estadual, razao_social, endereco_logradouro, endereco_numero, endereco_bairro, endereco_cep, endereco_codigo_municipio, endereco_uf")
      .eq("id", op.parametros_fiscais_id)
      .maybeSingle();
    let municipioEmitente: string | null = null;
    if (pf?.endereco_codigo_municipio) {
      const { data: m } = await supabaseAdmin
        .from("municipios_ibge")
        .select("cidade")
        .eq("codigo_ibge", pf.endereco_codigo_municipio)
        .maybeSingle();
      municipioEmitente = m?.cidade ?? null;
    }
    const { data: cot } = await supabaseAdmin
      .from("cotacoes")
      .select("nf_remetente_cnpj, nf_destinatario_cnpj, nf_destinatario_ie, valor_nf, peso_bruto_kg, nf_produto_predominante, tipo_carga, ncms_produtos, nf_destinatario_endereco")
      .eq("id", op.cotacao_id)
      .maybeSingle();

    // Destinatário: endereço da aba NF-e da cotação; sem ele, o cadastro do cliente (como no CT-e).
    const endNf = (cot?.nf_destinatario_endereco ?? null) as Record<string, string | null> | null;
    const destinatario = enderecoCompleto(endNf)
      ? {
        logradouro: endNf!.logradouro, numero: endNf!.numero, bairro: endNf!.bairro, municipio: endNf!.municipio,
        uf: endNf!.uf, cep: endNf!.cep, telefone: endNf!.telefone ?? op.destinatario_telefone ?? null,
      }
      : {
        logradouro: op.destinatario_logradouro, numero: op.destinatario_numero, bairro: op.destinatario_bairro,
        municipio: op.destinatario_cidade, uf: op.destinatario_uf, cep: op.destinatario_cep,
        telefone: op.destinatario_telefone,
      };

    const { bloqueios, payload } = montarNfeTeste({
      ambiente: pf?.ambiente ?? null,
      emitente: {
        cnpj: pf?.cnpj ?? null,
        ie: pf?.inscricao_estadual ?? null,
        razao_social: pf?.razao_social ?? null,
        logradouro: pf?.endereco_logradouro ?? null,
        numero: pf?.endereco_numero ?? null,
        bairro: pf?.endereco_bairro ?? null,
        municipio: municipioEmitente,
        uf: pf?.endereco_uf ?? null,
        cep: pf?.endereco_cep ?? null,
      },
      cotacao: {
        nf_remetente_cnpj: cot?.nf_remetente_cnpj ?? null,
        nf_destinatario_cnpj: cot?.nf_destinatario_cnpj ?? null,
        nf_destinatario_ie: cot?.nf_destinatario_ie ?? null,
        valor_nf: cot?.valor_nf != null ? Number(cot.valor_nf) : null,
        peso_bruto_kg: cot?.peso_bruto_kg != null ? Number(cot.peso_bruto_kg) : null,
        produto: cot?.nf_produto_predominante || cot?.tipo_carga || null,
        ncm: Array.isArray(cot?.ncms_produtos) ? cot!.ncms_produtos[0] ?? null : null,
      },
      destinatario,
      agora: new Date(),
    });
    if (bloqueios.length > 0) {
      return jsonResponse({ sucesso: false, bloqueado: true, motivos: bloqueios, erro: bloqueios.join(" ") }, 422);
    }

    const resp = await fetch(`${FOCUS_HOMOLOGACAO}/v2/nfe?ref=${encodeURIComponent(ref)}`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await resp.json().catch(() => null);
    if (resp.status !== 202 && !resp.ok) {
      return jsonResponse({
        sucesso: false,
        erro: json?.mensagem ? `Focus NFe recusou: ${json.mensagem}${json.codigo ? ` (código ${json.codigo})` : ""}` : `Focus NFe respondeu ${resp.status}.`,
        detalhe: json,
      }, 502);
    }
    return jsonResponse({
      sucesso: true,
      status: json?.status ?? "processando_autorizacao",
      referencia: ref,
      aviso: "NF-e de teste em homologação (sem validade fiscal). Use \"Consultar NF-e de teste\" para ver se foi autorizada — a chave é gravada na cotação automaticamente.",
    });
  } catch (e) {
    return jsonResponse({ sucesso: false, erro: String(e) }, 500);
  }
});
