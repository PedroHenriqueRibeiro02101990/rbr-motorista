import { useCallback, useEffect, useState } from 'react'
import { Modal } from '../financeiro/ui'
import { useConfirmacao } from '../Confirmacao'
import { auditar, db } from '../../lib/prospeccaoDb'
import {
  corDaCaixa, DESCRICAO_PESO, ETAPAS_FUNIL, FUNIL_EXEMPLO, funilVazio, gastoDoDiaEDoMes, larguraBarra, pct, pesosAlterados, situacaoGasto, taxaPorSegmento, taxaPorToque, validarPesos,
  type Funil, type PesoEdit,
} from '../../lib/prospeccaoPainel'
import { COR_HEX, type Caixa } from '../../lib/prospeccaoCaixa'
import './prospeccaoUi.css'

type Flags = Record<string, string>
type ToqueMsg = { toque: number; empresa: { segmento: string } | null }
type RespMsg = { classificacao: string | null; mensagem: { toque: number; empresa: { segmento: string } | null } | null }

type Q = { in: (c: string, v: string[]) => Q; eq: (c: string, v: string) => Q; not: (c: string, o: string, v: null) => Q }
async function contar(tabela: string, aplicar: (q: Q) => Q = (q) => q): Promise<number> {
  const base = db.from(tabela).select('id', { count: 'exact', head: true }) as unknown as Q
  const { count } = await (aplicar(base) as unknown as Promise<{ count: number | null }>)
  return count ?? 0
}

/** Painel de controle da Prospeccao: saude no topo, funil, jornada, relatorios, pesos da pontuacao. Com "Exemplo" enquanto estiver vazio. */
export default function PainelGeral({ irPara }: { irPara: (aba: 'relatorios' | 'saude' | 'caixa') => void }) {
  const [carregando, setCarregando] = useState(true)
  const [caixas, setCaixas] = useState<(Caixa & { temSenha: boolean })[]>([])
  const [flags, setFlags] = useState<Flags>({})
  const [funil, setFunil] = useState<Funil>({ qualificadas: 0, aprovadas: 0, enviadas: 0, respondidas: 0, cotacoes: 0, assumidas: 0 })
  const [envios, setEnvios] = useState<{ toque: number; segmento: string }[]>([])
  const [respostas, setRespostas] = useState<{ toque: number; segmento: string; classificacao: string | null }[]>([])
  const [gasto, setGasto] = useState({ dia: 0, mes: 0, teto: 3 })
  const [avisos, setAvisos] = useState(0)
  const [ultimoRel, setUltimoRel] = useState<{ semana_inicio: string; semana_fim: string; resumo: string | null; sugestoes: unknown[] } | null>(null)
  const [pesos, setPesos] = useState<PesoEdit[]>([])
  const [pesosOriginais, setPesosOriginais] = useState<PesoEdit[]>([])
  const [anteriores, setAnteriores] = useState<Record<string, number>>({})
  const [ehPedro, setEhPedro] = useState(false)
  const [confirma, setConfirma] = useState(false)
  const [textoConfirma, setTextoConfirma] = useState('')
  const { confirmacao, rodar, ocupado } = useConfirmacao()
  const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10)

  const carregar = useCallback(async () => {
    const mes = hoje.slice(0, 7) + '-01'
    const [cx, sg, fl, up, rel, av, pe, ep, ev, rs, ant, qa, ap, en, re, co, asm] = await Promise.all([
      db.from('prospeccao_caixas').select('*').order('papel'),
      db.rpc('prospeccao_segredos_status'),
      db.from('parametros_sistema').select('chave, valor').like('chave', 'PROSPECCAO\\_%'),
      db.from('prospeccao_ia_uso').select('data, custo_brl').gte('data', mes).limit(5000),
      db.from('prospeccao_relatorios').select('semana_inicio, semana_fim, resumo, sugestoes').order('semana_inicio', { ascending: false }).limit(1),
      db.from('prospeccao_avisos').select('id', { count: 'exact', head: true }).is('visto_em', null),
      db.from('prospeccao_pesos').select('criterio, rotulo, peso').order('ordem'),
      db.rpc('prospeccao_eh_pedro'),
      db.from('prospeccao_mensagens').select('toque, empresa:prospeccao_empresas(segmento)').eq('status', 'enviado').limit(5000),
      db.from('prospeccao_respostas').select('classificacao, mensagem:prospeccao_mensagens(toque, empresa:prospeccao_empresas(segmento))').not('mensagem_id', 'is', null).limit(5000),
      db.from('auditoria_log').select('dado_depois').eq('acao', 'prospeccao_pesos_editados').order('criado_em', { ascending: false }).limit(1),
      contar('prospeccao_empresas', (q) => q.in('classe', ['A', 'B'])),
      contar('prospeccao_mensagens', (q) => q.not('aprovado_em', 'is', null)),
      contar('prospeccao_mensagens', (q) => q.eq('status', 'enviado')),
      contar('prospeccao_respostas'),
      contar('prospeccao_conversas', (q) => q.in('classificacao_ia', ['cotacao', 'preco_prazo', 'preco_prazo_negociacao'])),
      contar('prospeccao_conversas', (q) => q.eq('status', 'assumida')),
    ])
    const senhas = Object.fromEntries(((sg.data ?? []) as { nome: string; cadastrado: boolean }[]).map((x) => [x.nome, x.cadastrado]))
    setCaixas(((cx.data ?? []) as Caixa[]).map((c) => ({ ...c, temSenha: senhas[c.segredo_senha] === true || (c.endereco === 'pedro@rbrcargo.com.br' && senhas['PROSPECCAO_EMAIL_SENHA'] === true) })))
    const f = Object.fromEntries(((fl.data ?? []) as { chave: string; valor: unknown }[]).map((x) => [x.chave, typeof x.valor === 'string' ? x.valor : JSON.stringify(x.valor)]))
    setFlags(f)
    const g = gastoDoDiaEDoMes((up.data ?? []) as { data: string; custo_brl: number }[], hoje)
    setGasto({ ...g, teto: Number(f.PROSPECCAO_IA_TETO_DIARIO_BRL ?? 3) })
    setUltimoRel(((rel.data ?? []) as { semana_inicio: string; semana_fim: string; resumo: string | null; sugestoes: unknown[] }[])[0] ?? null)
    setAvisos(av.count ?? 0)
    const p = (pe.data ?? []) as PesoEdit[]
    setPesos(p); setPesosOriginais(p); setEhPedro(ep.data === true)
    setFunil({ qualificadas: qa, aprovadas: ap, enviadas: en, respondidas: re, cotacoes: co, assumidas: asm })
    setEnvios(((ev.data ?? []) as unknown as ToqueMsg[]).map((m) => ({ toque: m.toque, segmento: m.empresa?.segmento ?? '?' })))
    setRespostas(((rs.data ?? []) as unknown as RespMsg[]).filter((r) => r.mensagem).map((r) => ({ toque: r.mensagem!.toque, segmento: r.mensagem!.empresa?.segmento ?? '?', classificacao: r.classificacao })))
    const antes = ((ant.data ?? []) as { dado_depois: { alterados?: { criterio: string; de: number }[] } }[])[0]?.dado_depois?.alterados ?? []
    setAnteriores(Object.fromEntries(antes.map((x) => [x.criterio, x.de])))
    setCarregando(false)
  }, [hoje])
  useEffect(() => { void carregar() }, [carregar])

  if (carregando) return <div className="pr flex flex-col gap-3">{[1, 2, 3].map((i) => <div key={i} className="pr-card pr-card-p"><div className="pr-esq" style={{ width: `${40 + i * 12}%` }} /></div>)}</div>
  const vazio = funilVazio(funil)
  const f = vazio ? FUNIL_EXEMPLO : funil
  const maximo = Math.max(...Object.values(f))
  const taxasToque = taxaPorToque(envios, respostas), taxasSeg = taxaPorSegmento(envios, respostas)
  const sit = situacaoGasto(gasto.dia, gasto.teto)
  const chaves: [string, string, boolean][] = [['Envio', 'PROSPECCAO_ENVIO_LIBERADO', true], ['Leitura', 'PROSPECCAO_LEITURA_LIBERADA', true], ['Modo de teste', 'PROSPECCAO_MODO_TESTE', false], ['Aprovação humana', 'PROSPECCAO_APROVACAO_OBRIGATORIA', false]]
  const alterados = pesosAlterados(pesosOriginais, pesos)
  const erroPesos = validarPesos(pesos)

  return (
    <div className="pr flex flex-col gap-3">
      {confirmacao}
      {/* faixa de saude */}
      <div className="pr-card pr-card-p grid gap-4 md:grid-cols-4">
        <div>
          <div className="pr-titulo mb-1.5">Caixas</div>
          <div className="flex flex-col gap-1">{caixas.map((c) => { const cor = corDaCaixa({ ativa: c.ativa, parada_motivo: c.parada_motivo, ultimo_diagnostico_resumo: c.ultimo_diagnostico_resumo, temSenha: c.temSenha }); return (
            <button key={c.id} className="flex items-center gap-2 text-xs text-left" onClick={() => irPara('saude')} title={c.parada_motivo ?? ''}>
              <span className="pr-ponto" style={{ background: cor === 'cinza' ? '#9aa3c7' : COR_HEX[cor].ponto }} /><span className="truncate">{c.endereco}</span><span className="pr-muted">{cor === 'cinza' ? 'inativa' : cor}</span></button>) })}</div>
        </div>
        <div>
          <div className="pr-titulo mb-1.5">Chaves</div>
          <div className="flex flex-col gap-1">{chaves.map(([rot, k, ligadoBom]) => { const sim = (flags[k] ?? (k.includes('TESTE') || k.includes('APROVACAO') ? 'sim' : 'nao')) === 'sim'; return (
            <div key={k} className="flex items-center gap-2 text-xs"><span className="pr-ponto" style={{ background: sim === ligadoBom ? 'var(--pr-gold)' : '#9aa3c7' }} /><span className="flex-1">{rot}</span><b>{sim ? 'SIM' : 'NÃO'}</b></div>) })}</div>
        </div>
        <div>
          <div className="pr-titulo mb-1.5">IA hoje</div>
          <div className="text-lg font-bold pr-num">R$ {gasto.dia.toFixed(2)} <span className="text-xs font-normal pr-muted">de R$ {gasto.teto.toFixed(2)}</span></div>
          <div className="pr-barra mt-1"><span style={{ width: `${Math.min(100, sit.pct)}%`, background: sit.tom === 'parada' ? 'var(--pr-bad)' : sit.tom === 'atencao' ? 'var(--pr-gold)' : undefined }} /></div>
        </div>
        <div>
          <div className="pr-titulo mb-1.5">Precisa de você</div>
          <div className="text-lg font-bold pr-num">{avisos} aviso(s)</div>
          <button className="pr-btn mt-1" onClick={() => irPara('caixa')}>Abrir Caixa de entrada</button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* funil */}
        <div className="pr-card pr-card-p">
          <div className="flex items-center gap-2 mb-2"><div className="pr-titulo flex-1">Funil</div>{vazio && <span className="pr-exemplo">EXEMPLO</span>}</div>
          {ETAPAS_FUNIL.map((e, i) => (
            <div key={e.chave} className="pr-funil-linha">
              <div>{e.rotulo}</div>
              <div className={`pr-barra ${i >= 4 ? 'ouro' : ''}`} role="img" aria-label={`${e.rotulo}: ${f[e.chave]}`}><span style={{ width: `${larguraBarra(f[e.chave], maximo)}%` }} /></div>
              <div className="pr-num text-right font-bold">{f[e.chave]}</div>
            </div>
          ))}
          <div className="text-[11px] pr-muted mt-2">{vazio ? 'Quando as empresas forem importadas e os e-mails saírem, o funil mostra o caminho de cada uma.' : `Resposta: ${pct(f.respondidas, f.enviadas)}% dos enviados · cotações: ${pct(f.cotacoes, f.enviadas)}%.`}</div>
        </div>

        {/* jornada */}
        <div className="pr-card pr-card-p">
          <div className="pr-titulo mb-2">Jornada: resposta por toque e por segmento</div>
          {envios.length === 0 ? <div className="text-sm pr-muted py-6 text-center">Ainda sem envios. Aqui aparece quantos e-mails saíram em cada toque e quanto cada um respondeu.</div> : (
            <>
              <table className="pr-tabela"><thead><tr><th>Toque</th><th>Enviados</th><th>Respostas</th><th>Úteis</th></tr></thead><tbody>
                {taxasToque.map((t) => <tr key={t.chave}><td><b>{t.chave}</b></td><td className="pr-num">{t.enviados}</td><td className="pr-num">{t.respostas} ({t.taxa}%)</td><td className="pr-num">{t.uteis} ({t.taxaUtil}%)</td></tr>)}
              </tbody></table>
              <table className="pr-tabela mt-3"><thead><tr><th>Segmento</th><th>Enviados</th><th>Respostas</th><th>Úteis</th></tr></thead><tbody>
                {taxasSeg.map((t) => <tr key={t.chave}><td><b>{t.chave}</b></td><td className="pr-num">{t.enviados}</td><td className="pr-num">{t.respostas} ({t.taxa}%)</td><td className="pr-num">{t.uteis} ({t.taxaUtil}%)</td></tr>)}
              </tbody></table>
            </>
          )}
        </div>
      </div>

      {/* relatorio da IA */}
      <div className="pr-card pr-card-p flex flex-col gap-2">
        <div className="flex items-center gap-2"><div className="pr-titulo flex-1">Último relatório da IA</div><button className="pr-btn" onClick={() => irPara('relatorios')}>Ver relatórios e experimentos</button></div>
        {ultimoRel ? (<><div className="text-xs pr-muted">Semana de {new Date(`${ultimoRel.semana_inicio}T12:00:00`).toLocaleDateString('pt-BR')} a {new Date(`${ultimoRel.semana_fim}T12:00:00`).toLocaleDateString('pt-BR')} · {ultimoRel.sugestoes.length} sugestão(ões)</div><div className="text-sm">{ultimoRel.resumo}</div></>)
          : <div className="text-sm pr-muted">O primeiro relatório sai na segunda-feira seguinte à ligação da IA, às 07:00.</div>}
      </div>

      {/* pesos da pontuacao */}
      <div className="pr-card pr-card-p flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap"><div className="pr-titulo flex-1">Pesos da pontuação (soma 100)</div>
          <span className={`pr-badge ${erroPesos ? 'vermelho' : 'verde'}`}>Soma {pesos.reduce((s, p) => s + (Number.isFinite(p.peso) ? p.peso : 0), 0)}</span></div>
        {!ehPedro && <div className="pr-aviso info">Só o usuário do Pedro altera os pesos; você pode ver os valores e o que cada um significa.</div>}
        <div className="grid md:grid-cols-2 gap-x-6 gap-y-2">
          {pesos.map((p, i) => (
            <div key={p.criterio} className="flex items-start gap-2">
              <div className="flex-1 min-w-0"><div className="text-xs font-bold">{p.rotulo}</div><div className="text-[11px] pr-muted">{DESCRICAO_PESO[p.criterio] ?? ''}</div>
                <div className="text-[11px] pr-muted">Atual {pesosOriginais[i]?.peso}{anteriores[p.criterio] != null ? ` · anterior ${anteriores[p.criterio]}` : ''}</div></div>
              <input className="pr-input pr-num" style={{ width: 70 }} inputMode="numeric" aria-label={`Peso de ${p.rotulo}`} disabled={!ehPedro} value={Number.isFinite(p.peso) ? p.peso : ''} onChange={(e) => setPesos(pesos.map((x, k) => (k === i ? { ...x, peso: e.target.value === '' ? NaN : Number(e.target.value.replace(/\D/g, '')) } : x)))} />
            </div>
          ))}
        </div>
        {erroPesos && ehPedro && alterados.length > 0 && <div className="pr-aviso bad">{erroPesos}</div>}
        {ehPedro && <div className="flex justify-end"><button className="pr-btn ouro" disabled={ocupado || alterados.length === 0 || !!erroPesos} onClick={() => setConfirma(true)}>Salvar pesos…</button></div>}
      </div>

      {confirma && (
        <Modal titulo="Salvar novos pesos" onFechar={() => { setConfirma(false); setTextoConfirma('') }} largura="max-w-md">
          <div className="text-sm">Alterar os pesos <b>recalcula a pontuação e a classe de todas as empresas</b>. Empresas podem mudar de classe (A, B ou C) e entrar ou sair da fila de envio.</div>
          <ul className="text-xs list-disc pl-5">{alterados.map((a) => <li key={a.criterio}>{a.rotulo}: {a.de} → <b>{a.para}</b></li>)}</ul>
          <div className="text-sm">Para confirmar, digite <b>RECALCULAR</b>.</div>
          <input className="border rounded-lg px-3 py-2 text-sm w-full" style={{ borderColor: 'var(--rbr-border)' }} value={textoConfirma} onChange={(e) => setTextoConfirma(e.target.value)} autoFocus />
          <div className="flex justify-end gap-2"><button className="pr-btn" onClick={() => setConfirma(false)}>Cancelar</button>
            <button className="pr-btn ouro" disabled={ocupado || textoConfirma !== 'RECALCULAR'} onClick={() => void rodar('Pesos salvos. As empresas foram recalculadas.', async () => {
              for (const a of alterados) { const { error } = await db.from('prospeccao_pesos').update({ peso: a.para }).eq('criterio', a.criterio); if (error) throw new Error(error.message) }
              await auditar('prospeccao_pesos_editados', { alterados: alterados.map((a) => ({ criterio: a.criterio, de: a.de, para: a.para })) })
              setConfirma(false); setTextoConfirma(''); await carregar()
            })}>Confirmar</button></div>
        </Modal>
      )}
    </div>
  )
}
