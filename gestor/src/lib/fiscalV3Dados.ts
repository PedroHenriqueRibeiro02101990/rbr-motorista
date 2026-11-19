// Leitura do estado fiscal gravado (aba Fiscal v3). Somente leitura; todo aviso/estado do painel vem daqui (regra G5).
import { supabase } from '@rbr/shared/supabaseClient'
import type { Item } from '../../../supabase/functions/_shared/lancamentoManual.ts'
import { codigoCurto } from './painelOperacao.ts'
import { itensDaPrevia, ncmDaOperacao, type EstadoFiscal } from './fiscalV3Modelo.ts'

export interface DocLinha {
  id: string; tipo: string; status: string; numero_documento: string | null; chave_acesso: string | null; emitido_em: string | null; atualizado_em: string | null
  referencia: string | null; ambiente: string | null; arquivo_nome: string | null; arquivo_enviado_em: string | null; versao: number | null
  mensagem_erro: string | null; encerrado_em: string | null; provedor: string | null; url_pdf: string | null
}
export interface NfeLinha { id: string; chave_acesso: string | null; numero: string | null; serie: string | null; emitente_nome: string | null; destinatario_nome: string | null; valor: number | null; peso_kg: number | null; ncm: string | null }
export interface DadosFiscais {
  docs: DocLinha[]
  ciotVpo: (EstadoFiscal['ciotVpo'] & Record<string, unknown>) | null
  nfes: NfeLinha[]
  ncm: string | null
  placa: string | null
  placaReboques: string[]
  eixos: number | null
  frete: number | null
  adiantamento: number | null
  piso: number | null
  motoristaNome: string | null
  codigo: string | null
  distanciaKm: number | null
  pesoKg: number | null
}

export async function carregarDadosFiscais(operacaoId: string): Promise<DadosFiscais> {
  const [d, l, n, o, c] = await Promise.all([
    supabase.from('documentacao_operacao').select('id, tipo, status, numero_documento, chave_acesso, emitido_em, atualizado_em, referencia, ambiente, arquivo_nome, arquivo_enviado_em, versao, mensagem_erro, encerrado_em, provedor, url_pdf').eq('operacao_id', operacaoId),
    supabase.from('operacao_ciot_vpo').select('*').eq('operacao_id', operacaoId).maybeSingle(),
    supabase.from('operacao_nfes').select('id, chave_acesso, numero, serie, emitente_nome, destinatario_nome, valor, peso_kg, ncm').eq('operacao_id', operacaoId),
    supabase.from('operacoes').select('veiculo_id, cotacao_id, ncm, pessoa_alocada_id').eq('id', operacaoId).maybeSingle(),
    supabase.from('condicoes_pagamento_operacao').select('valor_total_contrato, valor_adiantamento').eq('operacao_id', operacaoId).maybeSingle(),
  ])
  const op = o.data
  let placa: string | null = null, eixos = 0, piso: number | null = null, ncmsCot: string[] | null = null, dist: number | null = null, peso: number | null = null, mot: string | null = null
  const placaReboques: string[] = []
  if (op?.veiculo_id) {
    const { data: v } = await supabase.from('veiculos').select('placa, quantidade_eixos').eq('id', op.veiculo_id).maybeSingle()
    placa = v?.placa ?? null; eixos += v?.quantidade_eixos ?? 0
    const { data: rb } = await supabase.from('operacao_reboques').select('veiculo_id').eq('operacao_id', operacaoId)
    const ids = (rb ?? []).map((r) => r.veiculo_id)
    if (ids.length) { const { data: vs } = await supabase.from('veiculos').select('placa, quantidade_eixos').in('id', ids); for (const r of vs ?? []) { placaReboques.push(r.placa); eixos += r.quantidade_eixos ?? 0 } }
  }
  if (op?.cotacao_id) {
    const { data: ct } = await supabase.from('cotacoes').select('piso_antt_calculado, ncms_produtos, distancia_km, peso_bruto_kg').eq('id', op.cotacao_id).maybeSingle()
    piso = ct?.piso_antt_calculado != null ? Number(ct.piso_antt_calculado) : null; ncmsCot = (ct?.ncms_produtos as string[] | null) ?? null
    dist = ct?.distancia_km != null ? Number(ct.distancia_km) : null; peso = ct?.peso_bruto_kg != null ? Number(ct.peso_bruto_kg) : null
  }
  if (op?.pessoa_alocada_id) { const { data: p } = await supabase.from('pessoas').select('nome').eq('id', op.pessoa_alocada_id).maybeSingle(); mot = p?.nome ?? null }
  const nfes = (n.data ?? []) as unknown as NfeLinha[]
  return {
    docs: (d.data ?? []) as unknown as DocLinha[], ciotVpo: (l.data ?? null) as DadosFiscais['ciotVpo'], nfes,
    ncm: ncmDaOperacao({ ncmOperacao: op?.ncm, ncmsNfes: nfes.map((x) => x.ncm), ncmsCotacao: ncmsCot }),
    placa, placaReboques, eixos: eixos || null, frete: c.data?.valor_total_contrato != null ? Number(c.data.valor_total_contrato) : null,
    adiantamento: c.data?.valor_adiantamento != null ? Number(c.data.valor_adiantamento) : null, piso, motoristaNome: mot,
    codigo: codigoCurto(operacaoId), distanciaKm: dist, pesoKg: peso,
  }
}

/** Pre-voo do MDF-e = PREVIA do proprio emissor (fonte unica; nao emite nada nem grava). Falha na leitura nao bloqueia (o emissor bloqueia por conta propria). */
export async function carregarPreVoo(operacaoId: string): Promise<{ itens: Item[]; payload: Record<string, unknown> | null } | null> {
  try {
    const { data, error } = await supabase.functions.invoke('emitir-mdfe', { body: { operacao_id: operacaoId, previa: true } })
    if (error && !data) {
      const ctx = (error as { context?: Response }).context
      const corpo = ctx ? await ctx.json().catch(() => null) : null
      return corpo ? { itens: itensDaPrevia(corpo), payload: null } : null
    }
    return { itens: itensDaPrevia(data), payload: (data?.payload as Record<string, unknown> | undefined) ?? null }
  } catch { return null }
}
