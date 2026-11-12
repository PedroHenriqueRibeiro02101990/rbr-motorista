import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { aaaammddDeIso, abaInicial, CHAVE_ABA_DEMO, esteiraDemonstracao, linhasDadosCiot, linhasDadosVpo, proximoPassoCiot, textoEstadoAba, type AbaDemo, type DadosDemo, type EstadoCaixa, type FormularioVale, type LinhaDado } from '../../lib/modoDemonstracao'
import { textoPedagio, type DocLeve, type Previa } from '../../lib/ciotCartao'
import type { RequisicaoVpo } from '../../lib/vpoPassos'
import { formatMoney } from '@rbr/shared/format'
import CartaoVpo from './CartaoVpo'
import CiotEfrete from './CiotEfrete'
import SeletorFornecedor from './SeletorFornecedor'
import { FaixaFixa } from './CartaoCiot'

// Aba Fiscal no MODO DE DEMONSTRAÇÃO (reunião com a NSTech): só a esteira completa, o vale-pedágio e o CIOT, cada um
// com "de onde vem cada dado". Só é montado quando modoDemonstracaoAtivo() é verdadeiro (operação de teste + homologação +
// marca modo_demonstracao). Nada aqui emite sozinho: os botões são os dos cartões de sempre, com as mesmas travas.

type Estado = {
  dados: DadosDemo
  reqs: RequisicaoVpo[]
  ciot: { ciot: string | null; verificador: string | null; status: string | null; protocolo: string | null; emitidoEm: string | null; canceladoEm: string | null }
}

const VAZIO: DadosDemo = {
  contratante: { nome: null, cnpj: null },
  titular: { nome: null, documento: null, rntrc: null, pix: null },
  motorista: { nome: null, cpf: null, cnh: null },
  veiculos: [],
  rota: { origem: null, destino: null, distanciaKm: null, ibgeOrigem: null, ibgeDestino: null },
  carga: { ncm: null, pesoKg: null },
  frete: { total: null, adiantamento: null },
  datas: { inicio: null, fim: null },
  numeroOperacao: null,
  vpo: { idvpo: null, valor: null },
}

async function carregarEstado(operacaoId: string): Promise<Estado> {
  // numero_vpo ainda não consta nos tipos gerados do banco: leitura tipada à mão.
  const { data: opBruto } = await supabase
    .from('operacoes')
    .select('numero_vpo, veiculo_id, pessoa_alocada_id, cotacao_id, ncm, coleta_prevista, entrega_prevista')
    .eq('id', operacaoId)
    .maybeSingle()
  const op = opBruto as unknown as { numero_vpo: number | null; veiculo_id: string | null; pessoa_alocada_id: string | null; cotacao_id: string | null; ncm: string | null; coleta_prevista: string | null; entrega_prevista: string | null } | null
  const [cot, cond, cav, reb, pf, civ, reqs] = await Promise.all([
    op?.cotacao_id
      ? supabase.from('cotacoes').select('cidade_origem, uf_origem, cidade_destino, uf_destino, ibge_origem, ibge_destino, distancia_km, peso_bruto_kg, ncms_produtos').eq('id', op.cotacao_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('condicoes_pagamento_operacao').select('valor_total_contrato, valor_adiantamento').eq('operacao_id', operacaoId).maybeSingle(),
    op?.veiculo_id ? supabase.from('veiculos').select('placa, quantidade_eixos, titular_id').eq('id', op.veiculo_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('operacao_reboques').select('ordem, veiculos(placa, quantidade_eixos)').eq('operacao_id', operacaoId).order('ordem'),
    supabase.from('parametros_fiscais').select('razao_social, cnpj').eq('ativo', true).maybeSingle(),
    supabase.from('operacao_ciot_vpo').select('ciot, ciot_verificador, ciot_status, ciot_protocolo, ciot_emitido_em, ciot_cancelado_em, vpo_idvpo, vpo_valor').eq('operacao_id', operacaoId).maybeSingle(),
    supabase
      .from('vpo_requisicoes')
      .select('id, acao, ambiente, http_status, id_vpo_antt, numero_viagem, id_recibo, total_viagem, erro, criado_em, situacao, processando_desde')
      .eq('operacao_id', operacaoId)
      .order('criado_em', { ascending: true }),
  ])
  const [mot, tit] = await Promise.all([
    op?.pessoa_alocada_id ? supabase.from('pessoas').select('nome, cpf, cnh_numero_registro').eq('id', op.pessoa_alocada_id).maybeSingle() : Promise.resolve({ data: null }),
    cav.data?.titular_id ? supabase.from('pessoas').select('nome, cpf, cnpj, rntrc_numero, pix').eq('id', cav.data.titular_id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const c = cot.data
  const veiculos: DadosDemo['veiculos'] = []
  if (cav.data) veiculos.push({ placa: cav.data.placa, eixos: cav.data.quantidade_eixos ?? null, cavalo: true })
  for (const r of (reb.data ?? []) as unknown as { veiculos: { placa: string; quantidade_eixos: number | null } | null }[]) {
    if (r.veiculos) veiculos.push({ placa: r.veiculos.placa, eixos: r.veiculos.quantidade_eixos ?? null, cavalo: false })
  }
  const dados: DadosDemo = {
    contratante: { nome: pf.data?.razao_social ?? null, cnpj: pf.data?.cnpj ?? null },
    titular: { nome: tit.data?.nome ?? null, documento: tit.data?.cnpj ?? tit.data?.cpf ?? null, rntrc: tit.data?.rntrc_numero ?? null, pix: tit.data?.pix ?? null },
    motorista: { nome: mot.data?.nome ?? null, cpf: mot.data?.cpf ?? null, cnh: mot.data?.cnh_numero_registro ?? null },
    veiculos,
    rota: {
      origem: c?.cidade_origem ? `${c.cidade_origem}/${c.uf_origem ?? '?'}` : null,
      destino: c?.cidade_destino ? `${c.cidade_destino}/${c.uf_destino ?? '?'}` : null,
      distanciaKm: c?.distancia_km != null ? Number(c.distancia_km) : null,
      ibgeOrigem: c?.ibge_origem ?? null,
      ibgeDestino: c?.ibge_destino ?? null,
    },
    carga: { ncm: op?.ncm ?? (c?.ncms_produtos as string[] | null | undefined)?.[0] ?? null, pesoKg: c?.peso_bruto_kg != null ? Number(c.peso_bruto_kg) : null },
    frete: { total: cond.data?.valor_total_contrato != null ? Number(cond.data.valor_total_contrato) : null, adiantamento: cond.data?.valor_adiantamento != null ? Number(cond.data.valor_adiantamento) : null },
    datas: { inicio: op?.coleta_prevista ?? null, fim: op?.entrega_prevista ?? null },
    numeroOperacao: op?.numero_vpo != null ? Number(op.numero_vpo) : null,
    vpo: { idvpo: civ.data?.vpo_idvpo ?? null, valor: civ.data?.vpo_valor != null ? Number(civ.data.vpo_valor) : null },
  }
  return {
    dados,
    reqs: (reqs.data ?? []) as unknown as RequisicaoVpo[],
    ciot: { ciot: civ.data?.ciot ?? null, verificador: civ.data?.ciot_verificador ?? null, status: civ.data?.ciot_status ?? null, protocolo: civ.data?.ciot_protocolo ?? null, emitidoEm: civ.data?.ciot_emitido_em ?? null, canceladoEm: civ.data?.ciot_cancelado_em ?? null },
  }
}

const borda = { borderColor: 'var(--rbr-border, #e5e7eb)' }

// Um quadro por documento, no padrão de cores da esteira: a emitir (claro, pontilhado), emitido (verde com check), cancelado (âmbar), fora (cinza pontilhado).
const ESTILO_CAIXA: Record<EstadoCaixa, { caixa: React.CSSProperties; titulo: string; texto: string; marca: string }> = {
  fora: { caixa: { border: '1.5px dashed #b6bcc6', background: '#fafbfc' }, titulo: '#8b93a1', texto: '#8b93a1', marca: '' },
  a_emitir: { caixa: { border: '1.5px dashed var(--rbr-navy)', background: '#fff' }, titulo: 'var(--rbr-navy-dark)', texto: 'var(--rbr-muted)', marca: '' },
  processando: { caixa: { border: '2px solid #2563a8', background: '#EEF5FD' }, titulo: 'var(--rbr-navy-dark)', texto: '#2563a8', marca: '… ' },
  emitido: { caixa: { border: '2px solid var(--rbr-positive)', background: '#E8F5EC' }, titulo: 'var(--rbr-navy-dark)', texto: 'var(--rbr-positive)', marca: '✓ ' },
  cancelado: { caixa: { border: '2px solid #C98A1B', background: '#FBF3E4' }, titulo: 'var(--rbr-navy-dark)', texto: '#8A5A00', marca: '' },
}

function Etiqueta({ children, forte }: { children: string; forte?: boolean }) {
  return (
    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap" style={forte ? { background: 'var(--rbr-navy)', color: '#fff' } : { background: 'var(--rbr-muted-bg)', color: 'var(--rbr-navy)' }}>
      {children}
    </span>
  )
}

function Fluxo({ destino }: { destino: string }) {
  const passos = ['Dados do sistema', 'Conferência', `Envio ${destino}`, 'Resposta gravada na operação']
  return (
    <div className="flex items-center gap-1.5 flex-wrap" aria-label="Fluxo">
      {passos.map((p, i) => (
        <span key={p} className="flex items-center gap-1.5">
          <Etiqueta forte={i === 0}>{p}</Etiqueta>
          {i < passos.length - 1 && <span aria-hidden className="text-[color:var(--rbr-muted)]">→</span>}
        </span>
      ))}
    </div>
  )
}

function TabelaDados({ linhas }: { linhas: LinhaDado[] }) {
  return (
    <table className="w-full text-[13px] border-collapse table-auto">
      <thead>
        <tr className="text-left text-[11px] uppercase tracking-wide text-[color:var(--rbr-muted)]">
          <th className="py-1 pr-3 font-bold">Dado enviado</th>
          <th className="py-1 pr-3 font-bold">Valor nesta operação</th>
          <th className="py-1 font-bold text-right whitespace-nowrap">De onde vem</th>
        </tr>
      </thead>
      <tbody>
        {linhas.map((l) => (
          <tr key={l.dado} className="border-t align-top" style={borda}>
            <td className="py-1.5 pr-3 font-semibold whitespace-nowrap">{l.dado}</td>
            <td className="py-1.5 pr-3 break-words min-w-0" style={l.valor === 'não informado' ? { color: 'var(--rbr-muted)', fontStyle: 'italic' } : undefined}>{l.valor}</td>
            <td className="py-1.5 text-right whitespace-nowrap"><Etiqueta>{l.origem}</Etiqueta></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Cabecalho({ titulo, fluxo }: { titulo: string; fluxo: string }) {
  return (
    <div className="flex flex-col gap-2 mt-1">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="m-0 text-[15px] font-extrabold text-[color:var(--rbr-navy-dark)]">{titulo}</h3>
        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full" style={{ background: '#FDF1DC', color: '#8A5A00' }}>Homologação</span>
      </div>
      <Fluxo destino={fluxo} />
    </div>
  )
}

export type PropsDemoFiscal = { operacaoId: string; docs: DocLeve[]; resumo: { cliente?: string | null; frete?: number | null }; onMudou?: () => void }

export default function DemoFiscal({ operacaoId, docs, resumo, onMudou }: PropsDemoFiscal) {
  const [estado, setEstado] = useState<Estado | null>(null)
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [simulacao, setSimulacao] = useState<string | null>(null)
  const [formVale, setFormVale] = useState<FormularioVale | null>(null)
  const [pisoPedido, setPisoPedido] = useState<number | null>(null)
  // Aba aberta: o hash da URL (#vpo, #ciot) vale para o F5 e links; depois a sessão; senão o Vale-pedágio.
  const [aba, setAba] = useState<AbaDemo>(() => {
    let guardada: string | null = null
    try {
      guardada = window.sessionStorage.getItem(CHAVE_ABA_DEMO)
    } catch {
      /* sem sessionStorage */
    }
    return abaInicial(window.location.hash, guardada)
  })
  const esteiraRef = useRef<HTMLDivElement>(null)

  const recarregar = useCallback(async () => {
    try {
      setEstado(await carregarEstado(operacaoId))
    } catch {
      setEstado((e) => e ?? { dados: VAZIO, reqs: [], ciot: { ciot: null, verificador: null, status: null, protocolo: null, emitidoEm: null, canceladoEm: null } })
    }
  }, [operacaoId])
  useEffect(() => {
    void recarregar()
  }, [recarregar])
  const aoMudar = useCallback(() => {
    void recarregar()
    onMudou?.()
  }, [recarregar, onMudou])

  const dados = estado?.dados ?? VAZIO
  // Só um quadro fica montado: se o vale estiver em processamento e a pessoa estiver na aba do CIOT, a esteira se atualiza sozinha.
  const vpoProcessando = (estado?.reqs ?? []).length > 0 && esteiraDemonstracao(estado?.reqs ?? [], null).caixas.find((c) => c.id === 'vpo')?.estado === 'processando'
  useEffect(() => {
    if (!vpoProcessando || aba === 'vpo') return
    const t = setInterval(() => void recarregar(), 15_000)
    return () => clearInterval(t)
  }, [vpoProcessando, aba, recarregar])
  const esteira = useMemo(() => esteiraDemonstracao(estado?.reqs ?? [], estado?.ciot.status, Date.now(), { emitidoEm: estado?.ciot.emitidoEm, canceladoEm: estado?.ciot.canceladoEm }), [estado])
  const linhasCiot = useMemo(() => linhasDadosCiot(dados, previa?.piso ?? null, pisoPedido, textoPedagio(previa?.pedagio)), [dados, previa, pisoPedido])
  // Valores de partida do formulário do vale: vêm da operação (a MESMA fonte que a tabela mostra).
  const inicialVale = useMemo<Partial<FormularioVale>>(
    () => ({
      origem: dados.rota.ibgeOrigem ?? undefined,
      destino: dados.rota.ibgeDestino ?? undefined,
      eixos: dados.veiculos.length ? String(dados.veiculos.reduce((s, v) => s + (v.eixos ?? 0), 0)) : undefined,
      inicio: aaaammddDeIso(dados.datas.inicio) || undefined,
      fim: aaaammddDeIso(dados.datas.fim) || undefined,
    }),
    [dados],
  )
  const linhasVpo = useMemo(
    () => linhasDadosVpo(dados, formVale ?? { origem: inicialVale.origem ?? '', destino: inicialVale.destino ?? '', placa: 'GYI1732', eixos: inicialVale.eixos ?? '', inicio: inicialVale.inicio ?? '', fim: inicialVale.fim ?? '' }, simulacao),
    [dados, formVale, inicialVale, simulacao],
  )
  const rotaTexto = dados.rota.origem && dados.rota.destino ? `${dados.rota.origem} → ${dados.rota.destino}` : 'rota não informada'
  const veicTexto = dados.veiculos.length ? dados.veiculos.map((v) => v.placa).join(' + ') : 'veículos não informados'
  const freteTexto = dados.frete.total != null ? formatMoney(dados.frete.total) : resumo.frete != null ? formatMoney(resumo.frete) : 'frete não informado'

  const aoMudarAba = useCallback((nova: AbaDemo) => {
    setAba(nova)
    try {
      window.sessionStorage.setItem(CHAVE_ABA_DEMO, nova)
    } catch {
      /* sem sessionStorage: a aba só não é lembrada */
    }
    try {
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}#${nova}`)
    } catch {
      /* sem history: o hash só não acompanha */
    }
    // A rolagem volta ao topo do quadro da esteira (o painel da operação rola por dentro).
    requestAnimationFrame(() => esteiraRef.current?.scrollIntoView({ block: 'start' }))
  }, [])
  const aoTeclarAba = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const nova: AbaDemo = aba === 'vpo' ? 'ciot' : 'vpo'
      aoMudarAba(nova)
      requestAnimationFrame(() => document.getElementById(`aba-demo-${nova}`)?.focus())
    }
  }

  const proximo = proximoPassoCiot(esteira)
  const valorVpo = dados.vpo.valor
  const tabelaVpo = <TabelaDados linhas={linhasVpo} />
  const tabelaCiot = <TabelaDados linhas={linhasCiot} />

  return (
    <div className="flex flex-col gap-3 text-[13px]">
      <FaixaFixa texto="HOMOLOGAÇÃO: nenhum documento ou vale-pedágio real" />
      <div>
        <div className="text-[15px] font-extrabold text-[color:var(--rbr-navy-dark)]">Demonstração em homologação: CIOT (efrete) e Vale-pedágio (NSPEDAGIO)</div>
        <div className="text-xs text-[color:var(--rbr-muted)]">
          {rotaTexto} · {veicTexto} · frete {freteTexto}
        </div>
      </div>

      <div ref={esteiraRef} className="flex items-center justify-between gap-2 flex-wrap scroll-mt-2">
        <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">Esteira fiscal</div>
        <div className="text-xs font-bold" aria-label="Contador da demonstração">{esteira.contador} concluídas</div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2" role="tablist" aria-label="Esteira fiscal" onKeyDown={aoTeclarAba}>
        {esteira.caixas.map((c) => {
          const e = ESTILO_CAIXA[c.estado]
          const texto = textoEstadoAba(c, valorVpo)
          const conteudo = (
            <>
              <span className="text-xs font-bold" style={{ color: e.titulo }}>{c.rotulo}</span>
              <span className="text-[11px] font-semibold" style={{ color: e.texto }}>{e.marca}{texto}</span>
              {c.detalhe && <span className="text-[11px]" style={{ color: e.texto }}>{c.detalhe}</span>}
            </>
          )
          if (c.id !== 'vpo' && c.id !== 'ciot') {
            return (
              <div key={c.id} className="rounded-lg px-2.5 py-2 flex flex-col gap-0.5 min-w-0" style={e.caixa} data-ativo={c.ativo} data-estado={c.estado}>
                {conteudo}
              </div>
            )
          }
          const selecionada = aba === c.id
          const anel = c.id === 'ciot' && proximo && !selecionada
          return (
            <button
              key={c.id}
              id={`aba-demo-${c.id}`}
              type="button"
              role="tab"
              aria-selected={selecionada}
              aria-controls="painel-demo"
              tabIndex={selecionada ? 0 : -1}
              onClick={() => aoMudarAba(c.id as AbaDemo)}
              className={`rounded-lg px-2.5 py-2 flex flex-col gap-0.5 min-w-0 text-left border-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E2761] ${selecionada ? 'border-[#1E2761]' : 'border-[#e5e7eb] hover:border-[#1E2761]'}`}
              style={{ background: e.caixa.background, boxShadow: anel ? '0 0 0 3px rgba(184,134,59,.45)' : undefined }}
              data-ativo={c.ativo}
              data-estado={c.estado}
              data-proximo={anel || undefined}
            >
              {conteudo}
            </button>
          )
        })}
      </div>

      <div id="painel-demo" role="tabpanel" aria-labelledby={`aba-demo-${aba}`} className="flex flex-col gap-3">
        {aba === 'vpo' ? (
          <>
            <Cabecalho titulo="1. Vale-pedágio (NSPEDAGIO)" fluxo="ao NSPEDAGIO" />
            {estado && <CartaoVpo operacaoId={operacaoId} ehTeste demo onMudou={aoMudar} onSimulacao={setSimulacao} inicial={{ ...inicialVale, ...(formVale ?? {}) }} onDados={setFormVale} tabela={tabelaVpo} seletor={<SeletorFornecedor operacaoId={operacaoId} tipo="vpo" demo />} />}
            {dados.vpo.idvpo && (
              <div className="text-xs rounded-lg px-3 py-2" style={{ background: 'var(--rbr-muted-bg)' }}>
                Vale <b>{dados.vpo.idvpo}</b> gravado na operação. Depois ele vai para o CIOT e para o MDF-e.
              </div>
            )}
            {proximo && (
              <div className="flex items-center justify-between gap-3 flex-wrap rounded-xl px-4 py-3" style={{ background: '#E4F3EA', border: '1px solid #9AD0B1' }} role="status" data-faixa="proximo-passo">
                <div>
                  <b>Vale-pedágio comprado.</b> Próximo passo da esteira: emitir o CIOT.
                </div>
                <button type="button" onClick={() => aoMudarAba('ciot')} className="text-xs font-bold px-3.5 py-2 rounded-lg" style={{ background: 'var(--rbr-navy)', color: '#fff' }}>
                  Continuar para o CIOT →
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <Cabecalho titulo="2. CIOT (efrete)" fluxo="à efrete" />
            <CiotEfrete operacaoId={operacaoId} ehTeste docs={docs} demo onMudou={aoMudar} onPrevia={setPrevia} onPedido={(p) => setPisoPedido(p?.piso_minimo ?? null)} tabela={tabelaCiot} seletor={<SeletorFornecedor operacaoId={operacaoId} tipo="ciot" demo />} />
            {estado?.ciot.ciot && estado.ciot.status !== 'cancelado' && (
              <div className="text-xs rounded-lg px-3 py-2" style={{ background: 'var(--rbr-muted-bg)' }}>
                Voltou: CIOT <b>{estado.ciot.ciot}{estado.ciot.verificador ? `/${estado.ciot.verificador}` : ''}</b>
                {estado.ciot.protocolo ? ` · protocolo ${estado.ciot.protocolo}` : ''}. O CIOT e o vale-pedágio vão para o MDF-e.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
