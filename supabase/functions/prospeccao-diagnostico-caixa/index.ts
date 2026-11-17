// Edge Function: prospeccao-diagnostico-caixa  (verify_jwt = true; so o usuario do Pedro chama, pelo botao "Testar caixa" do painel)
// PRIMEIRO PASSO DE QUALQUER LIGACAO: descobre, na pratica, o que a Hostinger NAO publicou:
//  - se ela aceita conexao de servidor em NUVEM (este teste roda a partir do Supabase, que e nuvem: se falhar aqui, falharia nos robos);
//  - SMTP (465/587) e IMAP funcionando, IDLE, pastas (LIST), APPEND, flags e mover em pastas de teste (apagadas no fim);
//  - se Message-ID, In-Reply-To, References, List-Unsubscribe e List-Unsubscribe-Post sobrevivem a um envio de teste para a PROPRIA caixa (relido por IMAP);
//  - se o servidor ja guarda sozinho a copia em Enviados (entao o robo nao duplica).
// Sem credencial cadastrada: devolve "credencial nao cadastrada" e NAO tenta nada. A senha nunca sai daqui (nem em resposta, nem em log, nem no resultado gravado).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";
import { Buffer } from "node:buffer";
import { abrirImap, admin, auditar, enviarEmail, lerCaixas, logar, senhaDaCaixa, type Smtp } from "../_shared/prospeccaoEdge.ts";
import { cabecalhosCaixa, descobrirPastas, interpretarDiagnostico, type Diagnostico } from "../_shared/prospeccaoCaixa.ts";
import { novoMessageId } from "../_shared/prospeccaoRegras.ts";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const resp = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
const com = <T>(p: Promise<T>, ms: number, rotulo: string): Promise<T> => Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`tempo esgotado: ${rotulo}`)), ms))]);

async function tcp(host: string, porta: number): Promise<boolean> {
  try { const c = await com(Deno.connect({ hostname: host, port: porta }), 8_000, "conexao"); c.close(); return true; } catch { return false; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resp({ ok: false, erro: "Use POST." }, 405);
  // so o usuario do Pedro (verify_jwt so garante que o JWT e valido, inclusive o da chave anonima)
  const auth = req.headers.get("Authorization") ?? "";
  const usuario = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: ehPedro } = await usuario.rpc("prospeccao_eh_pedro");
  if (ehPedro !== true) return resp({ ok: false, erro: "So o usuario do Pedro roda o diagnostico." }, 403);

  const corpo = await req.json().catch(() => ({}));
  const caixas = await lerCaixas();
  const caixa = caixas.find((c) => c.id === (corpo as { caixa_id?: string }).caixa_id);
  if (!caixa) return resp({ ok: false, erro: "Caixa nao encontrada." }, 404);
  const senha = await senhaDaCaixa(caixa).catch(() => null);
  if (!senha) return resp({ ok: false, erro: "credencial nao cadastrada", resumo: "vermelho", achados: [{ item: "Credencial", cor: "vermelho", explicacao: "A senha desta caixa ainda não foi cadastrada. Cadastre pelo painel (Vault) e rode o teste de novo." }] });
  const limpar = (s: string) => s.split(senha).join("***").slice(0, 200);

  const obs: string[] = ["Este teste roda em servidor de nuvem (Supabase). Não há como saber de antemão se a Hostinger aceita conexões de nuvem; o resultado abaixo é a prova."];
  const d: Diagnostico = { conexao_nuvem_ok: null, smtp_ok: null, imap_ok: null, idle_suportado: null, append_ok: null, flags_ok: null, mover_ok: null, cabecalhos_preservados: null, servidor_guarda_enviados: null, pastas: null };
  let portaSmtp: number | null = null;

  try {
    // 1) nuvem: TCP ate SMTP e IMAP
    const [tcpSmtp, tcpImap] = await Promise.all([tcp(caixa.smtp_host, caixa.smtp_porta), tcp(caixa.imap_host, caixa.imap_porta)]);
    d.conexao_nuvem_ok = tcpSmtp && tcpImap;
    if (!d.conexao_nuvem_ok) obs.push(`Conexão TCP: SMTP ${tcpSmtp ? "ok" : "FALHOU"}, IMAP ${tcpImap ? "ok" : "FALHOU"}.`);

    // 2) SMTP (465 primeiro; 587 so se a 465 falhar)
    for (const porta of caixa.smtp_porta === 465 ? [465, 587] : [caixa.smtp_porta]) {
      try {
        const t = nodemailer.createTransport({ host: caixa.smtp_host, port: porta, secure: porta === 465, requireTLS: porta !== 465, auth: { user: caixa.endereco, pass: senha }, connectionTimeout: 15_000, socketTimeout: 20_000 });
        await t.verify(); t.close();
        d.smtp_ok = true; portaSmtp = porta; break;
      } catch (e) { d.smtp_ok = false; obs.push(`SMTP porta ${porta}: ${limpar(e instanceof Error ? e.message : String(e))}`); }
    }

    // 3) IMAP
    const imap = abrirImap({ host: caixa.imap_host, porta: caixa.imap_porta, usuario: caixa.endereco, senha });
    try {
      await com(imap.connect(), 20_000, "IMAP connect");
      d.imap_ok = true;
      d.idle_suportado = (imap.capabilities as Map<string, unknown>).has("IDLE");
      const lista = await imap.list();
      d.pastas = descobrirPastas(lista.map((l) => ({ path: l.path, specialUse: (l as { specialUse?: string }).specialUse ?? null, flags: [...((l as { flags?: Set<string> }).flags ?? [])] })));

      // 3a) APPEND, flags e mover em pastas de teste (criadas e apagadas aqui)
      const tag = crypto.randomUUID().slice(0, 8);
      const nomeA = `RBR-Diag-${tag}-A`, nomeB = `RBR-Diag-${tag}-B`;
      const criadas: string[] = [];
      try {
        const criar = async (nome: string) => { for (const p of [nome, `INBOX.${nome}`]) { try { await imap.mailboxCreate(p); criadas.push(p); return p; } catch { /* tenta o proximo */ } } throw new Error("nao consegui criar pasta de teste"); };
        const pa = await criar(nomeA), pb = await criar(nomeB);
        const msg = `From: ${caixa.endereco}\r\nTo: ${caixa.endereco}\r\nSubject: diagnostico\r\nMessage-ID: <diag-${tag}@rbrcargo.com.br>\r\nDate: ${new Date().toUTCString()}\r\n\r\nteste`;
        try { await imap.append(pa, Buffer.from(msg), []); d.append_ok = true; } catch (e) { d.append_ok = false; obs.push(`APPEND: ${limpar(e instanceof Error ? e.message : String(e))}`); }
        if (d.append_ok) {
          const lock = await imap.getMailboxLock(pa);
          let uid = 0;
          try {
            const achados = await imap.search({ all: true }, { uid: true });
            uid = (achados as number[])[0] ?? 0;
            if (uid) {
              try { await imap.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true }); const m = await imap.fetchOne(String(uid), { flags: true }, { uid: true }); d.flags_ok = !!(m && (m as { flags?: Set<string> }).flags?.has("\\Seen")); } catch (e) { d.flags_ok = false; obs.push(`Flags: ${limpar(e instanceof Error ? e.message : String(e))}`); }
              try { await imap.messageMove(String(uid), pb, { uid: true }); d.mover_ok = true; } catch (e) { d.mover_ok = false; obs.push(`Mover: ${limpar(e instanceof Error ? e.message : String(e))}`); }
            }
          } finally { lock.release(); }
        }
      } catch (e) { obs.push(`Pastas de teste: ${limpar(e instanceof Error ? e.message : String(e))}`); }
      finally { for (const p of criadas) { try { await imap.mailboxDelete(p); } catch { /* ignora */ } } }

      // 3b) cabecalhos: envia para a PROPRIA caixa e le de volta
      if (d.smtp_ok) {
        const messageId = novoMessageId(`diag-${crypto.randomUUID()}`);
        const raiz = novoMessageId(`diag-raiz-${crypto.randomUUID()}`);
        const cab = cabecalhosCaixa({ messageId, linkDescadastro: "https://gestor.rbrcargo.com.br/descadastro-teste", emResposta: { messageId: raiz, referencias: raiz } });
        const smtp: Smtp = { host: caixa.smtp_host, porta: portaSmtp ?? caixa.smtp_porta, usuario: caixa.endereco, senha, nome: caixa.nome_exibicao, caixaId: caixa.id }; // sem copia manual: queremos ver se o servidor guarda sozinho
        try {
          await enviarEmail(smtp, { para: [caixa.endereco], assunto: "[DIAGNOSTICO] teste de cabecalhos (pode apagar)", texto: "Mensagem de teste do painel de prospeccao. Pode apagar.", messageId, inReplyTo: cab.inReplyTo, references: cab.references, headers: cab.headers }, false);
          const sem = (h: string, n: string) => new RegExp(`^${n}:`, "im").test(h);
          const id = messageId.replace(/[<>]/g, "");
          let achouUid = 0, cabecalhos = "";
          for (let i = 0; i < 9 && !achouUid; i++) {
            await espera(5_000);
            const lock = await imap.getMailboxLock(caixa.pasta_entrada);
            try {
              const r = (await imap.search({ header: { "message-id": id } }, { uid: true })) as number[];
              if (r.length) {
                achouUid = r[0];
                const m = await imap.fetchOne(String(achouUid), { headers: true }, { uid: true });
                cabecalhos = new TextDecoder().decode((m as { headers?: Uint8Array }).headers ?? new Uint8Array()).replace(/\r?\n[ \t]+/g, " ");
                await imap.messageDelete(String(achouUid), { uid: true }); // limpa o teste
              }
            } finally { lock.release(); }
          }
          if (achouUid) {
            d.cabecalhos_preservados = {
              message_id: cabecalhos.toLowerCase().includes(id.toLowerCase()), in_reply_to: sem(cabecalhos, "In-Reply-To"), references: sem(cabecalhos, "References"),
              list_unsubscribe: sem(cabecalhos, "List-Unsubscribe"), list_unsubscribe_post: sem(cabecalhos, "List-Unsubscribe-Post"),
            };
            // o servidor ja guarda a copia em Enviados sozinho?
            const enviados = caixa.pasta_enviados ?? d.pastas.enviados;
            if (enviados) {
              const lock = await imap.getMailboxLock(enviados);
              try {
                const r = (await imap.search({ header: { "message-id": id } }, { uid: true })) as number[];
                d.servidor_guarda_enviados = r.length > 0;
                if (r.length) await imap.messageDelete(String(r[0]), { uid: true });
              } finally { lock.release(); }
            } else obs.push("Pasta Enviados não encontrada: não deu para saber se o servidor guarda a cópia sozinho.");
          } else obs.push("A mensagem de teste não chegou em 45 segundos: não deu para provar os cabeçalhos.");
        } catch (e) { obs.push(`Teste de cabeçalhos: ${limpar(e instanceof Error ? e.message : String(e))}`); }
      }
    } catch (e) {
      d.imap_ok = false;
      obs.push(`IMAP: ${limpar(e instanceof Error ? e.message : String(e))}`);
    } finally { try { await imap.logout(); } catch { /* ignora */ } }
  } catch (e) { obs.push(`Erro inesperado: ${limpar(e instanceof Error ? e.message : String(e))}`); }

  const { resumo, achados } = interpretarDiagnostico(d);
  await admin.from("prospeccao_caixa_diagnostico").insert({
    caixa_id: caixa.id, resumo, conexao_nuvem_ok: d.conexao_nuvem_ok, smtp_ok: d.smtp_ok, smtp_porta_usada: portaSmtp, imap_ok: d.imap_ok, idle_suportado: d.idle_suportado,
    pastas_descobertas: d.pastas, append_ok: d.append_ok, flags_ok: d.flags_ok, mover_ok: d.mover_ok, cabecalhos_preservados: d.cabecalhos_preservados,
    servidor_guarda_enviados: d.servidor_guarda_enviados, observacoes: obs.join("\n").slice(0, 2000),
  });
  const atualiza: Record<string, unknown> = { ultimo_diagnostico_em: new Date().toISOString(), ultimo_diagnostico_resumo: resumo, atualizado_em: new Date().toISOString() };
  if (d.idle_suportado !== null) atualiza.idle_suportado = d.idle_suportado;
  if (d.pastas) { if (!caixa.pasta_enviados && d.pastas.enviados) atualiza.pasta_enviados = d.pastas.enviados; if (!caixa.pasta_spam && d.pastas.spam) atualiza.pasta_spam = d.pastas.spam; if (!caixa.pasta_lixo && d.pastas.lixo) atualiza.pasta_lixo = d.pastas.lixo; }
  if (d.servidor_guarda_enviados !== null) atualiza.guardar_copia_enviados = !d.servidor_guarda_enviados; // ja guarda sozinho = nao duplicar
  if (d.smtp_ok && d.imap_ok) { atualiza.parada_motivo = null; atualiza.parada_em = null; atualiza.recuo_nivel = 0; }
  await admin.from("prospeccao_caixas").update(atualiza).eq("id", caixa.id);
  await auditar("prospeccao_diagnostico_caixa", { caixa: caixa.endereco, resumo });
  await logar("sistema", "diagnostico_caixa", { caixa_id: caixa.id, resultado: resumo });
  return resp({ ok: true, resumo, achados, observacoes: obs });
});
