// B9 (19/11/2026): o registro de auditoria dos uploads fiscais (eventos_fiscais_operacao) ignorava o erro e gravava ator_id = null (CartaoFiscalManual)
// ou o id do LOGIN (SubirPdfManual); a RPC confirmar_ciot_vpo_manual grava o id da PESSOA (current_pessoa_id). Aqui: sempre o id da pessoa e o erro volta como texto.
import { supabase } from '@rbr/shared/supabaseClient'

export async function pessoaAtualId(): Promise<string | null> {
  try {
    const { data } = await supabase.rpc('current_pessoa_id')
    return typeof data === 'string' ? data : null
  } catch {
    return null
  }
}

/** Grava o evento. Devolve null se gravou, ou o aviso em portugues se nao gravou (o documento em si ja foi tratado antes: isto so afeta o historico). */
export async function gravarEventoFiscal(linha: unknown): Promise<string | null> {
  try {
    const { error } = await supabase.from('eventos_fiscais_operacao').insert(linha as never)
    return error ? `O documento foi gravado, mas o registro no historico fiscal falhou (${error.message}).` : null
  } catch (e) {
    return `O documento foi gravado, mas o registro no historico fiscal falhou (${e instanceof Error ? e.message : String(e)}).`
  }
}
