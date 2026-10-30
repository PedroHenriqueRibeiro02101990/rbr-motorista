// Edge Function: proposta-publica  (E04/E05/E06 · link público de aceite)
//
// Ações (corpo JSON):
//  - ver     { codigo }                 → dados mínimos da proposta (origem, destino, valor, validade). Conta a abertura.
//  - aceitar { codigo, nome, cargo }    → grava o aceite (nome, cargo, data, IP) e avisa os gestores. Só uma vez.
//
// Segurança:
//  - O cliente não tem login: o acesso é só pelo código (32 hex, aleatório). Código fora do formato nem consulta o banco.
//  - Resposta igual para código inexistente: "link inválido" (não deixa descobrir quais códigos existem).
//  - Devolve só origem, destino, valor total, validade e o estado do aceite. Nunca CNPJ, margem, custos nem dados de motorista.
//  - Limite de tentativas por IP (tabela tentativas_acesso_publico).
//  - Usa a chave de serviço só dentro da função; ela nunca vai para o navegador.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { codigoValido, ipDaRequisicao, situacaoDoLink, validarAceite } from "./regras.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  if (req.method !== "POST") return json({ ok: false, erro: "Use POST." }, 405);

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const acao = String(body.acao ?? "");
    const ip = ipDaRequisicao(req.headers.get("x-forwarded-for"));
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

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
    const invalido = () => json({ ok: false, motivo: "invalido", mensagem: "Este link não é válido. Peça um novo à RBR Cargo." }, 404);

    if (acao !== "ver" && acao !== "aceitar") return json({ ok: false, erro: "Ação desconhecida." }, 400);
    if (await excedeu(`ip:${ip}`, "proposta", 60)) {
      return json({ ok: false, motivo: "limite", mensagem: "Muitas tentativas. Aguarde alguns minutos e tente de novo." }, 429);
    }
    if (!codigoValido(body.codigo)) return invalido();

    const { data: prop } = await admin
      .from("propostas_publicas")
      .select("id, codigo, cotacao_id, expira_em, perdida_em, aceita_em, aceite_nome, aberturas")
      .eq("codigo", body.codigo)
      .maybeSingle();
    if (!prop) return invalido();

    const situacao = situacaoDoLink(prop, Date.now());

    if (acao === "ver") {
      await admin.from("propostas_publicas").update({ aberturas: (prop.aberturas ?? 0) + 1 }).eq("id", prop.id);
      if (situacao === "expirado" || situacao === "perdido") {
        return json({ ok: false, motivo: situacao, mensagem: "Esta proposta não está mais disponível. Fale com a RBR Cargo." }, 410);
      }
      const { data: c } = await admin.from("cotacoes").select("cidade_origem, cidade_destino, valor_total, tipo_carga").eq("id", prop.cotacao_id).maybeSingle();
      if (!c) return invalido();
      return json({
        ok: true,
        situacao,
        proposta: { origem: c.cidade_origem, destino: c.cidade_destino, carga: c.tipo_carga, valor_total: c.valor_total, valido_ate: prop.expira_em },
        aceite: situacao === "aceito" ? { nome: prop.aceite_nome, em: prop.aceita_em } : null,
      });
    }

    // aceitar
    if (situacao !== "valido") {
      return json({ ok: false, motivo: situacao, mensagem: situacao === "aceito" ? "Esta proposta já foi aceita." : "Esta proposta não está mais disponível." }, 409);
    }
    const v = validarAceite(body.nome, body.cargo);
    if (!v.ok) return json({ ok: false, motivo: "dados", mensagem: v.erro }, 400);

    // Só grava se ainda estiver sem aceite (protege contra dois cliques ao mesmo tempo).
    const { data: gravou } = await admin
      .from("propostas_publicas")
      .update({ aceita_em: new Date().toISOString(), aceite_nome: v.nome, aceite_cargo: v.cargo, aceite_ip: ip })
      .eq("id", prop.id)
      .is("aceita_em", null)
      .select("id");
    if (!gravou || gravou.length === 0) return json({ ok: false, motivo: "aceito", mensagem: "Esta proposta já foi aceita." }, 409);

    // Avisa os gestores no sino (notificacoes).
    const { data: gestores } = await admin.from("pessoas").select("id").eq("papel", "gestor_rbr");
    if (gestores && gestores.length > 0) {
      await admin.from("notificacoes").insert(
        gestores.map((g: { id: string }) => ({
          pessoa_id: g.id,
          tipo: "proposta_aceita",
          referencia_id: prop.cotacao_id,
          canal: "push",
          status_entrega: "pendente",
          conteudo: `Proposta aceita por ${v.nome} (${v.cargo}).`,
        })),
      );
    }
    return json({ ok: true, aceito: true });
  } catch (e) {
    console.error("proposta-publica:", e instanceof Error ? e.message : "erro");
    return json({ ok: false, erro: "Não foi possível concluir agora. Tente de novo em instantes." }, 500);
  }
});
