import { supabase } from '@rbr/shared/supabaseClient'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { brl, msgErro } from '../../lib/novoDb'
import { Modal, Botao, Aviso, Pill } from '../financeiro/ui'
import { useConfirmacao } from '../Confirmacao'
import {
  AVISO_PRE_COTACAO, BASE_LABEL, STATUS_LABEL, derivarStatus, gerarPdfPre, numeroFmt, textoWhatsApp, validadeFim,
  type Item, type PreCotacao, type StatusItem,
} from './tipos'

export default function DetalhePreCotacao({
  pre, itens, cliente, telefone, onFechar, onMudou, onEditar,
}: {
  pre: PreCotacao; itens: Item[]; cliente: string; telefone: string | null
  onFechar: () => void; onMudou: () => void; onEditar: () => void
}) {
  const { confirmacao, rodar, ocupado } = useConfirmacao()
  const nav = useNavigate()
  const [criadas, setCriadas] = useState<number | null>(null)
  const texto = textoWhatsApp(pre, itens, cliente)
  const editavel = (pre.status === 'rascunho' || pre.status === 'enviada') && itens.every((i) => i.status === 'pendente')
  const aceitas = itens.filter((i) => i.status === 'aceita').length

  async function marcarEnviada() {
    if (pre.status !== 'rascunho') return
    const { error } = await supabase.from('pre_cotacoes').update({ status: 'enviada', enviada_em: new Date().toISOString() }).eq('id', pre.id)
    if (error) throw error
    onMudou()
  }

  const copiar = () =>
    rodar('Texto copiado — cole no WhatsApp. Pré-cotação marcada como enviada.', async () => {
      await navigator.clipboard.writeText(texto)
      await marcarEnviada()
    })

  const whats = () =>
    rodar('WhatsApp aberto com o texto. Pré-cotação marcada como enviada.', async () => {
      const tel = (telefone ?? '').replace(/\D/g, '')
      const fone = tel ? (tel.startsWith('55') ? tel : `55${tel}`) : ''
      window.open(`https://wa.me/${fone}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener')
      await marcarEnviada()
    })

  const pdf = () =>
    rodar('PDF gerado e baixado. Pré-cotação marcada como enviada.', async () => {
      const { data } = await supabase.from('parametros_sistema').select('valor').eq('chave', 'dados_empresa').maybeSingle()
      const blob = await gerarPdfPre(pre, itens, cliente, (data?.valor ?? {}) as Record<string, string>)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `pre-cotacao-${numeroFmt(pre.numero)}.pdf`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 5000)
      await marcarEnviada()
    })

  const decidir = (i: Item, status: StatusItem) =>
    rodar(`Rota ${status === 'aceita' ? 'aceita' : status === 'recusada' ? 'recusada' : 'voltou a pendente'}.`, async () => {
      const { error } = await supabase.from('pre_cotacao_itens').update({ status }).eq('id', i.id)
      if (error) throw error
      const novo = itens.map((x) => (x.id === i.id ? { ...x, status } : x))
      const st = derivarStatus(pre.status === 'rascunho' ? 'enviada' : pre.status, novo)
      const { error: e2 } = await supabase.from('pre_cotacoes').update({ status: st, ...(pre.status === 'rascunho' ? { enviada_em: new Date().toISOString() } : {}) }).eq('id', pre.id)
      if (e2) throw e2
      onMudou()
    })

  const converter = () =>
    rodar(
      (n: number) => `${n} cotação(ões) criada(s) em rascunho.`,
      async () => {
        const { data, error } = await supabase.rpc('converter_pre_cotacao', { p_pre: pre.id })
        if (error) throw new Error(msgErro(error))
        const n = ((data as { cotacoes?: string[] } | null)?.cotacoes ?? []).length
        setCriadas(n)
        onMudou()
        return n
      },
    )

  const fim = validadeFim(pre)
  return (
    <Modal titulo={<>Pré-cotação {numeroFmt(pre.numero)} · {cliente}</>} onFechar={onFechar} largura="max-w-4xl">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 flex-wrap text-sm">
          <Pill situacao={pre.status === 'recusada' || pre.status === 'expirada' ? 'atrasado' : pre.status === 'aceita' || pre.status === 'convertida' ? 'ok' : 'pendente'} texto={STATUS_LABEL[pre.status]} />
          <span className="text-[color:var(--rbr-muted)]">{fim ? `Válida até ${fim.toLocaleDateString('pt-BR')}` : `Validade: ${pre.validade_dias} dias após o envio`}</span>
        </div>
        <Aviso tipo="info">{AVISO_PRE_COTACAO}</Aviso>

        <div className="flex flex-col gap-2">
          {itens.map((i, idx) => (
            <div key={i.id} className="rounded-xl border p-3 flex flex-col md:flex-row md:items-center justify-between gap-3" style={{ borderColor: 'var(--rbr-border)' }}>
              <div className="text-sm">
                <div className="font-bold">{idx + 1}. {i.cidade_origem}/{i.uf_origem} → {i.cidade_destino}/{i.uf_destino}</div>
                <div className="text-[color:var(--rbr-muted)]">
                  {[i.tipo_veiculo, i.eixos ? `${i.eixos} eixos` : null].filter(Boolean).join(' · ') || 'veículo a definir'} · {i.viagens} viagem(ns) · <b className="text-[color:var(--rbr-navy-dark)]">{brl(i.preco_viagem)}</b> por viagem
                </div>
                <div className="text-[11px] text-[color:var(--rbr-muted)]">
                  Mercadoria {i.valor_mercadoria != null ? <>{brl(i.valor_mercadoria)} <span className="px-1.5 py-0.5 rounded-full border" style={{ borderColor: 'var(--rbr-border)' }}>{i.valor_mercadoria_base ? BASE_LABEL[i.valor_mercadoria_base] : ''}</span></> : 'não informada'}
                  {' · '}{i.pedagio != null && i.pedagio > 0 ? `pedágio ${brl(i.pedagio)}` : 'pedágio não incluído'}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {i.status === 'convertida' ? <span className="text-xs font-bold text-[color:var(--rbr-positive)]">✓ convertida</span> : (
                  <>
                    {i.status !== 'pendente' && <span className="text-xs font-bold">{i.status === 'aceita' ? '✓ aceita' : '✗ recusada'}</span>}
                    <Botao variante={i.status === 'aceita' ? 'primario' : 'secundario'} disabled={ocupado || pre.status === 'convertida' || i.status === 'aceita'} onClick={() => decidir(i, 'aceita')}>Aceitar</Botao>
                    <Botao variante="perigo" disabled={ocupado || pre.status === 'convertida' || i.status === 'recusada'} onClick={() => decidir(i, 'recusada')}>Recusar</Botao>
                    {i.status !== 'pendente' && <Botao variante="fantasma" disabled={ocupado} onClick={() => decidir(i, 'pendente')}>Desfazer</Botao>}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-xl p-3 border flex flex-col gap-2" style={{ borderColor: 'var(--rbr-border)', background: 'var(--rbr-muted-bg)' }}>
          <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">Card para o cliente</div>
          <pre className="text-xs whitespace-pre-wrap font-sans max-h-48 overflow-auto">{texto}</pre>
          <div className="flex gap-2 flex-wrap">
            <Botao variante="secundario" disabled={ocupado} onClick={copiar}>{ocupado ? 'enviando…' : 'Copiar texto'}</Botao>
            <Botao variante="secundario" disabled={ocupado} onClick={pdf}>{ocupado ? 'enviando…' : 'Baixar PDF'}</Botao>
            <Botao variante="ouro" disabled={ocupado} onClick={whats}>{ocupado ? 'enviando…' : 'Abrir no WhatsApp'}</Botao>
          </div>
        </div>

        {confirmacao}
        {criadas != null && criadas > 0 && <div><Botao onClick={() => nav('/cotacao')}>Abrir cotações</Botao></div>}

        <div className="flex justify-between gap-2 flex-wrap">
          <div>{editavel && <Botao variante="secundario" onClick={onEditar}>Editar rotas</Botao>}</div>
          <div className="flex gap-2">
            <Botao variante="secundario" onClick={onFechar}>Fechar</Botao>
            <Botao disabled={ocupado || aceitas === 0} onClick={converter} title={aceitas === 0 ? 'Aceite ao menos uma rota' : ''}>{ocupado ? 'enviando…' : `Converter aceitas (${aceitas})`}</Botao>
          </div>
        </div>
      </div>
    </Modal>
  )
}
