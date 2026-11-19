// Prospeccao, Etapas 3 e 4: regras PURAS das telas de caixa de e-mail (diagnostico em linguagem simples, Caixa de entrada, HTML seguro, atalhos).
// Nada aqui envia e-mail nem fala com o banco. Testes em gestor/test/prospeccaoCaixa.test.ts.

// ---- tipos (espelham as tabelas prospeccao_caixas / _conversas / _emails) -------------------------------
export type Caixa = {
  id: string; endereco: string; nome_exibicao: string; assinatura: string; papel: 'agente_1' | 'agente_2' | 'reserva'; ativa: boolean; limite_diario: number
  intervalo_min_seg: number; segredo_senha: string; pasta_entrada: string; pasta_enviados: string | null; pasta_spam: string | null; pasta_lixo: string | null
  guardar_copia_enviados: boolean; leitura_a_cada_min: number; modo_caixa_completa: boolean; idle_suportado: boolean | null; idle_ligado: boolean
  ultima_leitura_em: string | null; ultimo_diagnostico_em: string | null; ultimo_diagnostico_resumo: Cor | null; parada_motivo: string | null; recuo_nivel: number
}
export type StatusConversa = 'nova' | 'precisa_de_voce' | 'rascunho_pronto' | 'aguardando_cliente' | 'assumida' | 'encerrada'
export type Conversa = {
  id: string; empresa_id: string | null; caixa_id: string; assunto: string; status: StatusConversa; ultima_mensagem_em: string; nao_lidas: number
  assumida_por: string | null; classificacao_ia: string | null; resumo_ia: string | null; dados_extraidos: Record<string, string>; ia_pausada: boolean
  exemplo?: boolean
}
export type Anexo = { nome: string; tipo?: string; tamanho?: number }
export type EmailRow = {
  id: string; conversa_id: string; caixa_id: string; direcao: 'entrada' | 'saida'; message_id: string | null; in_reply_to: string | null; referencias: string | null
  de: string; para: string; cc: string | null; assunto: string; corpo_texto: string | null; corpo_html: string | null; anexos: Anexo[]; recebido_em: string; lido: boolean
  classificacao_ia: string | null; rascunho_ia: string | null; motivo_ia: string | null; status_envio: 'rascunho' | 'aprovado' | 'enviado' | 'falhou' | 'descartado' | 'incerto' | null
  erro: string | null; exemplo?: boolean
}

// ---- diagnostico da caixa em linguagem simples ----------------------------------------------------------
export type Cor = 'verde' | 'amarelo' | 'vermelho'
export type Achado = { item: string; cor: Cor; explicacao: string }
export type LinhaDiagnostico = {
  conexao_nuvem_ok: boolean | null; smtp_ok: boolean | null; imap_ok: boolean | null; idle_suportado: boolean | null; append_ok: boolean | null; flags_ok: boolean | null
  mover_ok: boolean | null; cabecalhos_preservados: Record<string, boolean> | null; servidor_guarda_enviados: boolean | null
  pastas_descobertas: { entrada: string; enviados: string | null; spam: string | null; lixo: string | null } | null
}
const CAB_ROTULO: Record<string, string> = { message_id: 'Message-ID', in_reply_to: 'In-Reply-To', references: 'References', list_unsubscribe: 'List-Unsubscribe', list_unsubscribe_post: 'List-Unsubscribe-Post' }
export function interpretarDiagnostico(d: LinhaDiagnostico): { resumo: Cor; achados: Achado[] } {
  const a: Achado[] = []
  const add = (item: string, ok: boolean | null, okTxt: string, ruimTxt: string, corRuim: Cor) =>
    a.push({ item, cor: ok === null ? 'amarelo' : ok ? 'verde' : corRuim, explicacao: ok === null ? 'Não foi possível testar.' : ok ? okTxt : ruimTxt })
  add('Conexão a partir da nuvem', d.conexao_nuvem_ok, 'O servidor da Hostinger aceitou a conexão vinda da nuvem (onde os robôs rodam).', 'A Hostinger não aceitou a conexão vinda da nuvem. Sem isso os robôs não funcionam; fale com o suporte ou use outro servidor de envio.', 'vermelho')
  add('Envio (SMTP)', d.smtp_ok, 'A caixa consegue enviar e-mails.', 'Não foi possível enviar: confira a senha da caixa.', 'vermelho')
  add('Leitura (IMAP)', d.imap_ok, 'A caixa consegue ser lida.', 'Não foi possível ler a caixa: confira a senha da caixa.', 'vermelho')
  add('Aviso instantâneo (IDLE)', d.idle_suportado, 'O servidor aceita IDLE (opcional; o robô continua lendo a cada poucos minutos).', 'Sem IDLE: o robô lê por consulta a cada 3 a 5 minutos. Sem problema.', 'amarelo')
  add('Cópia em Enviados (APPEND)', d.append_ok, 'Dá para gravar a cópia dos e-mails enviados.', 'Não deu para gravar a cópia em Enviados: os e-mails saem, mas não aparecem na pasta Enviados.', 'amarelo')
  add('Marcar como lido (flags)', d.flags_ok, 'Dá para marcar mensagens como lidas.', 'Não deu para marcar como lido por IMAP.', 'amarelo')
  add('Mover mensagens', d.mover_ok, 'Dá para mover mensagens entre pastas.', 'Não deu para mover mensagens por IMAP.', 'amarelo')
  if (d.servidor_guarda_enviados !== null) a.push({ item: 'Enviados automático', cor: 'verde', explicacao: d.servidor_guarda_enviados ? 'O servidor já guarda a cópia do que é enviado; o robô não vai duplicar.' : 'O servidor não guarda cópia sozinho; o robô grava a cópia em Enviados.' })
  if (d.cabecalhos_preservados) {
    const faltando = Object.entries(d.cabecalhos_preservados).filter(([, ok]) => !ok).map(([k]) => CAB_ROTULO[k] ?? k)
    a.push({
      item: 'Cabeçalhos preservados', cor: faltando.length === 0 ? 'verde' : faltando.every((f) => f.startsWith('List-')) ? 'amarelo' : 'vermelho',
      explicacao: faltando.length === 0 ? 'Message-ID, In-Reply-To, References e List-Unsubscribe chegaram intactos.'
        : `Não chegaram intactos: ${faltando.join(', ')}.${faltando.some((f) => !f.startsWith('List-')) ? ' Sem eles o robô não reconhece respostas.' : ' O descadastro de um clique pode não aparecer no Gmail/Outlook.'}`,
    })
  } else a.push({ item: 'Cabeçalhos preservados', cor: 'amarelo', explicacao: 'Não foi possível provar se os cabeçalhos sobrevivem.' })
  if (d.pastas_descobertas) {
    const p = d.pastas_descobertas
    a.push({ item: 'Pastas descobertas', cor: p.enviados ? 'verde' : 'amarelo', explicacao: `Entrada: ${p.entrada}; Enviados: ${p.enviados ?? 'não achei'}; Spam: ${p.spam ?? 'não achei'}; Lixo: ${p.lixo ?? 'não achei'}. Ajuste se estiver errado.` })
  }
  const resumo: Cor = a.some((x) => x.cor === 'vermelho') ? 'vermelho' : a.some((x) => x.cor === 'amarelo') ? 'amarelo' : 'verde'
  return { resumo, achados: a }
}
export const COR_HEX: Record<Cor, { bg: string; fg: string; ponto: string }> = {
  verde: { bg: '#E3F4EA', fg: '#1A6B3C', ponto: '#2e9e5b' }, amarelo: { bg: '#FFF0D6', fg: '#8A5A00', ponto: '#d9a21b' }, vermelho: { bg: '#FBE4E1', fg: '#B42318', ponto: '#c0392b' },
}

// ---- HTML seguro ----------------------------------------------------------------------------------------
// O corpo HTML de e-mails de terceiros NUNCA e mostrado como veio: reconstruimos so tags permitidas, sem atributos (exceto href seguro), sem script,
// sem estilo, sem imagem remota (vira um aviso). Qualquer "<" que sobrar e escapado.
const TAGS_OK = new Set(['p', 'br', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'a', 'blockquote', 'div', 'span', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'h1', 'h2', 'h3', 'h4', 'pre', 'code', 'hr'])
const TAGS_COM_CONTEUDO_REMOVIDO = /<(script|style|iframe|object|embed|svg|math|template|noscript|head|title|form|textarea|select|button)\b[\s\S]*?<\/\1\s*>/gi
const decodificarEntidades = (s: string) => s
  .replace(/&#x([0-9a-f]+);?/gi, (_, h: string) => String.fromCodePoint(Math.min(0x10ffff, parseInt(h, 16))))
  .replace(/&#(\d+);?/g, (_, n: string) => String.fromCodePoint(Math.min(0x10ffff, Number(n))))
  .replace(/&(colon|tab|newline|lt|gt|quot|apos|amp);?/gi, (_, n: string) => ({ colon: ':', tab: '\t', newline: '\n', lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' } as Record<string, string>)[n.toLowerCase()])
export function hrefSeguro(bruto: string): string | null {
  const limpo = decodificarEntidades(bruto).replace(/[\u0000- \u007f-\u009f]+/g, '')
  if (!/^(https?:\/\/|mailto:)/i.test(limpo)) return null
  return limpo.slice(0, 2000)
}
const escHtml = (s: string) => s.replace(/&(?![a-z0-9#]+;)/gi, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
export function sanitizarHtml(html: string): string {
  let t = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '').replace(TAGS_COM_CONTEUDO_REMOVIDO, '')
  let imagensBloqueadas = 0
  let saida = ''
  let ultimo = 0
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g
  for (let m = re.exec(t); m; m = re.exec(t)) {
    saida += escHtml(t.slice(ultimo, m.index))
    ultimo = m.index + m[0].length
    const fechando = m[1] === '/'
    const tag = m[2].toLowerCase()
    if (tag === 'img') { imagensBloqueadas++; continue }
    if (!TAGS_OK.has(tag)) continue
    if (fechando) { saida += `</${tag}>`; continue }
    if (tag === 'a') {
      const h = m[3].match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i)
      const seguro = h ? hrefSeguro(h[1] ?? h[2] ?? h[3] ?? '') : null
      saida += seguro ? `<a href="${escAttr(seguro)}" target="_blank" rel="noopener noreferrer nofollow" data-externo="1">` : '<a>'
    } else saida += tag === 'br' || tag === 'hr' ? `<${tag}>` : `<${tag}>`
  }
  saida += escHtml(t.slice(ultimo))
  if (imagensBloqueadas > 0) saida = `<p><em>[${imagensBloqueadas} imagem(ns) remota(s) bloqueada(s) por segurança]</em></p>${saida}`
  return saida
}
export const textoParaHtml = (texto: string) => escHtml(texto).replace(/\r?\n/g, '<br>')

// ---- lista de conversas ---------------------------------------------------------------------------------
export type FiltroConversa = 'precisa_de_voce' | 'rascunho_pronto' | 'cotacao' | 'assumidas' | 'devolucoes' | 'todas'
export const FILTROS: { valor: FiltroConversa; label: string }[] = [
  { valor: 'precisa_de_voce', label: 'Precisa de você' }, { valor: 'rascunho_pronto', label: 'Rascunho pronto' }, { valor: 'cotacao', label: 'Cotação' },
  { valor: 'assumidas', label: 'Assumidas' }, { valor: 'devolucoes', label: 'Devoluções' }, { valor: 'todas', label: 'Todas' },
]
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
export function filtrarConversas(lista: Conversa[], filtro: FiltroConversa, busca: string, nomeEmpresa: (c: Conversa) => string = () => ''): Conversa[] {
  const q = norm(busca.trim())
  return lista
    .filter((c) => {
      if (filtro === 'precisa_de_voce') return c.status === 'precisa_de_voce' || c.status === 'nova'
      if (filtro === 'rascunho_pronto') return c.status === 'rascunho_pronto'
      if (filtro === 'cotacao') return c.classificacao_ia === 'cotacao' || c.classificacao_ia === 'preco_prazo' || c.classificacao_ia === 'preco_prazo_negociacao'
      if (filtro === 'assumidas') return c.status === 'assumida'
      if (filtro === 'devolucoes') return c.classificacao_ia === 'devolucao' || c.classificacao_ia === 'devolucao_ou_resposta_automatica'
      return true
    })
    .filter((c) => !q || norm(`${c.assunto} ${nomeEmpresa(c)} ${c.classificacao_ia ?? ''}`).includes(q))
    .sort((a, b) => b.ultima_mensagem_em.localeCompare(a.ultima_mensagem_em))
}
export const ROTULO_CLASSE: Record<string, { texto: string; cor: Cor | 'neutro' }> = {
  cotacao: { texto: 'Cotação', cor: 'verde' }, preco_prazo: { texto: 'Preço/prazo', cor: 'verde' }, preco_prazo_negociacao: { texto: 'Negociação', cor: 'amarelo' },
  nao_sou_eu: { texto: 'Indicação', cor: 'amarelo' }, indicacao: { texto: 'Indicação', cor: 'amarelo' }, agora_nao: { texto: 'Agora não', cor: 'neutro' },
  fora_do_escritorio: { texto: 'Fora do escritório', cor: 'neutro' }, sair: { texto: 'Descadastro', cor: 'vermelho' }, reclamacao: { texto: 'Reclamação', cor: 'vermelho' },
  recusa_carga: { texto: 'Carga recusada', cor: 'neutro' }, duvida: { texto: 'Dúvida', cor: 'amarelo' }, cosmeticos: { texto: 'Cosméticos', cor: 'amarelo' },
  devolucao: { texto: 'Devolução', cor: 'vermelho' }, devolucao_ou_resposta_automatica: { texto: 'Automática', cor: 'neutro' }, outro: { texto: 'Outro', cor: 'neutro' },
}
export function horaCurta(iso: string, agora = new Date()): string {
  const d = new Date(iso)
  const mesmoDia = d.toDateString() === agora.toDateString()
  return mesmoDia ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}
export const trecho = (t: string | null, n = 90) => (t ?? '').replace(/\s+/g, ' ').trim().slice(0, n)

// ---- resposta -------------------------------------------------------------------------------------------
export const assuntoResposta = (a: string) => (/^\s*re:/i.test(a) ? a.trim() : `Re: ${a.trim()}`)
export const assuntoEncaminhar = (a: string) => (/^\s*(enc|fwd?):/i.test(a) ? a.trim() : `Enc: ${a.trim()}`)
export const enderecoLimpo = (s: string) => (s.match(/[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/i)?.[0] ?? '').toLowerCase()
/** Responder: so o remetente. Responder a todos: remetente + demais, sem repetir e sem as caixas nossas. */
export function destinatariosResposta(e: Pick<EmailRow, 'de' | 'para' | 'cc'>, todos: boolean, nossos: string[]): { para: string[]; cc: string[] } {
  const meus = new Set(nossos.map((x) => x.toLowerCase()))
  const quem = enderecoLimpo(e.de)
  const para = quem && !meus.has(quem) ? [quem] : []
  if (!todos) return { para, cc: [] }
  const extras = `${e.para ?? ''},${e.cc ?? ''}`.split(/[,;]+/).map(enderecoLimpo).filter((x) => x && !meus.has(x) && !para.includes(x))
  return { para, cc: [...new Set(extras)] }
}
export function citacao(e: Pick<EmailRow, 'de' | 'recebido_em' | 'corpo_texto'>): string {
  const quando = new Date(e.recebido_em).toLocaleString('pt-BR')
  return `\n\nEm ${quando}, ${e.de} escreveu:\n${(e.corpo_texto ?? '').split(/\r?\n/).slice(0, 40).map((l) => `> ${l}`).join('\n')}`
}
export const LIMITE_ANEXO_BYTES = 25 * 1024 * 1024
export function anexosValidos(arquivos: { name: string; size: number }[]): string | null {
  const total = arquivos.reduce((s, a) => s + a.size, 0)
  if (total > LIMITE_ANEXO_BYTES) return `Os anexos somam ${(total / 1048576).toFixed(1)} MB; o limite é 25 MB.`
  return null
}
/** Cadeia References para a resposta: a do e-mail original + o message_id dele. */
export function referenciasDaResposta(e: Pick<EmailRow, 'message_id' | 'referencias'>): string | null {
  const cadeia = (e.referencias ?? '').split(/\s+/).filter(Boolean)
  if (e.message_id && !cadeia.includes(e.message_id)) cadeia.push(e.message_id)
  return cadeia.length ? cadeia.join(' ') : null
}

// ---- atalhos de teclado (j/k navegar, r responder, e encerrar, a assumir) ------------------------------
export type AcaoAtalho = 'proxima' | 'anterior' | 'responder' | 'encerrar' | 'assumir' | null
export function acaoDoAtalho(tecla: string, ctrl = false, alvoEhCampo = false): AcaoAtalho {
  if (ctrl || alvoEhCampo) return null
  return ({ j: 'proxima', k: 'anterior', r: 'responder', e: 'encerrar', a: 'assumir' } as Record<string, AcaoAtalho>)[tecla.toLowerCase()] ?? null
}

// ---- dados de exemplo (NUNCA gravados; so aparecem enquanto nao houver nenhuma conversa real) ------------
export function exemplos(agora = new Date()): { conversas: Conversa[]; emails: EmailRow[] } {
  const min = (m: number) => new Date(agora.getTime() - m * 60_000).toISOString()
  const base = { empresa_id: null, caixa_id: 'exemplo', assumida_por: null, resumo_ia: null, ia_pausada: false, exemplo: true as const }
  const conversas: Conversa[] = [
    { ...base, id: 'ex-1', assunto: 'Re: Frete de bebidas saindo de Jundiaí (RBR Cargo)', status: 'precisa_de_voce', ultima_mensagem_em: min(14), nao_lidas: 1, classificacao_ia: 'cotacao',
      dados_extraidos: { origem: 'Jundiaí/SP', destino: 'Recife/PE', carga: 'bebidas, 24 t', veiculo: 'carreta baú', whatsapp: '(11) 90000-0000' } },
    { ...base, id: 'ex-2', assunto: 'Re: Frete de alimentos saindo de Campinas (RBR Cargo)', status: 'rascunho_pronto', ultima_mensagem_em: min(95), nao_lidas: 1, classificacao_ia: 'nao_sou_eu', dados_extraidos: {} },
    { ...base, id: 'ex-3', assunto: 'Re: Frete de plásticos saindo de Sorocaba (RBR Cargo)', status: 'aguardando_cliente', ultima_mensagem_em: min(60 * 26), nao_lidas: 0, classificacao_ia: null, dados_extraidos: {} },
  ]
  const email = (o: Partial<EmailRow> & Pick<EmailRow, 'id' | 'conversa_id' | 'direcao' | 'de' | 'para' | 'assunto' | 'corpo_texto' | 'recebido_em'>): EmailRow => ({
    caixa_id: 'exemplo', message_id: null, in_reply_to: null, referencias: null, cc: null, corpo_html: null, anexos: [], lido: true, classificacao_ia: null, rascunho_ia: null,
    motivo_ia: null, status_envio: o.direcao === 'saida' ? 'enviado' : null, erro: null, exemplo: true, ...o,
  })
  const emails: EmailRow[] = [
    email({ id: 'ex-1a', conversa_id: 'ex-1', direcao: 'saida', de: 'pedro@rbrcargo.com.br', para: 'compras@exemplo.com.br', assunto: conversas[0].assunto.replace('Re: ', ''), corpo_texto: 'Olá, tudo bem?\n\nMeu nome é Pedro, da RBR Cargo…', recebido_em: min(60 * 24) }),
    email({ id: 'ex-1b', conversa_id: 'ex-1', direcao: 'entrada', de: 'Compras Exemplo <compras@exemplo.com.br>', para: 'pedro@rbrcargo.com.br', assunto: conversas[0].assunto, lido: false, classificacao_ia: 'cotacao',
      corpo_texto: 'Bom dia, Pedro. Temos interesse. Despachamos umas 12 cargas por semana de Jundiaí para o Nordeste. Podem me passar uma cotação para Recife, carreta baú, 24 toneladas?', recebido_em: min(14),
      rascunho_ia: 'Bom dia! Obrigado pelo retorno. Já registrei sua solicitação de Jundiaí para Recife (carreta baú, 24 t) e o José Carlos retorna em breve com a cotação.', motivo_ia: 'Pediu cotação com origem, destino e carga: o rascunho confirma o recebimento sem falar de valor ou prazo.' }),
    email({ id: 'ex-2a', conversa_id: 'ex-2', direcao: 'entrada', de: 'Ana <logistica@exemplo2.com.br>', para: 'pedro@rbrcargo.com.br', assunto: conversas[1].assunto, lido: false, classificacao_ia: 'nao_sou_eu', corpo_texto: 'Não sou eu quem cuida disso, fale com o Carlos: carlos@exemplo2.com.br', recebido_em: min(95), rascunho_ia: 'Obrigado pela indicação, Ana! Vou falar com o Carlos.', motivo_ia: 'Indicação de outro contato: agradece e registra o novo contato.' }),
    email({ id: 'ex-3a', conversa_id: 'ex-3', direcao: 'saida', de: 'comercial@rbrcargo.com.br', para: 'contato@exemplo3.com.br', assunto: conversas[2].assunto.replace('Re: ', ''), corpo_texto: 'Olá, tudo bem?…', recebido_em: min(60 * 26) }),
  ]
  return { conversas, emails }
}
