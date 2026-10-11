import { supabase } from '@rbr/shared/supabaseClient'
import { useEffect, useState } from 'react'
import { brl, dataBr, msgErro } from '../../lib/novoDb'
import { Aviso, Botao, Campo, Modal, inputClass, inputStyle } from '../financeiro/ui'
import { useConfirmacao } from '../Confirmacao'
import type { TipoCotacaoValor } from './TipoCotacao'

export const rotuloOperacao = (id: string) => `#${id.slice(0, 8)}`

export type ResumoConversao = {
  cliente: string
  rota: string
  veiculo: string
  preco: number | null
  margem: string
}

// 1) Janela de confirmação antes de converter (sempre).
export function ConfirmarConversaoModal({
  resumo,
  tipo,
  qtdVeiculos,
  cargasTotal,
  onConfirmar,
  onFechar,
}: {
  resumo: ResumoConversao
  tipo: TipoCotacaoValor
  qtdVeiculos: number
  cargasTotal: number
  onConfirmar: () => Promise<void>
  onFechar: () => void
}) {
  const { confirmacao, rodar, ocupado } = useConfirmacao()
  const linhas: [string, string][] = [
    ['Cliente', resumo.cliente],
    ['Rota', resumo.rota],
    ['Veículo', resumo.veiculo],
    ['Preço', brl(resumo.preco)],
    ['Margem', resumo.margem],
  ]
  return (
    <Modal titulo="Converter em operação" onFechar={ocupado ? () => {} : onFechar} largura="max-w-lg">
      <div className="flex flex-col gap-3">
        <div className="border rounded-xl divide-y" style={{ borderColor: 'var(--rbr-border)' }}>
          {linhas.map(([k, v]) => (
            <div key={k} className="flex items-start justify-between gap-3 px-3 py-2 text-xs" style={{ borderColor: 'var(--rbr-border)' }}>
              <span className="text-[color:var(--rbr-muted)]">{k}</span>
              <span className="font-semibold text-right text-[color:var(--rbr-navy-dark)]">{v}</span>
            </div>
          ))}
        </div>
        {tipo === 'veiculos_juntos' && <Aviso tipo="info">Serão criadas {qtdVeiculos} operações ligadas, como saída conjunta.</Aviso>}
        {tipo === 'varias_entregas' && (
          <Aviso tipo="info">
            Nenhuma operação é criada agora. Em seguida você programa quantas cargas abrir ({cargasTotal} no total).
          </Aviso>
        )}
        <div className="text-[11px] text-[color:var(--rbr-muted)]">Nada fiscal é emitido na conversão.</div>
        {confirmacao}
        <div className="flex justify-end gap-2">
          <Botao variante="secundario" onClick={onFechar} disabled={ocupado}>
            Voltar
          </Botao>
          <Botao variante="ouro" disabled={ocupado} onClick={() => void rodar('Cotação convertida', onConfirmar)}>
            {ocupado ? 'Convertendo…' : 'Converter em operação'}
          </Botao>
        </div>
      </div>
    </Modal>
  )
}

type DestinoProg = { id: string; nome: string; previstas: number; abertas: number; qtd: string; data: string }

// 2) Programar operações (várias entregas): quantidade por destino, data prevista, juntas ou independentes.
export function ProgramarOperacoesModal({
  cotacaoId,
  onFechar,
  onMudou,
}: {
  cotacaoId: string
  onFechar: () => void
  onMudou: () => void
}) {
  const { confirmacao, rodar, ocupado } = useConfirmacao()
  const [destinos, setDestinos] = useState<DestinoProg[] | null>(null)
  const [juntas, setJuntas] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const [d, o] = await Promise.all([
        supabase.from('cotacao_destinos').select('id, ordem, cidade_destino, uf_destino, endereco_entrega, cargas_previstas').eq('cotacao_id', cotacaoId).order('ordem', { ascending: true }),
        supabase.from('operacoes').select('cotacao_destino_id, status').eq('cotacao_id', cotacaoId).neq('status', 'cancelada'),
      ])
      if (!vivo) return
      if (d.error || o.error) {
        setErro(msgErro(d.error ?? o.error))
        return
      }
      const abertas = new Map<string, number>()
      for (const r of (o.data ?? []) as { cotacao_destino_id: string | null }[]) {
        if (r.cotacao_destino_id) abertas.set(r.cotacao_destino_id, (abertas.get(r.cotacao_destino_id) ?? 0) + 1)
      }
      setDestinos(
        ((d.data ?? []) as Record<string, any>[]).map((r) => ({
          id: r.id,
          nome: [r.cidade_destino, r.uf_destino].filter(Boolean).join('/') || r.endereco_entrega || 'Destino',
          previstas: r.cargas_previstas ?? 1,
          abertas: abertas.get(r.id) ?? 0,
          qtd: '',
          data: '',
        })),
      )
    })()
    return () => {
      vivo = false
    }
  }, [cotacaoId])

  const editar = (id: string, campo: 'qtd' | 'data', v: string) => setDestinos((l) => (l ?? []).map((d) => (d.id === id ? { ...d, [campo]: v } : d)))
  const restante = (d: DestinoProg) => Math.max(0, d.previstas - d.abertas)
  const totalPrev = (destinos ?? []).reduce((s, d) => s + d.previstas, 0)
  const totalAb = (destinos ?? []).reduce((s, d) => s + d.abertas, 0)
  const aAbrir = (destinos ?? []).reduce((s, d) => s + (Math.floor(Number(d.qtd)) || 0), 0)

  async function programar(): Promise<string> {
    const lista = (destinos ?? []).filter((d) => (Math.floor(Number(d.qtd)) || 0) > 0)
    if (lista.length === 0) throw new Error('Informe quantas cargas abrir em pelo menos um destino.')
    for (const d of lista) {
      if (Math.floor(Number(d.qtd)) > restante(d)) throw new Error(`${d.nome}: só restam ${restante(d)} carga(s) no saldo.`)
    }
    let abertas = 0
    for (const d of lista) {
      const { data, error } = await supabase.rpc('abrir_operacoes_cotacao', {
        p_cotacao: cotacaoId,
        p_destino: d.id,
        p_quantidade: Math.floor(Number(d.qtd)),
        p_juntas: juntas,
      })
      if (error) {
        if (abertas > 0) onMudou()
        throw new Error(abertas > 0 ? `${abertas} operação(ões) abertas antes do erro. ${d.nome}: ${error.message}` : `${d.nome}: ${error.message}`)
      }
      abertas += Number((data as { abertas?: number } | null)?.abertas ?? 0)
    }
    // Data prevista é informativa: sem coluna própria, fica registrada na observação da cotação.
    const comData = lista.filter((d) => d.data)
    if (comData.length > 0) {
      const { data: c } = await supabase.from('cotacoes').select('observacoes').eq('id', cotacaoId).maybeSingle()
      const hoje = new Date().toLocaleDateString('pt-BR')
      const nota = comData.map((d) => `${d.nome}: ${Math.floor(Number(d.qtd))} carga(s) a partir de ${dataBr(d.data)}`).join('; ')
      const novo = [(c as { observacoes?: string | null } | null)?.observacoes, `Programação (${hoje}): ${nota}`].filter(Boolean).join('\n')
      await supabase.from('cotacoes').update({ observacoes: novo }).eq('id', cotacaoId)
    }
    onMudou()
    return `${abertas} operação(ões) aberta(s) — ${totalAb + abertas} de ${totalPrev} abertas${juntas ? ', saindo juntas' : ''}`
  }

  return (
    <Modal titulo="Programar operações" onFechar={ocupado ? () => {} : onFechar} largura="max-w-2xl">
      {erro && <Aviso>{erro}</Aviso>}
      {!destinos && !erro && <div className="text-xs text-[color:var(--rbr-muted)]">Carregando…</div>}
      {destinos && (
        <div className="flex flex-col gap-3">
          <div className="text-xs text-[color:var(--rbr-muted)]">
            {totalAb} de {totalPrev} abertas. O resto fica como saldo e pode ser aberto depois.
          </div>
          <div className="flex flex-col gap-2">
            {destinos.map((d) => (
              <div key={d.id} className="border rounded-xl p-3 grid grid-cols-1 md:grid-cols-[1fr_90px_150px] gap-2 items-end" style={{ borderColor: 'var(--rbr-border)' }}>
                <div>
                  <div className="text-sm font-bold text-[color:var(--rbr-navy-dark)]">{d.nome}</div>
                  <div className="text-[11px] text-[color:var(--rbr-muted)]">
                    {d.abertas} de {d.previstas} abertas · saldo {restante(d)}
                  </div>
                </div>
                <Campo label="Abrir agora">
                  <input
                    type="number"
                    min={0}
                    max={restante(d)}
                    value={d.qtd}
                    disabled={restante(d) === 0}
                    onChange={(e) => editar(d.id, 'qtd', e.target.value)}
                    className={inputClass}
                    style={inputStyle}
                  />
                </Campo>
                <Campo label="Data prevista">
                  <input type="date" value={d.data} onChange={(e) => editar(d.id, 'data', e.target.value)} className={inputClass} style={inputStyle} />
                </Campo>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Botao variante="secundario" onClick={() => setDestinos((l) => (l ?? []).map((d) => ({ ...d, qtd: restante(d) > 0 ? String(restante(d)) : '' })))}>
              Abrir todas agora
            </Botao>
            <Botao variante="fantasma" onClick={() => setDestinos((l) => (l ?? []).map((d) => ({ ...d, qtd: '' })))}>
              Limpar
            </Botao>
          </div>
          <div className="flex gap-4 flex-wrap text-xs">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" checked={!juntas} onChange={() => setJuntas(false)} /> Independentes
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" checked={juntas} onChange={() => setJuntas(true)} /> Saem juntas
            </label>
          </div>
          {confirmacao}
          <div className="flex justify-end gap-2">
            <Botao variante="secundario" onClick={onFechar} disabled={ocupado}>
              Fechar
            </Botao>
            <Botao variante="ouro" disabled={ocupado || aAbrir === 0} onClick={() => void rodar((m: string) => m, programar)}>
              {ocupado ? 'Abrindo…' : `Abrir ${aAbrir || ''} operaç${aAbrir === 1 ? 'ão' : 'ões'}`.replace('  ', ' ')}
            </Botao>
          </div>
        </div>
      )}
    </Modal>
  )
}

// 3) Cancelar cotação mantendo histórico (motivo obrigatório) ou apagar de vez (sem nenhuma operação).
export function CancelarCotacaoModal({
  modo,
  onConfirmar,
  onFechar,
}: {
  modo: 'cancelar' | 'apagar'
  onConfirmar: (motivo: string) => Promise<void>
  onFechar: () => void
}) {
  const { confirmacao, rodar, ocupado } = useConfirmacao()
  const [motivo, setMotivo] = useState('')
  const apagar = modo === 'apagar'
  return (
    <Modal titulo={apagar ? 'Apagar cotação' : 'Cancelar cotação'} onFechar={ocupado ? () => {} : onFechar} largura="max-w-md">
      <div className="flex flex-col gap-3">
        <Aviso tipo="atencao">
          {apagar
            ? 'A cotação some de vez e não dá pra desfazer. Só é possível porque ela não tem nenhuma operação.'
            : 'A cotação fica no histórico como cancelada (perdida), com o motivo registrado.'}
        </Aviso>
        {!apagar && (
          <Campo label="Motivo (obrigatório)">
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className={inputClass} style={inputStyle} placeholder="Ex.: cliente desistiu da carga" />
          </Campo>
        )}
        {confirmacao}
        <div className="flex justify-end gap-2">
          <Botao variante="secundario" onClick={onFechar} disabled={ocupado}>
            Voltar
          </Botao>
          <Botao
            variante="perigo"
            disabled={ocupado || (!apagar && !motivo.trim())}
            onClick={() => void rodar(apagar ? 'Cotação apagada' : 'Cotação cancelada; o histórico foi mantido', async () => {
              await onConfirmar(motivo.trim())
            })}
          >
            {ocupado ? 'Enviando…' : apagar ? 'Apagar cotação' : 'Cancelar cotação'}
          </Botao>
        </div>
      </div>
    </Modal>
  )
}
