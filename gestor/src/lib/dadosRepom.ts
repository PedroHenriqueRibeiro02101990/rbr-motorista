// B7: dados que o portal da Repom pede, a partir do detalhe da operação (só leitura). Subcontratado fica em branco de propósito.
import type { DetalheOperacao } from './operacaoDetalhe'

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const LIMITE_ADIANTAMENTO = 0.8

export function dadosRepom(d: DetalheOperacao): { rotulo: string; valor: string; aviso?: string }[] {
  const op = d.operacao
  const cte = d.documentos.find((x) => x.tipo === 'cte')
  const peso = op.peso_bruto != null ? Number(op.peso_bruto) : null
  const valorNf = op.valor_declarado_nfe != null ? Number(op.valor_declarado_nfe) : null
  const contrato = d.condicao ? Number(d.condicao.valor_total_contrato) : null
  const maxAdiant = contrato != null ? Math.round(contrato * LIMITE_ADIANTAMENTO * 100) / 100 : null
  const adiant = d.condicao?.valor_adiantamento != null ? Number(d.condicao.valor_adiantamento) : null
  return [
    { rotulo: 'Placa do cavalo', valor: d.veiculo?.placa ?? '' },
    { rotulo: 'Eixos', valor: d.veiculo?.quantidade_eixos != null ? String(d.veiculo.quantidade_eixos) : '' },
    { rotulo: 'CPF do motorista', valor: (d.motorista?.cpf ?? '').replace(/\D/g, '') },
    { rotulo: 'Chave da NF-e', valor: (d.cotacao?.nf_chave_acesso ?? '').replace(/\D/g, '') },
    { rotulo: 'Chave do CT-e', valor: (cte?.chave_acesso ?? '').replace(/\D/g, '') },
    { rotulo: 'Peso (kg)', valor: peso != null ? String(peso) : '', aviso: peso == null ? 'A NF não trouxe o peso: confira antes de copiar.' : undefined },
    { rotulo: 'NCM', valor: (d.cotacao?.ncms_produtos ?? []).join(', ') },
    { rotulo: 'Valor da carga (R$)', valor: valorNf != null ? valorNf.toFixed(2).replace('.', ',') : '' },
    {
      rotulo: 'Adiantamento (R$)',
      valor: adiant != null ? adiant.toFixed(2).replace('.', ',') : '',
      aviso:
        adiant != null && maxAdiant != null && adiant > maxAdiant
          ? `Acima de 80% do contrato (máximo ${brl(maxAdiant)}).`
          : maxAdiant != null
            ? `O portal aceita até 80% do contrato: ${brl(maxAdiant)}.`
            : undefined,
    },
    { rotulo: 'Subcontratado', valor: '', aviso: 'Deixado em branco de propósito. Preencha no portal só se houver subcontratação.' },
  ]
}

