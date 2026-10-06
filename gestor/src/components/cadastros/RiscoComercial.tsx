import { useCallback, useEffect, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@rbr/shared/supabaseClient'
import { formatMoney } from '@rbr/shared/format'
import { formatarDoc } from '@rbr/shared/documento'
import { soDigitos } from '@rbr/shared/consultaCadastro'
import { Modal } from '../financeiro/ui'

// Consulta de protesto (IEPTB Online) na ficha do cliente. Cada consulta custa dinheiro,
// então NUNCA consulta sozinha: só quando o gestor clica e confirma.
// A tabela consultas_externas e o parâmetro 'consulta_protesto' ainda não estão em
// shared/database.types.ts: cliente sem tipos e tipos locais mínimos.
const db = supabase as unknown as SupabaseClient

type Regra = { validade_dias: number; custo_centavos: number; fonte: string }
type Consulta = {
  consultado_em: string
  tem_protesto: boolean | null
  quantidade: number | null
  valor_total: number | null
  resultado: Record<string, unknown> | null
}
type Confirmacao = { forcar: boolean } | null

const REGRA_PADRAO: Regra = { validade_dias: 30, custo_centavos: 350, fonte: 'ieptb_online' }
const DIA_MS = 86400000

const reais = (centavos: number) => formatMoney(centavos / 100)
const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })
const dataCurta = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })

function numero(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) ? n : null
}

// O formato exato do resultado depende do fornecedor: lê de forma tolerante.
function deLinha(l: { created_at: string; tem_protesto: boolean | null; resultado: Record<string, unknown> | null }): Consulta {
  const r = l.resultado ?? {}
  return {
    consultado_em: l.created_at,
    tem_protesto: l.tem_protesto,
    quantidade: numero(r.quantidade ?? r.quantidade_protestos ?? r.total_protestos),
    valor_total: numero(r.valor_total ?? r.valor_protestado),
    resultado: l.resultado,
  }
}

function textoDoValor(v: unknown): string {
  if (v == null || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'sim' : 'não'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export default function RiscoComercial({ cnpj }: { cnpj: string }) {
  const digitos = soDigitos(cnpj)
  const [regra, setRegra] = useState<Regra>(REGRA_PADRAO)
  const [consulta, setConsulta] = useState<Consulta | null | undefined>(undefined)
  const [confirmar, setConfirmar] = useState<Confirmacao>(null)
  const [consultando, setConsultando] = useState(false)
  const emAndamento = useRef(false)
  const [aviso, setAviso] = useState<{ tipo: 'info' | 'erro'; texto: string } | null>(null)
  const [verDetalhes, setVerDetalhes] = useState(false)

  const carregar = useCallback(async () => {
    const [{ data: p }, { data: linhas }] = await Promise.all([
      db.from('parametros_sistema').select('valor').eq('chave', 'consulta_protesto').maybeSingle(),
      db
        .from('consultas_externas')
        .select('created_at, tem_protesto, resultado')
        .in('cnpj', [digitos, formatarDoc(digitos)])
        .eq('fonte', 'ieptb_online')
        .order('created_at', { ascending: false })
        .limit(1),
    ])
    const v = (p?.valor ?? {}) as Partial<Regra>
    setRegra({
      validade_dias: numero(v.validade_dias) ?? REGRA_PADRAO.validade_dias,
      custo_centavos: numero(v.custo_centavos) ?? REGRA_PADRAO.custo_centavos,
      fonte: v.fonte ?? REGRA_PADRAO.fonte,
    })
    const l = (linhas ?? [])[0]
    setConsulta(l ? deLinha(l) : null)
  }, [digitos])

  useEffect(() => {
    if (digitos.length === 14) carregar()
  }, [digitos, carregar])

  if (digitos.length !== 14) return null

  const custo = reais(regra.custo_centavos)
  const idadeDias = consulta ? Math.floor((Date.now() - new Date(consulta.consultado_em).getTime()) / DIA_MS) : null
  const valeAte = consulta ? new Date(new Date(consulta.consultado_em).getTime() + regra.validade_dias * DIA_MS) : null
  const valida = !!valeAte && valeAte.getTime() > Date.now()

  async function consultar(forcar: boolean) {
    if (emAndamento.current) return
    emAndamento.current = true
    setConsultando(true)
    setAviso(null)
    try {
      const { data, error } = await supabase.functions.invoke('consultar-protesto', { body: { cnpj: digitos, forcar } })
      if (error) {
        const ctx = (error as { context?: Response }).context
        const status = typeof ctx?.status === 'number' ? ctx.status : null
        let corpo: { erro?: string; message?: string } | null = null
        try {
          corpo = await ctx?.json()
        } catch {
          corpo = null
        }
        const texto = `${error.message ?? ''} ${corpo?.erro ?? ''} ${corpo?.message ?? ''}`
        console.error('[consultar-protesto]', status, texto)
        setConfirmar(null)
        if (status === 404 || /not found|não encontrad|nao encontrad/i.test(texto)) {
          setAviso({ tipo: 'info', texto: 'A consulta de protesto ainda não foi ativada.' })
        } else {
          setAviso({ tipo: 'erro', texto: 'Não consegui consultar agora. Tente de novo mais tarde.' })
        }
        return
      }
      if (!data?.sucesso) {
        console.error('[consultar-protesto]', data)
        setConfirmar(null)
        setAviso({ tipo: 'erro', texto: 'Não consegui consultar agora. Tente de novo mais tarde.' })
        return
      }
      setConfirmar(null)
      setConsulta({
        consultado_em: data.consultado_em ?? new Date().toISOString(),
        tem_protesto: typeof data.tem_protesto === 'boolean' ? data.tem_protesto : null,
        quantidade: numero(data.quantidade),
        valor_total: numero(data.valor_total),
        resultado: data.resultado && typeof data.resultado === 'object' ? data.resultado : null,
      })
      if (data.do_cache) setAviso({ tipo: 'info', texto: 'Usamos a consulta que já estava salva. Nada foi cobrado.' })
    } catch (e) {
      console.error('[consultar-protesto]', e)
      setConfirmar(null)
      setAviso({ tipo: 'erro', texto: 'Não consegui consultar agora. Tente de novo mais tarde.' })
    } finally {
      emAndamento.current = false
      setConsultando(false)
    }
  }

  const botao = (forcar: boolean) => (
    <button
      type="button"
      onClick={() => setConfirmar({ forcar })}
      disabled={consultando}
      className={`text-xs font-bold px-3.5 py-2 rounded-lg disabled:opacity-60 ${forcar ? 'border' : ''}`}
      style={forcar ? { borderColor: 'var(--rbr-navy)', color: 'var(--rbr-navy)' } : { background: 'var(--rbr-navy)', color: '#fff' }}
    >
      {consultando ? 'Consultando...' : forcar ? `Consultar de novo (${custo})` : `Consultar protesto (${custo})`}
    </button>
  )

  return (
    <div className="bg-white border rounded-2xl p-4 flex flex-col gap-3" style={{ borderColor: 'var(--rbr-border)' }}>
      <div className="text-sm font-bold text-[color:var(--rbr-navy-dark)]">Risco comercial</div>

      {consulta === undefined ? (
        <div className="text-xs text-[color:var(--rbr-muted)]">Carregando…</div>
      ) : valida && consulta ? (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            {consulta.tem_protesto === false && (
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: '#E7F5EC', color: 'var(--rbr-positive)' }}>
                Sem protesto
              </span>
            )}
            {consulta.tem_protesto === true && (
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: '#FDF1DC', color: '#8A5A00' }}>
                Com protesto
              </span>
            )}
            {consulta.tem_protesto === true && (consulta.quantidade != null || consulta.valor_total != null) && (
              <span className="text-xs text-[color:var(--rbr-navy-dark)]">
                {[
                  consulta.quantidade != null ? `${consulta.quantidade} ${consulta.quantidade === 1 ? 'protesto' : 'protestos'}` : null,
                  consulta.valor_total != null ? `total ${formatMoney(consulta.valor_total)}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            )}
            {consulta.tem_protesto == null && <span className="text-xs text-[color:var(--rbr-muted)]">Resultado sem indicação de protesto. Veja os detalhes.</span>}
          </div>
          <div className="text-xs text-[color:var(--rbr-muted)]">Consultado em {dataHora(consulta.consultado_em)}</div>
          {consulta.resultado && Object.keys(consulta.resultado).length > 0 && (
            <div>
              <button type="button" onClick={() => setVerDetalhes((v) => !v)} aria-expanded={verDetalhes} className="text-xs font-bold text-[color:var(--rbr-navy)]">
                {verDetalhes ? '▾' : '▸'} Ver detalhes
              </button>
              {verDetalhes && (
                <dl className="mt-2 rounded-lg px-3 py-2 text-xs grid gap-x-3 gap-y-1" style={{ background: 'var(--rbr-muted-bg)', gridTemplateColumns: 'minmax(90px, auto) 1fr' }}>
                  {Object.entries(consulta.resultado).map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-[color:var(--rbr-muted)]">{k}</dt>
                      <dd className="text-[color:var(--rbr-navy-dark)] break-words min-w-0">{textoDoValor(v)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          )}
          <div>{botao(true)}</div>
        </>
      ) : (
        <>
          <div className="text-xs text-[color:var(--rbr-muted)]">
            {consulta ? `A última consulta, de ${dataHora(consulta.consultado_em)}, passou de ${regra.validade_dias} dias. Consulte de novo se precisar.` : 'Este CNPJ ainda não teve a consulta de protesto.'}
          </div>
          <div>{botao(false)}</div>
        </>
      )}

      {aviso && (
        <div
          className="text-xs rounded-lg px-3 py-2"
          style={aviso.tipo === 'info' ? { background: 'var(--rbr-muted-bg)', color: 'var(--rbr-navy-dark)' } : { background: '#FDF6E7', color: '#7A5A12' }}
        >
          {aviso.texto}
        </div>
      )}
      <div className="text-[11px] text-[color:var(--rbr-muted)]">O resultado vale por {regra.validade_dias} dias para não pagar duas vezes.</div>

      {confirmar && (
        <Modal titulo="Consultar protesto" onFechar={() => !consultando && setConfirmar(null)} largura="max-w-md">
          <div className="text-sm text-[color:var(--rbr-navy-dark)]">
            {confirmar.forcar && consulta && valeAte
              ? `Esta consulta já foi feita há ${idadeDias} ${idadeDias === 1 ? 'dia' : 'dias'} e vale até ${dataCurta(valeAte)}. Consultar de novo custa mais ${custo}.`
              : `Cada consulta custa ${custo}. Consultar protesto do CNPJ ${formatarDoc(digitos)}?`}
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setConfirmar(null)}
              disabled={consultando}
              className="text-sm font-bold px-4 py-2.5 rounded-xl border disabled:opacity-50"
              style={{ borderColor: 'var(--rbr-navy)', color: 'var(--rbr-navy)' }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => consultar(confirmar.forcar)}
              disabled={consultando}
              className="text-sm font-bold px-4 py-2.5 rounded-xl disabled:opacity-60"
              style={{ background: 'var(--rbr-navy)', color: '#fff' }}
            >
              {consultando ? 'Consultando...' : 'Confirmar'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
