import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@rbr/shared/supabaseClient'
import { STATUS_OPERACAO_LABEL } from '@rbr/shared/format'
import { linkWhatsApp } from '@rbr/shared/documento'
import { COR_SINAL, type CargaMapa, type MotoristaMapa } from '../mapa/MapaOperacional'
import { haQuanto, previsaoChegada, progresso } from './util'

const DOCS = [
  ['cte', 'CT-e'],
  ['mdfe', 'MDF-e'],
  ['ciot', 'CIOT'],
  ['vpo', 'Vale-pedágio'],
  ['gr', 'GR'],
  ['atm', 'Averbação'],
] as const
type TipoDoc = (typeof DOCS)[number][0]
type EstadoDoc = { ok: boolean; exigido: boolean }

function Check({ ok }: { ok: boolean }) {
  return (
    <span
      className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
      style={ok ? { background: '#E7F5EC', color: 'var(--rbr-positive)' } : { background: 'var(--rbr-muted-bg)', color: '#A3AAB9' }}
    >
      ✓
    </span>
  )
}

function Cabecalho({ sobre, titulo, onFechar }: { sobre: string; titulo: string; onFechar: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[11px] font-semibold text-[color:var(--rbr-muted)]">{sobre}</div>
        <div className="text-lg font-bold leading-snug text-[color:var(--rbr-navy-dark)] mt-0.5">{titulo}</div>
      </div>
      <button onClick={onFechar} aria-label="Fechar" className="w-8 h-8 rounded-full flex-shrink-0 text-[color:var(--rbr-muted)] hover:bg-[color:var(--rbr-navy-tint)]">
        ✕
      </button>
    </div>
  )
}

const botaoPrimario = 'flex-1 text-center text-xs font-bold px-3 py-2.5 rounded-xl'
const botaoSecundario = 'flex-1 text-center text-xs font-bold px-3 py-2.5 rounded-xl border'

export function DetalheViagem({ c, onFechar }: { c: CargaMapa; onFechar: () => void }) {
  const [docs, setDocs] = useState<Partial<Record<TipoDoc, EstadoDoc>> | null>(null)

  useEffect(() => {
    let vivo = true
    setDocs(null)
    supabase
      .from('documentacao_operacao')
      .select('tipo, status, conferencia_status, exigido')
      .eq('operacao_id', c.id)
      .in(
        'tipo',
        DOCS.map(([t]) => t),
      )
      .then(({ data }) => {
        if (!vivo) return
        const m: Partial<Record<TipoDoc, EstadoDoc>> = {}
        for (const d of data ?? []) {
          m[d.tipo as TipoDoc] = {
            ok: d.status === 'emitido' || d.conferencia_status === 'ok' || d.conferencia_status === 'aceito_manual',
            exigido: d.exigido,
          }
        }
        setDocs(m)
      })
    return () => {
      vivo = false
    }
  }, [c.id])

  const pct = progresso(c)
  const chegada = previsaoChegada(c)
  const primeiroNome = (c.motorista ?? '').split(' ')[0]

  return (
    <div className="flex flex-col gap-5">
      <Cabecalho sobre={[STATUS_OPERACAO_LABEL[c.status] ?? c.status, c.cliente].filter(Boolean).join(' · ')} titulo={`${c.origem} → ${c.destino}`} onFechar={onFechar} />

      <div className="flex flex-col gap-2 text-sm">
        <div className="flex justify-between gap-3">
          <span className="text-[color:var(--rbr-muted)]">Motorista</span>
          <span className="font-semibold text-right truncate">{c.motorista ?? '—'}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-[color:var(--rbr-muted)]">Veículo</span>
          <span className="font-semibold text-right">{[c.tipo_veiculo, c.placa].filter(Boolean).join(' · ') || '—'}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-[color:var(--rbr-muted)]">Chegada prevista</span>
          <span className="font-semibold text-right">{chegada ?? '—'}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-[color:var(--rbr-muted)]">Última posição</span>
          <span className="font-semibold text-right inline-flex items-center gap-1.5">
            {c.sinal && <span className="w-2 h-2 rounded-full" style={{ background: COR_SINAL[c.sinal] }} />}
            {c.ultima ? `${haQuanto(c.ultima.em)} · ${c.ultima.fonte === 'wialon' ? 'rastreador' : 'celular'}` : 'sem posição'}
          </span>
        </div>
        {pct != null && (
          <div className="flex items-center gap-2.5 mt-1">
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--rbr-muted-bg)' }}>
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--rbr-navy)' }} />
            </div>
            <span className="text-[11px] text-[color:var(--rbr-muted)] tabular-nums">{pct}%</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
        {DOCS.map(([t, rotulo]) => {
          const d = docs?.[t]
          return (
            <div key={t} className="flex items-center gap-2 text-[13px]" style={{ opacity: docs ? 1 : 0.5 }}>
              <Check ok={!!d?.ok} />
              <span className={d?.ok ? 'font-semibold text-[color:var(--rbr-navy-dark)]' : 'text-[color:var(--rbr-muted)]'}>{rotulo}</span>
              {d && !d.exigido && !d.ok && <span className="text-[10px] text-[color:var(--rbr-muted)]">não exige</span>}
            </div>
          )
        })}
      </div>

      <div className="flex gap-2">
        <Link to={`/operacoes?op=${c.id}`} className={botaoPrimario} style={{ background: 'var(--rbr-navy)', color: '#fff' }}>
          Abrir operação
        </Link>
        {c.celular && (
          <a
            href={linkWhatsApp(c.celular, `Olá, ${primeiroNome}! Aqui é da RBR Cargo. Tudo certo com a viagem ${c.origem} → ${c.destino}?`)}
            target="_blank"
            rel="noopener"
            className={botaoSecundario}
            style={{ borderColor: 'var(--rbr-border)', color: 'var(--rbr-navy)' }}
          >
            WhatsApp
          </a>
        )}
      </div>
    </div>
  )
}

export function DetalheMotorista({ m, onFechar }: { m: MotoristaMapa; onFechar: () => void }) {
  const veic = (m.veiculos ?? []).map((v) => `${v.tipo ?? 'Veículo'} ${v.placa}`).join(' · ')
  return (
    <div className="flex flex-col gap-5">
      <Cabecalho sobre="Disponível, sem carga" titulo={m.nome} onFechar={onFechar} />
      <div className="flex flex-col gap-2 text-sm">
        <div className="flex justify-between gap-3">
          <span className="text-[color:var(--rbr-muted)]">Veículo</span>
          <span className="font-semibold text-right">{veic || '—'}</span>
        </div>
        {m.cnh_categoria && (
          <div className="flex justify-between gap-3">
            <span className="text-[color:var(--rbr-muted)]">CNH</span>
            <span className="font-semibold">{m.cnh_categoria}</span>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <span className="text-[color:var(--rbr-muted)]">Última posição</span>
          <span className="font-semibold">
            {haQuanto(m.em)} · {m.fonte === 'wialon' ? 'rastreador' : 'celular'}
          </span>
        </div>
      </div>
      {m.celular && (
        <div className="flex gap-2">
          <a
            href={linkWhatsApp(m.celular, `Olá, ${m.nome.split(' ')[0]}! Aqui é da RBR Cargo. Você está disponível para carga?`)}
            target="_blank"
            rel="noopener"
            className={botaoPrimario}
            style={{ background: 'var(--rbr-navy)', color: '#fff' }}
          >
            WhatsApp
          </a>
        </div>
      )}
    </div>
  )
}
