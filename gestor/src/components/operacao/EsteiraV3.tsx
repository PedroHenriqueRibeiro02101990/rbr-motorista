import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import DevolverOperacao from './DevolverOperacao'
import AvisoJanelaEmissao from './AvisoJanelaEmissao'
import { DesfazerEPrazos, TrocaMotoristaVeiculo } from './EsteiraEmissao'
import { Modal } from '../financeiro/ui'
import { etapaCiot, etapaVpo, preVooMdfe, resumoFaltaMdfe, temBloqueio, type EstadoPreVoo, type Item, type LinhaCiotVpo } from '../../../../supabase/functions/_shared/lancamentoManual.ts'

// Esteira da aba Fiscal v3 (Parte B etapas 9b, 11 e 15), so com VITE_FISCAL_V3 e em operacao real. 4 blocos (CT-e, Vale-pedagio, CIOT, MDF-e);
// a averbacao NAO e bloco: aparece dentro do CT-e (RCTR-C) e do MDF-e (RC-V). Tudo derivado do banco, lido de novo a cada mudanca (G5).
// A previa aprovada (preview-fiscal-completo-v3-2026-11-18.html) nao estava no repositorio: implementado pela descricao escrita.
type Doc = { tipo: string; status: string; numero_documento?: string | null; chave_acesso?: string | null; mensagem_erro?: string | null; emitido_em?: string | null }
const COR_NIVEL = { ok: '#15803d', aviso: '#b45309', bloqueio: '#b91c1c' } as const

async function carregarEstado(operacaoId: string): Promise<{ docs: Doc[]; estado: EstadoPreVoo }> {
  const [d, l, o] = await Promise.all([
    supabase.from('documentacao_operacao').select('tipo, status, numero_documento, chave_acesso, mensagem_erro, emitido_em').eq('operacao_id', operacaoId),
    supabase.from('operacao_ciot_vpo').select('*').eq('operacao_id', operacaoId).maybeSingle(),
    supabase.from('operacoes').select('veiculo_id, cotacao_id, ncm').eq('id', operacaoId).maybeSingle(),
  ])
  const docs = (d.data ?? []) as Doc[]
  let cepC: string | null = null, cepD: string | null = null, ncm: string | null = o.data?.ncm ?? null, ufI: string | null = null, ufF: string | null = null
  if (o.data?.cotacao_id) {
    const { data: c } = await supabase.from('cotacoes').select('origem_cep, nf_destinatario_endereco, ncms_produtos, uf_origem, uf_destino').eq('id', o.data.cotacao_id).maybeSingle()
    cepC = c?.origem_cep ?? null
    cepD = ((c?.nf_destinatario_endereco ?? null) as { cep?: string } | null)?.cep ?? null
    ncm = ncm ?? ((c?.ncms_produtos as string[] | null)?.[0] ?? null)
    ufI = c?.uf_origem ?? null; ufF = c?.uf_destino ?? null
  }
  let tracao: EstadoPreVoo['tracao'] = null
  if (o.data?.veiculo_id) {
    const { data: v } = await supabase.from('veiculos').select('tara_kg, quantidade_eixos, tipo_veiculo').eq('id', o.data.veiculo_id).maybeSingle()
    tracao = v ? { tara_kg: v.tara_kg != null ? Number(v.tara_kg) : null, eixos: v.quantidade_eixos, tipo: v.tipo_veiculo } : null
  }
  const { data: rb } = await supabase.from('operacao_reboques').select('veiculo_id').eq('operacao_id', operacaoId)
  const ids = (rb ?? []).map((r) => r.veiculo_id)
  const { data: vs } = ids.length ? await supabase.from('veiculos').select('tara_kg, e_reboque, quantidade_eixos').in('id', ids) : { data: [] as { tara_kg: number | null; e_reboque: boolean }[] }
  const ciotVpo = (l.data ?? null) as LinhaCiotVpo | null
  const eixosTotal = (tracao?.eixos ?? 0) + (vs ?? []).reduce((s, r) => s + ((r as { quantidade_eixos?: number | null }).quantidade_eixos ?? 0), 0)
  const estado: EstadoPreVoo = {
    cte: docs.find((x) => x.tipo === 'cte') ?? null, averbacaoCte: docs.find((x) => x.tipo === 'atm') ?? null, ciotVpo, temPedagio: true, contratoExigeCiot: true,
    cepCarregamento: cepC, cepDescarregamento: cepD, ncm, tracao: tracao ? { ...tracao, eixos: eixosTotal || tracao.eixos } : null,
    reboques: (vs ?? []).map((r) => ({ tara_kg: r.tara_kg != null ? Number(r.tara_kg) : null, e_reboque: r.e_reboque })), ufInicio: ufI, ufFim: ufF,
  }
  return { docs, estado }
}

export default function EsteiraV3({ operacaoId, status, onDevolvida }: { operacaoId: string; status: string; onDevolvida: () => void }) {
  const [dados, setDados] = useState<{ docs: Doc[]; estado: EstadoPreVoo } | null>(null)
  const [erro, setErro] = useState(false)
  const [regras, setRegras] = useState(false)
  const recarregar = useCallback(async () => { try { setDados(await carregarEstado(operacaoId)); setErro(false) } catch { setErro(true) } }, [operacaoId])
  useEffect(() => {
    void recarregar()
    // realtime: qualquer mudanca nas tabelas fonte redesenha sem recarregar a pagina
    const canal = supabase.channel(`esteira-v3-${operacaoId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'operacao_ciot_vpo', filter: `operacao_id=eq.${operacaoId}` }, () => void recarregar())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documentacao_operacao', filter: `operacao_id=eq.${operacaoId}` }, () => void recarregar())
      .subscribe()
    return () => { void supabase.removeChannel(canal) }
  }, [operacaoId, recarregar])

  if (erro) return <div className="text-xs">Nao consegui ler o estado fiscal. <button type="button" className="underline font-bold" onClick={() => void recarregar()}>Tentar de novo</button></div>
  if (!dados) return <div className="text-xs">Carregando a esteira...</div>
  const { docs, estado } = dados
  const itens: Item[] = preVooMdfe(estado)
  const doc = (t: string) => docs.find((d) => d.tipo === t)
  const cte = doc('cte'), mdfe = doc('mdfe'), atm = doc('atm')
  const vpo = etapaVpo(estado.ciotVpo, true), ciot = etapaCiot(estado.ciotVpo)
  const rcv = estado.ciotVpo as (LinhaCiotVpo & { averbacao_rcv_status?: string | null; averbacao_rcv_numero?: string | null }) | null
  const blocos = [
    { chave: 'cte', rotulo: 'CT-e', ok: cte?.status === 'emitido', texto: cte?.status === 'emitido' ? `nº ${cte.numero_documento ?? ''} · emitido` : cte?.status === 'erro' ? (cte.mensagem_erro ?? 'Rejeitado') : 'Ainda nao emitido', sub: `Averbacao RCTR-C (automatica): ${atm?.status === 'emitido' ? 'averbada' : 'aguardando o CT-e'}` },
    { chave: 'vpo', rotulo: 'Vale-pedagio', ok: vpo.concluida, texto: vpo.texto },
    { chave: 'ciot', rotulo: 'CIOT', ok: ciot.concluida, texto: ciot.texto },
    { chave: 'mdfe', rotulo: 'MDF-e', ok: mdfe?.status === 'emitido', texto: mdfe?.status === 'emitido' ? `nº ${mdfe.numero_documento ?? ''} · emitido` : mdfe?.status === 'erro' ? (mdfe.mensagem_erro ?? 'Rejeitado') : 'Ainda nao emitido', sub: `Averbacao RC-V (automatica): ${rcv?.averbacao_rcv_status === 'emitido' || rcv?.averbacao_rcv_numero ? `averbada ${rcv.averbacao_rcv_numero ?? ''}` : 'Aguardando o MDF-e'}` },
  ]
  const feitas = blocos.filter((b) => b.ok).length
  const falta = resumoFaltaMdfe(itens)
  return (
    <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-start">
      <div className="bg-white border rounded-2xl p-5 flex flex-col gap-2.5" style={{ borderColor: 'var(--rbr-border)' }}>
        <div className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: 'var(--rbr-muted)' }}>ESTEIRA DE EMISSAO · {feitas} DE 4 CONCLUIDAS</div>
        {blocos.map((b) => (
          <div key={b.chave} className="flex items-center gap-3 rounded-xl border px-3.5 py-2.5" style={{ borderColor: 'var(--rbr-border)' }}>
            <span className="w-7 h-7 rounded-full inline-flex items-center justify-center text-[13px] font-extrabold flex-shrink-0" style={{ background: b.ok ? '#d6ecdf' : '#eef0f5', color: b.ok ? '#1a6b3c' : '#7b829f' }}>{b.ok ? '✓' : '•'}</span>
            <div className="min-w-0"><div className="text-[14px] font-extrabold">{b.rotulo}</div><div className="text-[12px]" style={{ color: 'var(--rbr-muted)' }}>{b.texto}</div>{b.sub && <div className="text-[11px]" style={{ color: 'var(--rbr-muted)' }}>{b.sub}</div>}</div>
          </div>
        ))}
        <div className="text-[12px]" style={{ color: temBloqueio(itens) ? '#b91c1c' : '#15803d' }}>{temBloqueio(itens) ? `Emitir MDF-e fica apagado. ${falta}` : 'Pre-voo do MDF-e sem bloqueio.'}</div>
        <button type="button" className="self-start text-xs underline font-semibold" onClick={() => setRegras(true)}>Regras de troca de motorista e veiculo</button>
      </div>
      <div className="flex flex-col gap-3.5">
        <div className="bg-white border rounded-2xl p-5 flex flex-col gap-1" style={{ borderColor: 'var(--rbr-border)' }}>
          <div className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: 'var(--rbr-muted)' }}>PRE-VOO DO MDF-E</div>
          {itens.map((i) => <div key={i.campo + i.mensagem} className="text-[12px]" style={{ color: COR_NIVEL[i.nivel] }}>{i.nivel === 'ok' ? '✓' : i.nivel === 'aviso' ? '!' : '✕'} {i.mensagem}</div>)}
          <div className="text-[11px] mt-1" style={{ color: 'var(--rbr-muted)' }}>Depois do MDF-e: averbacao RC-V (Sompo) e encerramento.</div>
        </div>
        <AvisoJanelaEmissao operacaoId={operacaoId} />
        {/* Bloco "Algo errado? Devolver esta operacao": mantido exatamente como esta hoje (fora do desenho; decisao do Pedro). */}
        <div className="bg-white border rounded-2xl p-5 flex flex-col gap-2" style={{ borderColor: 'var(--rbr-border)' }}>
          <div className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: 'var(--rbr-muted)' }}>ALGO ERRADO?</div>
          <div className="text-[12px]" style={{ color: 'var(--rbr-muted)' }}>Devolva à Operação com o motivo, ou desfaça o que já foi emitido (cancelar fica no cartão de cada documento, abaixo).</div>
          {status === 'aguardando_liberacao_fiscal' ? <DevolverOperacao operacaoId={operacaoId} onDevolvida={onDevolvida} /> : <div className="text-[12px]" style={{ color: '#8a91ad' }}>Devolver só aparece enquanto a operação aguarda a liberação fiscal.</div>}
        </div>
      </div>
      {regras && (
        <Modal titulo="Regras de troca de motorista e veiculo" onFechar={() => setRegras(false)} largura="max-w-4xl">
          <div className="flex flex-col gap-3"><DesfazerEPrazos /><TrocaMotoristaVeiculo /></div>
        </Modal>
      )}
    </div>
  )
}
