// Edge Function: efrete-homologacao-teste  (verify_jwt = true)
//
// Passo 2 da integração efrete (NSTech): testa a conexão na HOMOLOGAÇÃO. Não emite CIOT nem registra pagamento.
// Ações:
//   {acao:"login", variante?:"original"|"sem_espaco"|"cnpj", verbo?:"GET"|"POST"} -> {ok, motivo}  (nunca o token)
//   {acao:"consultar-situacao", cpfCnpj, rntrc, placas[], dataFimViagem?, interessado?} -> retorno da efrete
//   {acao:"logout"} -> {ok, motivo}
// Quem pode chamar: gestor RBR (sessão do app), service_role, ou o próprio banco com a chave interna
// EFRETE_TESTE_CHAMADA_INTERNA no cabeçalho x-efrete-chave-interna (gerada no banco; ninguém vê).
// Trava: recusa rodar se EFRETE_BASE_URL não for a homologação (dev.efrete.com.br).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { carregarConfigDoVault, criarClienteEfrete, varianteUsuario, type ConfigEfrete, type Verbo } from "../_shared/efreteClient.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-efrete-chave-interna",
};
const CNPJ_RBR = "69115969000104";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const segredo = async (nome: string) => {
  const { data, error } = await admin.rpc("efrete_segredo", { p_nome: nome });
  if (error) throw new Error(`Não consegui ler ${nome} do Vault: ${error.message}`);
  return (data as string | null) ?? null;
};
let configCache: Promise<ConfigEfrete> | null = null;
const carregarConfig = () => (configCache ??= carregarConfigDoVault(segredo));

// Um cliente por isolate: o token fica na memória e é reaproveitado entre chamadas do mesmo isolate.
const clientes = new Map<Verbo, ReturnType<typeof criarClienteEfrete>>();
const cliente = (verboLogin: Verbo = "GET") => {
  if (!clientes.has(verboLogin)) {
    clientes.set(verboLogin, criarClienteEfrete({ carregarConfig, verboLogin, verboConsulta: verboLogin, log: (m) => console.log(m) }));
  }
  return clientes.get(verboLogin)!;
};

function iguais(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function autorizado(req: Request): Promise<{ ok: true; quem: string } | { ok: false; status: number; erro: string }> {
  const interna = req.headers.get("x-efrete-chave-interna") ?? "";
  if (interna) {
    const esperada = (await segredo("EFRETE_TESTE_CHAMADA_INTERNA")) ?? "";
    return iguais(interna, esperada) ? { ok: true, quem: "banco" } : { ok: false, status: 403, erro: "Chave interna inválida." };
  }
  const auth = req.headers.get("Authorization") ?? "";
  const jwt = auth.replace(/^Bearer\s+/i, "");
  if (jwt && iguais(jwt, serviceKey)) return { ok: true, quem: "service_role" };
  const comoUsuario = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data } = await comoUsuario.auth.getUser();
  if (!data?.user) return { ok: false, status: 401, erro: "Não autenticado." };
  const { data: p } = await admin.from("pessoas").select("papel").eq("auth_user_id", data.user.id).maybeSingle();
  if (p?.papel !== "gestor_rbr") return { ok: false, status: 403, erro: "Só um gestor RBR pode testar a integração efrete." };
  return { ok: true, quem: "gestor" };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  try {
    const a = await autorizado(req);
    if (!a.ok) return json({ ok: false, motivo: a.erro }, a.status);

    const cfg = await carregarConfig();
    if (!cfg.baseUrl.includes("dev.efrete.com.br")) {
      return json({ ok: false, motivo: "Trava de segurança: EFRETE_BASE_URL não é a homologação (dev.efrete.com.br). Este teste só roda na homologação." }, 412);
    }

    const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const acao = String(corpo.acao ?? "");
    const verbo: Verbo = corpo.verbo === "POST" ? "POST" : "GET";

    if (acao === "login") {
      const variante = (["original", "sem_espaco", "cnpj"].includes(String(corpo.variante)) ? corpo.variante : "original") as "original" | "sem_espaco" | "cnpj";
      const r = await cliente(verbo).login({ usuario: varianteUsuario(cfg.usuario, variante, CNPJ_RBR), forcar: true });
      console.log(`[efrete-teste] login variante=${variante} verbo=${verbo} quem=${a.quem} ok=${r.ok}${r.ok ? "" : ` codigo=${r.erro.codigo}`}`);
      return json(r.ok ? { ok: true, motivo: "Login aceito pela efrete (token guardado só na memória da função)." } : { ok: false, motivo: `${r.erro.codigo}: ${r.erro.mensagem}`, http: r.erro.http ?? null });
    }

    if (acao === "consultar-situacao") {
      const placas = Array.isArray(corpo.placas) ? corpo.placas.map(String) : [];
      if (!corpo.cpfCnpj || !corpo.rntrc || placas.length === 0) return json({ ok: false, motivo: "Informe cpfCnpj, rntrc e placas." }, 400);
      const r = await cliente(verbo).consultarSituacaoTransportador({
        interessadoCpfCnpj: String(corpo.interessado ?? CNPJ_RBR),
        transportadorCpfCnpj: String(corpo.cpfCnpj),
        rntrc: String(corpo.rntrc),
        placas,
        dataPrevistaFimViagem: corpo.dataFimViagem ? String(corpo.dataFimViagem) : undefined,
      });
      console.log(`[efrete-teste] consulta ${String(corpo.cpfCnpj).slice(0, 4)}… ok=${r.ok}`);
      return json(r.ok ? { ok: true, situacao: r.dados } : { ok: false, motivo: `${r.erro.codigo}: ${r.erro.mensagem}`, http: r.erro.http ?? null });
    }

    if (acao === "logout") {
      const r = await cliente(verbo).logout();
      return json(r.ok ? { ok: true, motivo: "Logout feito (ou não havia sessão neste isolate)." } : { ok: false, motivo: `${r.erro.codigo}: ${r.erro.mensagem}` });
    }

    return json({ ok: false, motivo: "Ação desconhecida. Use login, consultar-situacao ou logout." }, 400);
  } catch (e) {
    console.error("[efrete-teste]", e instanceof Error ? e.message : String(e));
    return json({ ok: false, motivo: e instanceof Error ? e.message : "Erro inesperado." }, 500);
  }
});
