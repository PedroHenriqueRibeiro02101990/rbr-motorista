// Central: tela só do Pedro para ligar/desligar robôs, ver limites, enviar a lista para a base e acompanhar o PC.
// Quem decide quem entra é o banco (RLS + central_eh_admin); a tela só esconde o que o banco já recusaria.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import './central.css'
import { batimentoAtrasado, resumoDaLista, faltamNaBase } from '../lib/central'
import { carregarPainel, contagensLista, ehAdmin, lerFlags, type Contagens } from '../lib/centralDb'
import { CentralContexto, fmtData, ultimoBatimento, type CentralCtx, type Painel, type Pedido } from './ctx'
import { Confirmar } from './Confirmar'
import SecKpis from './SecKpis'
import SecLista from './SecLista'
import SecMesa from './SecMesa'
import SecProcessos from './SecProcessos'
import SecLimites from './SecLimites'
import SecRegistro from './SecRegistro'

const SECOES = [['kpis', 'Resultados'], ['lista', 'Lista de clientes'], ['agora', 'Mesa de despacho'], ['procs', 'Processos no PC'], ['limites', 'Limites'], ['registro', 'Registro']] as const
const VAZIO: Painel = { robos: [], batimentos: [], uso: [], comandos: [], registro: [], sugestoesPendentes: 0, filaSdr: 0 }
const TEMA = 'central-tema'

export default function CentralApp({ papel }: { papel: string }) {
  const [acesso, setAcesso] = useState<'carregando' | 'sim' | 'nao'>('carregando')
  const [painel, setPainel] = useState<Painel>(VAZIO)
  const [flags, setFlags] = useState<Record<string, string>>({})
  const [contagens, setContagens] = useState<Contagens | null>(null)
  const [erro, setErro] = useState('')
  const [agora, setAgora] = useState(() => new Date())
  const [pedido, setPedido] = useState<Pedido | null>(null)
  const resposta = useRef<((ok: boolean) => void) | null>(null)
  const [msg, setMsg] = useState('')
  const [tema, setTema] = useState<string>(() => { try { return localStorage.getItem(TEMA) ?? '' } catch { return '' } })
  const [abrirImp, setAbrirImp] = useState(0)

  useEffect(() => {
    if (papel !== 'gestor_rbr') { setAcesso('nao'); return }
    let vivo = true
    void ehAdmin().then((ok) => { if (vivo) setAcesso(ok ? 'sim' : 'nao') })
    return () => { vivo = false }
  }, [papel])

  const recarregar = useCallback(async (comContagens = false) => {
    try {
      const [p, f] = await Promise.all([carregarPainel(), lerFlags()])
      setPainel(p); setFlags(f); setErro(''); setAgora(new Date())
      if (comContagens) setContagens(await contagensLista())
    } catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao ler a Central.') }
  }, [])
  useEffect(() => {
    if (acesso !== 'sim') return
    void recarregar(true)
    const t = setInterval(() => void recarregar(), 30_000)
    const t2 = setInterval(() => void contagensLista().then(setContagens, () => undefined), 120_000)
    return () => { clearInterval(t); clearInterval(t2) }
  }, [acesso, recarregar])
  useEffect(() => { const t = setTimeout(() => setMsg(''), 3500); return () => clearTimeout(t) }, [msg])

  const confirmar = useCallback((p: Pedido) => new Promise<boolean>((res) => { resposta.current = res; setPedido(p) }), [])
  const responder = (ok: boolean) => { setPedido(null); resposta.current?.(ok); resposta.current = null }
  const executar = useCallback(async (fazer: () => Promise<string | void>) => {
    try { const m = await fazer(); if (m) setMsg(m) } catch (e) { setMsg(e instanceof Error ? e.message : 'Não deu certo.') }
    await recarregar(true)
  }, [recarregar])

  const ctx: CentralCtx = useMemo(() => ({ painel, flags, agora, confirmar, aviso: setMsg, recarregar: () => void recarregar(true), executar }), [painel, flags, agora, confirmar, recarregar, executar])

  if (acesso === 'carregando') return <div className="min-h-dvh flex items-center justify-center text-[color:var(--rbr-navy)]">Carregando…</div>
  if (acesso === 'nao') return <Navigate to="/" replace />

  const bat = ultimoBatimento(painel)
  const pcOk = !batimentoAtrasado(bat?.ultimo_batimento, agora)
  const lista = resumoDaLista(bat?.resumo_json)
  const faltam = faltamNaBase(lista, contagens?.naBase ?? 0)
  const emImportacao = painel.comandos.some((c) => c.comando === 'importar_base' && ['pendente', 'executando'].includes(c.status))
  const ligados = painel.robos.filter((r) => !r.travado && (r.flag_chave ? flags[r.flag_chave] === 'sim' : r.ligado)).length
  const emTeste = flags.CENTRAL_UI_LIBERADA !== 'sim'
  const esperandoVoce = (pcOk ? 0 : 1) + (faltam > 0 && !emImportacao ? 1 : 0) + painel.sugestoesPendentes

  return (
    <CentralContexto.Provider value={ctx}>
      <div className="ctr" data-tema={tema || undefined} data-testid="central">
        <header className="top"><div className="in">
          <div className="wm" aria-label="RBR Cargo"><b>RBR</b><span>CARGO</span></div>
          <div><h1>Central</h1><div className="sub">O que fazer agora, resultados e robôs</div></div>
          <div className="chips">
            <span className="chip"><span className="dot" style={pcOk ? undefined : { background: '#FF8F84' }} />{bat ? (pcOk ? 'PC conectado' : 'PC sem sinal') : 'Agente não conectado'}</span>
            {lista?.gerada_em && <span className="chip">Última LISTAS <b>{fmtData(lista.gerada_em)}</b></span>}
            <span className="chip">Robôs ligados <b>{ligados}</b></span>
            {emTeste && <span className="chip" style={{ background: 'var(--gold)', color: '#12173D', borderColor: 'var(--gold)' }}>Em teste: só você vê</span>}
            <Link to="/" className="chip" style={{ textDecoration: 'none' }}>Voltar ao gestor</Link>
            <button aria-label="Alternar tema claro e escuro" onClick={() => { const n = tema === 'escuro' ? 'claro' : 'escuro'; setTema(n); try { localStorage.setItem(TEMA, n) } catch { /* sem armazenamento */ } }}>Tema</button>
          </div>
        </div></header>
        <nav className="nav" aria-label="Seções"><div className="in">
          {SECOES.map(([id, nome]) => <a key={id} href={`#${id}`} onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>{nome}{id === 'agora' && esperandoVoce > 0 ? <i>{esperandoVoce}</i> : null}</a>)}
        </div></nav>
        <main className="wrap">
          {erro && <div className="card" role="alert" style={{ borderColor: 'var(--bad)' }}><b>Não consegui ler a Central.</b> <span className="ds">{erro}</span></div>}
          <SecKpis c={contagens} esperandoVoce={esperandoVoce} fila={painel.filaSdr} />
          <SecLista c={contagens} abrirImportacao={abrirImp} onMudou={() => void recarregar(true)} />
          <SecMesa faltam={faltam} emImportacao={emImportacao} onImportar={() => { document.getElementById('lista')?.scrollIntoView({ behavior: 'smooth' }); setAbrirImp((n) => n + 1) }} />
          <SecProcessos />
          <SecLimites />
          <SecRegistro />
        </main>
        <div className={`toast${msg ? ' show' : ''}`} role="status">{msg}</div>
        <Confirmar pedido={pedido} onResp={responder} />
      </div>
    </CentralContexto.Provider>
  )
}
