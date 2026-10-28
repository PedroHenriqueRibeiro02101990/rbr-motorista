// Regras do cartão do CIOT (tela do Fiscal). Sem React e sem rede, para testar com node --test.
// A conferência NÃO inventa regra: ela lê a resposta da ação "previa" da função efrete-ciot-operacao
// (bloqueios, avisos, piso, pedido), que é a mesma validação que a emissão usa. Só agrupa por assunto.

export type Piso = { ok: true; piso: number; tabela: string; tipoCarga: string; eixos: number; distanciaKm: number } | { ok: false; motivo: string }
export type PreviaPedido = {
  referencia: string
  frete: number
  pagamentos: { categoria: string; valor: number; liberacao: string }[]
  pix: string
  placas: string[]
  notas: number
  pesoKg: number
  ncm: string
  distanciaKm: number
}
export type Previa = {
  ok: boolean
  motivo?: string
  piso?: Piso
  diferencaPiso?: number | null
  bloqueios?: string[]
  avisos?: string[]
  pedido?: PreviaPedido | null
}

export type Origem = 'Empresa' | 'Cadastro' | 'Cotação' | 'Operação' | 'Fiscal'
export type Corrigir = 'cadastro_motorista' | 'cadastro_veiculo' | 'cotacao' | 'nfe' | 'pagamento' | 'fiscal'
export type Linha = { id: string; titulo: string; ok: boolean; detalhe: string; origem: Origem; corrigir?: Corrigir }

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Cada assunto da conferência e o que, nas mensagens da função, pertence a ele.
const ASSUNTOS: { id: string; titulo: string; origem: Origem; corrigir: Corrigir; casa: RegExp }[] = [
  { id: 'proprietario', titulo: 'Proprietário do veículo', origem: 'Cadastro', corrigir: 'cadastro_motorista', casa: /^Transportador .*(CPF|RNTRC)/ },
  { id: 'veiculos', titulo: 'Veículos', origem: 'Cadastro', corrigir: 'cadastro_veiculo', casa: /(Veículo|Implemento|veículo alocado)/ },
  { id: 'motorista', titulo: 'Motorista', origem: 'Cadastro', corrigir: 'cadastro_motorista', casa: /^Motorista sem/ },
  { id: 'rota', titulo: 'Rota e carga', origem: 'Cotação', corrigir: 'cotacao', casa: /(Origem ou destino|NCM|peso bruto)/ },
  { id: 'notas', titulo: 'Notas fiscais', origem: 'Operação', corrigir: 'nfe', casa: /(NF-e)/ },
  { id: 'piso', titulo: 'Frete acima do piso ANTT', origem: 'Cotação', corrigir: 'cotacao', casa: /(iso mínimo|abaixo do piso)/ },
  { id: 'pagamento', titulo: 'Adiantamento e saldo', origem: 'Operação', corrigir: 'pagamento', casa: /(Condição de pagamento|valor do frete|contrato no MDF-e)/ },
  { id: 'pix', titulo: 'Chave Pix', origem: 'Cadastro', corrigir: 'cadastro_motorista', casa: /Pix/ },
]

// Mensagens da função que descrevem ações da própria função (não o dado em si) vão para "Outros".
export function montarConferencia(previa: Previa | null): Linha[] {
  if (!previa) return []
  const bloqueios = previa.bloqueios ?? []
  const p = previa.pedido ?? null
  const usadas = new Set<string>()
  const linhas: Linha[] = []

  const detalheOk: Record<string, string> = {
    proprietario: 'RNTRC e documento conferidos',
    veiculos: p ? p.placas.join(' (cavalo) · ') : 'Conferidos',
    motorista: 'CPF e CNH conferidos',
    rota: p ? `${p.distanciaKm} km · NCM ${p.ncm} · ${p.pesoKg.toLocaleString('pt-BR')} kg` : 'Conferidos',
    notas: p ? `${p.notas} NF-e` : 'Conferidas',
    piso: previa.piso?.ok ? `${brl(p?.frete ?? 0)} contra piso de ${brl(previa.piso.piso)}` : 'Conferido',
    pagamento: p ? p.pagamentos.map((g) => `${g.categoria === 'Quitacao' ? 'Saldo' : g.categoria} ${brl(g.valor)}`).join(' · ') : 'Conferido',
    pix: p ? `Pix por ${p.pix === 'CpfOuCnpj' ? 'CPF/CNPJ' : p.pix}` : 'Conferida',
  }

  for (const a of ASSUNTOS) {
    const msgs = bloqueios.filter((b) => !usadas.has(b) && a.casa.test(b))
    msgs.forEach((m) => usadas.add(m))
    linhas.push({ id: a.id, titulo: a.titulo, ok: msgs.length === 0, detalhe: msgs.length ? msgs.join(' ') : detalheOk[a.id], origem: a.origem, corrigir: msgs.length ? a.corrigir : undefined })
  }
  const outras = bloqueios.filter((b) => !usadas.has(b))
  if (outras.length) linhas.push({ id: 'outros', titulo: 'Outros pontos', ok: false, detalhe: outras.join(' '), origem: 'Operação' })
  // Sem coordenadas ou sem operação de teste, a função nem monta a prévia: o motivo vira uma linha.
  if (previa.motivo && !linhas.some((l) => !l.ok)) linhas.unshift({ id: 'motivo', titulo: 'Não foi possível conferir', ok: false, detalhe: previa.motivo, origem: 'Operação' })
  return linhas
}

export const pendencias = (l: Linha[]) => l.filter((x) => !x.ok).length

// ---- Cadeia: o CIOT só sai depois de CT-e autorizado e averbação feita ----
export type EstadoPasso = 'ok' | 'pendente' | 'nao_exigido' | 'nao_exigido_teste'
export type DocLeve = { tipo: string; status: string; exigido?: boolean; dispensa_motivo?: string | null; conferencia_status?: string | null }

const cumprido = (d?: DocLeve) => !!d && (d.status === 'emitido' || d.conferencia_status === 'ok' || d.conferencia_status === 'aceito_manual')
const dispensado = (d?: DocLeve) => !!d && !d.exigido && !!d.dispensa_motivo

// Passo anterior ao CIOT. Documento dispensado = "não exigido"; sem a linha na operação de teste = "não exigido no teste".
export function estadoPasso(doc: DocLeve | undefined, ehTeste: boolean): EstadoPasso {
  if (cumprido(doc)) return 'ok'
  if (dispensado(doc)) return 'nao_exigido'
  if (!doc && ehTeste) return 'nao_exigido_teste'
  return 'pendente'
}
export const passoLibera = (e: EstadoPasso) => e !== 'pendente'

export type Passo = { rotulo: string; estado: EstadoPasso }
export function passosAntesDoCiot(docs: DocLeve[], ehTeste: boolean): Passo[] {
  const por = (t: string) => docs.find((d) => d.tipo === t)
  return [
    { rotulo: 'CT-e autorizado', estado: estadoPasso(por('cte'), ehTeste) },
    { rotulo: 'Averbação feita', estado: estadoPasso(por('atm'), ehTeste) },
  ]
}

// Ordem inversa: com MDF-e já emitido (ou enviado), o CIOT não cancela.
// Prazo combinado com o Pedro: o CIOT cancela até 24 h antes do início da viagem (a efrete pode ter regra própria; a resposta dela vale).
export const PRAZO_CANCELAR_CIOT_HORAS = 24
export function motivoNaoCancela(docs: DocLeve[], inicioViagem?: string | null, agora = new Date()): string | null {
  const mdfe = docs.find((d) => d.tipo === 'mdfe')
  if (mdfe && ['emitido', 'pendente', 'autorizado'].includes(mdfe.status) && mdfe.exigido !== false) {
    return 'Este CIOT não pode ser cancelado enquanto o MDF-e existir. Cancele o MDF-e primeiro.'
  }
  if (inicioViagem) {
    const limite = new Date(inicioViagem).getTime() - PRAZO_CANCELAR_CIOT_HORAS * 3600_000
    if (Number.isFinite(limite) && agora.getTime() > limite) {
      return `O prazo para cancelar este CIOT acabou: era até ${PRAZO_CANCELAR_CIOT_HORAS} horas antes do início da viagem. Fale com a efrete se precisar cancelar mesmo assim.`
    }
  }
  return null
}

export const motivoValido = (m: string) => m.trim().length >= 15
export const faltamCaracteres = (m: string) => Math.max(0, 15 - m.trim().length)
