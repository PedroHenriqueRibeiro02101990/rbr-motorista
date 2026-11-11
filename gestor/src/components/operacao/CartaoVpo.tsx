import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { NSPEDAGIO_HABILITADO } from '../../lib/efreteFlags'
import { mensagemClara } from '../../lib/mensagemClara'
import {
  ROTULO_ESTADO_VPO,
  estadoVpo,
  pendenciaVpo,
  podeCancelar,
  podeComprar,
  registroDePassos,
  registroEmJson,
  type RequisicaoVpo,
} from '../../lib/vpoPassos'
import { acompanharRecibo, type RespostaAcompanhamento } from '../../lib/vpoAcompanhar'
import { FaixaFixa } from './CartaoCiot'

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

export type PropsCartaoVpo = { operacaoId: string; ehTeste: boolean; placa?: string | null; onMudou?: () => void }
export default function CartaoVpo(props: PropsCartaoVpo) {
  if (!NSPEDAGIO_HABILITADO) return null
  return <CartaoVpoAtivo key={props.operacaoId} {...props} />
}

function CartaoVpoAtivo({ operacaoId, ehTeste, placa, onMudou }: PropsCartaoVpo) {
  const [reqs, setReqs] = useState<RequisicaoVpo[] | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [simulado, setSimulado] = useState<boolean | null>(null)
  const [resumoSim, setResumoSim] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const [novaPlaca, setNovaPlaca] = useState('')
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
    origem: '3550308',
    destino: '3106200',
    placa: placa ?? '',
    eixos: '5',
    inicio: aaaammdd(emDias(1)),
    fim: aaaammdd(emDias(5)),
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

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from('vpo_requisicoes')
      .select('id, acao, ambiente, http_status, id_vpo_antt, numero_viagem, id_recibo, total_viagem, erro, criado_em, request_json, response_json, situacao, processando_desde')
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
      setResumoSim(d ? `${d.distanciaKm ?? '?'} km${v != null ? ` · ${f.eixos} eixos: ${v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : ''}` : null)
      return 'Simulação concluída. Nada foi comprado.'
    })
  const consultarTag = () => acao('consultar-tag', { acao: 'consultar-tag', placa: f.placa }, () => 'Tag consultada.')
  const comprar = () => {
    if (!window.confirm('Comprar o vale-pedágio de HOMOLOGAÇÃO desta operação de teste?')) return
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
    if (!motivo.trim()) return setErro('Escreva o motivo do cancelamento.')
    if (!window.confirm('Cancelar o vale-pedágio desta operação?')) return
    void acao('cancelar', { acao: 'cancelar', confirmar: true, motivo }, () => 'Cancelamento enviado.')
  }
  const trocarPlaca = () => {
    if (!novaPlaca.trim() || !motivo.trim()) return setErro('Informe a nova placa e o motivo.')
    void acao('trocar-placa', { acao: 'trocar-placa', confirmar: true, placa: novaPlaca, motivo }, () => 'Placa trocada.')
  }
  const recibo = () => acao('recibo', { acao: 'recibo' }, () => 'Recibo reemitido (veja o registro abaixo).')

  function baixarJson() {
    const url = URL.createObjectURL(new Blob([registroEmJson(operacaoId, reqs ?? [])], { type: 'application/json' }))
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
          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100" data-estado={estado}>{ROTULO_ESTADO_VPO[estado]}</span>
        </div>
        {simulado && <div className="text-xs font-bold px-2 py-1 rounded bg-amber-100 text-amber-900">SIMULADO, não é real: as credenciais do NSPEDAGIO não estão configuradas.</div>}
        {!ehTeste && <div className="text-xs text-amber-800">Nesta fase o vale-pedágio real só roda em operação de teste.</div>}
        {erro && <div className="text-xs text-red-700" role="alert">{erro}</div>}
        {info && <div className="text-xs text-green-800" role="status">{info}</div>}
        {resumoSim && <div className="text-xs">Simulação: {resumoSim}</div>}
        {(estado === 'comprando' || ocupado === 'comprar') && (
          <div className="text-xs font-bold px-2 py-1.5 rounded bg-sky-50 text-sky-900" role="status">Comprando o vale-pedágio, isso pode levar alguns minutos. Não feche esta tela e não compre de novo.</div>
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

        <details className="text-xs">
          <summary className="cursor-pointer font-semibold">Dados da rota e do veículo</summary>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <label>IBGE origem<input className={campo} value={f.origem} onChange={(e) => setF({ ...f, origem: e.target.value })} /></label>
            <label>IBGE destino<input className={campo} value={f.destino} onChange={(e) => setF({ ...f, destino: e.target.value })} /></label>
            <label>Placa do cavalo<input className={campo} value={f.placa} onChange={(e) => setF({ ...f, placa: e.target.value.toUpperCase() })} /></label>
            <label>Eixos (cavalo + carreta)<input className={campo} inputMode="numeric" value={f.eixos} onChange={(e) => setF({ ...f, eixos: e.target.value })} /></label>
            <label>Início (AAAAMMDD)<input className={campo} value={f.inicio} onChange={(e) => setF({ ...f, inicio: e.target.value })} /></label>
            <label>Fim (AAAAMMDD, até 15 dias)<input className={campo} value={f.fim} onChange={(e) => setF({ ...f, fim: e.target.value })} /></label>
            {ehTeste && (
              <button type="button" className="col-span-2 text-xs font-bold px-3 py-1 rounded-lg border" onClick={() => setF({ ...f, placa: PLACA_TAG_TESTE, eixos: '5' })}>
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
        </div>

        {podeCancelar(estado) && (
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
              <button className={botao} disabled={!passos.length} onClick={baixarJson}>Baixar JSON</button>
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
    </>
  )
}
