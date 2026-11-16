import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { Botao, Card, Chips, Vazio } from '../financeiro/ui'
import { useConfirmacao } from '../Confirmacao'
import { db, auditar, type Empresa, type Mensagem } from '../../lib/prospeccaoDb'
import { linkWhatsapp, modeloPendente, preencher } from '../../lib/prospeccao'

type Resp = {
  id: string; empresa_id: string; recebido_em: string; de_email: string | null; assunto: string | null; corpo: string | null
  classificacao: string | null; rascunho_resposta: string | null; assumido_por: string | null; assumido_em: string | null; tratada: boolean
  empresa: Pick<Empresa, 'id' | 'razao_social' | 'nome_fantasia' | 'cnpj' | 'telefone' | 'lead_id' | 'cidade' | 'uf'> | null
}
const ROTULO: Record<string, string> = {
  cotacao: 'Cotação', preco_prazo: 'Preço/prazo', nao_sou_eu: 'Não sou eu', agora_nao: 'Agora não',
  fora_do_escritorio: 'Fora do escritório', sair: 'Sair', reclamacao: 'Reclamação', outro: 'Outro',
}
const MODELO_DA_CLASSE: Record<string, string> = { sair: 'resp_sair', agora_nao: 'resp_agora_nao', nao_sou_eu: 'resp_indicacao' }
const quente = (r: Resp) => r.classificacao === 'cotacao' || r.classificacao === 'preco_prazo'
type Filtro = 'todas' | 'quentes' | 'tratar' | 'tratadas'

export default function Respostas() {
  const [itens, setItens] = useState<Resp[] | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('quentes')
  const [aberta, setAberta] = useState<string | null>(null)
  const [conversa, setConversa] = useState<{ quando: string; quem: string; texto: string }[]>([])
  const [modelos, setModelos] = useState<Record<string, { assunto: string; corpo: string; ativo: boolean }>>({})
  const [rascunho, setRascunho] = useState<Record<string, string>>({})
  const { confirmacao, rodar, ocupado } = useConfirmacao()

  const carregar = useCallback(async () => {
    const [r, m] = await Promise.all([
      db.from('prospeccao_respostas').select('*, empresa:prospeccao_empresas(id, razao_social, nome_fantasia, cnpj, telefone, lead_id, cidade, uf)').order('recebido_em', { ascending: false }).limit(300),
      db.from('prospeccao_modelos').select('tipo, assunto, corpo, ativo'),
    ])
    setItens((r.data ?? []) as Resp[])
    setModelos(Object.fromEntries(((m.data ?? []) as { tipo: string; assunto: string; corpo: string; ativo: boolean }[]).map((x) => [x.tipo, x])))
  }, [])
  useEffect(() => { void carregar() }, [carregar])

  async function abrir(r: Resp) {
    setAberta(aberta === r.id ? null : r.id)
    const [enviadas, recebidas] = await Promise.all([
      db.from('prospeccao_mensagens').select('toque, assunto, corpo, enviado_em, criado_em, status').eq('empresa_id', r.empresa_id).eq('status', 'enviado'),
      db.from('prospeccao_respostas').select('recebido_em, de_email, corpo').eq('empresa_id', r.empresa_id),
    ])
    const lista = [
      ...((enviadas.data ?? []) as Mensagem[]).map((m) => ({ quando: m.enviado_em ?? m.criado_em, quem: `RBR (toque ${m.toque})`, texto: m.corpo })),
      ...((recebidas.data ?? []) as { recebido_em: string; de_email: string; corpo: string }[]).map((x) => ({ quando: x.recebido_em, quem: x.de_email, texto: x.corpo })),
    ].sort((a, b) => a.quando.localeCompare(b.quando))
    setConversa(lista)
  }
  async function minhaPessoa(): Promise<string> {
    const { data: u } = await supabase.auth.getUser()
    const { data } = await db.from('pessoas').select('id').eq('auth_user_id', u.user?.id ?? '').maybeSingle()
    if (!data) throw new Error('Não identifiquei seu usuário.')
    return (data as { id: string }).id
  }
  const atualizar = (id: string, patch: Record<string, unknown>) => async () => {
    const { error } = await db.from('prospeccao_respostas').update(patch).eq('id', id)
    if (error) throw new Error(error.message)
    await carregar()
  }
  async function converter(r: Resp) {
    await rodar('Lead criado na Fila do dia.', async () => {
      if (!r.empresa) throw new Error('Empresa não encontrada.')
      if (r.empresa.lead_id) throw new Error('Esta empresa já virou lead.')
      const pessoa = await minhaPessoa()
      const { data: lead, error } = await db.from('leads').insert({
        nome: r.empresa.nome_fantasia || r.empresa.razao_social, empresa: r.empresa.razao_social, cnpj: r.empresa.cnpj, tipo_pessoa: 'PJ',
        whatsapp: r.empresa.telefone, email: r.de_email, origem_cidade: r.empresa.cidade, origem_uf: r.empresa.uf,
        mensagem: (r.corpo ?? '').slice(0, 1000), origem: 'prospeccao', responsavel_id: r.assumido_por ?? pessoa,
      }).select('id').single()
      if (error) throw new Error(error.message)
      const leadId = (lead as { id: string }).id
      await db.from('interacoes').insert({ lead_id: leadId, tipo: 'email', direcao: 'entrada', ocorreu_em: r.recebido_em, conteudo: `Resposta à prospecção ativa: ${(r.corpo ?? '').slice(0, 2000)}`, autor_id: pessoa })
      await db.from('prospeccao_empresas').update({ lead_id: leadId }).eq('id', r.empresa_id)
      await db.from('prospeccao_respostas').update({ tratada: true, assumido_por: r.assumido_por ?? pessoa, assumido_em: r.assumido_em ?? new Date().toISOString() }).eq('id', r.id)
      await auditar('prospeccao_convertido_em_lead', { empresa_id: r.empresa_id, lead_id: leadId })
      await carregar()
    })
  }

  if (itens === null) return <div className="text-sm text-[color:var(--rbr-muted)]">Carregando…</div>
  const lista = itens.filter((r) => filtro === 'todas' || (filtro === 'quentes' && quente(r) && !r.tratada) || (filtro === 'tratar' && !r.tratada) || (filtro === 'tratadas' && r.tratada))
  return (
    <div className="flex flex-col gap-3">
      {confirmacao}
      <Chips<Filtro> valor={filtro} onChange={setFiltro} opcoes={[
        { valor: 'quentes', label: 'Quentes', qtd: itens.filter((r) => quente(r) && !r.tratada).length },
        { valor: 'tratar', label: 'Para tratar', qtd: itens.filter((r) => !r.tratada).length },
        { valor: 'tratadas', label: 'Tratadas' }, { valor: 'todas', label: 'Todas' },
      ]} />
      {itens.length === 0 ? <Card><Vazio>As respostas aparecem aqui quando o envio estiver ligado.</Vazio></Card>
        : lista.length === 0 ? <Card><Vazio>Nada neste filtro.</Vazio></Card>
        : lista.map((r) => {
          const wa = linkWhatsapp(r.empresa?.telefone)
          const mod = r.classificacao ? modelos[MODELO_DA_CLASSE[r.classificacao] ?? ''] : undefined
          const sugestao = mod && !modeloPendente(mod) ? preencher(mod.corpo, { empresa: r.empresa?.nome_fantasia ?? '', nome: '', cidade: r.empresa?.cidade ?? '', segmento_legivel: '', segmento_frase: '', veiculo: '' }) : ''
          return (
            <Card key={r.id} className={quente(r) ? 'ring-2 ring-[color:var(--rbr-gold)]' : ''}>
              <div className="flex items-center gap-2 flex-wrap mb-1 cursor-pointer" onClick={() => void abrir(r)}>
                {quente(r) && <span className="text-[10.5px] font-extrabold px-2 py-0.5 rounded-full text-white" style={{ background: '#c0392b' }}>QUENTE</span>}
                <b className="text-sm">{r.empresa?.nome_fantasia || r.empresa?.razao_social}</b>
                <span className="text-xs font-bold">{r.classificacao ? ROTULO[r.classificacao] : 'Sem classificação'}</span>
                <span className="text-xs text-[color:var(--rbr-muted)]">{r.de_email} · {new Date(r.recebido_em).toLocaleString('pt-BR')}</span>
                {r.tratada && <span className="text-xs font-bold" style={{ color: '#1a6b3c' }}>✓ tratada</span>}
              </div>
              {quente(r) && !r.assumido_por && <div className="text-xs mb-1" style={{ color: '#8A5A00' }}>Atribuída ao José Carlos (cópia para o Pedro). Ninguém assumiu ainda.</div>}
              {r.assumido_por && <div className="text-xs mb-1 text-[color:var(--rbr-muted)]">Assumida em {new Date(r.assumido_em ?? r.recebido_em).toLocaleString('pt-BR')}</div>}
              <pre className="text-xs whitespace-pre-wrap font-sans">{(r.corpo ?? '').slice(0, 1200)}</pre>
              {aberta === r.id && (
                <div className="mt-2 border-t pt-2 flex flex-col gap-2" style={{ borderColor: '#eef0f5' }}>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">Conversa com a empresa</div>
                  {conversa.map((c, i) => (
                    <div key={i} className="text-xs"><b>{c.quem}</b> · {new Date(c.quando).toLocaleString('pt-BR')}<pre className="whitespace-pre-wrap font-sans text-[color:var(--rbr-muted)]">{c.texto.slice(0, 1500)}</pre></div>
                  ))}
                  <textarea className="border rounded-lg px-3 py-2 text-xs w-full" style={{ borderColor: 'var(--rbr-border)' }} rows={4}
                    placeholder="Rascunho de resposta (editável; nada é enviado automaticamente)" value={rascunho[r.id] ?? r.rascunho_resposta ?? sugestao}
                    onChange={(e) => setRascunho({ ...rascunho, [r.id]: e.target.value })} />
                  <div className="flex justify-end"><Botao variante="secundario" disabled={ocupado} onClick={() => void rodar('Rascunho salvo.', atualizar(r.id, { rascunho_resposta: rascunho[r.id] ?? r.rascunho_resposta ?? sugestao }))}>Salvar rascunho</Botao></div>
                </div>
              )}
              <div className="flex gap-2 justify-end mt-2 flex-wrap">
                {wa && <a href={wa} target="_blank" rel="noreferrer" className="text-xs font-bold px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--rbr-border)', color: 'var(--rbr-navy-dark)' }}>WhatsApp</a>}
                <Botao variante="secundario" disabled={ocupado || !!r.assumido_por} onClick={() => void rodar('Você assumiu esta resposta.', async () => { const p = await minhaPessoa(); await atualizar(r.id, { assumido_por: p, assumido_em: new Date().toISOString() })() })}>Assumir</Botao>
                <Botao variante="secundario" disabled={ocupado || r.tratada} onClick={() => void rodar('Marcada como tratada.', atualizar(r.id, { tratada: true }))}>Marcar tratada</Botao>
                <Botao disabled={ocupado || !!r.empresa?.lead_id} onClick={() => void converter(r)}>{r.empresa?.lead_id ? 'Já é lead' : 'Converter em lead'}</Botao>
              </div>
            </Card>
          )
        })}
    </div>
  )
}
