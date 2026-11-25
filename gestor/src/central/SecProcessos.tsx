// Processos da RBR rodando no PC (lista que o agente manda no batimento). Encerrar = comando com pid e hora de início.
import { useMemo } from 'react'
import { batimentoAtrasado, duracaoLegivel, maisDe24h, podeEncerrar, processosDoResumo, semDono } from '../lib/central'
import { pedirEncerrar } from '../lib/centralDb'
import { fmtData, ultimoBatimento, useCentral } from './ctx'

export default function SecProcessos() {
  const { painel, agora, confirmar, executar } = useCentral()
  const bat = ultimoBatimento(painel)
  const atrasado = batimentoAtrasado(bat?.ultimo_batimento, agora)
  const procs = useMemo(() => processosDoResumo(bat?.resumo_json), [bat])
  const sd = semDono(procs)
  const pendentes = new Set(painel.comandos.filter((c) => c.comando === 'encerrar_processo' && ['pendente', 'executando'].includes(c.status)).map((c) => Number(c.parametros?.pid)))
  const stt = !bat ? ['sem agente', 'wn'] : atrasado ? ['dados antigos', 'wn'] : sd > 0 ? [`${sd} sem dono`, 'wn'] : [`${procs.length} rodando`, 'ok']

  async function encerrar(p: (typeof procs)[number]) {
    const ok = await confirmar({
      titulo: `Encerrar ${p.nome}?`,
      texto: `O programa ${p.nome} (pid ${p.pid}) será encerrado no PC.\nSe ele estiver no meio de um lote, o trabalho fica pela metade e pode ser preciso rodar de novo.\nO agente só encerra se o programa ainda for o mesmo e estiver na pasta da RBR.`,
      ok: 'Encerrar', perigoso: true,
    })
    if (ok) await executar(async () => { await pedirEncerrar(p); return 'Pedido enviado ao agente. O resultado aparece no Registro.' })
  }

  return (
    <section className="card" id="procs">
      <div className="hd"><div><h2>Processos no PC</h2><p>Tudo da RBR que está rodando no seu computador agora, inclusive o que está escondido em segundo plano. O agente atualiza esta lista a cada minuto.</p></div><span className={`stt ${stt[1]}`}>{stt[0]}</span></div>
      {!bat && <div className="empty">O agente do PC ainda não mandou nenhum batimento, então não há lista para mostrar.</div>}
      {bat && atrasado && <div className="empty">Última lista recebida em {fmtData(bat.ultimo_batimento)}. O agente está atrasado: esta lista pode estar desatualizada.</div>}
      {bat && procs.length === 0 && !atrasado && <div className="okline">Nenhum processo da RBR rodando agora.</div>}
      {procs.length > 0 && (
        <div className="ptab">
          <div className="px hd2"><span>Processo</span><span className="c2">Começou</span><span className="c3">Rodando há</span><span className="c4">Quem iniciou</span><span /></div>
          {procs.map((p) => (
            <div className="px" key={`${p.pid}-${p.inicio}`}>
              <div><div className="nm">{p.nome}{p.memoria_mb != null ? ` · ${p.memoria_mb} MB` : ''}</div><div className="ds" title={p.arquivo}>{p.arquivo}</div></div>
              <span className="c2 num">{fmtData(p.inicio)}</span>
              <span className={`c3 num ${maisDe24h(p.inicio, agora) ? 'old' : ''}`}>{duracaoLegivel(p.inicio, agora)}{maisDe24h(p.inicio, agora) ? ' ⚠' : ''}</span>
              <span className="c4">{p.protegido ? <span className="pill">Protegido</span> : p.dono === 'sem dono' ? <span className="pill wn">sem dono</span> : <span className="pill ic">{p.dono}</span>}</span>
              {podeEncerrar(p) ? <button className="sm dng" disabled={pendentes.has(p.pid)} onClick={() => void encerrar(p)}>{pendentes.has(p.pid) ? 'Pedido enviado' : 'Encerrar'}</button> : <span />}
            </div>
          ))}
        </div>
      )}
      <div className="note">Só aparecem programas da RBR que o agente reconhece (pasta D:\RBR\Sistema). O botão Encerrar não toca em nenhum outro programa do PC. Cada encerramento fica no Registro. Processo "sem dono" é o que está rodando mas nenhum robô da Central iniciou, por exemplo um .bat aberto na mão.</div>
    </section>
  )
}
