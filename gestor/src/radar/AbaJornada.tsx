// R8: mapa mental da jornada. Cada caixa é uma resposta do cliente (ou um toque da sequência), com frases-exemplo, resposta sugerida e quanto o agente pode fazer sozinho.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { auditar, db } from '../lib/prospeccaoDb'
import { NOS_MAPA, VARIAVEIS_RESPOSTA, caminhoCurva, corDaLinha, modoEfetivo, modosPermitidos, slugClasse, validarTextoResposta, type ModoResposta, type NoMapa } from '../lib/radar'
import { Acoes, AvisoErro, Ic, toast, useConsulta, useRadar } from './ui'

type Config = { classe: string; titulo: string; subtitulo: string | null; modo: ModoResposta; exemplos: string[]; travado: boolean; personalizada: boolean; depois: string | null }
type Modelo = { tipo: string; assunto: string; corpo: string; ativo: boolean }
const WA = '(11) 95101-2846'
const TEXTO_PADRAO: Record<string, string> = {
  cotacao: `Fechou, {nome}!\n\nPara já te devolver a cotação certinha, me confirma só o que falta: origem, destino, tipo de carga e peso, veículo, valor da mercadoria e CNPJ.\n\nSe preferir, me chama no WhatsApp ${WA}.`,
  preco_prazo: 'Depende da rota e da carga, {nome}. Me passa origem, destino, peso e o tipo de veículo que eu te mando o valor certinho ainda hoje.',
  regiao: 'Atendemos sim, {nome}: saímos de SP para todo o Brasil, com rotas mais fortes para Sul, Sudeste e Centro-Oeste. Qual a rota de vocês?',
  veiculos: 'Trabalhamos com truck, carreta (baú, sider, graneleiro, aberta), prancha e munck, com motoristas parceiros homologados. Qual é a carga?',
  seguro: 'Temos sim: seguro RCTR-C em todas as viagens, com averbação de cada carga. Para mercadoria de alto valor ajustamos a cobertura na cotação.',
  agora_nao: 'Combinado, {nome}, obrigado pelo retorno! Fico à disposição para quando precisarem de reforço, principalmente em pico ou carga urgente.',
  nao_sou_eu: 'Fechou, {nome}, obrigado! Vou falar com ele.',
  sair: 'Combinado, não enviaremos mais. Obrigado.',
  reclamacao: '(o agente não responde: avisa o Pedro com prioridade)',
  t2: 'Oi {nome}, passando para ver se faz sentido a RBR entrar na lista de cotação de vocês. Se tiver alguma carga para esta semana, me chama.',
  t3: 'Oi {nome}, voltando rapidinho: a RBR atende carga fechada de truck a carreta, com motorista homologado e seguro em dia. Posso entrar na lista de cotação de vocês?',
  t4: 'Oi {nome}, vou parar de te escrever por aqui. Se um dia precisar de frete de carga fechada, é só responder este e-mail.',
}
const DEPOIS_PADRAO: Record<string, string> = {
  t2: 'Sem resposta: toque 3 no dia 7.', t3: 'Sem resposta: toque 4 no dia 14.', t4: 'Repouso de 90 dias.',
  cotacao: 'Lead quente: avisa Pedro e José Carlos. Se ninguém assumir em 1 dia útil, sobe para o Pedro.', preco_prazo: 'Vira pedido de cotação quando vierem os dados.',
}
const EXEMPLOS_PADRAO: Record<string, string[]> = {
  cotacao: ['Conseguem cotar uma carga para Curitiba?', 'Qual o valor de SP para BH?', 'Preciso de uma carreta sábado'], preco_prazo: ['Qual o preço do frete?', 'Vocês cobram por km?'],
  regiao: ['Vocês atendem o Nordeste?', 'Fazem Sul?'], veiculos: ['Tem carreta sider?', 'Fazem com munck?'], seguro: ['A carga vai segurada?', 'Qual a cobertura?'],
  agora_nao: ['Já temos transportadora fixa', 'No momento não precisamos'], nao_sou_eu: ['Quem cuida disso é o Marcos, do PCP'], sair: ['Não enviem mais e-mails', 'Remover da lista'], reclamacao: ['Isso é spam', 'Vou denunciar'],
}
const COL_X = [0, 1, 2] as const

export default function AbaJornada() {
  const { exemplos, flags, tick } = useRadar()
  const [sel, setSel] = useState('cotacao')
  const [versao, setVersao] = useState(0)
  const [nova, setNova] = useState<{ titulo: string; exemplos: string; resposta: string } | null>(null)
  const cfg = useConsulta(() => db.from('prospeccao_respostas_config').select('*') as PromiseLike<{ data: Config[] | null; error: { message: string } | null }>, [] as Config[], [tick, versao])
  const mod = useConsulta(() => db.from('prospeccao_modelos').select('tipo, assunto, corpo, ativo') as PromiseLike<{ data: Modelo[] | null; error: { message: string } | null }>, [] as Modelo[], [tick, versao])
  const mapa = useRef<HTMLDivElement>(null)
  const nos = useRef<Record<string, HTMLElement | null>>({})
  const [linhas, setLinhas] = useState<{ id: string; d: string; cor: string }[]>([])
  const [dim, setDim] = useState({ w: 0, h: 0 })

  const todos: NoMapa[] = useMemo(() => {
    const extras: NoMapa[] = cfg.dados.filter((c) => c.personalizada).map((c) => ({ id: c.classe, col: 2, pai: 'resp', titulo: c.titulo, sub: 'pergunta nova', classe: c.classe, modelo: `resp_${c.classe}` }))
    const l = [...NOS_MAPA]; const i = l.map((n) => n.id).lastIndexOf('reclamacao')
    l.splice(i + 1, 0, ...extras)
    return l
  }, [cfg.dados])
  const no = todos.find((n) => n.id === sel) ?? todos[3]
  const config = no.classe ? cfg.dados.find((c) => c.classe === no.classe) : undefined
  const modelo = no.modelo ? mod.dados.find((m) => m.tipo === no.modelo) : undefined
  const padrao = TEXTO_PADRAO[no.classe ?? no.id] ?? ''
  const personalizada = !!config?.personalizada

  const medir = useCallback(() => {
    const m = mapa.current
    if (!m) return
    const box = m.getBoundingClientRect()
    const pt = (id: string, dir: 'r' | 'l') => { const el = nos.current[id]; if (!el) return null; const r = el.getBoundingClientRect(); return { x: (dir === 'r' ? r.right : r.left) - box.left + m.scrollLeft, y: r.top + r.height / 2 - box.top + m.scrollTop } }
    setDim({ w: m.scrollWidth, h: m.scrollHeight })
    setLinhas(todos.flatMap((n) => { const pai = n.col === 1 ? 'root' : n.pai; if (!pai) return []; const a = pt(pai, 'r'), b = pt(n.id, 'l'); return a && b ? [{ id: n.id, d: caminhoCurva(a, b), cor: corDaLinha(n.tipo) }] : [] }))
  }, [todos])
  useLayoutEffect(() => { medir() }, [medir, sel, cfg.dados])
  useEffect(() => { window.addEventListener('resize', medir); const t = setTimeout(medir, 120); return () => { window.removeEventListener('resize', medir); clearTimeout(t) } }, [medir])

  // rascunhos locais do painel (voltam ao salvo quando troca de caixa)
  const [texto, setTexto] = useState('')
  const [frases, setFrases] = useState<string[]>([])
  useEffect(() => {
    setTexto(modelo && !/A DEFINIR/.test(modelo.corpo) ? modelo.corpo : padrao)
    setFrases(config?.exemplos?.length ? config.exemplos : EXEMPLOS_PADRAO[no.classe ?? ''] ?? [])
  }, [no.id, modelo?.corpo, config?.exemplos, padrao]) // eslint-disable-line react-hooks/exhaustive-deps

  const modos = modosPermitidos(no.classe ?? '', personalizada)
  const modoAtual: ModoResposta = no.classe ? (config?.modo ?? modos[0]) : 'rascunho'
  const efetivo = no.classe ? modoEfetivo(no.classe, modoAtual, flags.PROSPECCAO_RESPOSTA_AUTOMATICA_LIBERADA === 'sim', personalizada) : 'rascunho'
  const toque = !no.classe

  async function salvar() {
    const erro = validarTextoResposta(texto)
    if (erro) return toast(erro)
    if (exemplos) return toast('Exemplo: resposta salva')
    if (no.modelo && no.classe !== 'reclamacao') {
      const base = modelo ?? { tipo: no.modelo, assunto: `Re: ${no.titulo}`, corpo: '', ativo: false }
      const { error } = await db.from('prospeccao_modelos').upsert({ tipo: no.modelo, assunto: base.assunto, corpo: texto, ativo: true }, { onConflict: 'tipo' })
      if (error) return toast(error.message)
    }
    if (no.classe && config) {
      const { error } = await db.from('prospeccao_respostas_config').update({ exemplos: frases.filter((f) => f.trim()), atualizado_em: new Date().toISOString() }).eq('classe', no.classe)
      if (error) return toast(error.message)
    }
    try { await auditar('prospeccao_jornada_editada', { no: no.id }) } catch { /* melhor esforço */ }
    toast('Resposta salva no mapa'); setVersao((v) => v + 1)
  }
  async function trocarModo(m: ModoResposta) {
    if (!no.classe || !modos.includes(m) || m === modoAtual) return
    if (exemplos) return toast('Exemplo: modo alterado')
    const { error } = await db.from('prospeccao_respostas_config').update({ modo: m, atualizado_em: new Date().toISOString() }).eq('classe', no.classe)
    if (error) return toast(error.message)
    try { await auditar('prospeccao_jornada_modo', { classe: no.classe, modo: m }) } catch { /* melhor esforço */ }
    toast(m === 'sozinho' ? (flags.PROSPECCAO_RESPOSTA_AUTOMATICA_LIBERADA === 'sim' ? 'O agente passa a responder este tipo sozinho' : 'Salvo. Só vale quando a resposta automática for ligada nos Ajustes') : 'Volta a ser rascunho para você aprovar'); setVersao((v) => v + 1)
  }
  async function criarPergunta() {
    if (!nova) return
    const classe = slugClasse(nova.titulo)
    const resposta = nova.resposta.trim()
    if (!classe) return toast('Dê um nome para a pergunta.')
    if (resposta) { const e = validarTextoResposta(resposta); if (e) return toast(e) }
    if (exemplos) { setNova(null); return toast('Exemplo: pergunta criada') }
    const ex = nova.exemplos.split('\n').map((x) => x.trim()).filter(Boolean)
    const { error } = await db.from('prospeccao_respostas_config').insert({ classe, titulo: nova.titulo.trim(), subtitulo: 'pergunta nova', modo: 'rascunho', exemplos: ex, travado: false, personalizada: true, depois: 'Fica como rascunho na Caixa de e-mail.' })
    if (error) return toast(error.code === '23505' ? 'Já existe uma pergunta com este nome.' : error.message)
    if (resposta) await db.from('prospeccao_modelos').upsert({ tipo: `resp_${classe}`, assunto: `Re: ${nova.titulo.trim()}`, corpo: resposta, ativo: true }, { onConflict: 'tipo' })
    try { await auditar('prospeccao_jornada_pergunta_nova', { classe }) } catch { /* melhor esforço */ }
    setNova(null); setSel(classe); setVersao((v) => v + 1); toast('Nova pergunta adicionada ao mapa, em modo rascunho')
  }

  const colunas = COL_X.map((c) => todos.filter((n) => n.col === c))
  return (
    <>
      <Acoes><button className="btn" onClick={() => setNova({ titulo: '', exemplos: '', resposta: '' })}><Ic n="plus" />Nova pergunta</button></Acoes>
      <AvisoErro erro={exemplos ? null : cfg.erro ?? mod.erro} />
      {nova && (
        <div className="card pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h3>Nova pergunta</h3><p className="xs muted">Sempre nasce em modo rascunho: o agente sugere e você aprova.</p>
          <input className="inp" placeholder="Nome da pergunta (ex.: Tem desconto à vista?)" value={nova.titulo} onChange={(e) => setNova({ ...nova, titulo: e.target.value })} />
          <textarea className="inp" rows={3} placeholder="Frases que o cliente costuma dizer (uma por linha)" value={nova.exemplos} onChange={(e) => setNova({ ...nova, exemplos: e.target.value })} />
          <textarea className="inp" rows={4} placeholder="Resposta sugerida (use {nome}, {empresa}, {cidade}, {segmento_frase}, {veiculo})" value={nova.resposta} onChange={(e) => setNova({ ...nova, resposta: e.target.value })} />
          <div className="row"><button className="btn pri sm" onClick={() => void criarPergunta()}>Criar</button><button className="btn ghost sm" onClick={() => setNova(null)}>Cancelar</button></div>
        </div>
      )}
      <div className="mapwrap">
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="map" ref={mapa} onScroll={medir}>
            <svg className="lines" width={dim.w} height={dim.h}>{linhas.map((l) => <path key={l.id} d={l.d} fill="none" stroke={l.cor} strokeWidth={l.id === sel ? 2.5 : 1.5} opacity={l.id === sel ? 1 : 0.7} />)}</svg>
            <div className="mcols">
              {colunas.map((c, i) => (
                <div key={i} className="mcol">
                  {c.map((n) => <button key={n.id} ref={(el) => { nos.current[n.id] = el }} className={`node${n.tipo ? ` ${n.tipo}` : ''}${n.id === sel ? ' on' : ''}`} onClick={() => setSel(n.id)}><b>{n.titulo}</b><span>{n.sub}</span></button>)}
                </div>
              ))}
            </div>
          </div>
          <div className="mleg"><span><i style={{ background: 'var(--goldbtn)' }} />vai para vocês</span><span><i style={{ background: 'var(--ok)' }} />agente pode responder sozinho</span><span><i style={{ background: 'var(--bad)' }} />para a sequência</span><span><i style={{ background: 'var(--line2)' }} />sem resposta</span></div>
        </div>
        <div className="card npanel">
          {!no.modelo && !no.classe ? <div className="sec"><h3>{no.titulo}</h3><p className="sm muted" style={{ marginTop: 6 }}>{no.sub}. Clique numa caixa da direita para ver o que o agente responde.</p></div> : (
            <>
              <div className="sec"><span className="lab">{toque ? 'Quando ninguém responde' : 'Quando o cliente diz'}</span><h3 style={{ marginTop: 6 }}>{no.titulo}</h3>
                {toque ? <p className="sm muted" style={{ marginTop: 6 }}>Sem resposta do cliente: o agente manda este toque.</p> : (
                  <>
                    <ul className="quote">{frases.map((f, i) => <li key={i}><input className="inp" style={{ padding: '4px 8px' }} value={f} onChange={(e) => setFrases(frases.map((x, k) => (k === i ? e.target.value : x)))} aria-label={`Frase ${i + 1}`} /></li>)}</ul>
                    <div className="row" style={{ marginTop: 6 }}><button className="btn ghost sm" onClick={() => setFrases([...frases, ''])}>Adicionar exemplo</button></div>
                  </>
                )}
              </div>
              <div className="sec">
                <div className="between"><span className="lab">Sugestão de resposta</span><button className="btn ghost sm" disabled title="A reescrita pela IA será ligada junto com o agente de IA">✦ Outra versão</button></div>
                <textarea className="inp" rows={7} style={{ marginTop: 8 }} value={texto} disabled={no.classe === 'reclamacao'} onChange={(e) => setTexto(e.target.value)} />
                {!modelo && <p className="xs faint" style={{ marginTop: 4 }}>Texto inicial do protótipo, ainda não salvo.</p>}
                <div className="row" style={{ marginTop: 6 }}>{VARIAVEIS_RESPOSTA.map((v) => <span key={v} className="chip ice" style={{ cursor: 'pointer' }} onClick={() => setTexto((t) => `${t}{${v}}`)}>{`{${v}}`}</span>)}</div>
              </div>
              {!toque && (
                <div className="sec"><span className="lab">O agente pode</span>
                  <div style={{ marginTop: 8 }}><span className="seg">
                    <button aria-pressed={modoAtual !== 'sozinho'} disabled={!modos.includes('rascunho') && !modos.includes('nunca')} onClick={() => void trocarModo(modos.includes('nunca') ? 'nunca' : 'rascunho')}>{no.classe === 'reclamacao' ? 'Nunca responde' : 'Só rascunho'}</button>
                    <button aria-pressed={modoAtual === 'sozinho'} disabled={!modos.includes('sozinho')} onClick={() => void trocarModo('sozinho')}>Responder sozinho</button>
                  </span></div>
                  {no.classe && ['cotacao', 'preco_prazo'].includes(no.classe) && <p className="xs faint" style={{ marginTop: 8 }}>Cotação e preço nunca vão sozinhos.</p>}
                  {no.classe === 'reclamacao' && <p className="xs faint" style={{ marginTop: 8 }}>Reclamação nunca é respondida: o agente avisa o Pedro e para tudo.</p>}
                  {no.classe === 'sair' && <p className="xs faint" style={{ marginTop: 8 }}>Pedido para sair é sempre automático.</p>}
                  {personalizada && <p className="xs faint" style={{ marginTop: 8 }}>Pergunta nova: sempre em rascunho.</p>}
                  {modoAtual === 'sozinho' && no.classe !== 'sair' && efetivo !== 'sozinho' && <p className="xs" style={{ marginTop: 8, color: 'var(--warn)' }}>Salvo, mas só vale com a resposta automática ligada nos Ajustes (hoje desligada).</p>}
                </div>
              )}
              <div className="sec"><span className="lab">Depois disso</span><p className="sm" style={{ marginTop: 6 }}>{config?.depois ?? DEPOIS_PADRAO[no.classe ?? no.id] ?? DEPOIS_PADRAO[no.id] ?? 'Fica como rascunho na Caixa de e-mail.'}</p>
                <div className="row" style={{ marginTop: 12 }}><button className="btn pri sm" disabled={no.classe === 'reclamacao'} onClick={() => void salvar()}>Salvar</button></div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
