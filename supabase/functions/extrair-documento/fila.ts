// Fila de leitura por IA gratuita (FreeLLM no PC do Pedro, pelo Agente RBR) - 25/11/2026.
// extrair-documento NAO chama mais o Gemini primeiro: foto/scan (e PDF lido so em parte) entram em public.leituras_pendentes e o Agente
// pega, le com o FreeLLM e devolve o resultado AQUI; esta funcao aplica as validacoes existentes (normalizarExtracao) e grava o cache.
// Modos (todos na mesma funcao, sem criar funcao nova):
//   consultar_fila  - gestor_rbr|operacao|fiscal: { ids: [uuid] } -> situacao de cada leitura (o front consulta a cada poucos segundos)
//   agente_pegar    - so papel agente_central: reserva ate 3 tarefas pendentes e devolve prompt/schema + texto OU url assinada (5 min) do arquivo
//   agente_resultado- so papel agente_central: { id, fase: 'classificar'|'extrair', tipo?, campos?, erro?, provedor? }
// O agente entra com o login proprio (nunca chave de servico) e nao le o Storage nem a tabela direto: so recebe o que esta tarefa precisa.
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  normalizarExtracao, PROMPT_CLASSIFICACAO, PROMPTS_V2, SCHEMA_CLASSIFICACAO, schemaDoTipo, TIPOS_DOCUMENTO, type TipoDocumento,
} from "../_shared/extracao-documentos.ts";
import { lerPorTipo } from "../_shared/leitura-texto.ts";
import {
  ehTipoLeitura, faltantesDoNormalizado, LENDO_EXPIRA_S, marcarIaGratis, MAX_TENTATIVAS_FILA, MAX_TEXTO_FILA, mesclarBrutos, MSG_FOTO_SEM_LEITURA,
  MSG_PARCIAL_SEM_IA, paraBruto, provedorSeguro,
} from "../_shared/leituraFila.ts";
import { OBRIGATORIOS_TEXTO } from "../_shared/leitura-texto.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Resp = (b: unknown, s?: number) => Response;

// deno-lint-ignore no-explicit-any
type Admin = any;

export interface PedidoFila { bucket: string; path: string; mime: string; tipo: string | null; tipoAutomatico: boolean; texto: string | null; solicitante: string | null }

/** Coloca (ou recoloca) o arquivo na fila. Se ja esta pendente/lendo com o mesmo tipo, devolve a mesma linha (nao duplica nem zera tentativas). */
export async function enfileirar(admin: Admin, p: PedidoFila): Promise<{ id: string; status: string }> {
  const { data: ex } = await admin.from("leituras_pendentes").select("id, status, tipo").eq("bucket", p.bucket).eq("path", p.path).maybeSingle();
  if (ex && (ex.status === "pendente" || ex.status === "lendo") && (ex.tipo ?? null) === (p.tipo ?? null)) return { id: ex.id, status: ex.status };
  const linha = {
    bucket: p.bucket, path: p.path, mime: p.mime, tipo: p.tipo, tipo_automatico: p.tipoAutomatico, texto: p.texto ? p.texto.slice(0, MAX_TEXTO_FILA) : null,
    status: "pendente", campos: null, normalizado: null, provedor: null, tentativas: 0, erro: null, solicitante: p.solicitante, atualizado_em: new Date().toISOString(),
  };
  const { data, error } = await admin.from("leituras_pendentes").upsert(linha, { onConflict: "bucket,path" }).select("id, status").single();
  if (error || !data) throw new Error("fila_indisponivel");
  return { id: data.id, status: data.status };
}

async function quem(req: Request, resp: Resp) {
  const url = Deno.env.get("SUPABASE_URL")!, service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const asUser = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: u } = await asUser.auth.getUser();
  if (!u?.user) return { erro: resp({ sucesso: false, erro: "Nao autenticado" }, 401) };
  const admin = createClient(url, service);
  const { data: ator } = await admin.from("pessoas").select("id, papel").eq("auth_user_id", u.user.id).maybeSingle();
  return { admin, ator: ator as { id: string; papel: string } | null };
}

const mensagemDeErro = (mime: string | null) => (/^image\//i.test(mime ?? "") ? MSG_FOTO_SEM_LEITURA : MSG_PARCIAL_SEM_IA);

export async function tratarFila(req: Request, body: Record<string, unknown>, resp: Resp): Promise<Response> {
  const q = await quem(req, resp);
  if ("erro" in q && q.erro) return q.erro;
  const { admin, ator } = q as { admin: Admin; ator: { id: string; papel: string } | null };
  const modo = String(body.modo);
  const hoje = new Date().toISOString().slice(0, 10);

  // ------------------------------------------------------------------ consulta do front
  if (modo === "consultar_fila") {
    if (!ator || !["gestor_rbr", "operacao", "fiscal"].includes(ator.papel)) return resp({ sucesso: false, erro: "Sem permissao." }, 403);
    const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).filter((i) => UUID.test(i)).slice(0, 12);
    if (!ids.length) return resp({ sucesso: false, erro: "ids invalidos" }, 400);
    const { data } = await admin.from("leituras_pendentes").select("id, path, mime, status, tipo, normalizado, erro, provedor, tentativas").in("id", ids);
    const leituras = (data ?? []).map((l: Record<string, unknown>) => ({
      id: l.id, path: l.path, status: l.status, tipo: l.tipo, normalizado: l.status === "ok" ? l.normalizado : null,
      origem_leitura: "ia", ia_gratis: true, provedor: l.provedor ?? null,
      mensagem: l.status === "erro" ? mensagemDeErro(l.mime as string) : undefined,
    }));
    return resp({ sucesso: true, leituras });
  }

  // ------------------------------------------------------------------ agente
  if (!ator || ator.papel !== "agente_central") return resp({ sucesso: false, erro: "Sem permissao." }, 403);

  if (modo === "agente_pegar") {
    const max = Math.min(Math.max(Number(body.max) || 1, 1), 3);
    const corte = new Date(Date.now() - LENDO_EXPIRA_S * 1000).toISOString();
    // tarefa parada em 'lendo' (agente caiu): volta para a fila; passou das tentativas, vira erro
    await admin.from("leituras_pendentes").update({ status: "erro", erro: "sem_resposta", atualizado_em: new Date().toISOString() })
      .eq("status", "lendo").lt("atualizado_em", corte).gte("tentativas", MAX_TENTATIVAS_FILA);
    await admin.from("leituras_pendentes").update({ status: "pendente", atualizado_em: new Date().toISOString() })
      .eq("status", "lendo").lt("atualizado_em", corte).lt("tentativas", MAX_TENTATIVAS_FILA);
    const { data: lista } = await admin.from("leituras_pendentes").select("id, bucket, path, mime, tipo, texto, tentativas").eq("status", "pendente").order("criado_em").limit(max);
    const tarefas: unknown[] = [];
    for (const l of lista ?? []) {
      const { data: r } = await admin.from("leituras_pendentes").update({ status: "lendo", tentativas: l.tentativas + 1, atualizado_em: new Date().toISOString() })
        .eq("id", l.id).eq("status", "pendente").select("id").maybeSingle();
      if (!r) continue; // outra chamada pegou
      const tarefa: Record<string, unknown> = { id: l.id, mime: l.mime, tipo: l.tipo };
      const tp: unknown = l.tipo;
      if (ehTipoLeitura(tp)) { tarefa.fase = "extrair"; tarefa.prompt = PROMPTS_V2[tp]; tarefa.schema = schemaDoTipo(tp); }
      else { tarefa.fase = "classificar"; tarefa.prompt = PROMPT_CLASSIFICACAO; tarefa.schema = SCHEMA_CLASSIFICACAO; }
      if (l.texto) tarefa.texto = l.texto;
      else {
        const { data: s } = await admin.storage.from(l.bucket).createSignedUrl(l.path, 300);
        if (!s?.signedUrl) { await admin.from("leituras_pendentes").update({ status: "erro", erro: "arquivo_inacessivel" }).eq("id", l.id); continue; }
        tarefa.url = s.signedUrl;
      }
      tarefas.push(tarefa);
    }
    console.log(JSON.stringify({ fn: "extrair-documento", etapa: "agente_pegar", ok: true, tarefas: tarefas.length }));
    return resp({ sucesso: true, tarefas });
  }

  if (modo === "agente_resultado") {
    const id = String(body.id ?? "");
    if (!UUID.test(id)) return resp({ sucesso: false, erro: "id invalido" }, 400);
    const { data: l } = await admin.from("leituras_pendentes").select("id, bucket, path, mime, tipo, tipo_automatico, texto, status, tentativas").eq("id", id).maybeSingle();
    if (!l || l.status !== "lendo") return resp({ sucesso: false, erro: "tarefa nao esta em leitura" }, 409);
    const agora = new Date().toISOString();
    const provedor = provedorSeguro(body.provedor);

    if (body.erro) { // sem dado pessoal no log: so o motivo curto
      const motivo = String(body.erro).replace(/[^A-Za-z0-9_ .:-]/g, "").slice(0, 120) || "erro";
      const definitivo = body.definitivo === true || l.tentativas >= MAX_TENTATIVAS_FILA;
      await admin.from("leituras_pendentes").update({ status: definitivo ? "erro" : "pendente", erro: motivo, atualizado_em: agora }).eq("id", id);
      console.log(JSON.stringify({ fn: "extrair-documento", etapa: "agente_resultado", ok: false, definitivo, motivo }));
      return resp({ sucesso: true, estado: definitivo ? "erro" : "pendente" });
    }

    if (body.fase === "classificar") {
      const t = String(body.tipo ?? "outro");
      const tipo = (TIPOS_DOCUMENTO as readonly string[]).includes(t) ? t : "outro";
      if (tipo === "outro") {
        await admin.from("leituras_pendentes").update({ status: "ok", tipo: "outro", normalizado: null, texto: null, provedor, atualizado_em: agora }).eq("id", id);
        return resp({ sucesso: true, estado: "ok" });
      }
      await admin.from("leituras_pendentes").update({ status: "pendente", tipo, tipo_automatico: true, provedor, atualizado_em: agora }).eq("id", id);
      return resp({ sucesso: true, estado: "pendente" });
    }

    // extrair: junta com o que o parser de texto ja leu (prioridade) e aplica as mesmas validacoes de sempre
    if (!ehTipoLeitura(l.tipo)) return resp({ sucesso: false, erro: "tipo desconhecido" }, 409);
    const tipo = l.tipo as Exclude<TipoDocumento, "outro">;
    const brutoIa = paraBruto(tipo, body.campos);
    const brutoTexto = l.texto ? lerPorTipo(tipo, l.texto) : null;
    const normalizado = marcarIaGratis(normalizarExtracao(tipo, mesclarBrutos(tipo, brutoTexto, brutoIa) as Record<string, unknown>, hoje));
    const faltantes = faltantesDoNormalizado(normalizado, OBRIGATORIOS_TEXTO[tipo] ?? []);
    await admin.from("leituras_pendentes").update({ status: "ok", normalizado, campos: null, texto: null, provedor, erro: null, atualizado_em: agora }).eq("id", id);
    await admin.from("documento_extracoes").upsert({
      path: `${l.bucket}/${l.path}`, tipo,
      campos: { normalizado, legivel: brutoIa.legivel ?? null, suspeita_fraude: brutoIa.suspeita_fraude ?? null, origem_leitura: "ia_gratis" },
    });
    console.log(JSON.stringify({ fn: "extrair-documento", etapa: tipo, ok: true, origem_leitura: "ia", provedor, faltantes: faltantes.length }));
    return resp({ sucesso: true, estado: "ok" });
  }
  return resp({ sucesso: false, erro: "modo invalido" }, 400);
}
