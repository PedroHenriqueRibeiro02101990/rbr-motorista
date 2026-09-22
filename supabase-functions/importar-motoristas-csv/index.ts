// Edge Function: importar-motoristas-csv
//
// Importação em lote de motoristas pro Agenciador, a partir de uma lista de
// linhas (nome, email, celular?, cpf?) já parseada no front-end de um CSV.
//
// Decisões de design (ver claude/apps-motorista-agenciador-status-v1.md):
//
// 1. Cria a conta real em auth.users na hora (admin.createUser), em vez de
//    só inserir uma linha "fantasma" em `pessoas` sem auth_user_id. Isso
//    evita o risco de conta duplicada: o fluxo de cadastro normal
//    (useAuth.ts -> signUp) sempre INSERE uma nova linha em `pessoas` sem
//    checar se já existe uma por e-mail, então se a gente pré-criasse
//    `pessoas` sem dono, o motorista real criando conta depois geraria
//    uma segunda linha desencontrada da primeira.
//
// 2. Gera um link de "definir senha" (admin.generateLink tipo recovery) e
//    devolve pro agenciador mandar por WhatsApp — não depende de e-mail/SMTP
//    configurado, que é como o negócio já opera hoje (onboarding informal).
//
// 3. NÃO cria veículo nem assinatura. `assinaturas_motorista` exige um
//    veiculo_id (placa/renavam etc.) que uma planilha simples de nome/e-mail
//    não tem — isso fica pro próprio motorista completar depois, no app,
//    igual already existe hoje (Perfil.tsx > Meus veículos).
//
// 4. Se já existe uma pessoa com aquele e-mail, não cria conta nova — só
//    garante o vínculo com este agenciador (idempotente: reimportar a
//    mesma planilha não duplica nada).
//
// 5. Continua com "IA sugere, humano confere": nada aqui é automático demais
//    pra reverter — se a inserção em `pessoas` falhar (CPF duplicado etc.),
//    a conta de auth recém-criada é apagada (rollback) pra não sobrar lixo.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LinhaImportacao {
  nome?: string;
  email?: string;
  celular?: string;
  cpf?: string;
}

interface ResultadoLinha {
  linha: number;
  nome: string;
  email: string;
  sucesso: boolean;
  mensagem: string;
  pessoa_id?: string;
  link_definir_senha?: string;
}

function apenasDigitos(v: string | null | undefined): string | null {
  if (!v) return null;
  const d = v.replace(/\D/g, "");
  return d === "" ? null : d;
}

function gerarSenhaTemporaria(): string {
  // Nunca é usada de fato — a conta só vira acessível via o link de
  // recovery gerado abaixo, mas o Admin API exige alguma senha pra criar
  // o usuário.
  return crypto.randomUUID();
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
    const { linhas } = await req.json();
    if (!Array.isArray(linhas) || linhas.length === 0) {
      return jsonResponse({ sucesso: false, erro: "Nenhuma linha pra importar." }, 400);
    }
    if (linhas.length > 500) {
      return jsonResponse({ sucesso: false, erro: "Máximo de 500 linhas por importação." }, 400);
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

    // Quem está importando precisa ser um agenciador (papel na tabela
    // pessoas) — a importação vincula os motoristas a ELE.
    const { data: agenciadorPessoa, error: agenciadorError } = await supabaseAdmin
      .from("pessoas")
      .select("id, papel")
      .eq("auth_user_id", userData.user.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (agenciadorError || !agenciadorPessoa) {
      return jsonResponse({ sucesso: false, erro: "Perfil não encontrado." }, 404);
    }
    if (agenciadorPessoa.papel !== "agenciador") {
      return jsonResponse(
        { sucesso: false, erro: "Só agenciadores podem importar motoristas." },
        403,
      );
    }
    const agenciadorId = agenciadorPessoa.id as string;

    const resultados: ResultadoLinha[] = [];

    for (let i = 0; i < linhas.length; i++) {
      const linha = i + 1;
      const bruta: LinhaImportacao = linhas[i] ?? {};
      const nome = (bruta.nome ?? "").trim();
      const email = (bruta.email ?? "").trim().toLowerCase();
      const celular = apenasDigitos(bruta.celular);
      const cpf = apenasDigitos(bruta.cpf);

      if (!nome || !email) {
        resultados.push({
          linha,
          nome: nome || "(sem nome)",
          email: email || "(sem e-mail)",
          sucesso: false,
          mensagem: "Nome e e-mail são obrigatórios.",
        });
        continue;
      }
      if (!email.includes("@")) {
        resultados.push({ linha, nome, email, sucesso: false, mensagem: "E-mail inválido." });
        continue;
      }

      try {
        // 1) Já existe uma pessoa com esse e-mail? Se sim, não cria conta
        //    nova — só garante o vínculo (não precisa de CPF pra isso).
        const { data: pessoaExistente } = await supabaseAdmin
          .from("pessoas")
          .select("id")
          .eq("email", email)
          .is("deleted_at", null)
          .maybeSingle();

        let pessoaId: string;
        let linkSenha: string | undefined;
        let criouConta = false;

        if (pessoaExistente) {
          pessoaId = pessoaExistente.id as string;
        } else {
          // pessoas exige CPF pra toda pessoa física (constraint
          // pf_tem_cpf) — só é obrigatório aqui porque estamos criando uma
          // pessoa nova; reimportar alguém que já existe não precisa disso.
          if (!cpf) {
            resultados.push({ linha, nome, email, sucesso: false, mensagem: "CPF é obrigatório." });
            continue;
          }
          if (!/^\d{11}$/.test(cpf)) {
            resultados.push({ linha, nome, email, sucesso: false, mensagem: "CPF precisa ter 11 dígitos." });
            continue;
          }

          // 2) Cria a conta de auth de verdade (evita o risco de duplicar
          //    quando o motorista real se cadastrar depois).
          const { data: novoAuthUser, error: createAuthError } =
            await supabaseAdmin.auth.admin.createUser({
              email,
              password: gerarSenhaTemporaria(),
              email_confirm: true,
            });
          if (createAuthError || !novoAuthUser?.user) {
            resultados.push({
              linha,
              nome,
              email,
              sucesso: false,
              mensagem: `Não consegui criar a conta: ${createAuthError?.message ?? "erro desconhecido"}`,
            });
            continue;
          }
          criouConta = true;
          const authUserId = novoAuthUser.user.id;

          const { data: novaPessoa, error: pessoaError } = await supabaseAdmin
            .from("pessoas")
            .insert({
              auth_user_id: authUserId,
              nome,
              email,
              celular,
              cpf,
              papel: "titular_motorista",
              tipo_pessoa_doc: "PF",
              origem_cadastro: "importacao_csv_agenciador",
            })
            .select("id")
            .single();

          if (pessoaError || !novaPessoa) {
            // Rollback: não deixa conta de auth órfã (ex: CPF já cadastrado
            // em outra pessoa, celular duplicado etc.)
            await supabaseAdmin.auth.admin.deleteUser(authUserId);
            resultados.push({
              linha,
              nome,
              email,
              sucesso: false,
              mensagem: `Dados inválidos, nada foi criado: ${pessoaError?.message ?? "erro desconhecido"}`,
            });
            continue;
          }
          pessoaId = novaPessoa.id as string;

          const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
            type: "recovery",
            email,
          });
          if (!linkError && linkData?.properties?.action_link) {
            linkSenha = linkData.properties.action_link;
          }
        }

        // 3) Garante o vínculo com este agenciador (idempotente).
        const { data: vinculoExistente } = await supabaseAdmin
          .from("vinculos_agenciador_motorista")
          .select("id")
          .eq("agenciador_id", agenciadorId)
          .eq("motorista_id", pessoaId)
          .maybeSingle();

        if (!vinculoExistente) {
          const { error: vinculoError } = await supabaseAdmin
            .from("vinculos_agenciador_motorista")
            .insert({
              agenciador_id: agenciadorId,
              motorista_id: pessoaId,
              status: "confirmado",
            });
          if (vinculoError) {
            resultados.push({
              linha,
              nome,
              email,
              sucesso: false,
              mensagem: `Conta ok, mas não consegui vincular: ${vinculoError.message}`,
              pessoa_id: pessoaId,
            });
            continue;
          }
        }

        resultados.push({
          linha,
          nome,
          email,
          sucesso: true,
          mensagem: pessoaExistente
            ? "Já existia — vínculo confirmado."
            : "Conta criada e vinculada.",
          pessoa_id: pessoaId,
          link_definir_senha: criouConta ? linkSenha : undefined,
        });
      } catch (e) {
        resultados.push({
          linha,
          nome,
          email,
          sucesso: false,
          mensagem: `Erro inesperado: ${String(e)}`,
        });
      }
    }

    const totalSucesso = resultados.filter((r) => r.sucesso).length;
    return jsonResponse({
      sucesso: true,
      total: resultados.length,
      total_sucesso: totalSucesso,
      total_erro: resultados.length - totalSucesso,
      resultados,
    });
  } catch (e) {
    return jsonResponse({ sucesso: false, erro: String(e) }, 500);
  }
});
