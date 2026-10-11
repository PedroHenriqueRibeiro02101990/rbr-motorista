import { supabase } from '@rbr/shared/supabaseClient'
import { useCallback, useEffect, useState } from 'react'
import { brl, dataBr, msgErro } from '../../lib/novoDb'
import { Aviso, Botao, Campo, Card, Kpi, Modal, inputClass, inputStyle } from '../financeiro/ui'
import { useConfirmacao } from '../Confirmacao'
import RiscoComercial, { type ClienteRisco } from './RiscoComercial'

type Qualidade = {
  operacoes: number | null
  lucro_gerado: number | null
  lucro_medio_operacao: number | null
  custo_do_prazo: number | null
  lucro_liquido: number | null
  pct_lucro_consumido_pelo_prazo: number | null
  faturas: number | null
  faturas_em_dia: number | null
  faturas_com_atraso: number | null
  prazo_medio_dias: number | null
  atraso_medio_dias: number | null
  maior_atraso_dias: number | null
  valor_em_atraso: number | null
  leitura: string | null
}

type Historico = {
  fatura_id: string
  numero: number | string | null
  operacao_id: string | null
  valor_total: number | null
  status: string | null
  boleto_emitido_em: string | null
  vencimento: string | null
  vencimento_efetivo: string | null
  pago_em: string | null
  prazo_dias: number | null
  dias_atraso: number | null
  situacao_pagamento: string | null
  atraso_confirmado_banco: boolean | null
  atraso_confirmacao_obs: string | null
}

type Protesto = { selo: string | null; consultado_em: string | null; dias_desde_consulta: number | null }

const LEITURA: Record<string, { texto: string; tom: 'bom' | 'atencao' | 'ruim' | 'neutro' }> = {
  bom_para_a_operacao: { texto: 'Bom para a operação', tom: 'bom' },
  gera_pouco_lucro: { texto: 'Gera pouco lucro', tom: 'atencao' },
  prazo_longo_para_a_operacao: { texto: 'Prazo longo para a nossa operação', tom: 'atencao' },
  prazo_consome_o_lucro: { texto: 'O prazo consome o lucro', tom: 'ruim' },
  atrasa_com_frequencia: { texto: 'Atrasa com frequência', tom: 'ruim' },
  sem_historico: { texto: 'Ainda sem histórico', tom: 'neutro' },
}
const TOM = {
  bom: { bg: '#E7F5EC', fg: 'var(--rbr-positive)' },
  atencao: { bg: '#FDF1DC', fg: '#8A5A00' },
  ruim: { bg: '#FBE9E9', fg: 'var(--rbr-danger)' },
  neutro: { bg: 'var(--rbr-muted-bg)', fg: 'var(--rbr-muted)' },
}

const SELO_PROTESTO: Record<string, { texto: string; tom: keyof typeof TOM }> = {
  nada_consta: { texto: 'Nada consta de protesto', tom: 'bom' },
  com_protesto: { texto: 'Com protesto', tom: 'atencao' },
  consulta_antiga: { texto: 'Consulta antiga', tom: 'neutro' },
  nao_consultado: { texto: 'Protesto não consultado', tom: 'neutro' },
}

function situacaoTexto(h: Historico): { texto: string; tom: keyof typeof TOM } {
  const d = h.dias_atraso ?? 0
  switch (h.situacao_pagamento) {
    case 'em_dia':
      return { texto: 'Em dia', tom: 'bom' }
    case 'pago_com_atraso':
      return { texto: `Pago com ${d} dia(s) de atraso`, tom: 'atencao' }
    case 'em_atraso':
      return { texto: `Em atraso há ${d} dia(s)`, tom: 'ruim' }
    case 'a_vencer':
      return { texto: 'A vencer', tom: 'neutro' }
    case 'cancelada':
      return { texto: 'Cancelada', tom: 'neutro' }
    default:
      return { texto: h.situacao_pagamento ?? '—', tom: 'neutro' }
  }
}

function Selo({ texto, tom }: { texto: string; tom: keyof typeof TOM }) {
  return (
    <span className="inline-block text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap" style={{ background: TOM[tom].bg, color: TOM[tom].fg }}>
      {texto}
    </span>
  )
}

export default function FichaCliente({ cliente, onFechar }: { cliente: ClienteRisco & { id: string; cnpj?: string | null }; onFechar: () => void }) {
  const [qual, setQual] = useState<Qualidade | null | undefined>(undefined)
  const [hist, setHist] = useState<Historico[] | null>(null)
  const [prot, setProt] = useState<Protesto | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState<Historico | null>(null)
  const { confirmacao, rodar, ocupado } = useConfirmacao()

  const carregar = useCallback(async () => {
    const [q, h, p] = await Promise.all([
      supabase.from('v_qualidade_cliente').select('*').eq('cliente_id', cliente.id).maybeSingle(),
      supabase.from('v_historico_pagamento_cliente').select('*').eq('cliente_id', cliente.id).order('boleto_emitido_em', { ascending: false, nullsFirst: false }),
      supabase.from('v_protesto_cliente').select('*').eq('cliente_id', cliente.id).maybeSingle(),
    ])
    const e = q.error ?? h.error ?? p.error
    setErro(e ? msgErro(e) : null)
    setQual((q.data as Qualidade | null) ?? null)
    setHist((h.data as Historico[] | null) ?? [])
    setProt((p.data as Protesto | null) ?? null)
  }, [cliente.id])

  useEffect(() => {
    carregar()
  }, [carregar])

  const leitura = LEITURA[qual?.leitura ?? 'sem_historico'] ?? LEITURA.sem_historico
  const selo = SELO_PROTESTO[prot?.selo ?? 'nao_consultado'] ?? SELO_PROTESTO.nao_consultado
  const pct = qual?.pct_lucro_consumido_pelo_prazo

  return (
    <Modal titulo={cliente.razao_social ?? cliente.nome_fantasia ?? 'Cliente'} onFechar={onFechar} largura="max-w-4xl">
      {confirmacao}
      {erro && <Aviso>{erro}</Aviso>}

      <Card titulo="Qualidade do cliente" acao={<Selo texto={leitura.texto} tom={leitura.tom} />}>
        {qual === undefined ? (
          <div className="text-xs text-[color:var(--rbr-muted)]">Carregando…</div>
        ) : !qual || !qual.operacoes ? (
          <div className="text-xs text-[color:var(--rbr-muted)]">Ainda sem operações para este cliente.</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            <Kpi label="Lucro gerado" valor={brl(qual.lucro_gerado)} sub={`${qual.operacoes} operação(ões)`} />
            <Kpi label="Lucro médio por operação" valor={brl(qual.lucro_medio_operacao)} />
            <Kpi label="Prazo médio" valor={qual.prazo_medio_dias != null ? `${Math.round(Number(qual.prazo_medio_dias))} dias` : '—'} sub={qual.maior_atraso_dias ? `maior atraso ${qual.maior_atraso_dias} dia(s)` : undefined} />
            <Kpi
              label="Custo do prazo"
              valor={brl(qual.custo_do_prazo)}
              sub={pct != null ? `consome ${Number(pct).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% do lucro` : undefined}
              tom={pct != null && Number(pct) >= 50 ? 'ruim' : undefined}
            />
          </div>
        )}
      </Card>

      <Card titulo="Protesto" acao={<Selo texto={selo.texto} tom={selo.tom} />}>
        {prot?.consultado_em && <div className="text-[11px] text-[color:var(--rbr-muted)] mb-2">Última consulta em {dataBr(prot.consultado_em)}</div>}
        {cliente.cnpj ? (
          <RiscoComercial cnpj={cliente.cnpj} cliente={cliente} onConsultado={carregar} />
        ) : (
          <div className="text-xs text-[color:var(--rbr-muted)]">A consulta de protesto vale para clientes com CNPJ.</div>
        )}
      </Card>

      <Card titulo="Histórico de pagamentos">
        <div className="text-[11px] rounded-lg px-3 py-2 mb-3" style={{ background: 'var(--rbr-muted-bg)', color: 'var(--rbr-muted)' }}>
          Vencimento em sábado, domingo ou feriado conta como o próximo dia útil: não é atraso. Prazo = da emissão do boleto até o pagamento.
        </div>
        {hist === null ? (
          <div className="text-xs text-[color:var(--rbr-muted)]">Carregando…</div>
        ) : hist.length === 0 ? (
          <div className="text-xs text-[color:var(--rbr-muted)]">Nenhuma fatura ainda.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10.5px] uppercase tracking-wide text-[color:var(--rbr-muted)]">
                  <th className="py-1.5 pr-3">Fatura</th>
                  <th className="pr-3">Operação</th>
                  <th className="pr-3 text-right">Valor</th>
                  <th className="pr-3">Boleto emitido</th>
                  <th className="pr-3">Venceu</th>
                  <th className="pr-3">Pagou</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {hist.map((h) => {
                  const s = situacaoTexto(h)
                  const podeConfirmar = h.situacao_pagamento === 'em_atraso' || h.situacao_pagamento === 'pago_com_atraso'
                  return (
                    <tr key={h.fatura_id} className="border-t align-top" style={{ borderColor: 'var(--rbr-border)' }}>
                      <td className="py-2 pr-3 font-semibold">#{h.numero ?? '—'}</td>
                      <td className="pr-3 tabular-nums">{h.operacao_id ? h.operacao_id.slice(0, 6) : '—'}</td>
                      <td className="pr-3 text-right tabular-nums">{brl(h.valor_total)}</td>
                      <td className="pr-3 tabular-nums">{dataBr(h.boleto_emitido_em)}</td>
                      <td className="pr-3 tabular-nums">
                        {dataBr(h.vencimento)}
                        {h.vencimento_efetivo && h.vencimento_efetivo !== h.vencimento && <div className="text-[10.5px] text-[color:var(--rbr-muted)]">conta {dataBr(h.vencimento_efetivo)}</div>}
                      </td>
                      <td className="pr-3 tabular-nums">{dataBr(h.pago_em)}</td>
                      <td>
                        <Selo texto={s.texto} tom={s.tom} />
                        {h.atraso_confirmado_banco && (
                          <div className="text-[10.5px] text-[color:var(--rbr-muted)] mt-1">✓ Confirmado com o banco{h.atraso_confirmacao_obs ? `: ${h.atraso_confirmacao_obs}` : ''}</div>
                        )}
                        {podeConfirmar && !h.atraso_confirmado_banco && (
                          <button type="button" className="block text-[11px] font-bold text-[color:var(--rbr-navy)] mt-1" onClick={() => setConfirmando(h)}>
                            Confirmei com o banco
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {confirmando && (
        <ConfirmarBanco
          h={confirmando}
          ocupado={ocupado}
          onFechar={() => setConfirmando(null)}
          onConfirmar={async (obs) => {
            const r = await rodar(`Atraso da fatura #${confirmando.numero} marcado como confirmado com o banco`, async () => {
              const { error } = await supabase.from('faturas').update({ atraso_confirmado_banco: true, atraso_confirmacao_obs: obs.trim() || null }).eq('id', confirmando.fatura_id)
              if (error) throw error
              return true
            })
            if (r) {
              setConfirmando(null)
              carregar()
            }
          }}
        />
      )}
    </Modal>
  )
}

function ConfirmarBanco({ h, ocupado, onFechar, onConfirmar }: { h: Historico; ocupado: boolean; onFechar: () => void; onConfirmar: (obs: string) => void }) {
  const [obs, setObs] = useState(h.atraso_confirmacao_obs ?? '')
  return (
    <Modal titulo={`Fatura #${h.numero}: confirmei com o banco`} onFechar={onFechar} largura="max-w-md">
      <Campo label="Observação (opcional)">
        <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: banco confirmou o pagamento em 12/10" className={inputClass} style={inputStyle} />
      </Campo>
      <div className="flex justify-end gap-2">
        <Botao variante="secundario" onClick={onFechar}>
          Cancelar
        </Botao>
        <Botao onClick={() => onConfirmar(obs)} disabled={ocupado}>
          {ocupado ? 'enviando…' : 'Confirmar'}
        </Botao>
      </div>
    </Modal>
  )
}
