import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@rbr/shared/supabaseClient'
import { formatMoney, STATUS_OPERACAO_LABEL } from '@rbr/shared/format'
import FrotaMap, { type FrotaMapPonto } from '@rbr/shared/FrotaMap'
import { COR_SINAL, type CargaMapa } from '../components/mapa/MapaOperacional'
import { haQuanto } from '../components/inicio/util'
import { faixaDaMargem } from '../components/cotacao/PrecoVisual'

// Início de cada função (visuais Inicio-Operacao, Inicio-Fiscal e Vendedor-Inicio). Só apresentação: os números vêm das mesmas
// tabelas que as outras telas leem, e o banco (RLS) decide o que cada pessoa enxerga. Metas: o desenho mostra progresso, mas
// ainda não há apuração dos indicadores; a barra aparece sem preenchimento e com o aviso.
type Op = { id: string; status: string; cotacao_id: string | null; cliente_id: string | null; coleta_prevista: string | null; pessoa_alocada_id: string | null; liberada_em: string | null }
type Cot = { id: string; status: string; cidade_origem: string | null; cidade_destino: string | null; origem: string; valor_total: number | null; margem_ajustada: number | null; cliente_id: string | null; created_at: string; updated_at: string }
type Cli = { id: string; razao_social: string | null; nome_fantasia: string | null }
type Meta = { funcao: string; descricao: string | null; indicador: string; valor_meta: number | null; ativa: boolean }

const ENCERRADAS = ['fechada', 'cancelada', 'finalizada', 'entregue']
const EM_VIAGEM = ['liberada_coleta', 'carregando', 'em_transito', 'em_viagem']

const card = 'bg-white border rounded-2xl'
const borda = { borderColor: 'var(--rbr-border)' }

function Kpi({ rotulo, valor, nota, cor }: { rotulo: string; valor: string | number; nota?: string; cor?: string }) {
  return (
    <div className={`${card} px-4 py-3`} style={borda}>
      <div className="text-[11px] font-semibold" style={{ color: 'var(--rbr-muted)' }}>
        {rotulo}
      </div>
      <div className="text-[30px] leading-tight font-extrabold tabular-nums" style={{ color: cor ?? 'var(--rbr-navy-dark)' }}>
        {valor}
      </div>
      {nota && (
        <div className="text-[11px]" style={{ color: 'var(--rbr-muted)' }}>
          {nota}
        </div>
      )}
    </div>
  )
}

function Metas({ metas, funcao }: { metas: Meta[]; funcao: string }) {
  const minhas = metas.filter((m) => m.funcao === funcao)
  return (
    <div className={`${card} px-4 py-3 flex flex-col gap-2`} style={borda}>
      <div className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: 'var(--rbr-muted)' }}>
        SUAS METAS
      </div>
      {minhas.length === 0 ? (
        <div className="text-[12px]" style={{ color: 'var(--rbr-muted)' }}>
          Nenhuma meta definida para esta função ainda.
        </div>
      ) : (
        minhas.map((m) => (
          <div key={m.indicador} className="flex flex-col gap-1" style={{ opacity: m.ativa ? 1 : 0.6 }}>
            <div className="flex justify-between text-[12px]">
              <span className="font-semibold">{m.descricao ?? m.indicador}</span>
              <span style={{ color: 'var(--rbr-muted)' }}>meta {m.valor_meta ?? '—'}{m.ativa ? '' : ' · desligada'}</span>
            </div>
            <div className="h-1.5 rounded-full" style={{ background: '#e9ecf4' }} />
          </div>
        ))
      )}
      <div className="text-[10px]" style={{ color: '#8a91ad' }}>
        Apuração dos indicadores ainda não disponível. O gestor define e liga as metas.
      </div>
    </div>
  )
}

function Mapa({ cargas, rotuloPonto }: { cargas: CargaMapa[]; rotuloPonto: (c: CargaMapa) => string }) {
  const pontos = useMemo<FrotaMapPonto[]>(
    () =>
      cargas
        .filter((c) => c.ultima)
        .map((c) => ({
          id: `c:${c.id}`,
          lat: Number(c.ultima!.lat),
          lng: Number(c.ultima!.lng),
          nome: rotuloPonto(c),
          subtitulo: c.placa ?? undefined,
          capturadoEm: c.ultima!.em,
          fonte: c.ultima!.fonte === 'wialon' ? 'wialon' : 'app_celular',
          cor: COR_SINAL[c.sinal ?? 'sem'] ?? COR_SINAL.sem,
        })),
    [cargas, rotuloPonto],
  )
  return (
    <div className="relative rounded-[20px] overflow-hidden border h-[360px]" style={{ ...borda, background: '#e4e9f3' }}>
      <FrotaMap pontos={pontos} tema="claro" height="100%" mostrarVazio rolagem selecionadoId={null} onSelecionar={() => {}} linhas={[]} />
    </div>
  )
}

export default function InicioFuncao({ funcao, nome }: { funcao: 'operacao' | 'fiscal' | 'comercial'; nome?: string }) {
  const nav = useNavigate()
  const [ops, setOps] = useState<Op[] | null>(null)
  const [cots, setCots] = useState<Cot[]>([])
  const [clis, setClis] = useState<Map<string, string>>(new Map())
  const [metas, setMetas] = useState<Meta[]>([])
  const [cargas, setCargas] = useState<CargaMapa[]>([])
  const [paraFinalizar, setParaFinalizar] = useState(0)
  useEffect(() => {
    void supabase.from('operacoes').select('id', { count: 'exact', head: true }).eq('status', 'entregue').eq('eh_teste', false).is('deleted_at', null).then(({ count }) => setParaFinalizar(count ?? 0))
  }, [])

  useEffect(() => {
    let vivo = true
    void (async () => {
      const [o, c, m, mp] = await Promise.all([
        supabase.from('operacoes').select('id, status, cotacao_id, cliente_id, coleta_prevista, pessoa_alocada_id, liberada_em').not('status', 'in', `(${ENCERRADAS.join(',')})`).is('deleted_at', null).eq('eh_teste', false).limit(300),
        supabase.from('cotacoes').select('id, status, cidade_origem, cidade_destino, origem, valor_total, margem_ajustada, cliente_id, created_at, updated_at').in('status', ['rascunho', 'enviada', 'convertida', 'perdida']).is('cancelada_em', null).eq('eh_teste', false).order('updated_at', { ascending: false }).limit(300),
        supabase.from('metas' as never).select('funcao, descricao, indicador, valor_meta, ativa'),
        supabase.rpc('mapa_operacional'),
      ])
      if (!vivo) return
      const listaOps = (o.data ?? []) as unknown as Op[]
      const listaCots = (c.data ?? []) as unknown as Cot[]
      const ids = [...new Set([...listaOps.map((x) => x.cliente_id), ...listaCots.map((x) => x.cliente_id)].filter((x): x is string => !!x))]
      const cl = ids.length ? (((await supabase.from('clientes').select('id, razao_social, nome_fantasia').in('id', ids)).data ?? []) as unknown as Cli[]) : []
      if (!vivo) return
      setClis(new Map(cl.map((k) => [k.id, k.nome_fantasia || k.razao_social || 'Cliente'])))
      setOps(listaOps)
      setCots(listaCots)
      setMetas((m.data ?? []) as unknown as Meta[])
      if (!mp.error) setCargas(((mp.data as unknown as { cargas: CargaMapa[] })?.cargas ?? []).filter((x) => x.status !== 'alocando_motorista'))
    })()
    return () => {
      vivo = false
    }
  }, [])

  const hora = new Date().getHours()
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'
  const primeiro = (nome ?? '').split(' ')[0]
  const lista = ops ?? []
  const porCot = new Map(cots.map((k) => [k.id, k]))
  const rota = (k?: Cot) => (k ? `${k.cidade_origem ?? k.origem} → ${k.cidade_destino ?? '—'}` : '—')
  const quando = (iso: string | null) => {
    if (!iso) return 'sem data de coleta'
    return new Date(iso).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
  }
  const maisProxima = (xs: Op[]) => [...xs].filter((x) => x.coleta_prevista).sort((a, b) => Date.parse(a.coleta_prevista!) - Date.parse(b.coleta_prevista!))[0]
  const porUrgencia = (xs: Op[]) => [...xs].sort((a, b) => Date.parse(a.coleta_prevista ?? '9999') - Date.parse(b.coleta_prevista ?? '9999'))
  const cab = (sub: React.ReactNode, botao: React.ReactNode) => (
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div>
        <h1 className="text-[30px] leading-[1.1] text-[color:var(--rbr-navy-dark)]">
          {saudacao}
          {primeiro ? `, ${primeiro}` : ''}
        </h1>
        <div className="text-[13px] mt-1.5" style={{ color: '#4a5275' }}>
          {ops === null ? 'Carregando…' : sub}
        </div>
      </div>
      {botao}
    </div>
  )
  const botaoPrincipal = (rotulo: string, para: string, cor = '#1c2559') => (
    <Link to={para} className="text-[14px] font-extrabold px-5 py-3 rounded-xl text-white" style={{ background: cor }}>
      {rotulo}
    </Link>
  )
  const linhaLista = (titulo: string, sub: string, acao: React.ReactNode, destaque?: boolean) => (
    <div key={titulo + sub} className="flex items-center justify-between gap-3 px-4 py-3" style={{ borderTop: '1px solid #eef0f5', background: destaque ? '#fff7f6' : undefined }}>
      <div className="min-w-0">
        <div className="text-[15px] font-extrabold truncate">{titulo}</div>
        <div className="text-[12px] truncate" style={{ color: 'var(--rbr-muted)' }}>
          {sub}
        </div>
      </div>
      {acao}
    </div>
  )
  const btn = (rotulo: string, para: string, cheio: boolean) => (
    <button type="button" onClick={() => nav(para)} className="text-[12px] font-extrabold px-4 py-2 rounded-[10px] flex-shrink-0" style={cheio ? { background: '#1c2559', color: '#fff' } : { background: '#fff', color: '#1c2559', border: '1px solid var(--rbr-border)' }}>
      {rotulo}
    </button>
  )
  const cabLista = (titulo: string, nota: string) => (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: 'var(--rbr-muted)' }}>
        {titulo}
      </span>
      <span className="text-[11px]" style={{ color: 'var(--rbr-muted)' }}>
        {nota}
      </span>
    </div>
  )

  if (funcao === 'operacao') {
    const paraAssumir = lista.filter((x) => x.status === 'aguardando_assumir')
    const devolvidas = lista.filter((x) => x.status === 'devolvida_pelo_fiscal')
    const emViagem = lista.filter((x) => EM_VIAGEM.includes(x.status) && x.status !== 'liberada_coleta')
    const semSinal = cargas.filter((c) => c.sinal === 'alerta')
    const incompletas = porUrgencia(lista.filter((x) => !x.pessoa_alocada_id && !['aguardando_assumir'].includes(x.status)))
    const prox = maisProxima(paraAssumir)
    const contar = (...st: string[]) => lista.filter((x) => st.includes(x.status)).length
    const coletaViagem = lista.filter((x) => ['liberada_coleta', 'carregando', 'em_transito', 'em_viagem', 'finalizando'].includes(x.status))
    return (
      <div className="flex flex-col gap-3.5">
        {cab(
          <>
            <b style={{ color: 'var(--rbr-navy-dark)' }}>{devolvidas.length === 1 ? '1 devolvida pelo fiscal.' : `${devolvidas.length} devolvidas pelo fiscal.`}</b> O mapa mostra as viagens da Operação.
          </>,
          botaoPrincipal('Assumir a mais urgente', '/operacoes?fila=para_assumir'),
        )}
        {devolvidas[0] && (
          <div className="rounded-xl px-4 py-2.5 text-[13px] flex items-center justify-between gap-3" style={{ background: '#fbe3e1', color: '#7d1a12', border: '1px solid #f2c4c0' }}>
            <span><b>Devolvida pelo fiscal:</b> {clis.get(devolvidas[0].cliente_id ?? '') ?? 'Cliente'}. O motivo está no aviso.</span>
            <Link to={`/operacoes?op=${devolvidas[0].id}`} className="font-extrabold">Corrigir →</Link>
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-4">
          <Kpi rotulo="Para assumir" valor={paraAssumir.length} cor="#7a5200" nota={prox ? `coleta mais próxima: ${quando(prox.coleta_prevista)}` : 'nada esperando'} />
          <Kpi rotulo="Devolvidas" valor={devolvidas.length} cor="#b42318" nota="corrigir e reenviar" />
          <Kpi rotulo="Em viagem" valor={emViagem.length} nota={semSinal.length ? `${semSinal.length} sem sinal` : 'sem atrasos de sinal'} />
          <Kpi rotulo="Para finalizar" valor={paraFinalizar} cor="#1a6b3c" nota="entregues, esperando finalizar" />
        </div>
        <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
          <div className="flex flex-col gap-3.5 min-w-0">
            <Mapa cargas={cargas} rotuloPonto={(c) => `${c.origem} → ${c.destino}`} />
            <div className={`${card} overflow-hidden`} style={borda}>
              {cabLista(`COLETA E VIAGEM · ${coletaViagem.length}`, 'carregando e finalizados primeiro')}
              {coletaViagem.length === 0 ? (
                <div className="px-4 py-5 text-[13px]" style={{ color: 'var(--rbr-muted)', borderTop: '1px solid #eef0f5' }}>Nenhuma coleta ou viagem agora.</div>
              ) : (
                coletaViagem.slice(0, 6).map((x) => {
                  const k = x.cotacao_id ? porCot.get(x.cotacao_id) : undefined
                  return linhaLista(clis.get(x.cliente_id ?? '') ?? 'Cliente', `${rota(k)} · ${STATUS_OPERACAO_LABEL[x.status] ?? x.status}`, btn(x.status === 'finalizando' ? 'Ver' : 'Abrir', `/operacoes?op=${x.id}`, x.status === 'carregando'))
                })
              )}
            </div>
            <div className={`${card} overflow-hidden`} style={borda}>
              {cabLista(`PARA COMPLETAR · ${incompletas.length}`, 'mais urgentes primeiro')}
              {incompletas.length === 0 ? (
                <div className="px-4 py-5 text-[13px]" style={{ color: 'var(--rbr-muted)', borderTop: '1px solid #eef0f5' }}>Nada para completar.</div>
              ) : (
                incompletas.slice(0, 6).map((x) => {
                  const k = x.cotacao_id ? porCot.get(x.cotacao_id) : undefined
                  return linhaLista(clis.get(x.cliente_id ?? '') ?? 'Cliente', `${rota(k)} · coleta ${quando(x.coleta_prevista)}`, btn('Abrir', `/operacoes?op=${x.id}`, false))
                })
              )}
            </div>
          </div>
          <div className={`${card} overflow-hidden`} style={borda}>
            <div className="px-4 py-3 text-[11px] font-extrabold tracking-[0.08em]" style={{ color: 'var(--rbr-muted)' }}>
              PRECISA DE VOCÊ
            </div>
            {devolvidas.slice(0, 3).map((x) => {
              const k = x.cotacao_id ? porCot.get(x.cotacao_id) : undefined
              return linhaLista('Devolvida pelo fiscal', `${clis.get(x.cliente_id ?? '') ?? 'Cliente'} · ${rota(k)}`, btn('Corrigir', `/operacoes?op=${x.id}`, true))
            })}
            {paraAssumir.length > 0 && linhaLista(`${paraAssumir.length} para assumir`, prox ? `a primeira coleta é ${quando(prox.coleta_prevista)}` : 'sem data de coleta', btn('Assumir', '/operacoes?fila=para_assumir', true))}
            {semSinal.slice(0, 3).map((c) => linhaLista(`${c.origem} → ${c.destino} sem sinal`, c.ultima ? `última posição ${haQuanto(c.ultima.em)}` : 'sem posição', null))}
            {devolvidas.length + paraAssumir.length + semSinal.length === 0 && <div className="px-4 py-6 text-[13px]" style={{ color: 'var(--rbr-muted)', borderTop: '1px solid #eef0f5' }}>Nada precisa de você agora.</div>}
            <div className="px-4 py-3 text-[11px] font-bold" style={{ color: '#1c2559', borderTop: '1px solid #eef0f5' }}>
              Só o gestor vê o ranking da equipe
            </div>
          </div>
          <div className={`${card} p-4 flex flex-col gap-2`} style={borda}>
            <div className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: 'var(--rbr-muted)' }}>COM OUTRAS PESSOAS</div>
            {[
              ['No fiscal', contar('aguardando_liberacao_fiscal', 'em_emissao')],
              ['Esperando o gestor liberar a ordem', contar('aguardando_liberacao_gestor')],
              ['Pausada por alteração', contar('pausada_por_alteracao')],
            ].map(([r, n]) => (
              <div key={r as string} className="flex justify-between text-[13px]"><span>{r}</span><b>{n}</b></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (funcao === 'fiscal') {
    const prontas = porUrgencia(lista.filter((x) => x.status === 'aguardando_liberacao_fiscal'))
    const emissao = lista.filter((x) => x.status === 'em_emissao' || x.status === 'devolvida_pelo_fiscal')
    const hoje = new Date().toDateString()
    const concluidasHoje = lista.filter((x) => x.liberada_em && new Date(x.liberada_em).toDateString() === hoje)
    const prox = maisProxima(prontas)
    return (
      <div className="flex flex-col gap-3.5">
        {cab(
          <>
            <b style={{ color: 'var(--rbr-navy-dark)' }}>{prontas.length === 1 ? '1 operação pronta para emitir.' : `${prontas.length} operações prontas para emitir.`}</b> {emissao.length > 0 ? 'Há etapa em emissão para acompanhar.' : 'Nenhuma etapa em emissão.'}
          </>,
          botaoPrincipal('Abrir a mais urgente', prontas[0] ? `/fiscal?op=${prontas[0].id}` : '/fiscal'),
        )}
        <div className="grid gap-3 md:grid-cols-3">
          <Kpi rotulo="Prontas para emitir" valor={prontas.length} cor="#7a5200" nota={prox ? `coleta mais próxima: ${quando(prox.coleta_prevista)}` : 'nada esperando'} />
          <Kpi rotulo="Em emissão" valor={emissao.length} cor="#b42318" nota={emissao.length ? 'acompanhe a etapa seguinte' : 'nenhuma agora'} />
          <Kpi rotulo="Concluídas hoje" valor={concluidasHoje.length} cor="#1a6b3c" nota="liberadas para a coleta" />
        </div>
        <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
          <div className="flex flex-col gap-3.5 min-w-0">
            <div className={`${card} overflow-hidden`} style={borda}>
              {cabLista(`PRONTAS PARA EMITIR · ${prontas.length}`, 'coleta mais próxima primeiro')}
              {prontas.length === 0 ? (
                <div className="px-4 py-5 text-[13px]" style={{ color: 'var(--rbr-muted)', borderTop: '1px solid #eef0f5' }}>Nada pronto para emitir.</div>
              ) : (
                prontas.slice(0, 6).map((x, i) => {
                  const k = x.cotacao_id ? porCot.get(x.cotacao_id) : undefined
                  return linhaLista(clis.get(x.cliente_id ?? '') ?? 'Cliente', `${rota(k)} · ${quando(x.coleta_prevista)}`, btn('Abrir', `/fiscal?op=${x.id}`, i === 0))
                })
              )}
            </div>
            <div className={`${card} overflow-hidden`} style={borda}>
              {cabLista(`EM EMISSÃO · ${emissao.length}`, 'etapa seguinte')}
              {emissao.length === 0 ? (
                <div className="px-4 py-5 text-[13px]" style={{ color: 'var(--rbr-muted)', borderTop: '1px solid #eef0f5' }}>Nenhuma em emissão.</div>
              ) : (
                emissao.slice(0, 6).map((x) => {
                  const k = x.cotacao_id ? porCot.get(x.cotacao_id) : undefined
                  const dev = x.status === 'devolvida_pelo_fiscal'
                  return linhaLista(clis.get(x.cliente_id ?? '') ?? 'Cliente', `${rota(k)} · ${STATUS_OPERACAO_LABEL[x.status] ?? x.status}`, btn(dev ? 'Ver' : 'Continuar', `/fiscal?op=${x.id}`, false), dev)
                })
              )}
            </div>
          </div>
          <div className="flex flex-col gap-3.5">
            <div className={`${card} p-4 flex flex-col gap-3`} style={borda}>
              <div className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: 'var(--rbr-muted)' }}>
                VIAGENS COM DOCUMENTO PENDENTE
              </div>
              <Mapa cargas={cargas} rotuloPonto={(c) => `${c.destino} · ${STATUS_OPERACAO_LABEL[c.status] ?? c.status}`} />
            </div>
            <Metas metas={metas} funcao="fiscal" />
          </div>
        </div>
      </div>
    )
  }

  // comercial
  const mesAtual = new Date().toISOString().slice(0, 7)
  const enviadas = cots.filter((k) => k.status === 'enviada')
  const aprovadasMes = cots.filter((k) => k.status === 'convertida' && k.updated_at.startsWith(mesAtual))
  const decididas = cots.filter((k) => k.status === 'convertida' || k.status === 'perdida')
  const taxa = decididas.length ? Math.round((cots.filter((k) => k.status === 'convertida').length / decididas.length) * 100) : null
  const vendidoMes = aprovadasMes.reduce((a, k) => a + Number(k.valor_total ?? 0), 0)
  const metaVendas = metas.find((m) => m.funcao === 'vendas' && m.valor_meta)?.valor_meta ?? null
  const dias = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  const paradas = enviadas.filter((k) => dias(k.updated_at) > 3).length
  const cobrar = [...enviadas].sort((a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at))
  const minhasOps = lista.slice(0, 8)
  return (
    <div className="flex flex-col gap-3.5">
      {cab(
        <>
          <b style={{ color: 'var(--rbr-navy-dark)' }}>{paradas === 1 ? '1 cotação está sem resposta há mais de 3 dias.' : `${paradas} cotações estão sem resposta há mais de 3 dias.`}</b>
          {metaVendas ? ` Faltam ${formatMoney(Math.max(0, Number(metaVendas) - vendidoMes))} para a meta do mês.` : ''}
        </>,
        botaoPrincipal('+ Nova cotação', '/cotacao', '#b8863b'),
      )}
      <div className="grid gap-3 md:grid-cols-4">
        <Kpi rotulo="Aguardando resposta" valor={enviadas.length} />
        <Kpi rotulo="Aprovadas no mês" valor={aprovadasMes.length} />
        <Kpi rotulo="Taxa de aprovação" valor={taxa == null ? '—' : `${taxa}%`} />
        <div className={`${card} px-4 py-3 flex flex-col gap-2`} style={borda}>
          <div className="flex items-baseline justify-between text-[12px]">
            <span style={{ color: 'var(--rbr-muted)' }}>Meta do mês</span>
            <span>
              <b className="text-[18px] font-extrabold">{formatMoney(vendidoMes)}</b> {metaVendas ? `de ${formatMoney(Number(metaVendas))}` : ''}
            </span>
          </div>
          <div className="h-2 rounded-full" style={{ background: '#e9ecf4' }}>
            <div className="h-2 rounded-full" style={{ width: `${metaVendas ? Math.min(100, (vendidoMes / Number(metaVendas)) * 100) : 0}%`, background: '#1c2559' }} />
          </div>
          {!metaVendas && <div className="text-[10px]" style={{ color: '#8a91ad' }}>Meta de vendas ainda não definida pelo gestor.</div>}
        </div>
      </div>
      <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] items-start">
        <div className={`${card} overflow-hidden`} style={borda}>
          {cabLista('PARA COBRAR HOJE', 'suas cotações enviadas')}
          {cobrar.length === 0 ? (
            <div className="px-4 py-6 text-[13px]" style={{ color: 'var(--rbr-muted)', borderTop: '1px solid #eef0f5' }}>Nenhuma cotação aguardando resposta.</div>
          ) : (
            cobrar.slice(0, 8).map((k) => {
              const d = dias(k.updated_at)
              const cor = d > 3 ? '#d64545' : d >= 1 ? '#e0a21c' : '#1a9b57'
              const f = faixaDaMargem(k.margem_ajustada)
              const preco = f.nome === 'verde' ? 'Preço bom' : f.nome === 'amarelo' ? 'Preço médio' : f.nome === 'vermelho' ? 'Preço baixo' : null
              return (
                <div key={k.id} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: '1px solid #eef0f5' }}>
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cor }} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-extrabold truncate">
                      {clis.get(k.cliente_id ?? '') ?? 'Cliente'} · {rota(k)}
                    </div>
                    <div className="text-[12px]" style={{ color: 'var(--rbr-muted)' }}>
                      enviada há {d} {d === 1 ? 'dia' : 'dias'} · {formatMoney(k.valor_total)}
                    </div>
                  </div>
                  {preco && (
                    <span className="text-[11px] font-extrabold rounded-full px-2.5 py-1 hidden sm:inline" style={{ background: f.fundo, color: f.cor }}>
                      ● {preco}
                    </span>
                  )}
                  <button type="button" disabled title="Ainda não disponível: o lembrete ao cliente não existe no sistema" className="text-[12px] font-extrabold px-4 py-2 rounded-[10px] opacity-50 cursor-not-allowed" style={{ background: '#1c2559', color: '#fff' }}>
                    Enviar lembrete
                  </button>
                  {btn('Abrir', '/cotacao', false)}
                </div>
              )
            })
          )}
          <div className="flex items-center gap-4 px-4 py-3 text-[11px]" style={{ color: 'var(--rbr-muted)', borderTop: '1px solid #eef0f5' }}>
            {[
              ['#d64545', 'parada há mais de 3 dias'],
              ['#e0a21c', '1 a 3 dias'],
              ['#1a9b57', 'recente'],
            ].map(([c, t]) => (
              <span key={t} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: c }} />
                {t}
              </span>
            ))}
          </div>
        </div>
        <div className={`${card} p-4 flex flex-col gap-3`} style={borda}>
          <div className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: 'var(--rbr-muted)' }}>
            MINHAS OPERAÇÕES
          </div>
          {minhasOps.length === 0 ? (
            <div className="text-[13px]" style={{ color: 'var(--rbr-muted)' }}>Nenhuma operação sua em andamento.</div>
          ) : (
            minhasOps.map((x) => {
              const k = x.cotacao_id ? porCot.get(x.cotacao_id) : undefined
              return (
                <div key={x.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[14px] font-extrabold truncate">{rota(k)}</div>
                    <div className="text-[12px]" style={{ color: 'var(--rbr-muted)' }}>
                      {formatMoney(k?.valor_total ?? null)}
                    </div>
                  </div>
                  <span className="text-[11px] font-extrabold rounded-full px-3 py-1.5 whitespace-nowrap" style={{ background: '#eef0fa', color: '#1c2559' }}>
                    {STATUS_OPERACAO_LABEL[x.status] ?? x.status}
                  </span>
                </div>
              )
            })
          )}
          <div className="text-[12px] rounded-xl px-3 py-2.5 mt-auto" style={{ background: '#f3f5f9', color: 'var(--rbr-muted)' }}>
            Você acompanha o andamento, mas a operação e o fiscal são feitos pela equipe.
          </div>
        </div>
      </div>
    </div>
  )
}
