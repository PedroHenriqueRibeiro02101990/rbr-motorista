import { useEffect, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { SELETOR_FORNECEDOR_HABILITADO } from '../../lib/efreteFlags'
import { rotulosFornecedores, type FornecedorFiscal, type LinhaFornecedor, type TipoFornecimento } from '../../lib/fornecedorFiscal'

// Texto do fornecedor de cada etapa (esteira e pré-voo). Nulo com a flag desligada, em operação de demonstração ou se a leitura falhar:
// nesses casos as telas ficam exatamente como estão hoje. As tabelas novas não estão nos tipos gerados: acesso solto, só aqui.
type Solto = { from: (t: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as Solto

export function useFornecedoresOperacao(operacaoId: string): Record<TipoFornecimento, string> | null {
  const [rotulos, setRotulos] = useState<Record<TipoFornecimento, string> | null>(null)
  useEffect(() => {
    if (!SELETOR_FORNECEDOR_HABILITADO) return
    let vivo = true
    void (async () => {
      try {
        const [op, cat, linha] = await Promise.all([
          db.from('operacoes').select('modo_demonstracao').eq('id', operacaoId).maybeSingle(),
          db.from('fornecedores_fiscais').select('id, nome, capacidades, ativo, disponivel_emissao, ordem, padrao_ciot, padrao_vpo'),
          db.from('operacao_ciot_vpo').select('ciot_fornecedor, vpo_fornecedor, ciot_status, vpo_idvpo').eq('operacao_id', operacaoId).maybeSingle(),
        ])
        if (!vivo) return
        if (op.data?.modo_demonstracao === true || cat.error || !cat.data?.length) return setRotulos(null)
        setRotulos(rotulosFornecedores(cat.data as FornecedorFiscal[], (linha.data as LinhaFornecedor | null) ?? null))
      } catch {
        if (vivo) setRotulos(null)
      }
    })()
    return () => {
      vivo = false
    }
  }, [operacaoId])
  return rotulos
}
