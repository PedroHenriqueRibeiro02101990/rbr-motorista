import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { CIOT_EFRETE_HABILITADO } from '../../lib/efreteFlags'
import { montarConferencia, motivoNaoCancela, passosAntesDoCiot, type Corrigir, type DocLeve, type Previa } from '../../lib/ciotCartao'
import CartaoCiot, { FaixaFixa, type PagamentoCiot, type PedidoCiot } from './CartaoCiot'

// CIOT pela efrete ligado à operação (Edge Function efrete-ciot-operacao). A função só roda na HOMOLOGAÇÃO da efrete
// e só aceita operação de teste. Aqui só se chama a função (nunca a efrete direto) e se entrega o resultado ao
// CartaoCiot. Se a efrete cair, o CIOT continua podendo ser digitado à mão no bloco "CIOT" da operação.

type Resposta = { ok: boolean; motivo?: string; mensagem?: string; mensagemOriginal?: string; protocolo?: string | null; [k: string]: unknown }

async function chamar(body: Record<string, unknown>): Promise<Resposta> {
  const { data, error } = await supabase.functions.invoke<Resposta>('efrete-ciot-operacao', { body })
  if (error) {
    // Erro HTTP: a função devolve {motivo} no corpo.
    const ctx = (error as { context?: Response }).context
    const corpo = ctx ? await ctx.json().catch(() => null) : null
    return { ok: false, motivo: (corpo as Resposta | null)?.motivo ?? error.message }
  }
  return data ?? { ok: false, motivo: 'Sem resposta da função.' }
}

const LINK_CORRIGIR: Partial<Record<Corrigir, string>> = {
  cadastro_motorista: '/cadastros?aba=motoristas',
  cadastro_veiculo: '/cadastros?aba=motoristas',
  cotacao: '/cotacao',
}

// Com a flag desligada não renderiza nada e não chama a efrete (o CIOT manual é o caminho principal).
export type PropsCiotEfrete = { operacaoId: string; ehTeste: boolean; docs: DocLeve[]; placa?: string | null; onMudou?: () => void }
export default function CiotEfrete(props: PropsCiotEfrete) {
  if (!CIOT_EFRETE_HABILITADO) return null
  return <CiotEfreteAtivo {...props} />
}

function CiotEfreteAtivo({ operacaoId, ehTeste, docs, placa, onMudou }: PropsCiotEfrete) {
  const [pedido, setPedido] = useState<PedidoCiot | null | undefined>(undefined)
  const [pagamentos, setPagamentos] = useState<PagamentoCiot[]>([])
  const [ambiente, setAmbiente] = useState<string | null>(null)
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [erroOriginal, setErroOriginal] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [transacoes, setTransacoes] = useState<Record<string, unknown>[] | null>(null)

  const carregar = useCallback(async () => {
    const r = await chamar({ acao: 'status', operacao_id: operacaoId })
    setPedido(r.ok ? ((r.pedido as PedidoCiot | null) ?? null) : null)
    setPagamentos(r.ok ? ((r.pagamentos as PagamentoCiot[] | undefined) ?? []) : [])
    if (r.ok && typeof r.ambiente === 'string') setAmbiente(r.ambiente)
  }, [operacaoId])

  // A prévia só lê o banco (nada vai para a efrete); serve de conferência enquanto não há CIOT emitido.
  const carregarPrevia = useCallback(async () => {
    setPrevia((await chamar({ acao: 'previa', operacao_id: operacaoId })) as unknown as Previa)
  }, [operacaoId])

  useEffect(() => {
    void carregar()
  }, [carregar])
  const carregou = pedido !== undefined
  const status = pedido?.status
  useEffect(() => {
    if (!carregou || status === 'emitido' || status === 'cancelado' || status === 'encerrado') return
    void carregarPrevia()
  }, [carregou, status, carregarPrevia])

  async function acao(nome: string, body: Record<string, unknown>, sucesso?: (r: Resposta) => string | null) {
    setOcupado(nome)
    setErro(null)
    setErroOriginal(null)
    setInfo(null)
    try {
      const r = await chamar({ ...body, operacao_id: operacaoId })
      if (!r.ok) {
        const msg = r.mensagem ?? r.motivo ?? 'A efrete recusou.'
        setErro(r.protocolo ? `${msg} (protocolo ${r.protocolo})` : msg)
        if (r.mensagemOriginal && r.mensagemOriginal !== msg) setErroOriginal(`Excecao.Mensagem: ${r.mensagemOriginal}`)
      } else if (sucesso) setInfo(sucesso(r))
      await carregar()
      onMudou?.()
      return r
    } finally {
      setOcupado(null)
    }
  }

  async function baixarPdf() {
    const r = await acao('pdf', { acao: 'pdf' })
    if (!r?.ok || typeof r.pdfBase64 !== 'string') return
    const bytes = Uint8Array.from(atob(r.pdfBase64), (c) => c.charCodeAt(0))
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
    const a = document.createElement('a')
    a.href = url
    a.download = String(r.nomeArquivo ?? 'CIOT.pdf')
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  const linhas = useMemo(() => montarConferencia(previa), [previa])
  const passos = useMemo(() => passosAntesDoCiot(docs, ehTeste), [docs, ehTeste])
  const naoCancela = useMemo(() => motivoNaoCancela(docs), [docs])

  if (pedido === undefined) return null
  return (
    <>
      {ambiente === 'homologacao' && <FaixaFixa texto="HOMOLOGAÇÃO: nenhum CIOT real" />}
      <CartaoCiot
        rotuloCaminhao={`Caminhão 1${placa ? ` · ${placa}` : ''}`}
        ambiente={ambiente}
        ehTeste={ehTeste}
        pedido={pedido}
        pagamentos={pagamentos}
        previa={previa}
        linhas={linhas}
        passos={passos}
        naoCancela={naoCancela}
        ocupado={ocupado}
        erro={erro}
        erroOriginal={erroOriginal}
        info={info}
        transacoes={transacoes}
        linkCorrigir={(c) => LINK_CORRIGIR[c] ?? null}
        onEmitir={() => void acao('emitir', { acao: 'emitir', confirmar: true }, (x) => `CIOT ${String(x.ciot ?? '')} emitido${x.jaExistia ? ' (já existia na efrete; nada foi emitido de novo)' : ''}.`)}
        onConsultar={() => void acao('consultar', { acao: 'consultar' }, () => 'Consultado na efrete pela referência da operação.')}
        onEmitirNovamente={() => void acao('emitir', { acao: 'emitir', confirmar: true, emitir_novamente: true }, (x) => `Novo CIOT ${String(x.ciot ?? '')} emitido.`)}
        onPdf={() => void baixarPdf()}
        onTransacoes={async () => {
          const r = await acao('transacoes', { acao: 'transacoes' })
          if (r?.ok) setTransacoes((r.transacoes as Record<string, unknown>[]) ?? [])
        }}
        onCancelar={async (motivo) => {
          const r = await acao('cancelar', { acao: 'cancelar', motivo }, (x) => `CIOT cancelado (protocolo ${String(x.protocolo ?? '—')}).`)
          return !!r?.ok
        }}
      />
    </>
  )
}
