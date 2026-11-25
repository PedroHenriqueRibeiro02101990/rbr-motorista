// Logica pura do "Novo cadastro por documentos" (Parte A, etapas 4 a 6): monta o payload da RPC confirmar_cadastro_por_documentos,
// resume o que sera criado, junta as validacoes e lista os cadastros para corrigir. Teste: node --test gestor/test/cadastroPorDocumentos.test.ts
import type { Normalizado } from '../../../supabase/functions/_shared/extracao-documentos.ts'
import { resolverTara, classeDoVeiculo } from '../../../supabase/functions/_shared/tara-aproximada.ts'
import { carroceriaParaMdfe, cpfValido, eReboquePorTipoCrlv, tipoVeiculoDoCrlv, validarCnh, validarProprietario, validarVeiculo, type Achado } from '../../../supabase/functions/_shared/validacoes-cadastro.ts'
import { decidirTitular } from './titularVeiculo.ts'

// Flag do fluxo novo: padrao DESLIGADO (so liga com VITE_CADASTRO_POR_DOCUMENTOS=true no build da Vercel).
export const CADASTRO_POR_DOCUMENTOS_HABILITADO = import.meta.env?.VITE_CADASTRO_POR_DOCUMENTOS === 'true'

// Botao "Cadastrar na Repom": padrao DESLIGADO (VITE_REPOM_CADASTRO_HABILITADO=true so quando o Pedro e a Karen liberarem).
export const REPOM_CADASTRO_HABILITADO = import.meta.env?.VITE_REPOM_CADASTRO_HABILITADO === 'true'

export interface DocumentoLido {
  path: string
  tipo: string
  normalizado: Normalizado | null
  /** edicoes da pessoa: campo -> valor confirmado */
  edicoes?: Record<string, string | number | null>
}

const val = (d: Normalizado | undefined, k: string, ed?: Record<string, string | number | null>) => {
  if (ed && k in ed) return ed[k]
  const v = d?.campos[k]?.valor
  return v === undefined ? null : v
}

/** Documento enviado que a RPC vincula a pessoa/veiculo (D1): `path` e o caminho no bucket cadastro-documentos. */
export interface DocumentoVinculado { tipo: string; path: string; alvo: 'motorista' | 'cavalo' | 'carreta'; data?: string | null }

export interface PayloadCadastro {
  motorista?: Record<string, unknown>
  cavalo?: Record<string, unknown>
  carreta?: Record<string, unknown>
  complemento?: Record<string, unknown>
  /** Dados bancarios lidos: a RPC so grava se a pessoa nao tem banco/PIX (senao avisa). */
  banco?: Record<string, unknown>
  auditoria: Record<string, unknown>[]
  manual: string[]
  /** D1: arquivos que a RPC grava em documentos_pessoais_imagens (+ colunas da pessoa) para aparecerem no cadastro. */
  documentos: DocumentoVinculado[]
  /** D5: documentos recebidos que NAO cabem no cadastro (ex.: 2o CRLV de cavalo). Nao vao para a RPC; a tela avisa/bloqueia. */
  excedentes: { tipo: string; descricao: string; bloqueia: boolean }[]
}

// Tipos de documento pessoal que a RPC guarda no cadastro da pessoa (a que o CNH/CPF/RG identificam).
const TIPOS_PESSOAIS = ['cnh', 'rg', 'cpf', 'rntrc', 'comprovante_residencia', 'dados_bancarios'] as const

function veiculoDoCrlv(doc: DocumentoLido, tara: { valor: number | null; origem: string | null }): Record<string, unknown> {
  const d = doc.normalizado!
  const ed = doc.edicoes
  const g = (k: string) => val(d, k, ed)
  const tipoVeiculo = tipoVeiculoDoCrlv(g('especie_tipo') as string | null, g('quantidade_eixos') as number | null).tipo
  return {
    placa: g('placa'), renavam: g('renavam'), chassi: g('chassi'), tipo_crlv: g('especie_tipo'),
    tipo_veiculo: tipoVeiculo, tipo_carroceria: carroceriaDoCadastro(tipoVeiculo, g('carroceria') as string | null),
    proprietario_nome: g('nome_proprietario'),
    quantidade_eixos: g('quantidade_eixos'), tara_kg: tara.valor, tara_origem: tara.origem,
    capacidade_carga: g('capacidade_carga'), pbt_kg: g('pbt'), cmt_kg: g('cmt'), uf_licenciamento: g('uf'), crlv_exercicio: g('exercicio'),
    proprietario_documento: g('cpf_cnpj_proprietario'), marca_modelo: g('marca_modelo'), ano: g('ano_modelo') ?? g('ano_fabricacao'),
    crlv_foto_url: `cadastro-documentos/${doc.path}`, crlv_extracao_id: `cadastro-documentos/${doc.path}`,
  }
}

/** D6: grava a carroceria no texto que o emissor do MDF-e entende. Cavalo mecanico nao usa carroceria no MDF-e (o emissor manda "nao aplicavel"):
 *  so grava se o texto for reconhecido. Truck/toco/carreta: se o texto nao for reconhecido, guarda o texto cru e a tela avisa (achadosDoPayload). */
function carroceriaDoCadastro(tipoVeiculo: string | null, texto: string | null): string | null {
  const c = carroceriaParaMdfe(texto)
  if (tipoVeiculo === 'cavalo mecanico') return c.reconhecida ? c.valor : null
  return c.valor
}

/** Tara a gravar: so o que a pessoa confirmou (ou a derivada do CRLV, que ela viu e confirmou). Nunca inventa. */
function taraConfirmada(doc: DocumentoLido): { valor: number | null; origem: string | null } {
  const ed = doc.edicoes
  if (ed && 'tara' in ed) return { valor: ed.tara === null ? null : Number(ed.tara), origem: 'confirmada' }
  if (ed && ed.tara_derivada === 1 && doc.normalizado?.deducoes.tara_derivada_crlv) return { valor: Number(doc.normalizado.deducoes.tara_derivada_crlv.valor), origem: 'derivada_crlv' }
  const v = doc.normalizado?.campos.tara?.valor
  return { valor: typeof v === 'number' ? v : null, origem: typeof v === 'number' ? 'confirmada' : null }
}

const soDigitos = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v).replace(/\D/g, '') || null)
const soAlfa = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v).toUpperCase().replace(/[^0-9A-Z]/g, '') || null)

/** O que o banco recebe: placa maiuscula sem traco, CPF/RENAVAM so digitos, documento do proprietario sem pontuacao, UF maiuscula.
 *  Vale tambem para o que a pessoa digitou na conferencia (a RPC procura pessoa por CPF e veiculo por placa EXATOS: formato diferente duplica o cadastro). */
function normalizarPayload(out: PayloadCadastro): PayloadCadastro {
  if (out.motorista) {
    out.motorista.cpf = soDigitos(out.motorista.cpf)
    out.motorista.cep = soDigitos(out.motorista.cep)
    out.motorista.rntrc_numero = soDigitos(out.motorista.rntrc_numero)
    if (out.motorista.uf) out.motorista.uf = String(out.motorista.uf).trim().toUpperCase().slice(0, 2)
  }
  if (out.complemento?.rg_uf) out.complemento.rg_uf = String(out.complemento.rg_uf).trim().toUpperCase().slice(0, 2)
  for (const v of [out.cavalo, out.carreta]) {
    if (!v) continue
    v.placa = soAlfa(v.placa)
    v.renavam = soDigitos(v.renavam)
    v.chassi = soAlfa(v.chassi)
    v.proprietario_documento = soAlfa(v.proprietario_documento)
    v.proprietario_nome = v.proprietario_nome ? String(v.proprietario_nome).trim().replace(/\s+/g, ' ') || null : null
    if (v.uf_licenciamento) v.uf_licenciamento = String(v.uf_licenciamento).trim().toUpperCase().slice(0, 2)
  }
  return out
}

export function montarPayload(docs: DocumentoLido[]): PayloadCadastro {
  return normalizarPayload(montarPayloadBruto(docs))
}

function montarPayloadBruto(docs: DocumentoLido[]): PayloadCadastro {
  const out: PayloadCadastro = { auditoria: [], manual: [], documentos: [], excedentes: [] }
  const por = (t: string) => docs.filter((d) => d.tipo === t && d.normalizado)
  const cnh = por('cnh')[0], rg = por('rg')[0], cpf = por('cpf')[0], cr = por('comprovante_residencia')[0], rntrc = por('rntrc')[0]

  if (cnh || rg || cpf) {
    const doc = cnh ?? rg ?? cpf!
    const nome = val(cnh?.normalizado ?? undefined, 'nome', cnh?.edicoes) ?? val(rg?.normalizado ?? undefined, 'nome', rg?.edicoes) ?? val(cpf?.normalizado ?? undefined, 'nome', cpf?.edicoes)
    const cpfNum = val(cnh?.normalizado ?? undefined, 'cpf', cnh?.edicoes) ?? val(cpf?.normalizado ?? undefined, 'cpf', cpf?.edicoes) ?? val(rg?.normalizado ?? undefined, 'cpf', rg?.edicoes)
    out.motorista = {
      nome, cpf: cpfNum,
      cnh_numero_registro: val(cnh?.normalizado ?? undefined, 'numero_registro', cnh?.edicoes), cnh_categoria: val(cnh?.normalizado ?? undefined, 'categoria', cnh?.edicoes),
      cnh_validade: val(cnh?.normalizado ?? undefined, 'validade', cnh?.edicoes),
      data_nascimento: val(cnh?.normalizado ?? undefined, 'data_nascimento', cnh?.edicoes) ?? val(rg?.normalizado ?? undefined, 'data_nascimento', rg?.edicoes) ?? val(cpf?.normalizado ?? undefined, 'data_nascimento', cpf?.edicoes),
      rntrc_numero: val(rntrc?.normalizado ?? undefined, 'numero', rntrc?.edicoes),
    }
    // Parte D etapa 26: RG e genero para a Repom. O genero e SUGESTAO: so entra se a pessoa confirmou (edicoes.genero).
    out.complemento = {
      rg_numero: val(rg?.normalizado ?? undefined, 'numero_rg', rg?.edicoes), rg_orgao_emissor: val(rg?.normalizado ?? undefined, 'orgao_emissor', rg?.edicoes), rg_uf: val(rg?.normalizado ?? undefined, 'uf_emissor', rg?.edicoes),
      genero: ((cnh ?? rg ?? cpf)?.edicoes?.genero as string | undefined) ?? null,
    }
    const bc = por('dados_bancarios')[0]
    if (bc?.normalizado) {
      const g = (k: string) => val(bc.normalizado!, k, bc.edicoes)
      out.banco = { banco_codigo: g('banco_codigo'), agencia: g('agencia'), conta: g('conta'), tipo_conta: g('tipo_conta'), pix: g('pix'), documento_titular: soDigitos(g('cpf_cnpj')) }
    }
    if (cr?.normalizado) {
      const g = (k: string) => val(cr.normalizado!, k, cr.edicoes)
      Object.assign(out.motorista, { cep: g('cep'), logradouro: g('logradouro'), numero_endereco: g('numero'), complemento: g('complemento'), bairro: g('bairro'), cidade: g('cidade'), uf: g('uf') })
    }
    void doc
  }

  const crlvs = por('crlv')
  for (const d of crlvs) {
    const reb = eReboquePorTipoCrlv(val(d.normalizado!, 'especie_tipo', d.edicoes) as string | null)
    const v = veiculoDoCrlv(d, taraConfirmada(d))
    const alvo: 'cavalo' | 'carreta' = reb ? 'carreta' : 'cavalo'
    // D5: cabe 1 cavalo (veiculo de tracao) e 1 carreta. O resto NAO e descartado em silencio: vira excedente (a tela bloqueia).
    if (out[alvo]) { out.excedentes.push({ tipo: 'crlv', descricao: `CRLV extra de ${alvo === 'cavalo' ? 'veiculo de tracao' : 'carreta'} (${String(v.placa ?? 'sem placa')}): o cadastro aceita 1 cavalo e 1 carreta por vez`, bloqueia: true }); continue }
    out[alvo] = v
    out.documentos.push({ tipo: 'crlv', path: d.path, alvo })
  }

  // D1: os documentos pessoais ficam vinculados a pessoa (so o 1o de cada tipo e usado nos campos; os extras viram aviso).
  for (const t of TIPOS_PESSOAIS) {
    const lista = por(t)
    if (!lista.length) continue
    out.documentos.push({ tipo: t, path: lista[0].path, alvo: 'motorista', ...(t === 'comprovante_residencia' ? { data: (val(lista[0].normalizado!, 'data_emissao', lista[0].edicoes) as string | null) ?? null } : {}) })
    for (const extra of lista.slice(1)) out.excedentes.push({ tipo: t, descricao: `2o documento do tipo ${t} (${extra.path.split('/').pop()}) nao foi usado nem vinculado`, bloqueia: false })
  }

  for (const d of docs) {
    if (!d.normalizado) continue
    const entidade = d.tipo === 'crlv' ? (eReboquePorTipoCrlv(val(d.normalizado, 'especie_tipo', d.edicoes) as string | null) ? 'carreta' : 'cavalo') : 'motorista'
    for (const [campo, c] of Object.entries(d.normalizado.campos)) {
      const editado = !!d.edicoes && campo in d.edicoes
      if (!editado && c.valor === null) continue
      out.auditoria.push({
        entidade, campo, valor_extraido: c.valor === null ? null : String(c.valor), valor_confirmado: editado ? String(d.edicoes![campo]) : c.valor === null ? null : String(c.valor),
        editado, confianca: c.confianca, documento_path: d.path, documento_tipo: d.tipo,
      })
      if (editado) out.manual.push(campo)
    }
  }
  return out
}

export function resumoDoQueSeraCriado(p: PayloadCadastro): string {
  const itens: string[] = []
  if (p.motorista) itens.push('1 motorista')
  if (p.cavalo) itens.push('1 cavalo')
  if (p.carreta) itens.push(p.cavalo ? '1 carreta vinculada ao cavalo' : '1 carreta')
  return itens.length ? itens.join(', ') : 'nada ainda: envie ao menos um documento'
}

/** Linhas "quem sera o titular de cada veiculo" para a tela: sempre o proprietario do CRLV. */
export function titularesDoPayload(p: PayloadCadastro): string[] {
  const out: string[] = []
  for (const [rotulo, v] of [['Cavalo', p.cavalo], ['Carreta', p.carreta]] as const) {
    if (!v) continue
    const dec = decidirTitular({ documento: v.proprietario_documento as string | null, nome: v.proprietario_nome as string | null, uf: v.uf_licenciamento as string | null }, [])
    if (dec.acao === 'bloquear') continue
    out.push(`${rotulo} ${String(v.placa ?? '')}: titular = proprietario do CRLV, ${String(v.proprietario_nome ?? '(nome do cadastro existente)')} (${String(v.proprietario_documento)}). Se esse CPF/CNPJ ja estiver cadastrado usa o cadastro; senao cria o titular.`)
  }
  return out
}

export function achadosDoPayload(p: PayloadCadastro, hoje: string): Achado[] {
  const out: Achado[] = []
  const m = p.motorista
  // A RPC so cria/atualiza o motorista quando ha CPF: sem CPF ele seria IGNORADO em silencio e o veiculo ficaria no nome de quem cadastrou.
  if (m && !cpfValido(m.cpf)) out.push({ nivel: 'bloqueio', campo: 'cpf', mensagem: 'Motorista sem CPF valido: sem o CPF o cadastro do motorista nao e criado. Digite o CPF (CNH, RG ou CPF).' })
  if (m && !m.nome) out.push({ nivel: 'bloqueio', campo: 'nome', mensagem: 'Motorista sem nome: digite o nome como esta na CNH.' })
  // Conta de outra pessoa: avisa (a RPC grava so em quem ainda nao tem dado bancario).
  const docBanco = p.banco?.documento_titular as string | null | undefined
  if (m && docBanco && m.cpf && docBanco !== m.cpf) out.push({ nivel: 'aviso', campo: 'dados_bancarios', mensagem: 'Os dados bancarios sao de outro CPF/CNPJ que nao o do motorista. Confira antes de confirmar.' })
  for (const x of p.excedentes) out.push({ nivel: x.bloqueia ? 'bloqueio' : 'aviso', campo: x.tipo, mensagem: `${x.bloqueia ? 'Remova da lista: ' : ''}${x.descricao}.` })
  if (m) out.push(...validarCnh({ validade: m.cnh_validade as string | null, data_nascimento: m.data_nascimento as string | null }, hoje))
  for (const [rotulo, v] of [['Cavalo', p.cavalo], ['Carreta', p.carreta]] as const) {
    if (!v) continue
    // Sem RENAVAM a RPC grava 'PENDENTE-<placa>' no campo e o emissor/Repom leem esse texto como se fosse o RENAVAM.
    if (!v.renavam) out.push({ nivel: 'bloqueio', campo: 'renavam', mensagem: `${rotulo}: RENAVAM nao lido. Digite o RENAVAM do CRLV (sem ele o cadastro ficaria com um valor provisorio).` })
    // C1: o titular e o proprietario do CRLV (nunca o motorista do lote nem quem esta logado). Sem documento/nome do dono nao ha titular a criar.
    const dec = decidirTitular({ documento: v.proprietario_documento as string | null, nome: v.proprietario_nome as string | null, uf: v.uf_licenciamento as string | null }, [])
    if (dec.acao === 'bloquear') out.push({ nivel: 'bloqueio', campo: 'proprietario', mensagem: `${rotulo}: ${dec.motivo}` })
    // D6: carroceria que o emissor do MDF-e nao entende bloqueia a emissao: avisa na entrada, nao so na previa.
    const carr = carroceriaParaMdfe(v.tipo_carroceria as string | null)
    if (v.tipo_veiculo !== 'cavalo mecanico') {
      if (!carr.valor) out.push({ nivel: 'aviso', campo: 'tipo_carroceria', mensagem: `${rotulo}: carroceria nao lida do CRLV. O MDF-e exige (aberta, bau/fechada, sider, graneleira, container): preencha em Cadastros antes de emitir.` })
      else if (!carr.reconhecida) out.push({ nivel: 'aviso', campo: 'tipo_carroceria', mensagem: `${rotulo}: carroceria "${carr.valor}" nao tem equivalente no MDF-e (aberta, bau/fechada, sider, graneleira, container). Ajuste em Cadastros antes de emitir.` })
    }
    const tv = tipoVeiculoDoCrlv(v.tipo_crlv as string | null, v.quantidade_eixos as number | null)
    if (tv.tipo === null) out.push({ nivel: 'aviso', campo: 'tipo_veiculo', mensagem: `${rotulo}: o CRLV nao diz se e truck, toco, van ou utilitario. O tipo fica como estava no cadastro (ou vazio): ajuste em Cadastros antes de emitir o MDF-e.` })
    else if (tv.inferido) out.push({ nivel: 'aviso', campo: 'tipo_veiculo', mensagem: `${rotulo}: tipo do veiculo definido pelos eixos (${String(v.quantidade_eixos)} eixos = ${tv.tipo}). Confira.` })
    const ach = validarVeiculo({
      placa: v.placa as string, tipo_crlv: v.tipo_crlv as string, tipo_veiculo: (v.tipo_veiculo as string) ?? '', quantidade_eixos: v.quantidade_eixos as number,
      tara_kg: v.tara_kg as number, capacidade_carga: v.capacidade_carga as number, pbt_kg: v.pbt_kg as number, carreta_vinculada: rotulo === 'Cavalo' ? !!p.carreta : true,
    })
    out.push(...ach.filter((a) => a.nivel !== 'ok').map((a) => ({ ...a, mensagem: `${rotulo}: ${a.mensagem}` })))
    out.push(...validarProprietario({ proprietario_documento: v.proprietario_documento as string, motorista_documento: m?.cpf as string }).filter((a) => !(dec.acao === 'bloquear' && a.nivel === 'bloqueio' && a.campo === 'proprietario_documento')).map((a) => ({ ...a, mensagem: `${rotulo}: ${a.mensagem}` })))
  }
  return out
}

export const temBloqueio = (a: Achado[]) => a.some((x) => x.nivel === 'bloqueio')

export interface VeiculoParaCorrigir { id?: string; placa: string; tara_kg: number | string | null; capacidade_carga: number | string | null; e_reboque?: boolean | null; tipo_veiculo?: string | null; quantidade_eixos?: number | null; motivos: string[] }

/** Lista "cadastros para corrigir": tara ou capacidade fora da faixa, ou carreta sem a marca de reboque. NAO altera nada. */
export function veiculosParaCorrigir(vs: { id?: string; placa: string; tara_kg: number | string | null; capacidade_carga: number | string | null; e_reboque?: boolean | null; tipo_veiculo?: string | null; quantidade_eixos?: number | null }[]): VeiculoParaCorrigir[] {
  const out: VeiculoParaCorrigir[] = []
  for (const v of vs) {
    const motivos: string[] = []
    const classe = classeDoVeiculo(v)
    const tara = v.tara_kg === null || v.tara_kg === '' ? null : Number(v.tara_kg)
    const cap = v.capacidade_carga === null || v.capacidade_carga === '' ? null : Number(v.capacidade_carga)
    if (tara !== null) {
      const [min, max] = classe === 'carreta' ? [2000, 20000] : [1000, 30000]
      if (!(tara >= min && tara <= max)) motivos.push(`tara ${tara} fora da faixa (${min} a ${max} kg): provavel erro de unidade`)
      else if (resolverTara(v).origem === 'confirmada' && classe === 'cavalo' && (tara < 6500 || tara > 11500)) motivos.push(`tara ${tara} fora da faixa usual do cavalo (aviso)`)
    }
    if (cap !== null && !(cap >= 1000 && cap <= 80000)) motivos.push(`capacidade ${cap} fora da faixa (1.000 a 80.000 kg): provavel erro de unidade`)
    if (motivos.length) out.push({ ...v, motivos })
  }
  return out
}

// ---- Etapa 32: leitura resistente (estado de cada documento) ----
export type EstadoLeitura = 'enviando' | 'lendo' | 'lido' | 'parcial' | 'falhou_ia' | 'nao_reconhecido' | 'erro_arquivo'
export interface ResultadoLeitura {
  sucesso?: boolean; tipo?: string; normalizado?: unknown; codigo?: string; erro?: string; aviso?: string
  /** 25/11: leitura sem IA / fila da IA gratuita. 'texto' = leu pelo texto do PDF; 'parcial' = leu parte; 'ia' = IA gratuita */
  origem_leitura?: 'texto' | 'parcial' | 'ia'; na_fila?: boolean; leitura_id?: string; campos_faltantes?: string[]; ia_gratis?: boolean
}

export const MSG_OCUPADA = 'A leitura automatica esta ocupada agora. Tente de novo em instantes.'
export const MSG_FOTO_SEM_LEITURA = 'Foto nao pode ser lida agora; envie o PDF original (CNH digital, CRLV-e) ou preencha manualmente.'
export const AVISO_PARCIAL = 'Li parte do documento pelo texto; confira e preencha o que falta.'
/** Tempo maximo esperando a fila da IA gratuita (o Agente no PC le a foto); depois disso, preenchimento manual com o que ja foi lido. */
export const ESPERA_FILA_MS = 60_000
export const INTERVALO_FILA_MS = 3_000
export const ehFoto = (path: string) => !/\.pdf$|\.xml$/i.test(path)

/** Traduz o resultado de UM arquivo da funcao em estado do cartao. Falha da IA NUNCA vira "tipo nao reconhecido". */
export function estadoDaLeitura(r: ResultadoLeitura | null | undefined, falhaDeTransporte = false, foto = false): { estado: EstadoLeitura; mensagem?: string } {
  if (falhaDeTransporte || !r) return { estado: 'falhou_ia', mensagem: foto ? MSG_FOTO_SEM_LEITURA : MSG_OCUPADA }
  if (r.sucesso === false) {
    if (r.codigo === 'erro_leitura') return { estado: 'erro_arquivo', mensagem: r.erro }
    return { estado: 'falhou_ia', mensagem: r.erro ?? (foto ? MSG_FOTO_SEM_LEITURA : MSG_OCUPADA) }
  }
  if (r.na_fila) return { estado: 'lendo', mensagem: r.aviso }
  if (!r.normalizado) return { estado: 'nao_reconhecido', mensagem: r.aviso }
  if (r.origem_leitura === 'parcial') return { estado: 'parcial', mensagem: r.aviso ?? AVISO_PARCIAL }
  return { estado: 'lido' }
}

export const ROTULO_ESTADO: Record<EstadoLeitura, string> = {
  enviando: 'Enviando...', lendo: 'Lendo...', lido: 'Lido', parcial: 'Lido em parte - confira', falhou_ia: 'Nao foi possivel ler agora', nao_reconhecido: 'Outro (nao reconhecido)', erro_arquivo: 'Arquivo com problema',
}

/** Texto do resumo quando nada sera criado: explica a causa quando e falha de leitura. */
export function textoResumoVazio(estados: EstadoLeitura[]): string {
  if (estados.some((e) => e === 'falhou_ia' || e === 'lendo' || e === 'enviando')) return 'Nenhum documento foi lido ainda. Use Tentar de novo ou preencha manualmente.'
  return 'nada ainda: envie ao menos um documento'
}
