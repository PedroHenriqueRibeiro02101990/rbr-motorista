import { supabase } from './supabaseClient'

// Consulta automática de CNPJ (Receita + IE) e CEP para qualquer cadastro do sistema.
// Backend: Edge Function `consulta-cadastros`. Nunca bloqueia o cadastro: se falhar, o usuário digita à mão.

export type DadosCnpj = {
  cnpj: string
  razao_social: string | null
  nome_fantasia: string | null
  situacao_cadastral: string | null
  ativa: boolean
  inscricao_estadual: string | null
  ie_situacao: string | null
  telefone: string | null
  email: string | null
  cnae: string | null
  optante_simples_nacional: boolean | null
  cep: string | null
  logradouro: string | null
  numero_endereco: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  codigo_ibge: string | null
}

export type DadosCep = {
  cep: string
  logradouro: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  codigo_ibge: string | null
}

export const soDigitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '')

export async function consultarCnpj(valor: string): Promise<{ dados: DadosCnpj | null; erro: string | null; ieIndisponivel: boolean }> {
  const cnpj = soDigitos(valor)
  if (cnpj.length !== 14) return { dados: null, erro: null, ieIndisponivel: false }
  const { data, error } = await supabase.functions.invoke('consulta-cadastros', { body: { acao: 'cnpj', cnpj } })
  if (error || !data?.sucesso) {
    return { dados: null, erro: 'Não consegui consultar este CNPJ agora — preencha manualmente.', ieIndisponivel: false }
  }
  const dados = data.dados as DadosCnpj
  return { dados, erro: null, ieIndisponivel: data.complemento_status !== 'http_200' && !dados.inscricao_estadual }
}

export async function consultarCep(valor: string): Promise<DadosCep | null> {
  const cep = soDigitos(valor)
  if (cep.length !== 8) return null
  const { data } = await supabase.functions.invoke('consulta-cadastros', { body: { acao: 'cep', cep } })
  return data?.sucesso ? (data.dados as DadosCep) : null
}

// Mensagem curta para mostrar abaixo do campo CNPJ depois da consulta.
export function resumoCnpj(d: DadosCnpj, ieIndisponivel: boolean): string {
  if (!d.ativa) return `Atenção: situação deste CNPJ na Receita é "${d.situacao_cadastral ?? 'desconhecida'}". Evite operar com ele.`
  const ie = d.inscricao_estadual
    ? d.ie_situacao && d.ie_situacao !== 'ativa'
      ? ` IE ${d.inscricao_estadual} consta como ${d.ie_situacao} — confira.`
      : ` IE ${d.inscricao_estadual} preenchida.`
    : ieIndisponivel
      ? ' A consulta de IE está indisponível agora — preencha a IE à mão (ou "isento").'
      : ' Não achei IE para este CNPJ — se tiver, preencha à mão (ou "isento").'
  return `Dados preenchidos pela Receita Federal.${ie} Confira antes de salvar.`
}

// Aplica só nos campos ainda vazios (não apaga o que a pessoa já digitou).
export function preencherVazios<T extends object>(atual: T, novos: { [K in keyof T]?: string | null | undefined }): T {
  const out = { ...atual } as Record<string, unknown>
  for (const [k, v] of Object.entries(novos as Record<string, string | null | undefined>)) {
    if (v == null || v === '') continue
    const cur = out[k]
    if (cur == null || String(cur).trim() === '') out[k] = v
  }
  return out as T
}
