// Regras puras da Central (sem tela, sem banco): ficam aqui para serem testadas com node --test.

export type Nivel = 'ok' | 'wn' | 'bd'

// ---- limites de uso -----------------------------------------------------------------------------------
export const SERVICOS_USO: { id: string; nome: string; periodo: 'dia' | 'mes'; semChave?: boolean }[] = [
  { id: 'qev', nome: 'QEV (verificar e-mail)', periodo: 'dia' },
  { id: 'verifalia', nome: 'Verifalia', periodo: 'dia' },
  { id: 'exa', nome: 'Exa (busca de sites)', periodo: 'mes' },
  { id: 'tavily', nome: 'Tavily (busca de sites)', periodo: 'mes' },
  { id: 'serper', nome: 'Serper', periodo: 'mes', semChave: true },
  { id: 'ia_gratis', nome: 'IA grátis', periodo: 'dia' },
  { id: 'claude_noite', nome: 'Claude da noite', periodo: 'dia' },
]

export function percentualUso(usado: number, limite: number): number {
  if (!Number.isFinite(usado) || !Number.isFinite(limite) || limite <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((usado / limite) * 100)))
}
// Aviso a partir de 80% (pedido do Pedro); vermelho quando chega no teto.
export function nivelUso(usado: number, limite: number): Nivel {
  if (!(limite > 0)) return 'ok'
  const p = (usado / limite) * 100
  return p >= 100 ? 'bd' : p >= 80 ? 'wn' : 'ok'
}
// "Quando acaba": ritmo médio desde o início do período. Devolve texto simples ou null se não dá para estimar.
export function projecaoEsgotar(usado: number, limite: number, periodo: 'dia' | 'mes', agora: Date): string | null {
  if (!(limite > 0) || !(usado > 0)) return null
  if (usado >= limite) return 'Já chegou no limite.'
  if (periodo === 'mes') {
    const dia = agora.getUTCDate()
    const porDia = usado / Math.max(1, dia)
    const dias = Math.ceil((limite - usado) / porDia)
    return dias <= 1 ? 'No ritmo atual, acaba amanhã.' : `No ritmo atual, acaba em ${dias} dias.`
  }
  const horasPassadas = Math.max(1, agora.getUTCHours() - 3 + agora.getUTCMinutes() / 60) // horário de Brasília, aproximado
  const porHora = usado / horasPassadas
  const horas = (limite - usado) / porHora
  return horas > 24 ? 'No ritmo atual, dura o dia todo.' : `No ritmo atual, acaba em cerca de ${Math.max(1, Math.round(horas))} h.`
}

// ---- batimento do agente ------------------------------------------------------------------------------
export const BATIMENTO_ATRASADO_MS = 5 * 60 * 1000
export function batimentoAtrasado(ultimo: string | null | undefined, agora: Date): boolean {
  if (!ultimo) return true
  const t = Date.parse(ultimo)
  return !Number.isFinite(t) || agora.getTime() - t > BATIMENTO_ATRASADO_MS
}

// ---- processos no PC ----------------------------------------------------------------------------------
export type Processo = { pid: number; nome: string; arquivo: string; inicio: string; memoria_mb: number | null; dono: string; protegido: boolean }
export function processosDoResumo(resumo: unknown): Processo[] {
  const lista = (resumo as { processos?: unknown } | null)?.processos
  if (!Array.isArray(lista)) return []
  const saida: Processo[] = []
  for (const p of lista as Record<string, unknown>[]) {
    const pid = Number(p?.pid)
    if (!Number.isInteger(pid) || pid <= 0 || typeof p.inicio !== 'string' || !Number.isFinite(Date.parse(p.inicio))) continue
    const arquivo = String(p.arquivo ?? '')
    const dono = String(p.dono ?? 'sem dono')
    saida.push({
      pid, nome: String(p.nome ?? '?'), arquivo, inicio: p.inicio,
      memoria_mb: Number.isFinite(Number(p.memoria_mb)) ? Number(p.memoria_mb) : null,
      dono, protegido: dono === 'agente' || /[\\/]agente[\\/]|agente[^\\/]*\.(py|exe|bat|ps1)$/i.test(arquivo),
    })
  }
  return saida.sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio))
}
export function duracaoLegivel(inicio: string, agora: Date): string {
  const min = Math.max(0, Math.floor((agora.getTime() - Date.parse(inicio)) / 60000))
  if (min < 1) return 'menos de 1 min'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h ${String(min % 60).padStart(2, '0')} min`
  return `${Math.floor(h / 24)} d ${h % 24} h`
}
export function maisDe24h(inicio: string, agora: Date): boolean { return agora.getTime() - Date.parse(inicio) > 24 * 3600 * 1000 }
export function semDono(ps: Processo[]): number { return ps.filter((p) => !p.protegido && p.dono === 'sem dono').length }
// Só o que a tela mostra com botão Encerrar: não protegido.
export function podeEncerrar(p: Processo): boolean { return !p.protegido }

// ---- lista de clientes ---------------------------------------------------------------------------------
export const PREFIXOS_SETOR = ['compras', 'suprimentos', 'logistica', 'logística', 'expedicao', 'expedição', 'transportes', 'transporte', 'frete', 'fretes', 'cotacao', 'cotação', 'comercial', 'faturamento', 'pcp']
export function tipoEmail(email: string | null | undefined): 'setor' | 'geral' | 'sem' {
  const e = (email ?? '').trim().toLowerCase()
  if (!e.includes('@')) return 'sem'
  const local = e.split('@')[0].replace(/[._-]?\d+$/, '')
  return PREFIXOS_SETOR.includes(local) ? 'setor' : 'geral'
}
export function verificacaoRotulo(v: string | null | undefined): { rotulo: string; nivel: Nivel | 'neutro' } {
  const x = (v ?? '').toLowerCase()
  if (['valido', 'válido', 'verificado', 'ok', 'deliverable'].includes(x)) return { rotulo: 'Válido', nivel: 'ok' }
  if (['invalido', 'inválido', 'undeliverable', 'risky_bad'].includes(x)) return { rotulo: 'Inválido', nivel: 'bd' }
  return { rotulo: 'Pendente', nivel: 'neutro' }
}
// Texto para o filtro .or() do PostgREST: tira o que quebraria a expressão.
export function termoBusca(q: string): string { return q.replace(/[%,()*\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) }
export type ResumoLista = { empresas: number; contatos: number; gerada_em: string | null }
// O agente informa em resumo_json.lista o que a LISTAS gerou (ver docs/central/AGENTE-CONTRATO.md).
export function resumoDaLista(resumo: unknown): ResumoLista | null {
  const l = (resumo as { lista?: Record<string, unknown> } | null)?.lista
  if (!l || typeof l !== 'object') return null
  const empresas = Number(l.empresas), contatos = Number(l.contatos)
  if (!Number.isFinite(empresas) || empresas < 0) return null
  return { empresas, contatos: Number.isFinite(contatos) && contatos >= 0 ? contatos : 0, gerada_em: typeof l.gerada_em === 'string' ? l.gerada_em : null }
}
export function faltamNaBase(lista: ResumoLista | null, naBase: number): number { return lista ? Math.max(0, lista.empresas - naBase) : 0 }
export function loteNovo(agora: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `lote-${agora.getUTCFullYear()}${p(agora.getUTCMonth() + 1)}${p(agora.getUTCDate())}-${p(agora.getUTCHours())}${p(agora.getUTCMinutes())}${p(agora.getUTCSeconds())}`
}

// ---- progresso da importação ---------------------------------------------------------------------------
export type ProgressoImport = { lotes_total?: number; lotes_feitos?: number; enviadas?: number; repetidas?: number; erros?: number }
export function textoProgresso(p: ProgressoImport | null | undefined): string {
  if (!p || !p.lotes_total) return 'Esperando o agente começar.'
  return `Lote ${p.lotes_feitos ?? 0} de ${p.lotes_total}: ${p.enviadas ?? 0} novas, ${p.repetidas ?? 0} repetidas, ${p.erros ?? 0} com erro.`
}
export function fracaoProgresso(p: ProgressoImport | null | undefined): number {
  if (!p || !p.lotes_total) return 0
  return Math.max(0, Math.min(1, (p.lotes_feitos ?? 0) / p.lotes_total))
}

// ---- robôs e chaves de produção ------------------------------------------------------------------------
export type RoboLinha = {
  id: string; nome: string; onde_roda: 'pc' | 'nuvem'; tipo: string; hora: string | null; ligado: boolean; travado: boolean
  bloqueado_motivo: string | null; flag_chave: string | null; ultimo_inicio: string | null; ultimo_fim: string | null; ultimo_resultado: string | null
}
export type EstadoRobo = 'rodando' | 'ligado' | 'desligado' | 'travado'
export function estadoDoRobo(r: RoboLinha, flags: Record<string, string>): EstadoRobo {
  if (r.travado) return 'travado'
  const ligado = r.flag_chave ? flags[r.flag_chave] === 'sim' : r.ligado
  if (!ligado) return 'desligado'
  if (!r.flag_chave && r.ultimo_inicio && (!r.ultimo_fim || Date.parse(r.ultimo_inicio) > Date.parse(r.ultimo_fim))) return 'rodando'
  return 'ligado'
}

type Efeito = { titulo: string; efeito: string; perigoso: boolean }
// Texto da janela de confirmação, sempre dizendo o EFEITO em português simples.
export function efeitoDaChave(roboId: string, ligar: boolean): Efeito {
  switch (roboId) {
    case 'envio':
      return ligar
        ? { titulo: 'Ligar o envio de e-mails?', efeito: 'O robô passa a enviar e-mails aprovados. Com o modo teste ligado, só sai para endereços de teste.', perigoso: true }
        : { titulo: 'Desligar o envio de e-mails?', efeito: 'Nenhum e-mail sai até você ligar de novo. O que já foi enviado não volta.', perigoso: false }
    case 'leitura':
      return ligar
        ? { titulo: 'Ligar a leitura de respostas?', efeito: 'O robô passa a ler a caixa de e-mail e registrar as respostas das empresas.', perigoso: true }
        : { titulo: 'Desligar a leitura de respostas?', efeito: 'As respostas deixam de ser lidas e classificadas até você ligar de novo.', perigoso: false }
    case 'resposta_auto':
      return ligar
        ? { titulo: 'Ligar o responder sozinho?', efeito: 'O robô responderia empresas sem passar por você.', perigoso: true }
        : { titulo: 'Desligar o responder sozinho?', efeito: 'Todas as respostas voltam a esperar você.', perigoso: false }
    case 'aprovacao':
      return ligar
        ? { titulo: 'Ligar a aprovação obrigatória?', efeito: 'Todo e-mail só sai depois que você aprovar. É a opção segura.', perigoso: false }
        : { titulo: 'Desligar a aprovação obrigatória?', efeito: 'E-mails poderão sair sem o seu ok, um por um. Só faça isso se tiver certeza.', perigoso: true }
    case 'modo_teste':
      return ligar
        ? { titulo: 'Ligar o modo teste?', efeito: 'Os e-mails só saem para endereços de teste, nunca para empresas de verdade.', perigoso: false }
        : { titulo: 'Desligar o modo teste?', efeito: 'Os e-mails passam a poder sair para empresas de verdade.', perigoso: true }
    default:
      return ligar
        ? { titulo: 'Ligar este robô?', efeito: 'O agente do PC passa a executar este robô no horário.', perigoso: false }
        : { titulo: 'Desligar este robô?', efeito: 'O agente do PC para de executar este robô. Se ele estiver no meio de algo, termina o passo atual.', perigoso: false }
  }
}
// Envio e leitura só ligam com o pré-voo completo.
export const LIGAR_EXIGE_PREVOO = ['envio', 'leitura']
export function motivoNaoLiga(r: RoboLinha, flags: Record<string, string>, prevooCompleto = false): string | null {
  if (r.travado) return 'Travado: só muda com o seu OK no chat.'
  if (r.bloqueado_motivo) return r.bloqueado_motivo
  if (LIGAR_EXIGE_PREVOO.includes(r.id) && !prevooCompleto) return 'Ainda falta item no "Pronto para o primeiro envio". Complete a lista e depois ligue.'
  if (r.id === 'resposta_auto' && !(flags.PROSPECCAO_ENVIO_LIBERADO === 'sim' && flags.PROSPECCAO_LEITURA_LIBERADA === 'sim')) return 'Só liga com enviar e ler ligados.'
  return null
}

// ---- recusar tudo se a pessoa não é do grupo -----------------------------------------------------------
export function valorDaFlag(ligar: boolean): string { return ligar ? 'sim' : 'nao' }

// ============================== F3 ==========================================================================
// ---- pré-voo do primeiro envio -------------------------------------------------------------------------
export type EntradaPrevoo = {
  naBase: number; modelosAtivos: number; caixasAtivas: number; caixasComDiagnostico: number; caixasComSenha: number
  marcas: Record<string, string> | null   // null = parâmetro ainda não existe (migration 0200 não aplicada)
  flags: Record<string, string>
}
export type ItemPrevoo = { id: string; nome: string; feito: boolean; manual: boolean; detalhe: string }
export const TOQUES_OBRIGATORIOS = 4
export function calcularPrevoo(e: EntradaPrevoo): { itens: ItemPrevoo[]; feitos: number; total: number; completo: boolean } {
  const m = e.marcas ?? {}
  const itens: ItemPrevoo[] = [
    { id: 'base', nome: 'Base importada', feito: e.naBase > 0, manual: false, detalhe: e.naBase > 0 ? `${e.naBase} empresas na base.` : 'Envie a lista para a base do TMS.' },
    { id: 'textos', nome: 'Textos dos 4 toques ativos', feito: e.modelosAtivos >= TOQUES_OBRIGATORIOS, manual: false, detalhe: `${e.modelosAtivos} de ${TOQUES_OBRIGATORIOS} textos ativos. Ative na seção Jornada do e-mail.` },
    { id: 'diagnostico', nome: 'Diagnóstico das caixas feito', feito: e.caixasAtivas > 0 && e.caixasComDiagnostico >= e.caixasAtivas, manual: false, detalhe: e.caixasAtivas === 0 ? 'Nenhuma caixa ativa.' : `${e.caixasComDiagnostico} de ${e.caixasAtivas} caixas diagnosticadas (rode o diagnóstico nos Ajustes do Radar).` },
    { id: 'senhas', nome: 'Senhas das caixas no cofre', feito: e.caixasAtivas > 0 && e.caixasComSenha >= e.caixasAtivas, manual: false, detalhe: e.caixasAtivas === 0 ? 'Nenhuma caixa ativa.' : `${e.caixasComSenha} de ${e.caixasAtivas} caixas com senha configurada. A tela nunca mostra a senha.` },
    { id: 'dns', nome: 'SPF, DKIM e DMARC conferidos', feito: !!m.dns, manual: true, detalhe: e.marcas == null ? 'Marcação disponível depois que a migration 0200 for aplicada.' : 'Confira no provedor de e-mail e marque aqui.' },
    { id: 'descadastrar', nome: 'Caixa descadastrar@ funcionando', feito: !!m.descadastrar, manual: true, detalhe: e.marcas == null ? 'Marcação disponível depois que a migration 0200 for aplicada.' : 'Mande um teste para a caixa e marque aqui.' },
    { id: 'travas', nome: 'Modo teste e aprovação ligados', feito: e.flags.PROSPECCAO_MODO_TESTE === 'sim' && e.flags.PROSPECCAO_APROVACAO_OBRIGATORIA === 'sim', manual: false, detalhe: 'As duas travas precisam estar ligadas no primeiro envio.' },
  ]
  const feitos = itens.filter((i) => i.feito).length
  return { itens, feitos, total: itens.length, completo: feitos === itens.length }
}

// ---- pausar / retomar -----------------------------------------------------------------------------------
export type ComandoLinha = { robo_id: string | null; comando: string; status: string; criado_em: string }
// Pausado = o último pedido de pausar/retomar para o robô foi pausar.
export function robPausado(roboId: string, comandos: ComandoLinha[]): boolean {
  const c = comandos.filter((x) => x.robo_id === roboId && (x.comando === 'pausar' || x.comando === 'retomar')).sort((a, b) => Date.parse(b.criado_em) - Date.parse(a.criado_em))[0]
  return c?.comando === 'pausar'
}

// ---- prefixos do setor certo -----------------------------------------------------------------------------
export function limparPrefixos(lista: unknown): string[] {
  if (!Array.isArray(lista)) return []
  const vistos = new Set<string>()
  for (const x of lista) {
    const p = String(x ?? '').trim().toLowerCase().replace(/@.*$/, '')
    if (/^[a-z0-9][a-z0-9._-]{0,30}$/.test(p)) vistos.add(p)
  }
  return [...vistos].slice(0, 30)
}
export function metasDoParametro(texto: string | undefined, padrao: { contatos: number; base: number }) {
  try {
    const o = JSON.parse(texto ?? '') as Record<string, unknown>
    const c = Number(o.contatos), b = Number(o.base)
    return { contatos: Number.isFinite(c) && c >= 0 ? c : padrao.contatos, base: Number.isFinite(b) && b >= 0 ? b : padrao.base }
  } catch { return padrao }
}

// ---- resumo do dia / fila ao vivo -----------------------------------------------------------------------
export type PassoLista = { nome: string; estado: 'feito' | 'rodando' | 'espera'; detalhe: string }
export function passosDoResumo(resumo: unknown): PassoLista[] {
  const l = (resumo as { passos?: unknown } | null)?.passos
  if (!Array.isArray(l)) return []
  return (l as Record<string, unknown>[]).filter((p) => p && typeof p.nome === 'string').slice(0, 30).map((p) => ({
    nome: String(p.nome), estado: p.estado === 'feito' || p.estado === 'rodando' ? p.estado : 'espera', detalhe: String(p.detalhe ?? ''),
  }))
}
export type TarefaFila = { titulo: string; estado: string }
export function filaDoResumo(resumo: unknown): TarefaFila[] {
  const l = (resumo as { fila_tms?: unknown } | null)?.fila_tms
  if (!Array.isArray(l)) return []
  return (l as Record<string, unknown>[]).filter((p) => p && typeof p.titulo === 'string').slice(0, 30).map((p) => ({ titulo: String(p.titulo), estado: String(p.estado ?? 'na fila') }))
}
// Últimas linhas do log ao vivo; tira o que parece segredo (chave, token, senha) antes de mostrar.
export function linhasAoVivo(resumo: unknown, max = 40): string[] {
  const l = (resumo as { log?: unknown } | null)?.log
  if (!Array.isArray(l)) return []
  return l.slice(-max).map((x) => String(x ?? '').slice(0, 300).replace(/bearer\s+\S+/gi, 'Bearer ***').replace(/((?:senha|password|token|secret|apikey|api_key|chave|authorization|bearer)\s*[:=]?\s*)\S+/gi, '$1***'))
}
