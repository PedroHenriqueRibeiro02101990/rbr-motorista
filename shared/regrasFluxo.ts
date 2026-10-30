// Regras puras do fluxo (sem rede, sem banco). Cada função codifica uma regra do documento de implantação e tem teste.
// Ligação às telas e funções é feita item a item; o que ainda não está ligado está marcado no CHECKLIST-BACK.

const H = 3_600_000

// C02/C04/C11: o que fazer em cada troca. Momento: M0 = antes de emitir; M1/M2 = documentos emitidos, viagem não iniciada; M3 = em viagem.
export type Momento = 'M0' | 'M1' | 'M2' | 'M3'
export type PlanoTroca = { passos: string[]; soGestor: boolean; nivelA: boolean }
export function planoDeTroca(tipo: 'motorista' | 'veiculo', momento: Momento, o: { eixosMudaram?: boolean; horasParaInicioCiot?: number } = {}): PlanoTroca {
  const nivelA = tipo === 'veiculo' && !!o.eixosMudaram
  if (momento === 'M0') {
    return { passos: tipo === 'motorista' ? ['Troca livre.', 'Nova GR.', 'Novo aceite do motorista.'] : ['Troca livre.', 'Nova GR.'], soGestor: false, nivelA }
  }
  if (tipo === 'motorista') {
    if (momento === 'M3') {
      return {
        passos: ['Nova GR do novo condutor ANTES de ele assumir.', 'Inclusão de condutor no MDF-e.', 'Aviso imediato à seguradora.', 'Registrar quem autorizou.'],
        soGestor: true,
        nivelA,
      }
    }
    const ciot =
      (o.horasParaInicioCiot ?? 0) > 24
        ? 'CIOT de lotação não retifica: cancelar e reemitir.'
        : 'CIOT de lotação não retifica: faltam menos de 24 h; encerrar e emitir outro.'
    return { passos: ['CT-e permanece.', 'Nova GR.', ciot, 'MDF-e: cancelar e reemitir (RC-V reaverba) ou Inclusão de condutor.'], soGestor: false, nivelA }
  }
  if (momento === 'M3') {
    return {
      passos: ['Encerrar o MDF-e original.', 'Emitir novo MDF-e para o novo veículo.', 'Reaverbar ANTES de sair.', 'Nova GR.', 'Novo CIOT.'],
      soGestor: true,
      nivelA,
    }
  }
  const vpo = nivelA ? 'VPO: eixos diferentes, cancelar e recomprar.' : 'VPO: trocar a placa (mesmo número de eixos) ou cancelar e recomprar.'
  return {
    passos: [vpo, 'CIOT: nova operação.', 'MDF-e: cancelar e reemitir.', 'RC-V: reaverbar.', 'Nova GR.', ...(nivelA ? ['Recalcular piso ANTT e VPO (alteração nível A).'] : [])],
    soGestor: false,
    nivelA,
  }
}

// C05: carta de correção do CT-e: até 20 por CT-e; não corrige valores, partes (remetente, destinatário, tomador) nem datas.
const NAO_CORRIGE = ['valor', 'valores', 'frete', 'remetente', 'destinatario', 'tomador', 'expedidor', 'recebedor', 'data', 'datas', 'emissao']
export function cartaCorrecaoPermitida(campo: string, cartasJaEnviadas: number): { pode: boolean; motivo?: string } {
  if (cartasJaEnviadas >= 20) return { pode: false, motivo: 'O CT-e já tem 20 cartas de correção (limite).' }
  const c = campo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  if (NAO_CORRIGE.some((n) => c.includes(n))) {
    return { pode: false, motivo: 'A carta de correção não corrige valores, partes nem datas: use CT-e de substituição ou complementar.' }
  }
  return { pode: true }
}

// A06/C12: ref versionada para reemissão (rbr-mdfe-<op> vira rbr-mdfe-<op>-v2, -v3...), nunca reutiliza a anterior.
export function proximaRef(refAtual: string): string {
  const m = refAtual.match(/^(.*)-v(\d+)$/)
  return m ? `${m[1]}-v${Number(m[2]) + 1}` : `${refAtual}-v2`
}
// C12: contingência do MDF-e transmite em até 168 h.
export function contingenciaMdfeVencida(emitidoEmContingencia: number, agora: number): boolean {
  return agora - emitidoEmContingencia > 168 * H
}

// D04: níveis de alteração. A pausa e exige novo aceite; B livre com gestor informado; C só registro; D depois do fiscal começar.
export type NivelAlteracao = 'A' | 'B' | 'C' | 'D'
const NIVEL_A = ['valor', 'rota', 'tipo_veiculo', 'eixos', 'peso_acima_cotado', 'prazo_pagamento']
const NIVEL_B = ['data', 'motorista', 'veiculo_mesmo_tipo', 'endereco_mesma_cidade']
export function nivelDaAlteracao(campo: string, fiscalComecou: boolean): NivelAlteracao {
  if (fiscalComecou) return 'D'
  if (NIVEL_A.includes(campo)) return 'A'
  if (NIVEL_B.includes(campo)) return 'B'
  return 'C'
}

// D03: checklist de 11 itens para 'pronta para o fiscal'.
export type DadosChecklist = {
  motoristaEVeiculo: boolean
  aceiteMotorista: boolean
  grAprovada: boolean
  exigenciasAtendidas: boolean
  pesoKg: number
  capacidadeKg: number | null
  valorMercadoria: number
  tetoSeguro: number
  temNfe: boolean
  datasEContatos: boolean
  pisoAnttOk: boolean
  cnhNascimento: boolean
  pixMotorista: boolean
}
export function checklistCompletar(d: DadosChecklist): { itens: { id: string; ok: boolean; motivo: string }[]; pronta: boolean } {
  const itens = [
    { id: 'motorista_veiculo', ok: d.motoristaEVeiculo, motivo: 'Escolha motorista e veículo.' },
    { id: 'aceite', ok: d.aceiteMotorista, motivo: 'Falta o aceite do motorista.' },
    { id: 'gr', ok: d.grAprovada, motivo: 'Falta a GR aprovada.' },
    { id: 'exigencias', ok: d.exigenciasAtendidas, motivo: 'Há exigência da carga não atendida.' },
    { id: 'peso', ok: d.capacidadeKg != null && d.pesoKg <= d.capacidadeKg, motivo: 'Peso acima da capacidade do veículo (ou capacidade não cadastrada).' },
    { id: 'seguro', ok: d.valorMercadoria <= d.tetoSeguro, motivo: 'Mercadoria acima do valor segurado.' },
    { id: 'nfe', ok: d.temNfe, motivo: 'Falta a NF-e.' },
    { id: 'datas_contatos', ok: d.datasEContatos, motivo: 'Faltam datas ou contatos (inclui e-mail de quem recebe).' },
    { id: 'piso_antt', ok: d.pisoAnttOk, motivo: 'Frete abaixo do piso ANTT com o veículo alocado.' },
    { id: 'cnh', ok: d.cnhNascimento, motivo: 'Falta a data de nascimento da CNH.' },
    { id: 'pix', ok: d.pixMotorista, motivo: 'Falta o Pix do motorista.' },
  ]
  return { itens, pronta: itens.every((i) => i.ok) }
}

// D10: ocorrência em rota leva ao fluxo certo.
export type TipoOcorrencia = 'atraso' | 'avaria' | 'quebra' | 'acidente' | 'recusa' | 'roubo'
export function fluxoDaOcorrencia(t: TipoOcorrencia): { avisaGestor: true; avisaQuemCotou: true; proximo: string } {
  const proximo: Record<TipoOcorrencia, string> = {
    atraso: 'Registrar o atraso e avisar o cliente.',
    avaria: 'Registrar a avaria com fotos e abrir ocorrência com a seguradora se houver dano.',
    quebra: 'Acionar a troca de veículo (M3).',
    acidente: 'Avisar a seguradora e a GR.',
    recusa: 'Contatar o cliente e decidir devolução ou nova entrega.',
    roubo: 'Avisar a seguradora e a GR, e registrar o boletim de ocorrência.',
  }
  return { avisaGestor: true, avisaQuemCotou: true, proximo: proximo[t] }
}

// E02: faixas de margem (vendedor vê só a cor e a palavra); piso fixo de 26%.
export function faixaDeMargem(margemPct: number): { cor: 'vermelho' | 'amarelo' | 'verde'; palavra: 'No limite' | 'Médio' | 'Bom'; abaixoDoPiso: boolean } {
  const abaixoDoPiso = margemPct < 26
  if (margemPct < 29) return { cor: 'vermelho', palavra: 'No limite', abaixoDoPiso }
  if (margemPct <= 32) return { cor: 'amarelo', palavra: 'Médio', abaixoDoPiso }
  return { cor: 'verde', palavra: 'Bom', abaixoDoPiso }
}
// E02: sugere afrouxar o nível após 15 cotações aprovadas sem ajuste.
export const sugereAfrouxar = (aprovadasSemAjuste: number) => aprovadasSemAjuste >= 15

// E12: aviso de cotação vencida há N dias.
export function diasVencida(validade: number, agora: number): number {
  return agora > validade ? Math.floor((agora - validade) / (24 * H)) : 0
}

// F03: aviso vai a quem errou (último a mexer; sem dono, dono da etapa). Parado 2 h sobe ao gestor; 4 h e-mail (desligado por padrão).
export function destinoDoAviso(p: { ultimoAMexer?: string | null; donoDaEtapa?: string | null }): string | null {
  return p.ultimoAMexer ?? p.donoDaEtapa ?? null
}
export function escalonamento(paradoDesde: number, agora: number, emailLigado = false): { sobeAoGestor: boolean; email: boolean } {
  const h = (agora - paradoDesde) / H
  return { sobeAoGestor: h >= 2, email: emailLigado && h >= 4 }
}

// G07: disjuntor. Achado grave bloqueia novas emissões e chama o gestor; só o gestor reabre.
export type Achado = { tipo: 'divergencia_dinheiro' | 'documento_sem_averbacao' | 'saldo_baixo' | 'outro'; grave: boolean }
export function disjuntorAberto(achados: Achado[], reabertoPeloGestor = false): boolean {
  if (reabertoPeloGestor) return false
  return achados.some((a) => a.grave && a.tipo !== 'outro')
}

// G04: auditor de dinheiro. Compara os valores da mesma operação; centavos de diferença não contam.
export function divergenciasDeValor(v: { cotacao: number; cte: number | null; ciot: number | null; financeiro: number | null }, toleranciaCentavos = 1): string[] {
  const d: string[] = []
  const dif = (a: number | null, b: number) => a != null && Math.abs(a - b) * 100 > toleranciaCentavos
  if (dif(v.cte, v.cotacao)) d.push('Valor do CT-e diferente da cotação.')
  if (dif(v.ciot, v.cotacao)) d.push('Valor do CIOT diferente da cotação.')
  if (dif(v.financeiro, v.cotacao)) d.push('Valor do financeiro diferente da cotação.')
  return d
}

// B15: cancelar a operação inteira. Ordem inversa (MDF-e, CIOT, VPO, averbação, CT-e), um passo por vez; só segue se o anterior deu certo.
// O chamador informa o que existe e se o prazo de cada etapa ainda permite cancelar (ver supabase/functions/_shared/prazos.ts).
export type EtapaCancelamento = 'mdfe' | 'ciot' | 'vpo' | 'averbacao' | 'cte'
export type EstadoEtapaCancelamento = { existe: boolean; jaCancelada?: boolean; dentroDoPrazo: boolean; motivoPrazo?: string }
export type PassoCancelamento = { etapa: EtapaCancelamento; acao: 'cancelar' | 'pular' | 'travar'; motivo?: string }
const ORDEM_CANCELAMENTO: EtapaCancelamento[] = ['mdfe', 'ciot', 'vpo', 'averbacao', 'cte']
export function planoDeCancelamentoOperacao(estado: Record<EtapaCancelamento, EstadoEtapaCancelamento>): PassoCancelamento[] {
  return ORDEM_CANCELAMENTO.map((etapa) => {
    const e = estado[etapa]
    if (!e.existe || e.jaCancelada) return { etapa, acao: 'pular' as const, motivo: e.jaCancelada ? 'Já cancelado.' : 'Não existe nesta operação.' }
    if (!e.dentroDoPrazo) return { etapa, acao: 'travar' as const, motivo: e.motivoPrazo ?? 'Fora do prazo para cancelar.' }
    return { etapa, acao: 'cancelar' as const }
  })
}
// Executa o plano até o primeiro passo que trava ou falha; devolve o que já foi desfeito e onde parou.
export function andamentoDoCancelamento(plano: PassoCancelamento[], resultados: Partial<Record<EtapaCancelamento, 'feito' | 'falhou'>>): { feitos: EtapaCancelamento[]; paradoEm: EtapaCancelamento | null; motivo?: string; proximo: EtapaCancelamento | null } {
  const feitos: EtapaCancelamento[] = []
  for (const p of plano) {
    if (p.acao === 'pular') continue
    if (p.acao === 'travar') return { feitos, paradoEm: p.etapa, motivo: p.motivo, proximo: null }
    const r = resultados[p.etapa]
    if (r === 'feito') { feitos.push(p.etapa); continue }
    if (r === 'falhou') return { feitos, paradoEm: p.etapa, motivo: 'A tentativa de cancelar falhou.', proximo: null }
    return { feitos, paradoEm: null, proximo: p.etapa }
  }
  return { feitos, paradoEm: null, proximo: null }
}

// B14: emitir até a véspera da coleta (emissão ANTES da chegada do caminhão). Datas em ms; "véspera" = até o fim do dia anterior (Brasília, UTC-3).
export function dentroDaJanelaDeEmissao(coletaEm: number, agora: number): boolean {
  const BR = 3 * H
  const diaColeta = Math.floor((coletaEm - BR) / (24 * H))
  const diaAgora = Math.floor((agora - BR) / (24 * H))
  return diaAgora < diaColeta
}

// B18: documento pendente há mais de 10 min é consultado sozinho; timeout nunca reenvia sem consultar.
export function deveConsultarSozinho(pendenteDesde: number, agora: number): boolean {
  return agora - pendenteDesde > 10 * 60_000
}
export function podeReenviarAposTimeout(jaConsultou: boolean, existeNoProvedor: boolean | null): boolean {
  return jaConsultou && existeNoProvedor === false
}
