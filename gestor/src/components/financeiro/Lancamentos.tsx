import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { IconSearch } from '../../icons-local'
import { type Apoio, type Lancamento, type TipoLanc, addDias, brl, fmtData, hojeISO } from '../../lib/financeiro'
import { Aviso, Botao, Card, Carregando, Chips, Pill, Vazio, inputClass, inputStyle } from './ui'
import { BaixaModal, CobrancaModal, DetalheLancamento, LancamentoForm } from './LancamentoModais'
import { NovaFaturaModal } from './Faturas'
import { OpcoesCategoria } from './CategoriaOpcoes'

type Filtro = 'abertos' | 'vencidos' | 'semana' | 'mes' | 'previstos' | 'pagos' | 'cancelados' | 'todos'

const FILTROS: { valor: Filtro; label: string }[] = [
  { valor: 'abertos', label: 'Em aberto' },
  { valor: 'vencidos', label: 'Vencidos' },
  { valor: 'semana', label: 'Próximos 7 dias' },
  { valor: 'mes', label: 'Próximos 30 dias' },
  { valor: 'previstos', label: 'Previstos' },
  { valor: 'pagos', label: 'Pagos' },
  { valor: 'cancelados', label: 'Cancelados' },
  { valor: 'todos', label: 'Todos' },
]

export default function Lancamentos({
  tipo,
  apoio,
  filtroInicial,
  versao,
  onMudou,
}: {
  tipo: TipoLanc
  apoio: Apoio
  filtroInicial?: string
  versao: number
  onMudou: () => void
  ir: (aba: string, filtro?: string) => void
}) {
  const [filtro, setFiltro] = useState<Filtro>((FILTROS.some((f) => f.valor === filtroInicial) ? filtroInicial : 'abertos') as Filtro)
  const [busca, setBusca] = useState('')
  const [categoria, setCategoria] = useState('')
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [dados, setDados] = useState<Lancamento[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [detalhe, setDetalhe] = useState<string | null>(null)
  const [modal, setModal] = useState<null | 'novo' | 'baixa' | 'cobrar' | 'fatura'>(null)
  const [baixaAlvo, setBaixaAlvo] = useState<Lancamento[]>([])

  const carregar = useCallback(async () => {
    setErro(null)
    const hoje = hojeISO()
    let q = supabase.from('v_lancamentos').select('*').eq('tipo', tipo)
    if (filtro === 'abertos') q = q.in('status', ['aberto', 'previsto'])
    else if (filtro === 'vencidos') q = q.eq('status', 'aberto').lt('data_vencimento', hoje)
    else if (filtro === 'semana') q = q.in('status', ['aberto', 'previsto']).lte('data_vencimento', addDias(hoje, 7))
    else if (filtro === 'mes') q = q.in('status', ['aberto', 'previsto']).lte('data_vencimento', addDias(hoje, 30))
    else if (filtro === 'previstos') q = q.eq('status', 'previsto')
    else if (filtro === 'pagos') q = q.eq('status', 'pago')
    else if (filtro === 'cancelados') q = q.eq('status', 'cancelado')
    if (categoria) q = q.eq('categoria_id', categoria)
    if (de) q = q.gte('data_vencimento', de)
    if (ate) q = q.lte('data_vencimento', ate)
    const ordemDesc = filtro === 'pagos' || filtro === 'cancelados' || filtro === 'todos'
    const { data, error } = await q.order(filtro === 'pagos' ? 'data_pagamento' : 'data_vencimento', { ascending: !ordemDesc }).limit(800)
    if (error) setErro(error.message)
    setDados(data ?? [])
    setSel(new Set())
  }, [tipo, filtro, categoria, de, ate])

  useEffect(() => {
    carregar()
  }, [carregar, versao])

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase()
    if (!t) return dados ?? []
    return (dados ?? []).filter((l) =>
      [l.descricao, l.contraparte, l.numero_documento, l.categoria_nome, l.fatura_numero?.toString()].some((x) => x?.toLowerCase().includes(t)),
    )
  }, [dados, busca])

  const totais = useMemo(() => {
    let aberto = 0
    let vencido = 0
    let pago = 0
    for (const l of filtrados) {
      if (l.status === 'aberto' || l.status === 'previsto') aberto += Number(l.saldo_aberto ?? 0)
      if (l.situacao === 'vencido') vencido += Number(l.saldo_aberto ?? 0)
      pago += Number(l.valor_pago ?? 0)
    }
    return { aberto, vencido, pago }
  }, [filtrados])

  const selecionados = filtrados.filter((l) => l.id && sel.has(l.id))
  const selAbertos = selecionados.filter((l) => l.status === 'aberto' || l.status === 'previsto')
  const mesmoCliente = selAbertos.length > 0 && selAbertos.every((l) => l.cliente_id && l.cliente_id === selAbertos[0].cliente_id)
  const mesmaContraparte = selAbertos.length > 0 && selAbertos.every((l) => l.contraparte === selAbertos[0].contraparte)

  function alternar(id: string) {
    setSel((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const aberto = (l: Lancamento) => l.status === 'aberto' || l.status === 'previsto'

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Chips opcoes={FILTROS} valor={filtro} onChange={setFiltro} />
        <Botao onClick={() => setModal('novo')}>{tipo === 'pagar' ? '+ Nova conta a pagar' : '+ Nova conta a receber'}</Botao>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-[1fr_200px_150px_150px] gap-2">
        <div className="relative col-span-2 md:col-span-1">
          <IconSearch width={14} height={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--rbr-muted)]" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className={`${inputClass} pl-8`}
            style={inputStyle}
            placeholder={tipo === 'pagar' ? 'Buscar fornecedor, motorista, descrição, nº…' : 'Buscar cliente, descrição, nº, fatura…'}
            aria-label="Buscar"
          />
        </div>
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={`${inputClass} col-span-2 md:col-span-1`} style={inputStyle} aria-label="Categoria">
          <option value="">Todas as categorias</option>
          <OpcoesCategoria categorias={apoio.categorias} tipo={tipo === 'receber' ? 'receita' : 'despesa'} incluirInativas={categoria} />
        </select>
        <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className={inputClass} style={inputStyle} aria-label="Vencimento a partir de" title="Vencimento a partir de" />
        <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className={inputClass} style={inputStyle} aria-label="Vencimento até" title="Vencimento até" />
      </div>

      <div className="flex gap-4 flex-wrap text-xs">
        <span>
          Em aberto: <b className="tabular-nums">{brl(totais.aberto)}</b>
        </span>
        {totais.vencido > 0 && (
          <span style={{ color: 'var(--rbr-danger)' }}>
            Vencido: <b className="tabular-nums">{brl(totais.vencido)}</b>
          </span>
        )}
        {(filtro === 'pagos' || filtro === 'todos') && (
          <span>
            {tipo === 'pagar' ? 'Pago' : 'Recebido'}: <b className="tabular-nums">{brl(totais.pago)}</b>
          </span>
        )}
        <span className="text-[color:var(--rbr-muted)]">{filtrados.length} lançamento(s)</span>
      </div>

      {selecionados.length > 0 && (
        <div className="sticky top-2 z-10 flex items-center gap-2 flex-wrap rounded-xl px-3 py-2 shadow" style={{ background: 'var(--rbr-navy-dark)', color: '#fff' }}>
          <span className="text-xs font-semibold">
            {selecionados.length} selecionado(s) · {brl(selAbertos.reduce((s, l) => s + Number(l.saldo_aberto ?? 0), 0))}
          </span>
          {selAbertos.length > 0 && (
            <Botao
              variante="ouro"
              onClick={() => {
                setBaixaAlvo(selAbertos)
                setModal('baixa')
              }}
            >
              {tipo === 'pagar' ? 'Pagar selecionados' : 'Receber selecionados'}
            </Botao>
          )}
          {tipo === 'receber' && mesmoCliente && selAbertos.every((l) => !l.fatura_id) && (
            <Botao variante="secundario" onClick={() => setModal('fatura')}>
              Gerar fatura
            </Botao>
          )}
          {tipo === 'receber' && mesmaContraparte && (
            <Botao variante="secundario" onClick={() => setModal('cobrar')}>
              Cobrar
            </Botao>
          )}
          <button type="button" className="text-xs underline ml-auto" onClick={() => setSel(new Set())}>
            Limpar seleção
          </button>
        </div>
      )}

      {erro && <Aviso>{erro}</Aviso>}
      {!dados ? (
        <Carregando />
      ) : filtrados.length === 0 ? (
        <Card>
          <Vazio>Nada por aqui neste filtro.</Vazio>
        </Card>
      ) : (
        <Card className="!p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10.5px] uppercase tracking-wide text-[color:var(--rbr-muted)] border-b" style={{ borderColor: 'var(--rbr-border)' }}>
                  <th className="p-3 w-8">
                    <input
                      type="checkbox"
                      aria-label="Selecionar todos"
                      checked={filtrados.length > 0 && filtrados.every((l) => l.id && sel.has(l.id))}
                      onChange={(e) => setSel(e.target.checked ? new Set(filtrados.map((l) => l.id!).filter(Boolean)) : new Set())}
                    />
                  </th>
                  <th className="p-3">Vencimento</th>
                  <th className="p-3">{tipo === 'pagar' ? 'Para' : 'De'}</th>
                  <th className="p-3 hidden md:table-cell">Descrição</th>
                  <th className="p-3 hidden lg:table-cell">Categoria</th>
                  <th className="p-3 text-right">Valor</th>
                  <th className="p-3">Situação</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {filtrados.map((l) => (
                  <tr key={l.id} className="border-b last:border-b-0 hover:bg-[#FAFBFD] cursor-pointer" style={{ borderColor: 'var(--rbr-border)' }} onClick={() => setDetalhe(l.id!)}>
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" aria-label="Selecionar" checked={!!l.id && sel.has(l.id)} onChange={() => l.id && alternar(l.id)} />
                    </td>
                    <td className="p-3 whitespace-nowrap tabular-nums">
                      {fmtData(l.status === 'pago' ? l.data_pagamento : l.data_vencimento)}
                      {l.vencimento_estimado && aberto(l) && <div className="text-[10.5px] text-[color:var(--rbr-muted)]">estimado</div>}
                      {(l.dias_atraso ?? 0) > 0 && aberto(l) && <div className="text-[10.5px]" style={{ color: 'var(--rbr-danger)' }}>{l.dias_atraso} dia(s) de atraso</div>}
                    </td>
                    <td className="p-3 min-w-[140px]">
                      <div className="font-semibold truncate max-w-[220px]">{l.contraparte ?? '—'}</div>
                      <div className="text-[11px] text-[color:var(--rbr-muted)] md:hidden truncate max-w-[220px]">{l.descricao}</div>
                    </td>
                    <td className="p-3 hidden md:table-cell">
                      <div className="truncate max-w-[320px]">{l.descricao}</div>
                      <div className="text-[10.5px] text-[color:var(--rbr-muted)]">
                        {[l.fatura_numero ? `Fatura ${l.fatura_numero}` : null, l.numero_documento ? `Doc ${l.numero_documento}` : null, l.qtd_documentos ? `${l.qtd_documentos} anexo(s)` : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </td>
                    <td className="p-3 hidden lg:table-cell text-xs text-[color:var(--rbr-muted)]">{l.categoria_nome ?? '—'}</td>
                    <td className="p-3 text-right tabular-nums whitespace-nowrap">
                      <div className="font-semibold">{brl(aberto(l) ? l.saldo_aberto : l.valor)}</div>
                      {aberto(l) && Number(l.valor_pago) > 0 && <div className="text-[10.5px] text-[color:var(--rbr-muted)]">de {brl(l.valor)}</div>}
                    </td>
                    <td className="p-3">
                      <Pill situacao={l.situacao ?? ''} />
                    </td>
                    <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                      {aberto(l) && (
                        <Botao
                          variante="secundario"
                          onClick={() => {
                            setBaixaAlvo([l])
                            setModal('baixa')
                          }}
                        >
                          {tipo === 'pagar' ? 'Pagar' : 'Receber'}
                        </Botao>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {modal === 'novo' && <LancamentoForm tipoInicial={tipo} apoio={apoio} onFechar={() => setModal(null)} onSalvo={onMudou} />}
      {modal === 'baixa' && <BaixaModal lancamentos={baixaAlvo} apoio={apoio} onFechar={() => setModal(null)} onFeito={onMudou} />}
      {modal === 'cobrar' && <CobrancaModal lancamentos={selAbertos} onFechar={() => setModal(null)} />}
      {modal === 'fatura' && (
        <NovaFaturaModal
          apoio={apoio}
          clienteId={selAbertos[0]?.cliente_id ?? ''}
          preSelecionados={selAbertos.map((l) => l.id!)}
          onFechar={() => setModal(null)}
          onCriada={() => {
            setModal(null)
            onMudou()
          }}
        />
      )}
      {detalhe && <DetalheLancamento id={detalhe} apoio={apoio} onFechar={() => setDetalhe(null)} onMudou={onMudou} />}
      {erro === null && dados && filtro === 'vencidos' && filtrados.length > 0 && tipo === 'receber' && (
        <div className="text-[11px] text-[color:var(--rbr-muted)]">Dica: selecione os títulos de um cliente e toque em “Cobrar” — a IA escreve a mensagem no tom certo pelo atraso.</div>
      )}
    </div>
  )
}

