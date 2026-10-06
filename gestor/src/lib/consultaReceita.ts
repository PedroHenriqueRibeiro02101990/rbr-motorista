import { supabase } from '@rbr/shared/supabaseClient'
import { soDigitos, type DadosCep, type DadosCnpj } from '@rbr/shared/consultaCadastro'

// Consulta de CNPJ/CEP para as telas de cadastro do gestor, com mensagens que separam
// "não encontrado" de "consulta fora do ar". Backend: Edge Function `consulta-cadastros`.
// Nunca trava o cadastro: se der erro, a pessoa preenche à mão.

const INDISPONIVEL = 'As consultas estão indisponíveis agora. Preencha à mão.'

async function statusDoErro(error: unknown): Promise<number | null> {
  const ctx = (error as { context?: Response } | null)?.context
  return typeof ctx?.status === 'number' ? ctx.status : null
}

export async function buscarCnpj(valor: string): Promise<{ dados: DadosCnpj | null; erro: string | null }> {
  const cnpj = soDigitos(valor)
  if (cnpj.length !== 14) return { dados: null, erro: 'Informe um CNPJ com 14 dígitos.' }
  try {
    const { data, error } = await supabase.functions.invoke('consulta-cadastros', { body: { acao: 'cnpj', cnpj } })
    if (error) {
      const status = await statusDoErro(error)
      console.error('[consulta-cadastros] CNPJ', status, error)
      return { dados: null, erro: status === 404 ? 'CNPJ não encontrado na Receita.' : INDISPONIVEL }
    }
    if (!data?.sucesso || !data.dados) return { dados: null, erro: INDISPONIVEL }
    return { dados: data.dados as DadosCnpj, erro: null }
  } catch (e) {
    console.error('[consulta-cadastros] CNPJ', e)
    return { dados: null, erro: INDISPONIVEL }
  }
}

export async function buscarCep(valor: string): Promise<{ dados: DadosCep | null; erro: string | null }> {
  const cep = soDigitos(valor)
  if (cep.length !== 8) return { dados: null, erro: 'Informe um CEP com 8 dígitos.' }
  try {
    const { data, error } = await supabase.functions.invoke('consulta-cadastros', { body: { acao: 'cep', cep } })
    if (error) {
      const status = await statusDoErro(error)
      console.error('[consulta-cadastros] CEP', status, error)
      return { dados: null, erro: status === 404 ? 'CEP não encontrado.' : INDISPONIVEL }
    }
    if (!data?.sucesso || !data.dados) return { dados: null, erro: INDISPONIVEL }
    return { dados: data.dados as DadosCep, erro: null }
  } catch (e) {
    console.error('[consulta-cadastros] CEP', e)
    return { dados: null, erro: INDISPONIVEL }
  }
}
