import { useCallback, useEffect, useState } from 'react'
import { Botao, Card, Vazio } from '../financeiro/ui'
import { db } from '../../lib/prospeccaoDb'

type Resp = {
  id: string; empresa_id: string; recebido_em: string; de_email: string | null; assunto: string | null; corpo: string | null
  classificacao: string | null; rascunho_resposta: string | null; assumido_por: string | null; tratada: boolean
}

const ROTULO: Record<string, string> = {
  cotacao: 'Cotação', preco_prazo: 'Preço/prazo', nao_sou_eu: 'Não sou eu', agora_nao: 'Agora não',
  fora_do_escritorio: 'Fora do escritório', sair: 'Sair', reclamacao: 'Reclamação', outro: 'Outro',
}

// Estrutura pronta e vazia na Parte A; o robo de leitura (Parte B) passa a preencher.
export default function Respostas() {
  const [itens, setItens] = useState<Resp[] | null>(null)
  const carregar = useCallback(async () => {
    const { data } = await db.from('prospeccao_respostas').select('*').order('recebido_em', { ascending: false }).limit(200)
    setItens((data ?? []) as Resp[])
  }, [])
  useEffect(() => { void carregar() }, [carregar])
  if (itens === null) return <div className="text-sm text-[color:var(--rbr-muted)]">Carregando…</div>
  if (itens.length === 0) return <Card><Vazio>As respostas aparecem aqui quando o envio estiver ligado.</Vazio></Card>
  return (
    <div className="flex flex-col gap-3">
      {itens.map((r) => {
        const quente = r.classificacao === 'cotacao' || r.classificacao === 'preco_prazo'
        return (
          <Card key={r.id} className={quente ? 'ring-2 ring-[color:var(--rbr-gold)]' : ''}>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {quente && <span className="text-[10.5px] font-extrabold px-2 py-0.5 rounded-full text-white" style={{ background: '#c0392b' }}>QUENTE</span>}
              <span className="text-xs font-bold">{r.classificacao ? ROTULO[r.classificacao] : 'Sem classificação'}</span>
              <span className="text-xs text-[color:var(--rbr-muted)]">{r.de_email} · {new Date(r.recebido_em).toLocaleString('pt-BR')}</span>
            </div>
            {quente && <div className="text-xs mb-1" style={{ color: '#8A5A00' }}>Atribuída ao José Carlos (cópia para o Pedro).</div>}
            <div className="text-xs font-bold">{r.assunto}</div>
            <pre className="text-xs whitespace-pre-wrap font-sans mt-1">{r.corpo}</pre>
            <textarea className="border rounded-lg px-3 py-2 text-xs w-full mt-2" style={{ borderColor: 'var(--rbr-border)' }} rows={3} placeholder="Rascunho de resposta (editável; nada é enviado automaticamente)" defaultValue={r.rascunho_resposta ?? ''} />
            <div className="flex gap-2 justify-end mt-2">
              <Botao variante="secundario" disabled title="Disponível quando o envio estiver ligado">Assumir</Botao>
              <Botao variante="secundario" disabled title="Será habilitado na Parte B">Converter em lead</Botao>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
