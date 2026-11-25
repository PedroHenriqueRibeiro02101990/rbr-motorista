// Central F3: pausar/retomar, pré-voo, sugestões da IA e jornada do e-mail. Mesma regra: cada mudança vai para o Registro.
import { auditar, db } from './prospeccaoDb'
import { falhou, gravarParametroCentral, registrar, type SugestaoLinha } from './centralDb'
import type { EntradaPrevoo, RoboLinha } from './central'

export async function pedirComandoRobo(robo: RoboLinha, comando: 'pausar' | 'retomar') {
  const { error } = await db.from('central_comandos').insert({ robo_id: robo.id, comando })
  falhou(error)
  await registrar(`${comando === 'pausar' ? 'Pausou' : 'Retomou'} "${robo.nome}"`, null, { tipo: 'comando', robo: robo.id, comando }, false)
}

export async function salvarMetas(m: { contatos: number; base: number }, antes: { contatos: number; base: number }) {
  await gravarParametroCentral('CENTRAL_METAS', m)
  await registrar('Mudou as metas dos cartões de resultado', { tipo: 'param', chave: 'CENTRAL_METAS', valor: antes }, { tipo: 'param', chave: 'CENTRAL_METAS', valor: m })
}

// ---- pré-voo --------------------------------------------------------------------------------------------
export async function carregarPrevoo(flags: Record<string, string>, naBase: number): Promise<EntradaPrevoo> {
  const caixas = () => db.from('prospeccao_caixas').select('id', { count: 'exact', head: true }).eq('ativa', true)
  const [mod, ativas, diag, senha] = await Promise.all([
    db.from('prospeccao_modelos').select('tipo', { count: 'exact', head: true }).in('tipo', ['toque1', 'toque2', 'toque3', 'toque4']).eq('ativo', true),
    caixas(),
    caixas().not('ultimo_diagnostico_em', 'is', null),
    caixas().not('segredo_senha', 'is', null), // só conta se existe; o valor nunca é lido
  ])
  for (const r of [mod, ativas, diag, senha]) falhou(r.error)
  let marcas: Record<string, string> | null = null
  try { const o = JSON.parse(flags.CENTRAL_PREVOO_MARCAS ?? ''); if (o && typeof o === 'object') marcas = o as Record<string, string> } catch { /* parâmetro ausente */ }
  return { naBase, modelosAtivos: mod.count ?? 0, caixasAtivas: ativas.count ?? 0, caixasComDiagnostico: diag.count ?? 0, caixasComSenha: senha.count ?? 0, marcas, flags }
}
export async function marcarPrevoo(id: 'dns' | 'descadastrar', feito: boolean, marcas: Record<string, string>) {
  const novo = { ...marcas }
  if (feito) novo[id] = new Date().toISOString().slice(0, 10); else delete novo[id]
  await gravarParametroCentral('CENTRAL_PREVOO_MARCAS', novo)
  await registrar(`${feito ? 'Marcou' : 'Desmarcou'} no pré-voo: ${id === 'dns' ? 'SPF, DKIM e DMARC' : 'descadastrar@'}`, { tipo: 'param', chave: 'CENTRAL_PREVOO_MARCAS', valor: marcas }, { tipo: 'param', chave: 'CENTRAL_PREVOO_MARCAS', valor: novo })
}

// ---- sugestões da IA (mesma regra do Radar: marca como aplicada/recusada e audita) ----------------------
export async function decidirSugestao(s: SugestaoLinha, aprovar: boolean, pessoaId: string) {
  const status = aprovar ? 'aplicada' : 'recusada'
  const { data, error } = await db.from('prospeccao_sugestoes').update({ status, decidido_por: pessoaId, decidido_em: new Date().toISOString() }).eq('id', s.id).eq('status', 'pendente').select('id')
  falhou(error)
  if (!data || data.length === 0) throw new Error('Esta sugestão já foi decidida.')
  try { await auditar(aprovar ? 'prospeccao_sugestao_aplicada' : 'prospeccao_sugestao_recusada', { sugestao_id: s.id, titulo: s.titulo }) } catch { /* melhor esforço, como no Radar */ }
  await registrar(`${aprovar ? 'Aprovou' : 'Rejeitou'} a sugestão: ${s.titulo}`, { tipo: 'sugestao', id: s.id, status: 'pendente' }, { tipo: 'sugestao', id: s.id, status })
}

// ---- jornada do e-mail ----------------------------------------------------------------------------------
export type Toque = { toque: number; atraso_dias: number; modelo_tipo: string }
export type Modelo = { tipo: string; assunto: string; corpo: string; ativo: boolean }
export type RespostaCfg = { classe: string; titulo: string; modo: 'rascunho' | 'sozinho' | 'nunca'; travado: boolean; personalizada: boolean }
export async function carregarJornada() {
  const [j, m, r] = await Promise.all([
    db.from('prospeccao_jornada').select('toque, atraso_dias, modelo_tipo').order('toque'),
    db.from('prospeccao_modelos').select('tipo, assunto, corpo, ativo').order('tipo'),
    db.from('prospeccao_respostas_config').select('classe, titulo, modo, travado, personalizada').order('titulo'),
  ])
  for (const x of [j, m, r]) falhou(x.error)
  return { toques: (j.data ?? []) as Toque[], modelos: (m.data ?? []) as Modelo[], respostas: (r.data ?? []) as RespostaCfg[] }
}
export async function salvarAtraso(t: Toque, dias: number) {
  if (!Number.isInteger(dias) || dias < 0 || dias > 120) throw new Error('Informe de 0 a 120 dias.')
  const { error } = await db.from('prospeccao_jornada').update({ atraso_dias: dias }).eq('toque', t.toque)
  falhou(error)
  await registrar(`Toque ${t.toque}: intervalo mudou de ${t.atraso_dias} para ${dias} dias`, { tipo: 'atraso', toque: t.toque, dias: t.atraso_dias }, { tipo: 'atraso', toque: t.toque, dias })
}
export async function salvarModelo(antes: Modelo, depois: Modelo) {
  const { error } = await db.from('prospeccao_modelos').update({ assunto: depois.assunto, corpo: depois.corpo, ativo: depois.ativo }).eq('tipo', antes.tipo)
  falhou(error)
  const ato = antes.ativo !== depois.ativo ? (depois.ativo ? ' (ativou)' : ' (desativou)') : ''
  await registrar(`Mudou o texto "${antes.tipo}"${ato}`, { tipo: 'modelo', modelo: antes.tipo, assunto: antes.assunto, corpo: antes.corpo, ativo: antes.ativo }, { tipo: 'modelo', modelo: antes.tipo, assunto: depois.assunto, corpo: depois.corpo, ativo: depois.ativo })
}
export async function trocarModoResposta(r: RespostaCfg, modo: RespostaCfg['modo']) {
  const { error } = await db.from('prospeccao_respostas_config').update({ modo, atualizado_em: new Date().toISOString() }).eq('classe', r.classe)
  falhou(error)
  try { await auditar('prospeccao_jornada_modo', { classe: r.classe, modo }) } catch { /* melhor esforço */ }
  await registrar(`Resposta "${r.titulo}": modo ${r.modo} para ${modo}`, { tipo: 'modo_resposta', classe: r.classe, modo: r.modo }, { tipo: 'modo_resposta', classe: r.classe, modo })
}
export async function salvarPrefixos(antes: string[], depois: string[]) {
  await gravarParametroCentral('CENTRAL_PREFIXOS_SETOR', depois)
  await registrar('Mudou a ordem de preferência dos e-mails do setor certo', { tipo: 'param', chave: 'CENTRAL_PREFIXOS_SETOR', valor: antes }, { tipo: 'param', chave: 'CENTRAL_PREFIXOS_SETOR', valor: depois })
}
