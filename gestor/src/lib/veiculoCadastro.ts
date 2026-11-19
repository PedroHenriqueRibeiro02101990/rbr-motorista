// Regras do cadastro de veiculo (A7, noite de 18/11/2026). Funcoes puras. Teste: node --test gestor/test/veiculoCadastro.test.ts
import { classeDoVeiculo, taraPlausivel } from '../../../supabase/functions/_shared/tara-aproximada.ts'

export interface VeiculoForm { tipo_veiculo?: string | null; e_reboque?: boolean | null; tara_kg?: string | number | null; capacidade_carga?: string | number | null; quantidade_eixos?: string | number | null }
export interface AchadoVeiculo { nivel: 'bloqueio' | 'aviso'; campo: 'e_reboque' | 'tara_kg' | 'uf_titular'; mensagem: string }

const num = (x: unknown): number | null => { const n = typeof x === 'string' ? Number(x.replace(',', '.')) : (x as number); return typeof n === 'number' && Number.isFinite(n) ? n : null }
const TIPO_REBOQUE = /carreta|semi|reboque/i

/** A RBR nao tem frota propria: todo veiculo cadastrado com titular (motorista, TAC, terceiro) grava is_veiculo_proprio = false. true so para frota da RBR (sem titular). */
export function veiculoProprioParaGravar(temTitular: boolean, marcadoNaTela: boolean): boolean {
  return temTitular ? false : marcadoNaTela
}

export function achadosVeiculo(v: VeiculoForm, titular?: { cpf?: string | null; cnpj?: string | null; uf?: string | null } | null): AchadoVeiculo[] {
  const out: AchadoVeiculo[] = []
  if (TIPO_REBOQUE.test(String(v.tipo_veiculo ?? '')) && v.e_reboque !== true) {
    out.push({ nivel: 'bloqueio', campo: 'e_reboque', mensagem: 'Semirreboque/carreta precisa estar marcado como "É carreta / semirreboque": sem isso o MDF-e não leva a carreta como reboque.' })
  }
  const tara = num(v.tara_kg)
  if (tara !== null) {
    const classe = classeDoVeiculo({ tipo_veiculo: v.tipo_veiculo, e_reboque: v.e_reboque })
    const cap = num(v.capacidade_carga)
    if (!taraPlausivel(classe, tara)) out.push({ nivel: 'aviso', campo: 'tara_kg', mensagem: `Tara de ${tara} kg fora da faixa para ${classe === 'carreta' ? 'carreta (2.000 a 20.000 kg)' : 'este tipo de veículo (1.000 a 30.000 kg)'}. Confira a unidade (kg, não toneladas).` })
    else if (classe === 'cavalo' && tara > 13000) out.push({ nivel: 'aviso', campo: 'tara_kg', mensagem: `Tara de ${tara} kg é alta para cavalo mecânico (comum: 6.000 a 11.000 kg). Pode ser o PBT ou o peso da carga: confira no CRLV.` })
    if (cap !== null && cap === tara) out.push({ nivel: 'aviso', campo: 'tara_kg', mensagem: 'A tara é igual à capacidade de carga: provavelmente um dos dois está errado.' })
  }
  if (titular && String(titular.cpf ?? '').replace(/\D/g, '').length === 11 && !String(titular.uf ?? '').trim()) {
    out.push({ nivel: 'bloqueio', campo: 'uf_titular', mensagem: 'O titular (pessoa física) está sem UF no cadastro: o MDF-e exige a UF do proprietário do veículo. Preencha a UF do titular.' })
  }
  return out
}
