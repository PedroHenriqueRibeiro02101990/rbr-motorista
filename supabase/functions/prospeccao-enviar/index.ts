// Edge Function: prospeccao-enviar  (verify_jwt = true; so aceita a chave service_role, chamada pelo pg_cron a cada 5 minutos)
// Robo de ENVIO do agente SDR. Envia NO MAXIMO 1 e-mail por rodada, em texto puro, pela caixa pedro@rbrcargo.com.br (SMTP).
// Tudo nasce desligado: sem PROSPECCAO_ENVIO_LIBERADO = "sim" e sem os segredos cadastrados, so registra "desligado" no log e sai.
// Antes de cada envio reconfere TUDO (prospeccaoRegras.motivoDeNaoEnviar). Modo teste: envia so para prospeccao_destinos_teste.
import { admin, autorizado, avaliarParada, enviarEmail, feriados, json, lerFlags, lerSmtp, logar, logarSemRepetir, auditar, pararAutomaticamente, somarDia, type Flags, type Smtp } from "../_shared/prospeccaoEdge.ts";
import {
  cabecalhosEnvio, dentroDaJanelaEnvio, diaDaRampa, escolherProximo, intervaloEntreEnviosMin, limiteDoDia, modeloPendente, motivoDeNaoEnviar, novoMessageId,
  partesSP, preencherModelo, proximoToque, tratarErroEnvio, type Candidato, type PassoJornada,
} from "../_shared/prospeccaoRegras.ts";

type Msg = { id: string; empresa_id: string; contato_id: string; toque: number; assunto: string; corpo: string; status: string; tentativas: number; teste_enviado_em: string | null };
type Emp = { id: string; razao_social: string; nome_fantasia: string | null; classe: "A" | "B" | "C"; segmento: string; cidade: string | null; site: string | null; status: string; repouso_ate: string | null; veiculo_provavel: string | null };
type Con = { id: string; empresa_id: string; nome: string | null; email: string; tipo_email: "generico" | "pessoal"; validacao_status: string };

const SEG_LEGIVEL: Record<string, string> = { alimentos: "alimentos", bebidas: "bebidas", plasticos: "plásticos", metalurgia: "produtos metalúrgicos", maquinas: "máquinas e equipamentos" };
const SEG_FRASE: Record<string, string> = { alimentos: "distribuição de alimentos", bebidas: "distribuição de bebidas", plasticos: "produtos plásticos", metalurgia: "produtos metalúrgicos", maquinas: "máquinas e equipamentos" };
const variaveis = (e: Emp, c: Con) => ({
  segmento_legivel: SEG_LEGIVEL[e.segmento] ?? e.segmento, segmento_frase: SEG_FRASE[e.segmento] ?? e.segmento, cidade: e.cidade ?? "sua região",
  nome: c.nome ?? "", empresa: e.nome_fantasia ?? e.razao_social, veiculo: e.veiculo_provavel ?? "",
});
const dominioDe = (email: string) => email.split("@")[1]?.toLowerCase() ?? "";
const dominioDoSite = (site: string | null) => (site ?? "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];

// Verificacao de e-mail antes do 1o toque: sintaxe + MX. (PROSPECCAO_VERIFICADOR_CHAVE: servico ainda nao definido; sem ele, so sintaxe + MX.)
async function verificarEmail(c: Con): Promise<string> {
  if (c.validacao_status === "verificado" || c.validacao_status === "mx_ok" || c.validacao_status === "catch_all") return c.validacao_status;
  if (c.validacao_status === "invalido" || c.validacao_status === "devolvido") return c.validacao_status;
  let status = "invalido";
  try {
    const mx = await Deno.resolveDns(dominioDe(c.email), "MX");
    status = mx.length > 0 ? "mx_ok" : "invalido";
  } catch { status = "invalido"; }
  await admin.from("prospeccao_contatos").update({ validacao_status: status, validado_em: new Date().toISOString() }).eq("id", c.id);
  return status;
}

// Prepara mensagens: seguimentos vencidos e 1os toques. Com aprovacao obrigatoria nasce "rascunho"; sem ela, "aprovado".
async function preparar(f: Flags, hojeYmd: string, jornada: PassoJornada[], modelos: Map<string, { assunto: string; corpo: string; ativo: boolean }>, agora: Date) {
  const statusNovo = f.aprovacaoObrigatoria ? "rascunho" : "aprovado";
  const criar = async (e: Emp, c: Con, toque: number) => {
    const passo = jornada.find((j) => j.toque === toque);
    const m = passo ? modelos.get(passo.modelo_tipo) : undefined;
    if (!m || modeloPendente(m)) { await logarSemRepetir("enviar", `modelo_inativo_toque${toque}`, "jornada aguardando modelo ativo"); return false; }
    const v = variaveis(e, c);
    const { error } = await admin.from("prospeccao_mensagens").insert({
      empresa_id: e.id, contato_id: c.id, toque, assunto: preencherModelo(m.assunto, v), corpo: preencherModelo(m.corpo, v), status: statusNovo,
      aprovado_em: statusNovo === "aprovado" ? agora.toISOString() : null,
    });
    if (error) { await logar("enviar", "preparar_falhou", { empresa_id: e.id, erro: error.message }); return false; }
    await logar("enviar", `preparado_toque${toque}`, { empresa_id: e.id, resultado: statusNovo });
    return true;
  };

  // (1) seguimentos: ultima mensagem enviada de cada empresa em contato (ou saindo de repouso curto, p.ex. fora do escritorio)
  const { data: emps } = await admin.from("prospeccao_empresas").select("id, razao_social, nome_fantasia, classe, segmento, cidade, site, status, repouso_ate, veiculo_provavel").in("status", ["em_contato", "repouso"]).limit(500);
  for (const e of (emps ?? []) as Emp[]) {
    if (e.status === "repouso") {
      if (!e.repouso_ate || e.repouso_ate > hojeYmd) continue;
      await admin.from("prospeccao_empresas").update({ status: "em_contato", repouso_ate: null }).eq("id", e.id);
    }
    const { data: ult } = await admin.from("prospeccao_mensagens").select("toque, enviado_em, contato_id").eq("empresa_id", e.id).eq("status", "enviado").order("toque", { ascending: false }).limit(1);
    const u = ult?.[0] as { toque: number; enviado_em: string; contato_id: string } | undefined;
    if (!u) continue;
    const prox = proximoToque(u.toque, new Date(u.enviado_em), jornada, agora);
    if (!prox) continue;
    if ("fim" in prox) {
      const ate = new Date(agora.getTime() + 90 * 86_400_000).toISOString().slice(0, 10);
      await admin.from("prospeccao_empresas").update({ status: "repouso", repouso_ate: ate }).eq("id", e.id);
      await logar("enviar", "jornada_concluida", { empresa_id: e.id, resultado: `repouso ate ${ate}` });
      continue;
    }
    if (!prox.vencido) continue;
    const { count } = await admin.from("prospeccao_mensagens").select("id", { count: "exact", head: true }).eq("empresa_id", e.id).eq("contato_id", u.contato_id).eq("toque", prox.toque).neq("status", "descartado");
    if (count) continue;
    const { data: c } = await admin.from("prospeccao_contatos").select("*").eq("id", u.contato_id).maybeSingle();
    if (c) await criar(e, c as Con, prox.toque);
  }

  // (2) 1os toques: empresas A/B novas com contato sem nenhuma mensagem (inclui contato indicado, que nasce em empresa "qualificado")
  const { data: novas } = await admin.from("prospeccao_empresas").select("id, razao_social, nome_fantasia, classe, segmento, cidade, site, status, repouso_ate, veiculo_provavel").in("status", ["novo", "qualificado"]).in("classe", ["A", "B"]).limit(60);
  let criadas = 0;
  for (const e of (novas ?? []) as Emp[]) {
    if (criadas >= 10) break;
    const { data: cs } = await admin.from("prospeccao_contatos").select("*").eq("empresa_id", e.id).in("validacao_status", ["sintaxe_ok", "mx_ok", "verificado", "catch_all"]);
    for (const c of (cs ?? []) as Con[]) {
      const { count } = await admin.from("prospeccao_mensagens").select("id", { count: "exact", head: true }).eq("contato_id", c.id);
      if (count) continue;
      if (await criar(e, c, 1)) {
        criadas++;
        await admin.from("prospeccao_empresas").update({ status: "em_aprovacao" }).eq("id", e.id).in("status", ["novo", "qualificado"]);
      }
      break;
    }
  }
}

Deno.serve(async (req) => {
  if (!autorizado(req)) return json({ ok: false, erro: "Nao autorizado." }, 401);
  const agora = new Date();
  try {
    const f = await lerFlags();
    if (!f.envio) { await logarSemRepetir("enviar", "desligado"); return json({ ok: true, enviado: false, motivo: "desligado" }); }
    const smtp = await lerSmtp();
    if (!smtp) { await logarSemRepetir("enviar", "segredos_ausentes", "cadastre os segredos PROSPECCAO_* no Vault"); return json({ ok: true, enviado: false, motivo: "segredos ausentes" }); }

    const [fer, { data: estadoRaw }, { data: rampa }, { data: jornadaRaw }, { data: modelosRaw }, { data: bloqueios }] = await Promise.all([
      feriados(), admin.from("prospeccao_estado").select("*").eq("id", 1).maybeSingle(),
      admin.from("prospeccao_rampa").select("dia_inicio, limite"), admin.from("prospeccao_jornada").select("toque, atraso_dias, modelo_tipo"),
      admin.from("prospeccao_modelos").select("tipo, assunto, corpo, ativo"), admin.from("prospeccao_bloqueio").select("tipo, valor"),
    ]);
    const estado = estadoRaw as { proximo_envio_apos: string | null; primeiro_envio_em: string | null; parada_motivo: string | null } | null;
    const hojeYmd = partesSP(agora).ymd;
    if (!dentroDaJanelaEnvio(agora, fer)) { await logarSemRepetir("enviar", "fora_da_janela"); return json({ ok: true, enviado: false, motivo: "fora da janela" }); }

    const jornada = (jornadaRaw ?? []) as PassoJornada[];
    const modelos = new Map<string, { assunto: string; corpo: string; ativo: boolean }>((modelosRaw ?? []).map((m: { tipo: string; assunto: string; corpo: string; ativo: boolean }) => [m.tipo, m]));
    await preparar(f, hojeYmd, jornada, modelos, agora);

    // limite do dia (modo teste conta pelo log, para nao sujar os contadores reais)
    let enviadosHoje = 0;
    if (f.modoTeste) {
      const inicio = new Date(`${hojeYmd}T00:00:00-03:00`).toISOString();
      const { count } = await admin.from("prospeccao_log").select("id", { count: "exact", head: true }).eq("robo", "enviar").eq("acao", "enviado_teste").gte("momento", inicio);
      enviadosHoje = count ?? 0;
    } else {
      const { data: d } = await admin.from("prospeccao_envio_diario").select("enviados").eq("data", hojeYmd).maybeSingle();
      enviadosHoje = (d as { enviados: number } | null)?.enviados ?? 0;
    }
    const dia = diaDaRampa(estado?.primeiro_envio_em ?? null, hojeYmd);
    const { limite } = limiteDoDia(f.limiteDiario, (rampa ?? []) as { dia_inicio: number; limite: number }[], dia);
    const proximoApos = estado?.proximo_envio_apos ? new Date(estado.proximo_envio_apos) : null;
    if (enviadosHoje >= limite) { await logarSemRepetir("enviar", "limite_do_dia", `${enviadosHoje}/${limite}`); return json({ ok: true, enviado: false, motivo: "limite do dia" }); }
    if (proximoApos && agora < proximoApos) return json({ ok: true, enviado: false, motivo: "aguardando intervalo" });

    // candidatos: mensagens prontas (aprovadas; sem aprovacao obrigatoria, tambem rascunhos)
    const status = f.aprovacaoObrigatoria ? ["aprovado"] : ["aprovado", "rascunho"];
    let q = admin.from("prospeccao_mensagens").select("id, empresa_id, contato_id, toque, assunto, corpo, status, tentativas, teste_enviado_em").in("status", status).order("toque", { ascending: false }).order("criado_em").limit(60);
    if (f.modoTeste) q = q.is("teste_enviado_em", null);
    const { data: msgsRaw } = await q;
    const msgs = (msgsRaw ?? []) as Msg[];
    if (msgs.length === 0) return json({ ok: true, enviado: false, motivo: "nada para enviar" });
    const [{ data: empsRaw }, { data: consRaw }] = await Promise.all([
      admin.from("prospeccao_empresas").select("id, razao_social, nome_fantasia, classe, segmento, cidade, site, status, repouso_ate, veiculo_provavel").in("id", [...new Set(msgs.map((m) => m.empresa_id))]),
      admin.from("prospeccao_contatos").select("*").in("id", [...new Set(msgs.map((m) => m.contato_id))]),
    ]);
    const emps = new Map<string, Emp>((empsRaw ?? []).map((e: Emp) => [e.id, e]));
    const cons = new Map<string, Con>((consRaw ?? []).map((c: Con) => [c.id, c]));
    const { data: dDia } = await admin.from("prospeccao_envio_diario").select("devolvidos").eq("data", hojeYmd).maybeSingle();
    const devolvidosHoje = (dDia as { devolvidos: number } | null)?.devolvidos ?? 0;

    // verifica e-mail (MX) dos primeiros contatos ainda nao validados, antes de escolher
    for (const m of msgs.slice(0, 8)) { const c = cons.get(m.contato_id); if (c && (c.validacao_status === "sintaxe_ok" || c.validacao_status === "pendente")) c.validacao_status = await verificarEmail(c); }

    const cands: (Candidato & { msg: Msg })[] = msgs.flatMap((m) => {
      const e = emps.get(m.empresa_id), c = cons.get(m.contato_id);
      if (!e || !c) return [];
      return [{ id: m.id, msg: m, toque: m.toque, classe: e.classe, tipoEmail: c.tipo_email, validacao: c.validacao_status,
        dominioBateComSite: !!dominioDoSite(e.site) && dominioDe(c.email).endsWith(dominioDoSite(e.site)), seguimentoVencido: m.toque > 1 }];
    });

    let restantes = [...cands];
    for (let tentativa = 0; tentativa < 5; tentativa++) {
      const esc = escolherProximo(restantes, devolvidosHoje);
      if (!esc) break;
      restantes = restantes.filter((c) => c.id !== esc.id);
      const m = (esc as Candidato & { msg: Msg }).msg, e = emps.get(m.empresa_id)!, c = cons.get(m.contato_id)!;
      // resposta DESTE contato (um contato indicado por "nao_sou_eu" nasce na mesma empresa e nao herda a resposta do colega)
      const { count: respostas } = await admin.from("prospeccao_respostas").select("id", { count: "exact", head: true }).eq("empresa_id", e.id).ilike("de_email", c.email);
      const motivo = motivoDeNaoEnviar({
        envioLiberado: f.envio, aprovacaoObrigatoria: f.aprovacaoObrigatoria, mensagemStatus: m.status, contatoEmail: c.email, contatoValidacao: c.validacao_status,
        empresaStatus: e.status === "em_aprovacao" ? "em_contato" : e.status, empresaRepousoAte: e.repouso_ate, hojeYmd, jaRespondeuOuDevolveu: (respostas ?? 0) > 0,
        enviadosHoje, limiteHoje: limite, agora, feriados: fer, bloqueios: (bloqueios ?? []) as { tipo: string; valor: string }[], paradaAtiva: false, proximoEnvioApos: proximoApos,
      });
      if (motivo) {
        // problema desta mensagem (nao do momento): descarta e tenta a proxima
        await admin.from("prospeccao_mensagens").update({ status: "descartado", erro: motivo }).eq("id", m.id);
        await logar("enviar", "descartada_na_reconferencia", { empresa_id: e.id, resultado: motivo });
        continue;
      }

      // monta cabecalhos (seguimento aponta para o 1o toque)
      let primeiro: { message_id: string | null; assunto: string } | null = null;
      if (m.toque > 1) {
        const { data: p } = await admin.from("prospeccao_mensagens").select("message_id, assunto").eq("empresa_id", e.id).eq("contato_id", c.id).eq("toque", 1).eq("status", "enviado").maybeSingle();
        primeiro = (p as { message_id: string | null; assunto: string } | null) ?? null;
      }
      const messageId = novoMessageId(crypto.randomUUID());
      const cab = cabecalhosEnvio({ messageId, assunto: m.assunto, toque: m.toque, assuntoOriginal: primeiro?.assunto, messageIdPrimeiroToque: primeiro?.message_id ?? undefined });
      if (f.aprovacaoObrigatoria === false && m.status === "rascunho") await admin.from("prospeccao_mensagens").update({ status: "aprovado", aprovado_em: agora.toISOString() }).eq("id", m.id);

      try {
        const r = await enviarEmail(smtp, { para: [c.email], assunto: cab.subject, texto: m.corpo, messageId: cab.messageId, inReplyTo: cab.inReplyTo, references: cab.references, headers: cab.headers }, f.modoTeste);
        const espera = intervaloEntreEnviosMin(Math.random());
        const proximo = new Date(agora.getTime() + espera * 60_000).toISOString();
        if (f.modoTeste) {
          await admin.from("prospeccao_mensagens").update({ teste_enviado_em: agora.toISOString() }).eq("id", m.id);
          await logar("enviar", "enviado_teste", { empresa_id: e.id, resultado: `toque ${m.toque} para ${r.destinos.length} destino(s) de teste` });
        } else {
          await admin.from("prospeccao_mensagens").update({ status: "enviado", enviado_em: agora.toISOString(), message_id: messageId, erro: null }).eq("id", m.id);
          await admin.from("prospeccao_empresas").update({ status: "em_contato" }).eq("id", e.id).in("status", ["novo", "qualificado", "em_aprovacao"]);
          if (!estado?.primeiro_envio_em) await admin.from("prospeccao_estado").update({ primeiro_envio_em: hojeYmd }).eq("id", 1);
          await somarDia(hojeYmd, "enviados");
          await auditar("prospeccao_envio", { mensagem_id: m.id, empresa_id: e.id, toque: m.toque });
          await logar("enviar", "enviado", { empresa_id: e.id, resultado: `toque ${m.toque}` });
        }
        await admin.from("prospeccao_estado").update({ proximo_envio_apos: proximo, atualizado_em: agora.toISOString() }).eq("id", 1);
        const parada = await avaliarParada(hojeYmd, smtp, f.modoTeste);
        return json({ ok: true, enviado: true, teste: f.modoTeste, proximoEm: proximo, parada });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const codigo = (err as { responseCode?: number }).responseCode ?? null;
        const destino = tratarErroEnvio(codigo, msg, m.tentativas);
        if (destino === "parada_automatica") {
          await admin.from("prospeccao_mensagens").update({ erro: msg.slice(0, 300) }).eq("id", m.id);
          await pararAutomaticamente(`erro de SMTP de bloqueio/limite: ${msg.slice(0, 120)}`, smtp, f.modoTeste);
          return json({ ok: false, enviado: false, motivo: "parada automatica" });
        }
        if (destino === "tentar_de_novo") await admin.from("prospeccao_mensagens").update({ tentativas: m.tentativas + 1, erro: msg.slice(0, 300) }).eq("id", m.id);
        else await admin.from("prospeccao_mensagens").update({ status: "falhou", erro: msg.slice(0, 300) }).eq("id", m.id);
        await logar("enviar", destino === "tentar_de_novo" ? "falha_temporaria" : "falhou", { empresa_id: e.id, erro: msg });
        return json({ ok: false, enviado: false, motivo: destino });
      }
    }
    return json({ ok: true, enviado: false, motivo: "nenhum candidato elegivel" });
  } catch (e) {
    await logar("enviar", "erro_inesperado", { erro: e instanceof Error ? e.message : String(e) });
    return json({ ok: false, erro: "Erro inesperado (veja o log)." }, 500);
  }
});
