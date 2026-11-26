import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@rbr/shared/supabaseClient'
import { consultar, type Invocar } from './lib/acesso.ts'
import {
  brl, eixoMaisProximo, eixosValidos, km as fmtKm, linhasConta, linkWhatsApp, MARGENS, MENSAGEM_FALHA, opcaoDaMargem, papelPermitido, TIPOS_CARGA,
  textoInterno, type Cidade, type Consulta, type Entrada, type Resposta,
} from './lib/modelo.ts'
import { lerConsultas, lerPrefs, salvarConsulta, salvarPrefs } from './lib/historico.ts'
import { projetar, rodoviaPrincipal, TRAJETO_ESTILIZADO, VIEW } from './lib/mapa.ts'
const logo = '/logo-rbr-cargo-192.png' // PNG original (copiado de shared/brand), servido da pasta public

const RAZAO = 'RBR CARGO TRANSPORTE DE CARGA E LOGISTICA LTDA'
const CNPJ = '69.115.969/0001-04'

// Chamada real à função calcular-cotacao-rota. Erros HTTP (401, 404, 503) viram { status } + corpo para a camada de acesso decidir.
const invocar: Invocar = async (corpo) => {
  const { data, error } = await supabase.functions.invoke('calcular-cotacao-rota', { body: corpo })
  if (!error) return { data, error: null }
  const resp = (error as { context?: Response }).context
  let corpoErro: unknown = null
  try { corpoErro = resp ? await resp.clone().json() : null } catch { corpoErro = null }
  return { data: corpoErro, error: { status: resp?.status, message: error.message } }
}

export default function App() {
  const [sessao, setSessao] = useState<Session | null | undefined>(undefined)
  const [papel, setPapel] = useState<string | null | undefined>(undefined)
  const [avisoSessao, setAvisoSessao] = useState<string | null>(null)

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSessao(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSessao(s))
    return () => sub.subscription.unsubscribe()
  }, [])
  useEffect(() => {
    if (!sessao) { setPapel(undefined); return }
    let vivo = true
    void supabase.from('pessoas').select('papel').eq('auth_user_id', sessao.user.id).maybeSingle().then(({ data }) => { if (vivo) setPapel(data?.papel ?? null) })
    return () => { vivo = false }
  }, [sessao])

  const sair = useCallback(async (msg?: string) => { setAvisoSessao(msg ?? null); await supabase.auth.signOut() }, [])

  if (sessao === undefined) return <div className="app"><p className="carregando">Carregando…</p></div>
  if (!sessao) return <Login aviso={avisoSessao} />
  if (papel === undefined) return <div className="app"><p className="carregando">Carregando…</p></div>
  if (!papelPermitido(papel)) {
    return (
      <div className="login">
        <Topo />
        <div className="aviso erro">Sem acesso. A Calculadora é só para a gestão da RBR. Fale com o Pedro.</div>
        <button className="go" onClick={() => sair()}>Sair</button>
      </div>
    )
  }
  return <Calculadora onSair={() => sair()} onSessaoExpirou={() => sair('Sua sessão expirou. Entre de novo.')} />
}

function Topo({ exemplo, onSair }: { exemplo?: boolean; onSair?: () => void }) {
  return (
    <div className="top">
      <img className="logo" src={logo} alt="Logotipo RBR Cargo" width={42} height={42} />
      <div className="ttl"><b>Calculadora RBR</b><span>Frete certo, na hora.</span></div>
      {exemplo && <div className="live">Exemplo</div>}
      {onSair && <button className="sair" onClick={onSair}>Sair</button>}
    </div>
  )
}

function Login({ aviso }: { aviso: string | null }) {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [entrando, setEntrando] = useState(false)
  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setEntrando(true); setErro(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
    if (error) setErro('E-mail ou senha incorretos.')
    setEntrando(false)
  }
  return (
    <form className="login" onSubmit={entrar}>
      <Topo />
      {aviso && <div className="aviso">{aviso}</div>}
      <label><span className="lbl">E-mail do ERP</span><input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
      <label><span className="lbl">Senha</span><input type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required /></label>
      {erro && <div className="aviso erro">{erro}</div>}
      <button className="go" disabled={entrando}>{entrando ? 'Entrando…' : 'Entrar'}</button>
    </form>
  )
}

function CampoCidade({ valor, onChange, placeholder }: { valor: Cidade | null; onChange: (c: Cidade | null) => void; placeholder: string }) {
  const [texto, setTexto] = useState(valor ? `${valor.cidade} / ${valor.uf}` : '')
  const [lista, setLista] = useState<{ nome: string; uf: string; codigo_ibge: string }[]>([])
  const [aberto, setAberto] = useState(false)
  const [ativo, setAtivo] = useState(0)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => { setTexto(valor ? `${valor.cidade} / ${valor.uf}` : '') }, [valor])

  function digitar(t: string) {
    setTexto(t); onChange(null)
    window.clearTimeout(timer.current)
    const termo = t.split('/')[0].normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
    if (termo.length < 2) { setLista([]); setAberto(false); return }
    timer.current = window.setTimeout(async () => {
      const { data } = await supabase.from('municipios_coordenadas').select('nome, uf, codigo_ibge').ilike('nome_norm', `${termo}%`).order('capital', { ascending: false }).order('nome').limit(8)
      setLista(data ?? []); setAtivo(0); setAberto((data ?? []).length > 0)
    }, 220)
  }
  function escolher(i: number) {
    const m = lista[i]
    if (!m) return
    onChange({ cidade: m.nome, uf: m.uf, ibge: m.codigo_ibge }); setAberto(false)
  }
  return (
    <div className="campo">
      <input className="in" placeholder={placeholder} value={texto} autoComplete="off" inputMode="text" aria-label={placeholder}
        onChange={(e) => digitar(e.target.value)} onFocus={() => lista.length && setAberto(true)} onBlur={() => window.setTimeout(() => setAberto(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setAtivo((a) => Math.min(a + 1, lista.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo((a) => Math.max(a - 1, 0)) }
          else if (e.key === 'Enter' && aberto) { e.preventDefault(); escolher(ativo) }
        }} />
      {aberto && (
        <ul className="sug" role="listbox">
          {lista.map((m, i) => (
            <li key={m.codigo_ibge} role="option" aria-selected={i === ativo} onMouseDown={(e) => { e.preventDefault(); escolher(i) }}>{m.nome}<small>{m.uf}</small></li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Mapa({ r, e }: { r: Resposta; e: Entrada }) {
  const trajeto = projetar(r.geometria)
  const d = trajeto?.d ?? TRAJETO_ESTILIZADO
  const ini = trajeto?.inicio ?? { x: 34, y: 82 }
  const fim = trajeto?.fim ?? { x: 304, y: 42 }
  const meio = trajeto?.meio ?? { x: 160, y: 62 }
  const rt = useRef<SVGPathElement>(null)
  const [pracas, setPracas] = useState<{ x: number; y: number }[]>([])
  const nPracas = r.pedagio?.pracas.length ?? 0
  // Praças igualmente espaçadas ao longo do trajeto (a Repom não devolve coordenadas); só se houver praças informadas.
  useEffect(() => {
    const el = rt.current
    if (!el || nPracas === 0) { setPracas([]); return }
    const L = el.getTotalLength()
    setPracas(Array.from({ length: nPracas }, (_, i) => { const q = el.getPointAtLength((L * (i + 1)) / (nPracas + 1)); return { x: q.x, y: q.y } }))
  }, [d, nPracas])
  const rod = rodoviaPrincipal(r.pedagio?.rodovias)
  const chipKm = r.km != null ? fmtKm(r.km) : ''
  const larg = Math.max(52, chipKm.length * 7 + 14)
  return (
    <div className="map">
      <svg viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} width="100%" role="img" aria-label={`Mapa da rota de ${e.origem.cidade} a ${e.destino.cidade}${chipKm ? `, ${chipKm}` : ''}${nPracas ? `, ${nPracas} praças de pedágio` : ''}`}>
        <defs>
          <radialGradient id="mg" cx="50%" cy="45%" r="75%"><stop offset="0" stopColor="#34429a" stopOpacity=".6" /><stop offset="1" stopColor="#12173D" stopOpacity="0" /></radialGradient>
          <pattern id="gr" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#fff" strokeOpacity=".05" /></pattern>
          <linearGradient id="rg" x1="0" x2="1"><stop offset="0" stopColor="#C99A52" /><stop offset="1" stopColor="#F0CF8E" /></linearGradient>
          <filter id="gl" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3" /></filter>
        </defs>
        <rect width={VIEW.w} height={VIEW.h} rx="12" fill="url(#mg)" />
        <rect width={VIEW.w} height={VIEW.h} rx="12" fill="url(#gr)" />
        <g fill="none" stroke="#fff" strokeOpacity=".09" strokeWidth="1">
          <path d="M-10 96C40 82 70 108 120 96S210 72 260 92 320 82 350 72" />
          <path d="M-10 40C30 30 60 50 110 36S190 14 240 30 310 24 350 16" />
        </g>
        <path ref={rt} d={d} fill="none" stroke="#D3A55A" strokeOpacity=".35" strokeWidth="9" strokeLinecap="round" filter="url(#gl)" />
        <path d={d} fill="none" stroke="#12173D" strokeOpacity=".7" strokeWidth="6" strokeLinecap="round" />
        <path d={d} fill="none" stroke="url(#rg)" strokeWidth="2.6" strokeLinecap="round" strokeDasharray="0.1 6.5" className="flow" />
        {pracas.map((p, i) => <rect key={i} x={p.x - 3} y={p.y - 3} width="6" height="6" rx="1.5" fill="#fff" stroke="#12173D" strokeWidth="1.5" />)}
        {rod && <g transform={`translate(${meio.x - 23},${meio.y - 30})`}><rect width="46" height="17" rx="5" fill="#fff" /><rect x="2" y="2" width="42" height="13" rx="3.5" fill="#12173D" /><text x="23" y="12.2" textAnchor="middle" fontFamily="Archivo,sans-serif" fontWeight="800" fontSize="9.5" fill="#fff" letterSpacing=".04em">{rod}</text></g>}
        {chipKm && <g transform={`translate(${meio.x - larg / 2},${meio.y - 8})`}><rect width={larg} height="20" rx="10" fill="#12173D" stroke="#D3A55A" strokeOpacity=".8" /><text x={larg / 2} y="14" textAnchor="middle" fontFamily="Archivo,sans-serif" fontWeight="700" fontSize="11" fill="#E6BE7A">{chipKm}</text></g>}
        <circle cx={ini.x} cy={ini.y} r="9" fill="#fff" fillOpacity=".16"><animate attributeName="r" values="8;15;8" dur="2.8s" repeatCount="indefinite" /><animate attributeName="fill-opacity" values=".28;0;.28" dur="2.8s" repeatCount="indefinite" /></circle>
        <circle cx={ini.x} cy={ini.y} r="5.5" fill="#fff" stroke="#1E2761" strokeWidth="3" />
        <text x="14" y="108" fontFamily="Archivo,sans-serif" fontWeight="600" fontSize="10.5" fill="#fff">{e.origem.cidade.toUpperCase()} · {e.origem.uf}</text>
        <g transform={`translate(${fim.x - 304},${fim.y - 42})`}>
          <ellipse cx="304" cy="60" rx="9" ry="3" fill="#000" opacity=".3" />
          <path d="M304 58C304 58 294 47 294 40a10 10 0 0 1 20 0c0 7-10 18-10 18z" fill="#D3A55A" /><circle cx="304" cy="40" r="3.6" fill="#12173D" />
        </g>
        <text x="326" y="104" textAnchor="end" fontFamily="Archivo,sans-serif" fontWeight="600" fontSize="10.5" fill="#fff">{e.destino.cidade.toUpperCase()} · {e.destino.uf}</text>
        <text x="326" y="14" textAnchor="end" fontFamily="Archivo,sans-serif" fontWeight="600" fontSize="9.5" letterSpacing=".08em" fill="#aab0e0">{e.incluirVolta ? 'IDA E VOLTA' : 'SÓ IDA'}{nPracas ? ` · ${nPracas} PRAÇAS` : ''}</text>
      </svg>
    </div>
  )
}

function Calculadora({ onSair, onSessaoExpirou }: { onSair: () => void; onSessaoExpirou: () => void }) {
  const prefs0 = lerPrefs()
  const [origem, setOrigem] = useState<Cidade | null>(null)
  const [destino, setDestino] = useState<Cidade | null>(null)
  const [tipoCarga, setTipoCarga] = useState(prefs0.tipoCarga)
  const [eixos, setEixos] = useState(prefs0.eixos)
  const [incluirVolta, setIncluirVolta] = useState(prefs0.incluirVolta)
  const [margem, setMargem] = useState(prefs0.margem)
  const [linhasEixos, setLinhasEixos] = useState<{ tipo_carga: string; eixos: number }[]>([])
  const [carregando, setCarregando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [atual, setAtual] = useState<Consulta | null>(null)
  const [ultima, setUltima] = useState(false) // mostrando "última consulta" salva (sem internet)
  const [conta, setConta] = useState(false)
  const [copiado, setCopiado] = useState(false)

  // Eixos válidos da Tabela A por tipo de carga (lido do banco; sem acesso, usa a lista padrão).
  useEffect(() => {
    void supabase.from('piso_antt_coeficientes').select('tipo_carga, eixos').eq('tabela', 'A').then(({ data }) => setLinhasEixos(data ?? []))
  }, [])
  const validos = eixosValidos(linhasEixos, tipoCarga)

  useEffect(() => { salvarPrefs({ tipoCarga, eixos, incluirVolta, margem }) }, [tipoCarga, eixos, incluirVolta, margem])

  function trocarCarga(v: string) {
    setTipoCarga(v)
    setEixos((e) => eixoMaisProximo(e, eixosValidos(linhasEixos, v)))
  }
  function inverter() { setOrigem(destino); setDestino(origem) }

  async function calcular() {
    if (!origem || !destino) return setMsg('Escolha origem e destino na lista.')
    const entrada: Entrada = { origem, destino, tipoCarga, eixos, incluirVolta }
    setCarregando(true); setMsg(null); setConta(false); setUltima(false)
    const r = await consultar(entrada, invocar, navigator.onLine)
    setCarregando(false)
    if (r.ok) {
      const c: Consulta = { quando: new Date().toISOString(), entrada, resposta: r.resposta }
      setAtual(c)
      salvarConsulta(c)
      return
    }
    if (r.falha === 'sessao') return onSessaoExpirou()
    if (r.falha === 'offline') {
      const ult = lerConsultas()[0]
      if (ult) { setAtual(ult); setUltima(true) }
    }
    setMsg(r.mensagem ?? MENSAGEM_FALHA[r.falha])
  }

  const r = atual?.resposta ?? null
  const e = atual?.entrada ?? null
  const opcao = r ? opcaoDaMargem(r, margem) : null
  const texto = r && e && atual ? textoInterno(e, r, opcao, atual.quando) : ''
  async function copiar() {
    try { await navigator.clipboard.writeText(texto) } catch {
      const t = document.createElement('textarea'); t.value = texto; document.body.appendChild(t); t.select(); try { document.execCommand('copy') } catch { /* sem cópia */ } t.remove()
    }
    setCopiado(true); window.setTimeout(() => setCopiado(false), 1800)
  }
  const emTeste = r != null && !r.demo && r.emTeste
  const parte = (v: number) => { const [i, d] = v.toFixed(2).split('.'); return `${Number(i).toLocaleString('pt-BR')},${d}` }

  return (
    <div className="app">
      <Topo exemplo={r?.demo === true} onSair={onSair} />

      <div className="rota">
        <div className="pinc"><div className="dot" /><div className="dash" /><div className="dot f" /></div>
        <CampoCidade valor={origem} onChange={setOrigem} placeholder="Origem (cidade)" />
        <CampoCidade valor={destino} onChange={setDestino} placeholder="Destino (cidade)" />
        <button className="swap" type="button" aria-label="Inverter origem e destino" onClick={inverter}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3" /></svg>
        </button>
      </div>

      <div className="row">
        <div><div className="lbl">Carga</div>
          <select className="sel" value={tipoCarga} onChange={(ev) => trocarCarga(ev.target.value)} aria-label="Tipo de carga">
            {TIPOS_CARGA.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
          </select></div>
        <div><div className="lbl">Percurso</div>
          <div className="seg" role="group" aria-label="Percurso">
            <button type="button" className={incluirVolta ? '' : 'on'} onClick={() => setIncluirVolta(false)}>Só ida</button>
            <button type="button" className={incluirVolta ? 'on' : ''} onClick={() => setIncluirVolta(true)}>Ida e volta</button>
          </div></div>
      </div>

      <div>
        <div className="eixh"><div className="lbl">Eixos</div><span className="chip">Tabela A · Lotação</span></div>
        <div className="eix" role="group" aria-label="Eixos">
          {validos.map((n) => <button type="button" key={n} className={`e${n === eixos ? ' on' : ''}`} onClick={() => setEixos(n)}>{n}</button>)}
        </div>
      </div>

      <button className="go" type="button" onClick={calcular} disabled={carregando}>{carregando ? 'Calculando…' : 'Calcular'}</button>
      {msg && <div className="aviso erro" role="alert">{msg}</div>}

      {r && e && atual && (
        <div className="panel">
          {ultima && <div className="aviso" style={{ marginBottom: 6 }}>Última consulta, de {new Date(atual.quando).toLocaleDateString('pt-BR')}. Sem internet, o valor pode estar desatualizado.</div>}
          {r.demo && <div className="aviso" style={{ marginBottom: 6 }}>EXEMPLO: números de demonstração (cálculo real ainda não ligado).</div>}
          {emTeste && <div className="aviso" style={{ marginBottom: 6 }}>Valor de teste (pedágio do ambiente de homologação da Repom).</div>}
          <Mapa r={r} e={e} />
          <div className="cost"><div className="cap">Custo · piso + pedágio</div><div className="v">{r.custo != null ? <><small>R$</small>{parte(r.custo)}</> : '—'}</div></div>
          <div className="two">
            <div><span className="cap">Piso ANTT</span><b>{r.piso ? brl(r.piso.valor) : '—'}</b>{!r.piso && r.pisoErro && <i>{r.pisoErro}</i>}</div>
            <div><span className="cap">Pedágio</span><b>{r.pedagio ? brl(r.pedagio.total) : '—'}</b>{r.pedagio && r.incluirVolta && <i>ida {r.pedagio.ida != null ? brl(r.pedagio.ida) : '—'} · volta {r.pedagio.volta != null ? brl(r.pedagio.volta) : '—'}</i>}{!r.pedagio && r.pedagioErro && <i>{r.pedagioErro}</i>}</div>
          </div>

          {r.referencia ? (
            <div className="price">
              <div className="pr1"><span className="cap">Referência de venda</span>
                <div className="mg" role="group" aria-label="Margem">{MARGENS.map((m) => <button type="button" key={m} className={m === margem ? 'on' : ''} onClick={() => setMargem(m)}>{m}%</button>)}</div></div>
              {opcao && opcao.valorFinal != null && opcao.lucro != null ? (
                <>
                  <div className="pv"><small>R$</small>{parte(opcao.valorFinal)}</div>
                  <div className="pn">{opcao.texto.replace(' . ', ' · ')} · lucro {brl(opcao.lucro)} · referência, não é cotação</div>
                  {opcao.abaixoDoMinimo && r.parametrosReferencia && <div className="pn alerta">Margem de {((opcao.margem ?? 0) * 100).toFixed(1).replace('.', ',')}% fica abaixo do mínimo de {Math.round(r.parametrosReferencia.margemMin * 100)}%.</div>}
                  {opcao.erro && <div className="pn alerta">{opcao.erro}</div>}
                </>
              ) : <div className="pn">{opcao?.erro ?? 'Sem referência para essa margem.'}</div>}
            </div>
          ) : (
            <div className="aviso" style={{ marginTop: 10 }}>Sem referência de venda: precisa do piso e do pedágio juntos. Informe o que faltou à mão.</div>
          )}

          {r.avisos.filter((a) => !/^EXEMPLO|^Pedágio de teste/.test(a)).map((a, i) => <div className="pn" key={i}>{a}</div>)}

          <div className="acts">
            <button className="a" type="button" onClick={() => setConta((v) => !v)}>{conta ? 'Fechar conta' : 'Ver conta'}</button>
            <button className="a" type="button" onClick={copiar}>{copiado ? 'Copiado ✓' : 'Copiar'}</button>
            <a className="a w" href={linkWhatsApp(texto)} target="_blank" rel="noopener noreferrer">WhatsApp</a>
          </div>
          {conta && <div className="conta">{linhasConta(e, r, opcao).map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div>}
        </div>
      )}

      <p className="foot"><b>{RAZAO}</b>CNPJ {CNPJ} · Piso: {r?.piso?.fonte ?? 'Portaria SUROC 22'} · Pedágio: Repom{emTeste || r?.demo ? ' (valor de teste)' : ''}</p>
    </div>
  )
}
