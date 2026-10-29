// Edge Function: conta-publica  (verify_jwt = false — usada na tela de login/cadastro)
//
// Ações:
//  - verificar_documento { documento }            → CPF/CNPJ válido? já tem cadastro? (e-mail mascarado)
//  - recuperar_senha { documento? , email?, redirect_to } → manda o link de nova senha pro e-mail da conta
//
// Regras:
//  - 1 CPF/CNPJ = 1 conta. Se já existe, o app bloqueia o cadastro e oferece "recuperar senha".
//  - Nunca devolve o e-mail inteiro nem o nome (evita descobrir dados de outra pessoa).
//  - Cadastro feito pela RBR (sem login ainda): cria o login com o e-mail que a RBR cadastrou
//    e manda o link pra esse e-mail — só quem tem acesso a ele consegue entrar.
//  - Limite de tentativas por IP e por documento (tabela tentativas_acesso_publico).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function soAlnum(v: unknown): string {
  return String(v ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
}

function cpfValido(d: string): boolean {
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

function cnpjValido(d: string): boolean {
  if (!/^[0-9A-Z]{12}\d{2}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false;
  const v = (c: string) => c.charCodeAt(0) - 48;
  const calc = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let s = 0;
    for (let i = 0; i < n; i++) s += v(d[i]) * pesos[i];
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

function mascararEmail(email: string | null | undefined): string | null {
  if (!email || !email.includes("@")) return null;
  const [u, dom] = email.split("@");
  const partes = dom.split(".");
  const d0 = partes[0] ?? "";
  return `${u.slice(0, 1)}${"•".repeat(Math.max(2, Math.min(6, u.length - 1)))}@${d0.slice(0, 1)}${"•".repeat(Math.max(2, Math.min(6, d0.length - 1)))}.${partes.slice(1).join(".")}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

  try {
    const body = await req.json().catch(() => ({}));
    const acao = String(body.acao ?? "");
    // IP real: o cabeçalho do proxy vem antes do que o cliente poderia forjar no x-forwarded-for.
    const xff = (req.headers.get("x-forwarded-for") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? xff[xff.length - 1] ?? "desconhecido";

    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const anon = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!);

    // Limite: n tentativas por chave na última hora.
    const excedeu = async (chave: string, a: string, limite: number) => {
      const desde = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count } = await admin
        .from("tentativas_acesso_publico")
        .select("id", { count: "exact", head: true })
        .eq("chave", chave)
        .eq("acao", a)
        .gte("criado_em", desde);
      if ((count ?? 0) >= limite) return true;
      await admin.from("tentativas_acesso_publico").insert({ chave, acao: a });
      return false;
    };
    const muitas = () =>
      json({ ok: false, motivo: "limite", mensagem: "Muitas tentativas. Aguarde alguns minutos e tente de novo." }, 429);

    if (acao === "verificar_documento") {
      if (await excedeu(`ip:${ip}`, "verificar", 40)) return muitas();
      const doc = soAlnum(body.documento);
      const tipo = doc.length === 11 ? "PF" : doc.length === 14 ? "PJ" : null;
      const valido = tipo === "PF" ? cpfValido(doc) : tipo === "PJ" ? cnpjValido(doc) : false;
      if (!valido) return json({ ok: true, valido: false, tipo });
      const { data } = await admin.rpc("pessoa_por_documento", { p_doc: doc });
      const p = Array.isArray(data) ? data[0] : null;
      if (!p) return json({ ok: true, valido: true, tipo, existe: false });
      const encerrado = p.status === "excluido" || p.status === "anonimizado_retencao_fiscal";
      return json({
        ok: true,
        valido: true,
        tipo,
        existe: true,
        encerrado,
        email_mascarado: encerrado ? null : mascararEmail(p.email),
        pode_recuperar: !encerrado && !!p.email,
      });
    }

    if (acao === "recuperar_senha") {
      if (await excedeu(`ip:${ip}`, "recuperar", 10)) return muitas();
      const redirectTo = typeof body.redirect_to === "string" && /^https?:\/\//.test(body.redirect_to) ? body.redirect_to : undefined;
      const doc = soAlnum(body.documento);
      let email: string | null = null;

      if (doc) {
        if (await excedeu(`doc:${doc}`, "recuperar", 3)) return muitas();
        const { data } = await admin.rpc("pessoa_por_documento", { p_doc: doc });
        const p = Array.isArray(data) ? data[0] : null;
        // Resposta igual quando não existe — não confirma cadastro de ninguém.
        if (!p) return json({ ok: true, email_mascarado: null });
        if (p.status === "excluido" || p.status === "anonimizado_retencao_fiscal") {
          return json({ ok: false, motivo: "encerrado", mensagem: "Este cadastro foi encerrado. Fale com a RBR." });
        }
        if (!p.email) {
          return json({ ok: false, motivo: "sem_email", mensagem: "Seu cadastro não tem e-mail. Fale com a RBR pelo WhatsApp para receber o acesso." });
        }
        email = p.email;
        const { data: pb } = await admin.from("pessoas").select("acesso_bloqueado").eq("id", p.id).maybeSingle();
        if (pb?.acesso_bloqueado) {
          return json({ ok: false, motivo: "bloqueado", mensagem: "O acesso desta conta está bloqueado. Fale com a RBR." });
        }
        // Cadastro feito pela RBR, ainda sem login: cria o login no e-mail cadastrado.
        if (!p.auth_user_id) {
          let authId: string | null = null;
          const { data: criado, error: errCriar } = await admin.auth.admin.createUser({
            email: p.email,
            email_confirm: true,
            password: crypto.randomUUID() + "Aa1!",
          });
          if (criado?.user) authId = criado.user.id;
          else {
            const { data: existente } = await admin.rpc("auth_user_id_por_email", { p_email: p.email });
            authId = (existente as string | null) ?? null;
            if (!authId) return json({ ok: false, motivo: "erro", mensagem: errCriar?.message ?? "Não foi possível criar o acesso." }, 500);
            // Login já existia com esse e-mail (pode ter sido criado por outra pessoa): troca a senha por uma aleatória
            // e derruba as sessões — só quem abrir o link no e-mail consegue entrar.
            await admin.auth.admin.updateUserById(authId, { password: crypto.randomUUID() + "Aa1!" });
            await admin.rpc("revogar_sessoes_usuario", { p_uid: authId });
          }
          const { data: jaUsado } = await admin.from("pessoas").select("id").eq("auth_user_id", authId).maybeSingle();
          if (jaUsado && jaUsado.id !== p.id) {
            return json({ ok: false, motivo: "conflito", mensagem: "Este e-mail já está em outra conta. Fale com a RBR." });
          }
          const { error: errLink } = await admin.from("pessoas").update({ auth_user_id: authId }).eq("id", p.id);
          if (errLink) return json({ ok: false, motivo: "erro", mensagem: errLink.message }, 500);
        }
      } else if (typeof body.email === "string" && body.email.includes("@")) {
        email = body.email.trim().toLowerCase();
        if (await excedeu(`email:${email}`, "recuperar", 3)) return muitas();
      } else {
        return json({ ok: false, motivo: "dados", mensagem: "Informe o CPF/CNPJ ou o e-mail." }, 400);
      }

      const { error } = await anon.auth.resetPasswordForEmail(email!, redirectTo ? { redirectTo } : undefined);
      if (error && !/rate|limit/i.test(error.message)) {
        return json({ ok: false, motivo: "erro", mensagem: "Não foi possível enviar o e-mail agora. Tente de novo em instantes." }, 502);
      }
      if (error) return muitas();
      return json({ ok: true, email_mascarado: mascararEmail(email) });
    }

    return json({ ok: false, mensagem: "Ação inválida." }, 400);
  } catch (e) {
    return json({ ok: false, mensagem: String(e) }, 500);
  }
});
