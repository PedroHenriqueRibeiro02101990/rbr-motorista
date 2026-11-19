// Radar (prospecção ativa): regras PURAS do módulo (sem rede, sem React). Testadas em gestor/test/radar.test.ts.
import { parseCsv, soDigitos } from './prospeccao.ts'

// ---- visibilidade do módulo (R2) -----------------------------------------------------------------------
/** Com PROSPECCAO_UI_LIBERADA = nao, só o usuário do Pedro vê (selo "Em teste"). Com "sim", todo gestor_rbr vê. */
export function visibilidadeRadar(o: { papel: string | null | undefined; flagUi: string | null | undefined; ehPedro: boolean }): { visivel: boolean; emTeste: boolean } {
  if (o.papel !== 'gestor_rbr') return { visivel: false, emTeste: false }
  if (o.flagUi === 'sim') return { visivel: true, emTeste: false }
  return { visivel: o.ehPedro, emTeste: o.ehPedro }
}

// ---- segmentos (R4) ------------------------------------------------------------------------------------
export const SEGMENTOS_RADAR: readonly { slug: string; label: string; base: string }[] = [
  { slug: 'alimentos', label: 'Alimentos', base: 'Alimentos' },
  { slug: 'bebidas', label: 'Bebidas', base: 'Bebidas' },
  { slug: 'plasticos', label: 'Plásticos', base: 'Plásticos' },
  { slug: 'metalurgia', label: 'Metalurgia', base: 'Metalurgia' },
  { slug: 'maquinas', label: 'Máquinas', base: 'Máquinas' },
  { slug: 'estruturas_galpoes', label: 'Estruturas metálicas e galpões', base: 'Estruturas metálicas e galpões' },
  { slug: 'eventos_shows', label: 'Eventos e shows', base: 'Eventos e shows' },
  { slug: 'papel_embalagens', label: 'Papel e embalagens', base: 'Papel e embalagens' },
  { slug: 'atacadistas', label: 'Atacadistas', base: 'Atacadistas' },
  { slug: 'autopecas', label: 'Autopeças', base: 'Autopeças' },
  { slug: 'moveis_colchoes', label: 'Móveis e colchões', base: 'Móveis e colchões' },
  { slug: 'eletro_eletronicos', label: 'Eletrodomésticos e eletrônicos', base: 'Eletrodomésticos e eletrônicos' },
  { slug: 'locacao_maquinas', label: 'Locação de máquinas pesadas', base: 'Locação de máquinas pesadas' },
  { slug: 'maquinas_agricolas', label: 'Máquinas agrícolas', base: 'Máquinas agrícolas' },
  { slug: 'reciclagem_sucata', label: 'Reciclagem e sucata', base: 'Reciclagem e sucata' },
  { slug: 'pneus_borracha', label: 'Pneus e borracha', base: 'Pneus e borracha' },
  { slug: 'ceramica', label: 'Cerâmica', base: 'Cerâmica' },
  { slug: 'cimento', label: 'Cimento', base: 'Cimento' },
]
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
/** Espelho de radar_segmento_slug() do banco: converte o texto de segmento_rbr no slug de prospeccao_empresas.segmento. */
export function slugDoSegmento(txt: string | null | undefined): string | null {
  const s = semAcento(txt ?? '')
  const regras: [RegExp, string][] = [
    [/estrutura|galpo/, 'estruturas_galpoes'], [/evento|show/, 'eventos_shows'], [/papel|embalagem/, 'papel_embalagens'], [/atacad/, 'atacadistas'],
    [/autopeca|auto peca/, 'autopecas'], [/movel|moveis|colchoe/, 'moveis_colchoes'], [/eletrodomestic|eletronic/, 'eletro_eletronicos'],
    [/locacao/, 'locacao_maquinas'], [/agricola/, 'maquinas_agricolas'], [/recicla|sucata/, 'reciclagem_sucata'], [/pneu|borracha/, 'pneus_borracha'],
    [/ceramic/, 'ceramica'], [/cimento/, 'cimento'], [/aliment/, 'alimentos'], [/bebida/, 'bebidas'], [/plastic/, 'plasticos'], [/metalurg/, 'metalurgia'], [/maquina/, 'maquinas'],
  ]
  return regras.find(([r]) => r.test(s))?.[1] ?? null
}
/** Espelho de radar_restricao_cnae(): restrição por CNAE (química, fertilizante, medicamento, cosmético). Nunca exclui, só avisa. */
export function restricaoDoCnae(cnae: string | null | undefined): 'quimico' | 'fertilizante' | 'medicamento' | 'cosmetico' | null {
  const d = soDigitos(cnae ?? '')
  if (d.startsWith('2013')) return 'fertilizante'
  if (d.startsWith('2063')) return 'cosmetico'
  if (d.startsWith('21')) return 'medicamento'
  if (d.startsWith('20')) return 'quimico'
  return null
}
export const RESTRICAO_LABEL: Record<string, string> = { quimico: 'Química: confira a carga', fertilizante: 'Fertilizante: não atendemos', medicamento: 'Medicamento: confira a carga', cosmetico: 'Cosmético: confira a carga' }

// ---- busca (R4) ----------------------------------------------------------------------------------------
export type EmpresaBase = {
  cnpj: string; razao_social: string; nome_fantasia?: string | null; segmento_rbr: string | null; porte: string | null; municipio: string | null; uf?: string | null
  distancia_km: number | null; email: string | null; dominio_valido: boolean; prioridade?: string | null; restricao?: string | null; ja_na_lista: boolean; gigante: boolean; cnae_descricao?: string | null
}
export type FiltrosBusca = {
  raio: number; segmentos: string[]; portes: string[]; gigantes: boolean; so_email: boolean; so_validado: boolean; so_nova: boolean; q: string; pagina?: number; tamanho?: number
}
export const FILTROS_PADRAO: FiltrosBusca = { raio: 150, segmentos: [], portes: ['ME', 'EPP', 'Demais'], gigantes: false, so_email: true, so_validado: false, so_nova: true, q: '' }
/** Espelho de radar_buscar_base(): usado no modo "Ver com exemplos" e nos testes. A busca real roda no banco, paginada. */
export function filtrarBase(lista: readonly EmpresaBase[], f: FiltrosBusca): EmpresaBase[] {
  const q = semAcento(f.q.trim())
  return lista.filter((e) => {
    if ((e.porte ?? '').toUpperCase() === 'MEI') return false
    if (e.distancia_km != null && e.distancia_km > f.raio) return false
    if (f.segmentos.length && !(e.segmento_rbr && f.segmentos.includes(e.segmento_rbr))) return false
    if (e.gigante && !f.gigantes) return false
    if (f.portes.length && !(e.porte && f.portes.includes(e.porte)) && !(e.gigante && f.gigantes)) return false
    if (f.so_email && !e.email) return false
    if (f.so_validado && !e.dominio_valido) return false
    if (f.so_nova && e.ja_na_lista) return false
    if (q && !semAcento(`${e.razao_social} ${e.nome_fantasia ?? ''} ${e.municipio ?? ''} ${e.cnae_descricao ?? ''}`).includes(q)) return false
    return true
  })
}
export function kpisBusca(lista: readonly EmpresaBase[]) {
  const n = lista.length
  const comKm = lista.filter((e) => e.distancia_km != null)
  return {
    encontradas: n, comDominio: lista.filter((e) => e.dominio_valido).length,
    prontas: lista.filter((e) => e.dominio_valido && e.email && !e.ja_na_lista).length,
    kmMedio: comKm.length ? Math.round(comKm.reduce((s, e) => s + (e.distancia_km as number), 0) / comKm.length) : 0,
  }
}
export function filtrosParaRpc(f: FiltrosBusca) {
  return { raio: f.raio, segmentos: f.segmentos, portes: f.portes, gigantes: f.gigantes, so_email: f.so_email, so_validado: f.so_validado, so_nova: f.so_nova, q: f.q.trim(), pagina: f.pagina ?? 1, tamanho: f.tamanho ?? 50 }
}

// ---- importador da base (R4) ---------------------------------------------------------------------------
export const COLUNAS_BASE = ['prioridade', 'cnpj_formatado', 'razao_social', 'nome_fantasia', 'segmento_rbr', 'cnae_principal', 'cnae_descricao', 'porte', 'capital_social', 'matriz_filial',
  'gigante', 'data_inicio', 'logradouro', 'numero', 'complemento', 'bairro', 'municipio', 'uf', 'cep', 'distancia_km', 'telefone1', 'telefone2', 'email', 'dominio_email', 'dominio_valido', 'tem_site', 'motivo', 'origem'] as const
export type LinhaBase = Record<string, string>
export type ResultadoPreparo = { validas: LinhaBase[]; ignoradas: { linha: number; motivo: string }[] }
export const TAMANHO_BLOCO = 500
const EMAIL_SIMPLES = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/** Lê o CSV (separador ";", BOM) e separa linhas boas das ruins: CNPJ inválido, sem razão social, MEI, CNPJ repetido no arquivo, e-mail malformado vira vazio. */
export function prepararImportacaoBase(texto: string, opcoes: { gigantes?: boolean } = {}): ResultadoPreparo {
  const linhas = parseCsv(texto)
  const vistos = new Set<string>()
  const validas: LinhaBase[] = []
  const ignoradas: { linha: number; motivo: string }[] = []
  linhas.forEach((l, i) => {
    const n = i + 2
    const cnpj = soDigitos(l.cnpj || l.cnpj_formatado || '')
    if (cnpj.length !== 14) return void ignoradas.push({ linha: n, motivo: 'CNPJ inválido' })
    if (!(l.razao_social ?? '').trim()) return void ignoradas.push({ linha: n, motivo: 'sem razão social' })
    if ((l.porte ?? '').toUpperCase() === 'MEI') return void ignoradas.push({ linha: n, motivo: 'MEI não entra' })
    if (vistos.has(cnpj)) return void ignoradas.push({ linha: n, motivo: 'CNPJ repetido no arquivo' })
    vistos.add(cnpj)
    const email = (l.email ?? '').trim().toLowerCase()
    validas.push({ ...l, cnpj, email: EMAIL_SIMPLES.test(email) ? email : '', ...(opcoes.gigantes ? { gigante: 'sim' } : {}) })
  })
  return { validas, ignoradas }
}
export function emBlocos<T>(lista: readonly T[], tamanho = TAMANHO_BLOCO): T[][] {
  const out: T[][] = []
  for (let i = 0; i < lista.length; i += tamanho) out.push(lista.slice(i, i + tamanho))
  return out
}
export type Totais = { novos: number; atualizados: number; ignorados: number }
export const somarTotais = (a: Totais, b: Partial<Totais>): Totais => ({ novos: a.novos + (b.novos ?? 0), atualizados: a.atualizados + (b.atualizados ?? 0), ignorados: a.ignorados + (b.ignorados ?? 0) })

// ---- etapas das empresas (R5) --------------------------------------------------------------------------
export type Etapa = 'nova' | 'sequencia' | 'respondeu' | 'quente' | 'cliente' | 'repouso' | 'bloqueada'
export const ETAPAS: readonly { id: Etapa; label: string; cor: string }[] = [
  { id: 'nova', label: 'Nova', cor: '#8C95B8' }, { id: 'sequencia', label: 'Em sequência', cor: '#2B58C9' }, { id: 'respondeu', label: 'Respondeu', cor: '#16774B' },
  { id: 'quente', label: 'Quente', cor: '#D9AE5E' }, { id: 'cliente', label: 'Cliente', cor: '#1A2470' }, { id: 'repouso', label: 'Repouso', cor: '#A3ADD6' }, { id: 'bloqueada', label: 'Bloqueada', cor: '#B3342A' },
]
const ETAPA_DO_STATUS: Record<string, Etapa> = {
  novo: 'nova', qualificado: 'nova', em_aprovacao: 'sequencia', em_contato: 'sequencia', respondeu: 'respondeu', quente: 'quente', cliente: 'cliente',
  repouso: 'repouso', descartado: 'bloqueada', descadastrado: 'bloqueada',
}
export const etapaDoStatus = (status: string): Etapa => ETAPA_DO_STATUS[status] ?? 'nova'
export function contarEtapas(empresas: readonly { status: string }[]): Record<Etapa | 'todas', number> {
  const c: Record<string, number> = { todas: empresas.length, nova: 0, sequencia: 0, respondeu: 0, quente: 0, cliente: 0, repouso: 0, bloqueada: 0 }
  for (const e of empresas) c[etapaDoStatus(e.status)]++
  return c as Record<Etapa | 'todas', number>
}
/** Status para onde cada ação manda a empresa. Bloquear e converter são decisões do Pedro; mandar para o agente só vale para quem ainda é "nova". */
export function statusAposAcao(acao: 'mandar_agente' | 'bloquear' | 'cliente', statusAtual: string): string {
  if (acao === 'bloquear') return 'descartado'
  if (acao === 'cliente') return 'cliente'
  return statusAtual === 'novo' ? 'qualificado' : statusAtual
}
export function proximaAcaoEmpresa(e: { status: string; repouso_ate?: string | null }): string {
  switch (etapaDoStatus(e.status)) {
    case 'nova': return e.status === 'qualificado' ? 'Esperando o agente escrever o toque 1' : 'Mandar para o agente'
    case 'sequencia': return e.status === 'em_aprovacao' ? 'Aprovar o e-mail em Aprovar envios' : 'Aguardando resposta'
    case 'respondeu': return 'Tratar a resposta na Caixa de e-mail'
    case 'quente': return 'Assumir e mandar cotação'
    case 'cliente': return 'Cliente ativo'
    case 'repouso': return e.repouso_ate ? `Volta em ${e.repouso_ate.split('-').reverse().join('/')}` : 'Em repouso'
    default: return 'Bloqueada: não recebe e-mail'
  }
}

// ---- aprovar envios (R6) -------------------------------------------------------------------------------
export type RiscoEnvio = { nivel: 'baixo' | 'medio'; motivos: string[] }
/** Risco por regra simples (documentada no relatório): médio se faixa B/C, e-mail pessoal, distância acima de 100 km, segmento ainda sem envio, ou restrição de carga. */
export function riscoEnvio(o: { classe: string; tipoEmail: string; distanciaKm?: number | null; segmentoNovo?: boolean; restricao?: string | null }): RiscoEnvio {
  const motivos: string[] = []
  if (o.classe !== 'A') motivos.push(`Faixa ${o.classe}`)
  if (o.tipoEmail !== 'generico') motivos.push('E-mail pessoal, não de logística ou compras')
  if ((o.distanciaKm ?? 0) > 100) motivos.push(`${Math.round(o.distanciaKm as number)} km: fora do raio padrão`)
  if (o.segmentoNovo) motivos.push('Primeira empresa do segmento')
  if (o.restricao) motivos.push(RESTRICAO_LABEL[o.restricao] ?? 'Carga com restrição')
  return { nivel: motivos.length ? 'medio' : 'baixo', motivos }
}
export type ChecagemEnvio = { ok: boolean; itens: { texto: string; ok: boolean }[] }
/** Checagens do e-mail montado: sem preço, sem prazo, fora do bloqueio. */
export function checagensEmail(corpo: string, assunto: string, bloqueado: boolean): ChecagemEnvio {
  const t = semAcento(`${assunto}\n${corpo}`)
  const itens = [
    { texto: 'Sem preço', ok: !/r\$\s*\d|\b\d+[.,]?\d*\s*(reais|por km)\b/.test(t) },
    { texto: 'Sem prazo', ok: !/\b(em|ate|no maximo)\s+\d+\s*(horas?|dias?)\b|\bprazo de\b/.test(t) },
    { texto: 'Fora do bloqueio', ok: !bloqueado },
  ]
  return { ok: itens.every((i) => i.ok), itens }
}
/** Só aprova o que passa: contato inválido/devolvido, bloqueado ou texto com preço/prazo não vai. */
export function podeAprovarMensagem(o: { validacao: string | null | undefined; bloqueado: boolean; checagem: ChecagemEnvio; classe: string }): string | null {
  if (o.bloqueado) return 'E-mail ou domínio na lista de bloqueio.'
  if (o.validacao === 'invalido' || o.validacao === 'devolvido' || o.validacao === 'pendente') return 'E-mail ainda não validado ou inválido.'
  if (o.classe === 'C') return 'Empresa de faixa C não recebe e-mail.'
  if (!o.checagem.ok) return 'O texto tem preço ou prazo: edite antes de aprovar.'
  return null
}
export const aprovarLote = <T extends { risco: RiscoEnvio['nivel']; aprovavel: boolean }>(lista: readonly T[]) => lista.filter((x) => x.risco === 'baixo' && x.aprovavel)

// ---- envio manual da Caixa (R7) ------------------------------------------------------------------------
export type DecisaoEnvioManual =
  | { acao: 'salvar_rascunho'; motivo: string }
  | { acao: 'enviar'; destinatarios: string[]; assunto: string; teste: boolean }
  | { acao: 'recusar'; motivo: string }
/** Obedece ENVIO_LIBERADO (desligado = salva rascunho) e MODO_TESTE (em teste vai só para os destinos de teste, com [TESTE] no assunto). */
export function decidirEnvioManual(o: { envioLiberado: boolean; modoTeste: boolean; para: string[]; assunto: string; destinosTeste: string[]; bloqueados?: string[] }): DecisaoEnvioManual {
  if (!o.para.length || o.para.some((e) => !EMAIL_SIMPLES.test(e))) return { acao: 'recusar', motivo: 'Informe um e-mail válido em Para.' }
  if (!o.envioLiberado) return { acao: 'salvar_rascunho', motivo: 'Envio desligado nos Ajustes: salvo como rascunho.' }
  const bloq = new Set((o.bloqueados ?? []).map((b) => b.toLowerCase()))
  if (o.para.some((e) => bloq.has(e.toLowerCase()))) return { acao: 'recusar', motivo: 'Destinatário na lista de bloqueio.' }
  if (o.modoTeste) {
    if (!o.destinosTeste.length) return { acao: 'recusar', motivo: 'Modo teste ligado e nenhum destino de teste cadastrado.' }
    return { acao: 'enviar', destinatarios: o.destinosTeste, assunto: o.assunto.startsWith('[TESTE]') ? o.assunto : `[TESTE] ${o.assunto}`, teste: true }
  }
  return { acao: 'enviar', destinatarios: o.para, assunto: o.assunto, teste: false }
}

// ---- jornada (R8) --------------------------------------------------------------------------------------
export type ModoResposta = 'rascunho' | 'sozinho' | 'nunca'
export const CLASSES_TRAVADAS: Record<string, ModoResposta> = { cotacao: 'rascunho', preco_prazo: 'rascunho', reclamacao: 'nunca', sair: 'sozinho' }
/** Modos que a tela deixa escolher. Cotação e preço nunca vão sozinhos; reclamação nunca é respondida; sair é sempre automático; classe personalizada só rascunho. */
export function modosPermitidos(classe: string, personalizada = false): ModoResposta[] {
  if (classe in CLASSES_TRAVADAS) return [CLASSES_TRAVADAS[classe]]
  return personalizada ? ['rascunho'] : ['rascunho', 'sozinho']
}
export const modoValido = (classe: string, modo: ModoResposta, personalizada = false) => modosPermitidos(classe, personalizada).includes(modo)
/** "Responder sozinho" só tem efeito com RESPOSTA_AUTOMATICA_LIBERADA = sim. */
export function modoEfetivo(classe: string, modo: ModoResposta, respostaAutomaticaLiberada: boolean, personalizada = false): ModoResposta {
  if (!modoValido(classe, modo, personalizada)) return CLASSES_TRAVADAS[classe] ?? 'rascunho'
  if (modo === 'sozinho' && classe !== 'sair' && !respostaAutomaticaLiberada) return 'rascunho'
  return modo
}
export const VARIAVEIS_RESPOSTA = ['nome', 'empresa', 'cidade', 'segmento_frase', 'veiculo'] as const
export function validarTextoResposta(texto: string): string | null {
  if (!texto.trim()) return 'Escreva o texto da resposta.'
  if (/<\/?[a-z][\s\S]*?>/i.test(texto)) return 'O texto não pode conter HTML.'
  for (const m of texto.matchAll(/\{([^{}]*)\}/g)) if (!(VARIAVEIS_RESPOSTA as readonly string[]).includes(m[1])) return `Variável desconhecida: {${m[1]}}.`
  return null
}
export function slugClasse(titulo: string): string {
  const s = semAcento(titulo).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)
  return s ? `custom_${s}` : ''
}

// ---- nós do mapa da jornada (R8): posição das linhas calculada por quem desenha ----------------------
export type NoMapa = { id: string; col: 0 | 1 | 2; pai?: string; tipo?: 'root' | 'hot' | 'auto' | 'stop' | 'wait'; titulo: string; sub: string; classe?: string; modelo?: string }
export const NOS_MAPA: readonly NoMapa[] = [
  { id: 'root', col: 0, tipo: 'root', titulo: 'E-mail do toque', sub: 'T1 no dia 0, depois T2, T3 e T4' },
  { id: 'resp', col: 1, titulo: 'Cliente respondeu', sub: 'o agente lê e classifica' },
  { id: 'sem', col: 1, tipo: 'wait', titulo: 'Não respondeu', sub: 'segue a sequência' },
  { id: 'cotacao', col: 2, pai: 'resp', tipo: 'hot', titulo: 'Pediu cotação', sub: 'vai para vocês dois', classe: 'cotacao', modelo: 'resp_cotacao' },
  { id: 'preco_prazo', col: 2, pai: 'resp', tipo: 'hot', titulo: 'Quanto custa?', sub: 'nunca passa preço', classe: 'preco_prazo', modelo: 'resp_preco' },
  { id: 'regiao', col: 2, pai: 'resp', tipo: 'auto', titulo: 'Atende minha região?', sub: 'resposta fixa', classe: 'regiao', modelo: 'resp_regiao' },
  { id: 'veiculos', col: 2, pai: 'resp', tipo: 'auto', titulo: 'Que veículos vocês têm?', sub: 'resposta fixa', classe: 'veiculos', modelo: 'resp_veiculos' },
  { id: 'seguro', col: 2, pai: 'resp', tipo: 'auto', titulo: 'Tem seguro?', sub: 'resposta fixa', classe: 'seguro', modelo: 'resp_seguro' },
  { id: 'agora_nao', col: 2, pai: 'resp', titulo: 'Agora não / já temos transportadora', sub: 'agradece e volta em 90 dias', classe: 'agora_nao', modelo: 'resp_agora_nao' },
  { id: 'nao_sou_eu', col: 2, pai: 'resp', titulo: 'Indicou outra pessoa', sub: 'cria o contato novo', classe: 'nao_sou_eu', modelo: 'resp_indicacao' },
  { id: 'sair', col: 2, pai: 'resp', tipo: 'stop', titulo: 'Pediu para sair', sub: 'bloqueia na hora', classe: 'sair', modelo: 'resp_sair' },
  { id: 'reclamacao', col: 2, pai: 'resp', tipo: 'stop', titulo: 'Reclamação', sub: 'para tudo', classe: 'reclamacao' },
  { id: 't2', col: 2, pai: 'sem', tipo: 'wait', titulo: 'Toque 2 · dia 3', sub: 'lembrete curto', modelo: 'toque2' },
  { id: 't3', col: 2, pai: 'sem', tipo: 'wait', titulo: 'Toque 3 · dia 7', sub: 'terceiro contato', modelo: 'toque3' },
  { id: 't4', col: 2, pai: 'sem', tipo: 'wait', titulo: 'Toque 4 · dia 14 → repouso', sub: 'último contato', modelo: 'toque4' },
]
export const corDaLinha = (tipo?: NoMapa['tipo']) => (tipo === 'hot' ? '#D9AE5E' : tipo === 'stop' ? '#B3342A' : tipo === 'auto' ? '#16774B' : '#CBD2E6')
/** Curva (Bézier) entre a borda direita do pai e a esquerda do filho. */
export function caminhoCurva(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const mx = (a.x + b.x) / 2
  return `M${a.x} ${a.y} C${mx} ${a.y} ${mx} ${b.y} ${b.x} ${b.y}`
}

// ---- Ajustes (R10) -------------------------------------------------------------------------------------
export const CHAVES_AJUSTES: readonly { chave: string; rotulo: string; exigeLigar: boolean }[] = [
  { chave: 'PROSPECCAO_UI_LIBERADA', rotulo: 'Interface liberada', exigeLigar: false },
  { chave: 'PROSPECCAO_ENVIO_LIBERADO', rotulo: 'Envio liberado', exigeLigar: true },
  { chave: 'PROSPECCAO_LEITURA_LIBERADA', rotulo: 'Leitura de respostas', exigeLigar: true },
  { chave: 'PROSPECCAO_RESPOSTA_AUTOMATICA_LIBERADA', rotulo: 'Resposta automática', exigeLigar: true },
  { chave: 'PROSPECCAO_APROVACAO_OBRIGATORIA', rotulo: 'Aprovação obrigatória', exigeLigar: false },
  { chave: 'PROSPECCAO_MODO_TESTE', rotulo: 'Modo teste', exigeLigar: false },
]
export function podeAlterarChave(o: { ehPedro: boolean; chave: string; novoValor: 'sim' | 'nao'; digitado?: string }): string | null {
  if (!o.ehPedro) return 'Só o Pedro altera as chaves.'
  const c = CHAVES_AJUSTES.find((x) => x.chave === o.chave)
  if (!c) return 'Chave desconhecida.'
  if (o.novoValor === 'sim' && c.exigeLigar && o.digitado !== 'LIGAR') return 'Para ligar, digite LIGAR.'
  return null
}
export function estadoCaixa(c: { ativa: boolean; senhaCadastrada: boolean | null | undefined }): { texto: string; tom: 'ok' | 'bad' | 'neutro' } {
  if (!c.ativa) return { texto: 'desligada', tom: 'neutro' }
  if (!c.senhaCadastrada) return { texto: 'senha faltando', tom: 'bad' }
  return { texto: 'ativa', tom: 'ok' }
}
export function bloqueioDoTexto(txt: string): { tipo: 'email' | 'dominio' | 'cnpj'; valor: string } | null {
  const v = txt.trim().toLowerCase()
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return { tipo: 'email', valor: v }
  if (/^@?[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v)) return { tipo: 'dominio', valor: v.replace(/^@/, '') }
  if (soDigitos(v).length === 14) return { tipo: 'cnpj', valor: soDigitos(v) }
  return null
}

// ---- Relatórios (R9) -----------------------------------------------------------------------------------
export const pct = (parte: number, total: number) => (total > 0 ? Math.round((parte / total) * 1000) / 10 : 0)
export const fmtPct = (n: number) => `${String(n).replace('.', ',')}%`
export const fmtBrl = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`
export const fmtInt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

// ---- Mini curso (R11) ----------------------------------------------------------------------------------
export type Licao = { titulo: string; duracao: string; texto: string; pontos: string[]; pergunta: string; opcoes: string[]; certa: number }
export const LICOES: readonly Licao[] = [
  { titulo: 'O que é o Radar', duracao: '2 min', texto: 'O Radar é o seu SDR automático. Ele pega empresas da base da Receita, dá uma nota para cada uma, escreve o primeiro e-mail, lê as respostas e só chama vocês quando vale a pena.', pontos: ['Você define quem buscar (Buscar clientes).', 'O agente escreve e você aprova (Aprovar envios).', 'As conversas ficam na Caixa de e-mail.'], pergunta: 'Quem decide o que sai enquanto a aprovação está ligada?', opcoes: ['O agente, sozinho', 'Você, aprovando cada e-mail', 'A Hostinger'], certa: 1 },
  { titulo: 'Buscando clientes', duracao: '2 min', texto: 'Na aba Buscar clientes você filtra a base por região, segmento, porte e tipo de e-mail. Marque as empresas e mande para a lista ou direto para o agente.', pontos: ['Raio a partir de São Paulo (capital).', 'Gigantes ficam desligadas por padrão.', 'Salve buscas para repetir depois.'], pergunta: 'O que fica sempre de fora da busca?', opcoes: ['MEI', 'Empresas de SP', 'Empresas com site'], certa: 0 },
  { titulo: 'A nota de cada empresa', duracao: '2 min', texto: 'A nota vai de 0 a 100 e mostra a chance de dar certo: porte, funcionários, segmento, e-mail de logística, distância e outros critérios. Os pesos ficam em Ajustes.', pontos: ['Faixa A: 70 ou mais.', 'Faixa B: 50 a 69.', 'Faixa C: abaixo de 50, não recebe e-mail.'], pergunta: 'Uma empresa com nota 72 está em qual faixa?', opcoes: ['A', 'B', 'C'], certa: 0 },
  { titulo: 'Aprovando envios', duracao: '2 min', texto: 'Na aba Aprovar envios aparecem os e-mails de primeiro contato e de continuação. Leia, edite se quiser e aprove. Os de baixo risco podem ser aprovados de uma vez.', pontos: ['Risco médio: confira antes.', '"Pedir outra versão" reescreve o texto.', 'Aprovado sai na próxima janela (seg a sex, 7h às 18h).'], pergunta: 'Onde ficam as respostas aos clientes?', opcoes: ['Em Aprovar envios', 'Na Caixa de e-mail', 'Em Ajustes'], certa: 1 },
  { titulo: 'Caixa de e-mail e leads quentes', duracao: '2 min', texto: 'A Caixa funciona como um e-mail comum: ler, responder, encaminhar, arquivar, estrela e anexos. A diferença é que o agente já classifica e sugere a resposta.', pontos: ['Lead quente avisa Pedro e José Carlos juntos.', 'Quem clicar em Assumir fica com a conversa.', 'Preço e prazo nunca saem pelo agente.'], pergunta: 'O que acontece com um pedido de cotação?', opcoes: ['O agente manda o preço', 'Vira lead quente para vocês', 'É arquivado'], certa: 1 },
  { titulo: 'A jornada em mapa', duracao: '2 min', texto: 'O mapa da Jornada mostra cada tipo de resposta do cliente e a resposta sugerida. Você edita o texto e escolhe se o agente só faz rascunho ou responde sozinho.', pontos: ['Libere "Responder sozinho" um tipo por vez.', 'Reclamação sempre para tudo.', 'Sem resposta segue T2, T3, T4 e repouso.'], pergunta: 'Qual tipo nunca é respondido sozinho?', opcoes: ['Atende minha região?', 'Pediu cotação', 'Tem seguro?'], certa: 1 },
  { titulo: 'Segurança e paradas', duracao: '3 min', texto: 'O agente para sozinho se algo der errado: 3 devoluções no dia, 1 reclamação, 5% de devolução nos últimos 40 envios ou aviso da Hostinger. Depois disso, só volta quando você religar.', pontos: ['Comece com 10 por dia e suba devagar.', 'Teto de IA: R$ 3 por dia.', 'Ligar o envio pede confirmação digitando LIGAR.'], pergunta: 'O que acontece depois de uma parada automática?', opcoes: ['Volta sozinho em 1 hora', 'Só volta quando você religar', 'Troca de caixa'], certa: 1 },
]
export const progressoCurso = (concluidas: readonly number[]) => Math.round((new Set(concluidas.filter((i) => i >= 0 && i < LICOES.length)).size / LICOES.length) * 100)
