// Edge Function: acesso-app  (verify_jwt = true)
//
// Acesso de motoristas, condutores e agenciadores ao app:
//  - link_acesso { pessoa_id, redirect_to }  → cria o login (se ainda não existe) e gera um link de
//        "definir senha" pra mandar no WhatsApp. Gestor pra qualquer um; titular só pros próprios condutores.
//  - bloquear { pessoa_id, motivo } / desbloquear { pessoa_id }   (só gestor)
//  - executar_exclusao { solicitacao_id }   (só gestor) → pedido LGPD: apaga/anonimiza no banco,
//        remove as fotos do Storage e apaga o login.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: u } = await asUser.auth.getUser();
    if (!u?.user) return json({ ok: false, erro: "Não autenticado." }, 401);
    const { data: ator } = await admin.from("pessoas").select("id, papel").eq("auth_user_id", u.user.id).maybeSingle();
    if (!ator) return json({ ok: false, erro: "Cadastro não encontrado." }, 403);
    const ehGestor = ator.papel === "gestor_rbr";

    const body = await req.json().catch(() => ({}));
    const acao = String(body.acao ?? "");

    const log = (acaoLog: string, entidade: string, id: string, depois: unknown) =>
      admin.from("auditoria_log").insert({
        pessoa_id_ator: ator.id,
        papel: ator.papel,
        acao: acaoLog,
        entidade,
        entidade_id: id,
        dado_depois: depois,
      });

    if (acao === "link_acesso") {
      const { data: p } = await admin
        .from("pessoas")
        .select("id, nome, email, celular, papel, titular_id, auth_user_id, status, acesso_bloqueado")
        .eq("id", body.pessoa_id)
        .maybeSingle();
      if (!p) return json({ ok: false, erro: "Cadastro não encontrado." }, 404);
      const ehSeuCondutor = p.papel === "condutor" && p.titular_id === ator.id;
      if (!ehGestor && !ehSeuCondutor) return json({ ok: false, erro: "Sem permissão." }, 403);
      if (!["titular_motorista", "condutor", "agenciador"].includes(p.papel)) {
        return json({ ok: false, erro: "Acesso por link só para motorista, condutor ou agenciador." }, 400);
      }
      if (p.status !== "ativo") return json({ ok: false, erro: "Cadastro inativo ou encerrado." }, 400);
      if (p.acesso_bloqueado) return json({ ok: false, erro: "Acesso bloqueado. Desbloqueie antes de gerar o link." }, 400);

      let authId = p.auth_user_id as string | null;
      let email = p.email as string | null;
      if (authId) {
        const { data: au } = await admin.auth.admin.getUserById(authId);
        email = au?.user?.email ?? email;
      } else {
        if (!email) return json({ ok: false, erro: "Cadastre um e-mail antes de enviar o acesso." }, 400);
        const { data: criado, error: errCriar } = await admin.auth.admin.createUser({
          email,
          email_confirm: true,
          password: crypto.randomUUID() + "Aa1!",
        });
        if (criado?.user) authId = criado.user.id;
        else {
          const { data: existente } = await admin.rpc("auth_user_id_por_email", { p_email: email });
          authId = (existente as string | null) ?? null;
          if (!authId) return json({ ok: false, erro: errCriar?.message ?? "Não foi possível criar o login." }, 500);
          const { data: jaUsado } = await admin.from("pessoas").select("id").eq("auth_user_id", authId).maybeSingle();
          if (jaUsado && jaUsado.id !== p.id) return json({ ok: false, erro: "Este e-mail já é login de outro cadastro." }, 409);
          // Login já existia (pode ter sido criado por outra pessoa): senha aleatória e sessões derrubadas.
          await admin.auth.admin.updateUserById(authId, { password: crypto.randomUUID() + "Aa1!" });
          await admin.rpc("revogar_sessoes_usuario", { p_uid: authId });
        }
        const { error: errLink } = await admin.from("pessoas").update({ auth_user_id: authId }).eq("id", p.id);
        if (errLink) return json({ ok: false, erro: errLink.message }, 500);
      }

      const redirectTo = typeof body.redirect_to === "string" && /^https?:\/\//.test(body.redirect_to) ? body.redirect_to : undefined;
      const { data: link, error: errGen } = await admin.auth.admin.generateLink({
        type: "recovery",
        email: email!,
        options: redirectTo ? { redirectTo } : undefined,
      });
      if (errGen || !link?.properties?.action_link) return json({ ok: false, erro: errGen?.message ?? "Falha ao gerar o link." }, 500);
      await log("acesso_link_gerado", "pessoas", p.id, { por: ehGestor ? "gestor" : "titular" });
      return json({ ok: true, link: link.properties.action_link, email, celular: p.celular, nome: p.nome });
    }

    if (acao === "bloquear" || acao === "desbloquear") {
      if (!ehGestor) return json({ ok: false, erro: "Apenas gestor RBR." }, 403);
      const { data: p } = await admin.from("pessoas").select("id, papel, auth_user_id").eq("id", body.pessoa_id).maybeSingle();
      if (!p) return json({ ok: false, erro: "Cadastro não encontrado." }, 404);
      if (p.papel === "gestor_rbr") return json({ ok: false, erro: "Acesso de gestor não é bloqueado por aqui." }, 400);
      const bloquear = acao === "bloquear";
      if (bloquear && !String(body.motivo ?? "").trim()) return json({ ok: false, erro: "Informe o motivo do bloqueio." }, 400);
      if (p.auth_user_id) {
        const { error } = await admin.auth.admin.updateUserById(p.auth_user_id, { ban_duration: bloquear ? "876000h" : "none" });
        if (error) return json({ ok: false, erro: error.message }, 500);
      }
      const { error: errUp } = await admin.from("pessoas").update({ acesso_bloqueado: bloquear }).eq("id", p.id);
      if (errUp) return json({ ok: false, erro: errUp.message }, 500);
      await log(bloquear ? "acesso_bloqueado" : "acesso_desbloqueado", "pessoas", p.id, { motivo: body.motivo ?? null });
      return json({ ok: true });
    }

    if (acao === "executar_exclusao") {
      if (!ehGestor) return json({ ok: false, erro: "Apenas gestor RBR." }, 403);
      const { data: r, error } = await admin.rpc("lgpd_executar_exclusao", {
        p_solicitacao: body.solicitacao_id,
        p_executor: ator.id,
      });
      if (error) return json({ ok: false, erro: error.message }, 400);
      const res = r as { modo: string; pessoa_id: string; auth_user_id: string | null; arquivos: string[]; retido_ate: string | null };
      const avisos: string[] = [];
      // Tudo o que estiver na pasta da pessoa (inclusive fotos lidas e não salvas) + as registradas.
      const arquivos = new Set((res.arquivos ?? []).filter(Boolean));
      const { data: pasta } = await admin.storage.from("documentos-pessoais").list(`pessoa/${res.pessoa_id}`, { limit: 1000 });
      for (const f of pasta ?? []) if (f.name) arquivos.add(`pessoa/${res.pessoa_id}/${f.name}`);
      if (arquivos.size) {
        const lista = Array.from(arquivos);
        const { error: errRm } = await admin.storage.from("documentos-pessoais").remove(lista);
        if (errRm) avisos.push(`Fotos: ${errRm.message}`);
        await admin.from("documento_extracoes").delete().in("path", lista);
      }
      if (res.auth_user_id) {
        const { error: errDel } = await admin.auth.admin.deleteUser(res.auth_user_id);
        if (errDel) avisos.push(`Login: ${errDel.message}`);
      }
      const { data: s } = await admin.from("solicitacoes_exclusao_dados").select("resposta_texto").eq("id", body.solicitacao_id).maybeSingle();
      return json({ ok: true, modo: res.modo, retido_ate: res.retido_ate, resposta: s?.resposta_texto ?? null, avisos });
    }

    return json({ ok: false, erro: "Ação inválida." }, 400);
  } catch (e) {
    return json({ ok: false, erro: String(e) }, 500);
  }
});
