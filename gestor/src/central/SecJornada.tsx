// Jornada do e-mail: toques e intervalos, textos, modo de cada resposta, ordem dos e-mails do setor certo e as regras automáticas.
// Reaproveita prospeccao_jornada, prospeccao_modelos e prospeccao_respostas_config (o Radar continua lendo as mesmas tabelas).
import { useCallback, useEffect, useState } from 'react'
import { limparPrefixos } from '../lib/central'
import { modosPermitidos, validarTextoResposta, type ModoResposta } from '../lib/radar'
import { carregarJornada, salvarAtraso, salvarModelo, salvarPrefixos, trocarModoResposta, type Modelo, type RespostaCfg, type Toque } from '../lib/centralDbF3'
import { useCentral } from './ctx'

type Dados = Awaited<ReturnType<typeof carregarJornada>>
const PADRAO_PREFIXOS = ['compras', 'suprimentos', 'logistica', 'expedicao', 'transportes', 'frete', 'cotacao', 'comercial', 'faturamento', 'pcp']
const NOME_MODO: Record<string, string> = { rascunho: 'Só sugere (você aprova)', sozinho: 'Responde sozinho', nunca: 'Nunca responde' }

function EditorTexto({ m, rotulo }: { m: Modelo; rotulo: string }) {
  const { executar } = useCentral()
  const [v, setV] = useState(m)
  useEffect(() => setV(m), [m])
  const mudou = v.assunto !== m.assunto || v.corpo !== m.corpo || v.ativo !== m.ativo
  function salvar() {
    void executar(async () => {
      if (/<\/?[a-z][\s\S]*?>/i.test(v.corpo + v.assunto)) throw new Error('O texto não pode conter HTML.')
      if (m.tipo.startsWith('resp_')) { const e = validarTextoResposta(v.corpo); if (e) throw new Error(e) }
      if (v.ativo && !v.corpo.trim()) throw new Error('Não dá para ativar um texto vazio.')
      await salvarModelo(m, v)
      return 'Texto salvo.'
    })
  }
  return (
    <details className="aj">
      <summary>{rotulo} <span className={`pill ${m.ativo ? 'on' : ''}`}>{m.ativo ? 'ativo' : 'desativado'}</span></summary>
      <div className="bx">
        <label className="ds">Assunto <input type="text" style={{ width: '100%' }} value={v.assunto} onChange={(e) => setV({ ...v, assunto: e.target.value })} /></label>
        <label className="ds">Texto <textarea value={v.corpo} onChange={(e) => setV({ ...v, corpo: e.target.value })} /></label>
        <label className="ds" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span className="sw"><input type="checkbox" role="switch" checked={v.ativo} onChange={(e) => setV({ ...v, ativo: e.target.checked })} aria-label={`Ativar ${rotulo}`} /><i /></span>Texto ativo</label>
        <div><button className="sm pri" disabled={!mudou} onClick={salvar}>Salvar texto</button></div>
      </div>
    </details>
  )
}

function LinhaToque({ t, m }: { t: Toque; m?: Modelo }) {
  const { executar } = useCentral()
  const [dias, setDias] = useState(String(t.atraso_dias))
  useEffect(() => setDias(String(t.atraso_dias)), [t.atraso_dias])
  return (
    <div className="rb">
      <span className="n">{t.toque}</span>
      <div>
        <div className="nm">Toque {t.toque}{t.toque === 1 ? ' (primeiro e-mail)' : ''}</div>
        {m ? <EditorTexto m={m} rotulo="Ver e editar o texto" /> : <div className="ds">Texto "{t.modelo_tipo}" não encontrado.</div>}
      </div>
      <label className="ds">{t.toque === 1 ? 'Dia' : 'Depois de'} <input type="number" min={0} max={120} value={dias} disabled={t.toque === 1} onChange={(e) => setDias(e.target.value)} aria-label={`Dias do toque ${t.toque}`} /> dias
        <button className="sm" style={{ marginLeft: 6 }} disabled={t.toque === 1 || Number(dias) === t.atraso_dias} onClick={() => void executar(async () => { await salvarAtraso(t, Number(dias)); return 'Intervalo salvo.' })}>Salvar</button>
      </label>
    </div>
  )
}

function LinhaResposta({ r, m }: { r: RespostaCfg; m?: Modelo }) {
  const { executar } = useCentral()
  const modos = modosPermitidos(r.classe, r.personalizada)
  return (
    <div className="rb">
      <span className="n">↩</span>
      <div>
        <div className="nm">{r.titulo}</div>
        {m && <EditorTexto m={m} rotulo="Ver e editar a resposta" />}
      </div>
      <select aria-label={`Modo de ${r.titulo}`} value={r.modo} disabled={r.travado || modos.length < 2} onChange={(e) => void executar(async () => { await trocarModoResposta(r, e.target.value as ModoResposta); return 'Modo salvo.' })}>
        {modos.map((x) => <option key={x} value={x}>{NOME_MODO[x]}</option>)}
        {!modos.includes(r.modo) && <option value={r.modo}>{NOME_MODO[r.modo]}</option>}
      </select>
    </div>
  )
}

export default function SecJornada() {
  const { flags, executar } = useCentral()
  const [aberto, setAberto] = useState(false)
  const [d, setD] = useState<Dados | null>(null)
  const [erro, setErro] = useState('')
  const [novo, setNovo] = useState('')
  const salvos = limparPrefixos((() => { try { return JSON.parse(flags.CENTRAL_PREFIXOS_SETOR ?? '') } catch { return null } })())
  const temParametro = flags.CENTRAL_PREFIXOS_SETOR != null
  const [lista, setLista] = useState<string[]>(temParametro ? salvos : PADRAO_PREFIXOS)
  useEffect(() => setLista(temParametro ? salvos : PADRAO_PREFIXOS), [flags.CENTRAL_PREFIXOS_SETOR]) // eslint-disable-line react-hooks/exhaustive-deps

  const ler = useCallback(() => { carregarJornada().then((x) => { setD(x); setErro('') }, (e: unknown) => setErro(e instanceof Error ? e.message : 'Falha ao ler a jornada.')) }, [])
  const { painel } = useCentral()
  useEffect(() => { if (aberto) ler() }, [aberto, ler, painel.registro.length])

  const mover = (i: number, dir: -1 | 1) => { const l = [...lista]; const j = i + dir; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; setLista(l) }
  const mudouPref = JSON.stringify(lista) !== JSON.stringify(temParametro ? salvos : PADRAO_PREFIXOS)

  return (
    <section className={`card ${aberto ? '' : 'col'}`} id="jornada">
      <div className="hd">
        <div><h2>Jornada do e-mail</h2><p>Do site da empresa até o contato certo para negociar frete</p></div>
        <span className="stt">{d ? `${d.toques.length} toques` : 'recolhida'}</span>
        <button className="tg" aria-expanded={aberto} aria-label="Abrir ou fechar" onClick={() => setAberto((x) => !x)}>{aberto ? '−' : '+'}</button>
      </div>
      {erro && <div className="ds" role="alert" style={{ color: 'var(--bad)' }}>{erro}</div>}
      {d && (
        <div className="two2">
          <div>
            <div className="lbl" style={{ marginTop: 0 }}>Sequência de e-mails</div>
            {d.toques.map((t) => <LinhaToque key={t.toque} t={t} m={d.modelos.find((x) => x.tipo === t.modelo_tipo)} />)}
            <div className="lbl">Respostas do cliente</div>
            {d.respostas.map((r) => <LinhaResposta key={r.classe} r={r} m={d.modelos.find((x) => x.tipo === `resp_${r.classe}`)} />)}
            <div className="note">Cotação e preço nunca vão sozinhos; reclamação nunca é respondida; pedido para sair é sempre automático. Responder sozinho só vale com a chave de resposta automática ligada, e ela está bloqueada até o robô de leitura executar isso.</div>
          </div>
          <div>
            <div className="lbl" style={{ marginTop: 0 }}>Ordem dos e-mails por prefixo</div>
            <div className="ds">O robô escolhe primeiro o e-mail do setor certo, na ordem abaixo. <b>contato@</b> e parecidos ficam por último, só quando não há nada melhor.</div>
            {lista.map((p, i) => (
              <div className="pr" key={p}><span className="n">{i + 1}</span><span className="chip2">{p}@</span>
                <span className="acts"><button className="sm" aria-label={`Subir ${p}`} disabled={i === 0} onClick={() => mover(i, -1)}>↑</button><button className="sm" aria-label={`Descer ${p}`} disabled={i === lista.length - 1} onClick={() => mover(i, 1)}>↓</button><button className="sm" aria-label={`Tirar ${p}`} onClick={() => setLista(lista.filter((x) => x !== p))}>×</button></span></div>
            ))}
            <div className="row"><input type="text" placeholder="novo prefixo (ex.: pcp)" value={novo} onChange={(e) => setNovo(e.target.value)} aria-label="Novo prefixo" />
              <button className="sm" onClick={() => { const l = limparPrefixos([...lista, novo]); setLista(l); setNovo('') }}>Adicionar</button>
              <button className="sm pri" disabled={!mudouPref} onClick={() => void executar(async () => { await salvarPrefixos(temParametro ? salvos : PADRAO_PREFIXOS, lista); return 'Ordem salva.' })}>Salvar ordem</button></div>
            {!temParametro && <div className="note">A ordem só pode ser salva depois que a migration 0200 for aplicada. Por enquanto vale a ordem fixa do robô.</div>}
            <div className="lbl">Regras automáticas</div>
            <div className="mp">
              <div>Descoberta por resposta</div><div>Se a empresa responde indicando outro e-mail do mesmo domínio, o robô cadastra sozinho em contatos e registra. Se for ambíguo, só avisa você.</div>
              <div>Descadastro</div><div>Pedido para sair (“remover da lista”, “não enviem mais”) vira bloqueio na hora, sem pedir nada. Contato bloqueado nunca entra em fila nem em envio.</div>
            </div>
            <div className="note">Estas duas regras são do robô de leitura; aqui só são mostradas.</div>
          </div>
        </div>
      )}
    </section>
  )
}
