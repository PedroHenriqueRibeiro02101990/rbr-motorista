// Limites de uso por serviço, em medidores semicirculares. Só o limite é editável; o "usado" vem do agente.
import { useState } from 'react'
import { nivelUso, percentualUso, projecaoEsgotar, SERVICOS_USO } from '../lib/central'
import { salvarLimite, usoAtual, type UsoLinha } from '../lib/centralDb'
import { fmtN, useCentral } from './ctx'

function Medidor({ pct, nivel }: { pct: number; nivel: 'ok' | 'wn' | 'bd' }) {
  return (
    <svg viewBox="0 0 120 70" role="img" aria-label={`${pct}% do limite usado`}>
      <path className="g-bg" d="M10 62 A50 50 0 0 1 110 62" fill="none" strokeWidth="11" strokeLinecap="round" />
      <path className={`g-fg ${nivel === 'wn' ? 'warn' : nivel === 'bd' ? 'bad' : ''}`} d="M10 62 A50 50 0 0 1 110 62" fill="none" strokeWidth="11" strokeLinecap="round" pathLength={100} strokeDasharray={`${pct} 100`} />
      <text x="60" y="56" textAnchor="middle" fontSize="20" fontWeight="800">{pct}%</text>
    </svg>
  )
}

function Cartao({ nome, periodo, semChave, u }: { nome: string; periodo: 'dia' | 'mes'; semChave?: boolean; u?: UsoLinha }) {
  const { agora, executar } = useCentral()
  const [valor, setValor] = useState<string>(u ? String(u.limite) : '')
  if (semChave) {
    return (<div className="gc off"><div className="top3"><span className="nm">{nome}</span><span className="pill">sem chave</span></div><div className="ds">Ainda não há chave deste serviço. Ele fica desligado.</div></div>)
  }
  if (!u) {
    return (<div className="gc off"><div className="top3"><span className="nm">{nome}</span><span className="pill">sem dados</span></div><div className="ds">O agente ainda não informou o uso deste serviço.</div></div>)
  }
  const pct = percentualUso(u.usado, u.limite), nivel = nivelUso(u.usado, u.limite)
  const proj = projecaoEsgotar(u.usado, u.limite, periodo, agora)
  return (
    <div className="gc">
      <div className="top3"><span className="nm">{nome}</span><span className={`pill ${nivel}`}>{nivel === 'ok' ? 'tranquilo' : nivel === 'wn' ? 'perto do fim' : 'no limite'}</span></div>
      <Medidor pct={pct} nivel={nivel} />
      <div className="ds"><b>{fmtN(u.usado)}</b> de {fmtN(u.limite)} {periodo === 'dia' ? 'hoje' : 'no mês'} · restam {fmtN(Math.max(0, u.limite - u.usado))}</div>
      {proj && <div className="ds">{proj}</div>}
      <label className="lim">Limite
        <input type="number" min={0} value={valor} onChange={(e) => setValor(e.target.value)} aria-label={`Limite de ${nome}`} />
        <button className="sm" disabled={Number(valor) === u.limite || valor === ''} onClick={() => void executar(async () => { await salvarLimite(u, Number(valor)); return 'Limite salvo.' })}>Salvar</button>
      </label>
    </div>
  )
}

export default function SecLimites() {
  const { painel } = useCentral()
  const uso = usoAtual(painel.uso)
  const perto = SERVICOS_USO.filter((s) => uso[s.id] && nivelUso(uso[s.id].usado, uso[s.id].limite) !== 'ok').length
  return (
    <section className="card" id="limites">
      <div className="hd"><div><h2>Limites de uso</h2><p>Cada serviço tem seu teto. Ao chegar nele, o robô pula essa etapa e segue, sem falhar.</p></div><span className={`stt ${perto ? 'wn' : 'ok'}`}>{perto ? `${perto} perto do fim` : 'tranquilo'}</span></div>
      <div className="gg">{SERVICOS_USO.map((s) => <Cartao key={s.id} nome={s.nome} periodo={s.periodo} semChave={s.semChave} u={uso[s.id]} />)}</div>
      <div className="note">O uso é informado pelo agente do PC. Aqui você só muda o limite de cada serviço; cada mudança fica no Registro, com desfazer.</div>
    </section>
  )
}
