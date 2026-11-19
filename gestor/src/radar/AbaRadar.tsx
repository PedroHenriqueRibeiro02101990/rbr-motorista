// R3: visão geral. Números reais do banco; o card "Agente trabalhando" mostra a última atividade real do prospeccao_log (atualiza a cada 20 s).
import { useEffect, useMemo, useState } from 'react'
import { db } from '../lib/prospeccaoDb'
import { diaDaRampa, limiteDoDia } from '../lib/prospeccao'
import { fmtBrl, fmtInt, pct } from '../lib/radar'
import { AvisoErro, FaixaExemplo, hojeSP, horaCurta, mensagemDeErro, useConsulta, useRadar } from './ui'

type Log = { id: number; momento: string; robo: string; acao: string; resultado: string | null; erro: string | null }
const ETAPAS_AGENTE = ['Ler', 'Pontuar', 'Escolher', 'Redigir', 'Checar', 'Fila'] as const
// Qual etapa do pipeline cada ação do log representa (as ações vêm dos robôs; as desconhecidas ficam sem etapa).
const ETAPA_DA_ACAO: Record<string, number> = {
  lendo: 0, ponto_de_partida: 0, resposta: 0, lead_quente: 0, pontuar: 1, escolhido: 2, escolher: 2, redigir: 3, rascunho_criado: 3, descartada_na_reconferencia: 4, checar: 4,
  enviado: 5, enviado_teste: 5, fila: 5,
}
const TEXTO_ACAO: Record<string, string> = {
  desligado: 'Robôs desligados', fora_da_janela: 'Fora da janela de envio (seg a sex, 7h às 18h)', limite_do_dia: 'Limite do dia atingido', enviado: 'Enviou um e-mail', enviado_teste: 'Enviou um e-mail de teste',
  lead_quente: 'Recebeu um lead quente', fora_do_escritorio: 'Resposta automática de fora do escritório', segredos_ausentes: 'Faltam as senhas das caixas no cofre', sem_caixa_disponivel: 'Sem caixa disponível agora',
  descartada_na_reconferencia: 'Descartou uma mensagem na conferência final', ponto_de_partida: 'Começou a ler a caixa',
}

export default function AbaRadar() {
  const { exemplos, flags, irPara, tick } = useRadar()
  const hoje = hojeSP()
  const dados = useConsulta(async () => {
    const A = ['mx_ok', 'verificado', 'catch_all']
    const [tot, prontas, seq, dia, quentes, ia, rascunhos, estado, rampa, resp] = await Promise.all([
      db.from('prospeccao_empresas').select('id', { count: 'exact', head: true }),
      db.from('prospeccao_empresas').select('id, prospeccao_contatos!inner(id)', { count: 'exact', head: true }).eq('classe', 'A').in('prospeccao_contatos.validacao_status', A).in('status', ['novo', 'qualificado']),
      db.from('prospeccao_empresas').select('id', { count: 'exact', head: true }).in('status', ['em_aprovacao', 'em_contato']),
      db.from('prospeccao_envio_diario').select('*').eq('data', hoje).maybeSingle(),
      db.from('prospeccao_empresas').select('id', { count: 'exact', head: true }).eq('status', 'quente'),
      db.from('prospeccao_ia_uso').select('custo_brl').eq('data', hoje).limit(5000),
      db.from('prospeccao_mensagens').select('id', { count: 'exact', head: true }).eq('status', 'rascunho'),
      db.from('prospeccao_estado').select('primeiro_envio_em, parada_motivo').eq('id', 1).maybeSingle(),
      db.from('prospeccao_rampa').select('dia_inicio, limite'),
      db.from('prospeccao_respostas').select('id', { count: 'exact', head: true }).eq('tratada', false),
    ])
    const erro = [tot, prontas, seq, rascunhos].find((r) => r.error)?.error ?? null
    const d = (dia.data ?? { enviados: 0, devolvidos: 0, respostas: 0, descadastros: 0 }) as { enviados: number; devolvidos: number; respostas: number; descadastros: number }
    const gasto = ((ia.data ?? []) as { custo_brl: number }[]).reduce((s, x) => s + Number(x.custo_brl), 0)
    const e = (estado.data ?? null) as { primeiro_envio_em: string | null; parada_motivo: string | null } | null
    return { data: { total: tot.count ?? 0, prontas: prontas.count ?? 0, seq: seq.count ?? 0, quentes: quentes.count ?? 0, rascunhos: rascunhos.count ?? 0, respostasAbertas: resp.count ?? 0, dia: d, gasto, estado: e, rampa: (rampa.data ?? []) as { dia_inicio: number; limite: number }[] }, error: erro }
  }, { total: 0, prontas: 0, seq: 0, quentes: 0, rascunhos: 0, respostasAbertas: 0, dia: { enviados: 0, devolvidos: 0, respostas: 0, descadastros: 0 }, gasto: 0, estado: null as { primeiro_envio_em: string | null; parada_motivo: string | null } | null, rampa: [] as { dia_inicio: number; limite: number }[] }, [exemplos, tick])

  const [logs, setLogs] = useState<Log[]>([])
  const [erroLog, setErroLog] = useState<string | null>(null)
  useEffect(() => {
    if (exemplos) return
    let vivo = true
    const ler = async () => {
      const { data, error } = await db.from('prospeccao_log').select('id, momento, robo, acao, resultado, erro').order('momento', { ascending: false }).limit(30)
      if (!vivo) return
      setErroLog(error ? mensagemDeErro(error.message) : null)
      setLogs((data ?? []) as Log[])
    }
    void ler()
    const t = setInterval(() => void ler(), 20_000)
    return () => { vivo = false; clearInterval(t) }
  }, [exemplos])

  const d = exemplos ? { total: 3604, prontas: 1466, seq: 41, quentes: 2, rascunhos: 5, respostasAbertas: 6, dia: { enviados: 18, devolvidos: 0, respostas: 6, descadastros: 0 }, gasto: 0.84, estado: null, rampa: [{ dia_inicio: 1, limite: 25 }] } : dados.dados
  const limite = useMemo(() => limiteDoDia(flags.PROSPECCAO_LIMITE_DIARIO == null ? null : Number(flags.PROSPECCAO_LIMITE_DIARIO), d.rampa, diaDaRampa(d.estado?.primeiro_envio_em ?? null, hoje)), [flags, d.rampa, d.estado, hoje])
  const limDia = exemplos ? { limite: 25, origem: 'rampa' as const } : limite
  const robosLigados = flags.PROSPECCAO_ENVIO_LIBERADO === 'sim' || flags.PROSPECCAO_LEITURA_LIBERADA === 'sim'
  const ultimo = logs[0]
  const etapaAtual = ultimo ? ETAPA_DA_ACAO[ultimo.acao] ?? -1 : -1
  const motivoParado = d.estado?.parada_motivo ? `Parado automaticamente: ${d.estado.parada_motivo}` : flags.PROSPECCAO_ENVIO_LIBERADO !== 'sim' && flags.PROSPECCAO_LEITURA_LIBERADA !== 'sim' ? 'Envio e leitura estão desligados nos Ajustes' : null
  const hojeLinhas = logs.filter((l) => l.momento.slice(0, 10) >= new Date(Date.now() - 36 * 3600_000).toISOString().slice(0, 10)).slice(0, 4)

  const precisa = [
    { n: d.quentes, texto: `${d.quentes} ${d.quentes === 1 ? 'lead quente para assumir' : 'leads quentes para assumir'}`, chip: 'Caixa', cor: 'gold', aba: 'caixa' },
    { n: d.rascunhos, texto: `${d.rascunhos} ${d.rascunhos === 1 ? 'e-mail esperando aprovação' : 'e-mails esperando aprovação'}`, chip: 'Aprovar', cor: 'ice', aba: 'aprovar' },
    { n: d.respostasAbertas, texto: `${d.respostasAbertas} ${d.respostasAbertas === 1 ? 'resposta para tratar' : 'respostas para tratar'}`, chip: 'Caixa', cor: 'warn', aba: 'caixa' },
  ].filter((x) => x.n > 0)

  return (
    <>
      {exemplos && <FaixaExemplo />}
      <AvisoErro erro={exemplos ? null : dados.erro} />
      <div className="hero">
        <div className="orb" aria-hidden="true"><span /><span /></div>
        <span className="lab">Agente de prospecção</span>
        <h2>{d.total === 0 ? 'Nenhuma empresa na base ainda' : `${fmtInt(d.total)} empresas na base, ${fmtInt(d.prontas)} prontas para abordar`}</h2>
        <p>{d.total === 0 ? 'Importe a base da Receita em Buscar clientes e mande empresas para a lista. O agente escreve, você aprova, e nada sai enquanto o envio estiver desligado.' : 'Faixa A com e-mail válido, ainda sem contato. O agente escreve, você aprova, e nada sai enquanto o envio estiver desligado.'}</p>
        <div className="stats">
          <div><b>{fmtInt(d.prontas)}</b><span>Faixa A prontas</span></div><div><b>{fmtInt(d.seq)}</b><span>em sequência</span></div><div><b>{fmtInt(d.dia.respostas)}</b><span>respostas hoje</span></div>
          <div><b>{fmtInt(d.quentes)}</b><span>leads quentes</span></div><div><b>{fmtBrl(d.gasto)}</b><span>IA hoje · teto R$ 3</span></div>
        </div>
      </div>

      <div className="between"><h3>Agente trabalhando</h3><span className={`chip ${robosLigados && !exemplos ? 'ok' : 'warn'}`}>{exemplos ? 'exemplo' : robosLigados ? 'atualiza a cada 20 s' : 'desligado'}</span></div>
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="agent">
          <div className="l">
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <div className="ai"><i /><b /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>{robosLigados || exemplos ? 'Agente RBR' : 'Agente desligado'}</b>
                <div className="xs muted" style={{ minHeight: 18 }}>
                  {exemplos ? 'Escrevendo o toque 1' : !robosLigados ? motivoParado ?? 'Robôs desligados' : ultimo ? `${TEXTO_ACAO[ultimo.acao] ?? ultimo.acao} · ${horaCurta(ultimo.momento)}` : 'Ligado, sem atividade registrada ainda'}
                </div>
              </div>
              {robosLigados && !exemplos && <span className="chip ok">ligado</span>}
            </div>
            <ol className="pipe">{ETAPAS_AGENTE.map((e, i) => <li key={e} className={exemplos ? (i < 3 ? 'done' : i === 3 ? 'cur' : '') : i < etapaAtual ? 'done' : i === etapaAtual ? 'cur' : ''}>{e}</li>)}</ol>
            <div className="target" style={{ minHeight: 64 }}>
              <div className="tx"><b>{exemplos ? 'Papelão Ondulado Mairiporã' : ultimo?.resultado ?? 'Aguardando a próxima empresa'}</b><span>{exemplos ? 'Mairiporã · SP · Papel e embalagens' : ultimo ? `robô de ${ultimo.robo}` : 'fila da Faixa A'}</span></div>
            </div>
            <div className="meters"><div><b>{fmtInt(d.dia.enviados)}</b><span>enviados hoje</span></div><div><b>{fmtInt(d.rascunhos)}</b><span>na fila de aprovação</span></div><div><b>{fmtBrl(d.gasto)}</b><span>gasto de IA</span></div></div>
          </div>
          <div className="r">
            <span className="lab">Último registro dos robôs</span>
            <div className="typed" style={{ whiteSpace: 'pre-wrap', overflow: 'hidden' }}>
              {exemplos ? 'Oi, pessoal da logística, tudo bem?\n\nSou o Pedro, da RBR Cargo. Atendemos fábricas de embalagem da região de Mairiporã com caminhoneiros parceiros credenciados e homologados.\n\nPedro · RBR Cargo' : erroLog ?? (ultimo ? `${TEXTO_ACAO[ultimo.acao] ?? ultimo.acao}\n${ultimo.resultado ?? ''}${ultimo.erro ? `\nErro: ${ultimo.erro}` : ''}` : 'Nenhuma atividade registrada. Quando os robôs rodarem, o que eles fizerem aparece aqui.')}
            </div>
          </div>
        </div>
        <div className="log" role="log" aria-live="off">
          {(exemplos ? [{ id: 1, momento: new Date().toISOString(), acao: 'lendo', resultado: 'Abriu o cadastro de Papelão Ondulado Mairiporã', robo: 'sistema', erro: null }] : logs.slice(0, 5).reverse()).map((l) => (
            <div key={l.id}><time>{horaCurta(l.momento)}</time><span className={l.erro ? 'g' : 'i'}>{TEXTO_ACAO[l.acao] ?? l.acao}{l.resultado ? ` · ${l.resultado}` : ''}</span></div>
          ))}
        </div>
      </div>

      <div className="split">
        <div className="card pad"><div className="between" style={{ marginBottom: 6 }}><h3>Hoje</h3><span className="lab">limite: {limDia.origem}</span></div>
          <div className="hb"><span>Enviados</span><span className="bar"><i style={{ width: `${Math.min(100, pct(d.dia.enviados, limDia.limite))}%` }} /></span><em>{d.dia.enviados}/{limDia.limite}</em></div>
          <div className="hb"><span>Respostas</span><span className="bar"><i style={{ width: `${Math.min(100, pct(d.dia.respostas, Math.max(d.dia.enviados, 1)))}%` }} /></span><em>{d.dia.respostas}</em></div>
          <div className="hb"><span>Quentes</span><span className="bar"><i style={{ width: `${Math.min(100, pct(d.quentes, Math.max(d.dia.respostas, 1)))}%`, background: 'var(--goldbtn)' }} /></span><em>{d.quentes}</em></div>
          <div className="hb"><span>Devoluções</span><span className="bar"><i style={{ width: `${Math.min(100, pct(d.dia.devolvidos, 3))}%`, background: d.dia.devolvidos ? 'var(--bad)' : undefined }} /></span><em>{d.dia.devolvidos}</em></div>
        </div>
        <div className="card pad"><div className="between" style={{ marginBottom: 10 }}><h3>Precisa de você</h3><span className="lab">atalhos</span></div>
          {precisa.length === 0 && (flags.PROSPECCAO_ENVIO_LIBERADO === 'sim' ? <p className="sm muted">Nada esperando por você agora.</p> : null)}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {precisa.map((p) => <button key={p.texto} className="btn" style={{ justifyContent: 'space-between' }} onClick={() => irPara(p.aba)}>{p.texto} <span className={`chip ${p.cor}`}>{p.chip}</span></button>)}
            {flags.PROSPECCAO_ENVIO_LIBERADO !== 'sim' && <button className="btn" style={{ justifyContent: 'space-between' }} onClick={() => irPara('ajustes')}>Envio desligado: veja os Ajustes <span className="chip bad">Ajustes</span></button>}
          </div>
        </div>
      </div>

      <div className="card pad"><div className="between" style={{ marginBottom: 12 }}><h3>Registro recente</h3><span className="chip">{exemplos ? 'exemplo' : 'do log dos robôs'}</span></div>
        {exemplos ? (
          <div className="feed"><div><time>09:42</time>Enviou o toque 1 para uma metalúrgica em Campinas, pela caixa pedro@.</div><div><time>10:21</time>Leu uma resposta, classificou como cotação e avisou Pedro e José Carlos.</div><div><time>11:03</time>Recebeu aviso de e-mail inexistente e bloqueou o endereço.</div><div><time>18:00</time>Fim da janela de envio. Retoma amanhã às 7h.</div></div>
        ) : hojeLinhas.length === 0 ? <p className="sm muted">Ainda sem registros. Aparecem aqui assim que os robôs rodarem.</p> : (
          <div className="feed">{hojeLinhas.map((l) => <div key={l.id}><time>{horaCurta(l.momento)}</time>{TEXTO_ACAO[l.acao] ?? l.acao}{l.resultado ? `: ${l.resultado}` : ''}</div>)}</div>
        )}
      </div>
    </>
  )
}
