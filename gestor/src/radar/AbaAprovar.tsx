// R6: aprovar os e-mails de toque 1 a 4 que o agente escreveu. Aprovar só muda o status; quem envia é o robô, se estiver ligado.
import { useMemo, useState } from 'react'
import { auditar, db } from '../lib/prospeccaoDb'
import { temHtml } from '../lib/prospeccao'
import { aprovarLote, checagensEmail, podeAprovarMensagem, quandoSai, riscoEnvio, type ChecagemEnvio, type RiscoEnvio } from '../lib/radar'
import { EXEMPLO_APROVAR } from './exemplos'
import { Acoes, AvisoErro, FaixaExemplo, Ic, Vazio, mensagemDeErro, toast, useConsulta, useRadar } from './ui'

type Linha = {
  id: string; toque: number; assunto: string; corpo: string; status: string
  empresa: { id: string; razao_social: string; nome_fantasia: string | null; cnpj: string; classe: string; pontuacao: number; segmento: string; cidade: string | null } | null
  contato: { email: string; nome: string | null; tipo_email: string; validacao_status: string } | null
  caixa: { endereco: string } | null
}
type Item = { id: string; empresa: string; para: string; toque: number; caixa: string; assunto: string; corpo: string; risco: RiscoEnvio; checagem: ChecagemEnvio; bloqueioMotivo: string | null; porque: string[]; atencao: string[] }

export default function AbaAprovar() {
  const { exemplos, pessoaId, flags, recarregar, tick } = useRadar()
  const [selId, setSelId] = useState<string | null>(null)
  const [estado, setEstado] = useState<Record<string, 'ok' | 'pulado'>>({})
  const [editando, setEditando] = useState<{ assunto: string; corpo: string } | null>(null)
  const [textos, setTextos] = useState<Record<string, { assunto: string; corpo: string }>>({})

  const rasc = useConsulta(() => db.from('prospeccao_mensagens').select('id, toque, assunto, corpo, status, empresa:prospeccao_empresas(id, razao_social, nome_fantasia, cnpj, classe, pontuacao, segmento, cidade), contato:prospeccao_contatos(email, nome, tipo_email, validacao_status), caixa:prospeccao_caixas(endereco)').eq('status', 'rascunho').order('criado_em').limit(300) as PromiseLike<{ data: Linha[] | null; error: { message: string } | null }>, [] as Linha[], [exemplos, tick])
  const apoio = useConsulta(async () => {
    const [bl, base, ativos, ia, gasto, uso] = await Promise.all([
      db.from('prospeccao_bloqueio').select('tipo, valor'),
      db.from('prospeccao_base').select('cnpj, distancia_km, restricao'),
      db.from('prospeccao_empresas').select('segmento').in('status', ['em_contato', 'respondeu', 'quente', 'cliente', 'repouso']),
      db.rpc('prospeccao_segredos_status'),
      db.from('prospeccao_ia_uso').select('custo_brl').eq('data', new Date().toISOString().slice(0, 10)),
      db.from('parametros_sistema').select('valor').eq('chave', 'PROSPECCAO_IA_TETO_DIARIO_BRL').maybeSingle(),
    ])
    const chave = ((ia.data ?? []) as { nome: string; cadastrado: boolean }[]).some((x) => x.nome === 'PROSPECCAO_IA_CHAVE' && x.cadastrado)
    const g = ((gasto.data ?? []) as { custo_brl: number }[]).reduce((s, x) => s + Number(x.custo_brl), 0)
    return { data: { bloqueios: (bl.data ?? []) as { tipo: string; valor: string }[], base: (base.data ?? []) as { cnpj: string; distancia_km: number | null; restricao: string | null }[], segAtivos: new Set(((ativos.data ?? []) as { segmento: string }[]).map((x) => x.segmento)), chave, tetoOk: g < Number((uso.data as { valor: unknown } | null)?.valor ?? 3) }, error: null }
  }, { bloqueios: [] as { tipo: string; valor: string }[], base: [] as { cnpj: string; distancia_km: number | null; restricao: string | null }[], segAtivos: new Set<string>(), chave: false, tetoOk: true }, [exemplos, tick])

  const itens: Item[] = useMemo(() => {
    if (exemplos) return EXEMPLO_APROVAR.map((a) => ({ id: a.id, empresa: a.empresa, para: a.para, toque: a.toque, caixa: a.caixa, assunto: a.assunto, corpo: a.corpo, risco: { nivel: a.risco, motivos: [] }, checagem: checagensEmail(a.corpo, a.assunto, false), bloqueioMotivo: null, porque: a.motivos, atencao: [] }))
    return rasc.dados.filter((l) => l.empresa && l.contato).map((l) => {
      const t = textos[l.id] ?? { assunto: l.assunto, corpo: l.corpo }
      const email = l.contato!.email.toLowerCase()
      const dom = email.split('@')[1] ?? ''
      const bloq = apoio.dados.bloqueios.some((b) => (b.tipo === 'email' && b.valor === email) || (b.tipo === 'dominio' && b.valor === dom))
      const b = apoio.dados.base.find((x) => x.cnpj === l.empresa!.cnpj)
      const risco = riscoEnvio({ classe: l.empresa!.classe, tipoEmail: l.contato!.tipo_email, distanciaKm: b?.distancia_km, segmentoNovo: !apoio.dados.segAtivos.has(l.empresa!.segmento), restricao: b?.restricao })
      const checagem = checagensEmail(t.corpo, t.assunto, bloq)
      return {
        id: l.id, empresa: l.empresa!.nome_fantasia || l.empresa!.razao_social, para: l.contato!.email, toque: l.toque, caixa: l.caixa?.endereco ?? 'a caixa será escolhida pelo robô', assunto: t.assunto, corpo: t.corpo, risco, checagem,
        bloqueioMotivo: podeAprovarMensagem({ validacao: l.contato!.validacao_status, bloqueado: bloq, checagem, classe: l.empresa!.classe }),
        porque: [`Faixa ${l.empresa!.classe}, nota ${l.empresa!.pontuacao}`, l.contato!.tipo_email === 'generico' ? 'E-mail de setor (logística, compras...)' : 'E-mail de pessoa', `${l.empresa!.cidade ?? 'Cidade não informada'}`],
        atencao: risco.motivos,
      }
    })
  }, [exemplos, rasc.dados, apoio.dados, textos])

  const atual = itens.find((i) => i.id === selId) ?? itens.find((i) => !estado[i.id]) ?? itens[0] ?? null
  const pendentes = itens.filter((i) => !estado[i.id]).length

  async function decidir(i: Item, acao: 'ok' | 'pulado') {
    if (exemplos) { setEstado((s) => ({ ...s, [i.id]: acao })); return toast(acao === 'ok' ? 'Exemplo: aprovado' : 'Exemplo: pulado') }
    if (acao === 'ok') {
      if (i.bloqueioMotivo) return toast(i.bloqueioMotivo)
      const { error } = await db.from('prospeccao_mensagens').update({ assunto: i.assunto, corpo: i.corpo, status: 'aprovado', aprovado_por: pessoaId, aprovado_em: new Date().toISOString() }).eq('id', i.id).eq('status', 'rascunho')
      if (error) return toast(mensagemDeErro(error.message))
      try { await auditar('prospeccao_mensagem_aprovada', { mensagem_id: i.id, toque: i.toque }) } catch { /* melhor esforço */ }
    } else {
      const { error } = await db.from('prospeccao_mensagens').update({ status: 'descartado', erro: 'pulado na aprovação' }).eq('id', i.id).eq('status', 'rascunho')
      if (error) return toast(mensagemDeErro(error.message))
      try { await auditar('prospeccao_mensagem_pulada', { mensagem_id: i.id }) } catch { /* melhor esforço */ }
    }
    setEstado((s) => ({ ...s, [i.id]: acao })); recarregar()
    toast(acao === 'ok' ? 'Aprovado' : 'Pulado')
    const prox = itens.find((x) => x.id !== i.id && !estado[x.id]); if (prox) setSelId(prox.id)
  }
  async function desfazer(i: Item) {
    if (exemplos) { setEstado((s) => { const n = { ...s }; delete n[i.id]; return n }); return }
    const { error } = await db.from('prospeccao_mensagens').update({ status: 'rascunho', erro: null, aprovado_por: null, aprovado_em: null }).eq('id', i.id).in('status', ['aprovado', 'descartado']).is('message_id', null)
    if (error) return toast(mensagemDeErro(error.message))
    try { await auditar('prospeccao_aprovacao_desfeita', { mensagem_id: i.id }) } catch { /* melhor esforço */ }
    setEstado((s) => { const n = { ...s }; delete n[i.id]; return n }); recarregar()
  }
  async function salvarEdicao(i: Item) {
    if (!editando) return
    if (!editando.assunto.trim() || !editando.corpo.trim()) return toast('Assunto e texto não podem ficar vazios.')
    if (temHtml(editando.assunto) || temHtml(editando.corpo)) return toast('O texto não pode conter HTML.')
    if (exemplos) { setEditando(null); return toast('Exemplo: texto salvo') }
    const { error } = await db.from('prospeccao_mensagens').update({ assunto: editando.assunto.trim(), corpo: editando.corpo }).eq('id', i.id).eq('status', 'rascunho')
    if (error) return toast(mensagemDeErro(error.message))
    try { await auditar('prospeccao_mensagem_editada', { mensagem_id: i.id }) } catch { /* melhor esforço */ }
    setTextos((t) => ({ ...t, [i.id]: { assunto: editando.assunto.trim(), corpo: editando.corpo } })); setEditando(null); toast('Texto salvo')
  }
  async function aprovarBaixoRisco() {
    const lote = aprovarLote(itens.filter((i) => !estado[i.id]).map((i) => ({ ...i, risco: i.risco.nivel, aprovavel: !i.bloqueioMotivo })))
    if (!lote.length) return toast('Nenhum e-mail de baixo risco pendente.')
    for (const i of lote) await decidir(itens.find((x) => x.id === i.id)!, 'ok')
    toast(`${lote.length} e-mails de baixo risco aprovados`)
  }

  const motivoSemIa = !apoio.dados.chave ? 'Sem chave de IA cadastrada no cofre.' : !apoio.dados.tetoOk ? 'O teto de gasto da IA de hoje foi atingido.' : 'A reescrita pela IA será ligada junto com o agente de IA (ainda desligado).'
  const modoAprov = flags.PROSPECCAO_APROVACAO_OBRIGATORIA !== 'nao'
  return (
    <>
      <Acoes><button className="btn pri" disabled={pendentes === 0} onClick={() => void aprovarBaixoRisco()}>Aprovar os de baixo risco</button></Acoes>
      {exemplos && <FaixaExemplo />}
      <AvisoErro erro={exemplos ? null : rasc.erro} />
      <div className="note"><Ic n="info" /><div><b>O que você aprova aqui:</b> os e-mails de primeiro contato e de continuação (toques 1 a 4) que o agente escreveu e ainda não enviou. {modoAprov ? 'Enquanto a aprovação estiver ligada, nada sai sem o seu ok.' : 'Atenção: a aprovação obrigatória está desligada nos Ajustes.'} Respostas a clientes ficam na Caixa de e-mail.</div></div>
      <div className="awrap">
        <div className="card alist">
          {itens.length === 0 ? <Vazio>Nenhum e-mail esperando. Quando o agente escrever, eles aparecem aqui.</Vazio> : itens.map((i) => {
            const st = estado[i.id]
            return (
              <button key={i.id} className={`aitem${i.id === atual?.id ? ' on' : ''}${st ? ' done' : ''}`} onClick={() => { setSelId(i.id); setEditando(null) }}>
                <div className="between"><b>{i.empresa}</b>{st ? <span className={`chip ${st === 'ok' ? 'ok' : ''}`}>{st === 'ok' ? 'aprovado' : 'pulado'}</span> : <span className={`chip ${i.risco.nivel === 'baixo' ? 'ok' : 'warn'}`}>risco {i.risco.nivel === 'baixo' ? 'baixo' : 'médio'}</span>}</div>
                <span>Toque {i.toque} · para {i.para.split('@')[0]}@ · caixa {i.caixa.split('@')[0]}@</span>
              </button>
            )
          })}
        </div>
        <div className="card mail">
          {!atual ? <Vazio>Selecione um e-mail.</Vazio> : (
            <>
              <dl className="hdr"><dt>De</dt><dd>Pedro · {atual.caixa}</dd><dt>Para</dt><dd>{atual.para}</dd><dt>Assunto</dt><dd>{editando ? <input className="inp" value={editando.assunto} onChange={(e) => setEditando({ ...editando, assunto: e.target.value })} /> : <b>{atual.assunto}</b>}</dd><dt>Quando</dt><dd>{quandoSai(new Date())} · toque {atual.toque}</dd></dl>
              <div className="body">{editando ? <textarea className="inp" value={editando.corpo} onChange={(e) => setEditando({ ...editando, corpo: e.target.value })} /> : atual.corpo}</div>
              <div className="why">
                <div><b>Por que esta empresa</b>{atual.porque.join(' · ')}</div>
                <div><b>Checagens</b>{atual.checagem.itens.map((c) => <span key={c.texto} className={`chip ${c.ok ? 'ok' : 'bad'}`} style={{ marginRight: 4 }}>{c.ok ? '✓' : '✗'} {c.texto}</span>)}</div>
                <div><b>Atenção</b>{atual.atencao.length ? atual.atencao.join(' · ') : 'Nada fora do comum.'}{atual.bloqueioMotivo && <div style={{ color: 'var(--bad)', marginTop: 4 }}>{atual.bloqueioMotivo}</div>}</div>
              </div>
              <div className="acts">
                {estado[atual.id] ? (
                  <><span className={`chip ${estado[atual.id] === 'ok' ? 'ok' : ''}`}>{estado[atual.id] === 'ok' ? 'Aprovado: sai na próxima janela, se o envio estiver ligado' : 'Pulado'}</span><button className="btn sm ghost" onClick={() => void desfazer(atual)}>Desfazer</button></>
                ) : editando ? (
                  <><button className="btn pri" onClick={() => void salvarEdicao(atual)}>Salvar</button><button className="btn ghost" onClick={() => setEditando(null)}>Cancelar</button></>
                ) : (
                  <>
                    <button className="btn pri" disabled={!!atual.bloqueioMotivo} title={atual.bloqueioMotivo ?? ''} onClick={() => void decidir(atual, 'ok')}>Aprovar</button>
                    <button className="btn" onClick={() => setEditando({ assunto: atual.assunto, corpo: atual.corpo })}>Editar</button>
                    <button className="btn" disabled title={motivoSemIa}>✦ Pedir outra versão</button>
                    <button className="btn ghost" onClick={() => void decidir(atual, 'pulado')}>Pular</button>
                    <span className="xs faint" style={{ alignSelf: 'center' }}>Outra versão: {motivoSemIa}</span>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
