import { useCallback, useEffect, useState } from 'react'
import { useConfirmacao } from '../Confirmacao'
import { db } from '../../lib/prospeccaoDb'
import { pct } from '../../lib/prospeccaoPainel'
import './prospeccaoUi.css'

type Bloco = { enviados: number; respostas: number; uteis: number; agoraNao: number; descadastros: number; devolucoes: number }
type Sugestao = { id: string; titulo: string; campo: string; alvo: string; valor: unknown; motivo: string; evidencia: string; risco: string; teste: string; status: 'nova' | 'em_teste' | 'aceita' | 'recusada'; experimento_id?: string }
type Relatorio = { id: string; criado_em: string; semana_inicio: string; semana_fim: string; resumo: string | null; sugestoes: Sugestao[]; reversoes: { tipo: string; alvo: string; motivo: string }[]; metricas: { total?: Bloco; porToque?: Record<string, Bloco>; porTexto?: Record<string, Bloco>; porSegmento?: Record<string, Bloco>; custo_ia_brl?: number } }
type Experimento = { id: string; tipo: string; alvo: string; pct_envios: number; status: string; criado_em: string; motivo_decisao: string | null; variante: Record<string, unknown> }
const EXEMPLO: Relatorio = {
  id: 'exemplo', criado_em: new Date().toISOString(), semana_inicio: '2026-11-09', semana_fim: '2026-11-15', resumo: 'Exemplo: na semana foram enviados 40 e-mails, com 6 respostas e 3 úteis. O toque 2 respondeu mais que o toque 1.',
  metricas: { total: { enviados: 40, respostas: 6, uteis: 3, agoraNao: 2, descadastros: 1, devolucoes: 1 }, porToque: { toque1: { enviados: 28, respostas: 3, uteis: 1, agoraNao: 1, descadastros: 1, devolucoes: 1 }, toque2: { enviados: 12, respostas: 3, uteis: 2, agoraNao: 1, descadastros: 0, devolucoes: 0 } }, custo_ia_brl: 0.8 },
  sugestoes: [{ id: 'ex1', titulo: 'Testar assunto mais curto no toque 1', campo: 'assunto', alvo: 'toque1', valor: 'Frete de {segmento_legivel} (RBR Cargo)', motivo: 'O toque 1 responde menos que o toque 2.', evidencia: '3 respostas em 28 envios contra 3 em 12.', risco: 'Baixo: só 10% dos envios.', teste: 'Variante em 10% dos envios do toque 1 por 2 semanas.', status: 'nova' }], reversoes: [],
}
const NOME_CAMPO: Record<string, string> = { texto: 'Texto', assunto: 'Assunto', cadencia: 'Cadência', segmento: 'Segmento' }

/** Relatorios semanais da IA: numeros, projeto de mudanca (aceitar ou recusar) e experimentos em curso com resultado parcial. */
export default function Relatorios() {
  const [rels, setRels] = useState<Relatorio[] | null>(null)
  const [exps, setExps] = useState<(Experimento & { variante_enviados: number })[]>([])
  const [ehPedro, setEhPedro] = useState(false)
  const [aberto, setAberto] = useState<string | null>(null)
  const { confirmacao, rodar, ocupado } = useConfirmacao()

  const carregar = useCallback(async () => {
    const [r, x, p] = await Promise.all([
      db.from('prospeccao_relatorios').select('*').order('semana_inicio', { ascending: false }).limit(26),
      db.from('prospeccao_experimentos').select('*').order('criado_em', { ascending: false }).limit(30),
      db.rpc('prospeccao_eh_pedro'),
    ])
    setRels((r.data ?? []) as Relatorio[]); setEhPedro(p.data === true)
    const lista = (x.data ?? []) as Experimento[]
    const com = await Promise.all(lista.map(async (e) => {
      const { count } = await db.from('prospeccao_mensagens').select('id', { count: 'exact', head: true }).eq('experimento_id', e.id).eq('status', 'enviado')
      return { ...e, variante_enviados: count ?? 0 }
    }))
    setExps(com)
  }, [])
  useEffect(() => { void carregar() }, [carregar])

  const decidir = (rel: Relatorio, s: Sugestao, status: 'aceita' | 'recusada') => rodar(status === 'aceita' ? 'Sugestão aceita: o teste continua.' : 'Sugestão recusada: o teste foi encerrado.', async () => {
    const novas = rel.sugestoes.map((x) => (x.id === s.id ? { ...x, status } : x))
    const { error } = await db.from('prospeccao_relatorios').update({ sugestoes: novas }).eq('id', rel.id)
    if (error) throw new Error(error.message)
    if (status === 'recusada' && s.experimento_id) {
      const { error: e2 } = await db.from('prospeccao_experimentos').update({ status: 'encerrado', motivo_decisao: 'recusado pelo Pedro', decidido_em: new Date().toISOString() }).eq('id', s.experimento_id).eq('status', 'em_teste')
      if (e2) throw new Error(e2.message)
    }
    await carregar()
  })

  if (rels === null) return <div className="pr pr-card pr-card-p"><div className="pr-esq" style={{ width: '50%' }} /></div>
  const exemplo = rels.length === 0
  const lista = exemplo ? [EXEMPLO] : rels
  const emCurso = exps.filter((e) => e.status === 'em_teste')
  return (
    <div className="pr flex flex-col gap-3">
      {confirmacao}
      {exemplo && <div className="pr-aviso info flex gap-2 items-center"><span className="pr-exemplo">EXEMPLO</span> O primeiro relatório sai na segunda-feira seguinte à ligação da IA (07:00). Abaixo, um modelo de como ele aparece.</div>}
      <div className="pr-card pr-card-p flex flex-col gap-2">
        <div className="pr-titulo">Experimentos em curso (no máximo 10% dos envios, contra o padrão)</div>
        {emCurso.length === 0 ? <div className="text-sm pr-muted">Nenhum experimento em andamento. Eles nascem das sugestões do relatório semanal.</div> : (
          <table className="pr-tabela"><thead><tr><th>O que</th><th>Onde</th><th>Envios da variante</th><th>Início</th><th /></tr></thead><tbody>
            {emCurso.map((e) => (
              <tr key={e.id}><td><b>{NOME_CAMPO[e.tipo] ?? e.tipo}</b></td><td>{e.alvo}</td><td className="pr-num">{e.variante_enviados} <span className="pr-muted">(até {e.pct_envios}%)</span></td><td>{new Date(e.criado_em).toLocaleDateString('pt-BR')}</td>
                <td className="text-right">{ehPedro && <button className="pr-btn" disabled={ocupado} onClick={() => void rodar('Experimento encerrado.', async () => { const { error } = await db.from('prospeccao_experimentos').update({ status: 'encerrado', motivo_decisao: 'encerrado pelo Pedro', decidido_em: new Date().toISOString() }).eq('id', e.id); if (error) throw new Error(error.message); await carregar() })}>Encerrar</button>}</td></tr>
            ))}
          </tbody></table>
        )}
        {exps.filter((e) => e.status !== 'em_teste').length > 0 && (
          <details className="text-xs"><summary className="cursor-pointer pr-muted">Histórico de experimentos</summary>
            {exps.filter((e) => e.status !== 'em_teste').map((e) => <div key={e.id} className="py-0.5"><span className={`pr-badge ${e.status === 'vencedor' ? 'verde' : e.status === 'revertido' ? 'vermelho' : ''}`}>{e.status}</span> {NOME_CAMPO[e.tipo] ?? e.tipo} em {e.alvo}{e.motivo_decisao ? ` — ${e.motivo_decisao}` : ''}</div>)}
          </details>
        )}
      </div>

      {lista.map((r) => {
        const t = r.metricas.total
        const aberta = aberto === r.id || (aberto === null && r === lista[0])
        return (
          <div key={r.id} className="pr-card pr-card-p flex flex-col gap-3">
            <div className="flex items-center gap-2 flex-wrap cursor-pointer" onClick={() => setAberto(aberta ? '-' : r.id)}>
              <div className="font-bold text-sm flex-1">Semana de {new Date(`${r.semana_inicio}T12:00:00`).toLocaleDateString('pt-BR')} a {new Date(`${r.semana_fim}T12:00:00`).toLocaleDateString('pt-BR')}{r.id === 'exemplo' && <span className="pr-exemplo ml-2">EXEMPLO</span>}</div>
              {t && <span className="text-xs pr-muted pr-num">{t.enviados} enviados · {t.respostas} respostas ({pct(t.respostas, t.enviados)}%) · {t.uteis} úteis</span>}
              {r.reversoes.length > 0 && <span className="pr-badge vermelho">{r.reversoes.length} reversão(ões)</span>}
              <span className="pr-btn">{aberta ? 'Fechar' : 'Abrir'}</span>
            </div>
            {aberta && (
              <>
                {r.resumo && <div className="text-sm">{r.resumo}</div>}
                {r.reversoes.length > 0 && <div className="pr-aviso bad"><b>Experimentos revertidos para o padrão:</b> {r.reversoes.map((x) => `${NOME_CAMPO[x.tipo] ?? x.tipo} em ${x.alvo} (${x.motivo})`).join('; ')}</div>}
                {r.metricas.porToque && (
                  <table className="pr-tabela"><thead><tr><th>Por toque</th><th>Enviados</th><th>Respostas</th><th>Úteis</th><th>Agora não</th><th>Descadastros</th><th>Devoluções</th></tr></thead><tbody>
                    {Object.entries(r.metricas.porToque).map(([k, b]) => <tr key={k}><td><b>{k}</b></td><td className="pr-num">{b.enviados}</td><td className="pr-num">{b.respostas} ({pct(b.respostas, b.enviados)}%)</td><td className="pr-num">{b.uteis}</td><td className="pr-num">{b.agoraNao}</td><td className="pr-num">{b.descadastros}</td><td className="pr-num">{b.devolucoes}</td></tr>)}
                  </tbody></table>
                )}
                {r.metricas.custo_ia_brl != null && <div className="text-xs pr-muted">Custo de IA na semana: R$ {Number(r.metricas.custo_ia_brl).toFixed(2)}</div>}
                <div className="pr-titulo">Projeto de mudança</div>
                {r.sugestoes.length === 0 ? <div className="text-sm pr-muted">Nenhuma mudança sugerida nesta semana.</div> : r.sugestoes.map((s) => (
                  <div key={s.id} className="pr-sugestao flex flex-col gap-1.5">
                    <div className="flex items-center gap-2 flex-wrap"><b className="text-sm flex-1">{s.titulo}</b><span className="pr-badge">{NOME_CAMPO[s.campo] ?? s.campo} · {s.alvo}</span>
                      <span className={`pr-badge ${s.status === 'aceita' ? 'verde' : s.status === 'recusada' ? 'vermelho' : s.status === 'em_teste' ? 'ouro' : ''}`}>{{ nova: 'Nova', em_teste: 'Em teste', aceita: 'Aceita', recusada: 'Recusada' }[s.status]}</span></div>
                    <div className="text-xs"><b>Motivo:</b> {s.motivo}</div><div className="text-xs"><b>Evidência:</b> {s.evidencia}</div><div className="text-xs"><b>Risco:</b> {s.risco}</div><div className="text-xs"><b>Teste proposto:</b> {s.teste}</div>
                    {typeof s.valor === 'string' && <div className="text-xs whitespace-pre-wrap pr-muted"><b>Novo valor:</b> {s.valor}</div>}
                    {r.id !== 'exemplo' && ehPedro && (s.status === 'nova' || s.status === 'em_teste') && (
                      <div className="flex gap-2"><button className="pr-btn ouro" disabled={ocupado} onClick={() => void decidir(r, s, 'aceita')}>Aceitar</button><button className="pr-btn perigo" disabled={ocupado} onClick={() => void decidir(r, s, 'recusada')}>Recusar</button></div>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
