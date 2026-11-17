import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@rbr/shared/supabaseClient'
import { Modal } from '../financeiro/ui'
import { useConfirmacao } from '../Confirmacao'
import { auditar, db, type Mensagem } from '../../lib/prospeccaoDb'
import {
  acaoDoAtalho, assuntoEncaminhar, assuntoResposta, citacao, destinatariosResposta, enderecoLimpo, exemplos, filtrarConversas, FILTROS, horaCurta, referenciasDaResposta,
  ROTULO_CLASSE, sanitizarHtml, textoParaHtml, trecho, type Caixa, type Conversa, type EmailRow, type FiltroConversa,
} from '../../lib/prospeccaoCaixa'
import './prospeccaoUi.css'

type EmpresaMini = { id: string; razao_social: string; nome_fantasia: string | null; cidade: string | null; uf: string | null; classe: string; pontuacao: number; status: string; telefone: string | null; lead_id: string | null; cnpj: string }
type Painel = 'lista' | 'leitura' | 'empresa'
type Composer = { id: string | null; modo: 'responder' | 'todos' | 'encaminhar'; caixaId: string; para: string; cc: string; assunto: string; corpo: string; emResposta: EmailRow | null; salvoEm: string | null }

const nomeEmpresa = (e?: EmpresaMini | null) => (e ? e.nome_fantasia || e.razao_social : 'Sem empresa')
const LS_DESCARTADOS = 'prospeccao_rascunhos_ia_descartados'
const lerDescartados = (): string[] => { try { return JSON.parse(localStorage.getItem(LS_DESCARTADOS) ?? '[]') as string[] } catch { return [] } }

/** Caixa de entrada da prospeccao: le e responde por aqui. A tela nunca envia sozinha: "Enviar" so APROVA; quem envia e o robo, com todas as travas. */
export default function CaixaEntrada() {
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [caixas, setCaixas] = useState<Caixa[]>([])
  const [reais, setReais] = useState<Conversa[]>([])
  const [empresas, setEmpresas] = useState<Record<string, EmpresaMini>>({})
  const [segredos, setSegredos] = useState<Record<string, boolean>>({})
  const [envioLigado, setEnvioLigado] = useState(false)
  const [modoTeste, setModoTeste] = useState(true)
  const [filtro, setFiltro] = useState<FiltroConversa>('precisa_de_voce')
  const [busca, setBusca] = useState('')
  const [selId, setSelId] = useState<string | null>(null)
  const [painel, setPainel] = useState<Painel>('lista')
  const [emailsReais, setEmailsReais] = useState<EmailRow[]>([])
  const [toques, setToques] = useState<Mensagem[]>([])
  const [lote, setLote] = useState<Set<string>>(new Set())
  const [composer, setComposer] = useState<Composer | null>(null)
  const [descartados, setDescartados] = useState<string[]>(lerDescartados)
  const [pedeDescadastro, setPedeDescadastro] = useState(false)
  const [textoConfirma, setTextoConfirma] = useState('')
  const { confirmacao, rodar, ocupado } = useConfirmacao()
  const ex = useMemo(() => exemplos(), [])

  const carregar = useCallback(async () => {
    try {
      const [cx, cv, sg, fl] = await Promise.all([
        db.from('prospeccao_caixas').select('*').order('papel'),
        db.from('prospeccao_conversas').select('*').order('ultima_mensagem_em', { ascending: false }).limit(300),
        db.rpc('prospeccao_segredos_status'),
        db.from('parametros_sistema').select('chave, valor').in('chave', ['PROSPECCAO_ENVIO_LIBERADO', 'PROSPECCAO_MODO_TESTE']),
      ])
      if (cv.error) throw new Error(cv.error.message)
      const conv = (cv.data ?? []) as Conversa[]
      setCaixas((cx.data ?? []) as Caixa[])
      setReais(conv)
      setSegredos(Object.fromEntries(((sg.data ?? []) as { nome: string; cadastrado: boolean }[]).map((x) => [x.nome, x.cadastrado])))
      const f = Object.fromEntries(((fl.data ?? []) as { chave: string; valor: unknown }[]).map((x) => [x.chave, String(x.valor)]))
      setEnvioLigado(f.PROSPECCAO_ENVIO_LIBERADO === 'sim'); setModoTeste(f.PROSPECCAO_MODO_TESTE !== 'nao')
      const ids = [...new Set(conv.map((c) => c.empresa_id).filter(Boolean))] as string[]
      if (ids.length) {
        const { data } = await db.from('prospeccao_empresas').select('id, razao_social, nome_fantasia, cidade, uf, classe, pontuacao, status, telefone, lead_id, cnpj').in('id', ids)
        setEmpresas(Object.fromEntries(((data ?? []) as EmpresaMini[]).map((e) => [e.id, e])))
      }
      setErro(null)
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)) } finally { setCarregando(false) }
  }, [])
  useEffect(() => { void carregar(); const t = setInterval(() => { if (!document.hidden) void carregar() }, 60_000); return () => clearInterval(t) }, [carregar])

  const modoExemplo = !carregando && !erro && reais.length === 0
  const conversas = modoExemplo ? ex.conversas : reais
  const lista = useMemo(() => filtrarConversas(conversas, filtro, busca, (c) => nomeEmpresa(c.empresa_id ? empresas[c.empresa_id] : null)), [conversas, filtro, busca, empresas])
  const sel = conversas.find((c) => c.id === selId) ?? null
  const emails = modoExemplo ? ex.emails.filter((e) => e.conversa_id === selId) : emailsReais
  const empresa = sel?.empresa_id ? empresas[sel.empresa_id] ?? null : null
  const caixaDe = (id: string) => caixas.find((c) => c.id === id)
  const ultimaEntrada = [...emails].reverse().find((e) => e.direcao === 'entrada') ?? null
  const rascunhoIa = ultimaEntrada?.rascunho_ia && !descartados.includes(ultimaEntrada.id) ? ultimaEntrada : null
  const iaLigada = segredos['PROSPECCAO_IA_CHAVE'] === true
  const semSenha = caixas.filter((c) => c.ativa && !(segredos[c.segredo_senha] === true || (c.endereco === 'pedro@rbrcargo.com.br' && segredos['PROSPECCAO_EMAIL_SENHA'] === true)))
  const contagem = (f: FiltroConversa) => filtrarConversas(conversas, f, '').length

  const abrir = useCallback(async (c: Conversa) => {
    setSelId(c.id); setPainel('leitura'); setComposer(null)
    if (c.exemplo) return
    const { data } = await db.from('prospeccao_emails').select('*').eq('conversa_id', c.id).order('recebido_em')
    setEmailsReais((data ?? []) as EmailRow[])
    if (c.nao_lidas > 0) { await db.from('prospeccao_emails').update({ lido: true }).eq('conversa_id', c.id).eq('direcao', 'entrada').eq('lido', false); void carregar() }
    if (c.empresa_id) { const { data: t } = await db.from('prospeccao_mensagens').select('*').eq('empresa_id', c.empresa_id).order('toque'); setToques((t ?? []) as Mensagem[]) } else setToques([])
  }, [carregar])

  async function minhaPessoa(): Promise<string> {
    const { data: u } = await supabase.auth.getUser()
    const { data } = await db.from('pessoas').select('id').eq('auth_user_id', u.user?.id ?? '').maybeSingle()
    if (!data) throw new Error('Não identifiquei seu usuário.')
    return (data as { id: string }).id
  }
  const bloqueadoExemplo = () => { if (modoExemplo) throw new Error('Isto é só um exemplo: nada é gravado.') }
  const atualizarConversa = async (id: string, patch: Record<string, unknown>) => {
    bloqueadoExemplo()
    const { error } = await db.from('prospeccao_conversas').update({ ...patch, atualizado_em: new Date().toISOString() }).eq('id', id)
    if (error) throw new Error(error.message)
    await carregar()
  }
  const assumir = (c: Conversa) => rodar('Você assumiu esta conversa: a IA não responde mais nela.', async () => atualizarConversa(c.id, { status: 'assumida', assumida_por: await minhaPessoa(), assumida_em: new Date().toISOString(), ia_pausada: true }))
  const devolver = (c: Conversa) => rodar('Devolvida para a IA.', () => atualizarConversa(c.id, { status: 'nova', assumida_por: null, assumida_em: null, ia_pausada: false }))
  const encerrar = (c: Conversa) => rodar('Conversa encerrada.', () => atualizarConversa(c.id, { status: 'encerrada', encerrada_em: new Date().toISOString() }))
  const emLote = (texto: string, patch: Record<string, unknown>, soEntradas = false) => rodar(texto, async () => {
    bloqueadoExemplo()
    const ids = [...lote]
    if (soEntradas) await db.from('prospeccao_emails').update({ lido: true }).in('conversa_id', ids).eq('direcao', 'entrada').eq('lido', false)
    else { const { error } = await db.from('prospeccao_conversas').update({ ...patch, atualizado_em: new Date().toISOString() }).in('id', ids); if (error) throw new Error(error.message) }
    setLote(new Set()); await carregar()
  })
  const descadastrar = (c: Conversa) => rodar('Empresa descadastrada: nunca mais recebe e-mail.', async () => {
    bloqueadoExemplo()
    if (!c.empresa_id || !ultimaEntrada) throw new Error('Sem empresa ou e-mail recebido para descadastrar.')
    const quem = enderecoLimpo(ultimaEntrada.de)
    if (!quem) throw new Error('Não achei o e-mail do remetente.')
    const { error } = await db.from('prospeccao_bloqueio').insert({ tipo: 'email', valor: quem, motivo: 'manual' })
    if (error && error.code !== '23505') throw new Error(error.message)
    await db.from('prospeccao_empresas').update({ status: 'descadastrado' }).eq('id', c.empresa_id)
    await db.from('prospeccao_mensagens').update({ status: 'descartado', erro: 'descadastro manual' }).eq('empresa_id', c.empresa_id).in('status', ['rascunho', 'aprovado'])
    await atualizarConversa(c.id, { status: 'encerrada', encerrada_em: new Date().toISOString() })
    await auditar('prospeccao_descadastro_manual', { empresa_id: c.empresa_id })
    setPedeDescadastro(false); setTextoConfirma('')
  })
  const criarLead = (c: Conversa) => rodar('Lead criado na Fila do dia.', async () => {
    bloqueadoExemplo()
    if (!empresa || !ultimaEntrada) throw new Error('Precisa de empresa e de um e-mail recebido.')
    if (empresa.lead_id) throw new Error('Esta empresa já virou lead.')
    const pessoa = await minhaPessoa()
    const { data: lead, error } = await db.from('leads').insert({ nome: nomeEmpresa(empresa), empresa: empresa.razao_social, cnpj: empresa.cnpj, tipo_pessoa: 'PJ', whatsapp: empresa.telefone, email: enderecoLimpo(ultimaEntrada.de), origem_cidade: empresa.cidade, origem_uf: empresa.uf, mensagem: (ultimaEntrada.corpo_texto ?? '').slice(0, 1000), origem: 'prospeccao', responsavel_id: pessoa }).select('id').single()
    if (error) throw new Error(error.message)
    const leadId = (lead as { id: string }).id
    await db.from('interacoes').insert({ lead_id: leadId, tipo: 'email', direcao: 'entrada', ocorreu_em: ultimaEntrada.recebido_em, conteudo: `Resposta à prospecção ativa: ${(ultimaEntrada.corpo_texto ?? '').slice(0, 2000)}`, autor_id: pessoa })
    await db.from('prospeccao_empresas').update({ lead_id: leadId }).eq('id', empresa.id)
    await auditar('prospeccao_convertido_em_lead', { empresa_id: empresa.id, lead_id: leadId, conversa_id: c.id })
    await carregar()
  })

  // ---- composer -------------------------------------------------------------------------------------------
  const nossos = caixas.map((c) => c.endereco)
  function abrirComposer(modo: Composer['modo'], base?: EmailRow | null, texto?: string) {
    if (!sel) return
    const alvo = base ?? ultimaEntrada ?? emails[emails.length - 1] ?? null
    const caixaId = (alvo && caixas.find((c) => c.id === alvo.caixa_id && c.ativa)?.id) ?? caixas.find((c) => c.ativa)?.id ?? ''
    const dest = alvo ? destinatariosResposta(alvo, modo === 'todos', nossos) : { para: [], cc: [] }
    setComposer({
      id: null, modo, caixaId, para: modo === 'encaminhar' ? '' : dest.para.join(', '), cc: dest.cc.join(', '),
      assunto: modo === 'encaminhar' ? assuntoEncaminhar(alvo?.assunto ?? sel.assunto) : assuntoResposta(alvo?.assunto ?? sel.assunto),
      corpo: texto ?? (alvo ? citacao(alvo) : ''), emResposta: alvo, salvoEm: null,
    })
    setPainel('leitura')
  }
  // rascunho salvo sozinho (1,5 s depois de parar de digitar); nunca no modo exemplo
  const salvarRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const composerRef = useRef<Composer | null>(null)
  composerRef.current = composer
  async function gravarRascunho(c: Composer, status: 'rascunho' | 'aprovado' = 'rascunho'): Promise<string> {
    if (!sel) throw new Error('Sem conversa.')
    const campos = { caixa_id: c.caixaId, para: c.para, cc: c.cc || null, assunto: c.assunto, corpo_texto: c.corpo, status_envio: status }
    if (c.id) {
      const { error } = await db.from('prospeccao_emails').update(campos).eq('id', c.id)
      if (error) throw new Error(error.message)
      return c.id
    }
    const { data, error } = await db.from('prospeccao_emails').insert({
      conversa_id: sel.id, direcao: 'saida', in_reply_to: c.emResposta?.message_id ?? null, referencias: c.emResposta ? referenciasDaResposta(c.emResposta) : null,
      de: caixaDe(c.caixaId)?.endereco ?? '', recebido_em: new Date().toISOString(), ...campos,
    }).select('id').single()
    if (error) throw new Error(error.message)
    return (data as { id: string }).id
  }
  function editar(patch: Partial<Composer>) {
    setComposer((c) => (c ? { ...c, ...patch } : c))
    if (modoExemplo) return
    if (salvarRef.current) clearTimeout(salvarRef.current)
    salvarRef.current = setTimeout(async () => {
      const atual = composerRef.current
      if (!atual || !atual.para.trim() || !atual.corpo.trim()) return
      try { const id = await gravarRascunho(atual); setComposer((c) => (c ? { ...c, id, salvoEm: new Date().toISOString() } : c)) } catch { /* tenta na proxima edicao */ }
    }, 1500)
  }
  const enviar = () => rodar('Aprovado. O robô envia na próxima rodada (até 5 minutos), respeitando chave de envio, modo de teste, bloqueio e ritmo da caixa.', async () => {
    bloqueadoExemplo()
    if (!composer) return
    if (!composer.para.trim()) throw new Error('Informe o destinatário.')
    if (!composer.corpo.trim()) throw new Error('Escreva a mensagem.')
    if (!composer.caixaId) throw new Error('Nenhuma caixa ativa para enviar.')
    await gravarRascunho(composer, 'aprovado')
    setComposer(null)
    if (sel) await db.from('prospeccao_conversas').update({ status: 'aguardando_cliente', atualizado_em: new Date().toISOString() }).eq('id', sel.id)
    await abrir(sel!); await carregar()
  })
  const descartarRascunho = () => rodar('Rascunho descartado.', async () => {
    if (composer?.id) { const { error } = await db.from('prospeccao_emails').update({ status_envio: 'descartado' }).eq('id', composer.id); if (error) throw new Error(error.message) }
    setComposer(null)
  })

  // ---- atalhos ---------------------------------------------------------------------------------------------
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null
      const campo = !!alvo && (['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName) || alvo.isContentEditable)
      const acao = acaoDoAtalho(e.key, e.ctrlKey || e.metaKey || e.altKey, campo || composer !== null || pedeDescadastro)
      if (!acao) return
      const i = lista.findIndex((c) => c.id === selId)
      if (acao === 'proxima' && lista.length) { e.preventDefault(); void abrir(lista[Math.min(lista.length - 1, i + 1)]) }
      else if (acao === 'anterior' && lista.length) { e.preventDefault(); void abrir(lista[Math.max(0, i - 1)]) }
      else if (acao === 'responder' && sel) { e.preventDefault(); abrirComposer('responder') }
      else if (acao === 'encerrar' && sel && !sel.exemplo) { e.preventDefault(); void encerrar(sel) }
      else if (acao === 'assumir' && sel && !sel.exemplo) { e.preventDefault(); void assumir(sel) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })

  function aoClicarCorpo(e: React.MouseEvent) {
    const a = (e.target as HTMLElement).closest('a[data-externo]') as HTMLAnchorElement | null
    if (!a) return
    e.preventDefault()
    const href = a.getAttribute('href') ?? ''
    if (window.confirm(`Você vai abrir um link de fora do sistema:\n\n${href}\n\nSó continue se confiar no remetente.`)) window.open(href, '_blank', 'noopener,noreferrer')
  }

  // ---- tela --------------------------------------------------------------------------------------------------
  if (carregando) return <div className="pr"><div className="pr-card pr-card-p flex flex-col gap-3">{[80, 60, 70].map((w) => <div key={w} className="pr-esq" style={{ width: `${w}%` }} />)}</div></div>
  if (erro) return <div className="pr"><div className="pr-card pr-card-p flex flex-col gap-2"><div className="pr-aviso bad">Não consegui abrir a Caixa de entrada: {erro}</div><div><button className="pr-btn" onClick={() => { setCarregando(true); void carregar() }}>Tentar de novo</button></div></div></div>

  return (
    <div className="pr flex flex-col gap-3">
      {confirmacao}
      {modoExemplo && <div className="pr-aviso info flex items-center gap-2"><span className="pr-exemplo">EXEMPLO</span> Nenhum e-mail real chegou ainda. O que você vê é só para mostrar como fica; nada é gravado e tudo some quando chegar o primeiro e-mail de verdade.</div>}
      {!iaLigada && <div className="pr-aviso">IA desligada: falta a chave. A Caixa de entrada funciona normalmente, mas sem classificação nem rascunhos automáticos. Cadastre a chave em Saúde do envio.</div>}
      {semSenha.length > 0 && <div className="pr-aviso">Caixa sem credencial: {semSenha.map((c) => c.endereco).join(', ')}. A leitura e o envio dessas caixas ficam parados até cadastrar a senha (Saúde do envio, “Caixas”).</div>}
      {!envioLigado && <div className="pr-aviso info">Envio geral desligado{modoTeste ? ' (modo de teste ligado)' : ''}: respostas aprovadas ficam na fila e só saem quando o envio for ligado.</div>}

      <div className="pr-grid-3">
        {/* coluna 1: lista */}
        <div className={`pr-col ${painel === 'lista' ? 'ativa' : ''}`}>
          <div className="pr-card">
            <div className="p-3 flex flex-col gap-2.5">
              <input className="pr-input" placeholder="Buscar empresa, assunto ou tipo…" aria-label="Buscar conversas" value={busca} onChange={(e) => setBusca(e.target.value)} />
              <div className="pr-chips">
                {FILTROS.map((f) => (
                  <button key={f.valor} className={`pr-chip ${filtro === f.valor ? 'ativo' : ''}`} onClick={() => setFiltro(f.valor)}>
                    {f.label}{contagem(f.valor) > 0 && <span className="ml-1 opacity-70 pr-num">{contagem(f.valor)}</span>}
                  </button>
                ))}
              </div>
              {lote.size > 0 && (
                <div className="flex gap-2 items-center flex-wrap pr-aviso info">
                  <b>{lote.size} selecionada(s)</b>
                  <button className="pr-btn" disabled={ocupado || modoExemplo} onClick={() => void emLote('Marcadas como lidas.', {}, true)}>Marcar lido</button>
                  <button className="pr-btn" disabled={ocupado || modoExemplo} onClick={() => void emLote('Conversas encerradas.', { status: 'encerrada', encerrada_em: new Date().toISOString() })}>Encerrar</button>
                  <button className="pr-btn" onClick={() => setLote(new Set())}>Limpar</button>
                </div>
              )}
            </div>
            <div className="pr-scroll" role="listbox" aria-label="Conversas">
              {lista.length === 0 ? (
                <div className="p-8 text-center text-sm pr-muted">{busca ? 'Nenhuma conversa encontrada para essa busca.' : 'Nada neste filtro. Quando uma empresa responder, a conversa aparece aqui.'}</div>
              ) : lista.map((c) => {
                const emp = c.empresa_id ? empresas[c.empresa_id] : null
                const cl = c.classificacao_ia ? ROTULO_CLASSE[c.classificacao_ia] : null
                return (
                  <div key={c.id} role="option" aria-selected={c.id === selId} tabIndex={0} className={`pr-item ${c.id === selId ? 'sel' : ''} ${c.nao_lidas > 0 ? 'nao-lida' : ''}`}
                    onClick={() => void abrir(c)} onKeyDown={(e) => { if (e.key === 'Enter') void abrir(c) }}>
                    <input type="checkbox" aria-label="Selecionar conversa" checked={lote.has(c.id)} disabled={modoExemplo} onClick={(e) => e.stopPropagation()}
                      onChange={() => setLote((s) => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n })} />
                    <div className="min-w-0 flex-1">
                      <div className="flex gap-2 items-baseline"><div className="pr-item-t flex-1">{c.exemplo ? 'Empresa Exemplo' : nomeEmpresa(emp)}</div><div className="text-[11px] pr-muted pr-num">{horaCurta(c.ultima_mensagem_em)}</div></div>
                      <div className="pr-item-s">{trecho(c.assunto, 70)}</div>
                      <div className="flex gap-1.5 mt-1 flex-wrap items-center">
                        {cl && <span className={`pr-badge ${cl.cor === 'neutro' ? '' : cl.cor}`}>{cl.texto}</span>}
                        {c.status === 'assumida' && <span className="pr-badge ouro">Assumida</span>}
                        {c.status === 'rascunho_pronto' && <span className="pr-badge amarelo">Rascunho pronto</span>}
                        {c.exemplo && <span className="pr-exemplo">EXEMPLO</span>}
                        {c.nao_lidas > 0 && <span className="pr-badge ouro pr-num">{c.nao_lidas} nova{c.nao_lidas > 1 ? 's' : ''}</span>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="text-[11px] pr-muted mt-2 hidden lg:block">Atalhos: <span className="pr-kbd">j</span>/<span className="pr-kbd">k</span> navegar · <span className="pr-kbd">r</span> responder · <span className="pr-kbd">a</span> assumir · <span className="pr-kbd">e</span> encerrar</div>
        </div>

        {/* coluna 2: leitura */}
        <div className={`pr-col ${painel === 'leitura' ? 'ativa' : ''}`}>
          <div className="pr-card pr-card-p">
            {!sel ? (
              <div className="text-center py-16 pr-muted text-sm">Escolha uma conversa à esquerda.</div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex gap-2 items-start flex-wrap">
                  <button className="pr-btn pr-voltar" onClick={() => setPainel('lista')}>← Conversas</button>
                  <div className="flex-1 min-w-0"><div className="text-base font-bold leading-tight">{sel.assunto || '(sem assunto)'}</div><div className="text-xs pr-muted">{nomeEmpresa(empresa)}{sel.exemplo ? ' · exemplo' : ''}</div></div>
                  <button className="pr-btn pr-voltar" onClick={() => setPainel('empresa')}>Empresa →</button>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button className="pr-btn pri" onClick={() => abrirComposer('responder')}>Responder</button>
                  <button className="pr-btn" onClick={() => abrirComposer('todos')}>Responder a todos</button>
                  <button className="pr-btn" onClick={() => abrirComposer('encaminhar')}>Encaminhar</button>
                  <button className="pr-btn" disabled={ocupado || sel.exemplo || sel.status === 'assumida'} onClick={() => void assumir(sel)}>Assumir</button>
                  <button className="pr-btn" disabled={ocupado || sel.exemplo || !['assumida', 'precisa_de_voce'].includes(sel.status)} onClick={() => void devolver(sel)}>Devolver para a IA</button>
                  <button className="pr-btn" disabled={ocupado || sel.exemplo || sel.status === 'encerrada'} onClick={() => void encerrar(sel)}>Encerrar</button>
                  <button className="pr-btn perigo" disabled={ocupado || sel.exemplo || !sel.empresa_id} onClick={() => setPedeDescadastro(true)}>Descadastrar empresa</button>
                </div>
                <div className="pr-scroll" style={{ maxHeight: 'calc(100vh - 340px)' }} onClick={aoClicarCorpo}>
                  {emails.length === 0 && <div className="pr-esq" style={{ width: '50%' }} />}
                  {emails.map((e) => (
                    <div key={e.id} className={`pr-bolha ${e.direcao}`}>
                      <div className="pr-bolha-topo">
                        <b>{e.direcao === 'entrada' ? e.de : `${caixaDe(e.caixa_id)?.nome_exibicao ?? 'RBR Cargo'} (${e.de || caixaDe(e.caixa_id)?.endereco || ''})`}</b>
                        <span className="pr-muted pr-num">{new Date(e.recebido_em).toLocaleString('pt-BR')}</span>
                        <span className="pr-badge">{e.direcao === 'entrada' ? 'Recebido' : 'Enviado'}</span>
                        {e.status_envio && e.status_envio !== 'enviado' && <span className={`pr-badge ${e.status_envio === 'falhou' || e.status_envio === 'incerto' ? 'vermelho' : 'amarelo'}`}>{{ rascunho: 'Rascunho', aprovado: 'Aguardando envio', falhou: 'Falhou', descartado: 'Descartado', incerto: 'Envio incerto, conferir' }[e.status_envio]}</span>}
                        {e.exemplo && <span className="pr-exemplo">EXEMPLO</span>}
                      </div>
                      {e.corpo_html ? <div className="pr-corpo" dangerouslySetInnerHTML={{ __html: sanitizarHtml(e.corpo_html) }} /> : <div className="pr-corpo" dangerouslySetInnerHTML={{ __html: textoParaHtml(e.corpo_texto ?? '') }} />}
                      {(e.anexos ?? []).length > 0 && (
                        <div className="flex gap-1.5 flex-wrap mt-2">{e.anexos.map((a, i) => <span key={i} className="pr-badge" title="O arquivo fica na caixa de e-mail original">📎 {a.nome}{a.tamanho ? ` (${Math.max(1, Math.round(a.tamanho / 1024))} KB)` : ''}</span>)}</div>
                      )}
                      {e.erro && <div className="text-xs mt-1" style={{ color: 'var(--pr-bad)' }}>{e.erro}</div>}
                    </div>
                  ))}
                </div>

                {composer && (
                  <div className="pr-card pr-card-p flex flex-col gap-2" style={{ background: 'var(--pr-surface-2)' }}>
                    <div className="flex items-center gap-2"><div className="pr-titulo flex-1">{composer.modo === 'encaminhar' ? 'Encaminhar' : composer.modo === 'todos' ? 'Responder a todos' : 'Responder'}</div>
                      <span className="text-[11px] pr-muted">{composer.salvoEm ? `Rascunho salvo às ${new Date(composer.salvoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : modoExemplo ? 'Exemplo: não grava' : 'Salva sozinho'}</span></div>
                    <label className="text-xs flex flex-col gap-1">Enviar pela caixa
                      <select className="pr-input" value={composer.caixaId} onChange={(e) => editar({ caixaId: e.target.value })}>
                        {caixas.filter((c) => c.ativa).map((c) => <option key={c.id} value={c.id}>{c.endereco} — assina “{c.assinatura}”</option>)}
                      </select></label>
                    <label className="text-xs flex flex-col gap-1">Para<input className="pr-input" value={composer.para} onChange={(e) => editar({ para: e.target.value })} /></label>
                    <label className="text-xs flex flex-col gap-1">Cópia (Cc)<input className="pr-input" value={composer.cc} onChange={(e) => editar({ cc: e.target.value })} /></label>
                    <label className="text-xs flex flex-col gap-1">Assunto<input className="pr-input" value={composer.assunto} onChange={(e) => editar({ assunto: e.target.value })} /></label>
                    <textarea className="pr-input" rows={9} aria-label="Mensagem" value={composer.corpo} onChange={(e) => editar({ corpo: e.target.value })} placeholder="Escreva a resposta…" />
                    <div className="text-[11px] pr-muted">A assinatura “{caixaDe(composer.caixaId)?.assinatura ?? 'Pedro | RBR Cargo'}” e o endereço da caixa entram sozinhos no fim. O envio é em <b>texto simples</b> (sem imagem nem rastreador), por segurança de entrega. Anexos: ainda não disponíveis nesta versão (limite previsto: 25 MB).</div>
                    <div className="flex gap-2 justify-end flex-wrap">
                      <button className="pr-btn" onClick={() => void descartarRascunho()}>Descartar</button>
                      <button className="pr-btn ouro" disabled={ocupado || modoExemplo} title={modoExemplo ? 'Exemplo: nada é gravado.' : ''} onClick={() => void enviar()}>Aprovar e enviar</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* coluna 3: empresa */}
        <div className={`pr-col ${painel === 'empresa' ? 'ativa' : ''}`}>
          <div className="pr-card pr-card-p flex flex-col gap-3">
            <button className="pr-btn pr-voltar self-start" onClick={() => setPainel('leitura')}>← Conversa</button>
            {!sel ? <div className="text-sm pr-muted text-center py-10">Os dados da empresa aparecem aqui.</div> : (
              <>
                <div>
                  <div className="pr-titulo">Empresa</div>
                  <div className="text-sm font-bold">{sel.exemplo ? 'Empresa Exemplo Ltda' : nomeEmpresa(empresa)}</div>
                  {empresa && <div className="text-xs pr-muted">{empresa.cidade ?? '—'}{empresa.uf ? `/${empresa.uf}` : ''} · CNPJ {empresa.cnpj}</div>}
                  {empresa && <div className="flex gap-1.5 mt-1.5"><span className={`pr-badge ${empresa.classe === 'A' ? 'verde' : empresa.classe === 'B' ? 'amarelo' : ''}`}>Classe {empresa.classe} · {empresa.pontuacao} pts</span><span className="pr-badge">{empresa.status}</span></div>}
                </div>
                <div>
                  <div className="pr-titulo mb-1">Jornada e toques enviados</div>
                  {sel.exemplo ? <div className="text-xs">Toque 1 · enviado há 1 dia (exemplo)</div>
                    : toques.length === 0 ? <div className="text-xs pr-muted">Nenhum toque registrado.</div>
                    : toques.map((m) => <div key={m.id} className="text-xs py-0.5">Toque {m.toque} · <b>{m.status}</b>{m.enviado_em ? ` · ${new Date(m.enviado_em).toLocaleDateString('pt-BR')}` : ''}</div>)}
                </div>
                <div>
                  <div className="pr-titulo mb-1">O que a IA entendeu</div>
                  {!iaLigada && !sel.exemplo ? <div className="text-xs pr-muted">IA desligada: falta a chave.</div> : (
                    <>
                      {sel.classificacao_ia && <div className="mb-1"><span className={`pr-badge ${ROTULO_CLASSE[sel.classificacao_ia]?.cor === 'neutro' ? '' : ROTULO_CLASSE[sel.classificacao_ia]?.cor}`}>{ROTULO_CLASSE[sel.classificacao_ia]?.texto ?? sel.classificacao_ia}</span></div>}
                      {sel.resumo_ia && <div className="text-xs mb-1">{sel.resumo_ia}</div>}
                      {Object.entries(sel.dados_extraidos ?? {}).length === 0 ? <div className="text-xs pr-muted">Nenhum dado extraído ainda.</div>
                        : <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">{Object.entries(sel.dados_extraidos).map(([k, v]) => <div key={k}><div className="pr-titulo">{k}</div><div>{String(v)}</div></div>)}</div>}
                    </>
                  )}
                </div>
                {rascunhoIa && (
                  <div className="pr-sugestao flex flex-col gap-2">
                    <div className="pr-titulo" style={{ color: 'var(--pr-gold)' }}>Rascunho da IA</div>
                    <div className="text-xs whitespace-pre-wrap">{rascunhoIa.rascunho_ia}</div>
                    {rascunhoIa.motivo_ia && <div className="text-[11px] pr-muted"><b>Por que:</b> {rascunhoIa.motivo_ia}</div>}
                    <div className="flex gap-1.5 flex-wrap">
                      <button className="pr-btn ouro" onClick={() => abrirComposer('responder', rascunhoIa, rascunhoIa.rascunho_ia ?? '')}>Usar</button>
                      <button className="pr-btn" onClick={() => abrirComposer('responder', rascunhoIa, rascunhoIa.rascunho_ia ?? '')}>Editar</button>
                      <button className="pr-btn" onClick={() => { const n = [...descartados, rascunhoIa.id]; setDescartados(n); try { localStorage.setItem(LS_DESCARTADOS, JSON.stringify(n)) } catch { /* sem armazenamento */ } if (!sel.exemplo && sel.status === 'rascunho_pronto') void atualizarConversa(sel.id, { status: 'precisa_de_voce' }) }}>Descartar</button>
                    </div>
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <button className="pr-btn" disabled={ocupado || sel.exemplo || !empresa || !!empresa?.lead_id || !ultimaEntrada} onClick={() => void criarLead(sel)}>{empresa?.lead_id ? 'Já é lead' : 'Criar lead'}</button>
                  <Link to="/cotacao" className="pr-btn text-center no-underline">Abrir cotação</Link>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {pedeDescadastro && sel && (
        <Modal titulo="Descadastrar empresa" onFechar={() => { setPedeDescadastro(false); setTextoConfirma('') }} largura="max-w-md">
          <div className="text-sm">Isto bloqueia o e-mail de quem respondeu, marca a empresa como descadastrada e cancela os toques pendentes. Para confirmar, digite <b>DESCADASTRAR</b>.</div>
          <input className="border rounded-lg px-3 py-2 text-sm w-full" style={{ borderColor: 'var(--rbr-border)' }} value={textoConfirma} onChange={(e) => setTextoConfirma(e.target.value)} autoFocus />
          <div className="flex justify-end gap-2"><button className="pr-btn" onClick={() => setPedeDescadastro(false)}>Cancelar</button><button className="pr-btn perigo" disabled={ocupado || textoConfirma !== 'DESCADASTRAR'} onClick={() => void descadastrar(sel)}>Confirmar</button></div>
        </Modal>
      )}
    </div>
  )
}
