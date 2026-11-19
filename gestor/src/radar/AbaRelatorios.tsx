// R9: números reais da semana, resposta por segmento, testes A/B, sugestões do agente (aplicar/recusar) e histórico de mudanças.
import { useMemo } from 'react'
import { auditar, db } from '../lib/prospeccaoDb'
import { SEGMENTOS_RADAR, fmtBrl, fmtInt, fmtPct, pct } from '../lib/radar'
import { AvisoErro, FaixaExemplo, Vazio, quando, toast, useConsulta, useRadar } from './ui'

type Dia = { data: string; enviados: number; devolvidos: number; respostas: number }
type Sug = { id: string; titulo: string; motivo: string; status: string; criado_em: string; decidido_em: string | null }
type Exp = { id: string; tipo: string; alvo: string; status: string; padrao: unknown; variante: unknown }
const LABEL: Record<string, string> = Object.fromEntries(SEGMENTOS_RADAR.map((s) => [s.slug, s.label]))
const desde = (dias: number) => new Date(Date.now() - dias * 86_400_000)
const ymd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d)
const txt = (v: unknown) => (typeof v === 'string' ? v : v && typeof v === 'object' ? ((v as Record<string, unknown>).assunto ?? (v as Record<string, unknown>).texto ?? JSON.stringify(v)) as string : String(v ?? ''))

export default function AbaRelatorios() {
  const { exemplos, pessoaId, recarregar, tick } = useRadar()
  const ini = ymd(desde(6))
  const dados = useConsulta(async () => {
    const isoIni = desde(7).toISOString()
    const [dias, resp, msgs, ia, sug, exp, hist, expMsg] = await Promise.all([
      db.from('prospeccao_envio_diario').select('data, enviados, devolvidos, respostas').gte('data', ini),
      db.from('prospeccao_respostas').select('classificacao, mensagem_id, empresa:prospeccao_empresas(segmento)').gte('recebido_em', isoIni).limit(5000),
      db.from('prospeccao_mensagens').select('empresa:prospeccao_empresas(segmento)').eq('status', 'enviado').gte('enviado_em', isoIni).limit(5000),
      db.from('prospeccao_ia_uso').select('custo_brl').gte('data', ini).limit(10000),
      db.from('prospeccao_sugestoes').select('id, titulo, motivo, status, criado_em, decidido_em').order('criado_em', { ascending: false }).limit(50),
      db.from('prospeccao_experimentos').select('id, tipo, alvo, status, padrao, variante').in('status', ['em_teste', 'vencedor', 'revertido']).order('criado_em', { ascending: false }).limit(10),
      db.from('auditoria_log').select('acao, created_at').like('acao', 'prospeccao\\_%').in('acao', ['prospeccao_jornada_editada', 'prospeccao_jornada_modo', 'prospeccao_jornada_pergunta_nova', 'prospeccao_flag_alterada', 'prospeccao_rampa_editada', 'prospeccao_sugestao_aplicada']).order('created_at', { ascending: false }).limit(15),
      db.from('prospeccao_mensagens').select('experimento_id, variante, status').not('experimento_id', 'is', null).eq('status', 'enviado').limit(5000),
    ])
    const erro = [dias, sug].find((r) => r.error)?.error ?? null
    return { data: { dias: (dias.data ?? []) as Dia[], resp: (resp.data ?? []) as unknown as { classificacao: string | null; mensagem_id: string | null; empresa: { segmento: string } | null }[], msgs: (msgs.data ?? []) as unknown as { empresa: { segmento: string } | null }[], ia: ((ia.data ?? []) as { custo_brl: number }[]).reduce((s, x) => s + Number(x.custo_brl), 0), sug: (sug.data ?? []) as Sug[], exp: (exp.data ?? []) as Exp[], hist: (hist.data ?? []) as { acao: string; created_at: string }[], expMsg: (expMsg.data ?? []) as { experimento_id: string; variante: boolean }[] }, error: erro }
  }, { dias: [] as Dia[], resp: [] as { classificacao: string | null; mensagem_id: string | null; empresa: { segmento: string } | null }[], msgs: [] as { empresa: { segmento: string } | null }[], ia: 0, sug: [] as Sug[], exp: [] as Exp[], hist: [] as { acao: string; created_at: string }[], expMsg: [] as { experimento_id: string; variante: boolean }[] }, [exemplos, tick])

  const k = useMemo(() => {
    const d = dados.dados
    const env = d.dias.reduce((s, x) => s + x.enviados, 0), resp = d.dias.reduce((s, x) => s + x.respostas, 0), dev = d.dias.reduce((s, x) => s + x.devolvidos, 0)
    const quentes = d.resp.filter((r) => r.classificacao === 'cotacao' || r.classificacao === 'preco_prazo').length
    const cot = d.resp.filter((r) => r.classificacao === 'cotacao').length
    const porSeg = new Map<string, { env: number; resp: number }>()
    for (const m of d.msgs) { const s = m.empresa?.segmento; if (s) porSeg.set(s, { env: (porSeg.get(s)?.env ?? 0) + 1, resp: porSeg.get(s)?.resp ?? 0 }) }
    for (const r of d.resp) { const s = r.empresa?.segmento; if (s) porSeg.set(s, { env: porSeg.get(s)?.env ?? 0, resp: (porSeg.get(s)?.resp ?? 0) + 1 }) }
    const segs = [...porSeg.entries()].filter(([, v]) => v.env > 0).map(([s, v]) => ({ seg: s, taxa: pct(v.resp, v.env), env: v.env })).sort((a, b) => b.taxa - a.taxa).slice(0, 8)
    return { env, resp, dev, quentes, cot, segs, ia: d.ia }
  }, [dados.dados])

  const kp = exemplos ? { env: 186, resp: 14, dev: 1, quentes: 4, cot: 2, ia: 14.2, segs: [{ seg: 'eventos_shows', taxa: 14, env: 30 }, { seg: 'metalurgia', taxa: 10, env: 40 }, { seg: 'alimentos', taxa: 7, env: 50 }, { seg: 'plasticos', taxa: 5, env: 40 }, { seg: 'maquinas', taxa: 3, env: 26 }] } : k
  const sugs: Sug[] = exemplos ? [
    { id: 'x1', titulo: 'Assunto mais curto no toque 1', motivo: 'O assunto B abriu 44% contra 31% do atual em 60 envios.', status: 'pendente', criado_em: new Date().toISOString(), decidido_em: null },
    { id: 'x2', titulo: 'Priorizar eventos às quintas', motivo: 'Empresas de evento responderam mais quando o e-mail chegou na quinta de manhã.', status: 'pendente', criado_em: new Date().toISOString(), decidido_em: null },
  ] : dados.dados.sug
  const pendentes = sugs.filter((s) => s.status === 'pendente')
  const decididas = sugs.filter((s) => s.status !== 'pendente')
  const semDados = !exemplos && kp.env === 0 && sugs.length === 0

  async function decidir(s: Sug, status: 'aplicada' | 'recusada') {
    if (exemplos) return toast(status === 'aplicada' ? 'Exemplo: mudança aplicada' : 'Exemplo: sugestão recusada')
    const { error } = await db.from('prospeccao_sugestoes').update({ status, decidido_por: pessoaId, decidido_em: new Date().toISOString() }).eq('id', s.id).eq('status', 'pendente')
    if (error) return toast(error.message)
    try { await auditar(status === 'aplicada' ? 'prospeccao_sugestao_aplicada' : 'prospeccao_sugestao_recusada', { sugestao_id: s.id, titulo: s.titulo }) } catch { /* melhor esforço */ }
    toast(status === 'aplicada' ? 'Mudança aplicada e registrada no histórico' : 'Sugestão recusada'); recarregar()
  }

  const ab = dados.dados.exp.filter((e) => e.status === 'em_teste').slice(0, 2).map((e) => {
    const l = dados.dados.expMsg.filter((m) => m.experimento_id === e.id)
    return { e, a: l.filter((m) => !m.variante).length, b: l.filter((m) => m.variante).length }
  })
  const NOMES_HIST: Record<string, string> = { prospeccao_jornada_editada: 'Resposta da Jornada editada', prospeccao_jornada_modo: 'Modo de resposta da Jornada alterado', prospeccao_jornada_pergunta_nova: 'Nova pergunta criada na Jornada', prospeccao_flag_alterada: 'Chave de liberação alterada', prospeccao_rampa_editada: 'Rampa de envio editada', prospeccao_sugestao_aplicada: 'Sugestão da IA aplicada' }
  return (
    <>
      {exemplos && <FaixaExemplo />}
      <AvisoErro erro={exemplos ? null : dados.erro} />
      {semDados && <div className="note"><b>Ainda não há dados.</b> Os números e as sugestões do agente aparecem depois dos primeiros envios e respostas.</div>}
      <div className="kpi" style={{ ['--n' as string]: 6 }}>
        <div><b>{fmtInt(kp.env)}</b><span>enviados na semana</span></div><div><b>{fmtPct(pct(kp.resp, kp.env))}</b><span>responderam</span></div><div><b>{kp.quentes}</b><span>leads quentes</span></div>
        <div><b>{kp.cot}</b><span>cotações pedidas</span></div><div><b>{fmtPct(pct(kp.dev, kp.env))}</b><span>devoluções</span></div><div><b>{fmtBrl(kp.ia)}</b><span>IA na semana</span></div>
      </div>
      <div className="split">
        <div className="card pad"><div className="between" style={{ marginBottom: 6 }}><h3>Quem mais respondeu</h3><span className="lab">por segmento</span></div>
          {kp.segs.length === 0 ? <p className="sm muted">Sem respostas na semana ainda.</p> : kp.segs.map((s) => <div key={s.seg} className="hb"><span>{LABEL[s.seg] ?? s.seg}</span><span className="bar"><i style={{ width: `${Math.min(100, (s.taxa / Math.max(1, kp.segs[0].taxa)) * 100)}%` }} /></span><em>{fmtPct(s.taxa)}</em></div>)}
        </div>
        <div className="card pad"><div className="between" style={{ marginBottom: 6 }}><h3>Teste A/B em andamento</h3><span className="lab">{exemplos ? '60 de 100 envios' : ab.length ? `${ab.length} em teste` : 'nenhum'}</span></div>
          {exemplos ? <><p className="sm muted">Assunto do toque 1</p><div className="hb" style={{ gridTemplateColumns: '1fr 120px 46px' }}><span>A · Frete para a {'{empresa}'}</span><span className="bar"><i style={{ width: '31%', background: 'var(--line2)' }} /></span><em>31%</em></div><div className="hb" style={{ gridTemplateColumns: '1fr 120px 46px' }}><span><b>B · {'{empresa}'}: carga fechada saindo de SP</b></span><span className="bar"><i style={{ width: '44%', background: 'var(--goldbtn)' }} /></span><em>44%</em></div></>
            : ab.length === 0 ? <p className="sm muted">Nenhum teste em andamento. Quando o analista de IA propuser um, ele aparece aqui.</p> : ab.map(({ e, a, b }) => (
              <div key={e.id} style={{ marginTop: 8 }}><p className="sm muted">{e.tipo} · {e.alvo}</p><p className="xs">A (padrão): {txt(e.padrao)} <b className="mono">{a} envios</b></p><p className="xs">B (variante): {txt(e.variante)} <b className="mono">{b} envios</b></p></div>))}
          <p className="xs faint" style={{ marginTop: 10 }}>Se uma mudança piorar a resposta, o agente volta ao padrão sozinho e avisa você.</p>
        </div>
      </div>
      <div className="card pad"><div className="between" style={{ marginBottom: 4 }}><h3>O agente sugere mudar</h3><span className="lab">você aprova ou recusa</span></div>
        {pendentes.length === 0 ? <Vazio>Nenhuma sugestão pendente.</Vazio> : pendentes.map((s, i) => (
          <div key={s.id} className="between" style={{ padding: '14px 0', borderTop: i ? '1px solid var(--line)' : 0, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 240 }}><b>{s.titulo}</b><p className="sm muted" style={{ marginTop: 3 }}>{s.motivo}</p></div>
            <div className="row"><button className="btn pri sm" onClick={() => void decidir(s, 'aplicada')}>Aplicar</button><button className="btn ghost sm" onClick={() => void decidir(s, 'recusada')}>Recusar</button></div>
          </div>
        ))}
      </div>
      <div className="card pad"><div className="between"><h3>Histórico de mudanças</h3></div>
        {exemplos ? <ol className="tl"><li><span>12/11 · Intervalo entre envios ajustado para 8 a 25 min</span></li><li><span>14/11 · Toque 1 passou a citar a cidade da empresa</span></li><li><span>16/11 · Teste A/B de assunto iniciado</span></li></ol>
          : dados.dados.hist.length + decididas.length === 0 ? <p className="sm muted" style={{ marginTop: 6 }}>Nenhuma mudança registrada ainda.</p> : (
            <ol className="tl">
              {[...dados.dados.hist.map((h) => ({ q: h.created_at, t: NOMES_HIST[h.acao] ?? h.acao })), ...decididas.map((s) => ({ q: s.decidido_em ?? s.criado_em, t: `Sugestão ${s.status}: ${s.titulo}` }))].sort((a, b) => b.q.localeCompare(a.q)).slice(0, 15).map((x, i) => <li key={i}><span>{quando(x.q)} · {x.t}</span></li>)}
            </ol>
          )}
      </div>
    </>
  )
}
