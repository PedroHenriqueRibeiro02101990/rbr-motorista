// Logica pura do "Novo cadastro por documentos" (Parte A, etapas 4 a 6): monta o payload da RPC confirmar_cadastro_por_documentos,
// resume o que sera criado, junta as validacoes e lista os cadastros para corrigir. Teste: node --test gestor/test/cadastroPorDocumentos.test.ts
import type { Normalizado } from '../../../supabase/functions/_shared/extracao-documentos.ts'
import { resolverTara, classeDoVeiculo } from '../../../supabase/functions/_shared/tara-aproximada.ts'
import { eReboquePorTipoCrlv, validarCnh, validarProprietario, validarVeiculo, type Achado } from '../../../supabase/functions/_shared/validacoes-cadastro.ts'

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

export interface PayloadCadastro {
  motorista?: Record<string, unknown>
  cavalo?: Record<string, unknown>
  carreta?: Record<string, unknown>
  complemento?: Record<string, unknown>
  auditoria: Record<string, unknown>[]
  manual: string[]
}

function veiculoDoCrlv(doc: DocumentoLido, tara: { valor: number | null; origem: string | null }): Record<string, unknown> {
  const d = doc.normalizado!
  const ed = doc.edicoes
  const g = (k: string) => val(d, k, ed)
  const reb = eReboquePorTipoCrlv(g('especie_tipo') as string | null)
  return {
    placa: g('placa'), renavam: g('renavam'), chassi: g('chassi'), tipo_crlv: g('especie_tipo'),
    tipo_veiculo: reb ? 'semirreboque' : 'cavalo mecanico', tipo_carroceria: g('carroceria'),
    quantidade_eixos: g('quantidade_eixos'), tara_kg: tara.valor, tara_origem: tara.origem,
    capacidade_carga: g('capacidade_carga'), pbt_kg: g('pbt'), cmt_kg: g('cmt'), uf_licenciamento: g('uf'), crlv_exercicio: g('exercicio'),
    proprietario_documento: g('cpf_cnpj_proprietario'), marca_modelo: g('marca_modelo'), ano: g('ano_modelo') ?? g('ano_fabricacao'),
    crlv_foto_url: `cadastro-documentos/${doc.path}`, crlv_extracao_id: `cadastro-documentos/${doc.path}`,
  }
}

/** Tara a gravar: so o que a pessoa confirmou (ou a derivada do CRLV, que ela viu e confirmou). Nunca inventa. */
function taraConfirmada(doc: DocumentoLido): { valor: number | null; origem: string | null } {
  const ed = doc.edicoes
  if (ed && 'tara' in ed) return { valor: ed.tara === null ? null : Number(ed.tara), origem: 'confirmada' }
  if (ed && ed.tara_derivada === 1 && doc.normalizado?.deducoes.tara_derivada_crlv) return { valor: Number(doc.normalizado.deducoes.tara_derivada_crlv.valor), origem: 'derivada_crlv' }
  const v = doc.normalizado?.campos.tara?.valor
  return { valor: typeof v === 'number' ? v : null, origem: typeof v === 'number' ? 'confirmada' : null }
}

export function montarPayload(docs: DocumentoLido[]): PayloadCadastro {
  const out: PayloadCadastro = { auditoria: [], manual: [] }
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
    if (reb) out.carreta = v
    else if (!out.cavalo) out.cavalo = v
    else out.carreta = out.carreta ?? v
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

export function achadosDoPayload(p: PayloadCadastro, hoje: string): Achado[] {
  const out: Achado[] = []
  const m = p.motorista
  if (m) out.push(...validarCnh({ validade: m.cnh_validade as string | null, data_nascimento: m.data_nascimento as string | null }, hoje))
  for (const [rotulo, v] of [['Cavalo', p.cavalo], ['Carreta', p.carreta]] as const) {
    if (!v) continue
    const ach = validarVeiculo({
      placa: v.placa as string, tipo_crlv: v.tipo_crlv as string, tipo_veiculo: v.tipo_veiculo as string, quantidade_eixos: v.quantidade_eixos as number,
      tara_kg: v.tara_kg as number, capacidade_carga: v.capacidade_carga as number, pbt_kg: v.pbt_kg as number, carreta_vinculada: rotulo === 'Cavalo' ? !!p.carreta : true,
    })
    out.push(...ach.filter((a) => a.nivel !== 'ok').map((a) => ({ ...a, mensagem: `${rotulo}: ${a.mensagem}` })))
    out.push(...validarProprietario({ proprietario_documento: v.proprietario_documento as string, motorista_documento: m?.cpf as string }).map((a) => ({ ...a, mensagem: `${rotulo}: ${a.mensagem}` })))
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
