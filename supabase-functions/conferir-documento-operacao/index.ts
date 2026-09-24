// Edge Function: conferir-documento-operacao
//
// O operador sobe o PDF/XML de um documento da operação (CT-e, MDF-e, CIOT, vale-pedágio,
// pesquisa GR, averbação, rastreamento, AET, NFS-e) no bucket `operacao-documentos`.
// Esta função lê o arquivo com o Gemini (mesma chave/plano já usados na leitura de CNH/CRLV),
// extrai os dados principais e CONFERE contra o que a operação diz: placa, CPF do motorista,
// CNPJs, chave da NF-e, valores. Grava o resultado em documentacao_operacao.
//
// A IA só confere — quem decide é o operador: se algo vier "divergente" ele pode corrigir e
// subir de novo, ou aceitar manualmente com um motivo (regra do projeto: toda automação tem
// saída manual). A liberação da carga continua sendo um clique do gestor.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding/base64";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const NOME_TIPO: Record<string, string> = {
  cte: "CT-e (Conhecimento de Transporte Eletrônico)",
  mdfe: "MDF-e (Manifesto Eletrônico de Documentos Fiscais)",
  nfse: "NFS-e de transporte municipal",
  ciot: "CIOT (Código Identificador da Operação de Transporte) / contrato de frete",
  vpo: "comprovante de Vale-Pedágio Obrigatório (VPO)",
  gr: "resultado de pesquisa de gerenciamento de risco (GR) do motorista/veículo",
  atm: "averbação do seguro de carga (RCTR-C)",
  wialon: "comprovante de rastreamento/monitoramento por satélite do veículo",
  aet: "AET — Autorização Especial de Trânsito (DNIT/SIAET)",
};

const SCHEMA = {
  type: "object",
  properties: {
    tipo_documento_detectado: { type: "string", nullable: true },
    numero_documento: { type: "string", nullable: true },
    chave_acesso: { type: "string", nullable: true },
    data_emissao: { type: "string", nullable: true },
    data_validade: { type: "string", nullable: true },
    placas: { type: "array", items: { type: "string" } },
    cpfs: { type: "array", items: { type: "string" } },
    cnpjs: { type: "array", items: { type: "string" } },
    chaves_nfe: { type: "array", items: { type: "string" } },
    valor_principal: { type: "number", nullable: true },
    valor_carga: { type: "number", nullable: true },
    municipio_origem: { type: "string", nullable: true },
    uf_origem: { type: "string", nullable: true },
    municipio_destino: { type: "string", nullable: true },
    uf_destino: { type: "string", nullable: true },
    resultado_aprovado: { type: "boolean", nullable: true },
    observacoes: { type: "string", nullable: true },
  },
  required: ["tipo_documento_detectado", "numero_documento", "placas", "cpfs", "cnpjs", "chaves_nfe", "valor_principal"],
};

function prompt(tipo: string): string {
  return `Você está lendo um documento de transporte rodoviário de carga brasileiro. O operador diz que é: ${NOME_TIPO[tipo] ?? tipo}.
Extraia os campos do schema. Regras:
- Nunca invente valor: se não existir ou não estiver legível, devolva null (ou lista vazia).
- tipo_documento_detectado: o que o documento realmente é (ex.: "CT-e", "MDF-e", "CIOT", "Vale-pedágio", "Pesquisa GR", "Averbação", "Rastreamento", "AET", "NFS-e", ou "outro").
- numero_documento: o número principal do documento (nº do CT-e/MDF-e, nº do CIOT, nº/ID do vale-pedágio (IDVPO), nº da averbação, nº do protocolo/liberação da GR, nº da AET).
- chave_acesso: chave de 44 dígitos se houver (só dígitos).
- placas: todas as placas de veículo que aparecem (cavalo e carretas), sem hífen.
- cpfs e cnpjs: todos que aparecem, só dígitos.
- chaves_nfe: chaves de 44 dígitos de NF-e referenciadas.
- valor_principal: o valor central do documento — valor total da prestação (CT-e/NFS-e), valor do frete contratado (CIOT), valor do vale-pedágio (VPO), valor averbado (averbação). Número, sem R$.
- valor_carga: valor da mercadoria/carga, se aparecer.
- datas no formato AAAA-MM-DD.
- resultado_aprovado: só para pesquisa GR/liberação de risco — true se aprovado/liberado/apto, false se reprovado/pendente.`;
}

const digitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const placaNorm = (s: unknown) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

interface Check {
  item: string;
  esperado: string;
  encontrado: string;
  ok: boolean;
  critico: boolean;
}

function perto(a: number | null | undefined, b: number | null | undefined, tolerancia = 0.01): boolean {
  if (a == null || b == null) return false;
  if (b === 0) return Math.abs(a) < 0.01;
  return Math.abs(a - b) / Math.abs(b) <= tolerancia;
}

function fmt(n: number | null | undefined) {
  return n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);
  let documentoId: string | null = null;

  try {
    const body = await req.json();
    documentoId = body?.documento_id ?? null;
    if (!documentoId || typeof documentoId !== "string") return json({ sucesso: false, erro: "Informe documento_id." }, 400);

    const asUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: userData, error: userError } = await asUser.auth.getUser();
    if (userError || !userData?.user) return json({ sucesso: false, erro: "Não autenticado" }, 401);
    const { data: ator } = await admin.from("pessoas").select("id, papel").eq("auth_user_id", userData.user.id).maybeSingle();
    if (!ator || ator.papel !== "gestor_rbr") return json({ sucesso: false, erro: "Só um gestor RBR pode conferir documentos." }, 403);

    const { data: doc } = await admin.from("documentacao_operacao").select("*").eq("id", documentoId).maybeSingle();
    if (!doc) return json({ sucesso: false, erro: "Documento não encontrado." }, 404);
    if (!doc.arquivo_path) return json({ sucesso: false, erro: "Suba o arquivo do documento antes de conferir." }, 400);

    await admin.from("documentacao_operacao").update({ conferencia_status: "conferindo", atualizado_em: new Date().toISOString() }).eq("id", doc.id);

    // Dados esperados da operação
    const { data: op } = await admin.from("operacoes").select("*").eq("id", doc.operacao_id).single();
    const { data: cot } = op.cotacao_id
      ? await admin.from("cotacoes").select("*").eq("id", op.cotacao_id).maybeSingle()
      : { data: null };
    const { data: veiculo } = op.veiculo_id
      ? await admin.from("veiculos").select("id, placa, titular_id").eq("id", op.veiculo_id).maybeSingle()
      : { data: null };
    const { data: reboques } = await admin
      .from("operacao_reboques")
      .select("veiculos(placa)")
      .eq("operacao_id", op.id);
    const { data: motorista } = op.pessoa_alocada_id
      ? await admin.from("pessoas").select("id, nome, cpf, titular_id").eq("id", op.pessoa_alocada_id).maybeSingle()
      : { data: null };
    const titularId = veiculo?.titular_id ?? motorista?.titular_id ?? motorista?.id ?? null;
    const { data: titular } = titularId
      ? await admin.from("pessoas").select("id, nome, cpf, cnpj").eq("id", titularId).maybeSingle()
      : { data: null };
    const { data: condicao } = await admin
      .from("condicoes_pagamento_operacao")
      .select("valor_total_contrato")
      .eq("operacao_id", op.id)
      .maybeSingle();
    const { data: empresa } = await admin.from("parametros_sistema").select("valor").eq("chave", "dados_empresa").maybeSingle();
    const cnpjRbr = digitos((empresa?.valor as Record<string, unknown> | null)?.cnpj);

    // Arquivo
    const { data: blob, error: dlErr } = await admin.storage.from("operacao-documentos").download(doc.arquivo_path);
    if (dlErr || !blob) throw new Error(`Não achei o arquivo: ${dlErr?.message ?? "desconhecido"}`);
    const nome = String(doc.arquivo_nome ?? doc.arquivo_path).toLowerCase();
    const ehXml = nome.endsWith(".xml") || blob.type.includes("xml");
    const parts: Record<string, unknown>[] = [{ text: prompt(doc.tipo) }];
    if (ehXml) {
      parts.push({ text: `Conteúdo do XML:\n${(await blob.text()).slice(0, 200000)}` });
    } else {
      const mime = blob.type && blob.type !== "" ? blob.type : nome.endsWith(".pdf") ? "application/pdf" : "image/jpeg";
      parts.push({ inline_data: { mime_type: mime, data: encodeBase64(new Uint8Array(await blob.arrayBuffer())) } });
    }

    const { data: geminiKey, error: keyErr } = await admin.rpc("get_gemini_api_key");
    if (keyErr || !geminiKey) throw new Error("Gemini não configurado (chave não encontrada no Vault).");
    const model = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";
    const gResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA },
        }),
      },
    );
    if (!gResp.ok) throw new Error(`Gemini respondeu ${gResp.status}: ${(await gResp.text()).slice(0, 300)}`);
    const gJson = await gResp.json();
    const texto = gJson?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!texto) throw new Error("A IA não devolveu conteúdo legível.");
    const ext = JSON.parse(texto) as Record<string, any>;

    const placasDoc = new Set<string>((ext.placas ?? []).map(placaNorm));
    const cpfsDoc = new Set<string>((ext.cpfs ?? []).map(digitos));
    const cnpjsDoc = new Set<string>((ext.cnpjs ?? []).map(digitos));
    const chavesDoc = new Set<string>((ext.chaves_nfe ?? []).map(digitos));
    const checks: Check[] = [];
    const add = (item: string, esperado: string, encontrado: string, ok: boolean, critico = true) =>
      checks.push({ item, esperado, encontrado, ok, critico });

    const placaTracao = placaNorm(veiculo?.placa);
    const placasReboques = (reboques ?? []).map((r: any) => placaNorm(r.veiculos?.placa)).filter(Boolean);
    const cpfMotorista = digitos(motorista?.cpf);
    const docTitular = digitos(titular?.cnpj || titular?.cpf);
    const chaveNf = digitos(cot?.nf_chave_acesso);
    const remet = digitos(cot?.nf_remetente_cnpj);
    const dest = digitos(cot?.nf_destinatario_cnpj);
    const lista = (s: Set<string>) => (s.size ? Array.from(s).join(", ") : "nada encontrado");

    const checaPlaca = (critico = true) => {
      if (!placaTracao) return add("Placa do veículo", "veículo não alocado", lista(placasDoc), false, critico);
      add("Placa do cavalo/veículo", placaTracao, lista(placasDoc), placasDoc.has(placaTracao), critico);
      for (const p of placasReboques) add("Placa da carreta", p, lista(placasDoc), placasDoc.has(p), critico);
    };
    const checaCpfMotorista = () =>
      add("CPF do motorista", cpfMotorista || "motorista sem CPF", lista(cpfsDoc), !!cpfMotorista && cpfsDoc.has(cpfMotorista));

    const t = doc.tipo as string;
    if (t === "cte" || t === "nfse") {
      if (cnpjRbr) add("CNPJ da RBR (emitente)", cnpjRbr, lista(cnpjsDoc), cnpjsDoc.has(cnpjRbr));
      if (remet) add("CNPJ do remetente", remet, lista(cnpjsDoc), cnpjsDoc.has(remet));
      if (dest) add("CNPJ/CPF do destinatário", dest, lista(new Set([...cnpjsDoc, ...cpfsDoc])), cnpjsDoc.has(dest) || cpfsDoc.has(dest));
      if (chaveNf && t === "cte") add("Chave da NF-e", chaveNf, lista(chavesDoc), chavesDoc.has(chaveNf));
      add("Valor do frete", fmt(cot?.valor_total), fmt(ext.valor_principal), perto(ext.valor_principal, cot?.valor_total, 0.005));
    } else if (t === "mdfe") {
      if (cnpjRbr) add("CNPJ da RBR (emitente)", cnpjRbr, lista(cnpjsDoc), cnpjsDoc.has(cnpjRbr));
      checaPlaca();
      checaCpfMotorista();
      if (cot?.valor_nf) add("Valor da carga", fmt(cot.valor_nf), fmt(ext.valor_carga), perto(ext.valor_carga, cot.valor_nf, 0.01), false);
    } else if (t === "ciot") {
      checaPlaca();
      add("CPF/CNPJ do transportador contratado", docTitular || "titular sem documento", lista(new Set([...cpfsDoc, ...cnpjsDoc])), !!docTitular && (cpfsDoc.has(docTitular) || cnpjsDoc.has(docTitular)));
      add("Valor do frete contratado", fmt(condicao?.valor_total_contrato), fmt(ext.valor_principal), perto(ext.valor_principal, condicao?.valor_total_contrato, 0.005));
    } else if (t === "vpo") {
      checaPlaca();
      add("Valor do vale-pedágio", fmt(cot?.pedagio), fmt(ext.valor_principal), perto(ext.valor_principal, cot?.pedagio, 0.05), false);
    } else if (t === "gr") {
      checaCpfMotorista();
      checaPlaca(false);
      add("Resultado da pesquisa", "aprovado", ext.resultado_aprovado == null ? "não identificado" : ext.resultado_aprovado ? "aprovado" : "NÃO aprovado", ext.resultado_aprovado === true);
    } else if (t === "atm") {
      if (cot?.valor_nf) add("Valor averbado", fmt(cot.valor_nf), fmt(ext.valor_principal ?? ext.valor_carga), perto(ext.valor_principal ?? ext.valor_carga, cot.valor_nf, 0.01));
      add("Número da averbação", "presente", ext.numero_documento ?? "não encontrado", !!ext.numero_documento);
    } else if (t === "wialon") {
      checaPlaca();
    } else if (t === "aet") {
      checaPlaca();
      const hoje = new Date().toISOString().slice(0, 10);
      add("Validade da AET", `a partir de ${hoje}`, ext.data_validade ?? "não encontrada", !!ext.data_validade && ext.data_validade >= hoje);
    }
    add("Número do documento", "presente", ext.numero_documento ?? "não encontrado", !!ext.numero_documento, false);

    const falhasCriticas = checks.filter((c) => !c.ok && c.critico);
    const status = falhasCriticas.length === 0 ? "ok" : "divergente";
    const resultado = { extraido: ext, checks, conferido_por_ia: model };

    await admin
      .from("documentacao_operacao")
      .update({
        conferencia_status: status,
        conferencia_resultado: resultado,
        conferido_em: new Date().toISOString(),
        conferido_por: ator.id,
        numero_documento: doc.numero_documento ?? ext.numero_documento ?? null,
        chave_acesso: doc.chave_acesso ?? (digitos(ext.chave_acesso).length === 44 ? digitos(ext.chave_acesso) : null),
        emitido_em: doc.emitido_em ?? (ext.data_emissao ? `${ext.data_emissao}T12:00:00Z` : null),
        status: "emitido",
        atualizado_em: new Date().toISOString(),
      })
      .eq("id", doc.id);

    // Números que outros documentos/telas usam
    if (t === "ciot" && ext.numero_documento) {
      await admin
        .from("ciot_registros")
        .upsert({ operacao_id: op.id, numero_ciot: ext.numero_documento, emitido_em: new Date().toISOString(), status: "emitido" }, { onConflict: "operacao_id" })
        .then(() => null, () => null);
    }

    return json({ sucesso: true, status, checks, extraido: ext });
  } catch (e) {
    if (documentoId) {
      await admin
        .from("documentacao_operacao")
        .update({
          conferencia_status: "erro",
          conferencia_resultado: { erro: String(e instanceof Error ? e.message : e) },
          atualizado_em: new Date().toISOString(),
        })
        .eq("id", documentoId);
    }
    return json({ sucesso: false, erro: String(e instanceof Error ? e.message : e) }, 500);
  }
});
