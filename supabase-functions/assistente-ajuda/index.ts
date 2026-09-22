// Edge Function: assistente-ajuda
//
// Assistente de "me ajuda a usar o app" — botão flutuante presente nos três
// apps (Motorista/Agenciador/Gestor). Responde dúvida de navegação/uso do
// app, em português simples, baseado num resumo de como cada app funciona
// (mesmo conteúdo dos escopos de treinamento já escritos pro time).
//
// NÃO é um assistente de decisão de negócio: não dá conselho financeiro,
// não decide nada sobre carga perigosa/complexa, não inventa política que
// não está na base de conhecimento abaixo. Quando não souber, orienta a
// pessoa a falar com o gestor/RBR em vez de arriscar uma resposta errada.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type AppNome = "motorista" | "agenciador" | "gestor";

const BASE_COMUM = `Você é o assistente de ajuda dentro do app da RBR Cargo, uma transportadora rodoviária de carga (FTL)
brasileira. Seu único trabalho é ajudar a pessoa a usar o app — nunca dar conselho financeiro, nunca decidir se
uma carga é perigosa/complexa, nunca inventar uma política ou valor que você não tem certeza que existe.

Regras que você segue sempre:
- Responda curto, em português simples, sem jargão técnico de programação.
- Se a pergunta for sobre como fazer algo no app, explique o caminho (em qual tela, qual botão).
- Se a pergunta for sobre uma regra de negócio que você não tem certeza (valor exato de comissão, se uma carga
  específica está liberada, prazo exato de pagamento de um caso específico), diga que isso depende do caso e
  oriente a pessoa a checar a tela correspondente ou falar com o gestor da RBR — não invente um número.
- Nunca dê instrução sobre como manusear carga perigosa/química ou sobre segurança de trânsito — isso é sempre
  "fale com o gestor da RBR antes de aceitar essa carga".
- Se a pergunta não tiver nada a ver com o app da RBR, diga educadamente que você só ajuda com o uso do app.
- Você NUNCA executa uma ação que muda dado (confirmar pagamento, liberar bloqueio, mudar status) sozinho — só
  pode fazer buscas/consultas (como procurar motorista disponível). Pra qualquer ação que mude algo, explique
  onde a pessoa mesma faz isso no app — não finja que você já fez.`;

const BASE_MOTORISTA = `${BASE_COMUM}

Você está ajudando um MOTORISTA PARCEIRO (não é funcionário CLT) no App Motorista. Esse público muitas vezes
tem pouca intimidade com aplicativos — seja bem direto e didático.

Você tem uma ferramenta de busca (buscar_conhecimento_fiscal) pra dúvidas sobre pedágio (VPO), CIOT/MDF-e e
como a forma de pagamento funciona — por exemplo "por que o pedágio não cai direto na minha conta?" ou "quando
eu recebo o adiantamento?". Use a ferramenta antes de responder esse tipo de pergunta, não invente valor ou
regra.

Como o app funciona (5 abas):
- Perfil: onde ficam CNH, CRLV do veículo, dados pessoais e bancários. Precisa estar tudo preenchido antes de
  poder pegar carga. Ao tirar foto da CNH, o app tenta ler os dados sozinho — a pessoa só confere e corrige se
  precisar, não precisa digitar tudo.
- Início: painel do dia — mostra se está "online" (disponível pra carga) e a carga atual, se tiver. O botão de
  ficar "online" também liga o compartilhamento de localização.
- Cargas: onde aparece a carga oferecida/atribuída e os botões pra avançar o status (aceitar, carregado, em
  trânsito, entregue). Uma vez avançado, normalmente não dá pra voltar sozinho — se errou, precisa falar com o
  agenciador ou gestor.
- Caixa: o que já recebeu e o que está a receber. O valor da carga não cai na conta automaticamente na hora da
  entrega — tem um prazo, que aparece nessa tela.
- Pontos: mostra que o app está reportando a localização. Só funciona com o app aberto e a tela do celular
  desbloqueada — se apagar a tela, para de atualizar (isso é normal, não é bug).

O app roda direto no navegador (é PWA) — não precisa baixar nada de loja de aplicativo. Dá pra "adicionar à
tela inicial" do celular pra ficar com ícone parecido com app normal.`;

const BASE_AGENCIADOR = `${BASE_COMUM}

Você está ajudando um AGENCIADOR (parceiro comercial que cota carga pra clientes dele, e pode ter motoristas
próprios) no App Agenciador.

Como o app funciona (5 seções):
- Início: visão geral das cargas em andamento e um mapa só com a frota que é dele (nunca a frota inteira da
  RBR — isso é regra de acesso, não bug).
- Cotações: onde monta uma cotação pro cliente (origem, destino, valor). Uma cotação ainda NÃO é uma carga real
  — só vira operação de verdade quando o status muda pra "convertida". Dá pra subir o XML da nota fiscal do
  cliente e o sistema já preenche remetente, destinatário, cidades, peso e valor sozinho. Também tem um botão
  de analisar os produtos com IA pra sugerir se a carga parece perigosa ou fora do padrão — é só sugestão, quem
  confirma é a pessoa.
- Clientes: cadastro da carteira de clientes do próprio agenciador (quem pede carga pra ele — diferente de
  "motorista", que é quem executa a carga).
- Financeiro: comissões a receber (uma faixa de 15% a 30% + valor fixo por carga fechada) e histórico.
- Perfil: dados do próprio agenciador e, se tiver motoristas próprios, o vínculo com eles.

O piso mínimo de preço (ANTT) tem os coeficientes oficiais no banco (tabela piso_antt_coeficientes, Resolução
ANTT 6.084/2026) e agora dá pra calcular de verdade: use calcular_frete_minimo pra saber a distância rodoviária
entre origem e destino e, se a pessoa disser o tipo de carga e o número de eixos, o piso mínimo ANTT da rota
inteira. Isso ainda não está como botão na tela de Cotações — hoje só existe via você (assistente) — avise isso
se perguntarem.

Você tem três ferramentas:
- buscar_motoristas_disponiveis — use quando a pessoa perguntar algo como "tem motorista disponível em
  [cidade]" ou "quem está livre perto de [lugar]". Chame a ferramenta, não invente nomes. Se não vier ninguém,
  diga isso claramente em vez de inventar.
- buscar_conhecimento_fiscal — use pra dúvidas sobre VPO/pedágio, CIOT/MDF-e, piso ANTT ou a esteira de
  liberação fiscal (Gatekeeper). Sempre prefira consultar essa base a chutar um número ou regra de memória.
- calcular_frete_minimo — use pra calcular distância entre cidades e, se souber tipo de carga + eixos, o piso
  mínimo ANTT real da rota. Se a pessoa não disser tipo de carga/eixos, calcule só a distância e pergunte se ela
  quer o piso também.`;

const BASE_GESTOR = `${BASE_COMUM}

Você está ajudando um GESTOR (sócio da RBR, acesso total) no App Gestor. Esse público já conhece o negócio —
pode ir direto ao ponto, sem explicar o que é frete/CIOT/comissão.

Como o app funciona (5 telas):
- Início: resumo do que precisa de atenção — motoristas online, operações aguardando liberação fiscal, bloqueio
  fiscal ativo, comissões a creditar, faturas vencidas, pagamentos pendentes.
- Operações: lista de cargas com filtro por status. Ações sensíveis aqui: liberar bloqueio fiscal (é exceção,
  não fluxo normal), reatribuir motorista/veículo, confirmar pagamento pós-entrega (dispara dinheiro de
  verdade — checar a operação antes), e decidir averbação de seguro quando a carga é sinalizada como complexa.
- Pessoas: cadastro de motoristas/agenciadores/condutores. É aqui que se promove alguém a gestor — só fazer
  isso com quem realmente for sócio/confiável nesse nível, não tem hierarquia intermediária.
- Financeiro: contas a pagar/receber e caixa projetado — atenção, "caixa projetado" é estimativa, não é saldo
  bancário real (a conciliação bancária de verdade ainda depende de integração que não está pronta).
- Mapa: última localização conhecida da frota. Só atualiza com o app do motorista aberto — não é rastreio
  contínuo ao vivo.

Você tem três ferramentas:
- buscar_motoristas_disponiveis — use quando a pessoa perguntar algo como "tem motorista disponível em
  [cidade]" ou "quem está livre perto de [lugar]". Chame a ferramenta, não invente nomes. Se não vier ninguém,
  diga isso claramente em vez de inventar.
- buscar_conhecimento_fiscal — use pra dúvidas sobre VPO/pedágio, CIOT/MDF-e, piso ANTT (a tabela oficial de
  272 combinações já está no banco) ou a esteira Gatekeeper. Sempre prefira consultar essa base a chutar um
  número ou regra de memória.
- calcular_frete_minimo — use pra calcular distância rodoviária real entre duas cidades e, se souber tipo de
  carga + eixos, o piso mínimo ANTT real da rota (não é mais estimativa manual).`;

function baseConhecimento(app: AppNome): string {
  if (app === "motorista") return BASE_MOTORISTA;
  if (app === "agenciador") return BASE_AGENCIADOR;
  return BASE_GESTOR;
}

// Ferramenta de consulta — só leitura, nunca muda dado. Executada com o
// cliente autenticado da PRÓPRIA pessoa que perguntou, então o RLS do banco
// decide sozinho o que ela pode ou não ver (agenciador vê o perfil público
// de motoristas pra alocação; gestor vê tudo).
const DECL_BUSCAR_MOTORISTAS = {
  name: "buscar_motoristas_disponiveis",
  description:
    "Busca motoristas (titulares ou condutores) marcados como online/disponíveis, opcionalmente filtrando por cidade e/ou UF de base.",
  parameters: {
    type: "object",
    properties: {
      cidade: { type: "string", description: "Cidade pra filtrar (opcional, deixa vazio pra não filtrar)" },
      uf: { type: "string", description: "Sigla da UF, 2 letras (opcional)" },
    },
  },
};

const DECL_BUSCAR_CONHECIMENTO_FISCAL = {
  name: "buscar_conhecimento_fiscal",
  description:
    "Busca no reportório de conhecimento fiscal/ANTT/pedágio (VPO, CIOT, MDF-e, piso mínimo ANTT, esteira de liberação Gatekeeper). Use pra qualquer dúvida sobre essas regras em vez de responder de memória.",
  parameters: {
    type: "object",
    properties: {
      consulta: {
        type: "string",
        description: "Termos de busca (ex: 'vale pedágio', 'piso ANTT', 'CIOT adiantamento')",
      },
      categoria: {
        type: "string",
        description:
          "Opcional — filtra por categoria: vpo_pedagio, ciot_mdfe, risco_fiscal, carga_complexa, geral, fiscal_tributario (NF-e/CT-e/MDF-e, ICMS/ICMS-ST, NCM), seguranca_carga (produto perigoso/ONU/MOPP, seguro)",
      },
    },
    required: ["consulta"],
  },
};

// Calcula distância rodoviária real (Nominatim + OSRM) e, se vier tipo de
// carga + eixos, o piso mínimo ANTT da rota. Chama a função
// calcular-rota-frete (que tem sua própria saída de rede — o assistente
// não faz a chamada HTTP externa diretamente).
const DECL_CALCULAR_FRETE_MINIMO = {
  name: "calcular_frete_minimo",
  description:
    "Calcula a distância rodoviária entre duas cidades e, se souber o tipo de carga e o número de eixos do veículo, o piso mínimo de frete ANTT pra essa rota. Use quando a pessoa pedir pra calcular rota, distância, ou piso/frete mínimo entre uma origem e um destino.",
  parameters: {
    type: "object",
    properties: {
      cidade_origem: { type: "string", description: "Cidade de origem" },
      uf_origem: { type: "string", description: "Sigla da UF de origem, 2 letras" },
      cidade_destino: { type: "string", description: "Cidade de destino" },
      uf_destino: { type: "string", description: "Sigla da UF de destino, 2 letras" },
      tipo_carga: {
        type: "string",
        description:
          "Opcional — só informe se souber com certeza. Ex: 'Granel Sólido', 'Frigorificada', 'Carga Geral', 'Conteinerizada'. Sem esse campo, só a distância é calculada.",
      },
      eixos: {
        type: "number",
        description: "Opcional — número de eixos do veículo (2 a 9). Só use junto com tipo_carga.",
      },
    },
    required: ["cidade_origem", "uf_origem", "cidade_destino", "uf_destino"],
  },
};

// Ferramentas disponíveis por app — busca de motoristas e cálculo de
// rota/piso só fazem sentido pra quem aloca carga ou cota preço
// (agenciador/gestor); conhecimento fiscal serve a todos, já que motorista
// também pode ter dúvida sobre pedágio/CIOT.
function ferramentasParaApp(app: AppNome) {
  if (app === "motorista") {
    return [{ functionDeclarations: [DECL_BUSCAR_CONHECIMENTO_FISCAL] }];
  }
  return [
    {
      functionDeclarations: [DECL_BUSCAR_MOTORISTAS, DECL_BUSCAR_CONHECIMENTO_FISCAL, DECL_CALCULAR_FRETE_MINIMO],
    },
  ];
}

async function buscarMotoristasDisponiveis(
  supabaseAsUser: ReturnType<typeof createClient>,
  args: { cidade?: string; uf?: string },
) {
  let query = supabaseAsUser
    .from("pessoas")
    .select("nome, cidade, uf, papel, status_online")
    .in("papel", ["titular_motorista", "condutor"])
    .eq("status_online", true)
    .eq("status", "ativo")
    .limit(20);

  if (args.cidade) query = query.ilike("cidade", `%${args.cidade}%`);
  if (args.uf) query = query.ilike("uf", args.uf);

  const { data, error } = await query;
  if (error) return { erro: error.message };
  return { motoristas: data ?? [] };
}

async function buscarConhecimentoFiscal(
  supabaseAsUser: ReturnType<typeof createClient>,
  args: { consulta?: string; categoria?: string },
) {
  let query = supabaseAsUser
    .from("base_conhecimento_ia")
    .select("categoria, titulo, conteudo, fonte")
    .eq("ativo", true)
    .limit(5);

  if (args.categoria) query = query.eq("categoria", args.categoria);
  if (args.consulta) {
    const termo = `%${args.consulta}%`;
    query = query.or(`titulo.ilike.${termo},conteudo.ilike.${termo}`);
  }

  const { data, error } = await query;
  if (error) return { erro: error.message };
  return { resultados: data ?? [] };
}

// Repassa pra função calcular-rota-frete, usando o mesmo Authorization da
// pessoa que perguntou (RLS/Auth próprios dela — o assistente não eleva
// privilégio). calcular-rota-frete é quem faz as chamadas HTTP externas
// (Nominatim/OSRM), porque o ambiente de Edge Functions tem saída de rede
// livre que este assistente também tem, mas mantemos a lógica de rota
// isolada numa função própria, reaproveitável pelo front-end também.
async function calcularFreteMinimo(
  supabaseUrl: string,
  authHeader: string,
  args: {
    cidade_origem?: string;
    uf_origem?: string;
    cidade_destino?: string;
    uf_destino?: string;
    tipo_carga?: string;
    eixos?: number;
  },
) {
  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/calcular-rota-frete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: JSON.stringify(args),
    });
    const data = await resp.json();
    return data;
  } catch (e) {
    return { sucesso: false, erro: `Falha ao chamar calcular-rota-frete: ${String(e)}` };
  }
}

// Despacha a chamada de ferramenta pedida pelo Gemini pro handler certo.
async function executarFerramenta(
  nome: string,
  args: Record<string, unknown>,
  supabaseAsUser: ReturnType<typeof createClient>,
  supabaseUrl: string,
  authHeader: string,
) {
  if (nome === "buscar_motoristas_disponiveis") return buscarMotoristasDisponiveis(supabaseAsUser, args);
  if (nome === "buscar_conhecimento_fiscal") return buscarConhecimentoFiscal(supabaseAsUser, args);
  if (nome === "calcular_frete_minimo") return calcularFreteMinimo(supabaseUrl, authHeader, args);
  return { erro: `Ferramenta desconhecida: ${nome}` };
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
    const { app, pergunta, historico } = await req.json();
    if (app !== "motorista" && app !== "agenciador" && app !== "gestor") {
      return jsonResponse({ sucesso: false, erro: "app precisa ser 'motorista', 'agenciador' ou 'gestor'." }, 400);
    }
    if (!pergunta || typeof pergunta !== "string" || pergunta.trim() === "") {
      return jsonResponse({ sucesso: false, erro: "pergunta é obrigatória." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseAsUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await supabaseAsUser.auth.getUser();
    if (userError || !userData?.user) {
      return jsonResponse({ sucesso: false, erro: "Não autenticado" }, 401);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { data: geminiApiKey, error: keyError } = await supabaseAdmin.rpc("get_gemini_api_key");
    if (keyError || !geminiApiKey) {
      return jsonResponse(
        { sucesso: false, erro: "Assistente ainda não configurado (chave não encontrada no Vault)." },
        503,
      );
    }

    const model = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";

    // Histórico curto (até 6 últimas trocas) pra manter contexto da conversa,
    // sem deixar o prompt crescer sem limite.
    const historicoLimitado = Array.isArray(historico) ? historico.slice(-6) : [];
    const contents = [
      { role: "user", parts: [{ text: baseConhecimento(app) }] },
      { role: "model", parts: [{ text: "Entendido, estou pronto pra ajudar dentro dessas regras." }] },
      ...historicoLimitado.map((h: { role: string; texto: string }) => ({
        role: h.role === "assistant" ? "model" : "user",
        parts: [{ text: String(h.texto ?? "") }],
      })),
      { role: "user", parts: [{ text: pergunta }] },
    ];

    const ferramentas = ferramentasParaApp(app);
    const chamarGemini = (payloadContents: unknown[]) =>
      fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: payloadContents,
          generationConfig: { temperature: 0.3 },
          tools: ferramentas,
        }),
      });

    let geminiResp = await chamarGemini(contents);
    if (!geminiResp.ok) {
      const errText = await geminiResp.text();
      return jsonResponse(
        { sucesso: false, erro: `Gemini respondeu ${geminiResp.status}: ${errText.slice(0, 300)}` },
        502,
      );
    }

    let geminiJson = await geminiResp.json();
    let parte = geminiJson?.candidates?.[0]?.content?.parts?.[0];

    // Se o modelo pediu pra chamar alguma ferramenta, executa (só leitura,
    // com o cliente autenticado da própria pessoa — RLS decide o que ela vê)
    // e manda o resultado de volta pro modelo terminar a resposta em
    // linguagem natural.
    if (parte?.functionCall?.name) {
      const nomeFuncao = parte.functionCall.name;
      const resultado = await executarFerramenta(
        nomeFuncao,
        parte.functionCall.args ?? {},
        supabaseAsUser,
        supabaseUrl,
        authHeader,
      );

      const contentsComFuncao = [
        ...contents,
        { role: "model", parts: [{ functionCall: parte.functionCall }] },
        {
          role: "user",
          parts: [{ functionResponse: { name: nomeFuncao, response: resultado } }],
        },
      ];

      geminiResp = await chamarGemini(contentsComFuncao);
      if (!geminiResp.ok) {
        const errText = await geminiResp.text();
        return jsonResponse(
          { sucesso: false, erro: `Gemini respondeu ${geminiResp.status}: ${errText.slice(0, 300)}` },
          502,
        );
      }
      geminiJson = await geminiResp.json();
      parte = geminiJson?.candidates?.[0]?.content?.parts?.[0];
    }

    const resposta = parte?.text;
    if (!resposta) {
      return jsonResponse({ sucesso: false, erro: "Não consegui gerar uma resposta agora." }, 502);
    }

    return jsonResponse({ sucesso: true, resposta });
  } catch (e) {
    return jsonResponse({ sucesso: false, erro: String(e) }, 500);
  }
});
