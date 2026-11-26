// Cálculo da cotação em UMA chamada: km (OSRM), piso ANTT (tabela vigente na data da consulta) e pedágio (Repom, roteirização).
// Funções puras com dependências injetadas (testes usam mocks; a função calcular-cotacao-rota injeta Supabase, OSRM e a Repom).
// Regras: falha parcial devolve o que deu certo e uma mensagem simples do que falhou; NUNCA inventa valor e NUNCA usa linha reta.
import { precoPorLucro, referenciaDeVenda, r2, type OpcaoReferencia } from './precoCotacao.ts'
import type { EntradaPedagio, SaidaPedagio } from './repomPedagio.ts'

export interface PontoCidade { cidade: string; uf: string; ibge?: string | null }
export interface EntradaCotacaoRota {
  origem: PontoCidade
  destino: PontoCidade
  tipoCarga: string
  eixos: number
  tabela?: string // padrão A (lotação, composição completa)
  incluirVolta?: boolean // padrão false
  eixosSuspensosIda?: number
  eixosSuspensosVolta?: number
  dataConsulta?: string // AAAA-MM-DD; padrão hoje (escolhe a linha de coeficientes vigente nessa data)
}
export interface CidadeResolvida { ibge: string | null; lat: number; lon: number }
export interface CoefEscolhido { ccd: number; cc: number; vigencia: string; fonte: string | null; aConfirmar: boolean }
export interface RotaOsrm { km: number; horas: number; geometria?: [number, number][] }

export interface DepsCotacaoRota {
  hoje: string
  ambiente: 'qa' | 'prd'
  resolverCidade(c: PontoCidade): Promise<CidadeResolvida | null>
  osrm(o: CidadeResolvida, d: CidadeResolvida): Promise<RotaOsrm | null>
  coeficiente(tabela: string, tipoCarga: string, eixos: number, data: string): Promise<CoefEscolhido | null>
  pedagio(e: EntradaPedagio): Promise<SaidaPedagio>
  parametros: { aliquota: number; margemMin: number; fatorRetornoVazio: number | null }
}

export interface PisoSaida {
  valor: number
  comRetornoVazio: boolean
  tabela: string
  tipoCarga: string
  eixos: number
  ccdPorKm: number
  ccFixo: number
  vigencia: string
  fonte: string | null
  aConfirmar: boolean
}
export interface PedagioSaida {
  total: number
  ida: number | null
  volta: number | null
  rodovias: string | null
  pracas: { nome: string; rodovia: string | null; valor: number | null }[]
  fonte: 'Repom'
  ambiente: 'qa' | 'prd'
  consultadoEm: string
  doCache: boolean
  distanciaKmRepom: number | null
}
export interface SaidaCotacaoRota {
  ok: boolean // true se ao menos o km foi calculado
  km: number | null
  duracaoHoras: number | null
  kmFonte: string
  geometria: [number, number][] | null
  rotaEnviadaRepom: 'IBGE'
  incluirVolta: boolean
  piso: PisoSaida | null
  pisoErro: string | null
  pedagio: PedagioSaida | null
  pedagioErro: string | null
  custo: number | null // piso + pedágio (só quando os dois deram certo)
  referencia: OpcaoReferencia[] | null
  avisos: string[]
  ambiente: 'qa' | 'prd'
  emTeste: boolean
  erro: string | null // quando nada deu certo
}

const MSG_ROTA = 'Não consegui calcular a rota entre essas cidades agora. Tente de novo em instantes.'
const MSG_PEDAGIO = 'Não consegui o pedágio agora. Informe o valor à mão.'

export function validarEntrada(e: EntradaCotacaoRota): string | null {
  if (!e.origem?.cidade || !e.origem?.uf || !e.destino?.cidade || !e.destino?.uf) return 'Informe origem e destino (cidade e UF).'
  if (!e.tipoCarga) return 'Informe o tipo de carga.'
  if (!Number.isInteger(e.eixos) || e.eixos < 2 || e.eixos > 15) return 'Informe o número de eixos (de 2 a 15).'
  return null
}

/** Piso = CC + CCD x km. Com retorno vazio (só se o fator oficial estiver configurado): CC + CCD x km x (1 + fator). */
export function calcularPiso(coef: CoefEscolhido, km: number, comRetornoVazio: boolean, fator: number | null): number {
  const multiplicador = comRetornoVazio && fator != null ? 1 + fator : 1
  return r2(coef.cc + coef.ccd * km * multiplicador)
}

export async function calcularCotacaoRota(e: EntradaCotacaoRota, deps: DepsCotacaoRota): Promise<SaidaCotacaoRota> {
  const tabela = e.tabela || 'A'
  const incluirVolta = e.incluirVolta === true
  const data = e.dataConsulta || deps.hoje
  const avisos: string[] = []
  const saida: SaidaCotacaoRota = {
    ok: false, km: null, duracaoHoras: null, kmFonte: 'OSRM/OpenStreetMap (estimativa de rota rodoviária, pode divergir da rota real)', geometria: null,
    rotaEnviadaRepom: 'IBGE', incluirVolta, piso: null, pisoErro: null, pedagio: null, pedagioErro: null, custo: null, referencia: null,
    avisos, ambiente: deps.ambiente, emTeste: deps.ambiente !== 'prd', erro: null,
  }
  const invalido = validarEntrada(e)
  if (invalido) return { ...saida, erro: invalido }

  // 1) cidades -> coordenadas e IBGE
  let o: CidadeResolvida | null = null
  let d: CidadeResolvida | null = null
  try {
    o = await deps.resolverCidade(e.origem)
    d = await deps.resolverCidade(e.destino)
  } catch {
    o = d = null
  }
  if (!o) return { ...saida, erro: `Não localizei a origem "${e.origem.cidade}/${e.origem.uf}". Confira o nome da cidade.` }
  if (!d) return { ...saida, erro: `Não localizei o destino "${e.destino.cidade}/${e.destino.uf}". Confira o nome da cidade.` }

  // 2) km (OSRM). Sem linha reta: se falhar, não há km e o piso não é calculado.
  let rota: RotaOsrm | null = null
  try {
    rota = await deps.osrm(o, d)
  } catch {
    rota = null
  }
  if (rota) {
    saida.ok = true
    saida.km = Math.round(rota.km * 10) / 10
    saida.duracaoHoras = Math.round(rota.horas * 10) / 10
    saida.geometria = rota.geometria ?? null
  } else {
    avisos.push(MSG_ROTA)
  }

  // 3) piso ANTT (precisa do km)
  if (saida.km != null) {
    try {
      const coef = await deps.coeficiente(tabela, e.tipoCarga, e.eixos, data)
      if (!coef) {
        saida.pisoErro = `Não achei coeficiente da ANTT para a tabela ${tabela}, "${e.tipoCarga}" e ${e.eixos} eixos.`
      } else {
        const fator = deps.parametros.fatorRetornoVazio
        const retorno = incluirVolta && fator != null
        if (incluirVolta && fator == null) avisos.push('Retorno vazio não incluído no piso: o fator oficial ainda não está configurado. O piso mostrado é só de ida.')
        saida.piso = { valor: calcularPiso(coef, saida.km, retorno, fator), comRetornoVazio: retorno, tabela, tipoCarga: e.tipoCarga, eixos: e.eixos, ccdPorKm: coef.ccd, ccFixo: coef.cc, vigencia: coef.vigencia, fonte: coef.fonte, aConfirmar: coef.aConfirmar }
        if (coef.aConfirmar) avisos.push('Os coeficientes dessa combinação ainda estão a confirmar no DOU (valor da tabela anterior).')
      }
    } catch {
      saida.pisoErro = 'Não consegui consultar a tabela do piso ANTT agora.'
    }
  } else {
    saida.pisoErro = 'Piso não calculado porque a distância não foi calculada.'
  }

  // 4) pedágio (Repom, rota enviada por IBGE)
  if (!o.ibge || !d.ibge) {
    saida.pedagioErro = 'Pedágio não consultado: não achei o código IBGE de uma das cidades. Informe o valor à mão.'
  } else {
    try {
      const ufO = e.origem.uf.toUpperCase()
      const ufD = e.destino.uf.toUpperCase()
      const p = await deps.pedagio({ ibgeOrigem: o.ibge, ufOrigem: ufO, ibgeDestino: d.ibge, ufDestino: ufD, idaVolta: incluirVolta, eixos: e.eixos, eixosSuspensosIda: e.eixosSuspensosIda, eixosSuspensosVolta: e.eixosSuspensosVolta })
      if (!p.ok || p.valor == null) {
        saida.pedagioErro = p.limite ? (p.erro ?? MSG_PEDAGIO) : MSG_PEDAGIO
      } else {
        saida.pedagio = {
          total: p.valor,
          ida: p.valorIda ?? (incluirVolta ? null : p.valor),
          volta: incluirVolta ? (p.valorVolta ?? null) : null,
          rodovias: p.descricaoPercurso ?? null,
          pracas: [], // a consulta de pedágio da Repom não detalha praças; não inventamos
          fonte: 'Repom',
          ambiente: deps.ambiente,
          consultadoEm: p.consultadoEm ?? new Date().toISOString(),
          doCache: p.doCache === true,
          distanciaKmRepom: p.distanciaKmRepom ?? null,
        }
        if (deps.ambiente !== 'prd') avisos.push('Pedágio de teste (ambiente QA da Repom): valor de homologação.')
      }
    } catch {
      saida.pedagioErro = MSG_PEDAGIO
    }
  }

  // 5) custo e referência de venda (só com piso e pedágio)
  if (saida.piso && saida.pedagio) {
    saida.custo = r2(saida.piso.valor + saida.pedagio.total)
    saida.referencia = referenciaDeVenda(saida.custo, deps.parametros.aliquota, deps.parametros.margemMin)
  }
  if (!saida.ok) saida.erro = MSG_ROTA
  return saida
}

export { precoPorLucro }
