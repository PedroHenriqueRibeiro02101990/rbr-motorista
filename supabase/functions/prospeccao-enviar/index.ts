// Edge Function: prospeccao-enviar  (verify_jwt = true; so aceita a chave service_role, chamada pelo pg_cron a cada 5 minutos)
// Robo de ENVIO do agente SDR. Envia NO MAXIMO 1 toque frio por rodada (mais ate 3 respostas aprovadas na tela), em texto puro, por UMA das caixas ativas.
// Tudo nasce desligado: sem PROSPECCAO_ENVIO_LIBERADO = "sim" e sem a senha de alguma caixa no Vault, so registra "desligado" no log e sai.
// Antes de cada envio reconfere TUDO (prospeccaoRegras.motivoDeNaoEnviar). Modo teste: envia so para prospeccao_destinos_teste.
// Defesas por causa do que a Hostinger NAO publica: 1 conexao SMTP por envio, intervalo minimo por caixa, recuo exponencial em 4xx/rate,
// parada da caixa em erro de autenticacao, message_id reservado antes do SMTP (nunca reenvia), copia em Enviados descoberta por LIST.
import {
  admin, alertarInterno, autorizado, avaliarParada, bloquearSoEmail, caixasComCredencial, enviarEmail, feriados, json, lerCaixas, lerFlags, logar, logarSemRepetir, auditar,
  pararAutomaticamente, registrarSaida, smtpDaCaixa, smtpParaAlertas, somarDia, type CaixaRow, type Flags,
} from "../_shared/prospeccaoEdge.ts";
import {
  cabecalhosEnvio, certezaDeNaoEnviado, dentroDaJanelaEnvio, emailBloqueado, erroDeDestinatario, escolherProximo, modeloPendente, motivoDeNaoEnviar, novoMessageId,
  partesSP, preencherModelo, proximoToque, statusPorMx, TETO_ABSOLUTO_DIA, type Candidato, type PassoJornada, type ResultadoMx,
} from "../_shared/prospeccaoRegras.ts";
import {
  acaoParaErroSmtp, cabecalhosCaixa, escolherCaixa, intervaloDaCaixaSeg, limiteDaCaixa, proximoNivelRecuo, recuoSegundos,
} from "../_shared/prospeccaoCaixa.ts";

type Msg = { id: string; empresa_id: string; contato_id: string; toque: number; assunto: string; corpo: string; status: string; tentativas: number; teste_enviado_em: string | null };
type Emp = { id: string; razao_social: string; nome_fantasia: string | null; classe: "A" | "B" | "C"; segmento: string; cidade: string | null; site: string | null; status: string; repouso_ate: string | null; veiculo_provavel: string | null };
type Con = { id: string; empresa_id: string; nome: string | null; email: string; tipo_email: "generico" | "pessoal"; validacao_status: string };
type EmailSaidaRow = { id: string; conversa_id: string; caixa_id: string; para: string; cc: string | null; assunto: string; corpo_texto: string | null; in_reply_to: string | null; referencias: string | null };

const SEG_LEGIVEL: Record<string, string> = { alimentos: "alimentos", bebidas: "bebidas", plasticos: "plásticos", metalurgia: "produtos metalúrgicos", maquinas: "máquinas e equipamentos" };
const SEG_FRASE: Record<string, string> = { alimentos: "distribuição de alimentos", bebidas: "distribuição de bebidas", plasticos: "produtos plásticos", metalurgia: "produtos metalúrgicos", maquinas: "máquinas e equipamentos" };
const variaveis = (e: Emp, c: Con) => ({
  segmento_legivel: SEG_LEGIVEL[e.segmento] ?? e.segmento, segmento_frase: SEG_FRASE[e.segmento] ?? e.segmento, cidade: e.cidade ?? "sua região",
  nome: c.nome ?? "", empresa: e.nome_fantasia ?? e.razao_social, veiculo: e.veiculo_provavel ?? "",
});
const dominioDe = (email: string) => email.split("@")[1]?.toLowerCase() ?? "";
const dominioDoSite = (site: string | null) => (site ?? "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
const enderecos = (s: string | null) => (s ?? "").split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));

// Verificacao de e-mail antes do 1o toque: sintaxe + MX. (PROSPECCAO_VERIFICADOR_CHAVE: servico ainda nao definido; sem ele, so sintaxe + MX.)
// So marca "invalido" quando o dominio claramente nao existe/sem MX. Erro transitorio (timeout, SERVFAIL, resolveDns indisponivel) = null:
// o contato NAO e alterado, o log diz "dns_indisponivel" e o candidato e pulado nesta rodada.
async function verificarEmail(c: Con): Promise<string | null> {
  if (c.validacao_status === "verificado" || c.validacao_status === "mx_ok" || c.validacao_status === "catch_all") return c.validacao_status;
  if (c.validacao_status === "invalido" || c.validacao_status === "devolvido") return c.validacao_status;
  let r: ResultadoMx;
  try {
    const mx = await Deno.resolveDns(dominioDe(c.email), "MX");
    r = { ok: true, registros: mx.length };
  } catch (e) { r = { ok: false, nome: e instanceof Error ? e.name : "", mensagem: e instanceof Error ? e.message : String(e) }; }
  const status = statusPorMx(r);
  if (!status) { await logarSemRepetir("enviar", "dns_indisponivel", "consulta MX falhou de forma transitoria; contatos nao foram alterados"); return null; }
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
  const { data: novas } = await admin.from("prospeccao_empresas").select("id, razao_social, nome_fantasia, classe, segmento, cidade, site, status, repouso_ate, veiculo_provavel").in("status", ["novo", "qualificado"]).in("classe", ["A", "B"]).order("pontuacao", { ascending: false }).limit(60);
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

/** Envios de hoje por caixa (modo teste conta pelo log, para nao sujar os contadores reais). */
async function enviadosPorCaixaHoje(hojeYmd: string, modoTeste: boolean): Promise<Record<string, number>> {
  const inicio = new Date(`${hojeYmd}T00:00:00-03:00`).toISOString();
  const out: Record<string, number> = {};
  const linhas = modoTeste
    ? (await admin.from("prospeccao_log").select("caixa_id").eq("robo", "enviar").eq("acao", "enviado_teste").gte("momento", inicio).limit(2000)).data
    : (await admin.from("prospeccao_mensagens").select("caixa_id").eq("status", "enviado").gte("enviado_em", inicio).limit(2000)).data;
  for (const l of (linhas ?? []) as { caixa_id: string | null }[]) { const k = l.caixa_id ?? "sem_caixa"; out[k] = (out[k] ?? 0) + 1; }
  return out;
}

/** Efeitos NA CAIXA de um erro de SMTP: parar por autenticacao, recuar. (A mensagem e tratada por quem chamou.) */
async function efeitoNaCaixa(caixa: CaixaRow, acao: ReturnType<typeof acaoParaErroSmtp>, agora: Date, caixas: CaixaRow[], modoTeste: boolean) {
  if (acao === "parar_caixa_autenticacao") {
    const motivo = "erro de autenticacao: a Hostinger recusou usuario/senha da caixa. Confira a senha no painel e rode Testar caixa.";
    await admin.from("prospeccao_caixas").update({ parada_motivo: motivo, parada_em: agora.toISOString(), atualizado_em: agora.toISOString() }).eq("id", caixa.id);
    await logar("enviar", "caixa_parada_autenticacao", { caixa_id: caixa.id, resultado: caixa.endereco });
    await alertarInterno(await smtpParaAlertas(caixas, caixa.id), modoTeste, `[Prospeccao] Caixa ${caixa.endereco} PARADA (senha recusada)`, `A caixa ${caixa.endereco} foi parada automaticamente: ${motivo}\n\nhttps://gestor.rbrcargo.com.br/prospeccao`, { jose: false, pedro: true });
  } else if (acao === "recuar") {
    const nivel = proximoNivelRecuo(caixa.recuo_nivel, "erro_temporario");
    const ate = new Date(agora.getTime() + recuoSegundos(nivel) * 1000).toISOString();
    await admin.from("prospeccao_caixas").update({ recuo_nivel: nivel, proximo_envio_apos: ate, atualizado_em: agora.toISOString() }).eq("id", caixa.id);
    await logar("enviar", "recuo", { caixa_id: caixa.id, resultado: `nivel ${nivel}, proximo envio ${ate}` });
  }
}

/** Respostas escritas na Caixa de entrada e APROVADAS por uma pessoa (status_envio = aprovado). Mesmas travas do robo: chave de envio, bloqueio, modo teste, caixa sem parada. */
async function enviarManuais(f: Flags, caixas: CaixaRow[], comCred: Set<string>, bloqueios: { tipo: string; valor: string }[], agora: Date) {
  const { data } = await admin.from("prospeccao_emails").select("id, conversa_id, caixa_id, para, cc, assunto, corpo_texto, in_reply_to, referencias").eq("direcao", "saida").eq("status_envio", "aprovado").is("message_id", null).order("criado_em").limit(3);
  for (const em of (data ?? []) as EmailSaidaRow[]) {
    const caixa = caixas.find((c) => c.id === em.caixa_id);
    if (!caixa || !caixa.ativa || caixa.parada_motivo || !comCred.has(caixa.id)) continue; // continua aprovado, espera a caixa ficar pronta
    if (caixa.proximo_envio_apos && agora < new Date(caixa.proximo_envio_apos)) continue;
    const para = enderecos(em.para), cc = enderecos(em.cc);
    if (para.length === 0) { await admin.from("prospeccao_emails").update({ status_envio: "falhou", erro: "sem destinatario valido" }).eq("id", em.id); continue; }
    if ([...para, ...cc].some((p) => emailBloqueado(p, bloqueios))) {
      await admin.from("prospeccao_emails").update({ status_envio: "descartado", erro: "destinatario na lista de bloqueio" }).eq("id", em.id);
      await logar("enviar", "resposta_manual_bloqueada", { caixa_id: caixa.id });
      continue;
    }
    const messageId = novoMessageId(crypto.randomUUID());
    const { data: reserva, error: eRes } = await admin.from("prospeccao_emails").update({ message_id: messageId }).eq("id", em.id).is("message_id", null).select("id");
    if (eRes || !reserva?.length) continue;
    const smtp = await smtpDaCaixa(caixa);
    if (!smtp) { await admin.from("prospeccao_emails").update({ message_id: null }).eq("id", em.id); continue; }
    const cab = cabecalhosCaixa({ messageId, emResposta: em.in_reply_to ? { messageId: em.in_reply_to, referencias: em.referencias } : undefined });
    try {
      await enviarEmail(smtp, { para, cc, assunto: em.assunto, texto: `${em.corpo_texto ?? ""}\n\n--\n${caixa.assinatura}\n${caixa.endereco}\nwww.rbrcargo.com.br`, messageId, inReplyTo: cab.inReplyTo, references: cab.references, headers: cab.headers }, f.modoTeste);
      await admin.from("prospeccao_emails").update({ status_envio: "enviado", recebido_em: agora.toISOString(), erro: null }).eq("id", em.id);
      await admin.from("prospeccao_conversas").update({ status: "aguardando_cliente", atualizado_em: agora.toISOString() }).eq("id", em.conversa_id);
      await admin.from("prospeccao_caixas").update({ proximo_envio_apos: new Date(agora.getTime() + intervaloDaCaixaSeg(caixa, 0) * 1000).toISOString(), recuo_nivel: proximoNivelRecuo(caixa.recuo_nivel, "envio_ok") }).eq("id", caixa.id);
      await logar("enviar", f.modoTeste ? "resposta_manual_teste" : "resposta_manual_enviada", { caixa_id: caixa.id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const codigo = (err as { responseCode?: number }).responseCode ?? null;
      const codigoErro = (err as { code?: string }).code ?? null;
      const certeza = certezaDeNaoEnviado(codigo, codigoErro);
      const acao = acaoParaErroSmtp(codigo, codigoErro, msg, erroDeDestinatario(codigo, msg));
      await efeitoNaCaixa(caixa, acao, agora, caixas, f.modoTeste);
      if (acao === "parada_geral") await pararAutomaticamente(`erro de SMTP de bloqueio/limite: ${msg.slice(0, 120)}`, await smtpParaAlertas(caixas, caixa.id), f.modoTeste);
      if (!certeza) { await admin.from("prospeccao_emails").update({ status_envio: "incerto", erro: `envio incerto: ${msg.slice(0, 250)}` }).eq("id", em.id); await logar("enviar", "resposta_manual_incerta", { caixa_id: caixa.id, erro: msg }); continue; }
      if (acao === "recuar" && caixa.recuo_nivel < 4) await admin.from("prospeccao_emails").update({ message_id: null, erro: msg.slice(0, 250) }).eq("id", em.id); // tenta de novo mais tarde
      else await admin.from("prospeccao_emails").update({ status_envio: "falhou", erro: msg.slice(0, 250) }).eq("id", em.id);
      await logar("enviar", "resposta_manual_falhou", { caixa_id: caixa.id, erro: msg });
    }
  }
}

Deno.serve(async (req) => {
  if (!autorizado(req)) return json({ ok: false, erro: "Nao autorizado." }, 401);
  const agora = new Date();
  try {
    const f = await lerFlags();
    if (!f.envio) { await logarSemRepetir("enviar", "desligado"); return json({ ok: true, enviado: false, motivo: "desligado" }); }
    const caixas = await lerCaixas();
    const comCred = await caixasComCredencial(caixas);
    if (comCred.size === 0) { await logarSemRepetir("enviar", "segredos_ausentes", "cadastre a senha de pelo menos uma caixa pelo painel (Vault)"); return json({ ok: true, enviado: false, motivo: "segredos ausentes" }); }

    const [fer, { data: estadoRaw }, { data: rampa }, { data: jornadaRaw }, { data: modelosRaw }, { data: bloqueios }] = await Promise.all([
      feriados(), admin.from("prospeccao_estado").select("*").eq("id", 1).maybeSingle(),
      admin.from("prospeccao_rampa").select("dia_inicio, limite"), admin.from("prospeccao_jornada").select("toque, atraso_dias, modelo_tipo"),
      admin.from("prospeccao_modelos").select("tipo, assunto, corpo, ativo"), admin.from("prospeccao_bloqueio").select("tipo, valor"),
    ]);
    const estado = estadoRaw as { proximo_envio_apos: string | null; primeiro_envio_em: string | null; parada_motivo: string | null } | null;
    const hojeYmd = partesSP(agora).ymd;
    const bloq = (bloqueios ?? []) as { tipo: string; valor: string }[];

    // respostas aprovadas na tela saem primeiro (nao dependem do ritmo do envio frio)
    await enviarManuais(f, caixas, comCred, bloq, agora);

    if (!dentroDaJanelaEnvio(agora, fer)) { await logarSemRepetir("enviar", "fora_da_janela"); return json({ ok: true, enviado: false, motivo: "fora da janela" }); }

    const jornada = (jornadaRaw ?? []) as PassoJornada[];
    const modelos = new Map<string, { assunto: string; corpo: string; ativo: boolean }>((modelosRaw ?? []).map((m: { tipo: string; assunto: string; corpo: string; ativo: boolean }) => [m.tipo, m]));
    await preparar(f, hojeYmd, jornada, modelos, agora);

    // limite do dia: total (parametro, nunca acima de 100) e por caixa (limite proprio + rampa da caixa + reducao por recuo)
    const porCaixa = await enviadosPorCaixaHoje(hojeYmd, f.modoTeste);
    const totalHoje = Object.values(porCaixa).reduce((s, n) => s + n, 0);
    const limiteTotal = Math.min(TETO_ABSOLUTO_DIA, f.limiteDiario != null && Number.isFinite(f.limiteDiario) && f.limiteDiario >= 0 ? Math.floor(f.limiteDiario) : 10);
    if (totalHoje >= limiteTotal) { await logarSemRepetir("enviar", "limite_do_dia", `${totalHoje}/${limiteTotal}`); return json({ ok: true, enviado: false, motivo: "limite do dia" }); }
    const rampaGlobal = (rampa ?? []) as { dia_inicio: number; limite: number }[];
    const escolha = escolherCaixa(caixas, porCaixa, comCred, rampaGlobal, hojeYmd, agora);
    if (!escolha.caixa) { await logarSemRepetir("enviar", "sem_caixa_disponivel", escolha.motivo ?? ""); return json({ ok: true, enviado: false, motivo: escolha.motivo ?? "sem caixa disponivel" }); }
    const caixa = escolha.caixa as CaixaRow;
    const smtp = await smtpDaCaixa(caixa);
    if (!smtp) return json({ ok: true, enviado: false, motivo: "caixa sem credencial" });
    const limiteCaixa = limiteDaCaixa(caixa, rampaGlobal, hojeYmd);
    const enviadosCaixa = porCaixa[caixa.id] ?? 0;
    const proximoApos = caixa.proximo_envio_apos ? new Date(caixa.proximo_envio_apos) : null;

    // candidatos: mensagens prontas (aprovadas; sem aprovacao obrigatoria, tambem rascunhos)
    const status = f.aprovacaoObrigatoria ? ["aprovado"] : ["aprovado", "rascunho"];
    let q = admin.from("prospeccao_mensagens").select("id, empresa_id, contato_id, toque, assunto, corpo, status, tentativas, teste_enviado_em").in("status", status).order("toque", { ascending: false }).order("criado_em").limit(60);
    // Modo real: so mensagens SEM message_id. Mensagem com message_id e status ainda "aprovado" e "envio incerto" (a Saude do envio mostra) e nunca e reenviada sozinha.
    q = f.modoTeste ? q.is("teste_enviado_em", null) : q.is("message_id", null);
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
    for (const m of msgs.slice(0, 8)) { const c = cons.get(m.contato_id); if (c && (c.validacao_status === "sintaxe_ok" || c.validacao_status === "pendente")) c.validacao_status = (await verificarEmail(c)) ?? "dns_indisponivel"; }

    const cands: (Candidato & { msg: Msg })[] = msgs.flatMap((m) => {
      const e = emps.get(m.empresa_id), c = cons.get(m.contato_id);
      if (!e || !c) return [];
      return [{ id: m.id, msg: m, toque: m.toque, classe: e.classe, tipoEmail: c.tipo_email, validacao: c.validacao_status,
        dominioBateComSite: !!dominioDoSite(e.site) && dominioDe(c.email).endsWith(dominioDoSite(e.site)), seguimentoVencido: m.toque > 1 }];
    });

    let restantes = [...cands];
    for (let tentativa = 0; tentativa < 5; tentativa++) {
      const esc = escolherProximo(restantes, devolvidosHoje, f.modoTeste);
      if (!esc) break;
      restantes = restantes.filter((c) => c.id !== esc.id);
      const m = (esc as Candidato & { msg: Msg }).msg, e = emps.get(m.empresa_id)!, c = cons.get(m.contato_id)!;
      // resposta DESTE contato (um contato indicado por "nao_sou_eu" nasce na mesma empresa e nao herda a resposta do colega)
      const { count: respostas } = await admin.from("prospeccao_respostas").select("id", { count: "exact", head: true }).eq("empresa_id", e.id).ilike("de_email", c.email);
      const motivo = motivoDeNaoEnviar({
        envioLiberado: f.envio, aprovacaoObrigatoria: f.aprovacaoObrigatoria, mensagemStatus: m.status, contatoEmail: c.email, contatoValidacao: c.validacao_status,
        empresaStatus: e.status === "em_aprovacao" ? "em_contato" : e.status, empresaRepousoAte: e.repouso_ate, hojeYmd, jaRespondeuOuDevolveu: (respostas ?? 0) > 0,
        enviadosHoje: enviadosCaixa, limiteHoje: limiteCaixa, agora, feriados: fer, bloqueios: bloq, paradaAtiva: false, proximoEnvioApos: proximoApos, modoTeste: f.modoTeste,
      });
      if (motivo) {
        // problema desta mensagem (nao do momento): descarta e tenta a proxima
        await admin.from("prospeccao_mensagens").update({ status: "descartado", erro: motivo }).eq("id", m.id);
        await logar("enviar", "descartada_na_reconferencia", { empresa_id: e.id, resultado: motivo, caixa_id: caixa.id });
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
      const cabCx = cabecalhosCaixa({ messageId }); // List-Unsubscribe (+ one-click quando houver link https configurado)
      if (f.aprovacaoObrigatoria === false && m.status === "rascunho") await admin.from("prospeccao_mensagens").update({ status: "aprovado", aprovado_em: agora.toISOString() }).eq("id", m.id);

      // Reserva o message_id ANTES do SMTP (modo real). Se nao conseguir gravar, NAO envia: sem a reserva nao ha como evitar envio duplicado.
      if (!f.modoTeste) {
        const { data: reserva, error: eRes } = await admin.from("prospeccao_mensagens").update({ message_id: messageId, caixa_id: caixa.id }).eq("id", m.id).is("message_id", null).select("id");
        if (eRes || !reserva?.length) { await logar("enviar", "reserva_message_id_falhou", { empresa_id: e.id, erro: eRes?.message ?? "mensagem ja reservada por outra rodada", caixa_id: caixa.id }); continue; }
      }
      try {
        const r = await enviarEmail(smtp, { para: [c.email], assunto: cab.subject, texto: m.corpo, messageId: cab.messageId, inReplyTo: cab.inReplyTo, references: cab.references, headers: { ...cab.headers, ...cabCx.headers } }, f.modoTeste);
        const espera = intervaloDaCaixaSeg(caixa, Math.random());
        const proximo = new Date(agora.getTime() + espera * 1000).toISOString();
        if (f.modoTeste) {
          await admin.from("prospeccao_mensagens").update({ teste_enviado_em: agora.toISOString() }).eq("id", m.id);
          await logar("enviar", "enviado_teste", { empresa_id: e.id, resultado: `toque ${m.toque} para ${r.destinos.length} destino(s) de teste`, caixa_id: caixa.id });
        } else {
          // O e-mail JA saiu. Se este update falhar, tenta mais uma vez e, se falhar de novo, so registra: o message_id ja esta gravado, entao NUNCA reenvia.
          let eUp = (await admin.from("prospeccao_mensagens").update({ status: "enviado", enviado_em: agora.toISOString(), message_id: messageId, caixa_id: caixa.id, erro: null }).eq("id", m.id)).error;
          if (eUp) eUp = (await admin.from("prospeccao_mensagens").update({ status: "enviado", enviado_em: agora.toISOString(), erro: null }).eq("id", m.id)).error;
          if (eUp) await logar("enviar", "envio_incerto_status_nao_gravado", { empresa_id: e.id, erro: `enviado, mas o status nao foi gravado: ${eUp.message}`, caixa_id: caixa.id });
          await admin.from("prospeccao_empresas").update({ status: "em_contato" }).eq("id", e.id).in("status", ["novo", "qualificado", "em_aprovacao"]);
          if (!estado?.primeiro_envio_em) await admin.from("prospeccao_estado").update({ primeiro_envio_em: hojeYmd }).eq("id", 1);
          await somarDia(hojeYmd, "enviados");
          await auditar("prospeccao_envio", { mensagem_id: m.id, empresa_id: e.id, toque: m.toque, caixa_id: caixa.id });
          await logar("enviar", "enviado", { empresa_id: e.id, resultado: `toque ${m.toque}`, caixa_id: caixa.id });
          await registrarSaida({ caixaId: caixa.id, empresaId: e.id, mensagemId: m.id, messageId, raizMessageId: m.toque > 1 && primeiro?.message_id ? primeiro.message_id : messageId, assunto: cab.subject, para: c.email, de: caixa.endereco, texto: m.corpo, toque: m.toque, quando: agora });
        }
        await admin.from("prospeccao_caixas").update({
          proximo_envio_apos: proximo, recuo_nivel: proximoNivelRecuo(caixa.recuo_nivel, "envio_ok"), primeiro_envio_em: caixa.primeiro_envio_em ?? (f.modoTeste ? null : hojeYmd), atualizado_em: agora.toISOString(),
        }).eq("id", caixa.id);
        await admin.from("prospeccao_estado").update({ proximo_envio_apos: proximo, atualizado_em: agora.toISOString() }).eq("id", 1);
        const parada = await avaliarParada(hojeYmd, smtp, f.modoTeste);
        return json({ ok: true, enviado: true, teste: f.modoTeste, proximoEm: proximo, parada });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const codigo = (err as { responseCode?: number }).responseCode ?? null;
        const codigoErro = (err as { code?: string }).code ?? null;
        const destinatarioRecusado = erroDeDestinatario(codigo, msg);
        const acao = acaoParaErroSmtp(codigo, codigoErro, msg, destinatarioRecusado);
        // Sem certeza de que nada foi entregue (ex.: timeout no meio do envio), o message_id fica gravado = "envio incerto, conferir"; nunca reenvia sozinho.
        const certeza = f.modoTeste || certezaDeNaoEnviado(codigo, codigoErro);
        const soltaId = !f.modoTeste && certeza ? { message_id: null } : {};
        await efeitoNaCaixa(caixa, acao, agora, caixas, f.modoTeste);
        if (!certeza) {
          await admin.from("prospeccao_mensagens").update({ erro: `envio incerto: ${msg.slice(0, 250)}` }).eq("id", m.id);
          await logar("enviar", "envio_incerto", { empresa_id: e.id, erro: msg, caixa_id: caixa.id });
          if (acao === "parada_geral") await pararAutomaticamente(`erro de SMTP de bloqueio/limite: ${msg.slice(0, 120)}`, await smtpParaAlertas(caixas, caixa.id), f.modoTeste);
          return json({ ok: false, enviado: false, motivo: "envio incerto" });
        }
        if (acao === "parada_geral") {
          await admin.from("prospeccao_mensagens").update({ erro: msg.slice(0, 300), ...soltaId }).eq("id", m.id);
          await pararAutomaticamente(`erro de SMTP de bloqueio/limite: ${msg.slice(0, 120)}`, await smtpParaAlertas(caixas, caixa.id), f.modoTeste);
          return json({ ok: false, enviado: false, motivo: "parada automatica" });
        }
        if (acao === "parar_caixa_autenticacao") {
          await admin.from("prospeccao_mensagens").update({ erro: "caixa parada por erro de autenticacao", ...soltaId }).eq("id", m.id);
          return json({ ok: false, enviado: false, motivo: "caixa parada (autenticacao)" });
        }
        if (acao === "destinatario_invalido" && !f.modoTeste) {
          // SMTP recusou o destinatario na hora: o contato e invalido de verdade. Em modo teste o destinatario e o de teste, entao isso nao se aplica.
          await admin.from("prospeccao_mensagens").update({ status: "falhou", erro: msg.slice(0, 300), ...soltaId }).eq("id", m.id);
          await admin.from("prospeccao_contatos").update({ validacao_status: "devolvido", validado_em: agora.toISOString() }).eq("id", c.id);
          await bloquearSoEmail(c.email, "devolvido");
          await somarDia(hojeYmd, "devolvidos");
          await admin.from("prospeccao_mensagens").update({ status: "descartado", erro: "destinatario recusado pelo servidor" }).eq("empresa_id", e.id).in("status", ["rascunho", "aprovado"]);
          await auditar("prospeccao_destinatario_recusado", { empresa_id: e.id, contato_id: c.id });
          await logar("enviar", "destinatario_recusado", { empresa_id: e.id, erro: msg, caixa_id: caixa.id });
          const parada = await avaliarParada(hojeYmd, smtp, f.modoTeste);
          return json({ ok: false, enviado: false, motivo: "destinatario recusado", parada });
        }
        if (acao === "recuar" && m.tentativas + 1 < 3) await admin.from("prospeccao_mensagens").update({ tentativas: m.tentativas + 1, erro: msg.slice(0, 300), ...soltaId }).eq("id", m.id);
        else await admin.from("prospeccao_mensagens").update({ status: "falhou", erro: msg.slice(0, 300), ...soltaId }).eq("id", m.id);
        await logar("enviar", acao === "recuar" ? "falha_temporaria" : "falhou", { empresa_id: e.id, erro: msg, caixa_id: caixa.id });
        return json({ ok: false, enviado: false, motivo: acao });
      }
    }
    return json({ ok: true, enviado: false, motivo: "nenhum candidato elegivel" });
  } catch (e) {
    await logar("enviar", "erro_inesperado", { erro: e instanceof Error ? e.message : String(e) });
    return json({ ok: false, erro: "Erro inesperado (veja o log)." }, 500);
  }
});
