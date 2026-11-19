// Edge Function: prospeccao-analista  (verify_jwt = true; so aceita a chave service_role, agendada toda segunda 07:00 America/Sao_Paulo: docs/prospeccao/agendar-agente.sql, NAO aplicado)
// Analista semanal: calcula numeros por texto, toque e segmento (enviados, respostas, respostas uteis, agora nao, descadastros, devolucoes, custo de IA), gera o relatorio e o
// PROJETO DE MUDANCA (cada sugestao com motivo, evidencia, risco e teste proposto) e entrega um e-mail curto + detalhe no painel (aba Relatorios).
// A IA so pode mexer em texto, assunto, cadencia e segmento, SEMPRE em teste de ate 10% dos envios contra o padrao (prospeccao_experimentos). Preco, prazo de coleta, regras de
// descadastro e bloqueio, limites de envio e de gasto, lista de recusa de cargas, o que a IA pode prometer, flags e chaves sao FIXOS: validarMudancaAnalista recusa. Tudo que passa
// pela allowlist vira experimento; o padrao so muda se o experimento vencer com margem clara; reverte sozinho por descadastro/devolucao acima do padrao ou menos respostas uteis.
// DESLIGADO sem a chave PROSPECCAO_IA_CHAVE (nao faz nada).
import { admin, alertarInterno, autorizado, json, lerFlags, lerCaixas, logar, logarSemRepetir, PAINEL, smtpParaAlertas } from "../_shared/prospeccaoEdge.ts";
import { avaliarExperimentos, carregarParamsIa, chamarIa, chaveIa, lerJson, situacaoTeto } from "../_shared/prospeccaoIaEdge.ts";
import { agregarMetricas, validarMudancaAnalista, type LinhaEnvio } from "../_shared/prospeccaoAgente.ts";
import { partesSP } from "../_shared/prospeccaoRegras.ts";

const SYSTEM = `Voce e o analista semanal da prospeccao ativa da RBR Cargo (agenciadora de cargas em Sao Paulo; e-mails frios para industrias).
Recebe os NUMEROS da semana (agregados, sem dados pessoais). Proponha NO MAXIMO 3 mudancas que possam aumentar respostas uteis (cotacao e indicacao) sem aumentar descadastros nem devolucoes.
Voce so pode propor mudancas em: "texto" (corpo de toque1..toque4), "assunto" (de toque1..toque4), "cadencia" (dias entre toques 2, 3 e 4; minimo 2 dias, ate 3 intervalos) e "segmento" (alimentos, bebidas, plasticos, metalurgia, maquinas: qual priorizar).
Voce NAO pode mexer em preco, prazo de coleta, descadastro, bloqueio, limites, recusa de cargas, promessas, chaves ou configuracoes. Textos novos: sem valor de frete, sem prazo de coleta, sem "time comercial", sem "agenciador", sem telefone, com o rodape Se preferir nao receber mais mensagens, responda "sair". e so com as variaveis {segmento_legivel} {segmento_frase} {cidade} {nome} {empresa} {veiculo}.
Responda SOMENTE um JSON: {"resumo": "2 a 4 frases em portugues", "sugestoes": [{"titulo": "", "campo": "texto|assunto|cadencia|segmento", "alvo": "toque1..toque4 | jornada | segmento", "valor": "texto novo | [dias] | nome do segmento", "motivo": "", "evidencia": "numeros que sustentam", "risco": "", "teste": "como sera testado"}]}.
Se os numeros forem poucos para concluir algo, diga isso no resumo e devolva "sugestoes": [].`;

Deno.serve(async (req) => {
  if (!autorizado(req)) return json({ ok: false, erro: "Nao autorizado." }, 401);
  const agora = new Date();
  try {
    const chave = await chaveIa();
    if (!chave) { await logarSemRepetir("sistema", "analista_ia_desligada", "falta a chave PROSPECCAO_IA_CHAVE no Vault"); return json({ ok: true, ia: false, motivo: "IA desligada: falta a chave" }); }
    const params = await carregarParamsIa();
    const teto = await situacaoTeto(params, agora);
    const hoje = partesSP(agora).ymd;
    const dia = (n: number) => new Date(new Date(`${hoje}T12:00:00-03:00`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
    const inicio = dia(-7), fim = dia(-1);
    const desde = new Date(`${inicio}T00:00:00-03:00`).toISOString();

    // 1) reversoes primeiro (toda reversao entra no relatorio)
    const reversoes = await avaliarExperimentos();

    // 2) numeros da semana
    const { data: msgs } = await admin.from("prospeccao_mensagens").select("id, toque, empresa_id, contato_id, variante").eq("status", "enviado").gte("enviado_em", desde).limit(5000);
    const ms = (msgs ?? []) as { id: string; toque: number; empresa_id: string; contato_id: string; variante: boolean }[];
    const nada = { data: [] as unknown[] };
    const [{ data: emps }, { data: ctt }, { data: rs }, { data: jor }, { data: uso }] = await Promise.all([
      ms.length ? admin.from("prospeccao_empresas").select("id, segmento").in("id", [...new Set(ms.map((m) => m.empresa_id))]) : Promise.resolve(nada),
      ms.length ? admin.from("prospeccao_contatos").select("id").in("id", [...new Set(ms.map((m) => m.contato_id))]).eq("validacao_status", "devolvido") : Promise.resolve(nada),
      ms.length ? admin.from("prospeccao_respostas").select("mensagem_id, classificacao").in("mensagem_id", ms.map((m) => m.id)) : Promise.resolve(nada),
      admin.from("prospeccao_jornada").select("toque, modelo_tipo"),
      admin.from("prospeccao_ia_uso").select("custo_brl").gte("data", inicio).lte("data", fim),
    ]);
    const seg = new Map(((emps ?? []) as { id: string; segmento: string }[]).map((e) => [e.id, e.segmento]));
    const devolvidos = new Set(((ctt ?? []) as { id: string }[]).map((c) => c.id));
    const respPorMsg = new Map(((rs ?? []) as { mensagem_id: string; classificacao: string | null }[]).map((r) => [r.mensagem_id, r.classificacao]));
    const modeloDe = new Map(((jor ?? []) as { toque: number; modelo_tipo: string }[]).map((j) => [j.toque, j.modelo_tipo]));
    const linhas: LinhaEnvio[] = ms.map((m) => ({ toque: m.toque, modelo: modeloDe.get(m.toque) ?? `toque${m.toque}`, segmento: seg.get(m.empresa_id) ?? "?", variante: m.variante, resposta: respPorMsg.get(m.id) ?? null, devolvida: devolvidos.has(m.contato_id) }));
    const metricas = agregarMetricas(linhas);
    const custoIa = ((uso ?? []) as { custo_brl: number }[]).reduce((s, u) => s + Number(u.custo_brl), 0);

    // 3) analise (so se houver o que analisar e se o teto permitir)
    let resumo = ms.length === 0 ? "Sem envios na semana: nada a analisar." : "";
    const sugestoes: Record<string, unknown>[] = [];
    let descartadas = 0;
    if (ms.length > 0 && !teto.parar) {
      const r = lerJson(await chamarIa(chave, params, { funcao: "analisar", system: SYSTEM, user: JSON.stringify({ semana: { inicio, fim }, metricas, custo_ia_brl: Number(custoIa.toFixed(2)), reversoes }), maxTokens: 1800 }));
      if (r) {
        resumo = typeof r.resumo === "string" ? r.resumo.slice(0, 1200) : "";
        const { data: exAtivos } = await admin.from("prospeccao_experimentos").select("tipo, alvo").eq("status", "em_teste");
        let ativos = (exAtivos ?? []).length;
        for (const s of (Array.isArray(r.sugestoes) ? r.sugestoes : []).slice(0, 3) as Record<string, unknown>[]) {
          const mud = { campo: String(s.campo ?? ""), alvo: String(s.alvo ?? ""), valor: s.valor };
          const ok = validarMudancaAnalista(mud);
          if (!ok.ok) { descartadas++; await logar("sistema", "analista_sugestao_recusada", { resultado: ok.motivo ?? "fora da allowlist" }); continue; }
          const item: Record<string, unknown> = { id: crypto.randomUUID(), titulo: String(s.titulo ?? "").slice(0, 160), campo: mud.campo, alvo: mud.alvo, valor: mud.valor, motivo: String(s.motivo ?? "").slice(0, 500), evidencia: String(s.evidencia ?? "").slice(0, 500), risco: String(s.risco ?? "").slice(0, 400), teste: String(s.teste ?? "").slice(0, 400), status: "nova" };
          // vira experimento (ate 10% dos envios), no maximo 2 ao mesmo tempo e um por campo/alvo
          const repetido = (exAtivos ?? []).some((x: { tipo: string; alvo: string }) => x.tipo === mud.campo && x.alvo === (mud.campo === "cadencia" ? "jornada" : mud.alvo));
          if (ativos < 2 && !repetido) {
            let padrao: Record<string, unknown> = {}, variante: Record<string, unknown> = {};
            if (mud.campo === "texto" || mud.campo === "assunto") {
              const { data: m } = await admin.from("prospeccao_modelos").select("assunto, corpo").eq("tipo", mud.alvo).maybeSingle();
              const mm = m as { assunto: string; corpo: string } | null;
              if (mm) { padrao = mud.campo === "texto" ? { corpo: mm.corpo } : { assunto: mm.assunto }; variante = mud.campo === "texto" ? { corpo: String(mud.valor) } : { assunto: String(mud.valor) }; }
            } else if (mud.campo === "cadencia") {
              const { data: j } = await admin.from("prospeccao_jornada").select("toque, atraso_dias").gte("toque", 2).order("toque");
              padrao = { atrasos: (j ?? []).map((x: { atraso_dias: number }) => x.atraso_dias) }; variante = { atrasos: mud.valor };
            } else { padrao = {}; variante = { segmento: String(mud.valor) }; }
            if (Object.keys(variante).length) {
              const { data: nx } = await admin.from("prospeccao_experimentos").insert({ tipo: mud.campo, alvo: mud.campo === "cadencia" ? "jornada" : mud.alvo, padrao, variante, pct_envios: 10, origem: "analista" }).select("id").single();
              if (nx) { item.experimento_id = (nx as { id: string }).id; item.status = "em_teste"; ativos++; }
            }
          }
          sugestoes.push(item);
        }
      } else resumo = "A IA nao respondeu no formato esperado; veja os numeros abaixo.";
    } else if (teto.parar && ms.length > 0) resumo = "O teto de gasto de IA do dia foi atingido: relatorio com numeros, sem sugestoes. Rode de novo amanha.";

    const { data: rel } = await admin.from("prospeccao_relatorios").upsert({ semana_inicio: inicio, semana_fim: fim, resumo, metricas: { ...metricas, custo_ia_brl: Number(custoIa.toFixed(2)), sugestoes_recusadas_pela_allowlist: descartadas }, sugestoes, reversoes }, { onConflict: "semana_inicio" }).select("id").single();
    const idsExp = sugestoes.map((s) => s.experimento_id).filter(Boolean) as string[];
    if (rel && idsExp.length) await admin.from("prospeccao_experimentos").update({ relatorio_id: (rel as { id: string }).id }).in("id", idsExp);

    // 4) e-mail curto: numeros + 3 sugestoes + link
    const t = metricas.total;
    const linhasEmail = [
      `Semana ${inicio} a ${fim}`,
      `Enviados: ${t.enviados} · Respostas: ${t.respostas} (uteis: ${t.uteis}) · Agora nao: ${t.agoraNao} · Descadastros: ${t.descadastros} · Devolucoes: ${t.devolucoes} · IA: R$ ${custoIa.toFixed(2)}`,
      ...(reversoes.length ? [`Experimentos revertidos: ${reversoes.map((x) => `${x.tipo}/${x.alvo}`).join(", ")}`] : []),
      resumo, "", ...sugestoes.slice(0, 3).map((s, i) => `${i + 1}. ${String(s.titulo)} (${String(s.campo)}): ${String(s.motivo)}`), "", `Detalhe e historico: ${PAINEL}`,
    ].join("\n");
    const f = await lerFlags();
    await alertarInterno(await smtpParaAlertas(await lerCaixas()), f.modoTeste, "[Prospeccao] Relatorio semanal do analista", linhasEmail, { jose: false, pedro: true });
    if (rel) await admin.from("prospeccao_relatorios").update({ email_enviado_em: new Date().toISOString() }).eq("id", (rel as { id: string }).id);
    await logar("sistema", "analista_relatorio", { resultado: `${t.enviados} envios, ${sugestoes.length} sugestao(oes), ${reversoes.length} reversao(oes)` });
    return json({ ok: true, ia: true, enviados: t.enviados, sugestoes: sugestoes.length, reversoes: reversoes.length });
  } catch (e) {
    await logar("sistema", "analista_erro_inesperado", { erro: e instanceof Error ? e.message : String(e) });
    return json({ ok: false, erro: "Erro inesperado (veja o log)." }, 500);
  }
});
