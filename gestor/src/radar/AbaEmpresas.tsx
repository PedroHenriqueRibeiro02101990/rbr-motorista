// R5: empresas por etapa, com gaveta de detalhe (por que a nota, dados da Receita, contatos, linha do tempo e ações).
import { useEffect, useMemo, useState } from 'react'
import { auditar, db } from '../lib/prospeccaoDb'
import { ETAPAS, SEGMENTOS_RADAR, contarEtapas, etapaDoStatus, proximaAcaoEmpresa, statusAposAcao, type Etapa } from '../lib/radar'
import { EXEMPLO_EMPRESAS } from './exemplos'
import { Acoes, Anel, AvisoErro, FaixaExemplo, Ic, Vazio, mensagemDeErro, quando, toast, useConsulta, useRadar } from './ui'

type Contato = { id: string; nome: string | null; cargo: string | null; email: string; tipo_email: string; validacao_status: string }
type Emp = {
  id: string; razao_social: string; nome_fantasia: string | null; cnpj: string; segmento: string; cidade: string | null; uf: string | null; pontuacao: number; classe: string; status: string
  criterios: Record<string, number>; repouso_ate: string | null; telefone: string | null; origem_contato: string; lead_id: string | null; criado_em: string; site: string | null; cnae: string | null
  prospeccao_contatos: Contato[]
}
type Peso = { criterio: string; rotulo: string; peso: number }
type Evento = { quando: string; texto: string }
const LABEL_SEG: Record<string, string> = Object.fromEntries(SEGMENTOS_RADAR.map((s) => [s.slug, s.label]))
const VALIDACAO: Record<string, string> = { verificado: 'verificado', mx_ok: 'domínio recebe e-mail', sintaxe_ok: 'só a sintaxe conferida', pendente: 'ainda não validado', catch_all: 'domínio aceita tudo', invalido: 'inválido', devolvido: 'devolvido' }
const fmtCnpj = (c: string) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')

export default function AbaEmpresas() {
  const { exemplos, irPara, pessoaId, recarregar, tick } = useRadar()
  const [etapa, setEtapa] = useState<Etapa | ''>('')
  const [q, setQ] = useState('')
  const [seg, setSeg] = useState('')
  const [sel, setSel] = useState<string | null>(null)
  const [gaveta, setGaveta] = useState(false)
  const [confirmaBloqueio, setConfirmaBloqueio] = useState(false)
  const [versao, setVersao] = useState(0)

  const lista = useConsulta(() => db.from('prospeccao_empresas').select('id, razao_social, nome_fantasia, cnpj, segmento, cidade, uf, pontuacao, classe, status, criterios, repouso_ate, telefone, origem_contato, lead_id, criado_em, site, cnae, prospeccao_contatos(id, nome, cargo, email, tipo_email, validacao_status)').order('pontuacao', { ascending: false }).limit(1500) as PromiseLike<{ data: Emp[] | null; error: { message: string } | null }>, [] as Emp[], [exemplos, tick, versao])
  const pesos = useConsulta(() => db.from('prospeccao_pesos').select('criterio, rotulo, peso').order('ordem') as PromiseLike<{ data: Peso[] | null; error: { message: string } | null }>, [] as Peso[], [exemplos])
  const maxToque = useConsulta(() => db.from('prospeccao_mensagens').select('empresa_id, toque').eq('status', 'enviado').limit(5000) as PromiseLike<{ data: { empresa_id: string; toque: number }[] | null; error: { message: string } | null }>, [] as { empresa_id: string; toque: number }[], [exemplos, tick, versao])

  const empresas: Emp[] = useMemo(() => exemplos ? EXEMPLO_EMPRESAS.map((e) => ({
    id: e.id, razao_social: e.nome, nome_fantasia: null, cnpj: '12345678000190', segmento: e.segmento, cidade: e.cidade, uf: 'SP', pontuacao: e.nota, classe: e.nota >= 70 ? 'A' : 'B', criterios: {},
    status: ({ nova: 'novo', sequencia: 'em_contato', respondeu: 'respondeu', quente: 'quente', cliente: 'cliente', repouso: 'repouso', bloqueada: 'descadastrado' } as Record<string, string>)[e.etapa], repouso_ate: null, telefone: '(11) 4000-0000',
    origem_contato: 'exemplo', lead_id: null, criado_em: new Date().toISOString(), site: null, cnae: null,
    prospeccao_contatos: e.mail ? [{ id: e.id, nome: e.contato, cargo: null, email: e.mail, tipo_email: 'generico', validacao_status: e.validado ? 'mx_ok' : 'pendente' }] : [],
  })) : lista.dados, [exemplos, lista.dados])
  const toqueDe = useMemo(() => { const m = new Map<string, number>(); for (const x of maxToque.dados) m.set(x.empresa_id, Math.max(m.get(x.empresa_id) ?? 0, x.toque)); return m }, [maxToque.dados])
  const contagem = useMemo(() => contarEtapas(empresas), [empresas])
  const visiveis = useMemo(() => {
    const t = q.trim().toLowerCase()
    return empresas.filter((e) => (!etapa || etapaDoStatus(e.status) === etapa) && (!seg || e.segmento === seg || LABEL_SEG[e.segmento] === seg)
      && (!t || `${e.razao_social} ${e.nome_fantasia ?? ''} ${e.cidade ?? ''} ${e.prospeccao_contatos.map((c) => `${c.nome ?? ''} ${c.email}`).join(' ')}`.toLowerCase().includes(t)))
  }, [empresas, etapa, q, seg])
  const atual = empresas.find((e) => e.id === sel) ?? visiveis[0] ?? null

  const eventos = useConsulta(async () => {
    if (!atual || exemplos) return { data: [] as Evento[], error: null }
    const [m, r] = await Promise.all([
      db.from('prospeccao_mensagens').select('toque, status, assunto, criado_em, enviado_em').eq('empresa_id', atual.id).order('criado_em'),
      db.from('prospeccao_respostas').select('recebido_em, classificacao').eq('empresa_id', atual.id).order('recebido_em'),
    ])
    const ev: Evento[] = [{ quando: atual.criado_em, texto: `Entrou: ${atual.origem_contato}` }]
    for (const x of (m.data ?? []) as { toque: number; status: string; assunto: string; criado_em: string; enviado_em: string | null }[]) ev.push({ quando: x.enviado_em ?? x.criado_em, texto: x.status === 'enviado' ? `Toque ${x.toque} enviado` : `Toque ${x.toque}: ${x.status}` })
    for (const x of (r.data ?? []) as { recebido_em: string; classificacao: string | null }[]) ev.push({ quando: x.recebido_em, texto: `Respondeu${x.classificacao ? ` (${x.classificacao.replace(/_/g, ' ')})` : ''}` })
    return { data: ev.sort((a, b) => a.quando.localeCompare(b.quando)), error: m.error ?? r.error }
  }, [] as Evento[], [atual?.id, exemplos, tick])
  useEffect(() => { setConfirmaBloqueio(false) }, [atual?.id])

  async function mudarStatus(acao: 'mandar_agente' | 'bloquear' | 'cliente', texto: string) {
    if (!atual) return
    if (exemplos) return toast(`Exemplo: ${texto}`)
    const novo = statusAposAcao(acao, atual.status)
    if (novo === atual.status) return toast('Nada mudou: a empresa já está adiante.')
    const { error } = await db.from('prospeccao_empresas').update({ status: novo }).eq('id', atual.id)
    if (error) return toast(mensagemDeErro(error.message))
    try { await auditar('prospeccao_empresa_status', { empresa_id: atual.id, de: atual.status, para: novo, acao }) } catch { /* melhor esforço */ }
    setVersao((v) => v + 1); recarregar(); toast(texto)
  }
  async function converter() {
    if (!atual) return
    if (exemplos) return toast('Exemplo: virou lead no CRM')
    if (atual.lead_id) return toast('Esta empresa já é lead.')
    const c = atual.prospeccao_contatos[0]
    const { data, error } = await db.from('leads').insert({ nome: atual.nome_fantasia || atual.razao_social, empresa: atual.razao_social, cnpj: atual.cnpj, tipo_pessoa: 'PJ', whatsapp: atual.telefone, email: c?.email ?? null, origem_cidade: atual.cidade, origem_uf: atual.uf, mensagem: 'Convertida pelo Radar', origem: 'prospeccao', responsavel_id: pessoaId }).select('id').single()
    if (error) return toast(mensagemDeErro(error.message))
    await db.from('prospeccao_empresas').update({ lead_id: (data as { id: string }).id }).eq('id', atual.id)
    try { await auditar('prospeccao_convertido_em_lead', { empresa_id: atual.id, lead_id: (data as { id: string }).id }) } catch { /* melhor esforço */ }
    setVersao((v) => v + 1); toast('Virou lead na Fila do dia')
  }

  const e = atual
  const et = e ? ETAPAS.find((x) => x.id === etapaDoStatus(e.status)) : null
  const segsPresentes = [...new Set(empresas.map((x) => x.segmento))]
  return (
    <>
      <Acoes><button className="btn pri" onClick={() => irPara('buscar')}><Ic n="plus" />Buscar mais</button></Acoes>
      {exemplos && <FaixaExemplo />}
      <AvisoErro erro={exemplos ? null : lista.erro} />
      <div className="kpi" style={{ ['--n' as string]: 8 }}>
        {(['todas', ...ETAPAS.map((x) => x.id)] as const).map((k) => (
          <button key={k} aria-pressed={(etapa || 'todas') === k} onClick={() => setEtapa(k === 'todas' ? '' : (k as Etapa))}><b>{contagem[k as Etapa | 'todas']}</b><span>{k === 'todas' ? 'Todas' : ETAPAS.find((x) => x.id === k)?.label}</span></button>
        ))}
      </div>
      <div className="ewrap">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <div className="row">
            <div className="search" style={{ flex: 1, minWidth: 220 }}><Ic n="buscar" /><input value={q} onChange={(ev) => setQ(ev.target.value)} placeholder="Buscar empresa, cidade ou contato" /></div>
            <select className="inp" style={{ width: 'auto' }} value={seg} onChange={(ev) => setSeg(ev.target.value)}><option value="">Todos os segmentos</option>{segsPresentes.map((s) => <option key={s} value={s}>{LABEL_SEG[s] ?? s}</option>)}</select>
          </div>
          <div className="card tw">
            <table className="t">
              <thead><tr><th>Empresa</th><th>Etapa</th><th>Toque</th><th>Próxima ação</th><th style={{ textAlign: 'right' }}>Nota</th></tr></thead>
              <tbody>
                {visiveis.length === 0 ? <tr><td colSpan={5}><Vazio>{empresas.length === 0 ? 'Nenhuma empresa na lista ainda. Em Buscar clientes, selecione empresas e use "Mandar para a lista".' : 'Nenhuma empresa nesta etapa.'}</Vazio></td></tr> : visiveis.map((x) => {
                  const s = ETAPAS.find((y) => y.id === etapaDoStatus(x.status))
                  const toque = exemplos ? EXEMPLO_EMPRESAS.find((y) => y.id === x.id)?.toque ?? '—' : toqueDe.get(x.id) ? `T${toqueDe.get(x.id)}` : '—'
                  return (
                    <tr key={x.id} className={x.id === e?.id ? 'on' : ''} onClick={() => { setSel(x.id); setGaveta(true) }}>
                      <td className="e"><b>{x.nome_fantasia || x.razao_social}</b><span>{LABEL_SEG[x.segmento] ?? x.segmento} · {x.cidade ?? '—'}</span></td>
                      <td><span className="stage"><i style={{ background: s?.cor }} />{s?.label}</span></td><td className="mono">{toque}</td>
                      <td className="sm">{exemplos ? EXEMPLO_EMPRESAS.find((y) => y.id === x.id)?.proxima : proximaAcaoEmpresa(x)}</td><td style={{ textAlign: 'right' }}><b className="mono">{x.pontuacao}</b></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
        {e && (
          <div className="card drawer" style={gaveta ? undefined : undefined} data-aberta={gaveta}>
            <div className="sec">
              <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                <Anel n={e.pontuacao} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3>{e.nome_fantasia || e.razao_social}</h3>
                  <div className="xs muted" style={{ marginTop: 3 }}>{LABEL_SEG[e.segmento] ?? e.segmento} · {e.cidade ?? '—'}{e.uf ? `/${e.uf}` : ''}</div>
                  <div className="row" style={{ marginTop: 8 }}><span className="stage"><i style={{ background: et?.cor }} />{et?.label}</span><span className="chip">Faixa {e.classe}</span></div>
                </div>
              </div>
              <div className="row" style={{ marginTop: 14 }}>
                <button className="btn sm pri" onClick={() => irPara('caixa')}>Abrir conversa</button>
                <button className="btn sm" onClick={() => void mudarStatus('mandar_agente', 'Entrou na fila do agente')}>Mandar para o agente</button>
                <button className="btn sm" disabled={!!e.lead_id} onClick={() => void converter()}>{e.lead_id ? 'Já é lead' : 'Converter em lead'}</button>
                {!confirmaBloqueio ? <button className="btn sm ghost" onClick={() => setConfirmaBloqueio(true)}>Bloquear</button> : (
                  <span className="row"><span className="xs">Bloquear esta empresa?</span><button className="btn sm" style={{ color: 'var(--bad)' }} onClick={() => { setConfirmaBloqueio(false); void mudarStatus('bloquear', 'Empresa bloqueada') }}>Sim, bloquear</button><button className="btn sm ghost" onClick={() => setConfirmaBloqueio(false)}>Não</button></span>
                )}
              </div>
              <button className="btn sm ghost mobile-fechar" style={{ marginTop: 8 }} onClick={() => setGaveta(false)}>Fechar</button>
            </div>
            <div className="sec"><span className="lab">Próximo passo</span><p style={{ marginTop: 6, fontWeight: 600 }}>{exemplos ? EXEMPLO_EMPRESAS.find((y) => y.id === e.id)?.proxima : proximaAcaoEmpresa(e)}</p></div>
            <div className="sec"><span className="lab">Por que a nota é {e.pontuacao}</span>
              {pesos.dados.length === 0 || Object.keys(e.criterios).length === 0 ? <p className="xs muted" style={{ marginTop: 8 }}>{exemplos ? 'Exemplo: os critérios aparecem aqui.' : 'Os critérios desta empresa ainda não foram preenchidos.'}</p> : pesos.dados.map((p) => {
                const v = Math.max(0, Math.min(1, Number(e.criterios[p.criterio] ?? 0)))
                return <div key={p.criterio} className="crit"><span>{p.rotulo}</span><em>{Math.round(v * p.peso)}/{p.peso}</em><div className="bar"><i style={{ width: `${v * 100}%` }} /></div></div>
              })}
            </div>
            <div className="sec"><span className="lab">Dados da Receita</span>
              <dl className="kv"><dt>CNPJ</dt><dd className="mono">{fmtCnpj(e.cnpj)}</dd><dt>CNAE</dt><dd>{e.cnae ?? '—'}</dd><dt>Telefone</dt><dd className="mono">{e.telefone ?? '—'}</dd><dt>Site</dt><dd>{e.site ?? '—'}</dd><dt>Origem</dt><dd>{e.origem_contato}</dd></dl>
            </div>
            <div className="sec"><span className="lab">Contatos</span>
              {e.prospeccao_contatos.length === 0 ? <p className="xs muted" style={{ marginTop: 6 }}>Sem e-mail cadastrado.</p> : e.prospeccao_contatos.map((c) => (
                <div key={c.id} style={{ marginTop: 8 }}><b className="sm">{c.nome ?? c.email}</b>{c.nome && <div className="xs muted">{c.email}</div>}
                  <div className="row" style={{ marginTop: 4 }}><span className={`chip ${['mx_ok', 'verificado'].includes(c.validacao_status) ? 'ok' : ['invalido', 'devolvido'].includes(c.validacao_status) ? 'bad' : 'warn'}`}>{VALIDACAO[c.validacao_status] ?? c.validacao_status}</span><span className="chip">{c.tipo_email === 'generico' ? 'e-mail de setor' : 'e-mail pessoal'}</span></div></div>
              ))}
            </div>
            <div className="sec"><span className="lab">Linha do tempo</span>
              <ol className="tl">{(exemplos ? [{ quando: new Date().toISOString(), texto: 'Entrou pela base da Receita' }] : eventos.dados).map((x, i) => <li key={i}><span>{quando(x.quando)} · {x.texto}</span></li>)}</ol>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
