import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { db, brl, msgErro } from '../../lib/novoDb'
import { Modal, Botao, Aviso, Campo, inputClass, inputStyle } from '../financeiro/ui'
import { useConfirmacao } from '../Confirmacao'
import { AVISO_PRE_COTACAO, BASE_LABEL, TIPOS_VEICULO, type BaseValor, type Item, type PreCotacao } from './tipos'

type Linha = {
  key: string
  cidade_origem: string
  uf_origem: string
  cidade_destino: string
  uf_destino: string
  tipo_veiculo: string
  eixos: string
  viagens: string
  valor_mercadoria: string
  valor_mercadoria_base: BaseValor
  pedagio: string
  pedagio_base: string | null
  preco_viagem: string
  sugPedagio?: { valor: number | null; fonte?: string; amostras?: number }
  sugValor?: { valor: number | null; base?: string; data?: string }
  ref?: { km?: number; piso?: number; erro?: string; carregando?: boolean }
}

export type ClienteOpt = { id: string; nome: string; status: string | null }

const nova = (): Linha => ({
  key: Math.random().toString(36).slice(2),
  cidade_origem: '', uf_origem: '', cidade_destino: '', uf_destino: '',
  tipo_veiculo: 'Carreta', eixos: '', viagens: '1',
  valor_mercadoria: '', valor_mercadoria_base: 'digitado',
  pedagio: '', pedagio_base: null, preco_viagem: '',
})

const num = (s: string) => {
  const v = parseFloat(s.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(v) ? v : null
}
const fmtNum = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','))

function lerVNF(xml: string): number | null {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) return null
  const el = doc.getElementsByTagName('vNF')[0]
  const v = el ? parseFloat(el.textContent ?? '') : NaN
  return Number.isFinite(v) ? v : null
}

function doItem(i: Item): Linha {
  return {
    key: i.id, cidade_origem: i.cidade_origem, uf_origem: i.uf_origem, cidade_destino: i.cidade_destino, uf_destino: i.uf_destino,
    tipo_veiculo: i.tipo_veiculo ?? '', eixos: i.eixos ? String(i.eixos) : '', viagens: String(i.viagens),
    valor_mercadoria: fmtNum(i.valor_mercadoria), valor_mercadoria_base: i.valor_mercadoria_base ?? 'digitado',
    pedagio: fmtNum(i.pedagio), pedagio_base: i.pedagio_base, preco_viagem: fmtNum(i.preco_viagem),
  }
}

export default function EditarPreCotacao({
  pre, itens, clientes, onFechar, onSalvo,
}: { pre: PreCotacao | null; itens: Item[]; clientes: ClienteOpt[]; onFechar: () => void; onSalvo: (msg: string) => void }) {
  const [clienteId, setClienteId] = useState(pre?.cliente_id ?? '')
  const [filtro, setFiltro] = useState('')
  const [nomeLivre, setNomeLivre] = useState(pre?.cliente_nome_livre ?? '')
  const [validade, setValidade] = useState(String(pre?.validade_dias ?? 7))
  const [obs, setObs] = useState(pre?.observacoes ?? '')
  const [linhas, setLinhas] = useState<Linha[]>(itens.length ? itens.map(doItem) : [nova()])
  const { confirmacao, rodar, ocupado } = useConfirmacao()
  const [erroForm, setErroForm] = useState<string | null>(null)

  const opcoes = useMemo(() => {
    const t = filtro.trim().toLowerCase()
    return clientes.filter((c) => (c.status === 'ativo' || c.id === clienteId) && (!t || c.nome.toLowerCase().includes(t)))
  }, [clientes, filtro, clienteId])

  const set = (key: string, p: Partial<Linha>) => setLinhas((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)))

  // Sugestões do histórico (pedágio e valor da mercadoria) quando a rota está completa.
  const chaveSug = linhas.map((l) => `${l.key}|${l.cidade_origem}|${l.uf_origem}|${l.cidade_destino}|${l.uf_destino}|${l.eixos}`).join(';') + clienteId
  useEffect(() => {
    const t = setTimeout(() => {
      linhas.forEach(async (l) => {
        if (l.cidade_origem.trim().length < 2 || l.cidade_destino.trim().length < 2 || l.uf_origem.length !== 2 || l.uf_destino.length !== 2) return
        const [ped, val] = await Promise.all([
          db.rpc('sugerir_pedagio', { p_cidade_origem: l.cidade_origem.trim(), p_uf_origem: l.uf_origem, p_cidade_destino: l.cidade_destino.trim(), p_uf_destino: l.uf_destino, p_eixos: l.eixos ? Number(l.eixos) : null }),
          clienteId ? db.rpc('sugerir_valor_mercadoria', { p_cliente: clienteId, p_cidade_origem: l.cidade_origem.trim(), p_cidade_destino: l.cidade_destino.trim() }) : Promise.resolve({ data: null }),
        ])
        set(l.key, { sugPedagio: (ped.data as Linha['sugPedagio']) ?? undefined, sugValor: (val.data as Linha['sugValor']) ?? undefined })
      })
    }, 600)
    return () => clearTimeout(t)
  }, [chaveSug]) // eslint-disable-line react-hooks/exhaustive-deps

  async function referencia(l: Linha) {
    if (!l.cidade_origem || !l.cidade_destino || l.uf_origem.length !== 2 || l.uf_destino.length !== 2) return set(l.key, { ref: { erro: 'Preencha origem e destino.' } })
    set(l.key, { ref: { carregando: true } })
    try {
      const { data, error } = await supabase.functions.invoke('calcular-rota-frete', {
        body: { cidade_origem: l.cidade_origem.trim(), uf_origem: l.uf_origem, cidade_destino: l.cidade_destino.trim(), uf_destino: l.uf_destino, tipo_carga: 'Carga Geral', eixos: l.eixos ? Number(l.eixos) : undefined, tabela: 'A' },
      })
      if (error || !data?.sucesso) return set(l.key, { ref: { erro: data?.erro ?? error?.message ?? 'Não foi possível calcular.' } })
      set(l.key, { ref: { km: data.distancia_km, piso: data.piso_antt_minimo, erro: data.piso_antt_erro } })
    } catch (e) {
      set(l.key, { ref: { erro: msgErro(e) } })
    }
  }

  async function soltarXml(l: Linha, f: File | undefined) {
    if (!f) return
    const v = lerVNF(await f.text())
    if (v == null) return setErroForm('Não encontrei o valor da nota (vNF) nesse XML.')
    setErroForm(null)
    set(l.key, { valor_mercadoria: fmtNum(v), valor_mercadoria_base: 'xml' })
  }

  async function salvar() {
    setErroForm(null)
    if (!clienteId && !nomeLivre.trim()) return setErroForm('Informe o cliente (cadastrado ou nome livre).')
    const validas = linhas.filter((l) => l.cidade_origem.trim() || l.cidade_destino.trim() || l.preco_viagem)
    if (validas.length === 0) return setErroForm('Adicione ao menos uma rota.')
    for (const [i, l] of validas.entries()) {
      if (!l.cidade_origem.trim() || l.uf_origem.length !== 2 || !l.cidade_destino.trim() || l.uf_destino.length !== 2) return setErroForm(`Rota ${i + 1}: preencha cidade e UF de origem e destino.`)
      if (num(l.preco_viagem) == null) return setErroForm(`Rota ${i + 1}: informe o preço por viagem.`)
      if (!(Number(l.viagens) >= 1)) return setErroForm(`Rota ${i + 1}: nº de viagens inválido.`)
    }
    await rodar(
      (n: number) => `Pré-cotação ${pre ? 'atualizada' : 'criada'} com ${n} rota(s).`,
      async () => {
        const cab = { cliente_id: clienteId || null, cliente_nome_livre: clienteId ? null : nomeLivre.trim(), validade_dias: Number(validade) || 7, observacoes: obs.trim() || null }
        let id = pre?.id
        if (id) {
          const { error } = await db.from('pre_cotacoes').update(cab).eq('id', id)
          if (error) throw error
          const { error: e2 } = await db.from('pre_cotacao_itens').delete().eq('pre_cotacao_id', id)
          if (e2) throw e2
        } else {
          const { data, error } = await db.from('pre_cotacoes').insert({ ...cab, status: 'rascunho' }).select('id').single()
          if (error) throw error
          id = data.id as string
        }
        const rows = validas.map((l, ordem) => ({
          pre_cotacao_id: id, ordem,
          cidade_origem: l.cidade_origem.trim(), uf_origem: l.uf_origem, cidade_destino: l.cidade_destino.trim(), uf_destino: l.uf_destino,
          tipo_veiculo: l.tipo_veiculo || null, eixos: l.eixos ? Number(l.eixos) : null, viagens: Number(l.viagens),
          valor_mercadoria: num(l.valor_mercadoria), valor_mercadoria_base: num(l.valor_mercadoria) == null ? null : l.valor_mercadoria_base,
          pedagio: num(l.pedagio), pedagio_base: num(l.pedagio) == null ? null : l.pedagio_base ?? 'digitado',
          preco_viagem: num(l.preco_viagem), status: 'pendente',
        }))
        const { error: e3 } = await db.from('pre_cotacao_itens').insert(rows)
        if (e3) throw e3
        onSalvo(`Pré-cotação ${pre ? 'atualizada' : 'criada'} com ${rows.length} rota(s).`)
        return rows.length
      },
    )
  }

  return (
    <Modal titulo={pre ? `Editar pré-cotação #${pre.numero}` : 'Nova pré-cotação'} onFechar={onFechar} largura="max-w-5xl">
      <div className="flex flex-col gap-4">
        <Aviso tipo="info">{AVISO_PRE_COTACAO}</Aviso>
        <div className="grid md:grid-cols-[2fr_1fr] gap-3">
          <Campo label="Cliente">
            <div className="flex flex-col gap-2">
              <input placeholder="Buscar cliente cadastrado…" value={filtro} onChange={(e) => setFiltro(e.target.value)} className={inputClass} style={inputStyle} />
              <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} className={inputClass} style={inputStyle}>
                <option value="">— sem cadastro (nome livre) —</option>
                {opcoes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
              {!clienteId && <input placeholder="Nome do cliente / contato" value={nomeLivre} onChange={(e) => setNomeLivre(e.target.value)} className={inputClass} style={inputStyle} />}
            </div>
          </Campo>
          <Campo label="Validade (dias)" dica="Conta a partir do envio.">
            <input type="number" min={1} value={validade} onChange={(e) => setValidade(e.target.value)} className={inputClass} style={inputStyle} />
          </Campo>
        </div>

        {linhas.map((l, idx) => (
          <div key={l.key} className="rounded-xl border p-3 flex flex-col gap-3" style={{ borderColor: 'var(--rbr-border)', background: 'var(--rbr-muted-bg)' }}>
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">Rota {idx + 1}</span>
              {linhas.length > 1 && <Botao variante="perigo" onClick={() => setLinhas((ls) => ls.filter((x) => x.key !== l.key))}>Remover</Botao>}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="grid grid-cols-[1fr_56px] gap-1.5">
                <input placeholder="Origem *" value={l.cidade_origem} onChange={(e) => set(l.key, { cidade_origem: e.target.value })} className={inputClass} style={inputStyle} />
                <input placeholder="UF" maxLength={2} value={l.uf_origem} onChange={(e) => set(l.key, { uf_origem: e.target.value.toUpperCase() })} className={inputClass} style={inputStyle} />
              </div>
              <div className="grid grid-cols-[1fr_56px] gap-1.5">
                <input placeholder="Destino *" value={l.cidade_destino} onChange={(e) => set(l.key, { cidade_destino: e.target.value })} className={inputClass} style={inputStyle} />
                <input placeholder="UF" maxLength={2} value={l.uf_destino} onChange={(e) => set(l.key, { uf_destino: e.target.value.toUpperCase() })} className={inputClass} style={inputStyle} />
              </div>
              <select value={l.tipo_veiculo} onChange={(e) => set(l.key, { tipo_veiculo: e.target.value })} className={inputClass} style={inputStyle}>
                <option value="">Veículo…</option>
                {TIPOS_VEICULO.map((v) => <option key={v}>{v}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-1.5">
                <input placeholder="Eixos" type="number" min={2} max={9} value={l.eixos} onChange={(e) => set(l.key, { eixos: e.target.value })} className={inputClass} style={inputStyle} />
                <input placeholder="Viagens" type="number" min={1} value={l.viagens} onChange={(e) => set(l.key, { viagens: e.target.value })} className={inputClass} style={inputStyle} />
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-3">
              <Campo label="Valor da mercadoria (R$)">
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); soltarXml(l, e.dataTransfer.files[0]) }}
                  className="flex flex-col gap-1.5"
                >
                  <input
                    placeholder="Digite ou arraste o XML da NF-e aqui"
                    value={l.valor_mercadoria}
                    onChange={(e) => set(l.key, { valor_mercadoria: e.target.value, valor_mercadoria_base: l.valor_mercadoria_base === 'informado_cliente' ? 'informado_cliente' : 'digitado' })}
                    className={inputClass} style={inputStyle}
                  />
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    {l.valor_mercadoria && <span className="px-2 py-0.5 rounded-full font-bold" style={{ background: '#fff', border: '1px solid var(--rbr-border)' }}>{BASE_LABEL[l.valor_mercadoria_base]}</span>}
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input type="checkbox" checked={l.valor_mercadoria_base === 'informado_cliente'} onChange={(e) => set(l.key, { valor_mercadoria_base: e.target.checked ? 'informado_cliente' : 'digitado' })} />
                      informado pelo cliente (aproximado)
                    </label>
                    <label className="font-bold cursor-pointer text-[color:var(--rbr-navy)]">
                      anexar XML
                      <input type="file" accept=".xml,text/xml" className="hidden" onChange={(e) => soltarXml(l, e.target.files?.[0])} />
                    </label>
                  </div>
                  {l.sugValor?.valor != null && (
                    <div className="text-[11px] text-[color:var(--rbr-muted)]">
                      Sugerido pelo histórico ({l.sugValor.base === 'mesma_rota' ? 'mesma rota' : 'histórico do cliente'}): <b>{brl(l.sugValor.valor)}</b>{' '}
                      <button type="button" className="font-bold text-[color:var(--rbr-navy)]" onClick={() => set(l.key, { valor_mercadoria: fmtNum(l.sugValor!.valor), valor_mercadoria_base: 'historico_cliente' })}>Usar</button>
                    </div>
                  )}
                </div>
              </Campo>
              <Campo label="Pedágio (R$)">
                <input placeholder="vazio = pedágio não incluído" value={l.pedagio} onChange={(e) => set(l.key, { pedagio: e.target.value, pedagio_base: 'digitado' })} className={inputClass} style={inputStyle} />
                {l.sugPedagio?.valor != null ? (
                  <div className="text-[11px] mt-1 text-[color:var(--rbr-muted)]">
                    Sugerido pelo histórico: <b>{brl(l.sugPedagio.valor)}</b>{' '}
                    <button type="button" className="font-bold text-[color:var(--rbr-navy)]" onClick={() => set(l.key, { pedagio: fmtNum(l.sugPedagio!.valor), pedagio_base: 'historico' })}>Usar</button>
                  </div>
                ) : !l.pedagio && <div className="text-[11px] mt-1 text-[color:var(--rbr-muted)]">Pedágio não incluído</div>}
              </Campo>
              <Campo label="Preço por viagem (R$) *">
                <input placeholder="0,00" value={l.preco_viagem} onChange={(e) => set(l.key, { preco_viagem: e.target.value })} className={inputClass} style={inputStyle} />
                <div className="text-[11px] mt-1 text-[color:var(--rbr-muted)] flex items-center gap-2 flex-wrap">
                  <button type="button" className="font-bold text-[color:var(--rbr-navy)]" onClick={() => referencia(l)} disabled={l.ref?.carregando}>
                    {l.ref?.carregando ? 'calculando…' : 'ver distância e piso ANTT'}
                  </button>
                  {l.ref?.km != null && <span>{Math.round(l.ref.km)} km{l.ref.piso != null && <> · piso ANTT {brl(l.ref.piso)}</>}</span>}
                  {l.ref?.erro && <span>({l.ref.erro})</span>}
                </div>
              </Campo>
            </div>
          </div>
        ))}
        <div><Botao variante="secundario" onClick={() => setLinhas((ls) => [...ls, nova()])}>+ Adicionar rota</Botao></div>

        <Campo label="Observações (internas)">
          <textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} className={inputClass} style={inputStyle} />
        </Campo>
        {erroForm && <Aviso tipo="erro">✗ {erroForm}</Aviso>}
        {confirmacao}
        <div className="flex justify-end gap-2">
          <Botao variante="secundario" onClick={onFechar}>Cancelar</Botao>
          <Botao onClick={salvar} disabled={ocupado}>{ocupado ? 'enviando…' : 'Salvar'}</Botao>
        </div>
      </div>
    </Modal>
  )
}
