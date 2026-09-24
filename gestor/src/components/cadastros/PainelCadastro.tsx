import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import type { Database } from '@rbr/shared/database.types'
import { BadgeAprovacao, itensDe, ListaItens } from '@rbr/shared/cadastro'
import { formatarDoc, linkWhatsApp } from '@rbr/shared/documento'
import { Aviso, Botao, inputClass, inputStyle, Modal } from '../financeiro/ui'

type Pessoa = Database['public']['Tables']['pessoas']['Row']
type Veiculo = Database['public']['Tables']['veiculos']['Row']
type Doc = Database['public']['Tables']['documentos_pessoais_imagens']['Row']
type Log = Database['public']['Tables']['auditoria_log']['Row']
type Acesso = { pessoa_id: string; tem_login: boolean; email_login: string | null; email_confirmado: boolean; ultimo_login: string | null; bloqueado: boolean }

const TIPO_DOC: Record<string, string> = { cnh: 'CNH', rg: 'RG', crlv: 'CRLV', cartao_cnpj: 'Cartão CNPJ' }
const CAMPO_LABEL: Record<string, string> = {
  nome: 'Nome', cpf: 'CPF', numero_registro: 'Nº registro', categoria: 'Categoria', validade: 'Validade', ear: 'EAR',
  placa: 'Placa', renavam: 'RENAVAM', chassi: 'Chassi', marca_modelo: 'Marca/modelo', ano: 'Ano', exercicio: 'Exercício',
  cpf_cnpj_proprietario: 'Doc. proprietário', nome_proprietario: 'Proprietário', uf: 'UF', capacidade_carga: 'Capacidade (kg)',
  cnpj: 'CNPJ', razao_social: 'Razão social', nome_fantasia: 'Nome fantasia', situacao_cadastral: 'Situação', data_emissao: 'Emitido em',
  numero_rg: 'Nº RG', data_nascimento: 'Nascimento', legivel: 'Legível', suspeita_fraude: 'Suspeita de fraude', motivo_suspeita: 'Motivo da suspeita',
}
const ACAO_LOG: Record<string, string> = {
  cadastro_alterado: 'Cadastro alterado',
  cadastro_verificacao: 'Conferência automática',
  cadastro_aprovar: 'Aprovado pelo gestor',
  cadastro_recusar: 'Recusado pelo gestor',
  cadastro_pedir_documento: 'Novo documento pedido',
  acesso_link_gerado: 'Link de acesso gerado',
  acesso_bloqueado: 'Acesso bloqueado',
  acesso_desbloqueado: 'Acesso desbloqueado',
  papel_alterado: 'Papel alterado',
}

function dataHora(v: string | null | undefined) {
  return v ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'
}
function valorCampo(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não'
  return String(v)
}

async function erroDaFuncao(error: unknown, data: { erro?: string } | null): Promise<string> {
  try {
    const corpo = await (error as { context: Response }).context.json()
    return corpo?.erro ?? 'Falha na operação.'
  } catch {
    return data?.erro ?? 'Falha na operação.'
  }
}

type Decisao = { alvo: 'pessoa' | 'veiculo'; id: string; nome: string; tipo: 'recusar' | 'pedir_documento'; docs: string[] }

// Tudo sobre um cadastro: conferência automática, documentos, veículos, condutores, acesso ao app e histórico.
export default function PainelCadastro({ pessoaId, onMudou, aninhado = false }: { pessoaId: string; onMudou?: () => void; aninhado?: boolean }) {
  const [pessoa, setPessoa] = useState<Pessoa | null>(null)
  const [veiculos, setVeiculos] = useState<Veiculo[]>([])
  const [condutores, setCondutores] = useState<Pessoa[]>([])
  const [docs, setDocs] = useState<Doc[]>([])
  const [acessos, setAcessos] = useState<Record<string, Acesso>>({})
  const [logs, setLogs] = useState<Log[]>([])
  const [nomesAtores, setNomesAtores] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<{ tipo: 'erro' | 'ok'; texto: string } | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [decisao, setDecisao] = useState<Decisao | null>(null)
  const [motivo, setMotivo] = useState('')
  const [docPedido, setDocPedido] = useState('')
  const [link, setLink] = useState<{ link: string; celular: string | null; nome: string } | null>(null)
  const [bloqueio, setBloqueio] = useState(false)
  const [motivoBloqueio, setMotivoBloqueio] = useState('')
  const [condutorAberto, setCondutorAberto] = useState<string | null>(null)
  const [verOk, setVerOk] = useState(false)
  const [verHist, setVerHist] = useState(false)

  const carregar = useCallback(async () => {
    const { data: p } = await supabase.from('pessoas').select('*').eq('id', pessoaId).maybeSingle()
    setPessoa(p ?? null)
    if (!p) return
    const titular = p.papel === 'titular_motorista'
    const [{ data: vs }, { data: cs }] = await Promise.all([
      titular ? supabase.from('veiculos').select('*').eq('titular_id', p.id).order('created_at') : Promise.resolve({ data: [] as Veiculo[] }),
      titular ? supabase.from('pessoas').select('*').eq('titular_id', p.id).eq('papel', 'condutor').order('nome') : Promise.resolve({ data: [] as Pessoa[] }),
    ])
    setVeiculos(vs ?? [])
    setCondutores(cs ?? [])
    const idsVeic = (vs ?? []).map((v) => v.id)
    const filtroDocs = idsVeic.length ? `pessoa_id.eq.${p.id},veiculo_id.in.(${idsVeic.join(',')})` : `pessoa_id.eq.${p.id}`
    const [{ data: ds }, { data: ac }, { data: lg }] = await Promise.all([
      supabase.from('documentos_pessoais_imagens').select('*').or(filtroDocs).order('created_at', { ascending: false }),
      supabase.rpc('acessos_app', { p_ids: [p.id] }),
      supabase
        .from('auditoria_log')
        .select('*')
        .in('entidade_id', [p.id, ...idsVeic])
        .order('created_at', { ascending: false })
        .limit(40),
    ])
    setDocs(ds ?? [])
    const mapa: Record<string, Acesso> = {}
    for (const a of (ac ?? []) as Acesso[]) mapa[a.pessoa_id] = a
    setAcessos(mapa)
    setLogs(lg ?? [])
    const atores = Array.from(new Set((lg ?? []).map((l) => l.pessoa_id_ator).filter(Boolean))) as string[]
    if (atores.length) {
      const { data: ns } = await supabase.from('pessoas').select('id, nome').in('id', atores)
      setNomesAtores(Object.fromEntries((ns ?? []).map((n) => [n.id, n.nome])))
    }
  }, [pessoaId])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function depois(texto: string) {
    setMsg({ tipo: 'ok', texto })
    await carregar()
    onMudou?.()
  }

  async function aprovar(alvo: 'pessoa' | 'veiculo', id: string) {
    setOcupado(true)
    setMsg(null)
    const { error } = await supabase.rpc('decidir_cadastro', { p_alvo: alvo, p_id: id, p_decisao: 'aprovar', p_motivo: null as unknown as string })
    setOcupado(false)
    if (error) return setMsg({ tipo: 'erro', texto: error.message })
    depois(alvo === 'pessoa' ? 'Cadastro aprovado.' : 'Veículo aprovado.')
  }

  async function confirmarDecisao() {
    if (!decisao) return
    if (!motivo.trim()) return setMsg({ tipo: 'erro', texto: 'Escreva o motivo — ele aparece para a pessoa no app.' })
    setOcupado(true)
    const { error } = await supabase.rpc('decidir_cadastro', {
      p_alvo: decisao.alvo,
      p_id: decisao.id,
      p_decisao: decisao.tipo,
      p_motivo: motivo.trim(),
      p_documento_tipo: (decisao.tipo === 'pedir_documento' ? (decisao.docs.length === 1 ? decisao.docs[0] : docPedido || null) : null) as unknown as string,
    })
    setOcupado(false)
    if (error) return setMsg({ tipo: 'erro', texto: error.message })
    setDecisao(null)
    setMotivo('')
    setDocPedido('')
    depois(decisao.tipo === 'recusar' ? 'Cadastro recusado. A pessoa vê o motivo no app.' : 'Pedido enviado. A pessoa vê o recado no app.')
  }

  async function reavaliar() {
    setOcupado(true)
    const { error } = await supabase.rpc('reavaliar_cadastro', { p_pessoa: pessoaId, p_aplicar: true })
    setOcupado(false)
    if (error) return setMsg({ tipo: 'erro', texto: error.message })
    depois('Conferência refeita.')
  }

  async function abrirDoc(d: Doc) {
    if (!d.arquivo_url) return setMsg({ tipo: 'erro', texto: 'Foto já removida.' })
    const { data, error } = await supabase.storage.from('documentos-pessoais').createSignedUrl(d.arquivo_url ?? '', 300)
    if (error || !data) return setMsg({ tipo: 'erro', texto: 'Não foi possível abrir a foto.' })
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  async function gerarLink(id: string) {
    setOcupado(true)
    setMsg(null)
    // O link abre o app certo (motorista ou agenciador) quando o endereço estiver em Pendências → Endereços dos apps.
    const { data: par } = await supabase.from('parametros_sistema').select('valor').eq('chave', 'urls_apps').maybeSingle()
    const urls = (par?.valor ?? {}) as Record<string, string>
    const destino = pessoa?.papel === 'agenciador' ? urls.agenciador : urls.motorista
    const { data, error } = await supabase.functions.invoke('acesso-app', {
      body: { acao: 'link_acesso', pessoa_id: id, redirect_to: destino || undefined },
    })
    setOcupado(false)
    if (error || !data?.ok) return setMsg({ tipo: 'erro', texto: await erroDaFuncao(error, data) })
    setLink({ link: data.link, celular: data.celular, nome: data.nome })
    carregar()
  }

  async function alternarBloqueio(bloquear: boolean) {
    if (!pessoa) return
    if (bloquear && !motivoBloqueio.trim()) return setMsg({ tipo: 'erro', texto: 'Informe o motivo do bloqueio.' })
    setOcupado(true)
    const { data, error } = await supabase.functions.invoke('acesso-app', {
      body: { acao: bloquear ? 'bloquear' : 'desbloquear', pessoa_id: pessoa.id, motivo: motivoBloqueio.trim() },
    })
    setOcupado(false)
    if (error || !data?.ok) return setMsg({ tipo: 'erro', texto: await erroDaFuncao(error, data) })
    setBloqueio(false)
    setMotivoBloqueio('')
    depois(bloquear ? 'Acesso bloqueado. A pessoa sai do app na próxima renovação da sessão (até 1 hora).' : 'Acesso desbloqueado.')
  }

  if (!pessoa) return <div className="text-xs text-[color:var(--rbr-muted)]">Carregando…</div>

  const itens = itensDe(pessoa.verificacao)
  const acesso = acessos[pessoa.id]
  const docsPessoa = docs.filter((d) => d.pessoa_id === pessoa.id)
  const titular = pessoa.papel === 'titular_motorista'

  const BlocoDocs = ({ lista }: { lista: Doc[] }) => (
    <div className="flex flex-col gap-2">
      {lista.length === 0 && <div className="text-xs text-[color:var(--rbr-muted)]">Nenhuma foto enviada.</div>}
      {lista.map((d) => {
        const campos = (d.campos_extraidos ?? null) as Record<string, unknown> | null
        return (
          <div
            key={d.id}
            className="rounded-lg px-3 py-2 text-xs flex flex-col gap-1.5"
            style={{ background: d.status === 'ativo' ? 'var(--rbr-muted-bg)' : '#fff', border: '1px solid var(--rbr-border)', opacity: d.status === 'ativo' ? 1 : 0.6 }}
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-bold">
                {TIPO_DOC[d.tipo] ?? d.tipo} · {dataHora(d.created_at)} {d.status !== 'ativo' ? `· substituída${d.motivo_inativacao ? ` (${d.motivo_inativacao})` : ''}` : ''}
              </span>
              <button onClick={() => abrirDoc(d)} className="font-bold underline text-[color:var(--rbr-navy)]">
                Ver foto
              </button>
            </div>
            {d.status === 'ativo' && campos && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-0.5">
                {Object.entries(campos)
                  .filter(([k]) => CAMPO_LABEL[k])
                  .map(([k, v]) => (
                    <span key={k} style={k === 'suspeita_fraude' && v === true ? { color: 'var(--rbr-danger)', fontWeight: 700 } : undefined}>
                      <span className="text-[color:var(--rbr-muted)]">{CAMPO_LABEL[k]}:</span> {valorCampo(v)}
                    </span>
                  ))}
              </div>
            )}
            {d.status === 'ativo' && !campos && <span className="text-[color:var(--rbr-muted)]">Sem leitura automática — conferir pela foto.</span>}
          </div>
        )
      })}
    </div>
  )

  return (
    <div className={`flex flex-col gap-4 ${aninhado ? '' : 'rounded-xl p-3.5'}`} style={aninhado ? undefined : { background: '#FAFBFD', border: '1px solid var(--rbr-border)' }}>
      {msg && (
        <Aviso tipo={msg.tipo} onFechar={() => setMsg(null)}>
          {msg.texto}
        </Aviso>
      )}

      {/* Situação */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">Verificação</span>
            <BadgeAprovacao status={pessoa.aprovacao_status} />
            <span className="text-[11px] text-[color:var(--rbr-muted)]">
              {pessoa.aprovacao_origem === 'manual' ? 'decisão do gestor' : pessoa.aprovacao_origem === 'automatica' ? 'automática' : ''}
              {pessoa.aprovacao_em ? ` · ${dataHora(pessoa.aprovacao_em)}` : ''}
            </span>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {pessoa.aprovacao_status !== 'aprovado' && (
              <Botao variante="primario" disabled={ocupado} onClick={() => aprovar('pessoa', pessoa.id)}>
                Aprovar
              </Botao>
            )}
            <Botao
              variante="secundario"
              disabled={ocupado}
              onClick={() => setDecisao({ alvo: 'pessoa', id: pessoa.id, nome: pessoa.nome, tipo: 'pedir_documento', docs: pessoa.tipo_pessoa_doc === 'PJ' ? ['cartao_cnpj'] : pessoa.papel === 'agenciador' ? ['cnh', 'rg'] : ['cnh'] })}
            >
              Pedir novo documento
            </Botao>
            {pessoa.aprovacao_status !== 'recusado' && (
              <Botao variante="perigo" disabled={ocupado} onClick={() => setDecisao({ alvo: 'pessoa', id: pessoa.id, nome: pessoa.nome, tipo: 'recusar', docs: [] })}>
                Recusar
              </Botao>
            )}
            <Botao variante="fantasma" disabled={ocupado} onClick={reavaliar} title="Roda a conferência automática de novo">
              Reconferir
            </Botao>
          </div>
        </div>
        {pessoa.aprovacao_motivo && (
          <div className="text-xs">
            <b>Motivo registrado:</b> {pessoa.aprovacao_motivo}
          </div>
        )}
        <ListaItens itens={itens} mostrarOk={verOk} />
        <button className="self-start text-[11px] font-semibold underline text-[color:var(--rbr-muted)]" onClick={() => setVerOk((v) => !v)}>
          {verOk ? 'Esconder itens conferidos' : 'Mostrar também os itens conferidos'}
        </button>
      </div>

      {/* Documentos */}
      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">
          Documentos · {pessoa.tipo_pessoa_doc === 'PJ' ? 'CNPJ' : 'CPF'} {formatarDoc(pessoa.cpf ?? pessoa.cnpj)}
        </span>
        <BlocoDocs lista={docsPessoa} />
      </div>

      {/* Veículos */}
      {titular && (
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">Veículos</span>
          {veiculos.length === 0 && <div className="text-xs text-[color:var(--rbr-muted)]">Nenhum veículo.</div>}
          {veiculos.map((v) => (
            <div key={v.id} className="rounded-lg p-3 flex flex-col gap-2" style={{ border: '1px solid var(--rbr-border)', background: '#fff' }}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold">{v.placa}</span>
                  <span className="text-xs text-[color:var(--rbr-muted)]">
                    {[v.tipo_veiculo, v.marca_modelo, v.ano].filter(Boolean).join(' · ')}
                    {!v.ativo ? ' · inativo' : ''}
                  </span>
                  <BadgeAprovacao status={v.aprovacao_status} />
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {v.aprovacao_status !== 'aprovado' && (
                    <Botao variante="primario" disabled={ocupado} onClick={() => aprovar('veiculo', v.id)}>
                      Aprovar veículo
                    </Botao>
                  )}
                  <Botao variante="secundario" disabled={ocupado} onClick={() => setDecisao({ alvo: 'veiculo', id: v.id, nome: v.placa, tipo: 'pedir_documento', docs: ['crlv'] })}>
                    Pedir novo CRLV
                  </Botao>
                  {v.aprovacao_status !== 'recusado' && (
                    <Botao variante="perigo" disabled={ocupado} onClick={() => setDecisao({ alvo: 'veiculo', id: v.id, nome: v.placa, tipo: 'recusar', docs: [] })}>
                      Recusar
                    </Botao>
                  )}
                </div>
              </div>
              {v.aprovacao_motivo && (
                <div className="text-xs">
                  <b>Motivo registrado:</b> {v.aprovacao_motivo}
                </div>
              )}
              <ListaItens itens={itensDe(v.verificacao)} mostrarOk={verOk} />
              <BlocoDocs lista={docs.filter((d) => d.veiculo_id === v.id)} />
            </div>
          ))}
        </div>
      )}

      {/* Condutores */}
      {titular && condutores.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">Condutores</span>
          {condutores.map((c) => (
            <div key={c.id} className="rounded-lg" style={{ border: '1px solid var(--rbr-border)', background: '#fff' }}>
              <button className="w-full text-left px-3 py-2.5 flex items-center justify-between gap-2" onClick={() => setCondutorAberto(condutorAberto === c.id ? null : c.id)}>
                <span className="text-sm font-semibold">
                  {c.nome} <span className="text-xs text-[color:var(--rbr-muted)] font-normal">· CPF {formatarDoc(c.cpf)}</span>
                </span>
                <BadgeAprovacao status={c.aprovacao_status} />
              </button>
              {condutorAberto === c.id && (
                <div className="px-3 pb-3">
                  <PainelCadastro pessoaId={c.id} onMudou={() => carregar()} aninhado />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Acesso ao app */}
      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">Acesso ao app</span>
        <div className="text-xs flex flex-wrap gap-x-4 gap-y-1">
          <span>
            Login: <b>{acesso?.tem_login ? acesso.email_login : 'ainda não tem'}</b>
          </span>
          {acesso?.tem_login && <span>Último acesso: {dataHora(acesso.ultimo_login)}</span>}
          {acesso?.bloqueado && <span style={{ color: 'var(--rbr-danger)', fontWeight: 700 }}>Bloqueado</span>}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {!acesso?.bloqueado && (
            <Botao variante="secundario" disabled={ocupado || (!acesso?.tem_login && !pessoa.email)} onClick={() => gerarLink(pessoa.id)}>
              {acesso?.tem_login ? 'Gerar link de nova senha' : 'Criar acesso e gerar link'}
            </Botao>
          )}
          {!acesso?.tem_login && !pessoa.email && <span className="text-[11px] text-[color:var(--rbr-muted)] self-center">Cadastre um e-mail para criar o acesso.</span>}
          {acesso?.bloqueado ? (
            <Botao variante="secundario" disabled={ocupado} onClick={() => alternarBloqueio(false)}>
              Desbloquear acesso
            </Botao>
          ) : (
            <Botao variante="perigo" disabled={ocupado} onClick={() => setBloqueio(true)}>
              Bloquear acesso
            </Botao>
          )}
        </div>
        {bloqueio && (
          <div className="flex gap-2 flex-wrap items-center">
            <input className={inputClass + ' max-w-md'} style={inputStyle} placeholder="Motivo do bloqueio" value={motivoBloqueio} onChange={(e) => setMotivoBloqueio(e.target.value)} />
            <Botao variante="perigo" disabled={ocupado} onClick={() => alternarBloqueio(true)}>
              Confirmar bloqueio
            </Botao>
            <Botao variante="fantasma" onClick={() => setBloqueio(false)}>
              Cancelar
            </Botao>
          </div>
        )}
      </div>

      {/* Histórico */}
      <div className="flex flex-col gap-2">
        <button className="self-start text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] underline" onClick={() => setVerHist((v) => !v)}>
          Histórico de alterações ({logs.length})
        </button>
        {verHist && (
          <div className="flex flex-col gap-1">
            {logs.length === 0 && <div className="text-xs text-[color:var(--rbr-muted)]">Sem registros.</div>}
            {logs.map((l) => {
              const depoisObj = (l.dado_depois ?? {}) as Record<string, unknown>
              const antesObj = (l.dado_antes ?? {}) as Record<string, unknown>
              const campos = Object.keys(depoisObj)
              return (
                <div key={l.id} className="text-[11px] rounded-lg px-2.5 py-1.5" style={{ background: 'var(--rbr-muted-bg)' }}>
                  <span className="font-bold">{ACAO_LOG[l.acao] ?? l.acao}</span> · {dataHora(l.created_at)} ·{' '}
                  {l.pessoa_id_ator ? nomesAtores[l.pessoa_id_ator] ?? 'usuário' : 'sistema'}
                  {campos.length > 0 && (
                    <div className="text-[color:var(--rbr-muted)]">
                      {campos
                        .map((c) => (l.acao.startsWith('cadastro_') && c in antesObj ? `${c}: ${valorCampo(antesObj[c])} → ${valorCampo(depoisObj[c])}` : `${c}: ${valorCampo(depoisObj[c])}`))
                        .join(' · ')}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {decisao && (
        <Modal titulo={decisao.tipo === 'recusar' ? `Recusar ${decisao.nome}` : `Pedir novo documento — ${decisao.nome}`} onFechar={() => setDecisao(null)} largura="max-w-lg">
          {msg?.tipo === 'erro' && <Aviso tipo="erro">{msg.texto}</Aviso>}
          {decisao.tipo === 'pedir_documento' && decisao.docs.length > 1 && (
            <select className={inputClass} style={inputStyle} value={docPedido} onChange={(e) => setDocPedido(e.target.value)}>
              <option value="">Qualquer documento enviado</option>
              {decisao.docs.map((d) => (
                <option key={d} value={d}>
                  {TIPO_DOC[d]}
                </option>
              ))}
            </select>
          )}
          <textarea
            className={inputClass + ' min-h-[90px]'}
            style={inputStyle}
            placeholder={decisao.tipo === 'recusar' ? 'Motivo da recusa (a pessoa vê no app)' : 'O que precisa ser corrigido na foto (a pessoa vê no app)'}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Botao variante="secundario" onClick={() => setDecisao(null)}>
              Cancelar
            </Botao>
            <Botao
              variante={decisao.tipo === 'recusar' ? 'perigo' : 'primario'}
              disabled={ocupado}
              onClick={confirmarDecisao}
            >
              {decisao.tipo === 'recusar' ? 'Recusar' : 'Enviar pedido'}
            </Botao>
          </div>
        </Modal>
      )}

      {link && (
        <Modal titulo={`Acesso de ${link.nome}`} onFechar={() => setLink(null)} largura="max-w-lg">
          <div className="text-xs text-[color:var(--rbr-muted)]">
            Link de uso único para criar a senha. Mande só para a própria pessoa — quem abrir o link entra na conta.
          </div>
          <input className={inputClass + ' font-mono text-[11px]'} style={inputStyle} readOnly value={link.link} onFocus={(e) => e.target.select()} />
          <div className="flex justify-end gap-2 flex-wrap">
            <Botao variante="secundario" onClick={() => navigator.clipboard?.writeText(link.link)}>
              Copiar link
            </Botao>
            {link.celular && (
              <Botao
                variante="primario"
                onClick={() =>
                  window.open(
                    linkWhatsApp(link.celular, `Olá, ${link.nome.split(' ')[0]}! Seu acesso ao app da RBR Cargo: toque no link para criar sua senha. ${link.link}`),
                    '_blank',
                    'noopener',
                  )
                }
              >
                Enviar no WhatsApp
              </Botao>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
