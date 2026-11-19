// R11: mini curso com 7 lições e um teste de uma pergunta cada. O progresso é por usuário (prospeccao_curso_progresso).
import { useEffect, useState } from 'react'
import { db } from '../lib/prospeccaoDb'
import { LICOES, progressoCurso } from '../lib/radar'
import { Acoes, AvisoErro, toast, useConsulta, useRadar } from './ui'

export default function AbaCurso() {
  const { pessoaId, exemplos } = useRadar()
  const [feitas, setFeitas] = useState<number[]>([])
  const [sel, setSel] = useState(0)
  const [errada, setErrada] = useState<number | null>(null)
  const [versao, setVersao] = useState(0)
  const r = useConsulta(() => db.from('prospeccao_curso_progresso').select('licao').eq('pessoa_id', pessoaId) as PromiseLike<{ data: { licao: number }[] | null; error: { message: string } | null }>, [] as { licao: number }[], [pessoaId, versao])
  useEffect(() => { setFeitas(r.dados.map((x) => x.licao)) }, [r.dados])
  useEffect(() => { setErrada(null) }, [sel])

  async function concluir(i: number, avancar = true) {
    if (!feitas.includes(i)) {
      setFeitas((f) => [...f, i])
      const { error } = await db.from('prospeccao_curso_progresso').upsert({ pessoa_id: pessoaId, licao: i }, { onConflict: 'pessoa_id,licao' })
      if (error) toast('Não consegui gravar o progresso: ele vale só nesta tela.'); else toast('Lição concluída')
    }
    if (avancar) setSel(Math.min(i + 1, LICOES.length - 1))
  }
  async function recomecar() {
    setFeitas([]); setSel(0)
    const { error } = await db.from('prospeccao_curso_progresso').delete().eq('pessoa_id', pessoaId)
    if (!error) { toast('Curso recomeçado'); setVersao((v) => v + 1) }
  }
  const p = progressoCurso(feitas)
  const l = LICOES[sel]
  return (
    <>
      <Acoes><button className="btn ghost" onClick={() => void recomecar()}>Recomeçar</button></Acoes>
      <AvisoErro erro={exemplos ? null : r.erro} />
      <div className="card pad"><div className="between"><div><h3>Mini curso do Radar</h3><p className="sm muted">7 lições curtas, uns 15 minutos no total.</p></div><b className="mono">{p}%</b></div><div className="bar" style={{ marginTop: 12 }}><i style={{ width: `${p}%`, background: 'var(--goldbtn)' }} /></div></div>
      <div className="cwrap">
        <div className="card lessons">{LICOES.map((x, k) => <button key={x.titulo} className={`les${k === sel ? ' on' : ''}${feitas.includes(k) ? ' ok' : ''}`} onClick={() => setSel(k)}><span className="num">{feitas.includes(k) ? '✓' : k + 1}</span><span><b>{x.titulo}</b><span>{x.duracao}</span></span></button>)}</div>
        <div className="card lesson">
          <span className="lab">Lição {sel + 1} de {LICOES.length}</span><h2>{l.titulo}</h2><p className="txt">{l.texto}</p>
          <ul>{l.pontos.map((x) => <li key={x}>{x}</li>)}</ul>
          <div className="quiz"><b>Teste rápido: {l.pergunta}</b>
            {l.opcoes.map((o, k) => <button key={o} className={errada === k ? 'w' : feitas.includes(sel) && k === l.certa ? 'r' : ''} onClick={() => { if (k === l.certa) { toast('Certo!'); void concluir(sel, false) } else { setErrada(k); toast('Quase. Tente de novo') } }}>{o}</button>)}
          </div>
          <div className="row"><button className="btn pri" onClick={() => void concluir(sel)}>{feitas.includes(sel) ? 'Próxima lição' : 'Marcar como concluída'}</button>{sel > 0 && <button className="btn ghost" onClick={() => setSel(sel - 1)}>Anterior</button>}</div>
        </div>
      </div>
    </>
  )
}
