import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@rbr/shared/supabaseClient'
import type { Database } from '@rbr/shared/database.types'
import { formatMoney, formatDate, formatDateTime, STATUS_OPERACAO_LABEL, TIPO_DOC_LABEL } from '@rbr/shared/format'
import { IconCheck } from '@rbr/shared/icons'
import {
  carregarDetalhe,
  camposFaltando,
  montarFicha,
  textoFicha,
  type AssessoriaContato,
  type DetalheOperacao,
  type Documento,
  type Pessoa,
  type Veiculo,
} from '../../lib/operacaoDetalhe'
import { type Apoio, type Lancamento, type ResultadoOperacao, carregarApoio } from '../../lib/financeiro'
import { BaixaModal } from '../financeiro/LancamentoModais'

type StatusOperacao = Database['public']['Enums']['status_operacao']

const inputClass = 'border rounded-lg px-3 py-2 text-sm outline-none w-full bg-white'
const inputStyle = { borderColor: 'var(--rbr-border)' }
const labelClass = 'text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] mb-1.5 block'
const secaoClass = 'rounded-xl border p-3.5 flex flex-col gap-3'
const secaoStyle = { borderColor: 'var(--rbr-border)' }

const STATUS_ORDEM: StatusOperacao[] = [
  'alocando_motorista',
  'aguardando_liberacao_fiscal',
  'liberada_coleta',
  'carregando',
  'em_transito',
  'entregue',
  'fechada',
  'cancelada',
]

const CONFERENCIA_LABEL: Record<string, { txt: string; bg: string; color: string }> = {
  nao_conferido: { txt: 'Aguardando arquivo', bg: 'var(--rbr-muted-bg)', color: 'var(--rbr-muted)' },
  conferindo: { txt: 'Conferindo…', bg: '#EDEFF7', color: 'var(--rbr-navy)' },
  ok: { txt: 'Conferido', bg: '#E7F5EC', color: 'var(--rbr-positive)' },
  aceito_manual: { txt: 'Aceito manualmente', bg: '#E7F5EC', color: 'var(--rbr-positive)' },
  divergente: { txt: 'Divergente', bg: '#FBE9E9', color: 'var(--rbr-danger)' },
  erro: { txt: 'Erro na leitura', bg: '#FBE9E9', color: 'var(--rbr-danger)' },
}

// Data local (Brasília), não UTC — depois das 21h o toISOString já seria "amanhã".
const hoje = () => new Date().toLocaleDateString('sv-SE')

// Aceita "5000", "5.000", "5.000,50", "5000,50" e "5000.50".
export function parseBRL(v: string): number {
  const t = v.trim()
  if (!t) return NaN
  const normal = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : t
  return Number(normal)
}

// Tira a mensagem de erro de verdade de dentro da resposta da Edge Function (supabase-js só diz "non-2xx").
async function erroDaFuncao(error: unknown, data: unknown): Promise<string> {
  const d = data as { erro?: string } | null
  if (d?.erro) return d.erro
  const ctx = (error as { context?: { json?: () => Promise<unknown> } } | null)?.context
  if (ctx?.json) {
    try {
      const corpo = (await ctx.json()) as { erro?: string } | null
      if (corpo?.erro) return corpo.erro
    } catch {
      /* corpo não era JSON */
    }
  }
  return (error as { message?: string } | null)?.message ?? 'erro desconhecido'
}
const digitos = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')

function Badge({ ok, children }: { ok: boolean | null; children: React.ReactNode }) {
  const style =
    ok === null
      ? { background: 'var(--rbr-muted-bg)', color: 'var(--rbr-muted)' }
      : ok
        ? { background: '#E7F5EC', color: 'var(--rbr-positive)' }
        : { background: '#FBE9E9', color: 'var(--rbr-danger)' }
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={style}>
      {children}
    </span>
  )
}

interface Candidato {
  veiculo: Veiculo
  pessoa: Pessoa
  titular: Pessoa | null
  checks: { txt: string; ok: boolean | null; critico: boolean }[]
  pontos: number
  saldo: number | null
}

export default function OperacaoFluxo({
  operacaoId,
  gestor,
  assessoria,
  onChanged,
}: {
  operacaoId: string
  gestor: Pessoa
  assessoria: AssessoriaContato
  onChanged: () => void
}) {
  const [d, setD] = useState<DetalheOperacao | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const recarregar = useCallback(async () => {
    try {
      setD(await carregarDetalhe(operacaoId))
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar a operação.')
    }
  }, [operacaoId])

  useEffect(() => {
    recarregar()
  }, [recarregar])

  async function executar(fn: () => Promise<void>, sucesso?: string) {
    setErro(null)
    setOk(null)
    setSalvando(true)
    try {
      await fn()
      if (sucesso) setOk(sucesso)
      await recarregar()
      onChanged()
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? String(e)
      setErro(msg)
      await recarregar()
    } finally {
      setSalvando(false)
    }
  }

  if (!d) return <div className="text-xs text-[color:var(--rbr-muted)]">{erro ?? 'Carregando detalhes…'}</div>

  const o = d.operacao
  const editavelAlocacao = o.status === 'alocando_motorista' || o.status === 'aguardando_liberacao_fiscal'

  return (
    <div className="flex flex-col gap-3.5">
      {erro && (
        <div className="text-xs rounded-xl px-3 py-2.5" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
          {erro}
        </div>
      )}
      {ok && (
        <div className="text-xs rounded-xl px-3 py-2.5 flex items-center gap-2" style={{ background: '#E7F5EC', color: 'var(--rbr-positive)' }}>
          <IconCheck width={13} height={13} />
          {ok}
        </div>
      )}

      <ResumoPreco d={d} />
      <Alocacao d={d} editavel={editavelAlocacao} salvando={salvando} executar={executar} />
      {o.veiculo_id && o.pessoa_alocada_id && <Pagamento d={d} salvando={salvando} executar={executar} />}
      {o.status !== 'alocando_motorista' && (
        <Documentos d={d} gestor={gestor} salvando={salvando} executar={executar} recarregar={recarregar} />
      )}
      {o.veiculo_id && o.pessoa_alocada_id && <FichaAssessoria d={d} assessoria={assessoria} />}
      {d.cotacao && (
        <FinanceiroOperacao operacaoId={o.id} versao={`${o.status}|${o.updated_at}|${d.condicao?.updated_at ?? ''}|${d.cotacao.updated_at ?? ''}`} />
      )}
      <StatusELiberacao d={d} salvando={salvando} executar={executar} />
    </div>
  )
}

// ---------------------------------------------------------------------------
function ResumoPreco({ d }: { d: DetalheOperacao }) {
  const c = d.cotacao
  if (!c) return null
  const linhas: [string, number | null | undefined][] = [
    ['Preço cobrado do cliente', c.valor_total],
    ['Total a pagar ao motorista', c.valor_total_motorista ?? c.valor_frete_motorista],
    ['Pedágio', c.pedagio],
    ['TAG seguro', c.valor_seguro_tag],
    ['Custos adicionais', c.custos_adicionais_total],
    ['Imposto (estimado)', c.valor_imposto],
    ['Lucro RBR', c.lucro_rbr],
  ]
  return (
    <div className={secaoClass} style={secaoStyle}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm font-bold text-[color:var(--rbr-navy-dark)]">Resumo da cotação</div>
        <Link to="/cotacao" className="text-[11px] underline font-semibold" style={{ color: 'var(--rbr-navy)' }}>
          abrir cotação
        </Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {linhas.map(([rotulo, valor]) => (
          <div key={rotulo} className="rounded-lg px-2.5 py-2" style={{ background: 'var(--rbr-muted-bg)' }}>
            <div className="text-[10px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">{rotulo}</div>
            <div className="text-sm font-bold tabular-nums">{formatMoney(valor ?? null)}</div>
          </div>
        ))}
      </div>
      {d.custos.length > 0 && (
        <div className="flex flex-col gap-1">
          {d.custos.map((x) => (
            <div key={x.id} className="flex justify-between text-xs gap-2">
              <span>
                {x.tipos_custo_adicional?.nome ?? 'Custo'}
                <span className="text-[color:var(--rbr-muted)]">
                  {' '}
                  → {x.recebedor === 'motorista' ? 'motorista' : x.fornecedores?.nome ?? x.fornecedores?.razao_social ?? x.recebedor}
                </span>
              </span>
              <span className="tabular-nums">{formatMoney(x.valor_total)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="text-xs text-[color:var(--rbr-muted)]">
        {c.cidade_origem}/{c.uf_origem} → {c.cidade_destino}/{c.uf_destino}
        {c.tipo_carga ? ` · ${c.tipo_carga}` : ''}
        {c.eixos ? ` · ${c.eixos} eixos` : ''}
        {c.peso_bruto_kg ? ` · ${c.peso_bruto_kg.toLocaleString('pt-BR')} kg` : ''}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
type Executar = (fn: () => Promise<void>, sucesso?: string) => Promise<void>

function Alocacao({ d, editavel, salvando, executar }: { d: DetalheOperacao; editavel: boolean; salvando: boolean; executar: Executar }) {
  const o = d.operacao
  const [veiculos, setVeiculos] = useState<Veiculo[]>([])
  const [pessoas, setPessoas] = useState<Pessoa[]>([])
  const [ocupados, setOcupados] = useState<Set<string>>(new Set())
  const [saldos, setSaldos] = useState<Record<string, number>>({})
  const [veiculoSel, setVeiculoSel] = useState(o.veiculo_id ?? '')
  const [pessoaSel, setPessoaSel] = useState(o.pessoa_alocada_id ?? '')
  const [reboqueAdd, setReboqueAdd] = useState('')
  const [verTodos, setVerTodos] = useState(false)

  useEffect(() => {
    setVeiculoSel(o.veiculo_id ?? '')
    setPessoaSel(o.pessoa_alocada_id ?? '')
  }, [o.veiculo_id, o.pessoa_alocada_id])

  useEffect(() => {
    if (!editavel) return
    Promise.all([
      supabase.from('veiculos').select('*').eq('ativo', true).is('deleted_at', null).order('placa'),
      supabase.from('pessoas').select('*').in('papel', ['titular_motorista', 'condutor']).eq('status', 'ativo').order('nome'),
      supabase
        .from('operacoes')
        .select('id, veiculo_id, pessoa_alocada_id')
        .in('status', ['aguardando_liberacao_fiscal', 'liberada_coleta', 'carregando', 'em_transito'])
        .neq('id', o.id),
      supabase.from('pontuacao_saldo').select('pessoa_id, saldo'),
    ]).then(([v, p, ops, pts]) => {
      setVeiculos(v.data ?? [])
      setPessoas(p.data ?? [])
      const s = new Set<string>()
      for (const x of ops.data ?? []) {
        if (x.veiculo_id) s.add(x.veiculo_id)
        if (x.pessoa_alocada_id) s.add(x.pessoa_alocada_id)
      }
      setOcupados(s)
      const m: Record<string, number> = {}
      for (const x of (pts.data ?? []) as { pessoa_id: string | null; saldo: number | null }[]) if (x.pessoa_id) m[x.pessoa_id] = x.saldo ?? 0
      setSaldos(m)
    })
  }, [editavel, o.id])

  const precisaSatelite = o.carga_complexa_eixo1_perigosa || o.carga_complexa_eixo3_seguro_excedido
  const cargaComplexa = o.carga_complexa_eixo1_perigosa || o.carga_complexa_eixo2_superdimensionada || o.carga_complexa_eixo3_seguro_excedido

  const candidatos = useMemo<Candidato[]>(() => {
    const porId = new Map(pessoas.map((p) => [p.id, p]))
    const lista: Candidato[] = []
    for (const v of veiculos.filter((x) => !x.e_reboque)) {
      const titular = porId.get(v.titular_id) ?? null
      const motoristas = pessoas.filter((p) => p.id === v.titular_id || (p.papel === 'condutor' && p.titular_id === v.titular_id))
      for (const p of motoristas) {
        const checks: Candidato['checks'] = []
        const add = (txt: string, okv: boolean | null, critico = true) => checks.push({ txt, ok: okv, critico })
        add('Cadastro do motorista aprovado', p.aprovacao_status === 'aprovado')
        add('Veículo aprovado', v.aprovacao_status === 'aprovado')
        add('RNTRC do veículo', (v.rntrc_status ?? '').toLowerCase() === 'ativo')
        add('RNTRC do transportador', (titular?.rntrc_status ?? '').toLowerCase() === 'ativo')
        add('CNH válida', !!p.cnh_validade && p.cnh_validade >= hoje())
        if (v.seguro_veiculo_vencimento) add('Seguro do veículo', v.seguro_veiculo_vencimento >= hoje(), false)
        if (precisaSatelite) add('Rastreador por satélite', v.rastreador_tipo === 'wialon' && v.rastreador_ativo)
        add('Livre (sem outra carga)', !ocupados.has(v.id) && !ocupados.has(p.id))
        if (d.cotacao?.eixos && v.quantidade_eixos) add(`${v.quantidade_eixos} eixos no cavalo (cotação: ${d.cotacao.eixos} no conjunto)`, v.quantidade_eixos <= d.cotacao.eixos, false)
        add(p.status_online ? 'Online no app' : 'Offline no app', p.status_online ? true : null, false)
        const saldo = saldos[p.id] ?? null
        if (cargaComplexa) add(`Pontuação ${saldo ?? 0}`, (saldo ?? 0) >= 0, false)
        const pontos = checks.reduce((n, c) => n + (c.ok ? (c.critico ? 10 : 2) : c.ok === false && c.critico ? -20 : 0), 0)
        lista.push({ veiculo: v, pessoa: p, titular, checks, pontos, saldo })
      }
    }
    return lista.sort((a, b) => b.pontos - a.pontos)
  }, [veiculos, pessoas, ocupados, saldos, precisaSatelite, cargaComplexa, d.cotacao?.eixos])

  async function alocar(veiculoId: string, pessoaId: string) {
    await executar(async () => {
      const { error } = await supabase.from('operacoes').update({ veiculo_id: veiculoId, pessoa_alocada_id: pessoaId }).eq('id', o.id)
      if (error) throw error
    }, 'Motorista e veículo alocados. A operação foi para "Aguardando documentos".')
  }

  async function adicionarReboque() {
    if (!reboqueAdd) return
    await executar(async () => {
      const { error } = await supabase
        .from('operacao_reboques')
        .insert({ operacao_id: o.id, veiculo_id: reboqueAdd, ordem: d.reboques.length + 1 })
      if (error) throw error
      setReboqueAdd('')
    })
  }

  async function removerReboque(veiculoId: string) {
    await executar(async () => {
      const { error } = await supabase.from('operacao_reboques').delete().eq('operacao_id', o.id).eq('veiculo_id', veiculoId)
      if (error) throw error
    })
  }

  const reboquesDisponiveis = veiculos.filter((v) => v.e_reboque && !d.reboques.some((r) => r.id === v.id))
  const motoristasDoVeiculo = (() => {
    const v = veiculos.find((x) => x.id === veiculoSel)
    if (!v) return pessoas
    return pessoas.filter((p) => p.id === v.titular_id || (p.papel === 'condutor' && p.titular_id === v.titular_id))
  })()

  return (
    <div className={secaoClass} style={secaoStyle}>
      <div className="text-sm font-bold text-[color:var(--rbr-navy-dark)]">Motorista e veículo</div>

      {d.veiculo && d.motorista && (
        <div className="text-xs flex flex-wrap gap-x-4 gap-y-1">
          <span>
            <b>Veículo:</b> {d.veiculo.placa} {d.veiculo.tipo_veiculo ? `· ${d.veiculo.tipo_veiculo}` : ''}
          </span>
          <span>
            <b>Motorista:</b> {d.motorista.nome} {d.motorista.papel === 'condutor' ? '(condutor)' : ''}
          </span>
          {d.titular && d.titular.id !== d.motorista.id && (
            <span>
              <b>Transportador:</b> {d.titular.nome}
            </span>
          )}
        </div>
      )}

      {editavel && (
        <>
          <div className="text-[11px] text-[color:var(--rbr-muted)]">
            Sugestão pelo cadastro (RNTRC, CNH, seguro, rastreador, disponibilidade{cargaComplexa ? ', pontuação' : ''}). Quem decide é você.
          </div>
          <div className="flex flex-col gap-2">
            {(verTodos ? candidatos : candidatos.slice(0, 5)).map((c) => {
              const atual = c.veiculo.id === o.veiculo_id && c.pessoa.id === o.pessoa_alocada_id
              const bloqueado = c.checks.some((x) => x.critico && x.ok === false)
              return (
                <div
                  key={`${c.veiculo.id}-${c.pessoa.id}`}
                  className="rounded-lg border p-2.5 flex flex-col gap-1.5"
                  style={{ borderColor: atual ? 'var(--rbr-positive)' : 'var(--rbr-border)' }}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="text-xs font-bold">
                      {c.veiculo.placa} · {c.pessoa.nome}
                      {c.pessoa.papel === 'condutor' && <span className="font-normal text-[color:var(--rbr-muted)]"> (condutor de {c.titular?.nome})</span>}
                    </div>
                    {atual ? (
                      <Badge ok={true}>alocado</Badge>
                    ) : (
                      <button
                        type="button"
                        disabled={salvando}
                        onClick={() => alocar(c.veiculo.id, c.pessoa.id)}
                        className="text-[11px] font-bold px-3 py-1 rounded-lg disabled:opacity-60"
                        style={bloqueado ? { border: '1px solid var(--rbr-danger)', color: 'var(--rbr-danger)' } : { background: 'var(--rbr-navy)', color: '#fff' }}
                      >
                        {bloqueado ? 'Alocar mesmo assim' : 'Alocar'}
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {c.checks.map((x) => (
                      <Badge key={x.txt} ok={x.ok}>
                        {x.ok === false ? '✕ ' : x.ok ? '✓ ' : ''}
                        {x.txt}
                      </Badge>
                    ))}
                  </div>
                </div>
              )
            })}
            {candidatos.length === 0 && <div className="text-xs text-[color:var(--rbr-muted)]">Nenhum veículo com motorista cadastrado.</div>}
            {candidatos.length > 5 && (
              <button type="button" onClick={() => setVerTodos((v) => !v)} className="self-start text-[11px] underline font-semibold">
                {verTodos ? 'ver só os 5 melhores' : `ver todos (${candidatos.length})`}
              </button>
            )}
          </div>

          <details className="rounded-lg p-2.5" style={{ background: 'var(--rbr-muted-bg)' }}>
            <summary className="text-[11px] font-bold cursor-pointer">Escolher manualmente</summary>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2">
              <select value={veiculoSel} onChange={(e) => { setVeiculoSel(e.target.value); setPessoaSel('') }} className={inputClass} style={inputStyle}>
                <option value="">Veículo (cavalo/tração)…</option>
                {veiculos.filter((v) => !v.e_reboque).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.placa} · {v.tipo_veiculo ?? v.marca_modelo ?? 'veículo'}
                  </option>
                ))}
              </select>
              <select value={pessoaSel} onChange={(e) => setPessoaSel(e.target.value)} className={inputClass} style={inputStyle}>
                <option value="">Motorista da frota desse veículo…</option>
                {motoristasDoVeiculo.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome} {p.papel === 'condutor' ? '(condutor)' : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={salvando || !veiculoSel || !pessoaSel}
                onClick={() => alocar(veiculoSel, pessoaSel)}
                className="text-xs font-bold px-3 py-2 rounded-lg disabled:opacity-50"
                style={{ background: 'var(--rbr-navy)', color: '#fff' }}
              >
                Alocar
              </button>
            </div>
          </details>
        </>
      )}

      {o.veiculo_id && (
        <div className="flex flex-col gap-2">
          <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">Carretas (semirreboques)</div>
          {d.reboques.length === 0 && <div className="text-xs text-[color:var(--rbr-muted)]">Nenhuma carreta — caminhão sem implemento separado.</div>}
          {d.reboques.map((r) => (
            <div key={r.id} className="flex items-center justify-between text-xs">
              <span>
                {r.placa} · {r.tipo_carroceria ?? r.tipo_veiculo ?? 'carreta'} {r.renavam ? `· RENAVAM ${r.renavam}` : ''}
              </span>
              {editavel && (
                <button type="button" onClick={() => removerReboque(r.id)} className="underline font-semibold" style={{ color: 'var(--rbr-danger)' }}>
                  remover
                </button>
              )}
            </div>
          ))}
          {editavel && (
            <div className="flex gap-2">
              <select value={reboqueAdd} onChange={(e) => setReboqueAdd(e.target.value)} className={inputClass} style={{ ...inputStyle, maxWidth: 320 }}>
                <option value="">+ Adicionar carreta…</option>
                {reboquesDisponiveis.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.placa} · {v.tipo_carroceria ?? v.tipo_veiculo ?? 'carreta'}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!reboqueAdd || salvando}
                onClick={adicionarReboque}
                className="text-xs font-bold px-3 py-2 rounded-lg disabled:opacity-50"
                style={{ background: 'var(--rbr-navy)', color: '#fff' }}
              >
                Adicionar
              </button>
            </div>
          )}
          {editavel && reboquesDisponiveis.length === 0 && (
            <div className="text-[11px] text-[color:var(--rbr-muted)]">
              Carretas são cadastradas em Cadastros → Motoristas → veículo, marcando “É carreta/semirreboque”.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
function Pagamento({ d, salvando, executar }: { d: DetalheOperacao; salvando: boolean; executar: Executar }) {
  const c = d.condicao
  const sugerido = d.cotacao?.valor_total_motorista ?? d.cotacao?.valor_frete_motorista ?? null
  const [total, setTotal] = useState(String(c?.valor_total_contrato ?? sugerido ?? ''))
  const [tipo, setTipo] = useState<'imediato' | 'diferido'>((c?.tipo as 'imediato' | 'diferido') ?? 'diferido')
  const [pct, setPct] = useState(String(c?.percentual_adiantamento != null ? Number((c.percentual_adiantamento * 100).toFixed(2)) : 80))
  const [meio, setMeio] = useState<'pix' | 'transferencia' | 'ipef'>((c?.meio_pagamento as 'pix' | 'transferencia' | 'ipef') ?? 'pix')
  const [saldoDias, setSaldoDias] = useState(String(c?.saldo_prazo_dias ?? 0))

  useEffect(() => {
    setTotal(String(d.condicao?.valor_total_contrato ?? sugerido ?? ''))
    setTipo((d.condicao?.tipo as 'imediato' | 'diferido') ?? 'diferido')
    setPct(String(d.condicao?.percentual_adiantamento != null ? Number((d.condicao.percentual_adiantamento * 100).toFixed(2)) : 80))
    setMeio((d.condicao?.meio_pagamento as 'pix' | 'transferencia' | 'ipef') ?? 'pix')
    setSaldoDias(String(d.condicao?.saldo_prazo_dias ?? 0))
  }, [d.condicao?.id, d.condicao?.updated_at, sugerido]) // eslint-disable-line react-hooks/exhaustive-deps

  const totalNum = parseBRL(total)
  const pctNum = parseBRL(pct)
  const adiant = tipo === 'diferido' && Number.isFinite(totalNum) && Number.isFinite(pctNum) ? Math.round(totalNum * pctNum) / 100 : 0
  const t = d.titular
  const semDadosBancarios = meio === 'pix' ? !t?.pix : !t?.banco_conta
  const abaixoPiso = d.cotacao?.piso_antt_calculado != null && Number.isFinite(totalNum) && totalNum < d.cotacao.piso_antt_calculado

  async function salvar() {
    await executar(async () => {
      if (!Number.isFinite(totalNum) || totalNum <= 0) throw new Error('Informe o valor total do contrato do motorista.')
      if (tipo === 'diferido' && (!Number.isFinite(pctNum) || pctNum < 0 || pctNum > 100)) throw new Error('% de adiantamento entre 0 e 100.')
      const dias = Number(saldoDias)
      if (!Number.isInteger(dias) || dias < 0 || dias > 120) throw new Error('Prazo do saldo: de 0 a 120 dias após a entrega.')
      const payload = {
        operacao_id: d.operacao.id,
        origem: d.operacao.origem,
        tipo,
        meio_pagamento: meio,
        valor_total_contrato: totalNum,
        valor_adiantamento: tipo === 'diferido' ? adiant : totalNum,
        percentual_adiantamento: tipo === 'diferido' ? pctNum / 100 : 1,
        saldo_prazo_dias: tipo === 'diferido' ? dias : 0,
      }
      const { error } = d.condicao
        ? await supabase.from('condicoes_pagamento_operacao').update(payload).eq('id', d.condicao.id)
        : await supabase.from('condicoes_pagamento_operacao').insert(payload)
      if (error) throw error
    }, 'Condição de pagamento salva.')
  }

  return (
    <div className={secaoClass} style={secaoStyle}>
      <div className="text-sm font-bold text-[color:var(--rbr-navy-dark)]">Pagamento ao motorista</div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <div>
          <label className={labelClass}>Total do contrato (R$)</label>
          <input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} className={inputClass} style={inputStyle} />
          {sugerido != null && parseBRL(total) !== sugerido && (
            <button type="button" onClick={() => setTotal(String(sugerido))} className="text-[11px] underline font-semibold mt-1">
              usar o da cotação ({formatMoney(sugerido)})
            </button>
          )}
        </div>
        <div>
          <label className={labelClass}>Forma</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as 'imediato' | 'diferido')} className={inputClass} style={inputStyle}>
            <option value="diferido">Adiantamento + saldo</option>
            <option value="imediato">À vista (tudo de uma vez)</option>
          </select>
        </div>
        {tipo === 'diferido' && (
          <div>
            <label className={labelClass}>Adiantamento (%)</label>
            <input inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} className={inputClass} style={inputStyle} />
            <div className="text-[11px] mt-1 text-[color:var(--rbr-muted)] tabular-nums">
              {formatMoney(adiant)} agora · {formatMoney(Number.isFinite(totalNum) ? totalNum - adiant : 0)} de saldo
            </div>
          </div>
        )}
        {tipo === 'diferido' && (
          <div>
            <label className={labelClass}>Saldo: dias após a entrega</label>
            <input inputMode="numeric" value={saldoDias} onChange={(e) => setSaldoDias(e.target.value)} className={inputClass} style={inputStyle} />
            <div className="text-[11px] mt-1 text-[color:var(--rbr-muted)]">0 = paga no dia da entrega</div>
          </div>
        )}
        <div>
          <label className={labelClass}>Meio</label>
          <select value={meio} onChange={(e) => setMeio(e.target.value as 'pix' | 'transferencia' | 'ipef')} className={inputClass} style={inputStyle}>
            <option value="pix">PIX</option>
            <option value="transferencia">Transferência</option>
            <option value="ipef">IPEF (cartão/conta de frete)</option>
          </select>
        </div>
      </div>
      <div className="text-xs">
        <b>Recebe:</b> {t?.nome ?? '—'} · {meio === 'pix' ? `PIX: ${t?.pix ?? '—'}` : `Banco ${t?.banco_codigo ?? '—'} ag. ${t?.banco_agencia ?? '—'} conta ${t?.banco_conta ?? '—'}`}
      </div>
      {semDadosBancarios && (
        <div className="text-xs rounded-lg px-3 py-2" style={{ background: 'var(--rbr-warning-bg)', color: 'var(--rbr-navy-dark)' }}>
          Faltam os dados de pagamento do transportador — complete em{' '}
          <Link to="/cadastros" className="underline font-semibold">
            Cadastros → Motoristas
          </Link>
          . O CIOT e o MDF-e pedem isso.
        </div>
      )}
      {abaixoPiso && (
        <div className="text-xs rounded-lg px-3 py-2" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
          Abaixo do piso mínimo ANTT da cotação ({formatMoney(d.cotacao?.piso_antt_calculado ?? null)}) — o CIOT é recusado.
        </div>
      )}
      <button
        type="button"
        disabled={salvando}
        onClick={salvar}
        className="self-start text-xs font-bold px-3.5 py-2 rounded-lg disabled:opacity-60"
        style={{ background: 'var(--rbr-navy)', color: '#fff' }}
      >
        {d.condicao ? 'Salvar condição' : 'Definir condição'}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
function Documentos({
  d,
  gestor,
  salvando,
  executar,
  recarregar,
}: {
  d: DetalheOperacao
  gestor: Pessoa
  salvando: boolean
  executar: Executar
  recarregar: () => Promise<void>
}) {
  const [enviando, setEnviando] = useState<string | null>(null)
  const [aceitando, setAceitando] = useState<string | null>(null)
  const [dispensando, setDispensando] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const [abertos, setAbertos] = useState<Record<string, boolean>>({})
  const inputs = useRef<Record<string, HTMLInputElement | null>>({})

  const ordem = ['cte', 'nfse', 'mdfe', 'ciot', 'vpo', 'gr', 'atm', 'wialon', 'aet']
  const docs = [...d.documentos]
    .filter((x) => x.exigido || x.dispensa_motivo || x.arquivo_path)
    .sort((a, b) => ordem.indexOf(a.tipo) - ordem.indexOf(b.tipo))
  const exigidos = docs.filter((x) => x.exigido)
  const prontos = exigidos.filter((x) => x.conferencia_status === 'ok' || x.conferencia_status === 'aceito_manual').length

  async function enviar(doc: Documento, file: File) {
    setEnviando(doc.id)
    await executar(async () => {
      const nomeLimpo = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${d.operacao.id}/${doc.tipo}/${Date.now()}-${nomeLimpo}`
      const { error: upErr } = await supabase.storage.from('operacao-documentos').upload(path, file, { upsert: false })
      if (upErr) throw upErr
      const { error: updErr } = await supabase
        .from('documentacao_operacao')
        .update({
          arquivo_path: path,
          arquivo_nome: file.name,
          arquivo_enviado_em: new Date().toISOString(),
          conferencia_status: 'conferindo',
          conferencia_resultado: null,
          aceite_manual_motivo: null,
        })
        .eq('id', doc.id)
      if (updErr) throw updErr
      await recarregar()
      const { data, error } = await supabase.functions.invoke('conferir-documento-operacao', { body: { documento_id: doc.id } })
      if (error || !data?.sucesso) {
        throw new Error(
          `Arquivo salvo, mas a conferência automática falhou: ${await erroDaFuncao(error, data)}. Você pode tentar de novo ou aceitar manualmente.`,
        )
      }
    }, 'Arquivo enviado e conferido.')
    setEnviando(null)
    setAbertos((a) => ({ ...a, [doc.id]: true }))
  }

  async function reconferir(doc: Documento) {
    setEnviando(doc.id)
    await executar(async () => {
      const { data, error } = await supabase.functions.invoke('conferir-documento-operacao', { body: { documento_id: doc.id } })
      if (error || !data?.sucesso) throw new Error(await erroDaFuncao(error, data))
    }, 'Conferência refeita.')
    setEnviando(null)
  }

  async function verArquivo(doc: Documento) {
    if (!doc.arquivo_path) return
    const { data, error } = await supabase.storage.from('operacao-documentos').createSignedUrl(doc.arquivo_path, 300)
    if (error || !data) return
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  async function aceitarManual(doc: Documento) {
    await executar(async () => {
      if (!motivo.trim()) throw new Error('Explique por que está aceitando manualmente.')
      const { error } = await supabase
        .from('documentacao_operacao')
        .update({
          conferencia_status: 'aceito_manual',
          aceite_manual_motivo: `${motivo.trim()} — ${gestor.nome}`,
          conferido_por: gestor.id,
          conferido_em: new Date().toISOString(),
          status: 'emitido',
        })
        .eq('id', doc.id)
      if (error) throw error
    }, 'Documento aceito manualmente.')
    setAceitando(null)
    setMotivo('')
  }

  async function dispensar(doc: Documento) {
    await executar(async () => {
      if (!motivo.trim()) throw new Error('Explique por que esse documento não é necessário nesta operação.')
      const { error } = await supabase
        .from('documentacao_operacao')
        .update({ exigido: false, dispensa_motivo: `${motivo.trim()} — ${gestor.nome}` })
        .eq('id', doc.id)
      if (error) throw error
    }, 'Documento dispensado.')
    setDispensando(null)
    setMotivo('')
  }

  async function voltarAExigir(doc: Documento) {
    await executar(async () => {
      const { error } = await supabase.from('documentacao_operacao').update({ exigido: true, dispensa_motivo: null }).eq('id', doc.id)
      if (error) throw error
    })
  }

  return (
    <div className={secaoClass} style={secaoStyle}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm font-bold text-[color:var(--rbr-navy-dark)]">Documentos da operação</div>
        <span className="text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: prontos === exigidos.length ? '#E7F5EC' : 'var(--rbr-warning-bg)' }}>
          {prontos}/{exigidos.length} conferidos
        </span>
      </div>
      <div className="text-[11px] text-[color:var(--rbr-muted)]">
        Suba o PDF ou XML que a assessoria devolver. A IA lê o arquivo e confere placa, CPF do motorista, CNPJs, chave da NF e valores com esta operação.
      </div>
      {docs.map((doc) => {
        const conf = CONFERENCIA_LABEL[doc.conferencia_status] ?? CONFERENCIA_LABEL.nao_conferido
        const res = doc.conferencia_resultado as { checks?: { item: string; esperado: string; encontrado: string; ok: boolean; critico: boolean }[]; erro?: string } | null
        const aberto = abertos[doc.id] ?? doc.conferencia_status === 'divergente'
        return (
          <div key={doc.id} className="rounded-lg border p-2.5 flex flex-col gap-2" style={{ borderColor: 'var(--rbr-border)', opacity: doc.exigido ? 1 : 0.6 }}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex flex-col">
                <span className="text-xs font-bold">{TIPO_DOC_LABEL[doc.tipo] ?? doc.tipo}</span>
                <span className="text-[11px] text-[color:var(--rbr-muted)]">
                  {doc.exigido ? doc.motivo_exigencia : `Dispensado: ${doc.dispensa_motivo}`}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {doc.exigido && (
                  <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: conf.bg, color: conf.color }}>
                    {conf.txt}
                  </span>
                )}
                {doc.numero_documento && <span className="text-[11px] tabular-nums">nº {doc.numero_documento}</span>}
              </div>
            </div>

            {doc.exigido && (
              <div className="flex items-center gap-2 flex-wrap text-[11px] font-semibold">
                <input
                  ref={(el) => {
                    inputs.current[doc.id] = el
                  }}
                  type="file"
                  accept=".pdf,.xml,image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (f) enviar(doc, f)
                  }}
                />
                <button
                  type="button"
                  disabled={salvando || enviando === doc.id}
                  onClick={() => inputs.current[doc.id]?.click()}
                  className="px-3 py-1.5 rounded-lg disabled:opacity-60"
                  style={{ background: 'var(--rbr-navy)', color: '#fff' }}
                >
                  {enviando === doc.id ? 'Enviando e conferindo…' : doc.arquivo_path ? 'Trocar arquivo' : 'Subir arquivo'}
                </button>
                {doc.arquivo_path && (
                  <>
                    <button type="button" onClick={() => verArquivo(doc)} className="underline">
                      ver arquivo
                    </button>
                    <button type="button" disabled={salvando} onClick={() => reconferir(doc)} className="underline disabled:opacity-60">
                      conferir de novo
                    </button>
                  </>
                )}
                {doc.conferencia_status !== 'ok' && doc.conferencia_status !== 'aceito_manual' && (
                  <button type="button" onClick={() => { setAceitando(doc.id); setDispensando(null); setMotivo('') }} className="underline">
                    aceitar manualmente
                  </button>
                )}
                <button type="button" onClick={() => { setDispensando(doc.id); setAceitando(null); setMotivo('') }} className="underline" style={{ color: 'var(--rbr-muted)' }}>
                  não se aplica
                </button>
                {res?.checks && (
                  <button type="button" onClick={() => setAbertos((a) => ({ ...a, [doc.id]: !aberto }))} className="underline">
                    {aberto ? 'esconder conferência' : 'ver conferência'}
                  </button>
                )}
              </div>
            )}
            {!doc.exigido && doc.dispensa_motivo && (
              <button type="button" onClick={() => voltarAExigir(doc)} className="self-start text-[11px] underline font-semibold">
                voltar a exigir
              </button>
            )}

            {doc.arquivo_nome && (
              <div className="text-[11px] text-[color:var(--rbr-muted)]">
                {doc.arquivo_nome}
                {doc.arquivo_enviado_em ? ` · enviado ${formatDateTime(doc.arquivo_enviado_em)}` : ''}
                {doc.aceite_manual_motivo ? ` · aceito: ${doc.aceite_manual_motivo}` : ''}
              </div>
            )}
            {res?.erro && <div className="text-[11px]" style={{ color: 'var(--rbr-danger)' }}>{res.erro}</div>}
            {aberto && res?.checks && (
              <div className="flex flex-col gap-1 rounded-lg p-2" style={{ background: 'var(--rbr-muted-bg)' }}>
                {res.checks.map((ck, i) => (
                  <div key={i} className="text-[11px] flex flex-wrap gap-x-2">
                    <span style={{ color: ck.ok ? 'var(--rbr-positive)' : ck.critico ? 'var(--rbr-danger)' : 'var(--rbr-muted)', fontWeight: 700 }}>
                      {ck.ok ? '✓' : '✕'} {ck.item}
                    </span>
                    <span className="text-[color:var(--rbr-muted)]">esperado: {ck.esperado}</span>
                    <span className="text-[color:var(--rbr-muted)]">no documento: {ck.encontrado}</span>
                  </div>
                ))}
              </div>
            )}

            {(aceitando === doc.id || dispensando === doc.id) && (
              <div className="flex gap-2 flex-wrap">
                <input
                  autoFocus
                  placeholder={aceitando === doc.id ? 'Motivo do aceite manual (ex.: conferi o PDF, placa em outra página)' : 'Por que não se aplica (ex.: rota sem pedágio)'}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  className={inputClass}
                  style={{ ...inputStyle, maxWidth: 440 }}
                />
                <button
                  type="button"
                  disabled={salvando}
                  onClick={() => (aceitando === doc.id ? aceitarManual(doc) : dispensar(doc))}
                  className="text-xs font-bold px-3 py-2 rounded-lg disabled:opacity-60"
                  style={{ background: 'var(--rbr-gold)', color: 'var(--rbr-navy-dark)' }}
                >
                  Confirmar
                </button>
                <button type="button" onClick={() => { setAceitando(null); setDispensando(null) }} className="text-xs underline">
                  cancelar
                </button>
              </div>
            )}
          </div>
        )
      })}
      {docs.length === 0 && <div className="text-xs text-[color:var(--rbr-muted)]">A lista de documentos é gerada quando o motorista é alocado.</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
function FichaAssessoria({ d, assessoria }: { d: DetalheOperacao; assessoria: AssessoriaContato }) {
  const secoes = useMemo(() => montarFicha(d), [d])
  const faltando = useMemo(() => camposFaltando(secoes), [secoes])
  const [aviso, setAviso] = useState<string | null>(null)
  const [ver, setVer] = useState(false)
  const nomeArquivo = `ficha-emissao-${d.operacao.id.slice(0, 8)}.pdf`
  const rota = d.cotacao ? `${d.cotacao.cidade_origem}/${d.cotacao.uf_origem} → ${d.cotacao.cidade_destino}/${d.cotacao.uf_destino}` : ''
  const mensagem = `Olá${assessoria.nome ? `, ${assessoria.nome}` : ''}! Segue a ficha de emissão da operação ${d.operacao.id
    .slice(0, 8)
    .toUpperCase()} (${rota}) — documentos: ${d.documentos
    .filter((x) => x.exigido)
    .map((x) => TIPO_DOC_LABEL[x.tipo] ?? x.tipo)
    .join(', ')}. O PDF vai em anexo.`

  // jsPDF é pesado — carrega só quando a ficha aparece na tela, e já deixa o PDF pronto:
  // o "Compartilhar" do navegador precisa ser chamado logo depois do clique, sem espera.
  const [pdfPronto, setPdfPronto] = useState<Blob | null>(null)
  useEffect(() => {
    let cancelado = false
    setPdfPronto(null)
    import('../../lib/fichaPdf')
      .then(({ gerarFichaPdf }) => {
        if (!cancelado) setPdfPronto(gerarFichaPdf(d, secoes))
      })
      .catch(() => {
        /* gera na hora do clique */
      })
    return () => {
      cancelado = true
    }
  }, [d, secoes])

  async function pdf(): Promise<Blob> {
    if (pdfPronto) return pdfPronto
    const { gerarFichaPdf } = await import('../../lib/fichaPdf')
    return gerarFichaPdf(d, secoes)
  }

  function salvarArquivo(blob: Blob) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = nomeArquivo
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  async function baixar() {
    try {
      salvarArquivo(await pdf())
    } catch (e) {
      setAviso(`Não consegui gerar o PDF: ${e instanceof Error ? e.message : String(e)}`)
      throw e
    }
  }

  async function compartilhar() {
    setAviso(null)
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean }
    try {
      const file = new File([pdfPronto ?? (await pdf())], nomeArquivo, { type: 'application/pdf' })
      if (nav.canShare && nav.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'Ficha de emissão', text: mensagem })
          return
        } catch (e) {
          if ((e as { name?: string })?.name === 'AbortError') return // a pessoa fechou o compartilhamento
        }
      }
      salvarArquivo(file)
      setAviso('Este navegador não compartilhou o arquivo direto — o PDF foi baixado; anexe no WhatsApp ou no e-mail.')
    } catch (e) {
      setAviso(`Não consegui gerar o PDF: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function whatsapp() {
    setAviso(null)
    // Abre a janela antes de qualquer espera pra o navegador não bloquear como pop-up.
    const janela = window.open('about:blank', '_blank')
    try {
      await baixar()
    } catch {
      janela?.close()
      return
    }
    const numero = digitos(assessoria.whatsapp)
    const destino = numero ? `https://wa.me/${numero.length <= 11 ? `55${numero}` : numero}` : 'https://wa.me/'
    const url = `${destino}?text=${encodeURIComponent(mensagem)}`
    if (janela) janela.location.href = url
    else window.open(url, '_blank', 'noopener')
    setAviso('PDF baixado e WhatsApp aberto — anexe o arquivo na conversa.')
  }

  async function email() {
    setAviso(null)
    try {
      await baixar()
    } catch {
      return
    }
    const assunto = `Ficha de emissão — operação ${d.operacao.id.slice(0, 8).toUpperCase()} (${rota})`
    const corpo = `${mensagem}\n\n${textoFicha(d, secoes)}`
    window.location.href = `mailto:${assessoria.email}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo.slice(0, 1800))}`
    setAviso('PDF baixado e e-mail aberto (a ficha também vai no corpo) — anexe o PDF antes de enviar.')
  }

  return (
    <div className={secaoClass} style={secaoStyle}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm font-bold text-[color:var(--rbr-navy-dark)]">Ficha para a assessoria</div>
        <span
          className="text-[11px] font-bold px-2.5 py-1 rounded-full"
          style={faltando.length ? { background: '#FBE9E9', color: 'var(--rbr-danger)' } : { background: '#E7F5EC', color: 'var(--rbr-positive)' }}
        >
          {faltando.length ? `${faltando.length} campo(s) faltando` : 'completa'}
        </span>
      </div>
      {faltando.length > 0 && (
        <div className="text-[11px] flex flex-wrap gap-1">
          {faltando.map((f) => (
            <span key={`${f.secao}-${f.campo}`} className="px-1.5 py-0.5 rounded" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
              {f.secao}: {f.campo}
            </span>
          ))}
        </div>
      )}
      {!assessoria.whatsapp && !assessoria.email && (
        <div className="text-[11px] text-[color:var(--rbr-muted)]">Cadastre o WhatsApp/e-mail da assessoria em “Dados de emissão”, no topo da página.</div>
      )}
      <div className="flex gap-2 flex-wrap">
        <button type="button" onClick={whatsapp} className="text-xs font-bold px-3.5 py-2 rounded-lg" style={{ background: '#1F8F4E', color: '#fff' }}>
          Enviar por WhatsApp
        </button>
        <button type="button" onClick={email} className="text-xs font-bold px-3.5 py-2 rounded-lg" style={{ background: 'var(--rbr-navy)', color: '#fff' }}>
          Enviar por e-mail
        </button>
        <button type="button" onClick={compartilhar} className="text-xs font-bold px-3.5 py-2 rounded-lg border" style={{ borderColor: 'var(--rbr-navy)', color: 'var(--rbr-navy)' }}>
          Compartilhar PDF
        </button>
        <button type="button" onClick={baixar} className="text-xs font-bold px-3.5 py-2 rounded-lg border" style={{ borderColor: 'var(--rbr-border)' }}>
          Baixar PDF
        </button>
        <button type="button" onClick={() => setVer((v) => !v)} className="text-xs underline font-semibold">
          {ver ? 'esconder ficha' : 'ver ficha'}
        </button>
      </div>
      {aviso && <div className="text-[11px] text-[color:var(--rbr-muted)]">{aviso}</div>}
      {ver && (
        <div className="flex flex-col gap-2">
          {secoes.map((s) => (
            <div key={s.titulo}>
              <div className="text-[10px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] mb-0.5">{s.titulo}</div>
              {s.linhas.map((ln) => (
                <div key={ln.campo} className="text-xs flex gap-2">
                  <span className="text-[color:var(--rbr-muted)] min-w-[170px]">{ln.campo}</span>
                  <span style={{ color: ln.faltando ? 'var(--rbr-danger)' : undefined, fontWeight: ln.faltando ? 700 : 400 }}>{ln.valor}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
function StatusELiberacao({ d, salvando, executar }: { d: DetalheOperacao; salvando: boolean; executar: Executar }) {
  const o = d.operacao
  const [novoStatus, setNovoStatus] = useState<StatusOperacao>(o.status)
  const [cancelando, setCancelando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [motivoFechamento, setMotivoFechamento] = useState('')

  useEffect(() => setNovoStatus(o.status), [o.status])

  const pendentes: string[] = []
  if (!o.veiculo_id || !o.pessoa_alocada_id) pendentes.push('alocar motorista e veículo')
  if (o.bloqueio_fiscal) pendentes.push('bloqueio fiscal ativo')
  if (!d.condicao) pendentes.push('condição de pagamento do motorista')
  for (const doc of d.documentos.filter((x) => x.exigido && x.conferencia_status !== 'ok' && x.conferencia_status !== 'aceito_manual')) {
    pendentes.push(TIPO_DOC_LABEL[doc.tipo] ?? doc.tipo)
  }

  async function mudarStatus(status: StatusOperacao, extra: Record<string, unknown> = {}, msg?: string) {
    await executar(async () => {
      const { error } = await supabase
        .from('operacoes')
        .update({ status, ...extra })
        .eq('id', o.id)
      if (error) throw error
    }, msg ?? `Status alterado para ${STATUS_OPERACAO_LABEL[status]}.`)
  }

  return (
    <div className={secaoClass} style={secaoStyle}>
      {o.status === 'aguardando_liberacao_fiscal' && (
        <div className="flex flex-col gap-2">
          <div className="text-sm font-bold text-[color:var(--rbr-navy-dark)]">Liberar para coleta</div>
          {pendentes.length > 0 ? (
            <div className="text-xs" style={{ color: 'var(--rbr-danger)' }}>
              Falta: {pendentes.join(', ')}.
            </div>
          ) : (
            <div className="text-xs" style={{ color: 'var(--rbr-positive)' }}>
              Tudo conferido. O motorista só vê a carga como liberada depois deste clique.
            </div>
          )}
          <button
            type="button"
            disabled={salvando || pendentes.length > 0}
            onClick={() => mudarStatus('liberada_coleta', {}, 'Carga liberada para coleta.')}
            className="self-start text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-50"
            style={{ background: 'var(--rbr-positive)', color: '#fff' }}
          >
            Liberar para coleta
          </button>
        </div>
      )}

      {o.status === 'entregue' && (
        <div className="flex flex-col gap-2">
          <div className="text-sm font-bold text-[color:var(--rbr-navy-dark)]">Fechar operação</div>
          <div className="text-xs text-[color:var(--rbr-muted)]">
            Fecha quando o cliente pagou e o motorista e os fornecedores foram pagos (veja o bloco Financeiro acima). Se algo ficar pendente por decisão sua, informe o
            motivo.
          </div>
          <div className="flex gap-2 flex-wrap">
            <input
              placeholder="Motivo para fechar com valores em aberto (opcional)"
              value={motivoFechamento}
              onChange={(e) => setMotivoFechamento(e.target.value)}
              className={inputClass}
              style={{ ...inputStyle, maxWidth: 420 }}
            />
            <button
              type="button"
              disabled={salvando}
              onClick={() => mudarStatus('fechada', motivoFechamento.trim() ? { fechamento_motivo: motivoFechamento.trim() } : {}, 'Operação fechada.')}
              className="text-xs font-bold px-3 py-2 rounded-lg disabled:opacity-50"
              style={{ background: 'var(--rbr-navy)', color: '#fff' }}
            >
              Fechar operação
            </button>
          </div>
        </div>
      )}
      {o.status === 'fechada' && o.fechamento_motivo && (
        <div className="text-xs text-[color:var(--rbr-muted)]">Fechada com pendência: {o.fechamento_motivo}</div>
      )}
      {o.liberada_em && (
        <div className="text-[11px] text-[color:var(--rbr-muted)]">
          Liberada em {formatDateTime(o.liberada_em)}
          {o.coleta_em ? ` · coleta ${formatDateTime(o.coleta_em)}` : ''}
          {o.entregue_em ? ` · entregue ${formatDateTime(o.entregue_em)}` : ''}.
        </div>
      )}
      {o.status === 'cancelada' && (
        <div className="text-xs" style={{ color: 'var(--rbr-danger)' }}>
          Cancelada {o.cancelada_em ? `em ${formatDate(o.cancelada_em)}` : ''} — {o.motivo_cancelamento}
        </div>
      )}

      <details>
        <summary className="text-[11px] font-bold cursor-pointer text-[color:var(--rbr-muted)]">Corrigir status / cancelar</summary>
        <div className="flex flex-col gap-2 mt-2">
          <div className="text-[11px] text-[color:var(--rbr-muted)]">
            Correção manual (ex.: o app do motorista falhou). Regras continuam valendo: pra liberar, os documentos precisam estar conferidos.
          </div>
          <div className="flex gap-2 flex-wrap">
            <select value={novoStatus} onChange={(e) => setNovoStatus(e.target.value as StatusOperacao)} className={inputClass} style={{ ...inputStyle, maxWidth: 260 }}>
              {o.status === 'cancelada' && (
                <option value="cancelada" disabled>
                  Cancelada (atual)
                </option>
              )}
              {STATUS_ORDEM.filter((s) => s !== 'cancelada').map((s) => (
                <option key={s} value={s}>
                  {STATUS_OPERACAO_LABEL[s]}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={salvando || novoStatus === o.status}
              onClick={() => mudarStatus(novoStatus)}
              className="text-xs font-bold px-3 py-2 rounded-lg disabled:opacity-50"
              style={{ background: 'var(--rbr-navy)', color: '#fff' }}
            >
              Aplicar
            </button>
          </div>
          {o.status !== 'cancelada' && o.status !== 'fechada' && (
            <>
              {!cancelando ? (
                <button type="button" onClick={() => setCancelando(true)} className="self-start text-xs underline font-semibold" style={{ color: 'var(--rbr-danger)' }}>
                  Cancelar operação
                </button>
              ) : (
                <div className="flex gap-2 flex-wrap">
                  <input
                    autoFocus
                    placeholder="Motivo do cancelamento *"
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    className={inputClass}
                    style={{ ...inputStyle, maxWidth: 380 }}
                  />
                  <button
                    type="button"
                    disabled={salvando || !motivo.trim()}
                    onClick={() => mudarStatus('cancelada', { motivo_cancelamento: motivo.trim() }, 'Operação cancelada.')}
                    className="text-xs font-bold px-3 py-2 rounded-lg disabled:opacity-50"
                    style={{ background: 'var(--rbr-danger)', color: '#fff' }}
                  >
                    Confirmar cancelamento
                  </button>
                  <button type="button" onClick={() => setCancelando(false)} className="text-xs underline">
                    voltar
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </details>
    </div>
  )
}

// ---------------------------------------------------------------------------
// O que esta operação gerou no financeiro (automático) e quanto sobrou de verdade.
function FinanceiroOperacao({ operacaoId, versao }: { operacaoId: string; versao: string }) {
  const [itens, setItens] = useState<Lancamento[] | null>(null)
  const [res, setRes] = useState<ResultadoOperacao | null>(null)
  const [apoio, setApoio] = useState<Apoio | null>(null)
  const [baixa, setBaixa] = useState<Lancamento | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    const [a, b] = await Promise.all([
      supabase.from('v_lancamentos').select('*').eq('operacao_id', operacaoId).neq('status', 'cancelado').order('tipo', { ascending: false }).order('data_vencimento'),
      supabase.from('v_resultado_operacoes').select('*').eq('operacao_id', operacaoId).maybeSingle(),
    ])
    setItens(a.data ?? [])
    setRes(b.data ?? null)
  }, [operacaoId])
  useEffect(() => {
    carregar()
  }, [carregar, versao])

  async function abrirBaixa(l: Lancamento) {
    setErro(null)
    try {
      const ap = apoio ?? (await carregarApoio())
      setApoio(ap)
      setBaixa(l)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  if (!itens) return null
  const pct = (v: number | null | undefined) => (v == null ? '—' : `${(Number(v) * 100).toFixed(1).replace('.', ',')}%`)
  return (
    <div className={secaoClass} style={secaoStyle}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-sm font-bold text-[color:var(--rbr-navy-dark)]">Financeiro desta operação</div>
        <Link to="/financeiro?aba=receber" className="text-[11px] font-bold underline text-[color:var(--rbr-navy)]">
          Abrir no Financeiro
        </Link>
      </div>
      {res && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div>
            <div className="text-[10.5px] uppercase font-bold text-[color:var(--rbr-muted)]">Receita</div>
            <div className="tabular-nums font-semibold">{formatMoney(Number(res.receita_real))}</div>
          </div>
          <div>
            <div className="text-[10.5px] uppercase font-bold text-[color:var(--rbr-muted)]">Custos lançados</div>
            <div className="tabular-nums font-semibold">{formatMoney(Number(res.custos_reais))}</div>
          </div>
          <div>
            <div className="text-[10.5px] uppercase font-bold text-[color:var(--rbr-muted)]">Lucro (prev. → real)</div>
            <div className="tabular-nums font-semibold" style={{ color: Number(res.lucro_real) < Number(res.lucro_previsto ?? 0) - 1 ? 'var(--rbr-danger)' : undefined }}>
              {formatMoney(res.lucro_previsto != null ? Number(res.lucro_previsto) : null)} → {formatMoney(Number(res.lucro_real))}
            </div>
          </div>
          <div>
            <div className="text-[10.5px] uppercase font-bold text-[color:var(--rbr-muted)]">Margem (prev. → real)</div>
            <div className="tabular-nums font-semibold">
              {pct(res.margem_prevista)} → {pct(res.margem_real)}
            </div>
          </div>
        </div>
      )}
      {itens.length === 0 ? (
        <div className="text-xs text-[color:var(--rbr-muted)]">Nada lançado ainda.</div>
      ) : (
        <div className="flex flex-col gap-1">
          {itens.map((l) => (
            <div key={l.id} className="flex items-center gap-2 text-xs border rounded-lg px-2.5 py-1.5 flex-wrap" style={{ borderColor: 'var(--rbr-border)' }}>
              <span className="font-bold w-3" style={{ color: l.tipo === 'receber' ? 'var(--rbr-positive)' : 'var(--rbr-danger)' }}>
                {l.tipo === 'receber' ? '+' : '−'}
              </span>
              <span className="flex-1 min-w-[160px] truncate">
                {l.contraparte ?? '—'} · {l.descricao}
              </span>
              <span className="tabular-nums text-[color:var(--rbr-muted)]">
                {l.status === 'pago' ? `pago ${formatDate(l.data_pagamento)}` : `${l.vencimento_estimado ? 'prev. ' : 'vence '}${formatDate(l.data_vencimento)}`}
              </span>
              <span className="tabular-nums font-semibold">{formatMoney(Number(l.valor))}</span>
              <span
                className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full"
                style={{
                  background: l.situacao === 'pago' ? '#E7F5EC' : l.situacao === 'vencido' ? '#FBE9E9' : 'var(--rbr-muted-bg)',
                  color: l.situacao === 'pago' ? 'var(--rbr-positive)' : l.situacao === 'vencido' ? 'var(--rbr-danger)' : 'var(--rbr-navy-dark)',
                }}
              >
                {l.situacao === 'pago' ? 'pago' : l.situacao === 'vencido' ? 'vencido' : l.situacao === 'previsto' ? 'previsto' : 'em aberto'}
              </span>
              {(l.status === 'aberto' || l.status === 'previsto') && (
                <button type="button" onClick={() => abrirBaixa(l)} className="text-[11px] font-bold underline text-[color:var(--rbr-navy)]">
                  {l.tipo === 'pagar' ? 'pagar' : 'receber'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="text-[11px] text-[color:var(--rbr-muted)]">
        Gerado automaticamente: frete do cliente pelo prazo da cotação, adiantamento na liberação, saldo após a entrega, vale-pedágio, seguro e custos adicionais. Datas
        “prev.” se ajustam sozinhas quando a carga é liberada/entregue.
      </div>
      {erro && <div className="text-xs" style={{ color: 'var(--rbr-danger)' }}>{erro}</div>}
      {baixa && apoio && (
        <BaixaModal
          lancamentos={[baixa]}
          apoio={apoio}
          onFechar={() => setBaixa(null)}
          onFeito={() => {
            carregar()
          }}
        />
      )}
    </div>
  )
}
