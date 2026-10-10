import { useEffect, useState } from 'react'
import { db, dataBr, msgErro } from '../../lib/novoDb'
import { Aviso } from './ui'

export type AjusteVencimento = 'manter' | 'proximo_dia_util' | 'dia_util_anterior'
export type EscolhaVencimento = { data: string; original: string; ajuste: AjusteVencimento }

type Alternativa = { data: string; dia_semana?: string; prazo_dias: number }
type Sugestao = {
  vencimento_pelo_prazo?: string
  dia_semana?: string
  eh_dia_util: boolean
  motivo?: string | null
  proximo_dia_util?: Alternativa | null
  dia_util_anterior?: Alternativa | null
  conferido?: { fim_de_semana?: boolean; nacionais?: boolean; sao_paulo?: boolean; municipio_do_cliente?: boolean }
}

function Chip({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span
      className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={ok ? { background: '#E7F5EC', color: 'var(--rbr-positive)' } : { background: '#FDF1DC', color: '#8A5A00' }}
    >
      {ok ? '✓ ' : ''}
      {children}
    </span>
  )
}

// Ao escolher a data do boleto, consulta a regra de dia útil (sugerir_vencimento) e deixa o gestor
// escolher: próximo dia útil, dia útil anterior ou manter. Devolve a escolha para quem grava.
export default function VencimentoBoleto({
  clienteId,
  emissao,
  venc,
  onChange,
}: {
  clienteId: string | null | undefined
  emissao: string
  venc: string
  onChange: (e: EscolhaVencimento | null) => void
}) {
  const [sug, setSug] = useState<Sugestao | null>(null)
  const [ajuste, setAjuste] = useState<AjusteVencimento>('proximo_dia_util')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const prazo = venc && emissao ? Math.round((new Date(venc + 'T00:00:00').getTime() - new Date(emissao + 'T00:00:00').getTime()) / 86400000) : 0

  useEffect(() => {
    let vivo = true
    setSug(null)
    setErro(null)
    if (!venc) {
      onChange(null)
      return
    }
    setCarregando(true)
    ;(async () => {
      try {
        let ibge: string | null = null
        let uf: string | null = null
        if (clienteId) {
          const r = await db.rpc('municipio_ibge_cliente', { p_cliente: clienteId })
          if (!r.error) ibge = (r.data as string | null) ?? null
          const c = await db.from('clientes').select('uf').eq('id', clienteId).maybeSingle()
          uf = (c.data as { uf?: string | null } | null)?.uf ?? null
        }
        const { data, error } = await db.rpc('sugerir_vencimento', { p_emissao: emissao, p_prazo_dias: Math.max(prazo, 0), p_municipio_ibge: ibge, p_uf: uf })
        if (error) throw error
        if (!vivo) return
        const s = data as Sugestao
        setSug(s)
        setAjuste(s.eh_dia_util ? 'manter' : 'proximo_dia_util')
      } catch (e) {
        if (!vivo) return
        setErro(`Não consegui conferir o dia útil: ${msgErro(e)}. A data fica como está.`)
        setAjuste('manter')
      } finally {
        if (vivo) setCarregando(false)
      }
    })()
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venc, emissao, clienteId])

  useEffect(() => {
    if (!venc) return
    let data = venc
    if (sug && !sug.eh_dia_util) {
      if (ajuste === 'proximo_dia_util' && sug.proximo_dia_util?.data) data = sug.proximo_dia_util.data
      else if (ajuste === 'dia_util_anterior' && sug.dia_util_anterior?.data) data = sug.dia_util_anterior.data
    }
    onChange({ data, original: venc, ajuste: data === venc ? 'manter' : ajuste })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sug, ajuste, venc])

  if (!venc) return null
  const conf = sug?.conferido
  const cai = sug?.motivo || sug?.dia_semana || 'dia não útil'
  const opcoes: { v: AjusteVencimento; t: string }[] = []
  if (sug && !sug.eh_dia_util) {
    if (sug.proximo_dia_util) opcoes.push({ v: 'proximo_dia_util', t: `Próximo dia útil – ${dataBr(sug.proximo_dia_util.data)} (prazo ${sug.proximo_dia_util.prazo_dias} dias)` })
    if (sug.dia_util_anterior) opcoes.push({ v: 'dia_util_anterior', t: `Dia útil anterior – ${dataBr(sug.dia_util_anterior.data)}` })
    opcoes.push({ v: 'manter', t: 'Manter a data' })
  }

  return (
    <div className="flex flex-col gap-2">
      {carregando && <div className="text-[11px] text-[color:var(--rbr-muted)]">Conferindo dia útil…</div>}
      {erro && <Aviso tipo="atencao">{erro}</Aviso>}
      {sug && !sug.eh_dia_util && (
        <div className="rounded-lg border px-3 py-2.5 flex flex-col gap-2" style={{ borderColor: '#F0D6A0', background: '#FDF8EC' }}>
          <div className="text-xs font-bold" style={{ color: '#8A5A00' }}>
            {dataBr(venc)} cai em {cai}
          </div>
          {opcoes.map((o) => (
            <label key={o.v} className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="radio" name="ajuste-vencimento" checked={ajuste === o.v} onChange={() => setAjuste(o.v)} />
              {o.t}
            </label>
          ))}
        </div>
      )}
      {conf && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-[color:var(--rbr-muted)]">Conferido:</span>
          <Chip ok={conf.fim_de_semana !== false}>fim de semana</Chip>
          <Chip ok={conf.nacionais !== false}>feriados nacionais</Chip>
          <Chip ok={conf.sao_paulo !== false}>São Paulo</Chip>
          <Chip ok={!!conf.municipio_do_cliente}>{conf.municipio_do_cliente ? 'município do cliente' : 'município do cliente: não conferido'}</Chip>
        </div>
      )}
      {conf && !conf.municipio_do_cliente && (
        <div className="text-[11px] text-[color:var(--rbr-muted)]">
          O feriado municipal da cidade do cliente não está cadastrado; se houver dúvida, confirme com o cliente ou o banco.
        </div>
      )}
    </div>
  )
}
