// B10: alertas antes de alocar. Confere o que o CT-e, o MDF-e, o CIOT e o VPO exigem do veículo e do titular,
// para o gestor ver ANTES de alocar e não só na hora de emitir. Só informa: quem decide é o gestor.
export interface VeiculoAlocacao {
  placa?: string | null
  crlv_exercicio?: number | null
  rntrc_status?: string | null
  rntrc_validade?: string | null
  tara_kg?: number | null
  quantidade_eixos?: number | null
  uf_licenciamento?: string | null
  is_veiculo_proprio?: boolean | null
}

export interface TitularAlocacao {
  rntrc_numero?: string | null
  rntrc_status?: string | null
  rntrc_validade?: string | null
}

export type AlertaAlocacao = { gravidade: 'bloqueia' | 'avisa'; texto: string }

const RNTRC_OK = ['ativo', 'regular', 'valido']

function rntrcVencido(validade: string | null | undefined, hoje: string): boolean {
  return !!validade && validade.slice(0, 10) < hoje
}

export function alertasDeAlocacao(v: VeiculoAlocacao | null, titular: TitularAlocacao | null, hoje = new Date().toISOString().slice(0, 10)): AlertaAlocacao[] {
  const out: AlertaAlocacao[] = []
  if (!v) {
    out.push({ gravidade: 'avisa', texto: 'Este motorista não tem veículo vinculado nesta sugestão.' })
    return out
  }
  const ano = Number(hoje.slice(0, 4))
  if (!v.crlv_exercicio) out.push({ gravidade: 'bloqueia', texto: 'CRLV sem exercício cadastrado.' })
  else if (v.crlv_exercicio < ano - 1) out.push({ gravidade: 'bloqueia', texto: `CRLV vencido (exercício ${v.crlv_exercicio}).` })

  const status = String(v.rntrc_status ?? '').toLowerCase()
  if (!RNTRC_OK.includes(status)) out.push({ gravidade: 'bloqueia', texto: 'RNTRC do veículo não está ativo.' })
  else if (rntrcVencido(v.rntrc_validade, hoje)) out.push({ gravidade: 'bloqueia', texto: 'RNTRC do veículo vencido.' })

  if (!v.tara_kg || v.tara_kg <= 0) out.push({ gravidade: 'bloqueia', texto: 'Veículo sem tara (kg): obrigatória no MDF-e.' })
  if (!v.quantidade_eixos || v.quantidade_eixos <= 0) out.push({ gravidade: 'avisa', texto: 'Veículo sem número de eixos: o piso ANTT, o CIOT e o VPO usam essa informação.' })
  if (!v.uf_licenciamento) out.push({ gravidade: 'bloqueia', texto: 'Veículo sem UF de licenciamento: obrigatória no MDF-e.' })

  if (v.is_veiculo_proprio === false) {
    if (!titular) {
      out.push({ gravidade: 'bloqueia', texto: 'Veículo de terceiro sem titular (proprietário) vinculado: obrigatório no MDF-e.' })
    } else {
      // Igual ao MDF-e (formatarRntrc): 9 dígitos com zero à esquerda valem como 8.
      const numero = String(titular.rntrc_numero ?? '').replace(/\D/g, '').replace(/^0+(?=\d{8}$)/, '')
      if (numero.length !== 8) out.push({ gravidade: 'bloqueia', texto: 'Titular do veículo sem RNTRC de 8 dígitos: obrigatório no MDF-e.' })
      else if (!RNTRC_OK.includes(String(titular.rntrc_status ?? '').toLowerCase())) out.push({ gravidade: 'bloqueia', texto: 'RNTRC do titular não está ativo.' })
      else if (rntrcVencido(titular.rntrc_validade, hoje)) out.push({ gravidade: 'bloqueia', texto: 'RNTRC do titular vencido.' })
    }
  }
  return out
}
