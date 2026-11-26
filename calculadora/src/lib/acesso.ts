// ÚNICA camada de acesso ao cálculo. Chama a função calcular-cotacao-rota (a mesma da tela de Cotações). Enquanto a
// função não estiver publicada (404), devolve dados de DEMONSTRAÇÃO marcados com demo:true; quando a função real
// responder, a demonstração some sozinha. Nunca grava nada e nunca monta valor por conta própria.
import type { Entrada, Resposta, TipoFalha } from './modelo.ts'
import { TABELA_CALCULADORA, classificarFalha } from './modelo.ts'

export type Invocar = (corpo: Record<string, unknown>) => Promise<{ data: unknown; error: { status?: number; message?: string } | null }>

export type ResultadoConsulta =
  | { ok: true; resposta: Resposta }
  | { ok: false; falha: TipoFalha; mensagem?: string }

export function corpoDaConsulta(e: Entrada): Record<string, unknown> {
  return {
    cidade_origem: e.origem.cidade, uf_origem: e.origem.uf, ibge_origem: e.origem.ibge ?? undefined,
    cidade_destino: e.destino.cidade, uf_destino: e.destino.uf, ibge_destino: e.destino.ibge ?? undefined,
    tipo_carga: e.tipoCarga, eixos: e.eixos, tabela: TABELA_CALCULADORA, incluir_volta: e.incluirVolta,
  }
}

/** Dados de EXEMPLO (SP→BH, os números do desenho aprovado). Marcados como demonstração em toda a tela. */
export function dadosDemo(e: Entrada): Resposta {
  const pedagio = e.incluirVolta ? 410.4 : 205.2
  const piso = 5094.8
  const custo = Math.round((piso + pedagio) * 100) / 100
  const op = (pct: number, valorFinal: number, imposto: number, lucro: number, margem: number) => ({ lucroPct: pct, valorFinal, imposto, lucro, margem, abaixoDoMinimo: margem < 0.26, texto: `Margem ${pct}% . imposto 6%` })
  return {
    ok: true, demo: true, km: 587, duracaoHoras: 7.9, kmFonte: 'EXEMPLO', geometria: null, rotaEnviadaRepom: 'IBGE', incluirVolta: e.incluirVolta,
    piso: { valor: piso, comRetornoVazio: false, tabela: 'A', tipoCarga: e.tipoCarga, eixos: e.eixos, ccdPorKm: 7.5347, ccFixo: 671.93, vigencia: '2026-10-01', fonte: 'Portaria SUROC 22', aConfirmar: false },
    pisoErro: null,
    pedagio: { total: pedagio, ida: 205.2, volta: e.incluirVolta ? 205.2 : null, rodovias: 'BR-381', pracas: [], fonte: 'Repom', ambiente: 'qa', consultadoEm: new Date().toISOString(), doCache: false, distanciaKmRepom: null },
    pedagioErro: null, custo,
    referencia: [op(30, 7472.89, 448.37, 1724.52, 0.2308), op(40, 8100.44, 486.03, 2314.41, 0.2857), op(50, 8728.0, 523.68, 2904.32, 0.3327)],
    avisos: ['EXEMPLO: números de demonstração, não é consulta real.'], ambiente: 'qa', emTeste: true, erro: null,
    parametrosReferencia: { aliquota: 0.06, margemMin: 0.26 },
  }
}

export async function consultar(e: Entrada, invocar: Invocar, online = true): Promise<ResultadoConsulta> {
  if (!online) return { ok: false, falha: 'offline' }
  let r: Awaited<ReturnType<Invocar>>
  try {
    r = await invocar(corpoDaConsulta(e))
  } catch (x) {
    return { ok: false, falha: classificarFalha({ message: (x as Error)?.message }) }
  }
  if (r.error?.status === 404) return { ok: true, resposta: dadosDemo(e) } // função ainda não publicada
  const d = r.data as (Resposta & { erro?: string }) | null
  if (d?.desligado) return { ok: false, falha: 'desligado' }
  if (r.error && !d) return { ok: false, falha: classificarFalha(r.error) }
  if (!d) return { ok: false, falha: 'indisponivel' }
  if (d.km == null && d.erro) return { ok: false, falha: 'indisponivel', mensagem: d.erro }
  return { ok: true, resposta: d }
}
