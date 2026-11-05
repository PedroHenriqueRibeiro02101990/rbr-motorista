// DADOS 100% FICTICIOS, so para a demonstracao (Preview). Nada aqui vem do banco.
import type { EntradaCusto, ParametrosRbr } from '@rbr/shared/spreadAgenciador'

export const PARAMS_DEMO: ParametrosRbr = { lucroMinPct: 0.15, lucroMinValor: 250, custoFinPctMes: 0.025, taxaTecnologia: 9.9 }
export const ALIQUOTA = 0.06

export type StatusCot = 'rascunho' | 'enviada_cliente' | 'aceita' | 'perdida' | 'enviada_operacao'
export const STATUS_COT: Record<StatusCot, { label: string; bg: string; cor: string }> = {
  rascunho: { label: 'Rascunho', bg: 'var(--rbr-muted-bg)', cor: 'var(--rbr-muted)' },
  enviada_cliente: { label: 'Enviada ao cliente', bg: '#DCE3FF', cor: '#1e2761' },
  aceita: { label: 'Aceita', bg: '#E3F5EA', cor: '#14532d' },
  perdida: { label: 'Perdida', bg: '#FBE9E9', cor: '#9b1c1c' },
  enviada_operacao: { label: 'Enviada à operação', bg: '#1e2761', cor: '#fff' },
}

export interface ClienteDemo { id: string; nome: string; doc: string; cidade: string; contato: string; whatsapp: string; email: string }

export const LOGO_DEMO =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#0f766e"/><path d="M12 40h26l6-12h8l4 12" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="24" cy="46" r="5" fill="#fff"/><circle cx="46" cy="46" r="5" fill="#fff"/></svg>',
  )

export const AGENCIADOR_DEMO = {
  nome: 'Horizonte Agenciamento (exemplo)',
  responsavel: 'Marcos Almeida',
  email: 'contato@horizonte.exemplo',
  whatsapp: '(11) 90000-0000',
  cnpj: '00.000.000/0001-00 (exemplo)',
}

export const CLIENTES_DEMO: ClienteDemo[] = [
  { id: 'c1', nome: 'Distribuidora Aurora Alimentos', doc: '11.111.111/0001-11', cidade: 'Campinas/SP', contato: 'Fernanda Lopes', whatsapp: '(19) 90000-1111', email: 'compras@aurora.exemplo' },
  { id: 'c2', nome: 'Metalúrgica Serra Azul', doc: '22.222.222/0001-22', cidade: 'Betim/MG', contato: 'Ricardo Teixeira', whatsapp: '(31) 90000-2222', email: 'logistica@serraazul.exemplo' },
  { id: 'c3', nome: 'Agro Campo Verde', doc: '33.333.333/0001-33', cidade: 'Rondonópolis/MT', contato: 'Paulo Henrique', whatsapp: '(66) 90000-3333', email: 'expedicao@campoverde.exemplo' },
  { id: 'c4', nome: 'Construtora Pedra Forte', doc: '44.444.444/0001-44', cidade: 'Curitiba/PR', contato: 'Luciana Prado', whatsapp: '(41) 90000-4444', email: 'obras@pedraforte.exemplo' },
  { id: 'c5', nome: 'Têxtil Fio de Ouro', doc: '55.555.555/0001-55', cidade: 'Blumenau/SC', contato: 'Gustavo Reis', whatsapp: '(47) 90000-5555', email: 'frete@fiodeouro.exemplo' },
  { id: 'c6', nome: 'Bebidas Vale do Sol', doc: '66.666.666/0001-66', cidade: 'Ribeirão Preto/SP', contato: 'Amanda Costa', whatsapp: '(16) 90000-6666', email: 'cargas@valedosol.exemplo' },
]

export interface CotacaoDemo {
  id: string
  codigo: string
  clienteId: string
  origem: string
  destino: string
  produto: string
  pesoKg: number
  custo: EntradaCusto
  piso: number
  spread: number
  status: StatusCot
  data: string
  motivoPerda?: string
}
const E = (frete: number, pedagio: number, seguroTag: number, prazoDias: number): EntradaCusto => ({ frete, pedagio, seguroTag, prazoDias, aliquota: ALIQUOTA })

export const COTACOES_DEMO: CotacaoDemo[] = [
  { id: 'q1', codigo: 'COT-1042', clienteId: 'c1', origem: 'Campinas/SP', destino: 'Recife/PE', produto: 'Alimentos secos', pesoKg: 27000, custo: E(9800, 780, 310, 30), piso: 9650, spread: 1400, status: 'rascunho', data: '2026-11-04' },
  { id: 'q2', codigo: 'COT-1041', clienteId: 'c2', origem: 'Betim/MG', destino: 'Joinville/SC', produto: 'Peças metálicas', pesoKg: 24000, custo: E(6200, 520, 240, 28), piso: 6100, spread: 900, status: 'enviada_cliente', data: '2026-11-03' },
  { id: 'q3', codigo: 'COT-1040', clienteId: 'c3', origem: 'Rondonópolis/MT', destino: 'Santos/SP', produto: 'Soja ensacada', pesoKg: 30000, custo: E(7400, 690, 280, 21), piso: 7250, spread: 1100, status: 'enviada_cliente', data: '2026-11-02' },
  { id: 'q4', codigo: 'COT-1039', clienteId: 'c4', origem: 'Curitiba/PR', destino: 'Goiânia/GO', produto: 'Cimento', pesoKg: 28000, custo: E(8100, 610, 260, 30), piso: 7950, spread: 1250, status: 'aceita', data: '2026-11-02' },
  { id: 'q5', codigo: 'COT-1038', clienteId: 'c5', origem: 'Blumenau/SC', destino: 'Fortaleza/CE', produto: 'Tecidos', pesoKg: 18000, custo: E(11200, 940, 420, 35), piso: 11000, spread: 1800, status: 'aceita', data: '2026-11-01' },
  { id: 'q6', codigo: 'COT-1037', clienteId: 'c6', origem: 'Ribeirão Preto/SP', destino: 'Brasília/DF', produto: 'Bebidas', pesoKg: 26000, custo: E(5400, 410, 230, 28), piso: 5300, spread: 800, status: 'enviada_operacao', data: '2026-10-30' },
  { id: 'q7', codigo: 'COT-1036', clienteId: 'c1', origem: 'Campinas/SP', destino: 'Salvador/BA', produto: 'Alimentos secos', pesoKg: 25000, custo: E(8600, 700, 290, 30), piso: 8450, spread: 1300, status: 'enviada_operacao', data: '2026-10-28' },
  { id: 'q8', codigo: 'COT-1035', clienteId: 'c2', origem: 'Betim/MG', destino: 'Curitiba/PR', produto: 'Chapas de aço', pesoKg: 29000, custo: E(6900, 560, 270, 28), piso: 6750, spread: 1000, status: 'enviada_operacao', data: '2026-10-22' },
  { id: 'q9', codigo: 'COT-1034', clienteId: 'c3', origem: 'Sorriso/MT', destino: 'Paranaguá/PR', produto: 'Milho a granel', pesoKg: 32000, custo: E(9200, 850, 300, 21), piso: 9050, spread: 1350, status: 'enviada_operacao', data: '2026-10-15' },
  { id: 'q10', codigo: 'COT-1033', clienteId: 'c4', origem: 'Curitiba/PR', destino: 'São Paulo/SP', produto: 'Tijolos', pesoKg: 20000, custo: E(3100, 280, 150, 30), piso: 3000, spread: 600, status: 'enviada_operacao', data: '2026-10-08' },
  { id: 'q11', codigo: 'COT-1032', clienteId: 'c5', origem: 'Blumenau/SC', destino: 'Belo Horizonte/MG', produto: 'Malhas', pesoKg: 15000, custo: E(5900, 470, 210, 30), piso: 5800, spread: 700, status: 'perdida', data: '2026-10-30', motivoPerda: 'Cliente fechou com preço menor' },
  { id: 'q12', codigo: 'COT-1031', clienteId: 'c6', origem: 'Ribeirão Preto/SP', destino: 'Rio de Janeiro/RJ', produto: 'Bebidas', pesoKg: 25000, custo: E(3900, 330, 190, 28), piso: 3800, spread: 500, status: 'perdida', data: '2026-10-25', motivoPerda: 'Carga cancelada pelo cliente' },
]

export type EtapaOp = 'analise' | 'motorista' | 'coletado' | 'viagem' | 'entregue'
export const ETAPAS: { k: EtapaOp; label: string }[] = [
  { k: 'analise', label: 'Em análise pela RBR' },
  { k: 'motorista', label: 'Motorista confirmado' },
  { k: 'coletado', label: 'Coletado' },
  { k: 'viagem', label: 'Em viagem' },
  { k: 'entregue', label: 'Entregue' },
]
export interface OperacaoDemo { id: string; codigo: string; cotacaoId: string; etapa: EtapaOp; coleta: string; entrega: string }
export const OPERACOES_DEMO: OperacaoDemo[] = [
  { id: 'o1', codigo: 'OP-3021', cotacaoId: 'q6', etapa: 'analise', coleta: '2026-11-07', entrega: '2026-11-10' },
  { id: 'o2', codigo: 'OP-3018', cotacaoId: 'q7', etapa: 'motorista', coleta: '2026-11-06', entrega: '2026-11-11' },
  { id: 'o3', codigo: 'OP-3012', cotacaoId: 'q8', etapa: 'viagem', coleta: '2026-11-02', entrega: '2026-11-06' },
  { id: 'o4', codigo: 'OP-3007', cotacaoId: 'q9', etapa: 'coletado', coleta: '2026-11-04', entrega: '2026-11-08' },
  { id: 'o5', codigo: 'OP-2994', cotacaoId: 'q10', etapa: 'entregue', coleta: '2026-10-20', entrega: '2026-10-23' },
]

/** Historico financeiro de 3 meses (valores de exemplo). */
export const HISTORICO_DEMO = [
  { mes: '2026-08', cotado: 41200, fechado: 28900, spreadLiquido: 2410.5 },
  { mes: '2026-09', cotado: 58700, fechado: 41300, spreadLiquido: 3680.3 },
  { mes: '2026-10', cotado: 72400, fechado: 52100, spreadLiquido: 4920.8 },
]
export const MESES_PT: Record<string, string> = { '2026-06': 'jun', '2026-07': 'jul', '2026-08': 'ago', '2026-09': 'set', '2026-10': 'out', '2026-11': 'nov' }
