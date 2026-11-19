// Leitura dos PDFs do lancamento manual (VPR e contrato CIOT): funcoes puras. Teste: node --test gestor/test/leituraManual.test.ts
// Regra: so se diz "lido" quando existe extracao; a falha mostra o erro da funcao (ia_indisponivel etc.), nunca um "lido" falso.
import { separarCiot } from '../../../supabase/functions/_shared/lancamentoManual.ts'

export type CampoLido = 'idvpo' | 'vpo_valor' | 'categoria' | 'ciot' | 'ver' | 'frete' | 'adiant'
type Campos = Record<string, { valor: unknown }>

/** Tipo de extracao por upload: VPR -> vpr_vale_pedagio; contrato da Repom -> contrato_ciot_repom. */
export const TIPO_EXTRACAO = { vpo_pdf: 'vpr_vale_pedagio', ciot_pdf: 'contrato_ciot_repom' } as const

/** Valores a pre-preencher nos campos (como texto, editaveis) + quais foram lidos (para o selo "lido: confira"). */
export function preenchimentoDaLeitura(campo: 'vpo_pdf' | 'ciot_pdf', campos: Campos, deducoes?: Campos): { valores: Partial<Record<CampoLido, string>>; lidos: CampoLido[] } {
  const valores: Partial<Record<CampoLido, string>> = {}
  const pegar = (k: string) => { const v = campos[k]?.valor; return v === null || v === undefined || v === '' ? null : v }
  const poe = (k: CampoLido, v: unknown) => { if (v !== null && v !== undefined && v !== '') valores[k] = String(v) }
  if (campo === 'vpo_pdf') {
    poe('idvpo', pegar('idvpo')); poe('vpo_valor', pegar('valor_total')); poe('categoria', pegar('categoria'))
  } else {
    const sep = separarCiot(`${pegar('ciot') ?? ''}${deducoes?.ciot_verificador?.valor ?? ''}`) ?? separarCiot(pegar('ciot'))
    if (sep) { poe('ciot', sep.ciot); poe('ver', sep.verificador) }
    poe('frete', pegar('valor_frete')); poe('adiant', pegar('adiantamento'))
  }
  return { valores, lidos: Object.keys(valores) as CampoLido[] }
}

/** Texto para o gestor quando a leitura nao aconteceu. `resp` e o corpo da funcao (resultado do arquivo ou o corpo do erro HTTP). */
export function mensagemFalhaLeitura(resp: { erro?: string; codigo?: string; aviso?: string } | null | undefined): string {
  const base = resp?.erro || resp?.aviso || 'A leitura automática não respondeu.'
  const cod = resp?.codigo ? ` (${resp.codigo})` : ''
  return `Não consegui ler o arquivo: ${base}${cod} O arquivo foi enviado; preencha os campos abaixo à mão ou tente ler de novo.`
}
