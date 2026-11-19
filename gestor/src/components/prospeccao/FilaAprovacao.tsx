import { useCallback, useEffect, useState } from 'react'
import { Aviso, Botao, Campo, Card, Modal, Vazio, inputClass, inputStyle } from '../financeiro/ui'
import { useConfirmacao } from '../Confirmacao'
import { db, auditar, type Bloqueio, type Contato, type Empresa, type Mensagem } from '../../lib/prospeccaoDb'
import { motivoNaoAprovar, temHtml } from '../../lib/prospeccao'
import { ChipClasse } from './Empresas'

type Item = Mensagem & { empresa: Empresa | null; contato: Contato | null }

// Fila de aprovacao: aprovar so muda o status (o gatilho do banco grava quem e quando). NAO envia: o envio e da Parte B.
export default function FilaAprovacao() {
  const [itens, setItens] = useState<Item[] | null>(null)
  const [bloqueios, setBloqueios] = useState<Bloqueio[]>([])
  const [aprovados, setAprovados] = useState(0)
  const [editando, setEditando] = useState<Item | null>(null)
  const { confirmacao, rodar, ocupado } = useConfirmacao()

  const carregar = useCallback(async () => {
    const [m, b, a] = await Promise.all([
      db.from('prospeccao_mensagens').select('*, empresa:prospeccao_empresas(*), contato:prospeccao_contatos(*)').eq('status', 'rascunho').order('criado_em').limit(300),
      db.from('prospeccao_bloqueio').select('*'),
      db.from('prospeccao_mensagens').select('id', { count: 'exact', head: true }).eq('status', 'aprovado'),
    ])
    setItens((m.data ?? []) as Item[])
    setBloqueios((b.data ?? []) as Bloqueio[])
    setAprovados(a.count ?? 0)
  }, [])
  useEffect(() => { void carregar() }, [carregar])

  const mudar = (i: Item, status: 'aprovado' | 'descartado') =>
    rodar(status === 'aprovado' ? 'Mensagem aprovada (ainda não enviada).' : 'Mensagem descartada.', async () => {
      if (status === 'aprovado') {
        const motivo = motivoNaoAprovar(i.contato, bloqueios)
        if (motivo) throw new Error(`Não dá para aprovar: ${motivo}`)
      }
      const { error } = await db.from('prospeccao_mensagens').update({ status }).eq('id', i.id).eq('status', 'rascunho')
      if (error) throw new Error(error.message)
      await carregar()
    })

  return (
    <div className="flex flex-col gap-3">
      {confirmacao}
      <Aviso tipo="info">Aprovar <b>não envia</b>: só libera a mensagem. <b>{aprovados}</b> aprovada(s) aguardando envio.</Aviso>
      {itens === null ? <div className="text-sm text-[color:var(--rbr-muted)]">Carregando…</div> : itens.length === 0 ? (
        <Card><Vazio>Nenhum rascunho esperando aprovação. Gere o 1º toque na aba Empresas.</Vazio></Card>
      ) : itens.map((i) => {
        const motivo = motivoNaoAprovar(i.contato, bloqueios)
        return (
          <Card key={i.id}>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <b className="text-sm">{i.empresa?.nome_fantasia || i.empresa?.razao_social}</b>
              {i.empresa && <ChipClasse classe={i.empresa.classe} pontos={i.empresa.pontuacao} />}
              <span className="text-xs text-[color:var(--rbr-muted)]">Toque {i.toque} · para {i.contato?.email ?? '—'}</span>
            </div>
            <div className="text-xs font-bold mb-1">Assunto: {i.assunto}</div>
            <pre className="text-xs whitespace-pre-wrap font-sans border rounded-lg p-3 bg-[#fafbfe]" style={{ borderColor: 'var(--rbr-border)' }}>{i.corpo}</pre>
            {motivo && <div className="mt-2"><Aviso tipo="atencao">Não dá para aprovar: {motivo}</Aviso></div>}
            <div className="flex gap-2 justify-end mt-3">
              <Botao variante="perigo" disabled={ocupado} onClick={() => void mudar(i, 'descartado')}>Descartar</Botao>
              <Botao variante="secundario" disabled={ocupado} onClick={() => setEditando(i)}>Editar</Botao>
              <Botao disabled={ocupado || !!motivo} onClick={() => void mudar(i, 'aprovado')}>Aprovar</Botao>
            </div>
          </Card>
        )
      })}
      {editando && <Editar item={editando} onFechar={() => setEditando(null)} onSalvo={carregar} />}
    </div>
  )
}

function Editar({ item, onFechar, onSalvo }: { item: Item; onFechar: () => void; onSalvo: () => Promise<void> }) {
  const [assunto, setAssunto] = useState(item.assunto)
  const [corpo, setCorpo] = useState(item.corpo)
  const { confirmacao, rodar, ocupado } = useConfirmacao()
  return (
    <Modal titulo="Editar mensagem" onFechar={onFechar} fecharNoFundo={false}>
      {confirmacao}
      <Campo label="Assunto"><input className={inputClass} style={inputStyle} value={assunto} onChange={(e) => setAssunto(e.target.value)} /></Campo>
      <Campo label="Corpo (texto puro, sem HTML)"><textarea className={inputClass} style={inputStyle} rows={16} value={corpo} onChange={(e) => setCorpo(e.target.value)} /></Campo>
      <div className="flex justify-end gap-2">
        <Botao variante="secundario" onClick={onFechar}>Cancelar</Botao>
        <Botao disabled={ocupado} onClick={() => void rodar('Mensagem editada.', async () => {
          if (!assunto.trim() || !corpo.trim()) throw new Error('Assunto e corpo não podem ficar vazios.')
          if (temHtml(assunto) || temHtml(corpo)) throw new Error('Use só texto puro: sem HTML.')
          const { error } = await db.from('prospeccao_mensagens').update({ assunto: assunto.trim(), corpo }).eq('id', item.id).eq('status', 'rascunho')
          if (error) throw new Error(error.message)
          await auditar('prospeccao_mensagem_editada', { mensagem_id: item.id })
          await onSalvo()
          onFechar()
        })}>Salvar</Botao>
      </div>
    </Modal>
  )
}
