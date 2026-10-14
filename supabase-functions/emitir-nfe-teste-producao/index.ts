// Edge Function: emitir-nfe-teste-producao (v2: exige cotacoes.eh_teste + rpc trava_teste_fiscal)
//
// NF-e REAL (produção, Focus NFe POST /v2/nfe, assíncrona) usada SÓ para o teste de ponta a ponta com R$ 1,00:
// a RBR emite uma remessa para ela mesma e o CT-e de produção cita essa chave (SEFAZ-SP rejeita CT-e com NF-e
// inexistente — rejeição 661). Cancelável pela função cancelar-documento-fiscal (prazo da NF-e: 24 h).
//
// Travas de segurança (de propósito, para esta função nunca emitir nota em nome de terceiro):
//  - ambiente fiscal da RBR em "producao" e gestor_rbr;
//  - confirmar: true na emissão;
//  - remetente E destinatário da cotação = a própria RBR (CNPJ de parametros_fiscais);
//  - valor da NF de teste até R$ 5,00.
// Body: { operacao_id, acao: "emitir" | "consultar", confirmar?: true }.
// ref Focus: rbr-nfe-prod-<cotacao_id>. Ao autorizar (consultar), grava nf_chave_acesso/numero/serie/data na cotação.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const FOCUS_PRODUCAO = "https://api.focusnfe.com.br";
const NCM_PADRAO = "49111090";
const LIMITE_VALOR = 5;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
const digitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");
// deno-lint-ignore no-explicit-any
type Linha = Record<string, any>;

// Instante atual escrito no fuso de Brasília (-03:00).
function agoraBrasilia(d = new Date()): string {
  const b = new Date(d.getTime() - 3 * 3600 * 1000);
  return b.toISOString().replace("Z", "").replace(/\.\d{3}$/, "") + "-03:00";
}

function chaveDaResposta(r: Linha | null | undefined): string | null {
  const k = digitos(r?.chave_nfe);
  return k.length === 44 ? k : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  try {
    const { operacao_id, acao, confirmar } = await req.json();
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
    if (userError || !userData?.user) return jsonResponse({ sucesso: false, erro: "Não autenticado" }, 401);

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { data: pessoaAtor } = await supabaseAdmin
      .from("pessoas")
      .select("papel")
      .eq("auth_user_id", userData.user.id)
      .maybeSingle();
    if (!pessoaAtor || pessoaAtor.papel !== "gestor_rbr") {
      return jsonResponse({ sucesso: false, erro: "Só um gestor RBR pode emitir esta NF-e de teste." }, 403);
    }

    const { data: op } = await supabaseAdmin
      .from("v_checklist_prontidao")
      .select("cotacao_id, ambiente_fiscal, parametros_fiscais_id")
      .eq("operacao_id", operacao_id)
      .maybeSingle();
    if (!op?.cotacao_id) return jsonResponse({ sucesso: false, erro: "Operação não encontrada ou sem cotação." }, 404);
    if (op.ambiente_fiscal !== "producao") {
      return jsonResponse({ sucesso: false, erro: "Esta função é só de PRODUÇÃO. Em homologação use emitir-nfe-teste." }, 422);
    }

    const ref = `rbr-nfe-prod-${op.cotacao_id}`;
    const { data: token, error: tokenError } = await supabaseAdmin.rpc("get_focus_nfe_token", { p_ambiente: "producao" });
    if (tokenError || !token) return jsonResponse({ sucesso: false, erro: "Token Focus NFe de produção não encontrado no Vault." }, 503);
    const auth = `Basic ${btoa(`${token}:`)}`;

    if (acao === "consultar") {
      const resp = await fetch(`${FOCUS_PRODUCAO}/v2/nfe/${encodeURIComponent(ref)}`, { headers: { Authorization: auth } });
      const json = await resp.json().catch(() => null);
      if (!resp.ok) {
        return jsonResponse({ sucesso: false, erro: json?.mensagem ?? `Focus NFe respondeu ${resp.status}.`, detalhe: json }, 502);
      }
      const chave = chaveDaResposta(json);
      if (json?.status === "autorizado" && chave) {
        const { error: upErr } = await supabaseAdmin
          .from("cotacoes")
          .update({
            nf_chave_acesso: chave,
            nf_numero: json.numero ?? null,
            nf_serie: json.serie ?? null,
            nf_data_emissao: new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10),
          })
          .eq("id", op.cotacao_id);
        if (upErr) {
          return jsonResponse({ sucesso: false, erro: `NF-e autorizada, mas não consegui gravar na cotação: ${upErr.message}`, chave }, 500);
        }
      }
      return jsonResponse({
        sucesso: true,
        ambiente: "producao",
        status: json?.status,
        status_sefaz: json?.status_sefaz,
        mensagem_sefaz: json?.mensagem_sefaz,
        numero: json?.numero,
        serie: json?.serie,
        chave,
        caminho_danfe: json?.caminho_danfe ? `${FOCUS_PRODUCAO}${json.caminho_danfe}` : null,
        gravada_na_cotacao: json?.status === "autorizado" && Boolean(chave),
      });
    }

    // acao === "emitir"
    if (confirmar !== true) {
      return jsonResponse({ sucesso: false, erro: "Emissão real em produção: envie confirmar: true." }, 400);
    }

    const { data: pf } = await supabaseAdmin
      .from("parametros_fiscais")
      .select("ambiente, cnpj, inscricao_estadual, razao_social, endereco_logradouro, endereco_numero, endereco_bairro, endereco_cep, endereco_codigo_municipio, endereco_uf, telefone_contato")
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
      .select("nf_chave_acesso, nf_remetente_cnpj, nf_destinatario_cnpj, nf_destinatario_razao_social, nf_destinatario_ie, valor_nf, peso_bruto_kg, nf_produto_predominante, ncms_produtos, nf_destinatario_endereco")
      .eq("id", op.cotacao_id)
      .maybeSingle();

    const bloqueios: string[] = [];
    if (pf?.ambiente !== "producao") bloqueios.push("Ambiente fiscal da RBR não está em produção.");
    if (!pf?.cnpj || !pf?.inscricao_estadual || !pf?.razao_social || !pf?.endereco_logradouro || !pf?.endereco_numero ||
      !pf?.endereco_bairro || !municipioEmitente || !pf?.endereco_uf || !pf?.endereco_cep) {
      bloqueios.push("Dados da RBR incompletos em parametros_fiscais (CNPJ, IE, razão social ou endereço).");
    }
    const cnpjRbr = digitos(pf?.cnpj);
    if (digitos(cot?.nf_remetente_cnpj) !== cnpjRbr || digitos(cot?.nf_destinatario_cnpj) !== cnpjRbr) {
      bloqueios.push("Trava de segurança: esta função só emite NF-e em que a RBR é remetente E destinatária (teste). Nunca em nome de terceiro.");
    }
    const valor = Number(cot?.valor_nf ?? 0);
    if (!(valor > 0)) bloqueios.push("Cotação sem valor da NF.");
    if (valor > LIMITE_VALOR) bloqueios.push(`Trava de segurança: valor da NF acima de R$ ${LIMITE_VALOR.toFixed(2)} não é teste.`);
    const peso = Number(cot?.peso_bruto_kg ?? 0);
    if (!(peso > 0)) bloqueios.push("Cotação sem peso bruto (kg).");
    if (cot?.nf_chave_acesso) {
      bloqueios.push("A cotação já tem NF-e gravada. Cancele a anterior (botão Cancelar) antes de emitir outra.");
    }
    const end = (cot?.nf_destinatario_endereco ?? null) as Record<string, string | null> | null;
    if (!end?.logradouro || !end?.numero || !end?.bairro || !end?.cep || !end?.municipio || !end?.uf) {
      bloqueios.push("Endereço do destinatário incompleto na aba NF-e da cotação.");
    }
    const { data: trava, error: travaErr } = await supabaseAdmin.rpc("trava_teste_fiscal", { p_operacao_id: operacao_id, p_tipo: "nfe" });
    if (travaErr) return jsonResponse({ sucesso: false, erro: `Não consegui verificar o modo teste: ${travaErr.message}` }, 500);
    if (!trava?.teste) bloqueios.push("Ligue \"Operação de teste\" na cotação antes de emitir a NF-e de teste.");
    else if (Array.isArray(trava.bloqueios)) bloqueios.push(...trava.bloqueios);
    if (bloqueios.length > 0) {
      return jsonResponse({ sucesso: false, bloqueado: true, motivos: bloqueios, erro: bloqueios.join(" ") }, 422);
    }

    const interna = pf!.endereco_uf === end!.uf;
    const ieDest = digitos(cot!.nf_destinatario_ie);
    const contribuinte = ieDest.length > 0;
    const ncmCot = Array.isArray(cot!.ncms_produtos) ? cot!.ncms_produtos[0] : null;
    const ncm = digitos(ncmCot).length === 8 ? digitos(ncmCot) : NCM_PADRAO;
    const valor2 = Number(valor.toFixed(2));
    const agora = agoraBrasilia();

    const payload: Linha = {
      natureza_operacao: "REMESSA PARA TESTE DE TRANSPORTE",
      data_emissao: agora,
      data_entrada_saida: agora,
      tipo_documento: 1,
      local_destino: interna ? 1 : 2,
      finalidade_emissao: 1,
      consumidor_final: contribuinte ? 0 : 1,
      presenca_comprador: 9,

      cnpj_emitente: cnpjRbr,
      inscricao_estadual_emitente: digitos(pf!.inscricao_estadual),
      nome_emitente: pf!.razao_social,
      logradouro_emitente: pf!.endereco_logradouro,
      numero_emitente: pf!.endereco_numero,
      bairro_emitente: pf!.endereco_bairro,
      municipio_emitente: municipioEmitente,
      uf_emitente: pf!.endereco_uf,
      cep_emitente: digitos(pf!.endereco_cep),
      regime_tributario_emitente: 1,

      nome_destinatario: cot!.nf_destinatario_razao_social || pf!.razao_social,
      cnpj_destinatario: digitos(cot!.nf_destinatario_cnpj),
      indicador_inscricao_estadual_destinatario: contribuinte ? 1 : 9,
      inscricao_estadual_destinatario: contribuinte ? ieDest : undefined,
      logradouro_destinatario: end!.logradouro,
      numero_destinatario: end!.numero,
      bairro_destinatario: end!.bairro,
      municipio_destinatario: end!.municipio,
      uf_destinatario: end!.uf,
      cep_destinatario: digitos(end!.cep),
      pais_destinatario: "Brasil",
      telefone_destinatario: digitos(end!.telefone) || undefined,

      valor_frete: 0,
      valor_seguro: 0,
      valor_desconto: 0,
      valor_outras_despesas: 0,
      valor_produtos: valor2,
      valor_total: valor2,
      modalidade_frete: 0,
      volumes: [{ quantidade: 1, especie: "VOLUME", peso_bruto: peso, peso_liquido: peso }],

      items: [{
        numero_item: 1,
        codigo_produto: "TESTE-PROD",
        descricao: String(cot!.nf_produto_predominante || "MERCADORIA PARA TESTE DE TRANSPORTE").slice(0, 120),
        cfop: interna ? "5949" : "6949",
        codigo_ncm: ncm,
        unidade_comercial: "UN",
        quantidade_comercial: 1,
        valor_unitario_comercial: valor2,
        unidade_tributavel: "UN",
        quantidade_tributavel: 1,
        valor_unitario_tributavel: valor2,
        valor_bruto: valor2,
        inclui_no_total: 1,
        icms_origem: 0,
        icms_situacao_tributaria: "400",
        pis_situacao_tributaria: "49",
        cofins_situacao_tributaria: "49",
      }],
    };

    const resp = await fetch(`${FOCUS_PRODUCAO}/v2/nfe?ref=${encodeURIComponent(ref)}`, {
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
      ambiente: "producao",
      status: json?.status ?? "processando_autorizacao",
      referencia: ref,
      aviso: "NF-e REAL em produção (R$ " + valor2.toFixed(2) + "). Use acao \"consultar\" para ver se foi autorizada; a chave é gravada na cotação. Cancele após o teste (prazo 24 h).",
    });
  } catch (e) {
    return jsonResponse({ sucesso: false, erro: String(e) }, 500);
  }
});
