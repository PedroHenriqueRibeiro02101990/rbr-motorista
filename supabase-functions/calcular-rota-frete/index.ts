// Edge Function: calcular-rota-frete
//
// Calcula a distância rodoviária entre origem e destino usando APIs
// públicas e gratuitas do OpenStreetMap (Nominatim pra geocodificar
// cidade -> coordenada, OSRM pra rota -> distância/tempo), e o piso
// mínimo de frete ANTT correspondente (Resolução 6.084/2026), consultando
// a tabela `piso_antt_coeficientes` já migrada da planilha oficial.
//
// Sem chave de API, sem custo. Roda no ambiente do Supabase Edge Functions
// (Deno Deploy), que tem saída de rede livre — diferente do sandbox onde
// isso foi escrito, que bloqueia esses domínios por política da organização.
//
// Usado por: (1) o botão de calcular piso ANTT na tela de Cotações do
// Agenciador (chamado direto pelo front-end), e (2) a ferramenta
// `calcular_frete_minimo` do assistente de IA (assistente-ajuda).
//
// Como qualquer cálculo de IA/automação deste projeto: isso SUGERE um piso
// mínimo de referência. A distância vem de um serviço de rota de terceiros
// (pode divergir um pouco da rota real que o motorista vai fazer) — não
// substitui conferência antes de fechar preço com o cliente.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Coordenada {
  lat: number;
  lon: number;
}

// Nominatim pede um User-Agent identificável e no máximo ~1 req/s — nosso
// volume (uma consulta por vez, disparada por ação humana) está bem dentro
// disso, sem precisar de fila/cache.
async function geocodificarCidade(cidade: string, uf: string): Promise<Coordenada | null> {
  const url = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(cidade)}&state=${encodeURIComponent(uf)}&country=Brazil&format=json&limit=1`;
  const resp = await fetch(url, {
    headers: { "User-Agent": "RBRCargo-CalculoRota/1.0 (contato: operacional@rbrcargo.com.br)" },
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  if (!Array.isArray(data) || data.length === 0) return null;
  const lat = parseFloat(data[0].lat);
  const lon = parseFloat(data[0].lon);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  return { lat, lon };
}

async function calcularDistanciaRodoviaria(
  origem: Coordenada,
  destino: Coordenada,
): Promise<{ distancia_km: number; duracao_horas: number } | null> {
  const url = `https://router.project-osrm.org/route/v1/driving/${origem.lon},${origem.lat};${destino.lon},${destino.lat}?overview=false`;
  const resp = await fetch(url);
  if (!resp.ok) return null;
  const data = await resp.json();
  const rota = data?.routes?.[0];
  if (!rota) return null;
  return { distancia_km: rota.distance / 1000, duracao_horas: rota.duration / 3600 };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });

  try {
    const {
      cidade_origem,
      uf_origem,
      cidade_destino,
      uf_destino,
      tipo_carga,
      eixos,
      tabela = "A",
    } = await req.json();

    if (!cidade_origem || !uf_origem || !cidade_destino || !uf_destino) {
      return jsonResponse(
        { sucesso: false, erro: "cidade_origem, uf_origem, cidade_destino e uf_destino são obrigatórios." },
        400,
      );
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseAsUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await supabaseAsUser.auth.getUser();
    if (userError || !userData?.user) {
      return jsonResponse({ sucesso: false, erro: "Não autenticado" }, 401);
    }

    const origem = await geocodificarCidade(cidade_origem, uf_origem);
    if (!origem) {
      return jsonResponse(
        { sucesso: false, erro: `Não consegui localizar "${cidade_origem}/${uf_origem}" — confere o nome da cidade.` },
        422,
      );
    }
    const destino = await geocodificarCidade(cidade_destino, uf_destino);
    if (!destino) {
      return jsonResponse(
        { sucesso: false, erro: `Não consegui localizar "${cidade_destino}/${uf_destino}" — confere o nome da cidade.` },
        422,
      );
    }

    const rota = await calcularDistanciaRodoviaria(origem, destino);
    if (!rota) {
      return jsonResponse(
        { sucesso: false, erro: "Não consegui calcular a rota entre essas duas cidades agora. Tenta de novo em instantes." },
        502,
      );
    }

    const resultado: Record<string, unknown> = {
      sucesso: true,
      distancia_km: Math.round(rota.distancia_km * 10) / 10,
      duracao_horas: Math.round(rota.duracao_horas * 10) / 10,
      fonte_rota: "OSRM/OpenStreetMap — estimativa de rota rodoviária, pode divergir um pouco da rota real",
    };

    // Piso ANTT é opcional — só calcula se vier tipo_carga + eixos.
    if (tipo_carga && eixos) {
      const { data: coef, error: coefError } = await supabaseAsUser
        .from("piso_antt_coeficientes")
        .select("ccd_por_km, cc_fixo, data_vigencia, fonte, tabela_descricao")
        .eq("tabela", tabela)
        .eq("tipo_carga", tipo_carga)
        .eq("eixos", eixos)
        .order("data_vigencia", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (coefError) {
        resultado.piso_antt_erro = coefError.message;
      } else if (!coef) {
        resultado.piso_antt_erro = `Não achei coeficiente pra tabela ${tabela} / "${tipo_carga}" / ${eixos} eixos na base oficial.`;
      } else {
        const ccdPorKm = Number(coef.ccd_por_km);
        const ccFixo = Number(coef.cc_fixo);
        const piso = ccFixo + ccdPorKm * resultado.distancia_km!;
        resultado.piso_antt_minimo = Math.round(piso * 100) / 100;
        resultado.piso_antt_detalhe = {
          tabela,
          tabela_descricao: coef.tabela_descricao,
          tipo_carga,
          eixos,
          ccd_por_km: ccdPorKm,
          cc_fixo: ccFixo,
          fonte: coef.fonte,
        };
      }
    }

    return jsonResponse(resultado);
  } catch (e) {
    return jsonResponse({ sucesso: false, erro: String(e) }, 500);
  }
});
