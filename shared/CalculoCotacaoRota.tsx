import { useState } from 'react'
import { supabase } from './supabaseClient'
import type { SaidaCotacaoRota } from '../supabase/functions/_shared/cotacaoRota.ts'

// Bloco "Calcular rota, piso e pedágio" da tela de Cotações (gestor e agenciador). Uma chamada à função
// calcular-cotacao-rota devolve km, piso ANTT e pedágio da Repom. NADA é gravado nem preenchido sozinho: cada cartão
// tem o botão "Usar esse valor" e só ele preenche o campo da cotação. Falha parcial mostra o que deu certo e uma
// mensagem simples; o campo manual segue valendo. No ambiente QA aparece o aviso "valor de teste".
export interface DadosPedagioUsado {
  pedagio_ida: number | null
  pedagio_volta: number | null
  incluir_volta: boolean
  pedagio_ambiente: 'qa' | 'prd'
  rota_descricao: string | null
  consultadoEm: string
}
interface Props {
  cidadeOrigem?: string | null
  ufOrigem?: string | null
  cidadeDestino?: string | null
  ufDestino?: string | null
  tipoCarga?: string | null
  eixos?: string | number | null
  tabela?: string | null
  onUsarKm: (km: number) => void
  onUsarPiso: (valor: number) => void
  onUsarPedagio: (total: number, dados: DadosPedagioUsado) => void
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const MSG_FALHA = 'Não foi possível calcular agora. Informe os valores à mão.'

export default function CalculoCotacaoRota(p: Props) {
  const [incluirVolta, setIncluirVolta] = useState(false) // desmarcada por padrão
  const [carregando, setCarregando] = useState(false)
  const [res, setRes] = useState<SaidaCotacaoRota | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [mostrarPracas, setMostrarPracas] = useState(false)
  const [usados, setUsados] = useState<Record<string, boolean>>({})

  async function calcular() {
    const eixos = Number(p.eixos)
    if (!p.cidadeOrigem || !p.ufOrigem || !p.cidadeDestino || !p.ufDestino) return setMsg('Preencha cidade e UF de origem e destino.')
    if (!p.tipoCarga) return setMsg('Escolha o tipo de carga.')
    if (!eixos) return setMsg('Informe os eixos.')
    setCarregando(true)
    setMsg(null)
    setRes(null)
    setUsados({})
    try {
      const { data, error } = await supabase.functions.invoke('calcular-cotacao-rota', {
        body: { cidade_origem: p.cidadeOrigem, uf_origem: p.ufOrigem, cidade_destino: p.cidadeDestino, uf_destino: p.ufDestino, tipo_carga: p.tipoCarga, eixos, tabela: p.tabela || 'A', incluir_volta: incluirVolta },
      })
      const r = data as (SaidaCotacaoRota & { ok?: boolean; desligado?: boolean; erro?: string }) | null
      if (error && !r) setMsg(MSG_FALHA)
      else if (r?.desligado) setMsg('O cálculo automático está desligado no momento. Informe os valores à mão.')
      else if (!r) setMsg(MSG_FALHA)
      else if (r.km == null && r.erro) setMsg(r.erro)
      else setRes(r)
    } catch {
      setMsg(MSG_FALHA)
    } finally {
      setCarregando(false)
    }
  }

  const marcar = (k: string) => setUsados((u) => ({ ...u, [k]: true }))
  const Usar = ({ k, onClick }: { k: string; onClick: () => void }) => (
    <button type="button" onClick={() => { onClick(); marcar(k) }} className="text-[11px] font-bold underline" style={{ color: 'var(--rbr-navy)' }}>
      {usados[k] ? '✓ Usado' : 'Usar esse valor'}
    </button>
  )
  const card = 'rounded-xl border p-2.5 flex flex-col gap-0.5'
  const cardStyle = { borderColor: 'var(--rbr-border)', background: '#fff' }
  const cap = 'text-[10px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]'

  return (
    <div className="flex flex-col gap-2 bg-white border rounded-xl p-3" style={{ borderColor: 'var(--rbr-border)' }}>
      <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--rbr-muted)' }}>Calcular rota, piso e pedágio</div>
      <div className="flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-1.5 text-xs font-semibold text-[color:var(--rbr-navy-dark)]">
          <input type="checkbox" checked={incluirVolta} onChange={(e) => setIncluirVolta(e.target.checked)} />
          Incluir volta
        </label>
        <button type="button" onClick={calcular} disabled={carregando} className="px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-60" style={{ background: 'var(--rbr-navy)', color: '#fff' }}>
          {carregando ? 'Calculando…' : 'Calcular'}
        </button>
      </div>
      {carregando && <div className="text-[11px] text-[color:var(--rbr-muted)]">Consultando rota, piso e pedágio…</div>}
      {msg && <div className="text-xs text-[color:var(--rbr-danger)]">{msg}</div>}
      {!res && !carregando && !msg && <div className="text-[11px] text-[color:var(--rbr-muted)]">Informe origem, destino, tipo de carga e eixos e clique em Calcular.</div>}

      {res && (
        <div className="flex flex-col gap-2">
          {res.emTeste && (
            <div className="rounded-lg px-2 py-1 text-[11px] font-bold" style={{ background: 'var(--rbr-warning-bg)', color: 'var(--rbr-navy-dark)' }}>
              Valor de teste: pedágio do ambiente de homologação da Repom. Não use como definitivo.
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className={card} style={cardStyle}>
              <span className={cap}>Distância</span>
              <span className="text-[16px] font-bold">{res.km != null ? `${res.km} km` : '—'}</span>
              {res.km != null && <Usar k="km" onClick={() => p.onUsarKm(res.km!)} />}
              <span className="text-[10px] text-[color:var(--rbr-muted)]">{res.duracaoHoras != null ? `${res.duracaoHoras} h · ` : ''}OSRM/OpenStreetMap</span>
            </div>
            <div className={card} style={cardStyle}>
              <span className={cap}>Piso ANTT{res.piso ? ` · Tabela ${res.piso.tabela}` : ''}</span>
              <span className="text-[16px] font-bold">{res.piso ? brl(res.piso.valor) : '—'}</span>
              {res.piso && <Usar k="piso" onClick={() => p.onUsarPiso(res.piso!.valor)} />}
              <span className="text-[10px] text-[color:var(--rbr-muted)]">{res.piso ? `${res.incluirVolta && res.piso.comRetornoVazio ? 'com' : 'sem'} retorno vazio · vigência ${new Date(res.piso.vigencia + 'T12:00:00').toLocaleDateString('pt-BR')}` : res.pisoErro}</span>
            </div>
            <div className={card} style={cardStyle}>
              <span className={cap}>Pedágio · Repom</span>
              <span className="text-[16px] font-bold">{res.pedagio ? brl(res.pedagio.total) : '—'}</span>
              {res.pedagio && res.incluirVolta && (
                <span className="text-[11px] text-[color:var(--rbr-muted)]">ida {res.pedagio.ida != null ? brl(res.pedagio.ida) : '—'} · volta {res.pedagio.volta != null ? brl(res.pedagio.volta) : '—'} · total {brl(res.pedagio.total)}</span>
              )}
              {res.pedagio && (
                <Usar
                  k="pedagio"
                  onClick={() => p.onUsarPedagio(res.pedagio!.total, { pedagio_ida: res.pedagio!.ida, pedagio_volta: res.pedagio!.volta, incluir_volta: res.incluirVolta, pedagio_ambiente: res.pedagio!.ambiente, rota_descricao: res.pedagio!.rodovias, consultadoEm: res.pedagio!.consultadoEm })}
                />
              )}
              <span className="text-[10px] text-[color:var(--rbr-muted)]">
                {res.pedagio ? `consultado em ${new Date(res.pedagio.consultadoEm).toLocaleDateString('pt-BR')}${res.pedagio.doCache ? ' (já consultado antes)' : ''}` : res.pedagioErro}
              </span>
            </div>
          </div>

          {res.pedagio && (res.pedagio.rodovias || res.pedagio.pracas.length > 0) && (
            <div className="text-[11px]">
              <button type="button" className="font-semibold underline" onClick={() => setMostrarPracas((v) => !v)}>
                {mostrarPracas ? 'Esconder rodovias e praças' : 'Ver rodovias e praças'}
              </button>
              {mostrarPracas && (
                <div className="mt-1 text-[color:var(--rbr-muted)]">
                  {res.pedagio.rodovias && <div>Rodovias: {res.pedagio.rodovias}</div>}
                  {res.pedagio.pracas.length === 0 && <div>A Repom não detalhou as praças nesta consulta.</div>}
                  {res.pedagio.pracas.map((pr, i) => (
                    <div key={i}>{pr.nome}{pr.rodovia ? ` · ${pr.rodovia}` : ''}{pr.valor != null ? ` · ${brl(pr.valor)}` : ''}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {res.custo != null && (
            <div className="text-xs font-semibold flex items-center justify-between rounded-lg px-2.5 py-1.5" style={{ background: 'var(--rbr-muted-bg)', color: 'var(--rbr-navy-dark)' }}>
              <span>Soma: piso + pedágio</span>
              <span>{brl(res.custo)}</span>
            </div>
          )}
          {res.avisos.map((a, i) => (
            <div key={i} className="text-[11px] text-[color:var(--rbr-muted)]">{a}</div>
          ))}
          <div className="text-[10px] text-[color:var(--rbr-muted)]">
            Piso: {res.piso?.fonte ?? 'tabela ANTT vigente'}. Distância estimada por rota rodoviária; pode divergir da rota real do motorista.
          </div>
        </div>
      )}
    </div>
  )
}
