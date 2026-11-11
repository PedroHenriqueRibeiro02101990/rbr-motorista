import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { NSPEDAGIO_HABILITADO } from '../../lib/efreteFlags'
import { mensagemClara } from '../../lib/mensagemClara'
import {
  ROTULO_ESTADO_VPO,
  deuCerto,
  estadoVpo,
  pendenciaVpo,
  podeCancelar,
  podeComprar,
  registroDePassos,
  registroEmJson,
  type RequisicaoVpo,
} from '../../lib/vpoPassos'
import { acompanharRecibo, type RespostaAcompanhamento } from '../../lib/vpoAcompanhar'
import { seloVale, type FormularioVale } from '../../lib/modoDemonstracao'
import { faltamCaracteres, motivoValido } from '../../lib/ciotCartao'
import { FaixaFixa, Modal } from './CartaoCiot'

// Vale-pedágio (VPO) pelo NSPEDAGIO, ligado à operação (Edge Function nspedagio-vpo, só gestor, só homologação).
// Aqui só se chama a função (nunca o NSPEDAGIO direto). Sem as credenciais no Vault a função responde com o provedor
// SIMULADO, e o cartão avisa. O "Registro de passos" lê vpo_requisicoes (uma linha por chamada).

type Resposta = { ok: boolean; erro?: string; simulado?: boolean; ambiente?: string; dados?: unknown; repetida?: boolean; em_processamento?: boolean; situacao?: RespostaAcompanhamento['situacao']; aviso?: string; semResposta?: boolean }

async function chamar(body: Record<string, unknown>): Promise<Resposta> {
  const { data, error } = await supabase.functions.invoke<Resposta>('nspedagio-vpo', { body })
  if (error) {
    const ctx = (error as { context?: Response }).context
    const corpo = ctx ? ((await ctx.json().catch(() => null)) as Resposta | null) : null
    // Sem corpo = a resposta não voltou (cortada pelo tempo). A compra/cancelamento pode ter seguido no NSPEDAGIO.
    return corpo ? { ...corpo, ok: false, erro: corpo.erro ?? 'Não consegui falar com o servidor agora. Tente de novo em instantes.' } : { ok: false, semResposta: true, erro: 'Não consegui falar com o servidor agora. Tente de novo em instantes.' }
  }
  return data ?? { ok: false, erro: 'O servidor não respondeu. Tente de novo em instantes.' }
}

// Placa que já passou na consulta de tag e na compra em homologação (ConectCar/Veloe ativos, 2 eixos).
const PLACA_TAG_TESTE = 'GYI1732'
const soDigitos = (v: string) => v.replace(/\D/g, '')
const aaaammdd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '')
const emDias = (n: number) => new Date(Date.now() + n * 86_400_000)

// demo = modo de demonstração: dados da rota sempre à vista, placa de teste (GYI1732) já preenchida e aviso de espera de 1 a 3 minutos.
// inicial: valores de partida do formulário na demonstração (vêm da operação); onDados devolve o que o formulário tem agora, para a tabela "Dado enviado" ler a MESMA fonte.
export type PropsCartaoVpo = { operacaoId: string; ehTeste: boolean; placa?: string | null; onMudou?: () => void; demo?: boolean; onSimulacao?: (resumo: string | null) => void; onPlaca?: (placa: string) => void; inicial?: Partial<FormularioVale>; onDados?: (f: FormularioVale) => void }
export default function CartaoVpo(props: PropsCartaoVpo) {
  if (!NSPEDAGIO_HABILITADO) return null
  return <CartaoVpoAtivo key={props.operacaoId} {...props} />
}

function CartaoVpoAtivo({ operacaoId, ehTeste, placa, onMudou, demo, onSimulacao, onPlaca, inicial, onDados }: PropsCartaoVpo) {
  const [reqs, setReqs] = useState<RequisicaoVpo[] | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [simulado, setSimulado] = useState<boolean | null>(null)
  const [resumoSim, setResumoSim] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const [novaPlaca, setNovaPlaca] = useState('')
  const [confirmandoCompra, setConfirmandoCompra] = useState(false)
  const [cancelandoVale, setCancelandoVale] = useState(false)
  const [, setRelogio] = useState(0)
  const acompanhando = useRef<string | null>(null)
  const vivo = useRef(true)
  useEffect(() => {
    vivo.current = true
    return () => {
      vivo.current = false
    }
  }, [])
  const [f, setF] = useState({
    origem: inicial?.origem || '3550308',
    destino: inicial?.destino || '3106200',
    placa: inicial?.placa || (demo ? PLACA_TAG_TESTE : (placa ?? '')),
    eixos: inicial?.eixos || '5',
    inicio: inicial?.inicio || aaaammdd(emDias(1)),
    fim: inicial?.fim || aaaammdd(emDias(5)),
    cnpjTransportadora: '',
    subcontratado: '',
  })

  // Operação de teste: já deixa preenchidos o CNPJ da transportadora (RBR) e o documento do dono do cavalo (subcontratado).
  // Só preenche o que ainda está vazio; se a leitura falhar, os campos continuam editáveis como antes.
  useEffect(() => {
    if (!ehTeste) return
    let vivo = true
    void (async () => {
      try {
        const [pf, op] = await Promise.all([
          supabase.from('parametros_fiscais').select('cnpj').eq('ativo', true).maybeSingle(),
          supabase.from('operacoes').select('veiculo_id').eq('id', operacaoId).maybeSingle(),
        ])
        let doc = ''
        if (op.data?.veiculo_id) {
          const v = await supabase.from('veiculos').select('titular_id').eq('id', op.data.veiculo_id).maybeSingle()
          if (v.data?.titular_id) {
            const p = await supabase.from('pessoas').select('cpf, cnpj').eq('id', v.data.titular_id).maybeSingle()
            doc = soDigitos(String(p.data?.cnpj ?? p.data?.cpf ?? ''))
          }
        }
        const cnpj = soDigitos(String(pf.data?.cnpj ?? ''))
        if (vivo) setF((a) => ({ ...a, cnpjTransportadora: a.cnpjTransportadora || cnpj, subcontratado: a.subcontratado || doc }))
      } catch {
        /* sem preenchimento automático */
      }
    })()
    return () => {
      vivo = false
    }
  }, [ehTeste, operacaoId])

  useEffect(() => {
    onDados?.({ origem: f.origem, destino: f.destino, placa: f.placa, eixos: f.eixos, inicio: f.inicio, fim: f.fim })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.origem, f.destino, f.placa, f.eixos, f.inicio, f.fim])

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from('vpo_requisicoes')
      .select('id, acao, ambiente, http_status, id_vpo_antt, numero_viagem, id_recibo, total_viagem, erro, criado_em, request_json, situacao, processando_desde')
      .eq('operacao_id', operacaoId)
      .order('criado_em', { ascending: true })
    if (error) setErro(`Não consegui ler o registro do vale-pedágio. ${mensagemClara(error, '')}`.trim())
    setReqs(error ? [] : ((data ?? []) as unknown as RequisicaoVpo[]))
  }, [operacaoId])
  useEffect(() => {
    void carregar()
  }, [carregar])

  const estado = estadoVpo(reqs ?? [])
  const pendencia = pendenciaVpo(reqs ?? [])
  const passos = useMemo(() => registroDePassos(reqs ?? []), [reqs])
  const pontos = () => [{ codIbge: soDigitos(f.origem) }, { codIbge: soDigitos(f.destino) }]

  async function acao(nome: string, body: Record<string, unknown>, sucesso?: (r: Resposta) => string) {
    setOcupado(nome)
    setErro(null)
    setInfo(null)
    try {
      const r = await chamar({ ...body, operacao_id: operacaoId })
      if (typeof r.simulado === 'boolean') setSimulado(r.simulado)
      if (r.ok && r.em_processamento) setInfo('O NSPEDAGIO ainda está processando. A tela confere o recibo sozinha, sem comprar de novo.')
      else if (!r.ok && r.semResposta && (nome === 'comprar' || nome === 'cancelar')) setInfo('A resposta demorou. Conferindo o recibo sozinho; nada será enviado de novo.')
      else if (!r.ok) setErro(mensagemClara(r.erro, 'O vale-pedágio recusou o pedido.'))
      else if (sucesso) setInfo(sucesso(r))
      await carregar()
      onMudou?.()
      return r
    } finally {
      setOcupado(null)
    }
  }

  // Compra/cancelamento que passou do limite da função: confere o recibo a cada 15 s por até 5 min.
  const chaveEspera = pendencia && !pendencia.expirou ? `${pendencia.id}:${pendencia.acao}` : null
  useEffect(() => {
    if (!chaveEspera || !pendencia || acompanhando.current === chaveEspera) return
    acompanhando.current = chaveEspera
    const { acao: esperando, desde } = pendencia
    void (async () => {
      const desfecho = await acompanharRecibo({
        consultar: async () => (await chamar({ acao: 'recibo', aguardando: esperando, operacao_id: operacaoId })) as RespostaAcompanhamento,
        esperar: (ms) => new Promise((ok) => setTimeout(ok, ms)),
        agora: () => Date.now(),
        desde,
        interrompido: () => !vivo.current,
      })
      acompanhando.current = null
      if (!vivo.current || desfecho === 'interrompido') return
      if (desfecho === 'concluida') setInfo('Vale-pedágio comprado (homologação). O recibo apareceu.')
      else if (desfecho === 'cancelada') setInfo('Vale-pedágio cancelado.')
      await carregar()
      setRelogio((n) => n + 1)
      onMudou?.()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveEspera, operacaoId])

  // "Não confirmado": uma conferência manual do recibo (nunca compra nem cancela de novo).
  async function consultarDeNovo() {
    if (!pendencia) return
    setOcupado('conferir')
    setErro(null)
    try {
      const r = (await chamar({ acao: 'recibo', aguardando: pendencia.acao, operacao_id: operacaoId })) as Resposta
      if (r.situacao === 'concluida') setInfo('Vale-pedágio comprado (homologação). O recibo apareceu.')
      else if (r.situacao === 'cancelada') setInfo('Vale-pedágio cancelado.')
      else if (!r.ok) setErro(mensagemClara(r.erro, 'Não consegui conferir o recibo agora. Tente de novo.'))
      else setInfo('Ainda não apareceu no NSPEDAGIO. Tente consultar de novo daqui a pouco.')
      await carregar()
      onMudou?.()
    } finally {
      setOcupado(null)
    }
  }

  const simular = () =>
    acao('simular', { acao: 'simular', pontos: pontos() }, (r) => {
      const d = r.dados as { distanciaKm?: number; valorPorEixos?: Record<string, number> } | undefined
      const v = d?.valorPorEixos?.[Number(f.eixos)]
      const resumo = d ? `${d.distanciaKm ?? '?'} km${v != null ? ` · ${f.eixos} eixos: ${v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : ''}` : null
      setResumoSim(resumo)
      onSimulacao?.(v != null ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) + ` (${f.eixos} eixos, simulação do NSPEDAGIO)` : resumo)
      return 'Simulação concluída. Nada foi comprado.'
    })
  const consultarTag = () => acao('consultar-tag', { acao: 'consultar-tag', placa: f.placa }, () => 'Tag consultada.')
  const comprar = () => {
    if (demo) return setConfirmandoCompra(true)
    if (!window.confirm('Comprar o vale-pedágio de HOMOLOGAÇÃO desta operação de teste?')) return
    executarCompra()
  }
  const executarCompra = () => {
    void acao(
      'comprar',
      {
        acao: 'comprar',
        confirmar: true,
        pedido: {
          placa: f.placa,
          nEixos: Number(f.eixos),
          inicioVigencia: f.inicio,
          fimVigencia: f.fim,
          cnpjTransportadora: soDigitos(f.cnpjTransportadora),
          cnpjCpfSubcontratado: soDigitos(f.subcontratado),
          pontos: pontos(),
        },
      },
      (r) => (r.repetida ? 'Esta compra já tinha sido feita; nada foi comprado de novo.' : 'Vale-pedágio comprado (homologação).'),
    )
  }
  const cancelar = () => {
    if (demo) return setCancelandoVale(true)
    if (!motivo.trim()) return setErro('Escreva o motivo do cancelamento.')
    if (!window.confirm('Cancelar o vale-pedágio desta operação?')) return
    void acao('cancelar', { acao: 'cancelar', confirmar: true, motivo }, () => 'Cancelamento enviado.')
  }
  // Demonstração: confirmação em janela do sistema (mesmo padrão do cancelamento do CIOT), motivo obrigatório de 15+ caracteres.
  async function confirmarCancelamentoDemo() {
    const r = await acao('cancelar', { acao: 'cancelar', confirmar: true, motivo: motivo.trim() }, () => 'Cancelamento enviado.')
    if (r?.ok) {
      setCancelandoVale(false)
      setMotivo('')
    }
  }
  const trocarPlaca = () => {
    if (!novaPlaca.trim() || !motivo.trim()) return setErro('Informe a nova placa e o motivo.')
    void acao('trocar-placa', { acao: 'trocar-placa', confirmar: true, placa: novaPlaca, motivo }, () => 'Placa trocada.')
  }
  const recibo = () => acao('recibo', { acao: 'recibo' }, () => 'Recibo reemitido (veja o registro abaixo).')
  // O PDF do recibo só trafega na resposta (nunca é gravado no banco nem no registro de passos).
  async function baixarReciboPdf() {
    const r = await acao('recibo', { acao: 'recibo' })
    if (!r?.ok) return
    const d = r.dados as { pdfBase64?: string | null; numeroViagem?: string | null; idVpoAntt?: string | null } | undefined
    if (!d?.pdfBase64) {
      setErro('O NSPEDÁGIO não devolveu o PDF do recibo.')
      return
    }
    const bytes = Uint8Array.from(atob(d.pdfBase64), (c) => c.charCodeAt(0))
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `recibo-vale-${d.idVpoAntt ?? d.numeroViagem ?? operacaoId.slice(0, 8)}.pdf`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    setInfo('Recibo em PDF baixado.')
  }

  async function baixarJson() {
    // As respostas completas só são lidas aqui (são pesadas e a tela não precisa delas).
    const { data } = await supabase.from('vpo_requisicoes').select('id, acao, ambiente, http_status, id_vpo_antt, numero_viagem, id_recibo, total_viagem, erro, criado_em, request_json, response_json, situacao, processando_desde').eq('operacao_id', operacaoId).order('criado_em', { ascending: true })
    const url = URL.createObjectURL(new Blob([registroEmJson(operacaoId, ((data ?? reqs ?? []) as unknown) as RequisicaoVpo[])], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `vpo-registro-${operacaoId.slice(0, 8)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }
  function imprimirPdf() {
    const w = window.open('', '_blank')
    if (!w) return setErro('O navegador bloqueou a janela. Libere pop-ups para salvar em PDF.')
    const linhas = passos
      .map((p) => `<tr><td>${new Date(p.quando).toLocaleString('pt-BR')}</td><td>${p.titulo}</td><td>${p.resultado === 'ok' ? 'OK' : p.resultado === 'erro' ? 'ERRO' : '...'}</td><td>${p.detalhe.replace(/</g, '&lt;')}</td></tr>`)
      .join('')
    w.document.write(`<html><head><title>Registro do vale-pedágio</title><style>body{font:13px sans-serif}td,th{border:1px solid #bbb;padding:4px 8px;text-align:left}table{border-collapse:collapse}</style></head><body><h3>Registro de passos do vale-pedágio (HOMOLOGAÇÃO)</h3><p>Operação ${operacaoId}</p><table><tr><th>Quando</th><th>Passo</th><th>Resultado</th><th>Detalhe</th></tr>${linhas}</table></body></html>`)
    w.document.close()
    w.print()
  }

  if (reqs === null) return null
  const campo = 'border rounded px-2 py-1 text-xs w-full'
  const botao = 'text-xs font-bold px-3 py-1.5 rounded-lg border disabled:opacity-50'
  return (
    <>
      <FaixaFixa texto="HOMOLOGAÇÃO: nenhum vale-pedágio real" />
      <div className="rounded-xl border p-3.5 flex flex-col gap-3 bg-white">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-sm font-bold text-[color:var(--rbr-navy-dark)]">Vale-Pedágio (VPO){placa ? ` · ${placa}` : ''}</div>
          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100" data-estado={estado}>{demo ? seloVale(estado, resumoSim != null || (reqs ?? []).some((r) => r.acao === 'simular' && deuCerto(r))) : ROTULO_ESTADO_VPO[estado]}</span>
        </div>
        {simulado && <div className="text-xs font-bold px-2 py-1 rounded bg-amber-100 text-amber-900">SIMULADO, não é real: as credenciais do NSPEDAGIO não estão configuradas.</div>}
        {!ehTeste && <div className="text-xs text-amber-800">Nesta fase o vale-pedágio real só roda em operação de teste.</div>}
        {erro && <div className="text-xs text-red-700" role="alert">{erro}</div>}
        {info && <div className="text-xs text-green-800" role="status">{info}</div>}
        {resumoSim && <div className="text-xs">Simulação: {resumoSim}</div>}
        {estado === 'comprado' && (() => {
          const c = [...(reqs ?? [])].reverse().find((r) => r.acao === 'comprar' && deuCerto(r) && r.id_vpo_antt)
          if (!c) return null
          return (
            <div className="text-xs rounded-lg px-3 py-2 flex flex-col gap-0.5" style={{ background: '#E8F5EC', color: 'var(--rbr-positive)' }} role="status">
              <b>Vale-pedágio comprado (homologação)</b>
              <span>Número do vale {c.id_vpo_antt}{c.numero_viagem ? ` · viagem ${c.numero_viagem}` : ''}{c.id_recibo ? ` · recibo ${c.id_recibo}` : ''}{c.total_viagem != null ? ` · valor ${c.total_viagem.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : ''}</span>
              <span className="text-[color:var(--rbr-muted)]">Fica gravado na operação e vai para o MDF-e. Use "Reemitir recibo" para ver o recibo e "Cancelar vale" para desfazer.</span>
            </div>
          )
        })()}
        {estado === 'cancelado' && (() => {
          const c = [...(reqs ?? [])].reverse().find((r) => r.acao === 'cancelar' && deuCerto(r))
          if (!c) return null
          return (
            <div className="text-xs rounded-lg px-3 py-2" style={{ background: '#FBF3E4', color: '#8A5A00' }} role="status">
              <b>Vale cancelado em {new Date(c.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</b>{c.id_recibo ? ` (protocolo ${c.id_recibo})` : ''}. Você pode comprar de novo.
            </div>
          )
        })()}
        {(estado === 'comprando' || ocupado === 'comprar') && (
          <div className="text-xs font-bold px-2 py-1.5 rounded bg-sky-50 text-sky-900" role="status">{demo ? 'Comprando o vale-pedágio. Em homologação isso leva de 1 a 3 minutos.' : 'Comprando o vale-pedágio, isso pode levar alguns minutos. Não feche esta tela e não compre de novo.'}</div>
        )}
        {(estado === 'cancelando' || ocupado === 'cancelar') && (
          <div className="text-xs font-bold px-2 py-1.5 rounded bg-sky-50 text-sky-900" role="status">Cancelando o vale-pedágio, isso pode levar alguns minutos.</div>
        )}
        {estado === 'nao_confirmado' && (
          <div className="text-xs px-2 py-1.5 rounded bg-amber-50 text-amber-900 flex items-center gap-2 flex-wrap" role="status">
            <span className="font-bold">Não confirmado. Consulte de novo.</span>
            <span>{pendencia?.acao === 'cancelar' ? 'O cancelamento ainda não foi confirmado.' : 'O recibo ainda não apareceu; nada foi comprado de novo.'}</span>
            <button className="text-xs font-bold px-3 py-1 rounded-lg border" disabled={!!ocupado} onClick={() => void consultarDeNovo()}>{ocupado === 'conferir' ? 'Consultando…' : 'Consultar de novo'}</button>
          </div>
        )}

        <details className="text-xs" open={demo ? true : undefined}>
          <summary className="cursor-pointer font-semibold">Dados da rota e do veículo</summary>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <label>IBGE origem<input className={campo} value={f.origem} onChange={(e) => setF({ ...f, origem: e.target.value })} /></label>
            <label>IBGE destino<input className={campo} value={f.destino} onChange={(e) => setF({ ...f, destino: e.target.value })} /></label>
            <label>Placa do cavalo<input className={campo} value={f.placa} onChange={(e) => { setF({ ...f, placa: e.target.value.toUpperCase() }); onPlaca?.(e.target.value.toUpperCase()) }} /></label>
            <label>Eixos (cavalo + carreta)<input className={campo} inputMode="numeric" value={f.eixos} onChange={(e) => setF({ ...f, eixos: e.target.value })} /></label>
            <label>Início (AAAAMMDD)<input className={campo} value={f.inicio} onChange={(e) => setF({ ...f, inicio: e.target.value })} /></label>
            <label>Fim (AAAAMMDD, até 15 dias)<input className={campo} value={f.fim} onChange={(e) => setF({ ...f, fim: e.target.value })} /></label>
            {ehTeste && (
              <button type="button" className="col-span-2 text-xs font-bold px-3 py-1 rounded-lg border" onClick={() => { setF({ ...f, placa: PLACA_TAG_TESTE, ...(demo ? {} : { eixos: '5' }) }); onPlaca?.(PLACA_TAG_TESTE) }}>
                Usar a placa de teste com tag ativa ({PLACA_TAG_TESTE})
              </button>
            )}
            <label>CNPJ da transportadora<input className={campo} value={f.cnpjTransportadora} onChange={(e) => setF({ ...f, cnpjTransportadora: e.target.value })} /></label>
            <label>CPF/CNPJ do subcontratado<input className={campo} value={f.subcontratado} onChange={(e) => setF({ ...f, subcontratado: e.target.value })} /></label>
          </div>
        </details>

        <div className="flex gap-1.5 flex-wrap">
          <button className={botao} disabled={!!ocupado} onClick={() => void simular()}>{ocupado === 'simular' ? 'Simulando…' : 'Simular'}</button>
          <button className={botao} disabled={!!ocupado || !f.placa} onClick={() => void consultarTag()}>Consultar tag</button>
          <button className={botao} disabled={!!ocupado || !podeComprar(estado) || !!pendencia} onClick={comprar} title={podeComprar(estado) ? '' : 'Simule primeiro (e não pode haver compra ativa).'}>Comprar</button>
          <button className={botao} disabled={!!ocupado || estado !== 'comprado'} onClick={() => void recibo()}>Reemitir recibo</button>
          <button className={botao} disabled={!!ocupado || estado !== 'comprado'} onClick={() => void baixarReciboPdf()}>Baixar recibo (PDF)</button>
        </div>

        {podeCancelar(estado) && demo && (
          <div className="flex gap-1.5 flex-wrap">
            <button className={botao} style={{ borderColor: 'var(--rbr-danger)', color: 'var(--rbr-danger)' }} disabled={!!ocupado} onClick={cancelar}>Cancelar vale</button>
          </div>
        )}
        {podeCancelar(estado) && !demo && (
          <div className="flex gap-1.5 flex-wrap items-end">
            <label className="text-xs flex-1 min-w-[10rem]">Motivo<input className={campo} value={motivo} onChange={(e) => setMotivo(e.target.value)} /></label>
            <label className="text-xs w-28">Nova placa<input className={campo} value={novaPlaca} onChange={(e) => setNovaPlaca(e.target.value.toUpperCase())} /></label>
            <button className={botao} disabled={!!ocupado} onClick={trocarPlaca}>Trocar placa</button>
            <button className={botao} disabled={!!ocupado} onClick={cancelar}>Cancelar vale</button>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-xs font-bold">Registro de passos</div>
            <div className="flex gap-1.5">
              <button className={botao} disabled={!passos.length} onClick={() => void baixarJson()}>Baixar JSON</button>
              <button className={botao} disabled={!passos.length} onClick={imprimirPdf}>Salvar em PDF</button>
            </div>
          </div>
          {passos.length === 0 ? (
            <div className="text-xs text-slate-500 mt-1">Nenhum passo ainda. Comece por Simular.</div>
          ) : (
            <ol className="mt-1.5 flex flex-col gap-1">
              {passos.map((p) => (
                <li key={p.id} className="text-xs flex gap-2">
                  <span className="text-slate-500 whitespace-nowrap">{new Date(p.quando).toLocaleString('pt-BR')}</span>
                  <span className="font-semibold">{p.titulo}</span>
                  <span className={p.resultado === 'erro' ? 'text-red-700' : p.resultado === 'ok' ? 'text-green-800' : 'text-slate-500'}>
                    {p.resultado === 'ok' ? 'OK' : p.resultado === 'erro' ? 'Erro' : 'Sem resposta'}
                  </span>
                  <span className="break-words min-w-0">{p.detalhe}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
      {confirmandoCompra && (
        <Modal titulo="Comprar o vale-pedágio agora?" onFechar={() => setConfirmandoCompra(false)}>
          <div className="text-xs text-[color:var(--rbr-muted)]">
            Placa {f.placa} · {f.eixos} eixos · vigência {f.inicio} a {f.fim}. <b className="block mt-1">Homologação: nenhum vale-pedágio real. Em homologação a compra leva de 1 a 3 minutos.</b>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setConfirmandoCompra(false)} className={`${botao}`}>Voltar</button>
            <button type="button" onClick={() => { setConfirmandoCompra(false); executarCompra() }} className={botao} style={{ background: 'var(--rbr-navy)', color: '#fff' }}>Confirmar compra</button>
          </div>
        </Modal>
      )}
      {cancelandoVale && (
        <Modal titulo="Cancelar o vale-pedágio?" onFechar={() => setCancelandoVale(false)}>
          <div className="text-xs text-[color:var(--rbr-muted)]">O vale-pedágio desta operação será cancelado no NSPEDÁGIO e o número dele sai da operação. Depois disso é possível comprar de novo. Conte o motivo (mínimo 15 caracteres).</div>
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} className="border rounded-lg px-3 py-2 text-sm w-full" placeholder="Motivo do cancelamento" autoFocus />
          <div className="text-[11px] text-[color:var(--rbr-muted)]">{motivoValido(motivo) ? 'Motivo suficiente.' : `Faltam ${faltamCaracteres(motivo)} caracteres.`}</div>
          {erro && <div className="text-xs" style={{ color: 'var(--rbr-danger)' }}>{erro}</div>}
          <div className="flex gap-2 justify-end">
            <button type="button" disabled={!!ocupado} onClick={() => { setCancelandoVale(false); setMotivo('') }} className={botao}>Voltar</button>
            <button type="button" disabled={!!ocupado || !motivoValido(motivo)} onClick={() => void confirmarCancelamentoDemo()} className={botao} style={{ background: 'var(--rbr-danger)', color: '#fff' }}>
              {ocupado === 'cancelar' ? 'Cancelando…' : 'Confirmar cancelamento'}
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}
