// R7: caixa de e-mail completa (pastas | lista | leitura). Lê prospeccao_caixa_mensagens (preenchida pelo robô de leitura). O envio sai pelo robô
// prospeccao-enviar (fila prospeccao_emails): ele obedece ENVIO_LIBERADO e MODO_TESTE. Desligado = a tela salva como rascunho.
import { useEffect, useMemo, useState } from 'react'
import { auditar, db } from '../lib/prospeccaoDb'
import { decidirEnvioManual } from '../lib/radar'
import { EXEMPLO_CAIXA } from './exemplos'
import { Acoes, AvisoErro, FaixaExemplo, Ic, mensagemDeErro, quando, toast, useConsulta, useRadar } from './ui'

type Anexo = { nome: string; tipo?: string; tamanho?: number; caminho?: string }
type Msg = {
  id: string; caixa: string; pasta: string; uid_imap: number | null; message_id: string | null; in_reply_to: string | null; references: string | null; de: string; para: string; cc: string | null
  assunto: string; corpo_texto: string | null; recebido_em: string; lida: boolean; estrela: boolean; etiquetas: string[]; anexos: Anexo[]; empresa_id: string | null; resposta_id: string | null
  direcao: 'entrada' | 'saida'; _fio?: { eu: boolean; de: string; quando: string; texto: string }[]; _sug?: string; _porque?: string; _empresa?: string; _quando?: string
}
type CaixaCfg = { id: string; endereco: string; assinatura: string; ativa: boolean }
type Rascunho = { de: string; para: string; cc: string; assunto: string; corpo: string; origem?: Msg; novo?: boolean }
const PASTAS = [['entrada', 'Entrada', 'inbox'], ['quentes', 'Quentes', 'fire'], ['rascunhos', 'Rascunhos', 'draft'], ['enviados', 'Enviados', 'send'], ['arquivados', 'Arquivados', 'arch'], ['spam', 'Spam', 'spam'], ['lixeira', 'Lixeira', 'trash']] as const
const ETIQUETAS = ['cotação', 'cliente', 'seguir depois']
const MODELOS: Record<string, [string, string]> = {
  t1: ['Carga fechada saindo de SP', 'Oi, tudo bem?\n\nSou o Pedro, da RBR Cargo. Atendemos indústria da região com caminhoneiros parceiros credenciados e homologados.\n\nSe fizer sentido, queria entrar na lista de cotação de vocês.'],
  cot: ['Dados para a cotação', 'Fechou!\n\nPara cotar certinho, me passa: origem, destino, tipo de carga e peso, veículo, valor da mercadoria e CNPJ.'],
  agr: ['Obrigado pelo retorno', 'Combinado, obrigado pelo retorno! Fico à disposição.'],
}
const chaveFio = (m: Msg) => m.empresa_id ?? m.assunto.replace(/^((re|enc|fwd):\s*)+/i, '').trim().toLowerCase()
const enderecoDe = (s: string) => (s.match(/[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/i)?.[0] ?? '').toLowerCase()
const nomeDe = (s: string) => s.replace(/<[^>]*>/g, '').replace(/"/g, '').trim() || s
const emPasta = (m: Msg, p: string) => (p === 'quentes' ? m.pasta === 'entrada' && m.etiquetas.includes('quente') : m.pasta === p)

function doExemplo(): Msg[] {
  return EXEMPLO_CAIXA.map((e) => ({
    id: e.id, caixa: e.pasta === 'enviados' ? 'pedro@rbrcargo.com.br' : 'pedro@rbrcargo.com.br', pasta: e.pasta, uid_imap: null, message_id: null, in_reply_to: null, references: null, de: `${e.de} <${e.email}>`, para: 'pedro@rbrcargo.com.br', cc: null,
    assunto: e.assunto, corpo_texto: e.fio[e.fio.length - 1].texto, recebido_em: new Date().toISOString(), lida: e.lida, estrela: e.estrela, etiquetas: [...(e.quente ? ['quente'] : []), ...e.etiquetas], anexos: e.anexo ? [{ nome: e.anexo }] : [],
    empresa_id: null, resposta_id: null, direcao: e.pasta === 'enviados' ? 'saida' : 'entrada', _fio: e.fio, _sug: e.sugestao, _porque: e.porque, _empresa: e.empresa, _quando: e.quando,
  }))
}

export default function AbaCaixa() {
  const { exemplos, flags, pessoaId, recarregar, tick } = useRadar()
  const [pasta, setPasta] = useState<string>('entrada')
  const [filtroCaixa, setFiltroCaixa] = useState('')
  const [filtroEtq, setFiltroEtq] = useState('')
  const [busca, setBusca] = useState('')
  const [fNaoLidas, setFNaoLidas] = useState(false)
  const [fEstrela, setFEstrela] = useState(false)
  const [fAnexo, setFAnexo] = useState(false)
  const [selId, setSelId] = useState<string | null>(null)
  const [lendo, setLendo] = useState(false)
  const [local, setLocal] = useState<Msg[]>([])
  const [resp, setResp] = useState<Rascunho | null>(null) // resposta dentro do painel de leitura
  const [janela, setJanela] = useState<Rascunho | null>(null) // janela "Escrever"
  const [dispensou, setDispensou] = useState<Set<string>>(new Set())
  const [menuEtq, setMenuEtq] = useState(false)
  const [versao, setVersao] = useState(0)

  const dados = useConsulta(() => db.from('prospeccao_caixa_mensagens').select('*').order('recebido_em', { ascending: false }).limit(600) as PromiseLike<{ data: Msg[] | null; error: { message: string } | null }>, [] as Msg[], [exemplos, tick, versao])
  const caixas = useConsulta(() => db.from('prospeccao_caixas').select('id, endereco, assinatura, ativa').order('papel') as PromiseLike<{ data: CaixaCfg[] | null; error: { message: string } | null }>, [] as CaixaCfg[], [exemplos])
  const sugestoes = useConsulta(() => db.from('prospeccao_respostas').select('id, rascunho_resposta, agente_motivo').not('rascunho_resposta', 'is', null).limit(500) as PromiseLike<{ data: { id: string; rascunho_resposta: string; agente_motivo: string | null }[] | null; error: { message: string } | null }>, [] as { id: string; rascunho_resposta: string; agente_motivo: string | null }[], [exemplos, tick])
  const empresas = useConsulta(() => db.from('prospeccao_empresas').select('id, razao_social, nome_fantasia, lead_id') as PromiseLike<{ data: { id: string; razao_social: string; nome_fantasia: string | null; lead_id: string | null }[] | null; error: { message: string } | null }>, [] as { id: string; razao_social: string; nome_fantasia: string | null; lead_id: string | null }[], [exemplos, tick])
  useEffect(() => { setLocal(exemplos ? doExemplo() : dados.dados) }, [exemplos, dados.dados])

  const msgs = local
  const caixasAtivas = caixas.dados.filter((c) => c.ativa)
  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return msgs.filter((m) => emPasta(m, pasta) && (!filtroCaixa || m.caixa === filtroCaixa) && (!filtroEtq || m.etiquetas.includes(filtroEtq)) && (!fNaoLidas || !m.lida) && (!fEstrela || m.estrela) && (!fAnexo || m.anexos.length > 0)
      && (!t || `${m.de} ${m.assunto} ${m.corpo_texto ?? ''}`.toLowerCase().includes(t)))
  }, [msgs, pasta, filtroCaixa, filtroEtq, busca, fNaoLidas, fEstrela, fAnexo])
  const atual = msgs.find((m) => m.id === selId && emPasta(m, pasta)) ?? (lendo ? null : null)
  const contagem = (p: string) => msgs.filter((m) => emPasta(m, p) && (['entrada', 'quentes', 'spam'].includes(p) ? !m.lida : p === 'rascunhos')).length
  const empresaDe = (m: Msg) => m._empresa ?? (m.empresa_id ? empresas.dados.find((e) => e.id === m.empresa_id)?.nome_fantasia ?? empresas.dados.find((e) => e.id === m.empresa_id)?.razao_social : undefined)
  const enviado = flags.PROSPECCAO_ENVIO_LIBERADO === 'sim'
  const testeLigado = flags.PROSPECCAO_MODO_TESTE !== 'nao'

  // fio: todas as mensagens da mesma empresa/assunto, em ordem
  const fio = useMemo(() => {
    if (!atual) return []
    if (atual._fio) return atual._fio
    const k = chaveFio(atual)
    return msgs.filter((m) => chaveFio(m) === k).sort((a, b) => a.recebido_em.localeCompare(b.recebido_em))
      .map((m) => ({ eu: m.direcao === 'saida', de: m.direcao === 'saida' ? 'Pedro · RBR Cargo' : nomeDe(m.de), quando: quando(m.recebido_em), texto: m.corpo_texto ?? '' }))
  }, [atual, msgs])
  const sug = atual ? (atual._sug ? { texto: atual._sug, porque: atual._porque ?? '' } : atual.resposta_id ? (() => { const s = sugestoes.dados.find((x) => x.id === atual.resposta_id); return s ? { texto: s.rascunho_resposta, porque: s.agente_motivo ?? '' } : null })() : null) : null

  async function mudar(m: Msg, patch: Partial<Msg>, acao?: { acao: string; destino?: string }) {
    setLocal((l) => l.map((x) => (x.id === m.id ? { ...x, ...patch } : x)))
    if (exemplos) return
    const { _fio, _sug, _porque, _empresa, _quando, ...limpo } = patch as Msg
    void _fio; void _sug; void _porque; void _empresa; void _quando
    const { error } = await db.from('prospeccao_caixa_mensagens').update(limpo).eq('id', m.id)
    if (error) { toast(mensagemDeErro(error.message)); setVersao((v) => v + 1); return }
    if (acao && m.uid_imap != null) await db.from('prospeccao_caixa_acoes').insert({ mensagem_id: m.id, acao: acao.acao, destino: acao.destino ?? null, criado_por: pessoaId })
    recarregar()
  }
  const abrir = (m: Msg) => { setSelId(m.id); setLendo(true); setResp(null); setMenuEtq(false); if (!m.lida) void mudar(m, { lida: true }, { acao: 'marcar_lida' }) }
  const voltar = () => { setLendo(false); setSelId(null) }

  function abrirResposta(m: Msg, modo: 'responder' | 'todos' | 'encaminhar', texto = '') {
    const re = (s: string) => (/^re:/i.test(s) ? s : `Re: ${s}`)
    const cc = modo === 'todos' ? [m.para, m.cc ?? ''].join(',').split(',').map(enderecoDe).filter((e) => e && !caixas.dados.some((c) => c.endereco === e)).join(', ') : ''
    setResp({
      de: m.caixa, para: modo === 'encaminhar' ? '' : enderecoDe(m.direcao === 'entrada' ? m.de : m.para), cc,
      assunto: modo === 'encaminhar' ? `Enc: ${m.assunto.replace(/^enc:\s*/i, '')}` : re(m.assunto),
      corpo: modo === 'encaminhar' ? `\n\n---- Mensagem encaminhada ----\nDe: ${m.de}\nAssunto: ${m.assunto}\n\n${m.corpo_texto ?? ''}` : texto, origem: m,
    })
  }

  async function enviar(r: Rascunho, fechar: () => void) {
    const para = r.para.split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean)
    if (!r.corpo.trim()) return toast('Escreva a mensagem antes de enviar.')
    if (!r.assunto.trim()) return toast('Informe o assunto.')
    const bl = await db.from('prospeccao_bloqueio').select('tipo, valor')
    const bloqueados = para.filter((e) => ((bl.data ?? []) as { tipo: string; valor: string }[]).some((b) => (b.tipo === 'email' && b.valor === e) || (b.tipo === 'dominio' && b.valor === e.split('@')[1])))
    const dt = await db.from('prospeccao_destinos_teste').select('email')
    const d = decidirEnvioManual({ envioLiberado: enviado, modoTeste: testeLigado, para, assunto: r.assunto, destinosTeste: ((dt.data ?? []) as { email: string }[]).map((x) => x.email), bloqueados })
    if (d.acao === 'recusar') return toast(d.motivo)
    const caixa = caixas.dados.find((c) => c.endereco === r.de)
    const base = { caixa: r.de, de: r.de, para: para.join(', '), cc: r.cc || null, assunto: r.assunto.trim(), corpo_texto: r.corpo, lida: true, direcao: 'saida' as const, empresa_id: r.origem?.empresa_id ?? null, in_reply_to: r.origem?.message_id ?? null, references: r.origem ? [r.origem.references, r.origem.message_id].filter(Boolean).join(' ') || null : null }
    if (exemplos) {
      setLocal((l) => [{ ...base, id: `x${Date.now()}`, pasta: d.acao === 'enviar' ? 'enviados' : 'rascunhos', uid_imap: null, message_id: null, recebido_em: new Date().toISOString(), estrela: false, etiquetas: [], anexos: [], resposta_id: null }, ...l])
      toast(d.acao === 'enviar' ? 'Exemplo: enviado' : 'Exemplo: salvo como rascunho'); return fechar()
    }
    if (d.acao === 'salvar_rascunho') {
      const { error } = await db.from('prospeccao_caixa_mensagens').insert({ ...base, pasta: 'rascunhos' })
      if (error) return toast(mensagemDeErro(error.message))
      toast(d.motivo); setVersao((v) => v + 1); return fechar()
    }
    if (!caixa) return toast('Escolha uma caixa de envio ativa.')
    // fila do robô: prospeccao_emails (saída aprovada). O robô aplica MODO_TESTE (só destinos de teste, com [TESTE]) e junta a assinatura da caixa.
    let conversaId: string | null = null
    if (r.origem?.empresa_id) {
      const { data } = await db.from('prospeccao_conversas').select('id').eq('empresa_id', r.origem.empresa_id).eq('caixa_id', caixa.id).order('ultima_mensagem_em', { ascending: false }).limit(1)
      conversaId = (data as { id: string }[] | null)?.[0]?.id ?? null
    }
    if (!conversaId) {
      const { data, error } = await db.from('prospeccao_conversas').insert({ empresa_id: r.origem?.empresa_id ?? null, caixa_id: caixa.id, assunto: r.assunto.trim(), status: 'assumida', assumida_por: pessoaId, assumida_em: new Date().toISOString() }).select('id').single()
      if (error) return toast(mensagemDeErro(error.message))
      conversaId = (data as { id: string }).id
    }
    const { error: e1 } = await db.from('prospeccao_emails').insert({ conversa_id: conversaId, caixa_id: caixa.id, direcao: 'saida', de: caixa.endereco, para: para.join(', '), cc: r.cc || null, assunto: r.assunto.trim(), corpo_texto: r.corpo, in_reply_to: base.in_reply_to, referencias: base.references, status_envio: 'aprovado', aprovado_por: pessoaId, aprovado_em: new Date().toISOString(), lido: true })
    if (e1) return toast(mensagemDeErro(e1.message))
    await db.from('prospeccao_caixa_mensagens').insert({ ...base, pasta: 'enviados', etiquetas: ['na fila do robô'] })
    try { await auditar('prospeccao_envio_manual', { caixa: caixa.endereco, teste: d.teste, empresa_id: base.empresa_id }) } catch { /* melhor esforço */ }
    toast(d.teste ? 'Na fila: vai só para os destinos de teste, com [TESTE] no assunto' : 'Na fila: o robô envia na próxima rodada'); setVersao((v) => v + 1); fechar()
  }

  async function baixar(a: Anexo) {
    if (!a.caminho) return toast('Este anexo não foi guardado: o robô de leitura ainda só registra nome e tamanho.')
    const { data, error } = await db.storage.from('prospeccao-anexos').createSignedUrl(a.caminho, 120)
    if (error || !data) return toast(mensagemDeErro(error?.message ?? 'Não consegui gerar o link.'))
    window.open(data.signedUrl, '_blank', 'noopener')
  }
  async function assumir(m: Msg) {
    if (exemplos || !m.resposta_id) return toast(exemplos ? 'Exemplo: você assumiu a conversa' : 'Esta mensagem não está ligada a uma resposta registrada.')
    const { error } = await db.from('prospeccao_respostas').update({ assumido_por: pessoaId, assumido_em: new Date().toISOString() }).eq('id', m.resposta_id).is('assumido_por', null)
    toast(error ? mensagemDeErro(error.message) : 'Você assumiu a conversa')
  }
  async function converter(m: Msg) {
    if (exemplos) return toast('Exemplo: virou lead no CRM')
    const e = empresas.dados.find((x) => x.id === m.empresa_id)
    if (!e) return toast('Esta mensagem não está ligada a uma empresa.')
    if (e.lead_id) return toast('Esta empresa já é lead.')
    const full = await db.from('prospeccao_empresas').select('razao_social, nome_fantasia, cnpj, telefone, cidade, uf').eq('id', e.id).single()
    const emp = full.data as { razao_social: string; nome_fantasia: string | null; cnpj: string; telefone: string | null; cidade: string | null; uf: string | null }
    const { data, error } = await db.from('leads').insert({ nome: emp.nome_fantasia || emp.razao_social, empresa: emp.razao_social, cnpj: emp.cnpj, tipo_pessoa: 'PJ', whatsapp: emp.telefone, email: enderecoDe(m.de), origem_cidade: emp.cidade, origem_uf: emp.uf, mensagem: (m.corpo_texto ?? '').slice(0, 1000), origem: 'prospeccao', responsavel_id: pessoaId }).select('id').single()
    if (error) return toast(mensagemDeErro(error.message))
    await db.from('prospeccao_empresas').update({ lead_id: (data as { id: string }).id }).eq('id', e.id)
    try { await auditar('prospeccao_convertido_em_lead', { empresa_id: e.id, lead_id: (data as { id: string }).id }) } catch { /* melhor esforço */ }
    toast('Virou lead na Fila do dia'); setVersao((v) => v + 1)
  }

  const rotuloEnviar = enviado ? 'Enviar' : 'Envio desligado nos Ajustes'
  const compositor = (r: Rascunho, set: (r: Rascunho) => void, fechar: () => void, modal = false) => {
    const caixa = caixas.dados.find((c) => c.endereco === r.de)
    return (
      <div className="comp" id={modal ? undefined : 'rComp'}>
        <div className="f"><span>De</span><select className="inp" style={{ border: 0, padding: '6px 0' }} value={r.de} onChange={(e) => set({ ...r, de: e.target.value })}>{(caixasAtivas.length ? caixasAtivas : [{ endereco: r.de || 'pedro@rbrcargo.com.br' } as CaixaCfg]).map((c) => <option key={c.endereco}>{c.endereco}</option>)}</select><span /></div>
        <div className="f"><span>Para</span><input value={r.para} placeholder="nome@empresa.com.br" onChange={(e) => set({ ...r, para: e.target.value })} /><span /></div>
        <div className="f"><span>Cc</span><input value={r.cc} placeholder="cópia (opcional)" onChange={(e) => set({ ...r, cc: e.target.value })} /><span /></div>
        <div className="f"><span>Assunto</span><input value={r.assunto} onChange={(e) => set({ ...r, assunto: e.target.value })} /><span /></div>
        <textarea value={r.corpo} placeholder="Escreva aqui (texto puro)" onChange={(e) => set({ ...r, corpo: e.target.value })} />
        <div className="sig" style={{ whiteSpace: 'pre-wrap' }}>{`--\n${caixa?.assinatura ?? 'Pedro | RBR Cargo'}\n${r.de}\nwww.rbrcargo.com.br`}</div>
        <div className="ft">
          <button className="btn pri" title={enviado ? '' : 'Salva como rascunho enquanto o envio estiver desligado'} onClick={() => void enviar(r, fechar)}><Ic n="send" />{rotuloEnviar}</button>
          <button className="btn" disabled title="Agendar envio ainda não existe: o robô envia na próxima rodada">Agendar</button>
          <button className="btn ghost icon" disabled title="Anexos nas respostas ainda não saem pelo robô" aria-label="Anexar"><Ic n="clip" /></button>
          {modal && <select className="inp" style={{ width: 'auto' }} value="" onChange={(e) => { const t = MODELOS[e.target.value]; if (t) set({ ...r, assunto: t[0], corpo: t[1] }) }}><option value="">Usar modelo…</option><option value="t1">Toque 1</option><option value="cot">Pedido de dados para cotação</option><option value="agr">Agradecimento</option></select>}
          <span className="sp" />
          {modal && <button className="btn ghost sm" title="Texto do modelo de toque 1 (o agente de IA ainda está desligado)" onClick={() => set({ ...r, assunto: r.assunto || MODELOS.t1[0], corpo: MODELOS.t1[1] })}>✦ Rascunho do agente</button>}
          <button className="btn ghost sm" onClick={() => { fechar(); toast('Descartado') }}>Descartar</button>
        </div>
      </div>
    )
  }

  return (
    <>
      <Acoes><button className="btn pri" onClick={() => setJanela({ de: caixasAtivas[0]?.endereco ?? 'pedro@rbrcargo.com.br', para: '', cc: '', assunto: '', corpo: '', novo: true })}><Ic n="draft" />Escrever</button></Acoes>
      {exemplos && <FaixaExemplo />}
      <AvisoErro erro={exemplos ? null : dados.erro} />
      <div className={`card mx${lendo ? ' reading' : ''}`}>
        <div className="fold">
          <button className="btn pri" onClick={() => setJanela({ de: caixasAtivas[0]?.endereco ?? 'pedro@rbrcargo.com.br', para: '', cc: '', assunto: '', corpo: '', novo: true })}><Ic n="draft" />Escrever</button>
          {PASTAS.map(([id, nome, ic]) => { const n = contagem(id); return <a key={id} className={pasta === id ? 'on' : ''} onClick={() => { setPasta(id); setSelId(null); setLendo(false) }}><Ic n={ic} />{nome}{n > 0 && <span className="n">{n}</span>}</a> })}
          <div className="lab acc">Caixas</div>
          {['pedro@rbrcargo.com.br', 'comercial@rbrcargo.com.br'].map((c) => <a key={c} className={`acc${filtroCaixa === c ? ' on' : ''}`} onClick={() => setFiltroCaixa((x) => (x === c ? '' : c))}><Ic n="mail" />{c.split('@')[0]}@</a>)}
          <div className="lab acc">Etiquetas</div>
          {ETIQUETAS.map((t) => <a key={t} className={`acc${filtroEtq === t ? ' on' : ''}`} onClick={() => setFiltroEtq((x) => (x === t ? '' : t))}><Ic n="tag" />{t}</a>)}
        </div>
        <div className="mlist">
          <div className="head">
            <div className="search"><Ic n="buscar" /><input value={busca} placeholder="Buscar e-mails" onChange={(e) => setBusca(e.target.value)} /></div>
            <div className="row"><button className="tog" aria-pressed={fNaoLidas} onClick={() => setFNaoLidas((x) => !x)}>Não lidas</button><button className="tog" aria-pressed={fEstrela} onClick={() => setFEstrela((x) => !x)}>Com estrela</button><button className="tog" aria-pressed={fAnexo} onClick={() => setFAnexo((x) => !x)}>Com anexo</button></div>
          </div>
          <div className="items">
            {lista.length === 0 ? <div className="empty">{msgs.length === 0 && !exemplos ? 'A caixa ainda está vazia. Quando o robô de leitura estiver ligado, as respostas aparecem aqui.' : 'Nada nesta pasta.'}</div> : lista.map((m) => (
              <div key={m.id} className={`mi${!m.lida ? ' unread' : ''}${m.id === atual?.id ? ' on' : ''}`} onClick={() => abrir(m)}>
                <button className={`st${m.estrela ? ' on' : ''}`} aria-label="Estrela" onClick={(e) => { e.stopPropagation(); void mudar(m, { estrela: !m.estrela }, { acao: 'estrela' }) }}><Ic n="star" /></button>
                <span className="fr">{nomeDe(m.direcao === 'saida' ? `Para: ${m.para}` : m.de)}{empresaDe(m) ? ` · ${empresaDe(m)}` : ''}</span><time>{m._quando ?? quando(m.recebido_em)}</time>
                <span className="su">{m.assunto}</span>
                {(m.etiquetas.length > 0 || m.anexos.length > 0) && <span className="tg">{m.etiquetas.includes('quente') && <span className="chip gold">quente</span>}{m.etiquetas.filter((x) => x !== 'quente' && x !== 'cotacao').map((x) => <span key={x} className="chip">{x.replace(/_/g, ' ')}</span>)}{m.anexos.length > 0 && <span className="chip ice"><Ic n="clip" />anexo</span>}</span>}
              </div>
            ))}
          </div>
        </div>
        <div className="read">
          {!atual ? <div className="empty" style={{ margin: 'auto' }}>Selecione um e-mail.</div> : (
            <>
              <div className="tb">
                <button className="btn ghost icon mback" aria-label="Voltar" onClick={voltar}><Ic n="back" /></button>
                <button className="btn ghost sm" onClick={() => abrirResposta(atual, 'responder')}><Ic n="reply" />Responder</button>
                <button className="btn ghost icon" aria-label="Responder a todos" title="Responder a todos" onClick={() => abrirResposta(atual, 'todos')}><Ic n="replyall" /></button>
                <button className="btn ghost icon" aria-label="Encaminhar" title="Encaminhar" onClick={() => abrirResposta(atual, 'encaminhar')}><Ic n="fwd" /></button>
                <span className="sp" />
                <button className="btn ghost icon" aria-label="Arquivar" title="Arquivar" onClick={() => { void mudar(atual, { pasta: 'arquivados' }, { acao: 'mover', destino: 'arquivados' }); toast('Arquivado'); voltar() }}><Ic n="arch" /></button>
                <button className="btn ghost icon" aria-label="Marcar como não lida" title="Marcar como não lida" onClick={() => { void mudar(atual, { lida: false }, { acao: 'marcar_nao_lida' }); toast('Marcado como não lido') }}><Ic n="mail" /></button>
                <span style={{ position: 'relative' }}>
                  <button className="btn ghost icon" aria-label="Etiqueta" title="Etiqueta" onClick={() => setMenuEtq((x) => !x)}><Ic n="tag" /></button>
                  {menuEtq && <div className="card" style={{ position: 'absolute', right: 0, top: 38, zIndex: 5, padding: 6, minWidth: 150 }}>{ETIQUETAS.map((t) => <button key={t} className="btn ghost sm" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => { void mudar(atual, { etiquetas: atual.etiquetas.includes(t) ? atual.etiquetas.filter((x) => x !== t) : [...atual.etiquetas, t] }); setMenuEtq(false) }}>{atual.etiquetas.includes(t) ? '✓ ' : ''}{t}</button>)}</div>}
                </span>
                <button className="btn ghost icon" aria-label="Excluir" title="Excluir" onClick={() => { void mudar(atual, { pasta: 'lixeira' }, { acao: 'excluir' }); toast('Movido para a lixeira'); voltar() }}><Ic n="trash" /></button>
              </div>
              <div className="sc">
                <div><h2>{atual.assunto}</h2><div className="row" style={{ marginTop: 8 }}>{atual.etiquetas.includes('quente') && <span className="chip gold">lead quente</span>}{atual.etiquetas.filter((x) => x !== 'quente').map((x) => <span key={x} className="chip">{x.replace(/_/g, ' ')}</span>)}{empresaDe(atual) && <span className="sm muted">{empresaDe(atual)}</span>}</div></div>
                {atual.etiquetas.includes('quente') && (
                  <div className="note" style={{ background: 'var(--goldbg)' }}><Ic n="fire" /><div><b>Lead quente.</b> Pedro e José Carlos são avisados. Quem assumir primeiro fica com a conversa. <button className="btn sm gold" style={{ marginLeft: 6 }} onClick={() => void assumir(atual)}>Assumir</button> <button className="btn sm" onClick={() => void converter(atual)}>Converter em lead</button></div></div>
                )}
                {fio.map((x, i) => (
                  <div key={i} className={`msg${x.eu ? ' mine' : ''}`}><div className="mh"><div><b>{x.de}</b>{!x.eu && <span> &lt;{enderecoDe(atual.de)}&gt;</span>}</div><time>{x.quando}</time></div><div className="bd">{x.texto}</div></div>
                ))}
                {atual.anexos.map((a, i) => <div key={i} className="att"><Ic n="clip" />{a.nome}{a.tamanho ? ` · ${Math.max(1, Math.round(a.tamanho / 1024))} KB` : ''}<button className="btn ghost sm" onClick={() => void baixar(a)}>Baixar</button></div>)}
                {sug && !dispensou.has(atual.id) && !resp && (
                  <div className="sugg"><div className="hd"><div className="ai sm"><i /><b /></div><div style={{ flex: 1 }}><b>Sugestão do agente</b><div className="xs muted">{sug.porque}</div></div></div><pre>{sug.texto}</pre>
                    <div className="row"><button className="btn pri sm" onClick={() => abrirResposta(atual, 'responder', sug.texto)}>Usar e editar</button><button className="btn sm" disabled title="A reescrita pela IA será ligada junto com o agente de IA">Outra versão</button><button className="btn ghost sm" onClick={() => setDispensou((s) => new Set(s).add(atual.id))}>Dispensar</button></div></div>
                )}
                {resp && compositor(resp, setResp, () => setResp(null))}
              </div>
            </>
          )}
        </div>
      </div>
      {janela && (
        <div className="rdr-modal-fundo" onClick={(e) => { if (e.target === e.currentTarget) setJanela(null) }}>
          <div className="rdr-modal"><div className="mt"><span>Novo e-mail</span><button className="btn ghost icon" aria-label="Fechar" onClick={() => setJanela(null)}><Ic n="x" /></button></div>{compositor(janela, setJanela, () => setJanela(null), true)}</div>
        </div>
      )}
    </>
  )
}
