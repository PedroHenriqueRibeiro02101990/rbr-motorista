// Registro de alterações: tudo que a Central mudou, com DESFAZER por linha (quando dá para desfazer).
import { useState } from 'react'
import { desfazer } from '../lib/centralDb'
import { fmtData, useCentral } from './ctx'

export default function SecRegistro() {
  const { painel, executar } = useCentral()
  const [aberto, setAberto] = useState(false)
  const n = painel.registro.length
  return (
    <section className={`card ${aberto ? '' : 'col'}`} id="registro">
      <div className="hd">
        <div><h2>Registro de alterações</h2><p>Tudo que foi ligado, desligado ou mudado, com opção de desfazer</p></div>
        <span className="stt">{n} recentes</span>
        <button className="tg" aria-expanded={aberto} aria-label="Abrir ou fechar" onClick={() => setAberto((x) => !x)}>{aberto ? '−' : '+'}</button>
      </div>
      {n === 0 && <div className="empty">Nenhuma alteração ainda.</div>}
      {painel.registro.map((r) => (
        <div className="row" key={r.id}>
          <div>
            <div className="nm">{r.o_que}</div>
            <div className="ds">{fmtData(r.quando)}{r.desfeito_em ? ` · desfeito em ${fmtData(r.desfeito_em)}` : ''}</div>
          </div>
          <span className="sp">
            {r.desfeito_em ? <span className="pill">desfeito</span>
              : r.desfazivel ? <button className="sm" onClick={() => void executar(() => desfazer(r))}>Desfazer</button>
                : <span className="pill">sem desfazer</span>}
          </span>
        </div>
      ))}
    </section>
  )
}
