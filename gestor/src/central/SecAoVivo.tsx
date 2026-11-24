// Fila do TMS e ao vivo: só mostra (passos da LISTAS, fila de tarefas, últimas linhas do log). Sem botões de rodar: rodar é pelo cartão do robô.
import { useState } from 'react'
import { filaDoResumo, linhasAoVivo, passosDoResumo } from '../lib/central'
import { ultimoBatimento, useCentral } from './ctx'

export default function SecAoVivo() {
  const { painel } = useCentral()
  const [aberto, setAberto] = useState(false)
  const r = ultimoBatimento(painel)?.resumo_json
  const passos = passosDoResumo(r), fila = filaDoResumo(r), linhas = linhasAoVivo(r)
  return (
    <section className={`card ${aberto ? '' : 'col'}`} id="manual">
      <div className="hd">
        <div><h2>Fila do TMS e ao vivo</h2><p>Passos da lista, fila de tarefas do Claude e janela ao vivo. Para rodar algo, use o cartão do robô na Mesa de despacho.</p></div>
        <span className="stt">{passos.some((p) => p.estado === 'rodando') ? 'rodando' : `${fila.length} na fila`}</span>
        <button className="tg" aria-expanded={aberto} aria-label="Abrir ou fechar" onClick={() => setAberto((x) => !x)}>{aberto ? '−' : '+'}</button>
      </div>
      <div className="grid">
        <div className="sub2">
          <div className="hd" style={{ marginBottom: 6 }}><div><h2 style={{ fontSize: 15 }}>Garimpo e listas</h2><p>Passos do pipeline</p></div></div>
          {passos.length === 0 ? <div className="empty">O agente ainda não informou os passos.</div> : (
            <ol className="steps">{passos.map((p, i) => <li key={i} className={p.estado === 'feito' ? 'st-ok' : p.estado === 'rodando' ? 'st-run' : ''}><span className="n">{i + 1}</span><div><div className="nm">{p.nome}</div>{p.detalhe && <div className="ds">{p.detalhe}</div>}</div><span className="pill">{p.estado === 'feito' ? 'feito' : p.estado === 'rodando' ? 'rodando' : 'espera'}</span></li>)}</ol>
          )}
        </div>
        <div className="sub2">
          <div className="hd" style={{ marginBottom: 6 }}><div><h2 style={{ fontSize: 15 }}>Fila do TMS</h2><p>Tarefas do Claude, cada uma numa cópia própria do projeto</p></div></div>
          {fila.length === 0 ? <div className="empty">Fila vazia.</div> : <ol className="steps">{fila.map((t, i) => <li key={i}><span className="n">{i + 1}</span><div className="nm">{t.titulo}</div><span className="pill">{t.estado}</span></li>)}</ol>}
        </div>
      </div>
      <div className="lbl">Ao vivo</div>
      <div className="term" role="log" aria-live="off">{linhas.length ? linhas.join('\n') : 'Sem linhas ainda. O agente manda as últimas linhas do log junto com o batimento.'}</div>
    </section>
  )
}
