// Módulo Radar (prospecção ativa) do gestor: casca com menu lateral próprio, cabeçalho por aba e rodapé com o estado real das chaves.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import './radar.css'
import './radar-extra.css'
import { db } from '../lib/prospeccaoDb'
import { Ctx, Ic, ToastRadar, hojeSP, type Flags } from './ui'
import { useRadarAcesso } from './useRadarAcesso'
import AbaRadar from './AbaRadar'
import AbaBuscar from './AbaBuscar'
import AbaEmpresas from './AbaEmpresas'
import AbaAprovar from './AbaAprovar'
import AbaCaixa from './AbaCaixa'
import AbaJornada from './AbaJornada'
import AbaRelatorios from './AbaRelatorios'
import AbaAjustes from './AbaAjustes'
import AbaCurso from './AbaCurso'

export const ABAS = [
  { id: 'radar', grupo: 'Operação', titulo: 'Radar', curto: 'Radar', sub: 'Visão geral do agente e do dia' },
  { id: 'buscar', titulo: 'Buscar clientes', curto: 'Buscar', sub: 'Encontre empresas na base da Receita e mande para a lista' },
  { id: 'empresas', titulo: 'Empresas', curto: 'Empresas', sub: 'Cada empresa, em que etapa está e qual o próximo passo' },
  { id: 'aprovar', titulo: 'Aprovar envios', curto: 'Aprovar', sub: 'E-mails que o agente escreveu e esperam o seu ok', badge: 'nb' },
  { id: 'caixa', titulo: 'Caixa de e-mail', curto: 'Caixa', sub: 'Ler, responder e escrever, com o agente sugerindo', badge: 'nr' },
  { id: 'jornada', grupo: 'Inteligência', titulo: 'Jornada', curto: 'Jornada', sub: 'Mapa das conversas: cada resposta do cliente e o que dizer' },
  { id: 'relatorios', titulo: 'Relatórios da IA', curto: 'Relatórios', sub: 'O que funcionou na semana e o que o agente sugere mudar' },
  { id: 'ajustes', grupo: 'Sistema', titulo: 'Ajustes', curto: 'Ajustes', sub: 'Chaves, caixas, horário, bloqueios e avisos' },
  { id: 'curso', titulo: 'Mini curso', curto: 'Curso', sub: 'Aprenda a usar o Radar em 15 minutos' },
] as const

const FLAGS_CHAVES = ['PROSPECCAO_UI_LIBERADA', 'PROSPECCAO_ENVIO_LIBERADO', 'PROSPECCAO_LEITURA_LIBERADA', 'PROSPECCAO_RESPOSTA_AUTOMATICA_LIBERADA', 'PROSPECCAO_APROVACAO_OBRIGATORIA', 'PROSPECCAO_MODO_TESTE']

export default function RadarApp({ papel, pessoaId }: { papel: string; pessoaId: string }) {
  const acesso = useRadarAcesso(papel)
  const loc = useLocation()
  const nav = useNavigate()
  const aba = ABAS.find((a) => a.id === loc.pathname.replace(/^\/radar\/?/, '').split('/')[0]) ?? ABAS[0]
  const [flags, setFlags] = useState<Flags>({})
  const [exemplos, setExemplos] = useState(false)
  const [badges, setBadges] = useState<{ nb: number; nr: number }>({ nb: 0, nr: 0 })
  const [tick, setTick] = useState(0)
  const [slot, setSlot] = useState<HTMLElement | null>(null)

  const recarregar = useCallback(() => setTick((t) => t + 1), [])
  useEffect(() => {
    if (!acesso.visivel) return
    let vivo = true
    const carregar = async () => {
      const [fl, nb, nr] = await Promise.all([
        db.from('parametros_sistema').select('chave, valor').in('chave', FLAGS_CHAVES),
        db.from('prospeccao_mensagens').select('id', { count: 'exact', head: true }).eq('status', 'rascunho'),
        db.from('prospeccao_caixa_mensagens').select('id', { count: 'exact', head: true }).eq('pasta', 'entrada').eq('lida', false),
      ])
      if (!vivo) return
      setFlags(Object.fromEntries(((fl.data ?? []) as { chave: string; valor: unknown }[]).map((x) => [x.chave, String(x.valor)])))
      setBadges({ nb: nb.count ?? 0, nr: nr.count ?? 0 })
    }
    void carregar()
    const t = setInterval(() => void carregar(), 60_000)
    return () => { vivo = false; clearInterval(t) }
  }, [acesso.visivel, tick])
  useEffect(() => { window.scrollTo(0, 0) }, [aba.id])

  const envioLigado = flags.PROSPECCAO_ENVIO_LIBERADO === 'sim'
  const emTeste = flags.PROSPECCAO_MODO_TESTE !== 'nao'
  const ctx = useMemo(() => ({ exemplos: exemplos && !envioLigado, flags, ehPedro: acesso.ehPedro, pessoaId, irPara: (a: string) => nav(`/radar/${a}`), recarregar, tick, slot }), [exemplos, envioLigado, flags, acesso.ehPedro, pessoaId, nav, recarregar, tick, slot])

  if (acesso.carregando) return <div className="min-h-dvh flex items-center justify-center text-[color:var(--rbr-navy)]">Carregando…</div>
  if (!acesso.visivel) return <Navigate to="/" replace />

  const estadoRodape = envioLigado ? (emTeste ? ['Modo teste', 'Envio ligado só para destinos de teste', true] : ['Envio real', 'Ligado para empresas de verdade', true]) : [emTeste ? 'Modo teste' : 'Envio desligado', emTeste ? 'Envio desligado' : 'Nenhum e-mail sai', false]

  return (
    <Ctx.Provider value={ctx}>
      <div className="rdr" data-testid="radar">
        <div className="shell">
          <aside className="side">
            <div className="brand">
              <svg viewBox="0 0 64 64" role="img" aria-label="RBR Cargo"><defs><linearGradient id="rdrlg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3A47A0" /><stop offset="1" stopColor="#12173D" /></linearGradient></defs><rect x="1" y="1" width="62" height="62" rx="14" fill="url(#rdrlg)" stroke="#D3A55A" strokeOpacity=".55" /><text x="32" y="33" textAnchor="middle" fontFamily="Archivo,Arial" fontWeight="800" fontSize="22" fill="#fff" letterSpacing="1">RBR</text><rect x="11" y="38" width="42" height="2.5" rx="1.2" fill="#D3A55A" /><text x="32" y="53" textAnchor="middle" fontFamily="Archivo,Arial" fontWeight="700" fontSize="11" fill="#D3A55A" letterSpacing="3">CARGO</text></svg>
              <div><b>Radar</b><span>Prospecção</span></div>
            </div>
            <nav className="menu" aria-label="Abas do Radar">
              {ABAS.map((a) => {
                const n = 'badge' in a && a.badge ? badges[a.badge as 'nb' | 'nr'] : 0
                return (
                  <span key={a.id} style={{ display: 'contents' }}>
                    {'grupo' in a && a.grupo && <div className="grp-t">{a.grupo}</div>}
                    <Link to={`/radar/${a.id}`} aria-current={a.id === aba.id ? 'page' : undefined}>
                      <Ic n={a.id} /><span className="tx">{a.titulo}</span><span className="sh">{a.curto}</span>
                      {n > 0 && <span className="badge">{n}</span>}
                    </Link>
                  </span>
                )
              })}
            </nav>
            <div className="sidefoot">
              {acesso.emTeste && <span className="chip warn" style={{ alignSelf: 'flex-start' }}>Em teste: só você vê</span>}
              <div className="state"><i className={`dot${estadoRodape[2] ? ' ok' : ''}`} /><div><b>{estadoRodape[0]}</b><span>{estadoRodape[1]}</span></div></div>
              <Link to="/" className="btn sm ghost" style={{ justifyContent: 'flex-start' }}><Ic n="voltar" />Voltar ao gestor</Link>
              <p>Hoje é {hojeSP().split('-').reverse().join('/')}.</p>
            </div>
          </aside>
          <main>
            <header className="top">
              <div><h1>{aba.titulo}</h1><p>{aba.sub}</p></div>
              <div className="acts">
                {!envioLigado && <button className="btn" aria-pressed={exemplos} onClick={() => setExemplos((x) => !x)}>{exemplos ? 'Sair dos exemplos' : 'Ver com exemplos'}</button>}
                <span ref={setSlot} style={{ display: 'contents' }} />
              </div>
            </header>
            <section className="view on">
              {aba.id === 'radar' && <AbaRadar />}
              {aba.id === 'buscar' && <AbaBuscar />}
              {aba.id === 'empresas' && <AbaEmpresas />}
              {aba.id === 'aprovar' && <AbaAprovar />}
              {aba.id === 'caixa' && <AbaCaixa />}
              {aba.id === 'jornada' && <AbaJornada />}
              {aba.id === 'relatorios' && <AbaRelatorios />}
              {aba.id === 'ajustes' && <AbaAjustes />}
              {aba.id === 'curso' && <AbaCurso />}
            </section>
          </main>
        </div>
        <ToastRadar />
      </div>
    </Ctx.Provider>
  )
}
