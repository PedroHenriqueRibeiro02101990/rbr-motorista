// Edge Function: emitir-cte-teste-producao (v1)
//
// CT-e REAL de R$ 1,00 em PRODUÇÃO para validar o caminho Focus -> SEFAZ-SP com a IE da RBR, e cancelamento logo em seguida.
// É um documento fiscal verdadeiro: só roda com parametros_fiscais.ambiente = "producao", só gestor RBR, e emitir/cancelar
// exigem confirmar: true. Não usa operação nem cotação: remetente, destinatário e tomador = a própria RBR (tomador 0),
// documento originário tipo "outros" (99, TESTE), SP -> Campinas, frete R$ 1,00, Simples Nacional.
//
// Body: { acao: "emitir" | "consultar" | "cancelar", tentativa?: number (default 1), confirmar?: true }
// ref Focus = rbr-cte-teste-prod-<tentativa> (ref autorizada fica presa: para nova emissão use tentativa 2, 3...).
// O resultado NÃO é gravado no banco (não é CT-e de operação). Consulte pelo "consultar" e cancele pelo "cancelar".

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const FOCUS_PRODUCAO = "https://api.focusnfe.com.br";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
const digitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  try {
    const { acao, tentativa, confirmar } = await req.json();
    if (acao !== "emitir" && acao !== "consultar" && acao !== "cancelar") {
      return jsonResponse({ sucesso: false, erro: 'Informe acao: "emitir", "consultar" ou "cancelar".' }, 400);
    }
    const n = Number.isInteger(tentativa) && tentativa > 0 ? tentativa : 1;
    const ref = `rbr-cte-teste-prod-${n}`;
    if ((acao === "emitir" || acao === "cancelar") && confirmar !== true) {
      return jsonResponse({ sucesso: false, erro: "Documento fiscal REAL em produção: envie confirmar: true." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabaseAsUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: userData, error: userError } = await supabaseAsUser.auth.getUser();
    if (userError || !userData?.user) return jsonResponse({ sucesso: false, erro: "Não autenticado" }, 401);

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { data: pessoaAtor } = await supabaseAdmin
      .from("pessoas").select("papel").eq("auth_user_id", userData.user.id).maybeSingle();
    if (!pessoaAtor || pessoaAtor.papel !== "gestor_rbr") {
      return jsonResponse({ sucesso: false, erro: "Só um gestor RBR pode usar o teste de produção." }, 403);
    }

    const { data: pf } = await supabaseAdmin
      .from("parametros_fiscais")
      .select("ambiente, cnpj, inscricao_estadual, razao_social, endereco_logradouro, endereco_numero, endereco_complemento, endereco_bairro, endereco_cep, endereco_codigo_municipio, endereco_uf, responsavel_tecnico_cnpj, responsavel_tecnico_contato, responsavel_tecnico_email, responsavel_tecnico_telefone, rntrc, telefone_contato")
      .eq("ativo", true)
      .maybeSingle();
    if (!pf || pf.ambiente !== "producao") {
      return jsonResponse({ sucesso: false, erro: "Esta função só roda com o ambiente fiscal em PRODUÇÃO (parametros_fiscais)." }, 422);
    }

    const { data: token, error: tokenError } = await supabaseAdmin.rpc("get_focus_nfe_token", { p_ambiente: "producao" });
    if (tokenError || !token) return jsonResponse({ sucesso: false, erro: "Token Focus de produção não encontrado no Vault." }, 503);
    const auth = `Basic ${btoa(`${token}:`)}`;

    // ---- consultar ----
    if (acao === "consultar") {
      const r = await fetch(`${FOCUS_PRODUCAO}/v2/cte/${encodeURIComponent(ref)}?completo=1`, { headers: { Authorization: auth } });
      const j = await r.json().catch(() => null);
      if (!r.ok) return jsonResponse({ sucesso: false, erro: j?.mensagem ?? `Focus respondeu ${r.status}.`, detalhe: j }, 502);
      return jsonResponse({
        sucesso: true, referencia: ref, status: j?.status, status_sefaz: j?.status_sefaz, mensagem_sefaz: j?.mensagem_sefaz,
        chave: j?.chave_cte ?? j?.chave, numero: j?.numero, serie: j?.serie, protocolo: j?.protocolo,
        xml: j?.caminho_xml_nota_fiscal ?? j?.caminho_xml, dacte: j?.caminho_dacte, erros: j?.erros,
      });
    }

    // ---- cancelar ----
    if (acao === "cancelar") {
      const r = await fetch(`${FOCUS_PRODUCAO}/v2/cte/${encodeURIComponent(ref)}`, {
        method: "DELETE",
        headers: { Authorization: auth, "Content-Type": "application/json" },
        body: JSON.stringify({ justificativa: "Cancelamento de CT-e de teste de emissao em producao (sem prestacao de servico)" }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) return jsonResponse({ sucesso: false, erro: j?.mensagem ?? `Focus respondeu ${r.status}.`, detalhe: j }, 502);
      if (j?.status !== "cancelado") {
        return jsonResponse({ sucesso: false, erro: `A SEFAZ não aceitou o cancelamento: ${j?.mensagem_sefaz ?? "sem mensagem"} (${j?.status_sefaz ?? "?"}).`, detalhe: j }, 422);
      }
      return jsonResponse({ sucesso: true, status: "cancelado", referencia: ref, mensagem_sefaz: j?.mensagem_sefaz, xml_cancelamento: j?.caminho_xml ?? null });
    }

    // ---- emitir ----
    let municipioEmitente: string | null = null;
    if (pf.endereco_codigo_municipio) {
      const { data: m } = await supabaseAdmin
        .from("municipios_ibge").select("cidade").eq("codigo_ibge", pf.endereco_codigo_municipio).maybeSingle();
      municipioEmitente = m?.cidade ?? null;
    }
    const faltas: string[] = [];
    if (!pf.cnpj || !pf.inscricao_estadual || !pf.razao_social) faltas.push("CNPJ/IE/razão social");
    if (!pf.endereco_logradouro || !pf.endereco_numero || !pf.endereco_bairro || !pf.endereco_cep || !pf.endereco_codigo_municipio || !pf.endereco_uf || !municipioEmitente) faltas.push("endereço do emitente");
    if (!pf.rntrc) faltas.push("RNTRC");
    if (!pf.responsavel_tecnico_cnpj || !pf.responsavel_tecnico_email) faltas.push("responsável técnico");
    const tel = digitos(pf.telefone_contato) || digitos(pf.responsavel_tecnico_telefone);
    if (tel.length < 6) faltas.push("telefone de contato");
    if (faltas.length) return jsonResponse({ sucesso: false, bloqueado: true, erro: `Dados incompletos em parametros_fiscais: ${faltas.join(", ")}.` }, 422);

    const agora = new Date();
    const brt = new Date(agora.getTime() - 3 * 3600 * 1000).toISOString();
    const dataEmissao = `${brt.slice(0, 19)}-03:00`;
    const rn = digitos(pf.rntrc);
    const rntrc = rn.length === 9 && rn.startsWith("0") ? rn.slice(1) : rn;

    const endereco = {
      logradouro: pf.endereco_logradouro, numero: pf.endereco_numero, complemento: pf.endereco_complemento || undefined,
      bairro: pf.endereco_bairro, codigo_municipio: pf.endereco_codigo_municipio, municipio: municipioEmitente,
      cep: digitos(pf.endereco_cep), uf: pf.endereco_uf,
    };

    const payload: Record<string, unknown> = {
      natureza_operacao: "Prestação de serviço de transporte",
      data_emissao: dataEmissao,
      tipo_documento: "0",
      tipo_servico: "0",
      modal: "01",
      modal_rodoviario: { rntrc },
      cfop: "5353",
      municipio_envio: municipioEmitente, uf_envio: pf.endereco_uf, codigo_municipio_envio: pf.endereco_codigo_municipio,
      municipio_inicio: "SAO PAULO", uf_inicio: "SP", codigo_municipio_inicio: "3550308",
      municipio_fim: "CAMPINAS", uf_fim: "SP", codigo_municipio_fim: "3509502",
      retirar_mercadoria: "1",
      detalhes_retirar: "Entrega no endereço do destinatário — sem retirada em filial/porto/aeroporto.",
      tomador: "0",
      indicador_inscricao_estadual_tomador: "1",

      cnpj_emitente: digitos(pf.cnpj), inscricao_estadual_emitente: digitos(pf.inscricao_estadual), nome_emitente: pf.razao_social,
      logradouro_emitente: endereco.logradouro, numero_emitente: endereco.numero, complemento_emitente: endereco.complemento,
      bairro_emitente: endereco.bairro, cep_emitente: endereco.cep, municipio_emitente: endereco.municipio,
      codigo_municipio_emitente: endereco.codigo_municipio, uf_emitente: endereco.uf,

      cnpj_remetente: digitos(pf.cnpj), inscricao_estadual_remetente: digitos(pf.inscricao_estadual), nome_remetente: pf.razao_social,
      telefone_remetente: tel, logradouro_remetente: endereco.logradouro, numero_remetente: endereco.numero,
      complemento_remetente: endereco.complemento, bairro_remetente: endereco.bairro, codigo_municipio_remetente: endereco.codigo_municipio,
      municipio_remetente: endereco.municipio, cep_remetente: endereco.cep, uf_remetente: endereco.uf,
      codigo_pais_remetente: "1058", pais_remetente: "Brasil",

      cnpj_destinatario: digitos(pf.cnpj), inscricao_estadual_destinatario: digitos(pf.inscricao_estadual), nome_destinatario: pf.razao_social,
      telefone_destinatario: tel, logradouro_destinatario: endereco.logradouro, numero_destinatario: endereco.numero,
      complemento_destinatario: endereco.complemento, bairro_destinatario: endereco.bairro, codigo_municipio_destinatario: endereco.codigo_municipio,
      municipio_destinatario: endereco.municipio, cep_destinatario: endereco.cep, uf_destinatario: endereco.uf,
      codigo_pais_destinatario: "1058", pais_destinatario: "Brasil",

      valor_total: 1, valor_receber: 1,
      componentes_valor: [{ nome: "Frete", valor: 1 }],
      valor_total_carga: 1,
      produto_predominante: "TESTE",
      quantidades: [{ codigo_unidade_medida: "01", tipo_medida: "PESO BRUTO", quantidade: 1 }],
      outros_documentos: [{
        tipo_documento: "99", descricao_documento: "TESTE", numero: "1",
        data_emissao: dataEmissao.slice(0, 10), valor: 1,
      }],

      icms_situacao_tributaria: "90_simples_nacional",
      icms_indicador_simples_nacional: "1",
      observacao: "TESTE de emissao em producao - sera cancelado - sem prestacao de servico.",
      observacoes_contribuinte: [{ campo: "Regime Tributário", conteudo: "Documento emitido por ME ou EPP optante pelo SIMPLES Nacional" }],

      cnpj_responsavel_tecnico: digitos(pf.responsavel_tecnico_cnpj),
      contato_responsavel_tecnico: pf.responsavel_tecnico_contato || "RBR Cargo",
      email_responsavel_tecnico: pf.responsavel_tecnico_email,
      telefone_responsavel_tecnico: digitos(pf.responsavel_tecnico_telefone) || undefined,
    };

    const r = await fetch(`${FOCUS_PRODUCAO}/v2/cte?ref=${encodeURIComponent(ref)}`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => null);
    if (r.status !== 202 && !r.ok) {
      return jsonResponse({
        sucesso: false,
        erro: j?.mensagem ? `Focus recusou: ${j.mensagem}${j.codigo ? ` (${j.codigo})` : ""}` : `Focus respondeu ${r.status}.`,
        detalhe: j,
      }, 502);
    }
    return jsonResponse({
      sucesso: true, status: "processando_autorizacao", referencia: ref,
      aviso: "CT-e REAL de teste (R$ 1,00) enviado à SEFAZ em PRODUÇÃO. Use acao \"consultar\"; se autorizar, cancele com acao \"cancelar\".",
    });
  } catch (e) {
    return jsonResponse({ sucesso: false, erro: String(e) }, 500);
  }
});
