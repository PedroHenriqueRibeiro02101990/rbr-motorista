import type { ReactNode } from 'react'
import { formatMoney } from '@rbr/shared/format'
import type { DetalheOperacao } from '../../lib/operacaoDetalhe'
import { docPor, documentoCumprido } from '../../lib/etapasOperacao'
import { etapaDoStatus } from './PassosServico'

// Cartões da operação (visual Operacao-Servico): Motorista e veículo, GR e aceites, Carga.
// Só apresentação: tudo vem do detalhe já carregado. O que o banco ainda não guarda aparece desativado.
const CARTAO = 'bg-white border rounded-2xl p-4 flex flex-col gap-3'
const ROTULO = 'text-[11px] font-extrabold tracking-[0.08em] text-[color:var(--rbr-muted)]'

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="border rounded-xl px-3 py-1.5 min-w-0" style={{ borderColor: 'var(--rbr-border)' }}>
      <div className="text-[10px] text-[color:var(--rbr-muted)]">{rotulo}</div>
      <div className="text-[13px] font-extrabold truncate text-[color:var(--rbr-navy-dark)]">{children}</div>
    </div>
  )
}

function Selo({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <span
      className="text-[11px] font-extrabold rounded-full px-2.5 py-1"
      style={ok ? { background: '#d6ecdf', color: '#1a6b3c' } : { background: '#fff0d6', color: '#7a5200' }}
    >
      {ok ? '✓' : '!'} {children}
    </span>
  )
}

function Passo({ ok, titulo, detalhe }: { ok: boolean; titulo: string; detalhe?: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span
        className="w-5 h-5 rounded-full text-white text-[11px] font-extrabold flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ background: ok ? '#1f9d55' : '#d9a21b' }}
        aria-hidden
      >
        {ok ? '✓' : '!'}
      </span>
      <div className="min-w-0">
        <div className="text-[13px] font-extrabold text-[color:var(--rbr-navy-dark)]">{titulo}</div>
        {detalhe && <div className="text-[11px] text-[color:var(--rbr-muted)]">{detalhe}</div>}
      </div>
    </div>
  )
}

function mesAno(iso: string | null): string | null {
  if (!iso) return null
  const [a, m] = iso.slice(0, 7).split('-')
  return a && m ? `${m}/${a}` : null
}

export default function CartoesOperacao({ d }: { d: DetalheOperacao }) {
  const o = d.operacao
  const m = d.motorista
  const v = d.veiculo
  const gr = docPor(d, 'gr')
  const grOk = documentoCumprido(gr)
  const aceitou = etapaDoStatus(o.status as string) >= 2 || ['aguardando_liberacao_gestor', 'ordem_liberada'].includes(o.status as string)
  const peso = o.peso_bruto != null ? Number(o.peso_bruto) : null
  const capacidade = v?.capacidade_carga != null ? Number(v.capacidade_carga) : null
  const pct = peso != null && capacidade ? Math.min(100, Math.round((peso / capacidade) * 100)) : null
  const cnh = mesAno(m?.cnh_validade ?? null)
  const nfes = d.cotacao?.nf_chave_acesso ? 1 : 0
  const valorNf = o.valor_declarado_nfe != null ? Number(o.valor_declarado_nfe) : null

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start" aria-label="Cartões da operação">
      <div className="flex flex-col gap-3 min-w-0">
        <div className={CARTAO} style={{ borderColor: 'var(--rbr-border)' }}>
          <div className={ROTULO}>MOTORISTA E VEÍCULO</div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex-1 min-w-[160px]">
              <Campo rotulo="Motorista">{m?.nome ?? 'sem motorista'}</Campo>
            </div>
            {m?.tipo_parceiro && (
              <span className="text-[11px] font-extrabold rounded-full px-2.5 py-1 uppercase" style={{ background: '#eef0fa' }}>
                {String(m.tipo_parceiro)}
              </span>
            )}
            <button
              type="button"
              disabled
              title="Ainda não disponível aqui: a troca é feita pelo painel do Fiscal"
              className="text-[12px] font-extrabold px-3 py-1.5 rounded-[10px] border bg-white opacity-50 cursor-not-allowed"
              style={{ borderColor: 'var(--rbr-border)' }}
            >
              Trocar
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Campo rotulo="Cavalo">{v?.placa ?? '—'}</Campo>
            <Campo rotulo="Reboque 1">{d.reboques[0]?.placa ?? 'não precisa'}</Campo>
            <Campo rotulo="Reboque 2">{d.reboques[1]?.placa ?? 'não precisa'}</Campo>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <Selo ok={!!cnh}>{cnh ? `CNH ${cnh}` : 'CNH sem validade'}</Selo>
            <Selo ok={(m?.rntrc_status as string | null) === 'ativo' || (m?.rntrc_status as string | null) === 'regular'}>RNTRC</Selo>
            <Selo ok={!!v?.crlv_exercicio}>CRLV</Selo>
            <Selo ok={(m?.aprovacao_status as string | null) === 'aprovado'}>Aprovado</Selo>
            <Selo ok={!!v?.rastreador_ativo}>Rastreador</Selo>
          </div>
          {v?.quantidade_eixos != null && (
            <div className="text-[12px] text-[color:var(--rbr-muted)]">
              {v.quantidade_eixos} eixos. Se mudar de eixos, o frete e o seguro mudam e a operação pede alteração.
            </div>
          )}
        </div>

        <div className={CARTAO} style={{ borderColor: 'var(--rbr-border)' }}>
          <div className={ROTULO}>GR E ACEITES</div>
          <Passo ok={grOk} titulo={grOk ? 'GR liberada' : 'GR ainda não liberada'} />
          <Passo
            ok={aceitou}
            titulo={aceitou ? 'Motorista aceitou o frete' : 'Motorista ainda não aceitou o frete'}
            detalhe={aceitou ? 'Pelo app' : 'Aguardando o aceite pelo app'}
          />
          <div className="flex items-start gap-2.5 opacity-60">
            <span className="w-5 h-5 rounded-full text-[11px] font-extrabold flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: '#e4e8f0' }} aria-hidden>
              –
            </span>
            <div>
              <div className="text-[13px] font-extrabold">Contrato de prestação</div>
              <div className="text-[11px] text-[color:var(--rbr-muted)]">ainda não disponível: o aceite do contrato não é guardado por operação</div>
            </div>
          </div>
        </div>
      </div>

      <div className={CARTAO} style={{ borderColor: 'var(--rbr-border)' }}>
        <div className={ROTULO}>CARGA</div>
        <div className="grid grid-cols-2 gap-2">
          <Campo rotulo="NF-e">{nfes > 0 ? `✓ ${nfes} anexada${nfes > 1 ? 's' : ''}` : 'nenhuma anexada'}</Campo>
          <Campo rotulo="Mercadoria">{valorNf != null ? formatMoney(valorNf) : '—'}</Campo>
        </div>
        {peso != null && capacidade ? (
          <>
            <div className="text-[12px] text-[color:var(--rbr-navy-dark)]">
              Peso {peso.toLocaleString('pt-BR')} kg de {capacidade.toLocaleString('pt-BR')} kg de capacidade
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: '#e4e8f0' }}>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: (pct ?? 0) > 100 ? '#b42318' : '#1f9d55' }} />
              </div>
              <span className="text-[12px] font-extrabold tabular-nums">{pct}%</span>
            </div>
          </>
        ) : (
          <div className="text-[12px] text-[color:var(--rbr-muted)]">Peso ou capacidade do veículo ainda não informados.</div>
        )}
        {valorNf != null && <div className="text-[12px] text-[color:var(--rbr-muted)]">Mercadoria {formatMoney(valorNf)} declarada na NF-e.</div>}
      </div>
    </div>
  )
}
