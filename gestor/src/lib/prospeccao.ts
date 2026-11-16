// Prospeccao (agente SDR), Parte A: regras puras usadas pelas telas. Testes em gestor/test/prospeccao.test.ts.
// Nada aqui envia e-mail. A pontuacao oficial e calculada no banco (prospeccao_calcular_pontuacao); a copia local
// serve so para mostrar o numero na hora enquanto se edita (os pesos vem da tabela prospeccao_pesos).

export const SEGMENTOS = ['alimentos', 'bebidas', 'plasticos', 'metalurgia', 'maquinas'] as const
export type Segmento = (typeof SEGMENTOS)[number]
export const VEICULOS = ['bau', 'sider', 'graneleiro', 'prancha', 'munck'] as const

export const SEGMENTO_LABEL: Record<Segmento, string> = {
  alimentos: 'Alimentos', bebidas: 'Bebidas', plasticos: 'Plásticos', metalurgia: 'Metalurgia', maquinas: 'Máquinas',
}
export const SEGMENTO_LEGIVEL: Record<Segmento, string> = {
  alimentos: 'alimentos', bebidas: 'bebidas', plasticos: 'plásticos', metalurgia: 'produtos metalúrgicos', maquinas: 'máquinas e equipamentos',
}
export const SEGMENTO_FRASE: Record<Segmento, string> = {
  alimentos: 'distribuição de alimentos', bebidas: 'distribuição de bebidas', plasticos: 'produtos plásticos',
  metalurgia: 'produtos metalúrgicos', maquinas: 'máquinas e equipamentos',
}
export const STATUS_EMPRESA_LABEL: Record<string, string> = {
  novo: 'Novo', qualificado: 'Qualificado', em_aprovacao: 'Em aprovação', em_contato: 'Em contato', respondeu: 'Respondeu',
  quente: 'Quente', descartado: 'Descartado', descadastrado: 'Descadastrado', repouso: 'Repouso',
}
export const VALIDACAO_LABEL: Record<string, string> = {
  pendente: 'Pendente', sintaxe_ok: 'Sintaxe ok', mx_ok: 'MX ok', verificado: 'Verificado', catch_all: 'Catch-all', invalido: 'Inválido', devolvido: 'Devolvido',
}

// ---- pontuacao -----------------------------------------------------------------------------------------
export type Peso = { criterio: string; rotulo: string; peso: number; ordem: number }
export type Classe = 'A' | 'B' | 'C'

export function calcularPontuacao(
  criterios: Record<string, unknown> | null | undefined,
  pesos: Pick<Peso, 'criterio' | 'peso'>[],
  funcionarios: number | null | undefined,
  penalidadeRisco: boolean,
): { pontuacao: number; classe: Classe } {
  let soma = 0
  for (const p of pesos) {
    const n = Number(criterios?.[p.criterio] ?? 0)
    const nota = Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0
    soma += nota * p.peso
  }
  const pontuacao = Math.round(soma)
  let classe: Classe = pontuacao >= 70 ? 'A' : pontuacao >= 50 ? 'B' : 'C'
  if (funcionarios != null && funcionarios < 50) classe = 'C'
  if (penalidadeRisco) classe = classe === 'A' ? 'B' : 'C'
  return { pontuacao, classe }
}

// ---- e-mail --------------------------------------------------------------------------------------------
const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i
export const validarSintaxeEmail = (e: string) => e.length <= 254 && EMAIL_RE.test(e.trim())
const PREFIXOS_GENERICOS = ['logistica', 'compras', 'expedicao', 'comercial', 'vendas', 'contato', 'sac']
export function tipoEmail(e: string): 'generico' | 'pessoal' {
  const local = e.trim().toLowerCase().split('@')[0] ?? ''
  return PREFIXOS_GENERICOS.some((p) => local.startsWith(p)) ? 'generico' : 'pessoal'
}
export const dominioDoEmail = (e: string) => (e.trim().toLowerCase().split('@')[1] ?? '')

export function bloqueado(email: string, bloqueios: { tipo: string; valor: string }[]): boolean {
  const em = email.trim().toLowerCase()
  const dom = dominioDoEmail(em)
  return bloqueios.some((b) => (b.tipo === 'email' && b.valor === em) || (b.tipo === 'dominio' && b.valor === dom))
}

// Motivo pelo qual uma mensagem nao pode ser aprovada (o banco tambem barra, por gatilho). Null = pode.
export function motivoNaoAprovar(
  contato: { email: string; validacao_status: string } | null,
  bloqueios: { tipo: string; valor: string }[],
): string | null {
  if (!contato) return 'Contato não encontrado.'
  if (contato.validacao_status === 'invalido') return 'O e-mail do contato está inválido.'
  if (contato.validacao_status === 'devolvido') return 'O e-mail do contato foi devolvido.'
  if (bloqueado(contato.email, bloqueios)) return 'O e-mail ou o domínio do contato está na lista de bloqueio.'
  return null
}

export const soDigitos = (s: string) => (s ?? '').replace(/\D/g, '')
export const cnpjFormatoOk = (s: string) => soDigitos(s).length === 14

// ---- CSV -----------------------------------------------------------------------------------------------
export const COLUNAS_CSV = [
  'razao_social', 'nome_fantasia', 'cnpj', 'cnae', 'segmento', 'cidade', 'uf', 'funcionarios', 'site', 'telefone',
  'contato_nome', 'contato_cargo', 'contato_email', 'origem_contato',
] as const

// Le CSV (separador , ou ;, aspas duplas, BOM). Devolve linhas de objetos pelo cabecalho.
export function parseCsv(texto: string): Record<string, string>[] {
  const t = texto.replace(/^﻿/, '')
  const primeira = t.split(/\r?\n/, 1)[0] ?? ''
  const sep = (primeira.match(/;/g) ?? []).length > (primeira.match(/,/g) ?? []).length ? ';' : ','
  const linhas: string[][] = []
  let campo = ''
  let linha: string[] = []
  let aspas = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') { campo += '"'; i++ }
      else if (c === '"') aspas = false
      else campo += c
    } else if (c === '"') aspas = true
    else if (c === sep) { linha.push(campo); campo = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++
      linha.push(campo); campo = ''
      if (linha.some((x) => x.trim() !== '')) linhas.push(linha)
      linha = []
    } else campo += c
  }
  linha.push(campo)
  if (linha.some((x) => x.trim() !== '')) linhas.push(linha)
  if (linhas.length === 0) return []
  const cab = linhas[0].map((h) => h.trim().toLowerCase())
  return linhas.slice(1).map((l) => Object.fromEntries(cab.map((h, i) => [h, (l[i] ?? '').trim()])))
}

export type LinhaImport = {
  linha: number
  situacao: 'ok' | 'erro' | 'duplicada' | 'bloqueada'
  motivo?: string
  empresa?: {
    razao_social: string; nome_fantasia: string | null; cnpj: string; cnae: string | null; segmento: Segmento
    cidade: string | null; uf: string | null; funcionarios: number | null; site: string | null; telefone: string | null; origem_contato: string
  }
  contato?: { nome: string | null; cargo: string | null; email: string; tipo_email: 'generico' | 'pessoal'; validacao_status: 'sintaxe_ok' | 'invalido'; origem_contato: string }
}

// Valida as linhas antes de gravar. cnpjsExistentes / emailsExistentes: o que ja esta no banco (so digitos / minusculo).
export function analisarImportacao(
  linhas: Record<string, string>[],
  existentes: { cnpjs: Set<string>; emails: Set<string> },
  bloqueios: { tipo: string; valor: string }[],
): LinhaImport[] {
  const cnpjsVistos = new Set<string>()
  const emailsVistos = new Set<string>()
  return linhas.map((r, i) => {
    const n = i + 2 // linha na planilha (1 = cabecalho)
    const erro = (motivo: string): LinhaImport => ({ linha: n, situacao: 'erro', motivo })
    const origem = (r.origem_contato ?? '').trim()
    if (!origem) return erro('Sem origem_contato (obrigatório: de onde veio a empresa e o e-mail).')
    const cnpj = soDigitos(r.cnpj ?? '')
    if (cnpj.length !== 14) return erro('CNPJ inválido (precisa de 14 dígitos).')
    if (!(r.razao_social ?? '').trim()) return erro('Sem razão social.')
    const seg = (r.segmento ?? '').trim().toLowerCase() as Segmento
    if (!SEGMENTOS.includes(seg)) return erro(`Segmento inválido ("${r.segmento ?? ''}"). Use: ${SEGMENTOS.join(', ')}.`)
    const uf = (r.uf ?? '').trim().toUpperCase()
    if (uf && uf.length !== 2) return erro('UF inválida.')
    const funcTxt = (r.funcionarios ?? '').trim()
    const func = funcTxt === '' ? null : Number(soDigitos(funcTxt))
    if (funcTxt !== '' && !Number.isFinite(func)) return erro('Número de funcionários inválido.')
    const email = (r.contato_email ?? '').trim().toLowerCase()
    if (email && bloqueado(email, bloqueios)) return { linha: n, situacao: 'bloqueada', motivo: 'E-mail ou domínio na lista de bloqueio.' }
    if (existentes.cnpjs.has(cnpj) || cnpjsVistos.has(cnpj)) return { linha: n, situacao: 'duplicada', motivo: 'CNPJ já cadastrado (ou repetido na planilha).' }
    if (email && (existentes.emails.has(email) || emailsVistos.has(email))) return { linha: n, situacao: 'duplicada', motivo: 'E-mail já cadastrado (ou repetido na planilha).' }
    cnpjsVistos.add(cnpj)
    if (email) emailsVistos.add(email)
    return {
      linha: n, situacao: 'ok',
      empresa: {
        razao_social: r.razao_social.trim(), nome_fantasia: r.nome_fantasia?.trim() || null, cnpj, cnae: r.cnae?.trim() || null, segmento: seg,
        cidade: r.cidade?.trim() || null, uf: uf || null, funcionarios: func, site: r.site?.trim() || null, telefone: r.telefone?.trim() || null, origem_contato: origem,
      },
      contato: email
        ? { nome: r.contato_nome?.trim() || null, cargo: r.contato_cargo?.trim() || null, email, tipo_email: tipoEmail(email),
            validacao_status: validarSintaxeEmail(email) ? 'sintaxe_ok' : 'invalido', origem_contato: origem }
        : undefined,
    }
  })
}

// ---- modelo fixo do 1o toque ---------------------------------------------------------------------------
export const ASSUNTO_TOQUE1 = 'Frete de {segmento_legivel} saindo de {cidade} (RBR Cargo)'
export const CORPO_TOQUE1 = `Olá, tudo bem?

Meu nome é Pedro, da RBR Cargo. Somos uma agenciadora de cargas em São Paulo e atendemos indústrias com frete rodoviário em truck e carreta (baú, sider, graneleiro, prancha e munck).

Vi que vocês operam com {segmento_frase} e queria entender uma coisa: quantas cargas por semana vocês despacham hoje, e para quais regiões?

Com essa informação consigo avaliar se faz sentido eu preparar uma cotação comparativa para vocês, sem compromisso.

Se não for com você, pode me indicar quem cuida da logística?

Obrigado,

Pedro Henrique
RBR Cargo | Agenciamento e Transporte
(11) 5397-7966
pedro@rbrcargo.com.br
www.rbrcargo.com.br

Se preferir não receber mais mensagens, responda "sair".`

export function preencher(modelo: string, v: Record<string, string>): string {
  return modelo.replace(/\{([a-z_]+)\}/g, (m, k: string) => (k in v ? v[k] : m))
}

export function rascunhoToque1(emp: { segmento: Segmento; cidade: string | null }): { assunto: string; corpo: string } {
  const vars = {
    segmento_legivel: SEGMENTO_LEGIVEL[emp.segmento],
    segmento_frase: SEGMENTO_FRASE[emp.segmento],
    cidade: emp.cidade?.trim() || 'sua região',
  }
  return { assunto: preencher(ASSUNTO_TOQUE1, vars), corpo: preencher(CORPO_TOQUE1, vars) }
}

// Empresa elegivel ao rascunho do 1o toque: classe A ou B e contato com sintaxe ok.
export const podeGerarRascunho = (classe: string, validacao: string | null | undefined) =>
  (classe === 'A' || classe === 'B') && validacao === 'sintaxe_ok'

export function linkWhatsapp(n: string | null | undefined): string | null {
  const d = soDigitos(n ?? '')
  return d ? `https://wa.me/${d.length <= 11 ? `55${d}` : d}` : null
}

// Texto puro: sem HTML.
export const temHtml = (s: string) => /<\/?[a-z][\s\S]*>/i.test(s)
