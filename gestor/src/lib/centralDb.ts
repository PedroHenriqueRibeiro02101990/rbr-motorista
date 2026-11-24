// Acesso ao banco da Central. Mesma sessão e mesmas regras de RLS do gestor: quem decide é o banco, não a tela.
// Cada mudança grava em central_registro (e na auditoria) pela função central_registrar.
import { db } from './prospeccaoDb'
import { termoBusca, tipoEmail, valorDaFlag, PREFIXOS_SETOR, type RoboLinha } from './central'

export const CHAVES_FLAGS = [
  'CENTRAL_UI_LIBERADA', 'CENTRAL_IMPORTAR_AUTO', 'CENTRAL_SDR_CORTE_NOTA', 'CENTRAL_SDR_MAX_DIA',
  'PROSPECCAO_ENVIO_LIBERADO', 'PROSPECCAO_LEITURA_LIBERADA', 'PROSPECCAO_RESPOSTA_AUTOMATICA_LIBERADA', 'PROSPECCAO_APROVACAO_OBRIGATORIA', 'PROSPECCAO_MODO_TESTE',
]

function falhou(error: { message: string } | null) { if (error) throw new Error(error.message) }

export async function lerFlags(): Promise<Record<string, string>> {
  const { data, error } = await db.from('parametros_sistema').select('chave, valor').in('chave', CHAVES_FLAGS)
  falhou(error)
  return Object.fromEntries(((data ?? []) as { chave: string; valor: unknown }[]).map((x) => [x.chave, String(x.valor)]))
}

export async function ehAdmin(): Promise<boolean> {
  const { data, error } = await db.rpc('central_eh_admin')
  return !error && data === true
}
export async function ehSdr(): Promise<boolean> {
  const { data, error } = await db.rpc('central_eh_sdr')
  return !error && data === true
}

export type Comando = { id: string; robo_id: string | null; comando: string; parametros: Record<string, unknown> | null; status: string; resultado: string | null; progresso: Record<string, number> | null; criado_em: string; feito_em: string | null }
export type UsoLinha = { id: string; servico: string; periodo: 'dia' | 'mes'; referencia: string; usado: number; limite: number; atualizado_em: string }
export type Batimento = { maquina: string; ultimo_batimento: string; versao_agente: string | null; resumo_json: Record<string, unknown> | null }
export type RegistroLinha = { id: string; quando: string; quem: string; o_que: string; antes: Record<string, unknown> | null; depois: Record<string, unknown> | null; desfazivel: boolean; desfeito_em: string | null }

export async function carregarPainel() {
  const [robos, bat, uso, cmd, reg, sug, sdr] = await Promise.all([
    db.from('central_robos').select('*').order('nome'),
    db.from('central_heartbeat').select('*').order('ultimo_batimento', { ascending: false }).limit(5),
    db.from('central_uso').select('*').order('servico').order('referencia', { ascending: false }),
    db.from('central_comandos').select('*').order('criado_em', { ascending: false }).limit(40),
    db.from('central_registro').select('*').order('quando', { ascending: false }).limit(40),
    db.from('prospeccao_sugestoes').select('id', { count: 'exact', head: true }).eq('status', 'pendente'),
    db.from('central_sdr_fila').select('id', { count: 'exact', head: true }).eq('status', 'na_fila'),
  ])
  for (const r of [robos, bat, uso, cmd, reg]) falhou(r.error)
  return {
    robos: (robos.data ?? []) as RoboLinha[],
    batimentos: (bat.data ?? []) as Batimento[],
    uso: (uso.data ?? []) as UsoLinha[],
    comandos: (cmd.data ?? []) as Comando[],
    registro: (reg.data ?? []) as RegistroLinha[],
    sugestoesPendentes: sug.count ?? 0,
    filaSdr: sdr.count ?? 0,
  }
}

// Só a linha mais recente de cada serviço (a primeira de cada, pois vem da data mais nova para a mais antiga).
export function usoAtual(uso: UsoLinha[]): Record<string, UsoLinha> {
  const m: Record<string, UsoLinha> = {}
  for (const u of uso) if (!m[u.servico]) m[u.servico] = u
  return m
}

// ---- registro ------------------------------------------------------------------------------------------
export async function registrar(oQue: string, antes: Record<string, unknown> | null, depois: Record<string, unknown> | null, desfazivel = true) {
  const { error } = await db.rpc('central_registrar', { p_o_que: oQue, p_antes: antes, p_depois: depois, p_desfazivel: desfazivel })
  falhou(error)
}

// ---- chaves e robôs ------------------------------------------------------------------------------------
export async function gravarFlag(chave: string, valor: string) {
  const { error } = await db.from('parametros_sistema').update({ valor }).eq('chave', chave)
  falhou(error)
}

export async function alternarRobo(robo: RoboLinha, ligar: boolean, flagsAntes: Record<string, string>) {
  if (robo.flag_chave) {
    const antes = flagsAntes[robo.flag_chave] ?? null
    await gravarFlag(robo.flag_chave, valorDaFlag(ligar))
    await registrar(`${ligar ? 'Ligou' : 'Desligou'} "${robo.nome}"`, { tipo: 'flag', chave: robo.flag_chave, valor: antes }, { tipo: 'flag', chave: robo.flag_chave, valor: valorDaFlag(ligar) })
    return
  }
  // Robô do PC: muda o estado e deixa um comando para o agente executar.
  const { error } = await db.from('central_robos').update({ ligado: ligar }).eq('id', robo.id)
  falhou(error)
  const c = await db.from('central_comandos').insert({ robo_id: robo.id, comando: ligar ? 'ligar' : 'desligar' })
  falhou(c.error)
  await registrar(`${ligar ? 'Ligou' : 'Desligou'} "${robo.nome}"`, { tipo: 'robo', id: robo.id, ligado: robo.ligado }, { tipo: 'robo', id: robo.id, ligado: ligar })
}

export async function salvarHora(robo: RoboLinha, hora: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) throw new Error('Horário inválido.')
  const { error } = await db.from('central_robos').update({ hora }).eq('id', robo.id)
  falhou(error)
  await registrar(`Mudou o horário de "${robo.nome}" para ${hora}`, { tipo: 'hora', id: robo.id, hora: robo.hora }, { tipo: 'hora', id: robo.id, hora })
}

export async function rodarAgora(robo: RoboLinha) {
  const { error } = await db.from('central_comandos').insert({ robo_id: robo.id, comando: 'rodar' })
  falhou(error)
  await registrar(`Pediu para rodar "${robo.nome}" agora`, null, { tipo: 'comando', robo: robo.id, comando: 'rodar' }, false)
}

// ---- limites -------------------------------------------------------------------------------------------
export async function salvarLimite(u: UsoLinha, limite: number) {
  if (!Number.isFinite(limite) || limite < 0) throw new Error('Limite inválido.')
  const { error } = await db.from('central_uso').update({ limite }).eq('id', u.id)
  falhou(error)
  await registrar(`Mudou o limite de ${u.servico}`, { tipo: 'limite', id: u.id, servico: u.servico, limite: u.limite }, { tipo: 'limite', id: u.id, servico: u.servico, limite })
}

// ---- processos no PC -----------------------------------------------------------------------------------
export async function pedirEncerrar(p: { pid: number; inicio: string; nome: string; arquivo: string }) {
  const { error } = await db.from('central_comandos').insert({ comando: 'encerrar_processo', parametros: { pid: p.pid, inicio: p.inicio } })
  falhou(error)
  await registrar(`Pediu para encerrar o processo ${p.nome} (pid ${p.pid})`, null, { tipo: 'encerrar_processo', pid: p.pid, inicio: p.inicio, arquivo: p.arquivo }, false)
}

// ---- lista de clientes ---------------------------------------------------------------------------------
export type Contagens = { naBase: number; comEmail: number; setorCerto: number; telefones: number; esperandoEnvio: number }
const SETOR_OR = PREFIXOS_SETOR.map((p) => `melhor_email.ilike.${p}@%`).join(',')
export async function contagensLista(): Promise<Contagens> {
  const b = () => db.from('prospeccao_base').select('cnpj', { count: 'exact', head: true })
  const [a, c, s, t, e] = await Promise.all([
    b(),
    b().not('melhor_email', 'is', null).neq('melhor_email', ''),
    b().or(SETOR_OR),
    b().not('telefone1', 'is', null).neq('telefone1', ''),
    db.from('prospeccao_mensagens').select('id', { count: 'exact', head: true }).eq('status', 'aprovado'),
  ])
  for (const r of [a, c, s, t, e]) falhou(r.error)
  return { naBase: a.count ?? 0, comEmail: c.count ?? 0, setorCerto: s.count ?? 0, telefones: t.count ?? 0, esperandoEnvio: e.count ?? 0 }
}

export type FiltroContatos = { q: string; contato: '' | 'com' | 'setor' | 'geral' | 'sem'; verif: '' | 'valido' | 'pendente' | 'invalido'; situacao: '' | 'lista' | 'base'; pagina: number; tam: number }
export type LinhaContato = {
  cnpj: string; razao_social: string | null; nome_fantasia: string | null; municipio: string | null; uf: string | null; segmento_rbr: string | null
  melhor_email: string | null; email_verificado: string | null; telefone1: string | null; pontuacao: number | null; ja_na_lista: boolean | null
  site_encontrado: string | null; importado_em: string | null; lote_importacao: string | null; tipo: 'setor' | 'geral' | 'sem'
}
export async function paginaContatos(f: FiltroContatos): Promise<{ linhas: LinhaContato[]; total: number }> {
  let q = db.from('prospeccao_base')
    .select('cnpj, razao_social, nome_fantasia, municipio, uf, segmento_rbr, melhor_email, email_verificado, telefone1, pontuacao, ja_na_lista, site_encontrado, importado_em, lote_importacao', { count: 'exact' })
  const t = termoBusca(f.q)
  if (t) q = q.or(`razao_social.ilike.%${t}%,nome_fantasia.ilike.%${t}%,municipio.ilike.%${t}%,melhor_email.ilike.%${t}%`)
  if (f.contato === 'com') q = q.not('melhor_email', 'is', null).neq('melhor_email', '')
  if (f.contato === 'sem') q = q.or('melhor_email.is.null,melhor_email.eq.')
  if (f.contato === 'setor') q = q.or(SETOR_OR)
  if (f.contato === 'geral') q = q.not('melhor_email', 'is', null).neq('melhor_email', '').not('melhor_email', 'ilike', 'compras@%').not('melhor_email', 'ilike', 'suprimentos@%').not('melhor_email', 'ilike', 'logistica@%')
  if (f.verif === 'valido') q = q.in('email_verificado', ['valido', 'válido', 'verificado'])
  if (f.verif === 'invalido') q = q.in('email_verificado', ['invalido', 'inválido'])
  if (f.verif === 'pendente') q = q.or('email_verificado.is.null,email_verificado.eq.')
  if (f.situacao === 'lista') q = q.eq('ja_na_lista', true)
  if (f.situacao === 'base') q = q.eq('ja_na_lista', false)
  const de = f.pagina * f.tam
  const { data, count, error } = await q.order('pontuacao', { ascending: false, nullsFirst: false }).range(de, de + f.tam - 1)
  falhou(error)
  const linhas = ((data ?? []) as Omit<LinhaContato, 'tipo'>[]).map((l) => ({ ...l, tipo: tipoEmail(l.melhor_email) }))
  return { linhas, total: count ?? 0 }
}

export async function pedirImportacao(lote: string, empresas: number, contatos: number) {
  const { error } = await db.from('central_comandos').insert({ comando: 'importar_base', parametros: { lote, total_empresas: empresas, total_contatos: contatos } })
  falhou(error)
  await registrar(`Enviou a lista para a base do TMS (${empresas} empresas)`, { tipo: 'importacao', lote }, { tipo: 'importacao', lote, empresas, contatos })
}

// ---- desfazer ------------------------------------------------------------------------------------------
export async function desfazer(r: RegistroLinha): Promise<string> {
  const a = r.antes as Record<string, unknown> | null
  if (!r.desfazivel || r.desfeito_em || !a) throw new Error('Esta alteração não pode ser desfeita.')
  let msg = 'Desfeito.'
  if (a.tipo === 'flag') {
    if (a.valor == null) throw new Error('Não há valor anterior para voltar.')
    await gravarFlag(String(a.chave), String(a.valor))
  } else if (a.tipo === 'robo') {
    const { error } = await db.from('central_robos').update({ ligado: a.ligado === true }).eq('id', String(a.id))
    falhou(error)
    const c = await db.from('central_comandos').insert({ robo_id: String(a.id), comando: a.ligado === true ? 'ligar' : 'desligar' })
    falhou(c.error)
  } else if (a.tipo === 'hora') {
    const { error } = await db.from('central_robos').update({ hora: a.hora ?? null }).eq('id', String(a.id))
    falhou(error)
  } else if (a.tipo === 'limite') {
    const { error } = await db.from('central_uso').update({ limite: Number(a.limite) }).eq('id', String(a.id))
    falhou(error)
  } else if (a.tipo === 'importacao') {
    const { data, error } = await db.rpc('central_desfazer_lote', { p_lote: String(a.lote) })
    falhou(error)
    const d = data as { removidas?: number } | null
    msg = `Desfeito: ${d?.removidas ?? 0} empresas daquele envio saíram da base.`
  } else throw new Error('Não sei desfazer este tipo de alteração.')
  const { error } = await db.rpc('central_marcar_desfeito', { p_registro: r.id })
  falhou(error)
  return msg
}
