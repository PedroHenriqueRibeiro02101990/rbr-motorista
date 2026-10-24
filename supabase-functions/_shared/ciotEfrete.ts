// CIOT na efrete (NSTech) — passo 3: emissão de CIOT Padrão (Lotação) com pagamento por Pix.
//
// - montarCorpoOperacaoPadrao: corpo do AdicionarOperacaoTransporteV2 (Versao 8), conforme o manual v8.2.
//   Viagens e NotasFiscais vão como LISTAS (tabela do manual: 0-N). O exemplo JSON do manual mostra Viagens como objeto,
//   mas o servidor recusa (24/10: "requires a JSON array ... Viagem[]").
// - validarPedidoPadrao: barra antes de chamar a efrete o que ela/ANTT recusariam (datas no passado, soma dos pagamentos,
//   frete abaixo do piso quando o piso é informado, Pix com caractere proibido, coordenadas sem par…).
// - traduzirErroEfrete: glossário de erros do manual -> mensagem clara em português.
// - emitirComAntiDuplicidade: grava o pedido ANTES de chamar; numa nova tentativa consulta a efrete pela mesma
//   referência (IdOperacaoCliente) e só emite de novo se a efrete disser que não existe.
// Sem dependências do Deno (testes em ciotEfrete.test.ts, com respostas simuladas).
import type { CiotEmitido, ProvedorCiot, Resultado } from './efreteClient.ts'

export interface EnderecoEfrete {
  Bairro: string
  Rua: string
  Numero: string // só números; sem número => "0" (glossário)
  Complemento?: string
  CEP: string // 8 dígitos
  CodigoMunicipio: number // IBGE
}

export interface PagamentoPedido {
  idPagamentoCliente: string
  categoria: 'Adiantamento' | 'Quitacao'
  valor: number
  dataLiberacao: Date
}

export interface PedidoCiotPadrao {
  idOperacaoCliente: string
  documentoViagem: string
  matrizCnpj: string
  dataInicio: Date
  dataFim: Date
  ncm: string // 4 dígitos
  pesoKg: number
  tipoEmbalagem: 'Bigbag' | 'Pallet' | 'Granel' | 'Container' | 'Saco' | 'Caixa' | 'Unitario' | 'Fardo'
  codigoTipoCarga: number
  origem: { lat: number; lon: number; codigoMunicipio?: number }
  destino: { lat: number; lon: number; codigoMunicipio?: number }
  distanciaKm: number
  valorFrete: number // = soma dos pagamentos (TotalViagem)
  pedagio: number
  pagamentos: PagamentoPedido[]
  pix: { tipo: 'CpfOuCnpj' | 'Email' | 'TelefoneCelular' | 'ChaveAleatoria'; valor: string }
  cpfCnpjCreditado: string
  contratado: { cpfOuCnpj: string; rntrc: string }
  motorista: { cpf: string; cnh: string; ddd: number; numero: number }
  contratante: { cnpj: string; nome: string; endereco: EnderecoEfrete }
  destinatario: { cnpj: string; nome: string; endereco: EnderecoEfrete }
  placas: string[]
  composicaoVeicular: boolean
  notaFiscal: { numero: string; serie: string; valorTotal: number; valorPorUnidade: number; quantidade: number }
  pisoMinimo?: number | null // se informado, frete abaixo dele é barrado antes de chamar
}

const soDigitos = (s: string) => (s ?? '').replace(/\D/g, '')
const dinheiro = (v: number) => Math.round(v * 100) / 100
const coord = (v: number) => v.toFixed(6) // até 6 casas, ponto decimal (manual)

// Data no formato da efrete (yyyy-MM-ddTHH:mm:ss), no horário de Brasília (UTC-3, sem horário de verão).
export function dataEfrete(d: Date): string {
  return new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 19)
}

export function validarPedidoPadrao(p: PedidoCiotPadrao, agora = new Date()): string[] {
  const e: string[] = []
  if (!p.idOperacaoCliente?.trim()) e.push('Falta a referência única do pedido (IdOperacaoCliente).')
  if (p.dataInicio.getTime() < agora.getTime()) e.push('Data de início da viagem no passado: a efrete recusa.')
  if (p.dataFim.getTime() <= p.dataInicio.getTime()) e.push('Data de fim da viagem precisa ser depois do início.')
  if (p.dataFim.getTime() - p.dataInicio.getTime() > 90 * 86_400_000) e.push('Data de fim da viagem passa de 90 dias do início (Lotação).')
  if (!/^\d{4}$/.test(p.ncm)) e.push('NCM da carga precisa ter 4 dígitos.')
  if (!(p.pesoKg > 0)) e.push('Peso da carga precisa ser maior que zero.')
  if (!(p.distanciaKm > 0)) e.push('Distância percorrida precisa ser maior que zero.')
  if (p.origem.lat === p.destino.lat && p.origem.lon === p.destino.lon) e.push('Origem e destino com as mesmas coordenadas.')
  if (!(p.valorFrete > 0)) e.push('Valor do frete precisa ser maior que zero.')
  const soma = dinheiro(p.pagamentos.reduce((s, x) => s + x.valor, 0))
  if (soma !== dinheiro(p.valorFrete)) e.push(`Os pagamentos somam R$ ${soma.toFixed(2)} e o frete é R$ ${dinheiro(p.valorFrete).toFixed(2)}.`)
  if (p.pagamentos.length === 0) e.push('Ao menos um pagamento deve ser informado.')
  if (new Set(p.pagamentos.map((x) => x.idPagamentoCliente)).size !== p.pagamentos.length) e.push('Referências de pagamento repetidas.')
  if (p.pisoMinimo != null && p.valorFrete < p.pisoMinimo) {
    e.push(`Frete de R$ ${p.valorFrete.toFixed(2)} abaixo do piso mínimo da ANTT (R$ ${p.pisoMinimo.toFixed(2)}): a ANTT recusa CIOT de Lotação.`)
  }
  if (/[+/,()\s]/.test(p.pix.valor)) e.push('Chave Pix com caractere não permitido (+ / , parênteses ou espaço).')
  if (p.pix.tipo === 'CpfOuCnpj' && !/^\d{11}$|^\d{14}$/.test(p.pix.valor)) e.push('Chave Pix do tipo CPF/CNPJ deve ter só números (11 ou 14).')
  if (p.placas.length < 1 || p.placas.length > 5) e.push('Informe de 1 a 5 placas.')
  if (p.composicaoVeicular && p.placas.length < 2) e.push('Composição veicular (cavalo) exige ao menos 1 implemento.')
  if (!/^\d{11}$/.test(soDigitos(p.motorista.cpf))) e.push('CPF do motorista inválido.')
  if (!/^\d{9}$/.test(soDigitos(p.contratado.rntrc)) && !/^\d{8}$/.test(soDigitos(p.contratado.rntrc))) e.push('RNTRC do contratado deve ter 9 dígitos.')
  return e
}

export function montarCorpoOperacaoPadrao(p: PedidoCiotPadrao): Record<string, unknown> {
  const pagamentos = p.pagamentos.map((x) => ({
    IdPagamentoCliente: x.idPagamentoCliente,
    DataDeLiberacao: dataEfrete(x.dataLiberacao),
    Valor: dinheiro(x.valor),
    TipoPagamento: 'TransferenciaBancaria',
    Categoria: x.categoria,
    Documento: p.documentoViagem,
    IndicadorPagamento: 'AVista',
    CpfCnpjCreditado: soDigitos(p.cpfCnpjCreditado),
    TipoChavePix: p.pix.tipo,
    ValorChavePix: p.pix.valor, // Pix OU InformacoesBancarias, nunca os dois
  }))
  const adiant = dinheiro(p.pagamentos.filter((x) => x.categoria === 'Adiantamento').reduce((s, x) => s + x.valor, 0))
  const quit = dinheiro(p.pagamentos.filter((x) => x.categoria === 'Quitacao').reduce((s, x) => s + x.valor, 0))
  const end = (x: EnderecoEfrete) => ({ ...x, CEP: soDigitos(x.CEP), Numero: soDigitos(x.Numero) || '0' })
  return {
    TipoViagem: 'Padrao',
    Versao: 8,
    MatrizCNPJ: soDigitos(p.matrizCnpj),
    IdOperacaoCliente: p.idOperacaoCliente,
    DataInicioViagem: dataEfrete(p.dataInicio),
    DataFimViagem: dataEfrete(p.dataFim),
    CodigoNCMNaturezaCarga: p.ncm,
    PesoCarga: p.pesoKg,
    TipoEmbalagem: p.tipoEmbalagem,
    Viagens: [
      {
        DocumentoViagem: p.documentoViagem,
        ...(p.origem.codigoMunicipio ? { CodigoMunicipioOrigem: p.origem.codigoMunicipio } : {}),
        ...(p.destino.codigoMunicipio ? { CodigoMunicipioDestino: p.destino.codigoMunicipio } : {}),
        LatitudeOrigem: coord(p.origem.lat),
        LongitudeOrigem: coord(p.origem.lon),
        LatitudeDestino: coord(p.destino.lat),
        LongitudeDestino: coord(p.destino.lon),
        DistanciaPercorrida: Math.round(p.distanciaKm),
        Valores: {
          TotalOperacao: dinheiro(p.valorFrete),
          TotalViagem: dinheiro(adiant + quit),
          TotalDeAdiantamento: adiant,
          TotalDeQuitacao: quit,
          Combustivel: 0,
          Pedagio: dinheiro(p.pedagio),
          Seguro: 0,
        },
        TipoPagamento: 'TransferenciaBancaria',
        NotasFiscais: [
          {
            Numero: p.notaFiscal.numero,
            Serie: p.notaFiscal.serie,
            ValorTotal: dinheiro(p.notaFiscal.valorTotal),
            ValorDaMercadoriaPorUnidade: p.notaFiscal.valorPorUnidade,
            CodigoNCMNaturezaCarga: p.ncm,
            UnidadeDeMedidaDaMercadoria: 'Kg',
            TipoDeCalculo: 'SemQuebra',
            QuantidadeDaMercadoriaNoEmbarque: p.notaFiscal.quantidade,
            ToleranciaDePerdaDeMercadoria: { Tipo: 'Nenhum', Valor: 0 },
          },
        ],
      },
    ],
    Impostos: { IRRF: 0, SestSenat: 0, INSS: 0, ISSQN: 0 },
    Pagamentos: pagamentos,
    Contratado: { CpfOuCnpj: soDigitos(p.contratado.cpfOuCnpj), RNTRC: soDigitos(p.contratado.rntrc) },
    Motorista: { CpfOuCnpj: soDigitos(p.motorista.cpf), CNH: soDigitos(p.motorista.cnh), Celular: { DDD: p.motorista.ddd, Numero: p.motorista.numero } },
    Destinatario: { NomeOuRazaoSocial: p.destinatario.nome, CpfOuCnpj: soDigitos(p.destinatario.cnpj), Endereco: end(p.destinatario.endereco) },
    Contratante: { NomeOuRazaoSocial: p.contratante.nome, CpfOuCnpj: soDigitos(p.contratante.cnpj), ResponsavelPeloPagamento: true, Endereco: end(p.contratante.endereco) },
    Veiculos: p.placas.map((Placa) => ({ Placa: Placa.toUpperCase().replace(/[^A-Z0-9]/g, '') })),
    CodigoTipoCarga: p.codigoTipoCarga,
    AltoDesempenho: false,
    ComposicaoVeicular: p.composicaoVeicular,
    RetornoVazio: false,
    TipoPagamento: 'TransferenciaBancaria',
  }
}

// Glossário de erros comuns (manual v8.2) -> mensagem clara. Sem correspondência, devolve a mensagem original.
const GLOSSARIO: [RegExp, string][] = [
  [/menor do que o valor m[ií]nimo de frete/i, 'Frete abaixo do piso mínimo da ANTT para esta rota, eixos e tipo de carga. Aumente o valor ou revise os dados da viagem.'],
  [/n[aã]o possui v[ií]nculo com o\s+transportador contratado/i, 'A placa do cavalo não está vinculada ao RNTRC do contratado na ANTT. O transportador precisa regularizar no RNTRC Digital.'],
  [/n[aã]o pertence ao\s+transportador de RNTRC/i, 'Uma das placas não pertence (ou não está ativa) ao RNTRC informado.'],
  [/ao menos um\s+implemento|cavalo-trator/i, 'Cavalo mecânico sem implemento: informe ao menos uma carreta e marque composição veicular.'],
  [/CEP.*ainda n[aã]o est[aá] cadastrado|coordenadas geogr[aá]ficas para o par/i, 'A ANTT não tem coordenadas para esse CEP: envie latitude e longitude da origem e do destino.'],
  [/Data de in[ií]cio da viagem\s+deve ser maior/i, 'Data de início da viagem no passado: use uma data igual ou posterior a agora.'],
  [/Dist[aâ]ncia n[aã]o\s+compat[ií]vel/i, 'Distância informada menor que a rota calculada pela ANTT: revise os quilômetros ou as coordenadas.'],
  [/Quantidade de\s+eixos inv[aá]lida/i, 'Número de eixos diferente do cadastro do veículo na ANTT.'],
  [/N[aã]o foi\s+encontrado nenhum\s+transportador/i, 'CPF/CNPJ e RNTRC do contratado não conferem na ANTT (RNTRC precisa ter 9 dígitos e estar ativo).'],
  [/Chave PIX.*inv[aá]lida/i, 'Chave Pix em formato inválido (sem + / , parênteses).'],
  [/MatrizCNPJ\s+deve ser igual/i, 'O CNPJ emissor (MatrizCNPJ) precisa ser o do contratante ou do contratado.'],
  [/Token n[aã]o pode ser nulo|Usu[aá]rio n[aã]o logado/i, 'Sessão da efrete expirada: faça login de novo.'],
  [/dados banc[aá]rios n[aã]o\s+foram informados/i, 'Dados bancários ausentes ou fora do formato (Agência e Conta: número-dígito).'],
  [/mesmas\s+coordenadas geogr[aá]ficas/i, 'Origem e destino com as mesmas coordenadas.'],
  [/Ao menos um pagamento/i, 'Ao menos um pagamento deve ser informado.'],
  [/DistanciaPercorrida deve\s+ser maior que 0/i, 'Distância percorrida precisa ser maior que zero.'],
  [/contratado\(s\) para outro\s+contratante/i, 'Veículo já vinculado a outro contratante (CIOT TAC Agregado aberto).'],
  [/Campo (Cep|Latitude|Longitude)\w* inv[aá]lido/i, 'CEP, latitude ou longitude fora do formato (CEP com 8 dígitos; coordenadas com até 6 casas).'],
]

export function traduzirErroEfrete(mensagem: string): string {
  const m = (mensagem ?? '').replace(/\s+/g, ' ')
  for (const [re, texto] of GLOSSARIO) if (re.test(m)) return texto
  return mensagem
}

// CodigoIdentificacaoOperacao chega como "NNNNNNNNNNNN/VVVV" (CIOT de 12 dígitos + código verificador de 4); o manual
// não descreve o formato. Guardamos os dois separados e remontamos para as chamadas seguintes.
export function separarCiot(codigo: string): { numero: string; verificador: string | null } | null {
  const m = /^\s*(\d{12})(?:\s*\/\s*(\d{4}))?\s*$/.exec(codigo ?? '')
  return m ? { numero: m[1], verificador: m[2] ?? null } : null
}
export const juntarCiot = (numero: string, verificador: string | null | undefined) => (verificador ? `${numero}/${verificador}` : numero)

// ---- Anti-duplicidade ----
export interface PedidoRegistrado {
  status: 'pendente' | 'emitido' | 'erro' | 'cancelado'
  ciot: string | null
  tentativas: number
}

export interface RepositorioPedidos {
  obter(idOperacaoCliente: string): Promise<PedidoRegistrado | null>
  registrarPendente(p: PedidoCiotPadrao): Promise<void>
  marcarTentativa(idOperacaoCliente: string): Promise<void>
  marcarEmitido(idOperacaoCliente: string, e: CiotEmitido, resumo: Record<string, unknown>): Promise<void>
  marcarErro(idOperacaoCliente: string, mensagem: string): Promise<void>
}

export type ResultadoEmissao =
  | { ok: true; ciot: string; protocolo: string | null; jaExistia: boolean }
  | { ok: false; etapa: 'validacao' | 'consulta' | 'emissao'; mensagem: string; mensagemOriginal?: string; codigo?: string; protocolo?: string }

export async function emitirComAntiDuplicidade(
  provedor: Pick<ProvedorCiot, 'emitirOperacaoTransporte' | 'obterCiotPorReferencia'>,
  repo: RepositorioPedidos,
  pedido: PedidoCiotPadrao,
  agora = new Date(),
): Promise<ResultadoEmissao> {
  const ref = pedido.idOperacaoCliente
  const existente = await repo.obter(ref)
  if (existente?.status === 'emitido' && existente.ciot) return { ok: true, ciot: existente.ciot, protocolo: null, jaExistia: true }
  if (existente?.status === 'cancelado') return { ok: false, etapa: 'validacao', mensagem: 'Este pedido já foi cancelado; use uma nova referência.' }

  // Nova tentativa: a efrete pode ter emitido e a resposta ter se perdido. Pergunta antes de emitir de novo.
  if (existente) {
    const c = await provedor.obterCiotPorReferencia(pedido.matrizCnpj, ref)
    if (!c.ok) return { ok: false, etapa: 'consulta', mensagem: `Não consegui confirmar se o CIOT já existe; nada foi emitido. ${c.erro.mensagem}`, codigo: c.erro.codigo }
    if (c.dados) {
      await repo.marcarEmitido(ref, { ciot: c.dados.ciot, protocolo: c.dados.protocolo }, { origem: 'consulta_por_referencia', estado: c.dados.estado })
      return { ok: true, ciot: c.dados.ciot, protocolo: c.dados.protocolo, jaExistia: true }
    }
  } else {
    await repo.registrarPendente(pedido)
  }

  const erros = validarPedidoPadrao(pedido, agora)
  if (erros.length) {
    await repo.marcarErro(ref, erros.join(' '))
    return { ok: false, etapa: 'validacao', mensagem: erros.join(' ') }
  }

  await repo.marcarTentativa(ref)
  const r: Resultado<CiotEmitido> = await provedor.emitirOperacaoTransporte(montarCorpoOperacaoPadrao(pedido))
  if (!r.ok) {
    const mensagem = traduzirErroEfrete(r.erro.mensagem)
    await repo.marcarErro(ref, mensagem)
    return { ok: false, etapa: 'emissao', mensagem, mensagemOriginal: r.erro.mensagem, codigo: r.erro.codigo, protocolo: r.erro.protocolo }
  }
  await repo.marcarEmitido(ref, r.dados, { origem: 'emissao' })
  return { ok: true, ciot: r.dados.ciot, protocolo: r.dados.protocolo, jaExistia: false }
}

// ---- Dados fictícios válidos (só para homologação) ----
export function gerarCpf(semente: number): string {
  const base = String(Math.abs(semente) % 1_000_000_000).padStart(9, '1')
  const d = base.split('').map(Number)
  const dv = (n: number) => {
    let s = 0
    for (let i = 0; i < n; i++) s += d[i] * (n + 1 - i)
    const r = (s * 10) % 11
    return r === 10 ? 0 : r
  }
  d.push(dv(9))
  d.push(dv(10))
  return d.join('')
}

// CNH (11 dígitos) com os dois dígitos verificadores do Denatran.
export function gerarCnh(semente: number): string {
  const base = String(Math.abs(semente) % 1_000_000_000).padStart(9, '2')
  const d = base.split('').map(Number)
  let s = 0
  for (let i = 0; i < 9; i++) s += d[i] * (9 - i)
  let dv1 = s % 11
  let desc = 0
  if (dv1 >= 10) {
    dv1 = 0
    desc = 2
  }
  s = 0
  for (let i = 0; i < 9; i++) s += d[i] * (1 + i)
  let dv2 = (s % 11) - desc
  if (dv2 < 0) dv2 += 11
  if (dv2 >= 10) dv2 = 0
  return base + String(dv1) + String(dv2)
}

// RENAVAM (11 dígitos) com dígito verificador.
export function gerarRenavam(semente: number): string {
  const base = String(Math.abs(semente) % 10_000_000_000).padStart(10, '3')
  const pesos = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const s = base.split('').reduce((a, c, i) => a + Number(c) * pesos[i], 0)
  const dv = (s * 10) % 11
  return base + String(dv === 10 ? 0 : dv)
}

// Chassi fictício de 17 caracteres (sem I, O, Q).
export function gerarChassi(semente: number, prefixo = '9BW'): string {
  const alfabeto = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789'
  let x = Math.abs(semente) || 1
  let out = prefixo
  while (out.length < 17) {
    x = (x * 1103515245 + 12345) % 2147483648
    out += alfabeto[x % alfabeto.length]
  }
  return out
}
