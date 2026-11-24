// Fila do SDR: lista única de quem ligar. Pedro e José Carlos; quem assume primeiro fica com o contato.
// Com CENTRAL_UI_LIBERADA = nao só o Pedro entra (modo teste); com sim, quem estiver em CENTRAL_SDR_PESSOAS também. O banco confere de novo em cada chamada.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import './central.css'
import { ehAdmin, ehSdr, lerFlags } from '../lib/centralDb'
import { aberto, ligacaoLink, motivoTexto, ordenarFila, proximaAcao, quentesSemDono, RESULTADOS, ROTULO_STATUS, sugestaoDeDono, validarCorte, validarMaxDia, type ItemFila } from '../lib/centralSdr'
import { assumir, concluir, devolver, encherFila, lerAjustesFila, listarFila, pessoasDaFila, salvarAjusteFila } from '../lib/centralSdrDb'

function Cartao({ i, eu, pessoas, ehAdm, onFeito, aviso }: { i: ItemFila; eu: string; pessoas: { id: string; nome: string }[]; ehAdm: boolean; onFeito: () => void; aviso: (m: string) => void }) {
  const [dono, setDono] = useState(sugestaoDeDono(i, pessoas, eu))
  const [res, setRes] = useState('ligou')
  const [obs, setObs] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const meu = i.assumido_por === eu
  const tel = ligacaoLink(i.telefone)
  const rodar = async (fazer: () => Promise<string | void>) => {
    setOcupado(true)
    try { const m = await fazer(); if (m) aviso(m) } catch (e) { aviso(e instanceof Error ? e.message : 'Não deu certo.') }
    setOcupado(false); onFeito()
  }
  return (
    <div className={`sr ${i.quente ? 'quente' : ''}`}>
      <div>
        <div className="nm">{i.empresa} {i.quente && <span className="sv urg">Lead quente</span>}</div>
        <div className="ds">{[i.cidade && `${i.cidade}${i.uf ? '/' + i.uf : ''}`, i.segmento].filter(Boolean).join(' · ')}</div>
        <div className="ds">{i.contato_nome ? `${i.contato_nome}${i.contato_cargo ? ', ' + i.contato_cargo : ''}` : 'Contato não identificado'}{i.telefone ? ' · ' : ''}{i.telefone && (tel ? <a className="lk" href={tel}>{i.telefone}</a> : i.telefone)}</div>
        <div className="ds"><b>Por que está na fila:</b> {motivoTexto(i)}{i.nota != null ? ` · nota ${i.nota}` : ''}</div>
        {i.resumo && <div className="ds"><b>Conversa:</b> {i.resumo}</div>}
        {aberto(i) && <div className="ds"><b>Próxima ação:</b> {proximaAcao(i)}</div>}
        {!aberto(i) && <div className="ds"><b>{ROTULO_STATUS[i.status]}</b>{i.assumido_por_nome ? ` por ${i.assumido_por_nome}` : ''}{i.observacao ? ` · ${i.observacao}` : ''}</div>}
      </div>
      {aberto(i) && (
        <div className="acts">
          {i.status === 'na_fila' && (
            <>
              <select aria-label="Quem assume" value={dono} onChange={(e) => setDono(e.target.value)}>{pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select>
              <button className="sm pri" disabled={ocupado} onClick={() => void rodar(async () => {
                const r = await assumir(i.id, dono)
                return r.ok ? 'Contato assumido.' : `Já foi assumido por ${r.assumido_por_nome ?? 'outra pessoa'}.`
              })}>Assumir</button>
            </>
          )}
          {i.status === 'assumido' && !(meu || ehAdm) && <span className="pill ic">assumido por {i.assumido_por_nome ?? 'outra pessoa'}</span>}
          {i.status === 'assumido' && (meu || ehAdm) && (
            <>
              <span className="pill ic">{meu ? 'com você' : `com ${i.assumido_por_nome ?? '—'}`}</span>
              <select aria-label="Resultado da ligação" value={res} onChange={(e) => setRes(e.target.value)}>{RESULTADOS.map((r) => <option key={r.id} value={r.id}>{r.rotulo}</option>)}</select>
              <input type="text" placeholder="Anotação (opcional)" aria-label="Anotação" value={obs} onChange={(e) => setObs(e.target.value)} />
              <button className="sm pri" disabled={ocupado} onClick={() => void rodar(async () => { await concluir(i.id, res, obs); return 'Resultado registrado.' })}>Concluir</button>
              <button className="sm" disabled={ocupado} onClick={() => void rodar(async () => { await devolver(i.id); return 'Devolvido para a fila.' })}>Devolver</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function FilaSdrApp({ papel, pessoaId }: { papel: string; pessoaId: string }) {
  const [acesso, setAcesso] = useState<'carregando' | 'sim' | 'nao'>('carregando')
  const [adm, setAdm] = useState(false)
  const [emTeste, setEmTeste] = useState(true)
  const [lista, setLista] = useState<ItemFila[]>([])
  const [pessoas, setPessoas] = useState<{ id: string; nome: string }[]>([])
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState('')
  const [ajuste, setAjuste] = useState({ corte: '', max: '' })
  const [agora, setAgora] = useState(() => new Date())
  const [aba, setAba] = useState<'abertas' | 'feitas'>('abertas')

  useEffect(() => {
    if (papel !== 'gestor_rbr') { setAcesso('nao'); return }
    let vivo = true
    void Promise.all([ehAdmin(), ehSdr(), lerFlags().catch(() => ({} as Record<string, string>))]).then(([a, s, f]) => {
      if (!vivo) return
      setAdm(a); setEmTeste(f.CENTRAL_UI_LIBERADA !== 'sim')
      setAcesso(a || (s && f.CENTRAL_UI_LIBERADA === 'sim') ? 'sim' : 'nao')
    })
    return () => { vivo = false }
  }, [papel])

  const ler = useCallback(async (encher = false) => {
    try {
      if (encher) await encherFila()
      const [l, p, aj] = await Promise.all([listarFila(), pessoasDaFila(), lerAjustesFila()])
      setLista(l); setPessoas(p); setAjuste(aj); setErro(''); setAgora(new Date())
    } catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao ler a fila.') }
  }, [])
  useEffect(() => {
    if (acesso !== 'sim') return
    void ler(true)
    const t = setInterval(() => void ler(false), 30_000)
    return () => clearInterval(t)
  }, [acesso, ler])
  useEffect(() => { const t = setTimeout(() => setMsg(''), 4000); return () => clearTimeout(t) }, [msg])

  const abertas = useMemo(() => ordenarFila(lista.filter(aberto)), [lista])
  const feitas = useMemo(() => lista.filter((i) => !aberto(i)), [lista])
  const urgentes = useMemo(() => quentesSemDono(lista, agora), [lista, agora])

  if (acesso === 'carregando') return <div className="min-h-dvh flex items-center justify-center text-[color:var(--rbr-navy)]">Carregando…</div>
  if (acesso === 'nao') return <Navigate to="/" replace />

  async function salvar(chave: 'CENTRAL_SDR_CORTE_NOTA' | 'CENTRAL_SDR_MAX_DIA') {
    const v = chave === 'CENTRAL_SDR_CORTE_NOTA' ? validarCorte(ajuste.corte) : validarMaxDia(ajuste.max)
    if (v === null) return setMsg(chave === 'CENTRAL_SDR_CORTE_NOTA' ? 'Nota de 0 a 100.' : 'Número inteiro de 0 a 500.')
    try { await salvarAjusteFila(chave, '', v); setMsg('Salvo.') } catch (e) { setMsg(e instanceof Error ? e.message : 'Não deu certo.') }
    void ler(false)
  }

  return (
    <div className="ctr" data-testid="fila-sdr">
      <header className="top"><div className="in">
        <div className="wm" aria-label="RBR Cargo"><b>RBR</b><span>CARGO</span></div>
        <div><h1>Fila do SDR</h1><div className="sub">Quem ligar hoje</div></div>
        <div className="chips">
          {emTeste && <span className="chip" style={{ background: 'var(--gold)', color: '#12173D', borderColor: 'var(--gold)' }}>Em teste: só o Pedro vê</span>}
          {adm && <Link to="/central" className="chip" style={{ textDecoration: 'none' }}>Central</Link>}
          <Link to="/" className="chip" style={{ textDecoration: 'none' }}>Voltar ao gestor</Link>
        </div>
      </div></header>
      <main className="wrap">
        {erro && <div className="card" role="alert" style={{ borderColor: 'var(--bad)' }}><b>Não consegui ler a fila.</b> <span className="ds">{erro}</span></div>}
        {urgentes.length > 0 && <div className="card" role="alert" style={{ borderLeft: '4px solid var(--bad)' }}><b>{urgentes.length} lead{urgentes.length > 1 ? 's quentes esperando' : ' quente esperando'} alguém assumir há mais de 1 hora.</b> <span className="ds">Lead quente esfria em horas.</span></div>}
        <section className="card" id="sdr">
          <div className="hd"><div><h2>Fila do SDR</h2><p>Quem respondeu e quem tem telefone com nota alta. Pedro ou José Carlos assume, um por vez.</p></div><span className={`stt ${abertas.some((i) => i.status === 'na_fila') ? 'wn' : 'ok'}`}>{abertas.filter((i) => i.status === 'na_fila').length} na fila</span></div>
          <div className="sdrh">
            {adm
              ? (<>
                <label>Nota mínima <input type="number" min={0} max={100} value={ajuste.corte} onChange={(e) => setAjuste({ ...ajuste, corte: e.target.value })} aria-label="Nota mínima" /><button className="sm" onClick={() => void salvar('CENTRAL_SDR_CORTE_NOTA')}>Salvar</button></label>
                <label>Máximo de novos por dia <input type="number" min={0} value={ajuste.max} onChange={(e) => setAjuste({ ...ajuste, max: e.target.value })} aria-label="Máximo por dia" /><button className="sm" onClick={() => void salvar('CENTRAL_SDR_MAX_DIA')}>Salvar</button></label>
              </>)
              : <span className="ds">Nota mínima {ajuste.corte || '—'} · até {ajuste.max || '—'} novos por dia (só o Pedro muda).</span>}
            <span className="seg" style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button className={aba === 'abertas' ? 'pri sm' : 'sm'} onClick={() => setAba('abertas')}>Abertas ({abertas.length})</button>
              <button className={aba === 'feitas' ? 'pri sm' : 'sm'} onClick={() => setAba('feitas')}>Concluídas ({feitas.length})</button>
            </span>
          </div>
          {(aba === 'abertas' ? abertas : feitas).length === 0 && <div className="empty">{aba === 'abertas' ? 'Ninguém na fila agora.' : 'Nenhuma ligação concluída ainda.'}</div>}
          {(aba === 'abertas' ? abertas : feitas).map((i) => <Cartao key={i.id} i={i} eu={pessoaId} pessoas={pessoas} ehAdm={adm} onFeito={() => void ler(false)} aviso={setMsg} />)}
        </section>
      </main>
      <div className={`toast${msg ? ' show' : ''}`} role="status">{msg}</div>
    </div>
  )
}
