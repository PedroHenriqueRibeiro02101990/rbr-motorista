import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import type { Database } from '@rbr/shared/database.types'
import { BadgeAprovacao, itensDe } from '@rbr/shared/cadastro'
import { formatarDoc, linkWhatsApp } from '@rbr/shared/documento'
import { Aviso, Botao, Card, inputClass, inputStyle, Kpi, Modal, Vazio } from '../financeiro/ui'
import PainelCadastro from './PainelCadastro'

type Pessoa = Database['public']['Tables']['pessoas']['Row']
type Veiculo = Database['public']['Tables']['veiculos']['Row']
type Vinculo = Database['public']['Tables']['vinculos_agenciador_motorista']['Row']
type Pedido = Database['public']['Tables']['solicitacoes_exclusao_dados']['Row']

const PAPEL: Record<string, string> = { titular_motorista: 'Motorista', condutor: 'Condutor', agenciador: 'Agenciador' }

function dias(desde: string) {
  return Math.floor((Date.now() - new Date(desde).getTime()) / 86400000)
}
function problemas(p: { verificacao: unknown }) {
  return itensDe(p.verificacao).filter((i) => i.nivel === 'atencao' || i.nivel === 'bloqueio' || i.nivel === 'pendente')
}

function Linha({
  titulo,
  sub,
  badge,
  aberto,
  onToggle,
  children,
}: {
  titulo: string
  sub: string
  badge?: React.ReactNode
  aberto: boolean
  onToggle: () => void
  children?: React.ReactNode
}) {
  return (
    <div className="border rounded-[14px] bg-white overflow-hidden" style={{ borderColor: 'var(--rbr-border)' }}>
      <button className="w-full text-left px-3.5 py-3 flex items-start justify-between gap-3" onClick={onToggle}>
        <div className="min-w-0">
          <div className="text-sm font-bold truncate">{titulo}</div>
          <div className="text-xs text-[color:var(--rbr-muted)]">{sub}</div>
        </div>
        {badge}
      </button>
      {aberto && <div className="px-3.5 pb-3.5">{children}</div>}
    </div>
  )
}

// Tudo o que espera a RBR: cadastros que a conferência automática não conseguiu liberar,
// vínculos pedidos por agenciadores e pedidos de exclusão de dados (LGPD).
export default function Pendencias({ onContagem }: { onContagem?: (n: number) => void }) {
  const [emAnalise, setEmAnalise] = useState<Pessoa[]>([])
  const [veicAnalise, setVeicAnalise] = useState<(Veiculo & { titular?: Pessoa })[]>([])
  const [aguardando, setAguardando] = useState<Pessoa[]>([])
  const [recusados, setRecusados] = useState<Pessoa[]>([])
  const [vinculos, setVinculos] = useState<Vinculo[]>([])
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [nomes, setNomes] = useState<Record<string, Pessoa>>({})
  const [kpi, setKpi] = useState({ novos7: 0, auto7: 0, aprov7: 0 })
  const [aberto, setAberto] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ tipo: 'erro' | 'ok'; texto: string } | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [executar, setExecutar] = useState<Pedido | null>(null)
  const [resposta, setResposta] = useState<{ texto: string; celular: string | null; nome: string } | null>(null)
  const [urls, setUrls] = useState<{ motorista: string; agenciador: string; gestor: string }>({ motorista: '', agenciador: '', gestor: '' })
  const [editUrls, setEditUrls] = useState(false)
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    const semana = new Date(Date.now() - 7 * 86400000).toISOString()
    const mes = new Date(Date.now() - 30 * 86400000).toISOString()
    const papeis: Database['public']['Enums']['papel_pessoa'][] = ['titular_motorista', 'condutor', 'agenciador']
    const [a, v, g, r, vi, pe, novos, par] = await Promise.all([
      supabase.from('pessoas').select('*').in('papel', papeis).eq('status', 'ativo').eq('aprovacao_status', 'em_analise').order('updated_at'),
      supabase.from('veiculos').select('*').eq('ativo', true).eq('aprovacao_status', 'em_analise').order('updated_at'),
      supabase.from('pessoas').select('*').in('papel', papeis).eq('status', 'ativo').eq('aprovacao_status', 'aguardando_documentos').order('created_at', { ascending: false }).limit(200),
      supabase.from('pessoas').select('*').in('papel', papeis).eq('status', 'ativo').eq('aprovacao_status', 'recusado').gte('updated_at', mes).order('updated_at', { ascending: false }),
      supabase.from('vinculos_agenciador_motorista').select('*').eq('status', 'reivindicado').order('created_at'),
      supabase.from('solicitacoes_exclusao_dados').select('*').eq('status', 'processando').order('solicitado_em'),
      supabase.from('pessoas').select('id, aprovacao_status, aprovacao_origem').in('papel', papeis).gte('created_at', semana),
      supabase.from('parametros_sistema').select('valor').eq('chave', 'urls_apps').maybeSingle(),
    ])
    const veics = v.data ?? []
    const ids = new Set<string>()
    veics.forEach((x) => ids.add(x.titular_id))
    ;(vi.data ?? []).forEach((x) => {
      ids.add(x.agenciador_id)
      ids.add(x.motorista_id)
    })
    ;(pe.data ?? []).forEach((x) => x.pessoa_id && ids.add(x.pessoa_id))
    let mapa: Record<string, Pessoa> = {}
    if (ids.size) {
      const { data } = await supabase.from('pessoas').select('*').in('id', Array.from(ids))
      mapa = Object.fromEntries((data ?? []).map((p) => [p.id, p]))
    }
    setNomes(mapa)
    setEmAnalise(a.data ?? [])
    setVeicAnalise(veics.map((x) => ({ ...x, titular: mapa[x.titular_id] })))
    setAguardando(g.data ?? [])
    setRecusados(r.data ?? [])
    setVinculos(vi.data ?? [])
    setPedidos(pe.data ?? [])
    const n = novos.data ?? []
    setKpi({
      novos7: n.length,
      aprov7: n.filter((x) => x.aprovacao_status === 'aprovado').length,
      auto7: n.filter((x) => x.aprovacao_status === 'aprovado' && x.aprovacao_origem === 'automatica').length,
    })
    const u = (par.data?.valor ?? {}) as Record<string, string>
    setUrls({ motorista: u.motorista ?? '', agenciador: u.agenciador ?? '', gestor: u.gestor ?? '' })
    onContagem?.((a.data?.length ?? 0) + veics.length + (vi.data?.length ?? 0) + (pe.data?.length ?? 0))
    setCarregando(false)
  }, [onContagem])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function decidirVinculo(v: Vinculo, confirmar: boolean) {
    setOcupado(true)
    const { error } = await supabase
      .from('vinculos_agenciador_motorista')
      .update({ status: confirmar ? 'confirmado' : 'rejeitado', resolvido_em: new Date().toISOString() })
      .eq('id', v.id)
    setOcupado(false)
    if (error) return setMsg({ tipo: 'erro', texto: error.message })
    setMsg({ tipo: 'ok', texto: confirmar ? 'Vínculo confirmado.' : 'Vínculo rejeitado.' })
    carregar()
  }

  async function executarExclusao() {
    if (!executar) return
    const titular = executar.pessoa_id ? nomes[executar.pessoa_id] : null
    setOcupado(true)
    const { data, error } = await supabase.functions.invoke('acesso-app', { body: { acao: 'executar_exclusao', solicitacao_id: executar.id } })
    setOcupado(false)
    if (error || !data?.ok) {
      let texto = 'Não foi possível executar.'
      try {
        texto = (await (error as unknown as { context: Response }).context.json())?.erro ?? texto
      } catch {
        texto = data?.erro ?? texto
      }
      return setMsg({ tipo: 'erro', texto })
    }
    setExecutar(null)
    setResposta({ texto: data.resposta ?? 'Pedido atendido.', celular: titular?.celular ?? null, nome: titular?.nome ?? '' })
    if (data.avisos?.length) setMsg({ tipo: 'erro', texto: 'Concluído com avisos: ' + data.avisos.join(' · ') })
    carregar()
  }

  async function salvarUrls() {
    const limpa = (u: string) => u.trim().replace(/\/+$/, '')
    const valor = { motorista: limpa(urls.motorista), agenciador: limpa(urls.agenciador), gestor: limpa(urls.gestor) }
    const { error } = await supabase.from('parametros_sistema').update({ valor, updated_at: new Date().toISOString() }).eq('chave', 'urls_apps')
    if (error) return setMsg({ tipo: 'erro', texto: error.message })
    setEditUrls(false)
    setMsg({ tipo: 'ok', texto: 'Endereços salvos.' })
  }

  if (carregando) return <div className="text-sm text-[color:var(--rbr-muted)] py-6 text-center">Carregando…</div>

  const taxaAuto = kpi.novos7 ? Math.round((kpi.auto7 / kpi.novos7) * 100) : 0
  return (
    <div className="flex flex-col gap-4">
      {msg && (
        <Aviso tipo={msg.tipo} onFechar={() => setMsg(null)}>
          {msg.texto}
        </Aviso>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Para conferir" valor={String(emAnalise.length + veicAnalise.length)} tom={emAnalise.length + veicAnalise.length ? 'atencao' : 'bom'} />
        <Kpi label="Cadastros novos (7 dias)" valor={String(kpi.novos7)} sub={`${kpi.aprov7} aprovados`} />
        <Kpi label="Liberados sem intervenção" valor={`${taxaAuto}%`} sub="dos novos em 7 dias" tom="bom" />
        <Kpi label="Faltando documentos" valor={String(aguardando.length)} />
      </div>

      <Card titulo={`Conferir (${emAnalise.length + veicAnalise.length})`}>
        <div className="text-xs text-[color:var(--rbr-muted)] mb-3">
          A conferência automática liberou o que estava certo. Aqui ficam só os casos com algum ponto de atenção.
        </div>
        {emAnalise.length + veicAnalise.length === 0 && <Vazio>Nada para conferir agora.</Vazio>}
        <div className="flex flex-col gap-2">
          {emAnalise.map((p) => (
            <Linha
              key={p.id}
              aberto={aberto === p.id} onToggle={() => setAberto(aberto === p.id ? null : p.id)}
              titulo={p.nome}
              sub={`${PAPEL[p.papel] ?? p.papel} · ${formatarDoc(p.cpf ?? p.cnpj)} · ${problemas(p).map((i) => i.titulo).join(' · ') || 'conferir'}`}
              badge={<BadgeAprovacao status={p.aprovacao_status} />}
            >
              <PainelCadastro pessoaId={p.id} onMudou={carregar} />
            </Linha>
          ))}
          {veicAnalise.map((v) => (
            <Linha
              key={v.id}
              aberto={aberto === v.id} onToggle={() => setAberto(aberto === v.id ? null : v.id)}
              titulo={`Veículo ${v.placa} — ${v.titular?.nome ?? ''}`}
              sub={problemas(v).map((i) => i.titulo).join(' · ') || 'conferir'}
              badge={<BadgeAprovacao status={v.aprovacao_status} />}
            >
              <PainelCadastro pessoaId={v.titular_id} onMudou={carregar} />
            </Linha>
          ))}
        </div>
      </Card>

      <Card titulo={`Vínculos pedidos por agenciadores (${vinculos.length})`}>
        {vinculos.length === 0 && <Vazio>Nenhum vínculo esperando.</Vazio>}
        <div className="flex flex-col gap-2">
          {vinculos.map((v) => (
            <div key={v.id} className="flex items-center justify-between gap-3 flex-wrap border rounded-[12px] px-3.5 py-2.5 bg-white" style={{ borderColor: 'var(--rbr-border)' }}>
              <div className="text-sm">
                <b>{nomes[v.agenciador_id]?.nome ?? 'Agenciador'}</b> quer vincular <b>{nomes[v.motorista_id]?.nome ?? 'motorista'}</b>
                <div className="text-xs text-[color:var(--rbr-muted)]">
                  Pedido há {dias(v.created_at)} dia(s). O agenciador passa a ganhar comissão sobre esse motorista.
                </div>
              </div>
              <div className="flex gap-1.5">
                <Botao variante="primario" disabled={ocupado} onClick={() => decidirVinculo(v, true)}>
                  Confirmar
                </Botao>
                <Botao variante="perigo" disabled={ocupado} onClick={() => decidirVinculo(v, false)}>
                  Rejeitar
                </Botao>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card titulo={`Pedidos de exclusão de dados — LGPD (${pedidos.length})`}>
        {pedidos.length === 0 && <Vazio>Nenhum pedido em aberto.</Vazio>}
        <div className="flex flex-col gap-2">
          {pedidos.map((p) => {
            const pessoa = p.pessoa_id ? nomes[p.pessoa_id] : null
            const restante = p.prazo_limite ? Math.ceil((new Date(p.prazo_limite + 'T23:59:59').getTime() - Date.now()) / 86400000) : null
            return (
              <div key={p.id} className="flex items-center justify-between gap-3 flex-wrap border rounded-[12px] px-3.5 py-2.5 bg-white" style={{ borderColor: 'var(--rbr-border)' }}>
                <div className="text-sm">
                  <b>{pessoa?.nome ?? 'Cadastro'}</b> ({PAPEL[pessoa?.papel ?? ''] ?? pessoa?.papel ?? '—'}) pediu a exclusão em{' '}
                  {new Date(p.solicitado_em).toLocaleDateString('pt-BR')}
                  <div className="text-xs" style={{ color: restante !== null && restante < 3 ? 'var(--rbr-danger)' : 'var(--rbr-muted)' }}>
                    {restante === null ? '' : restante < 0 ? `Prazo vencido há ${-restante} dia(s)` : `Prazo: ${restante} dia(s)`}
                    {p.motivo ? ` · Motivo: ${p.motivo}` : ''}
                  </div>
                </div>
                <Botao variante="perigo" disabled={ocupado} onClick={() => setExecutar(p)}>
                  Executar exclusão
                </Botao>
              </div>
            )
          })}
        </div>
      </Card>

      <Card titulo={`Faltando documentos (${aguardando.length})`}>
        <div className="text-xs text-[color:var(--rbr-muted)] mb-3">
          Cadastros que ainda não enviaram tudo. Assim que enviarem, a conferência roda sozinha — não precisa fazer nada, só cobrar se quiser.
        </div>
        {aguardando.length === 0 && <Vazio>Ninguém faltando documento.</Vazio>}
        <div className="flex flex-col gap-2">
          {aguardando.map((p) => {
            const falta = problemas(p).filter((i) => i.nivel === 'pendente').map((i) => i.titulo)
            return (
              <Linha key={p.id} aberto={aberto === p.id} onToggle={() => setAberto(aberto === p.id ? null : p.id)} titulo={p.nome} sub={`${PAPEL[p.papel] ?? p.papel} · há ${dias(p.created_at)} dia(s) · falta: ${falta.join(', ') || 'documentos'}`} badge={<BadgeAprovacao status={p.aprovacao_status} />}>
                <div className="flex flex-col gap-3">
                  {p.celular && (
                    <a
                      className="self-start text-xs font-bold underline text-[color:var(--rbr-navy)]"
                      target="_blank"
                      rel="noopener"
                      href={linkWhatsApp(p.celular, `Olá, ${p.nome.split(' ')[0]}! Aqui é da RBR Cargo. Para liberar seu cadastro falta: ${falta.join(', ').toLowerCase() || 'enviar os documentos'}. É só abrir o app, ir em Perfil e enviar as fotos.`)}
                    >
                      Cobrar pelo WhatsApp
                    </a>
                  )}
                  <PainelCadastro pessoaId={p.id} onMudou={carregar} />
                </div>
              </Linha>
            )
          })}
        </div>
      </Card>

      <Card titulo={`Recusados nos últimos 30 dias (${recusados.length})`}>
        {recusados.length === 0 && <Vazio>Nenhum.</Vazio>}
        <div className="flex flex-col gap-2">
          {recusados.map((p) => (
            <Linha
              key={p.id}
              aberto={aberto === p.id} onToggle={() => setAberto(aberto === p.id ? null : p.id)}
              titulo={p.nome}
              sub={`${PAPEL[p.papel] ?? p.papel} · ${p.aprovacao_origem === 'manual' ? 'recusado pelo gestor' : 'recusado automaticamente'} · ${problemas(p).filter((i) => i.nivel === 'bloqueio').map((i) => i.titulo).join(' · ') || p.aprovacao_motivo || ''}`}
              badge={<BadgeAprovacao status={p.aprovacao_status} />}
            >
              <PainelCadastro pessoaId={p.id} onMudou={carregar} />
            </Linha>
          ))}
        </div>
      </Card>

      <Card
        titulo="Endereços dos apps"
        acao={
          !editUrls && (
            <Botao variante="fantasma" onClick={() => setEditUrls(true)}>
              Editar
            </Botao>
          )
        }
      >
        <div className="text-xs text-[color:var(--rbr-muted)] mb-2">
          Usados nos links de acesso e de nova senha, para abrir no app certo. Cada endereço também precisa estar em Supabase → Authentication → URL
          Configuration → Redirect URLs.
        </div>
        {editUrls ? (
          <div className="flex flex-col gap-2">
            {(['motorista', 'agenciador', 'gestor'] as const).map((k) => (
              <input
                key={k}
                className={inputClass}
                style={inputStyle}
                placeholder={`https://… (app ${k})`}
                value={urls[k]}
                onChange={(e) => setUrls({ ...urls, [k]: e.target.value })}
              />
            ))}
            <div className="flex gap-2 justify-end">
              <Botao variante="secundario" onClick={() => setEditUrls(false)}>
                Cancelar
              </Botao>
              <Botao variante="primario" onClick={salvarUrls}>
                Salvar
              </Botao>
            </div>
          </div>
        ) : (
          <div className="text-xs flex flex-col gap-0.5">
            <span>Motorista: {urls.motorista || 'não informado'}</span>
            <span>Agenciador: {urls.agenciador || 'não informado'}</span>
            <span>Gestor: {urls.gestor || 'não informado'}</span>
          </div>
        )}
      </Card>

      {executar && (
        <Modal titulo="Executar exclusão de dados" onFechar={() => setExecutar(null)} largura="max-w-lg">
          <div className="text-sm leading-relaxed">
            Cadastro: <b>{executar.pessoa_id ? nomes[executar.pessoa_id]?.nome : '—'}</b>
          </div>
          <div className="text-xs text-[color:var(--rbr-muted)] leading-relaxed">
            Vai apagar: e-mail, celular, endereço, Pix e dados bancários, fotos de documentos, histórico de alterações e o login do app. Se a pessoa
            tiver transportes ou pagamentos, nome, CPF/CNPJ, CNH/RNTRC e veículos ficam guardados pelo prazo da lei (até 11 anos), com acesso restrito.
            Se não tiver, tudo é apagado. Não dá para desfazer.
          </div>
          {msg?.tipo === 'erro' && <Aviso tipo="erro">{msg.texto}</Aviso>}
          <div className="flex justify-end gap-2">
            <Botao variante="secundario" onClick={() => setExecutar(null)}>
              Cancelar
            </Botao>
            <Botao variante="perigo" disabled={ocupado} onClick={executarExclusao}>
              {ocupado ? 'Executando…' : 'Executar agora'}
            </Botao>
          </div>
        </Modal>
      )}

      {resposta && (
        <Modal titulo="Pedido atendido — envie a resposta" onFechar={() => setResposta(null)} largura="max-w-lg">
          <div className="text-xs text-[color:var(--rbr-muted)]">A LGPD pede que a pessoa receba a confirmação do que foi apagado e do que ficou guardado.</div>
          <textarea className={inputClass + ' min-h-[140px]'} style={inputStyle} readOnly value={resposta.texto} />
          <div className="flex justify-end gap-2 flex-wrap">
            <Botao variante="secundario" onClick={() => navigator.clipboard?.writeText(resposta.texto)}>
              Copiar
            </Botao>
            {resposta.celular && (
              <Botao variante="primario" onClick={() => window.open(linkWhatsApp(resposta.celular, resposta.texto), '_blank', 'noopener')}>
                Enviar no WhatsApp
              </Botao>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
