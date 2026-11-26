// Edge Function: calcular-cotacao-rota  (verify_jwt = true)  NÃO PUBLICADA: deploy só quando o Pedro mandar.
//
// Uma chamada, três respostas: km (OSRM), piso ANTT (tabela vigente na data da consulta) e pedágio (Repom, roteirização),
// mais a referência de venda (mesma precificação da cotação) quando piso e pedágio vêm juntos. Serve a tela de Cotações
// (gestor e agenciador) e a Calculadora RBR. Reaproveita: pedagioPorRota (repomPedagio.ts: cache de 30 dias, trava e
// limite), o cliente de roteirização (repomClient.ts) e a precificação extraída (precoCotacao.ts). Não duplica cálculo.
//
// Entrada: { cidade_origem, uf_origem, cidade_destino, uf_destino, ibge_origem?, ibge_destino?, tipo_carga, eixos,
//            tabela? (A), incluir_volta? (false), eixos_suspensos_ida?, eixos_suspensos_volta?, data_consulta? }
// Rota para a Repom: sempre por código IBGE (tabela municipios_coordenadas); cidade sem IBGE = pedágio manual, sem chamar a Repom.
// Segurança: só gestor_rbr ou agenciador logados; CORS restrito (repomHttp.ts); trava REPOM_ROTEIRIZACAO_LIBERADA = 'sim'
// (ausente = 503 curto, sem chamar nada); limite diário REPOM_LIMITE_DIARIO só para quem vai à Repom (cache não conta);
// limite por usuário por minuto. Ambiente por REPOM_AMBIENTE (padrão qa). No QA usa SOMENTE as credenciais REPOM_QA_VPR_ROTEIRIZACAO_*
// (sem fallback para as de produção); credenciais de produção só quando REPOM_AMBIENTE = prd (troca feita pelo Pedro).
// Nenhum segredo em log, resposta ou código. Cada consulta que vai à Repom vira uma linha em repom_requisicoes.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { ambienteRepom, criarRepomClient, higienizar } from "../_shared/repomClient.ts";
import { pedagioPorRota, sha256Hex, type Repositorio } from "../_shared/repomPedagio.ts";
import { corsPara } from "../_shared/repomHttp.ts";
import { decidirLimite, decidirTrava, inicioDoDia, limiteDiario, travaLiberada } from "../_shared/repomTrava.ts";
import { calcularCotacaoRota, type CidadeResolvida, type DepsCotacaoRota, type PontoCidade } from "../_shared/cotacaoRota.ts";

let CORS: Record<string, string> = {};
const LIMITE_POR_MINUTO = 10;
const UA = "RBRCargo-CalculoRota/1.0 (contato: operacional@rbrcargo.com.br)";

const url = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const segredo = async (nome: string): Promise<string | null> => {
  const { data, error } = await admin.rpc("repom_segredo", { p_nome: nome });
  if (error) throw new Error("Não consegui ler a configuração da Repom.");
  return (data as string | null) ?? null;
};
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

async function resolverCidade(c: PontoCidade): Promise<CidadeResolvida | null> {
  const uf = c.uf.toUpperCase();
  let q = admin.from("municipios_coordenadas").select("codigo_ibge, lat, lng").eq("uf", uf);
  q = c.ibge ? q.eq("codigo_ibge", c.ibge) : q.eq("nome_norm", semAcento(c.cidade));
  const { data } = await q.limit(1).maybeSingle();
  if (data) return { ibge: String(data.codigo_ibge), lat: Number(data.lat), lon: Number(data.lng) };
  // Fora da tabela: coordenada pelo Nominatim (sem IBGE; o pedágio da Repom fica manual).
  const r = await fetch(`https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(c.cidade)}&state=${encodeURIComponent(uf)}&country=Brazil&format=json&limit=1`, { headers: { "User-Agent": UA } });
  if (!r.ok) return null;
  const j = await r.json();
  if (!Array.isArray(j) || !j.length) return null;
  const lat = parseFloat(j[0].lat), lon = parseFloat(j[0].lon);
  return Number.isNaN(lat) || Number.isNaN(lon) ? null : { ibge: null, lat, lon };
}

// Geometria simplificada (no máximo ~60 pontos) para o mini mapa; só amostra a linha real devolvida pelo OSRM.
function amostrar(coords: [number, number][], max = 60): [number, number][] {
  if (coords.length <= max) return coords;
  const passo = (coords.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => coords[Math.round(i * passo)]);
}
async function osrm(o: CidadeResolvida, d: CidadeResolvida) {
  const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${o.lon},${o.lat};${d.lon},${d.lat}?overview=simplified&geometries=geojson`, { signal: AbortSignal.timeout(20_000) });
  if (!r.ok) return null;
  const rota = (await r.json())?.routes?.[0];
  if (!rota) return null;
  const coords = (rota.geometry?.coordinates ?? []) as [number, number][];
  return { km: rota.distance / 1000, horas: rota.duration / 3600, geometria: coords.length ? amostrar(coords) : undefined };
}

const repo: Repositorio = {
  async buscarRota(h) {
    const { data } = await admin.from("repom_rotas").select("id, codigo_roteiro_repom, codigo_percurso_repom, descricao_percurso, distancia_km").eq("chave_hash", h).maybeSingle();
    return data ? { ...data, distancia_km: data.distancia_km == null ? null : Number(data.distancia_km) } : null;
  },
  async gravarRota(r) {
    const { data, error } = await admin.from("repom_rotas").upsert(r, { onConflict: "chave_hash" }).select("id, codigo_roteiro_repom, codigo_percurso_repom, descricao_percurso, distancia_km").single();
    if (error) throw new Error("Não consegui gravar a rota no cache.");
    return { ...data, distancia_km: data.distancia_km == null ? null : Number(data.distancia_km) };
  },
  async buscarPedagio(rotaId, eixos, a, b) {
    const { data } = await admin.from("repom_pedagios").select("valor_total, valor_ida, valor_volta, consultado_em, validade_dias").eq("rota_id", rotaId).eq("eixos", eixos).eq("eixos_suspensos_ida", a).eq("eixos_suspensos_volta", b).maybeSingle();
    return data ? { ...data, valor_total: Number(data.valor_total), valor_ida: data.valor_ida == null ? null : Number(data.valor_ida), valor_volta: data.valor_volta == null ? null : Number(data.valor_volta) } : null;
  },
  async gravarPedagio(p, descricao) {
    await admin.from("repom_pedagios").upsert({ ...p, consultado_em: new Date().toISOString() }, { onConflict: "rota_id,eixos,eixos_suspensos_ida,eixos_suspensos_volta" });
    if (descricao) await admin.from("repom_rotas").update({ descricao_percurso: descricao }).eq("id", p.rota_id);
  },
};

Deno.serve(async (req) => {
  CORS = corsPara(req.headers.get("origin"), Deno.env.get("REPOM_CORS_ORIGENS"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    // 1) quem chama
    const comoUsuario = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: u } = await comoUsuario.auth.getUser();
    if (!u?.user) return json({ ok: false, erro: "Não autenticado." }, 401);
    const { data: p } = await admin.from("pessoas").select("papel").eq("auth_user_id", u.user.id).maybeSingle();
    if (p?.papel !== "gestor_rbr" && p?.papel !== "agenciador") return json({ ok: false, erro: "Só gestor ou agenciador calcula a rota." }, 403);

    // 2) trava de custo (ausente = 503 curto, sem chamar nada)
    const trava = decidirTrava(travaLiberada(await segredo("REPOM_ROTEIRIZACAO_LIBERADA")));
    if (!trava.permitido) return json({ ok: false, desligado: true, erro: trava.erro }, trava.status);

    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const ambiente = ambienteRepom(await segredo("REPOM_AMBIENTE"));

    // 3) limite por usuário por minuto
    const desde = new Date(Date.now() - 60_000).toISOString();
    const { count: recentes } = await admin.from("repom_requisicoes").select("id", { count: "exact", head: true }).eq("criado_por", u.user.id).gte("criado_em", desde);
    if ((recentes ?? 0) >= LIMITE_POR_MINUTO) return json({ ok: false, erro: "Muitas consultas seguidas. Aguarde um minuto e tente de novo." }, 429);

    // 4) parâmetros da cotação (mesmos da tela) e fator de retorno vazio (só se configurado; senão o piso é só de ida)
    const { data: params } = await admin.from("parametros_sistema").select("chave, valor").in("chave", ["aliquota_imposto_cotacao_padrao", "margem_cotacao_min", "piso_antt_retorno_vazio_fator"]);
    const par = (k: string) => { const v = params?.find((x) => x.chave === k)?.valor; return v == null || v === "" ? null : Number(v); };
    const fator = par("piso_antt_retorno_vazio_fator");

    // 5) Repom (credenciais do ambiente; QA nunca cai nas de produção)
    const prefixo = ambiente === "prd" ? "REPOM_VPR_ROTEIRIZACAO" : "REPOM_QA_VPR_ROTEIRIZACAO";
    const repom = criarRepomClient({
      ambiente,
      codigoCliente: (await segredo("REPOM_VPR_CODIGO_CLIENTE")) ?? "",
      roteirizacaoLogin: (await segredo(`${prefixo}_LOGIN`)) ?? "",
      roteirizacaoSenha: (await segredo(`${prefixo}_SENHA`)) ?? "",
      valePedagioLogin: "", valePedagioSenha: "",
    });

    const idaVolta = b.incluir_volta === true;
    const deps: DepsCotacaoRota = {
      hoje: new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10),
      ambiente,
      resolverCidade,
      osrm,
      async coeficiente(tabela, tipo, eixos, data) {
        const { data: c } = await comoUsuario.from("piso_antt_coeficientes").select("ccd_por_km, cc_fixo, data_vigencia, fonte, a_confirmar")
          .eq("tabela", tabela).eq("tipo_carga", tipo).eq("eixos", eixos).lte("data_vigencia", data).order("data_vigencia", { ascending: false }).limit(1).maybeSingle();
        return c ? { ccd: Number(c.ccd_por_km), cc: Number(c.cc_fixo), vigencia: c.data_vigencia, fonte: c.fonte, aConfirmar: c.a_confirmar === true } : null;
      },
      async pedagio(e) {
        const chaveIdem = await sha256Hex(`${u.user.id}|${JSON.stringify(e)}|${Math.floor(Date.now() / 60_000)}`);
        const { data: linha } = await admin.from("repom_requisicoes").insert({ acao: "cotacao-rota", ambiente, idempotency_key: chaveIdem, request_json: higienizar(e), criado_por: u.user.id, status: "pendente" }).select("id").maybeSingle();
        const antesDeChamar = async (): Promise<string | null> => {
          const limite = limiteDiario(await segredo("REPOM_LIMITE_DIARIO"));
          let q = admin.from("repom_requisicoes").select("id", { count: "exact", head: true }).in("status", ["pendente", "ok", "erro"]).gte("criado_em", inicioDoDia());
          if (linha?.id) q = q.neq("id", linha.id);
          const { count } = await q;
          const v = decidirLimite(count ?? 0, limite);
          return v.permitido ? null : v.erro;
        };
        const r = await pedagioPorRota(e, repo, repom, Date.now(), antesDeChamar);
        const status = r.limite ? "bloqueado_limite" : r.doCache ? "cache" : r.ok ? "ok" : "erro";
        if (linha?.id) await admin.from("repom_requisicoes").update({ response_json: higienizar(r), status, erro: r.ok ? null : r.erro ?? null, http_status: r.ok ? 200 : null }).eq("id", linha.id);
        return r;
      },
      parametros: { aliquota: par("aliquota_imposto_cotacao_padrao") ?? 0.06, margemMin: par("margem_cotacao_min") ?? 0.26, fatorRetornoVazio: fator },
    };

    const resultado = await calcularCotacaoRota({
      origem: { cidade: String(b.cidade_origem ?? ""), uf: String(b.uf_origem ?? ""), ibge: b.ibge_origem ? String(b.ibge_origem) : null },
      destino: { cidade: String(b.cidade_destino ?? ""), uf: String(b.uf_destino ?? ""), ibge: b.ibge_destino ? String(b.ibge_destino) : null },
      tipoCarga: String(b.tipo_carga ?? ""),
      eixos: Number(b.eixos ?? 0),
      tabela: b.tabela ? String(b.tabela) : "A",
      incluirVolta: idaVolta,
      eixosSuspensosIda: Number(b.eixos_suspensos_ida ?? 0),
      eixosSuspensosVolta: Number(b.eixos_suspensos_volta ?? 0),
      dataConsulta: typeof b.data_consulta === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.data_consulta) ? b.data_consulta : undefined,
    }, deps);
    return json({ ...resultado, parametrosReferencia: { aliquota: deps.parametros.aliquota, margemMin: deps.parametros.margemMin } });
  } catch (_e) {
    return json({ ok: false, erro: "Não foi possível calcular agora. Tente de novo ou informe os valores à mão." }, 200);
  }
});
