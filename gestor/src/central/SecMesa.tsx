// Mesa de despacho: 4 colunas (Precisa de você | Rodando agora | Ligados e agendados | Desligados e travados).
// Cada cartão de robô muda de coluna sozinho. Chaves de produção sempre pedem confirmação com o efeito escrito.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { batimentoAtrasado, efeitoDaChave, estadoDoRobo, motivoNaoLiga, nivelUso, SERVICOS_USO, type RoboLinha } from '../lib/central'
import { alternarRobo, rodarAgora, salvarHora, usoAtual } from '../lib/centralDb'
import { fmtData, fmtN, ultimoBatimento, useCentral } from './ctx'

type Aviso = { id: string; sev: 'urg' | 'hoje'; t: string; w: string; why: string; acao?: { rotulo: string; fazer: () => void }; link?: { rotulo: string; to: string } }
const CHAVE_ADIAR = 'central-adiar'
function lerAdiados(): Record<string, string> { try { return JSON.parse(localStorage.getItem(CHAVE_ADIAR) ?? '{}') as Record<string, string> } catch { return {} } }

export default function SecMesa({ faltam, emImportacao, onImportar }: { faltam: number; emImportacao: boolean; onImportar: () => void }) {
  const { painel, flags, agora, confirmar, executar } = useCentral()
  const [adiados, setAdiados] = useState(lerAdiados)
  const bat = ultimoBatimento(painel)
  const atrasado = batimentoAtrasado(bat?.ultimo_batimento, agora)

  const avisos: Aviso[] = []
  if (!bat) avisos.push({ id: 'agente-nunca', sev: 'hoje', t: 'O agente do PC ainda não se conectou', w: 'Nenhum batimento recebido.', why: 'Sem o agente, os robôs do PC não recebem ordem e a lista não chega à base.' })
  else if (atrasado) avisos.push({ id: 'agente-atrasado', sev: 'urg', t: 'O agente do PC está atrasado', w: `Último sinal em ${fmtData(bat.ultimo_batimento)}.`, why: 'Robôs do PC e envio da lista ficam parados até ele voltar.' })
  if (faltam > 0 && !emImportacao) avisos.push({ id: 'importar', sev: 'hoje', t: `${fmtN(faltam)} empresas da lista ainda não estão na base do TMS`, w: 'Contatos achados esperando.', why: 'Só entram na prospecção depois de enviadas para a base.', acao: { rotulo: 'Enviar para a base do TMS', fazer: onImportar } })
  const uso = usoAtual(painel.uso)
  for (const s of SERVICOS_USO) {
    const u = uso[s.id]
    if (u && u.limite > 0 && nivelUso(u.usado, u.limite) !== 'ok') avisos.push({ id: `uso-${s.id}`, sev: 'hoje', t: `${s.nome} perto do limite`, w: `${fmtN(u.usado)} de ${fmtN(u.limite)} usados.`, why: 'Ao chegar no teto, o robô pula essa etapa e segue.' })
  }
  for (const r of painel.robos) if (r.ultimo_resultado && /^erro/i.test(r.ultimo_resultado)) avisos.push({ id: `erro-${r.id}`, sev: 'hoje', t: `${r.nome} terminou com erro`, w: r.ultimo_resultado, why: 'O resultado do dia pode estar incompleto.' })
  for (const c of painel.comandos.filter((x) => x.status === 'erro').slice(0, 3)) avisos.push({ id: `cmd-${c.id}`, sev: 'hoje', t: `Pedido "${c.comando}" deu erro`, w: c.resultado ?? 'Sem detalhe.', why: 'O agente não conseguiu cumprir o pedido.' })
  if (painel.sugestoesPendentes > 0) avisos.push({ id: 'sugestoes', sev: 'hoje', t: `${painel.sugestoesPendentes} sugestões da IA esperam sua decisão`, w: 'A aprovação direta pela Central chega na próxima fase.', why: 'São mudanças que a IA propõe com base nos resultados.', link: { rotulo: 'Ver no Radar', to: '/radar/relatorios' } })
  const visiveis = avisos.filter((a) => !(adiados[a.id] && Date.parse(adiados[a.id]) > agora.getTime()))
  const adiar = (id: string) => {
    const n = { ...adiados, [id]: new Date(agora.getTime() + 24 * 3600 * 1000).toISOString() }
    setAdiados(n)
    try { localStorage.setItem(CHAVE_ADIAR, JSON.stringify(n)) } catch { /* sem armazenamento: vale só agora */ }
  }

  async function mexer(r: RoboLinha, ligar: boolean) {
    if (ligar) { const m = motivoNaoLiga(r, flags); if (m) return executar(() => { throw new Error(m) }) }
    const e = efeitoDaChave(r.flag_chave ? r.id : 'pc', ligar)
    if (r.flag_chave) {
      const ok = await confirmar({ titulo: e.titulo, texto: `${e.efeito}\n\nChave: ${r.flag_chave}`, ok: ligar ? 'Ligar' : 'Desligar', perigoso: e.perigoso })
      if (!ok) return
    }
    await executar(async () => { await alternarRobo(r, ligar, flags); return `${r.nome}: ${ligar ? 'ligado' : 'desligado'}.` })
  }

  const grupos: Record<string, RoboLinha[]> = { rodando: [], ligado: [], desligado: [], travado: [] }
  for (const r of painel.robos) grupos[estadoDoRobo(r, flags)].push(r)
  const card = (r: RoboLinha) => {
    const est = estadoDoRobo(r, flags)
    const ligado = est === 'rodando' || est === 'ligado'
    const trava = !ligado ? motivoNaoLiga(r, flags) : null
    const pill = est === 'rodando' ? ['rodando', 'ic'] : est === 'ligado' ? ['ligado', 'on'] : est === 'travado' ? ['travado', ''] : ['desligado', '']
    const efeito = efeitoDaChave(r.flag_chave ? r.id : 'pc', !ligado)
    return (
      <div className="it" key={r.id} id={`card-${r.id}`}>
        <div className="row1">
          <div className="nm">{r.nome}</div>
          <label className={`sw ${est === 'travado' ? 'lock' : ''}`}>
            <input type="checkbox" role="switch" checked={ligado} disabled={est === 'travado' || (!ligado && !!trava)} aria-label={`Ligar ou desligar ${r.nome}`} onChange={(e) => void mexer(r, e.target.checked)} /><i />
          </label>
        </div>
        {est === 'travado'
          ? <div className="ds">Fiscal e Repom só mudam com o seu OK no chat, não por este painel.</div>
          : trava && <div className="ds">{trava}</div>}
        <div className="mt">
          <span className={`pill ${pill[1]}`}>{pill[0]}</span>
          <span className={`mini ${r.onde_roda === 'nuvem' ? 'cl' : ''}`}>{r.onde_roda === 'nuvem' ? 'Nuvem' : 'PC'}</span>
          {r.hora && ligado && <span className="mini">todo dia {r.hora}</span>}
          {r.ultimo_fim && <span className="mini">Última: {fmtData(r.ultimo_fim)}{r.ultimo_resultado ? ` · ${r.ultimo_resultado}` : ''}</span>}
        </div>
        {est !== 'travado' && (
          <>
            {r.onde_roda === 'pc' && !r.flag_chave && ligado && est !== 'rodando' && (
              <div className="acts"><button className="sm" onClick={() => void executar(async () => { await rodarAgora(r); return 'Pedido enviado ao agente.' })}>Rodar agora</button></div>
            )}
            <details className="aj"><summary>Ajustes</summary>
              <div className="bx">
                {r.tipo === 'agendado' && (
                  <label className="ds">Horário diário <input type="time" defaultValue={r.hora ?? ''} aria-label={`Horário de ${r.nome}`} onBlur={(e) => { if (e.target.value && e.target.value !== (r.hora ?? '')) void executar(async () => { await salvarHora(r, e.target.value); return 'Horário salvo.' }) }} /></label>
                )}
                <div className="ds"><b>{ligado ? 'Se desligar' : 'Se ligar'}:</b> {efeito.efeito}</div>
                {r.flag_chave && <div className="ds">Chave: <span style={{ fontFamily: 'var(--mono)' }}>{r.flag_chave}</span></div>}
              </div>
            </details>
          </>
        )}
      </div>
    )
  }
  const travados = grupos.travado
  const deslig = grupos.desligado
  return (
    <section className="card" id="agora">
      <div className="hd"><div><h2>Mesa de despacho</h2><p>Tudo que precisa de você e o estado de cada robô, no mesmo quadro. Ligue ou desligue direto no cartão.</p></div><span className={`stt ${visiveis.some((a) => a.sev === 'urg') ? 'bd' : visiveis.length ? 'wn' : 'ok'}`}>{visiveis.length ? `${visiveis.length} esperando você` : 'em dia'}</span></div>
      <div className="board">
        <div className="bc need">
          <h3>Precisa de você <em>{visiveis.length}</em></h3>
          {visiveis.length === 0 && <div className="okline">Nada esperando você. Os robôs cuidam do resto.</div>}
          {visiveis.map((a) => (
            <div className={`it ${a.sev}`} key={a.id}>
              <div className="row1"><span className={`sv ${a.sev}`}>{a.sev === 'urg' ? 'Urgente' : 'Hoje'}</span></div>
              <div><div className="nm">{a.t}</div><div className="ds">{a.w}</div><div className="ds"><b>Por que importa:</b> {a.why}</div></div>
              <div className="acts">
                {a.acao && <button className="sm pri" onClick={a.acao.fazer}>{a.acao.rotulo}</button>}
                {a.link && <Link className="lk" to={a.link.to}>{a.link.rotulo}</Link>}
                <button className="sm" onClick={() => adiar(a.id)}>Adiar 1 dia</button>
              </div>
            </div>
          ))}
        </div>
        <div className="bc"><h3>Rodando agora <em>{grupos.rodando.length}</em></h3>{grupos.rodando.map(card)}{grupos.rodando.length === 0 && <div className="empty">Nada rodando.</div>}</div>
        <div className="bc"><h3>Ligados e agendados <em>{grupos.ligado.length}</em></h3>{grupos.ligado.map(card)}{grupos.ligado.length === 0 && <div className="empty">Nenhum robô ligado.</div>}</div>
        <div className="bc"><h3>Desligados e travados <em>{deslig.length + travados.length}</em></h3>{deslig.map(card)}{travados.map(card)}</div>
      </div>
    </section>
  )
}
