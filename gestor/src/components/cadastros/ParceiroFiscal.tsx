import type { ClassificacaoCiot, TipoParceiro } from '@rbr/shared/dbNovo'

// Tarefa 1: tipo do parceiro (quem recebe o frete) e a classificação derivada pelo banco (pessoas.classificacao_ciot).

export const TIPO_PARCEIRO_LABEL: Record<TipoParceiro, string> = {
  tac_pf: 'TAC pessoa física',
  mei_caminhoneiro: 'MEI Caminhoneiro',
  etc: 'ETC (empresa de transporte)',
}

export const CLASSIFICACAO_LABEL: Record<ClassificacaoCiot, { texto: string; detalhe: string; bg: string; cor: string }> = {
  tac: { texto: 'TAC', detalhe: 'A RBR gera o CIOT (Repom).', bg: '#EEF1F8', cor: 'var(--rbr-navy)' },
  etc_equiparada_tac: { texto: 'ETC equiparada a TAC', detalhe: 'Até 3 veículos no RNTRC: a RBR gera o CIOT.', bg: '#EEF1F8', cor: 'var(--rbr-navy)' },
  etc_ciot_proprio: { texto: 'ETC: gera o próprio CIOT', detalhe: 'Mais de 3 veículos no RNTRC: o gestor digita o número do CIOT do parceiro.', bg: '#E7F5EC', cor: 'var(--rbr-positive)' },
  etc_frota_nao_informada: { texto: 'ETC: frota não informada', detalhe: 'Informe quantos veículos a ETC tem no RNTRC.', bg: '#FDF1DC', cor: '#8A5A00' },
}

export function SeloClassificacao({ c }: { c: ClassificacaoCiot | null | undefined }) {
  if (!c) return null
  const s = CLASSIFICACAO_LABEL[c]
  return (
    <span title={s.detalhe} className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: s.bg, color: s.cor }}>
      {s.texto}
    </span>
  )
}

// Mesma regra da coluna gerada no banco, para mostrar a classificação enquanto o gestor digita.
export function classificar(tipo: string, qtd: string): ClassificacaoCiot | null {
  if (tipo === 'tac_pf' || tipo === 'mei_caminhoneiro') return 'tac'
  if (tipo !== 'etc') return null
  if (qtd.trim() === '') return 'etc_frota_nao_informada'
  return Number(qtd) <= 3 ? 'etc_equiparada_tac' : 'etc_ciot_proprio'
}

export type CamposParceiroValor = {
  tipo_parceiro: string
  cnpj: string
  qtd_veiculos_rntrc: string
  opcao_inss_direto: boolean
  data_comunicacao_inss_direto: string
}

export function CamposParceiro({
  valor,
  onChange,
  inputClass,
  inputStyle,
}: {
  valor: CamposParceiroValor
  onChange: (p: Partial<CamposParceiroValor>) => void
  inputClass: string
  inputStyle: React.CSSProperties
}) {
  const c = classificar(valor.tipo_parceiro, valor.qtd_veiculos_rntrc)
  const rotulo = 'flex flex-col gap-1 text-[11px] text-[color:var(--rbr-muted)]'
  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className={rotulo}>
          Tipo do parceiro
          <select value={valor.tipo_parceiro} onChange={(e) => onChange({ tipo_parceiro: e.target.value })} className={inputClass} style={inputStyle}>
            <option value="">Escolha…</option>
            {(Object.keys(TIPO_PARCEIRO_LABEL) as TipoParceiro[]).map((t) => (
              <option key={t} value={t}>
                {TIPO_PARCEIRO_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        {(valor.tipo_parceiro === 'etc' || valor.tipo_parceiro === 'mei_caminhoneiro') && (
          <label className={rotulo}>
            CNPJ
            <input value={valor.cnpj} onChange={(e) => onChange({ cnpj: e.target.value.replace(/\D/g, '').slice(0, 14) })} inputMode="numeric" className={inputClass} style={inputStyle} />
          </label>
        )}
        {valor.tipo_parceiro === 'etc' && (
          <label className={rotulo}>
            Veículos no RNTRC
            <input
              value={valor.qtd_veiculos_rntrc}
              onChange={(e) => onChange({ qtd_veiculos_rntrc: e.target.value.replace(/\D/g, '') })}
              inputMode="numeric"
              className={inputClass}
              style={inputStyle}
            />
          </label>
        )}
      </div>
      {c && (
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <SeloClassificacao c={c} />
          <span className="text-[color:var(--rbr-muted)]">{CLASSIFICACAO_LABEL[c].detalhe}</span>
        </div>
      )}
      {valor.tipo_parceiro === 'tac_pf' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <label className="flex items-center gap-2 text-xs md:col-span-2">
            <input type="checkbox" checked={valor.opcao_inss_direto} onChange={(e) => onChange({ opcao_inss_direto: e.target.checked })} />
            Comunicou por escrito que recolhe o INSS por conta própria
          </label>
          {valor.opcao_inss_direto && (
            <label className={rotulo}>
              Data da comunicação
              <input type="date" value={valor.data_comunicacao_inss_direto} onChange={(e) => onChange({ data_comunicacao_inss_direto: e.target.value })} className={inputClass} style={inputStyle} />
            </label>
          )}
        </div>
      )}
      {valor.tipo_parceiro === 'tac_pf' && valor.opcao_inss_direto && !valor.data_comunicacao_inss_direto && (
        <div className="text-[11px] font-semibold" style={{ color: '#8A5A00' }}>
          Sem a data da comunicação, a retenção de INSS continua ligada.
        </div>
      )}
    </div>
  )
}
