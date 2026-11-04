// B6: peso, valor e NCM da NF repetidos nos documentos. Compara o que a NF trouxe com o que foi enviado no CT-e e no MDF-e e
// avisa quando falta o peso ou quando dois documentos divergem. Só lê; nunca inventa peso (o peso vem do gestor ou da NF).
// Limite: o CIOT e o VPO guardam o peso fora de documentacao_operacao e ainda não entram nesta conferência.
export interface EntradaDivergencias {
  pesoNf: number | null
  valorNf: number | null
  ncmNf: string | null
  cte: Record<string, unknown> | null // documentacao_operacao.payload_enviado do CT-e
  mdfe: Record<string, unknown> | null // idem do MDF-e
}

export type AlertaDocumento = { gravidade: 'bloqueia' | 'avisa'; texto: string }

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) ? n : null
}
const dig = (v: unknown) => String(v ?? '').replace(/\D/g, '')
const kg = (n: number) => `${n.toLocaleString('pt-BR')} kg`
const reais = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function pesoDoCte(p: Record<string, unknown> | null): number | null {
  const q = (p?.quantidades as { quantidade?: unknown }[] | undefined)?.[0]
  return num(q?.quantidade)
}

export function divergenciasDocumentos(e: EntradaDivergencias): AlertaDocumento[] {
  const out: AlertaDocumento[] = []
  if (e.pesoNf == null || e.pesoNf <= 0) {
    out.push({ gravidade: 'bloqueia', texto: 'A NF não trouxe o peso e a operação não tem peso informado: preencha o peso real (o sistema não inventa).' })
  }
  const pesoCte = pesoDoCte(e.cte)
  const pesoMdfe = num(e.mdfe?.peso_bruto)
  if (pesoCte != null && pesoMdfe != null && Math.abs(pesoCte - pesoMdfe) > 0.5) {
    out.push({ gravidade: 'bloqueia', texto: `Peso diferente entre CT-e (${kg(pesoCte)}) e MDF-e (${kg(pesoMdfe)}).` })
  }
  if (e.pesoNf != null && e.pesoNf > 0) {
    if (pesoCte != null && Math.abs(pesoCte - e.pesoNf) > 0.5) out.push({ gravidade: 'avisa', texto: `CT-e com ${kg(pesoCte)} e a NF com ${kg(e.pesoNf)}.` })
    if (pesoMdfe != null && Math.abs(pesoMdfe - e.pesoNf) > 0.5) out.push({ gravidade: 'avisa', texto: `MDF-e com ${kg(pesoMdfe)} e a NF com ${kg(e.pesoNf)}.` })
  }
  const valorCte = num(e.cte?.valor_total_carga)
  const valorMdfe = num(e.mdfe?.valor_total_carga)
  if (valorCte != null && valorMdfe != null && Math.abs(valorCte - valorMdfe) > 0.01) {
    out.push({ gravidade: 'bloqueia', texto: `Valor da carga diferente entre CT-e (${reais(valorCte)}) e MDF-e (${reais(valorMdfe)}).` })
  }
  if (e.valorNf != null && e.valorNf > 0) {
    if (valorCte != null && Math.abs(valorCte - e.valorNf) > 0.01) out.push({ gravidade: 'avisa', texto: `CT-e com valor de carga ${reais(valorCte)} e a NF com ${reais(e.valorNf)}.` })
    if (valorMdfe != null && Math.abs(valorMdfe - e.valorNf) > 0.01) out.push({ gravidade: 'avisa', texto: `MDF-e com valor de carga ${reais(valorMdfe)} e a NF com ${reais(e.valorNf)}.` })
  }
  const ncmMdfe = dig(e.mdfe?.codigo_ncm_produto)
  const ncmNf = dig(e.ncmNf)
  if (ncmMdfe && ncmNf.length === 8 && ncmMdfe !== ncmNf) out.push({ gravidade: 'avisa', texto: `NCM do MDF-e (${ncmMdfe}) diferente do da NF (${ncmNf}).` })
  return out
}
