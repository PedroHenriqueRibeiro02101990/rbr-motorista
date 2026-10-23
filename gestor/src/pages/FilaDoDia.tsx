import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import type { Database } from '@rbr/shared/database.types'
import { formatDateTime } from '@rbr/shared/format'
import { Aviso, Botao, Campo, Card, Modal, Vazio, inputClass, inputStyle } from '../components/financeiro/ui'
import { acaoVencida, etapaDaCotacao, ordenarFila, rotuloPrazo, STATUS_LEAD_LABEL } from '../lib/crm'

// CRM comercial — Fila do dia do pré-vendedor (etapa 1/2).
// Padrões a revisar (Pedro, 23/10): pré-vendedor = gestor existente (sem papel novo); 1ª ação em até 15 min em horário
// comercial (calculada na receber-lead); lead vira oportunidade quando a cotação é criada/vinculada.
// Sem WhatsApp, ligação ou e-mail automáticos: o link do WhatsApp só abre a conversa no celular/computador.
type Lead = Database['public']['Tables']['leads']['Row']
type Interacao = Database['public']['Tables']['interacoes']['Row']
type Gestor = { id: string; nome: string }
type CotacaoMin = { id: string; status: string; cidade_origem: string | null; uf_origem: string | null; cidade_destino: string | null; uf_destino: string | null; created_at: string; cliente_id: string | null }

const TIPO_INTERACAO: Record<string, string> = { ligacao: 'Ligação', whatsapp: 'WhatsApp', email: 'E-mail', nota: 'Nota', formulario: 'Formulário' }
const agoraLocal = (minutos = 0) => {
  const d = new Date(Date.now() + minutos * 60000)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
const rota = (l: { origem_cidade: string | null; origem_uf: string | null; destino_cidade: string | null; destino_uf: string | null }) =>
  l.origem_cidade || l.destino_cidade ? `${l.origem_cidade ?? '?'}/${l.origem_uf ?? '?'} → ${l.destino_cidade ?? '?'}/${l.destino_uf ?? '?'}` : null
const linkWhatsapp = (n: string | null) => {
  const d = (n ?? '').replace(/\D/g, '')
  return d ? `https://wa.me/${d.length <= 11 ? `55${d}` : d}` : null
}

export default function FilaDoDia() {
  const [leads, setLeads] = useState<Lead[] | null>(null)
  const [gestores, setGestores] = useState<Gestor[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [aberto, setAberto] = useState<string | null>(null)
  const [contato, setContato] = useState<Lead | null>(null)
  const [vincular, setVincular] = useState<Lead | null>(null)
  const [novo, setNovo] = useState(false)
  const [agora, setAgora] = useState(() => new Date())

  const carregar = useCallback(async () => {
    const [{ data, error }, { data: g }] = await Promise.all([
      supabase.from('leads').select('*').in('status', ['novo', 'em_contato', 'qualificado', 'cotando']).limit(500),
      supabase.from('pessoas').select('id, nome').eq('papel', 'gestor_rbr').order('nome'),
    ])
    if (error) setErro(`Não consegui carregar os leads: ${error.message}`)
    setLeads(data ?? [])
    setGestores((g ?? []) as Gestor[])
    setAgora(new Date())
  }, [])
  useEffect(() => {
    void carregar()
    const t = setInterval(() => setAgora(new Date()), 60000)
    return () => clearInterval(t)
  }, [carregar])

  const fila = useMemo(() => ordenarFila(leads ?? [], agora), [leads, agora])
  const vencidas = fila.filter((l) => acaoVencida(l, agora)).length
  const semContato = fila.filter((l) => !l.primeiro_contato_em).length

  async function atualizar(id: string, patch: Database['public']['Tables']['leads']['Update']) {
    setErro(null)
    const { error } = await supabase.from('leads').update({ ...patch, atualizado_em: new Date().toISOString() }).eq('id', id)
    if (error) setErro(error.message)
    await carregar()
  }

  return (
    <div className="flex flex-col gap-4 max-w-5xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="rbr-display font-bold text-2xl text-[color:var(--rbr-navy-dark)]">Fila do dia</div>
          <div className="text-xs text-[color:var(--rbr-muted)]">
            {fila.length} lead(s) em aberto · <b style={{ color: vencidas ? 'var(--rbr-danger)' : undefined }}>{vencidas} com ação vencida</b> · {semContato} sem contato
          </div>
        </div>
        <Botao onClick={() => setNovo(true)}>+ Novo lead</Botao>
      </div>
      {erro && <Aviso onFechar={() => setErro(null)}>{erro}</Aviso>}
      {leads === null ? (
        <div className="text-sm text-[color:var(--rbr-muted)]">Carregando…</div>
      ) : fila.length === 0 ? (
        <Card>
          <Vazio>Nenhum lead em aberto. Os formulários do site entram aqui sozinhos.</Vazio>
        </Card>
      ) : (
        <div className="flex flex-col gap-2.5">
          {fila.map((l) => {
            const vencida = acaoVencida(l, agora)
            const wa = linkWhatsapp(l.whatsapp)
            return (
              <div key={l.id} className="bg-white border rounded-2xl p-4 flex flex-col gap-2" style={{ borderColor: vencida ? '#F4C9C9' : 'var(--rbr-border)' }}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="text-[15px] font-bold text-[color:var(--rbr-navy-dark)]">
                      {l.nome}
                      {l.empresa ? <span className="font-normal text-[color:var(--rbr-muted)]"> · {l.empresa}</span> : null}
                    </div>
                    <div className="text-xs text-[color:var(--rbr-muted)] flex flex-wrap gap-x-3">
                      {rota(l) && <span>{rota(l)}</span>}
                      {l.veiculo && <span>{l.veiculo}</span>}
                      {l.tipo_pessoa === 'PF' && <b style={{ color: 'var(--rbr-danger)' }}>pessoa física</b>}
                      <span>
                        {l.origem}
                        {l.utm_campaign ? ` · ${l.utm_source ?? ''} ${l.utm_campaign}` : ''}
                        {l.gclid ? ' · Google Ads' : ''}
                      </span>
                      <span>entrou {formatDateTime(l.criado_em)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {!l.primeiro_contato_em && (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full" style={{ background: 'var(--rbr-warning-bg)', color: 'var(--rbr-navy-dark)' }}>
                        sem contato
                      </span>
                    )}
                    <select
                      aria-label="Status do lead"
                      value={l.status}
                      onChange={(e) => {
                        const s = e.target.value
                        if (s === 'perdido' || s === 'descartado') {
                          const motivo = window.prompt(s === 'perdido' ? 'Motivo da perda:' : 'Motivo para descartar:')
                          if (!motivo?.trim()) return
                          void atualizar(l.id, { status: s, motivo_perda: motivo.trim() })
                        } else void atualizar(l.id, { status: s })
                      }}
                      className={inputClass}
                      style={{ ...inputStyle, width: 'auto' }}
                    >
                      {Object.entries(STATUS_LEAD_LABEL)
                        .filter(([k]) => k !== 'ganho')
                        .map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-wrap text-xs">
                  <span style={{ color: vencida ? 'var(--rbr-danger)' : 'var(--rbr-navy-dark)', fontWeight: 600 }}>
                    {l.proxima_acao ?? 'Próxima ação'} · {rotuloPrazo(l.proxima_acao_em, agora)}
                  </span>
                  <select
                    aria-label="Responsável"
                    value={l.responsavel_id ?? ''}
                    onChange={(e) => void atualizar(l.id, { responsavel_id: e.target.value || null })}
                    className={inputClass}
                    style={{ ...inputStyle, width: 'auto' }}
                  >
                    <option value="">sem responsável</option>
                    {gestores.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.nome}
                      </option>
                    ))}
                  </select>
                  {wa && (
                    <a href={wa} target="_blank" rel="noopener" className="font-semibold underline" style={{ color: 'var(--rbr-navy)' }}>
                      {l.whatsapp}
                    </a>
                  )}
                  {l.email && (
                    <a href={`mailto:${l.email}`} className="font-semibold underline" style={{ color: 'var(--rbr-navy)' }}>
                      {l.email}
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Botao onClick={() => setContato(l)}>Registrar contato</Botao>
                  <Botao variante="secundario" onClick={() => setVincular(l)}>
                    Vincular cotação
                  </Botao>
                  <button type="button" className="text-xs font-semibold underline" onClick={() => setAberto(aberto === l.id ? null : l.id)}>
                    {aberto === l.id ? 'esconder histórico' : 'histórico'}
                  </button>
                </div>
                {aberto === l.id && <Historico leadId={l.id} mensagem={l.mensagem} />}
              </div>
            )
          })}
        </div>
      )}
      {contato && <RegistrarContato lead={contato} onFechar={() => setContato(null)} onFeito={carregar} />}
      {vincular && <VincularCotacao lead={vincular} onFechar={() => setVincular(null)} onFeito={carregar} />}
      {novo && <NovoLead onFechar={() => setNovo(false)} onFeito={carregar} />}
    </div>
  )
}

function Historico({ leadId, mensagem }: { leadId: string; mensagem: string | null }) {
  const [itens, setItens] = useState<Interacao[] | null>(null)
  useEffect(() => {
    supabase
      .from('interacoes')
      .select('*')
      .eq('lead_id', leadId)
      .order('ocorreu_em', { ascending: false })
      .then(({ data }) => setItens(data ?? []))
  }, [leadId])
  return (
    <div className="rounded-xl p-3 text-xs flex flex-col gap-1.5" style={{ background: 'var(--rbr-muted-bg)' }}>
      {mensagem && <div><b>Mensagem do site:</b> {mensagem}</div>}
      {itens === null && <div>Carregando…</div>}
      {itens?.map((i) => (
        <div key={i.id}>
          <b>{TIPO_INTERACAO[i.tipo] ?? i.tipo}</b> {i.direcao === 'saida' ? '(RBR)' : '(cliente)'} · {formatDateTime(i.ocorreu_em)}
          {i.conteudo ? <span className="whitespace-pre-wrap"> — {i.conteudo}</span> : null}
        </div>
      ))}
      {itens?.length === 0 && <div>Nenhuma interação ainda.</div>}
    </div>
  )
}

function RegistrarContato({ lead, onFechar, onFeito }: { lead: Lead; onFechar: () => void; onFeito: () => Promise<void> }) {
  const [tipo, setTipo] = useState('whatsapp')
  const [conteudo, setConteudo] = useState('')
  const [proxima, setProxima] = useState('Retornar com a cotação')
  const [quando, setQuando] = useState(agoraLocal(24 * 60))
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  async function salvar() {
    setErro(null)
    setOcupado(true)
    const { data: eu } = await supabase.rpc('current_pessoa_id')
    const { error } = await supabase
      .from('interacoes')
      .insert({ lead_id: lead.id, tipo, direcao: tipo === 'nota' ? null : 'saida', conteudo: conteudo.trim() || null, autor_id: (eu as string | null) ?? null })
    if (error) {
      setOcupado(false)
      return setErro(error.message)
    }
    const { error: e2 } = await supabase
      .from('leads')
      .update({
        proxima_acao: proxima.trim() || null,
        proxima_acao_em: quando ? new Date(quando).toISOString() : null,
        atualizado_em: new Date().toISOString(),
        ...(tipo !== 'nota' && !lead.primeiro_contato_em ? { primeiro_contato_em: new Date().toISOString() } : {}),
      })
      .eq('id', lead.id)
    setOcupado(false)
    if (e2) return setErro(e2.message)
    await onFeito()
    onFechar()
  }
  return (
    <Modal titulo={`Registrar contato · ${lead.nome}`} onFechar={onFechar} largura="max-w-md">
      <div className="flex flex-col gap-3">
        <Campo label="Como foi">
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={inputClass} style={inputStyle}>
            <option value="whatsapp">WhatsApp</option>
            <option value="ligacao">Ligação</option>
            <option value="email">E-mail</option>
            <option value="nota">Nota interna</option>
          </select>
        </Campo>
        <Campo label="O que foi conversado">
          <textarea rows={3} value={conteudo} onChange={(e) => setConteudo(e.target.value)} className={inputClass} style={inputStyle} />
        </Campo>
        <Campo label="Próxima ação">
          <input value={proxima} onChange={(e) => setProxima(e.target.value)} className={inputClass} style={inputStyle} />
        </Campo>
        <Campo label="Quando">
          <input type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} className={inputClass} style={inputStyle} />
        </Campo>
        {erro && <Aviso>{erro}</Aviso>}
        <div className="flex justify-end gap-2">
          <Botao variante="secundario" onClick={onFechar}>
            Cancelar
          </Botao>
          <Botao disabled={ocupado} onClick={() => void salvar()}>
            {ocupado ? 'Salvando…' : 'Salvar'}
          </Botao>
        </div>
      </div>
    </Modal>
  )
}

function VincularCotacao({ lead, onFechar, onFeito }: { lead: Lead; onFechar: () => void; onFeito: () => Promise<void> }) {
  const [cotacoes, setCotacoes] = useState<CotacaoMin[] | null>(null)
  const [sel, setSel] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  useEffect(() => {
    supabase
      .from('cotacoes')
      .select('id, status, cidade_origem, uf_origem, cidade_destino, uf_destino, created_at, cliente_id')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => setCotacoes((data ?? []) as CotacaoMin[]))
  }, [])
  async function salvar() {
    const c = cotacoes?.find((x) => x.id === sel)
    if (!c) return setErro('Escolha a cotação.')
    setErro(null)
    setOcupado(true)
    const { data: eu } = await supabase.rpc('current_pessoa_id')
    const { error } = await supabase.from('oportunidades').insert({
      lead_id: lead.id,
      cotacao_id: c.id,
      cliente_id: c.cliente_id,
      etapa: etapaDaCotacao(c.status),
      responsavel_id: lead.responsavel_id ?? ((eu as string | null) ?? null),
    })
    if (error) {
      setOcupado(false)
      return setErro(/duplicate|unique/i.test(error.message) ? 'Essa cotação já está em outra oportunidade.' : error.message)
    }
    await supabase
      .from('leads')
      .update({ status: 'cotando', cliente_id: c.cliente_id ?? lead.cliente_id, atualizado_em: new Date().toISOString() })
      .eq('id', lead.id)
    setOcupado(false)
    await onFeito()
    onFechar()
  }
  return (
    <Modal titulo={`Vincular cotação · ${lead.nome}`} onFechar={onFechar} largura="max-w-md">
      <div className="flex flex-col gap-3">
        <div className="text-xs text-[color:var(--rbr-muted)]">Crie a cotação na tela Cotação e vincule aqui: o lead vira oportunidade e passa para “Cotando”.</div>
        <Campo label="Cotação">
          <select value={sel} onChange={(e) => setSel(e.target.value)} className={inputClass} style={inputStyle}>
            <option value="">{cotacoes === null ? 'Carregando…' : 'Escolha…'}</option>
            {cotacoes?.map((c) => (
              <option key={c.id} value={c.id}>
                {`${c.cidade_origem ?? '?'}/${c.uf_origem ?? '?'} → ${c.cidade_destino ?? '?'}/${c.uf_destino ?? '?'}`} · {c.status} · {formatDateTime(c.created_at)}
              </option>
            ))}
          </select>
        </Campo>
        {erro && <Aviso>{erro}</Aviso>}
        <div className="flex justify-end gap-2">
          <Botao variante="secundario" onClick={onFechar}>
            Cancelar
          </Botao>
          <Botao disabled={ocupado} onClick={() => void salvar()}>
            {ocupado ? 'Salvando…' : 'Vincular'}
          </Botao>
        </div>
      </div>
    </Modal>
  )
}

function NovoLead({ onFechar, onFeito }: { onFechar: () => void; onFeito: () => Promise<void> }) {
  const [f, setF] = useState({ nome: '', empresa: '', whatsapp: '', email: '', origem_cidade: '', origem_uf: '', destino_cidade: '', destino_uf: '', veiculo: '', origem: 'manual' })
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const c = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }))
  async function salvar() {
    if (!f.nome.trim()) return setErro('Informe o nome.')
    if (!f.whatsapp.trim() && !f.email.trim()) return setErro('Informe o WhatsApp ou o e-mail.')
    setErro(null)
    setOcupado(true)
    const vazio = (s: string) => s.trim() || null
    const { error } = await supabase.from('leads').insert({
      nome: f.nome.trim(),
      empresa: vazio(f.empresa),
      whatsapp: vazio(f.whatsapp),
      email: vazio(f.email),
      origem_cidade: vazio(f.origem_cidade),
      origem_uf: vazio(f.origem_uf.toUpperCase()),
      destino_cidade: vazio(f.destino_cidade),
      destino_uf: vazio(f.destino_uf.toUpperCase()),
      veiculo: vazio(f.veiculo),
      origem: f.origem,
      proxima_acao: 'Primeiro contato',
      proxima_acao_em: new Date(Date.now() + 15 * 60000).toISOString(),
    })
    setOcupado(false)
    if (error) return setErro(error.message)
    await onFeito()
    onFechar()
  }
  return (
    <Modal titulo="Novo lead" onFechar={onFechar} largura="max-w-lg">
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Nome" className="col-span-2">
          <input value={f.nome} onChange={c('nome')} className={inputClass} style={inputStyle} />
        </Campo>
        <Campo label="Empresa">
          <input value={f.empresa} onChange={c('empresa')} className={inputClass} style={inputStyle} />
        </Campo>
        <Campo label="Veio por">
          <select value={f.origem} onChange={c('origem')} className={inputClass} style={inputStyle}>
            <option value="manual">Contato direto</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="indicacao">Indicação</option>
            <option value="outro">Outro</option>
          </select>
        </Campo>
        <Campo label="WhatsApp">
          <input value={f.whatsapp} onChange={c('whatsapp')} inputMode="tel" className={inputClass} style={inputStyle} />
        </Campo>
        <Campo label="E-mail">
          <input value={f.email} onChange={c('email')} type="email" className={inputClass} style={inputStyle} />
        </Campo>
        <Campo label="Origem (cidade)">
          <input value={f.origem_cidade} onChange={c('origem_cidade')} className={inputClass} style={inputStyle} />
        </Campo>
        <Campo label="UF">
          <input value={f.origem_uf} onChange={c('origem_uf')} maxLength={2} className={inputClass} style={inputStyle} />
        </Campo>
        <Campo label="Destino (cidade)">
          <input value={f.destino_cidade} onChange={c('destino_cidade')} className={inputClass} style={inputStyle} />
        </Campo>
        <Campo label="UF">
          <input value={f.destino_uf} onChange={c('destino_uf')} maxLength={2} className={inputClass} style={inputStyle} />
        </Campo>
        <Campo label="Veículo" className="col-span-2">
          <input value={f.veiculo} onChange={c('veiculo')} className={inputClass} style={inputStyle} />
        </Campo>
        {erro && (
          <div className="col-span-2">
            <Aviso>{erro}</Aviso>
          </div>
        )}
        <div className="col-span-2 flex justify-end gap-2">
          <Botao variante="secundario" onClick={onFechar}>
            Cancelar
          </Botao>
          <Botao disabled={ocupado} onClick={() => void salvar()}>
            {ocupado ? 'Salvando…' : 'Criar lead'}
          </Botao>
        </div>
      </div>
    </Modal>
  )
}
