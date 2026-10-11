import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { formatarDoc } from '@rbr/shared/documento'
import { Aviso, Botao, Campo, Card, Carregando, Modal, Vazio, inputClass, inputStyle } from '../financeiro/ui'
import { useConfirmacao } from '../Confirmacao'

// Tarefa 8: conferência manual do contrato do agenciador assinado no gov.br, suspensão e reativação.

type Agenciador = {
  id: string
  nome: string
  cpf: string | null
  cnpj: string | null
  status_contrato_agenciador: string
  status_contrato_motivo: string | null
  responsavel_nome: string | null
  responsavel_cpf: string | null
  nivel_confianca: string
}
type Envio = {
  id: string
  agenciador_id: string
  versao: number
  arquivo_path: string
  hash_sha256: string
  enviado_em: string
  status: 'enviado' | 'validado' | 'recusado'
  motivo: string | null
  validado_em: string | null
}

export const STATUS_CONTRATO_LABEL: Record<string, { t: string; bg: string; c: string }> = {
  sem_contrato: { t: 'Sem contrato', bg: '#FBE9E9', c: 'var(--rbr-danger)' },
  aguardando_assinatura: { t: 'Aguardando assinatura', bg: '#FDF1DC', c: '#8A5A00' },
  assinado_enviado: { t: 'Assinado: conferir', bg: '#EEF1F8', c: 'var(--rbr-navy)' },
  validado: { t: 'Validado', bg: '#E7F5EC', c: 'var(--rbr-positive)' },
  recusado: { t: 'Recusado', bg: '#FBE9E9', c: 'var(--rbr-danger)' },
  suspenso: { t: 'Suspenso', bg: '#FBE9E9', c: 'var(--rbr-danger)' },
}

export function SeloContrato({ status }: { status: string | null | undefined }) {
  const s = STATUS_CONTRATO_LABEL[status ?? 'sem_contrato'] ?? STATUS_CONTRATO_LABEL.sem_contrato
  return (
    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: s.bg, color: s.c }}>
      {s.t}
    </span>
  )
}

export default function ContratosAgenciador() {
  const [ags, setAgs] = useState<Agenciador[] | null>(null)
  const [envios, setEnvios] = useState<Envio[]>([])
  const [vigente, setVigente] = useState<number | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [conferindo, setConferindo] = useState<Envio | null>(null)
  const [acao, setAcao] = useState<{ a: Agenciador; tipo: 'suspender' | 'reativar' | 'responsavel' } | null>(null)
  const { confirmacao, mostrar } = useConfirmacao()

  const carregar = useCallback(async () => {
    const [p, e, t] = await Promise.all([
      supabase.from('pessoas').select('*').eq('papel', 'agenciador').is('deleted_at', null).order('nome'),
      supabase.from('contratos_agenciador').select('*').order('enviado_em', { ascending: false }),
      supabase.from('termos_contrato').select('versao').eq('tipo', 'agenciador').eq('status', 'publicado').maybeSingle(),
    ])
    const err = p.error ?? e.error
    setErro(err ? err.message : null)
    setAgs(
      (p.data ?? []).map((x) => {
        const n = x
        return {
          id: x.id,
          nome: x.nome,
          cpf: x.cpf,
          cnpj: x.cnpj,
          status_contrato_agenciador: n.status_contrato_agenciador ?? 'sem_contrato',
          status_contrato_motivo: n.status_contrato_motivo ?? null,
          responsavel_nome: n.responsavel_nome ?? null,
          responsavel_cpf: n.responsavel_cpf ?? null,
          nivel_confianca: n.nivel_confianca ?? 'novo',
        }
      }),
    )
    setEnvios((e.data ?? []) as Envio[])
    setVigente((t.data as { versao: number } | null)?.versao ?? null)
  }, [])
  useEffect(() => {
    void carregar()
  }, [carregar])

  if (ags === null) return <Carregando />
  const porId = new Map(ags.map((a) => [a.id, a]))
  const pendentes = envios.filter((e) => e.status === 'enviado')

  return (
    <div className="flex flex-col gap-3">
      {erro && <Aviso>{erro}</Aviso>}
      {confirmacao}
      {vigente == null && <Aviso tipo="atencao">O contrato do agenciador ainda não foi publicado (aba Termos e contratos). Até lá ninguém consegue assinar.</Aviso>}
      <Card titulo="Contratos para conferir" acao={pendentes.length ? <span className="text-xs text-[color:var(--rbr-muted)]">{pendentes.length}</span> : undefined}>
        {pendentes.length === 0 ? (
          <div className="text-sm font-semibold text-[color:var(--rbr-positive)]">✓ Nenhum contrato aguardando conferência.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {pendentes.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-2 flex-wrap border rounded-xl p-3" style={{ borderColor: 'var(--rbr-border)' }}>
                <div className="text-sm">
                  <b>{porId.get(e.agenciador_id)?.nome ?? 'Agenciador'}</b> · versão {e.versao} · enviado {new Date(e.enviado_em).toLocaleString('pt-BR')}
                </div>
                <Botao onClick={() => setConferindo(e)}>Conferir</Botao>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card titulo="Agenciadores">
        {ags.length === 0 ? (
          <Vazio>Nenhum agenciador cadastrado.</Vazio>
        ) : (
          <div className="flex flex-col divide-y" style={{ borderColor: 'var(--rbr-border)' }}>
            {ags.map((a) => (
              <div key={a.id} className="py-2.5 flex items-center justify-between gap-3 flex-wrap" style={{ borderColor: 'var(--rbr-border)' }}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold">{a.nome}</span>
                    <SeloContrato status={a.status_contrato_agenciador} />
                  </div>
                  <div className="text-xs text-[color:var(--rbr-muted)]">
                    {a.cnpj ? `CNPJ ${formatarDoc(a.cnpj)}` : `CPF ${formatarDoc(a.cpf) || '—'}`} · assina:{' '}
                    {a.responsavel_nome ? `${a.responsavel_nome} (CPF ${formatarDoc(a.responsavel_cpf) || '—'})` : a.cnpj ? 'responsável não informado' : 'a própria pessoa'}
                    {a.status_contrato_motivo ? ` · ${a.status_contrato_motivo}` : ''}
                  </div>
                </div>
                <div className="flex gap-2 items-center">
                  {/* Tarefa 10.3: nível de confiança (só o gestor muda), com limite de valor por carga nas Regras. */}
                  <select
                    value={a.nivel_confianca}
                    title="Nível de confiança"
                    onChange={async (ev) => {
                      const nivel = ev.target.value
                      const { error } = await supabase.from('pessoas').update({ nivel_confianca: nivel }).eq('id', a.id)
                      if (error) mostrar('erro', error.message)
                      else {
                        mostrar('ok', `${a.nome}: nível "${nivel}".`)
                        void carregar()
                      }
                    }}
                    className="border rounded-lg px-2 py-1.5 text-xs bg-white"
                    style={{ borderColor: 'var(--rbr-border)' }}
                  >
                    <option value="novo">Novo</option>
                    <option value="verificado">Verificado</option>
                    <option value="restrito">Restrito</option>
                  </select>
                  <Botao variante="fantasma" onClick={() => setAcao({ a, tipo: 'responsavel' })}>
                    Responsável
                  </Botao>
                  {a.status_contrato_agenciador === 'suspenso' ? (
                    <Botao variante="secundario" onClick={() => setAcao({ a, tipo: 'reativar' })}>
                      Reativar
                    </Botao>
                  ) : (
                    <Botao variante="perigo" onClick={() => setAcao({ a, tipo: 'suspender' })}>
                      Suspender agenciador
                    </Botao>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      {conferindo && porId.get(conferindo.agenciador_id) && (
        <Conferir
          e={conferindo}
          a={porId.get(conferindo.agenciador_id)!}
          vigente={vigente}
          onFechar={() => setConferindo(null)}
          onFeito={(m) => {
            setConferindo(null)
            mostrar('ok', m)
            void carregar()
          }}
        />
      )}
      {acao && (
        <AcaoAgenciador
          {...acao}
          onFechar={() => setAcao(null)}
          onFeito={(m) => {
            setAcao(null)
            mostrar('ok', m)
            void carregar()
          }}
        />
      )}
    </div>
  )
}

function Conferir({ e, a, vigente, onFechar, onFeito }: { e: Envio; a: Agenciador; vigente: number | null; onFechar: () => void; onFeito: (m: string) => void }) {
  const [conf, setConf] = useState({ signatario_confere: false, assinatura_valida: false, versao_correta: false })
  const [motivo, setMotivo] = useState('')
  const { confirmacao, rodar, ocupado } = useConfirmacao()
  const nomeEsperado = a.responsavel_nome || a.nome
  const cpfEsperado = a.responsavel_cpf || (a.cnpj ? null : a.cpf)

  async function abrirPdf() {
    const { data, error } = await supabase.storage.from('contratos').createSignedUrl(e.arquivo_path, 600)
    if (error || !data) throw new Error('Não consegui abrir o PDF.')
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  async function decidir(aprovar: boolean) {
    const { error } = await supabase.rpc('contrato_agenciador_validar', { p_envio: e.id, p_aprovar: aprovar, p_motivo: motivo.trim(), p_conferencia: conf })
    if (error) throw new Error(error.message)
    onFeito(aprovar ? `Contrato de ${a.nome} validado: ele já pode fechar cargas.` : `Contrato de ${a.nome} recusado; ele foi avisado do motivo.`)
  }

  const item = (k: keyof typeof conf, texto: React.ReactNode) => (
    <label className="flex items-start gap-2 text-xs">
      <input type="checkbox" className="mt-0.5" checked={conf[k]} onChange={(ev) => setConf((c) => ({ ...c, [k]: ev.target.checked }))} />
      <span>{texto}</span>
    </label>
  )

  return (
    <Modal titulo={`Conferir contrato · ${a.nome}`} onFechar={ocupado ? () => {} : onFechar} largura="max-w-lg">
      <div className="flex flex-col gap-3">
        <div className="text-xs flex flex-col gap-1">
          <div>
            Versão do PDF: <b>{e.versao}</b> · versão em vigor: <b>{vigente ?? '—'}</b>
          </div>
          <div className="break-all text-[color:var(--rbr-muted)]">SHA-256 do arquivo: {e.hash_sha256}</div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Botao variante="secundario" onClick={() => void rodar('PDF aberto em outra aba.', abrirPdf)}>
            Abrir PDF assinado
          </Botao>
          <a href="https://validar.iti.gov.br" target="_blank" rel="noreferrer" className="text-xs font-bold px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--rbr-navy)', color: 'var(--rbr-navy)' }}>
            Validar em validar.iti.gov.br
          </a>
        </div>
        <div className="flex flex-col gap-2 rounded-lg p-3" style={{ background: 'var(--rbr-muted-bg)' }}>
          {item('signatario_confere', (
            <>
              O nome e o CPF de quem assinou batem com o responsável: <b>{nomeEsperado}</b>
              {cpfEsperado ? ` (CPF ${formatarDoc(cpfEsperado)})` : ' (CPF não cadastrado: confira o documento)'}
            </>
          ))}
          {item('assinatura_valida', 'A assinatura gov.br está presente e aparece como válida no validar.iti.gov.br.')}
          {item('versao_correta', `O documento é o contrato da versão ${vigente ?? '—'} (número da versão no rodapé de cada página).`)}
        </div>
        <Campo label="Motivo (obrigatório para recusar)">
          <input value={motivo} onChange={(ev) => setMotivo(ev.target.value)} className={inputClass} style={inputStyle} placeholder="Ex.: assinado por CPF diferente do responsável" />
        </Campo>
        {confirmacao}
        <div className="flex justify-end gap-2 flex-wrap">
          <Botao variante="secundario" onClick={onFechar} disabled={ocupado}>
            Voltar
          </Botao>
          <Botao variante="perigo" disabled={ocupado || !motivo.trim()} onClick={() => void rodar('', () => decidir(false))}>
            Recusar
          </Botao>
          <Botao disabled={ocupado || !(conf.signatario_confere && conf.assinatura_valida && conf.versao_correta)} onClick={() => void rodar('', () => decidir(true))}>
            {ocupado ? 'enviando…' : 'Validar contrato'}
          </Botao>
        </div>
      </div>
    </Modal>
  )
}

function AcaoAgenciador({
  a,
  tipo,
  onFechar,
  onFeito,
}: {
  a: Agenciador
  tipo: 'suspender' | 'reativar' | 'responsavel'
  onFechar: () => void
  onFeito: (m: string) => void
}) {
  const [motivo, setMotivo] = useState('')
  const [nome, setNome] = useState(a.responsavel_nome ?? '')
  const [cpf, setCpf] = useState(a.responsavel_cpf ?? '')
  const { confirmacao, rodar, ocupado } = useConfirmacao()

  async function confirmar() {
    if (tipo === 'responsavel') {
      const { error } = await supabase
        .from('pessoas')
        .update({ responsavel_nome: nome.trim() || null, responsavel_cpf: cpf.replace(/\D/g, '') || null })
        .eq('id', a.id)
      if (error) throw error
      return onFeito('Responsável pelo contrato atualizado.')
    }
    const { error } = await supabase.rpc(tipo === 'suspender' ? 'agenciador_suspender' : 'agenciador_reativar', { p_agenciador: a.id, p_motivo: motivo.trim() })
    if (error) throw new Error(error.message)
    onFeito(tipo === 'suspender' ? `${a.nome} suspenso: novas cargas travadas na hora; o histórico foi mantido.` : `${a.nome} reativado.`)
  }

  const titulo = tipo === 'suspender' ? 'Suspender agenciador' : tipo === 'reativar' ? 'Reativar agenciador' : 'Responsável que assina o contrato'
  return (
    <Modal titulo={`${titulo} · ${a.nome}`} onFechar={ocupado ? () => {} : onFechar} largura="max-w-md">
      <div className="flex flex-col gap-3">
        {tipo === 'responsavel' ? (
          <>
            <Campo label="Nome do responsável">
              <input value={nome} onChange={(e) => setNome(e.target.value)} className={inputClass} style={inputStyle} />
            </Campo>
            <Campo label="CPF do responsável">
              <input value={cpf} onChange={(e) => setCpf(e.target.value)} inputMode="numeric" className={inputClass} style={inputStyle} />
            </Campo>
          </>
        ) : (
          <>
            {tipo === 'suspender' && <Aviso tipo="atencao">Trava novas cargas imediatamente. Cargas e histórico já registrados ficam preservados.</Aviso>}
            <Campo label="Motivo (obrigatório)">
              <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className={inputClass} style={inputStyle} />
            </Campo>
          </>
        )}
        {confirmacao}
        <div className="flex justify-end gap-2">
          <Botao variante="secundario" onClick={onFechar} disabled={ocupado}>
            Voltar
          </Botao>
          <Botao
            variante={tipo === 'suspender' ? 'perigo' : 'primario'}
            disabled={ocupado || (tipo !== 'responsavel' && !motivo.trim())}
            onClick={() => void rodar('', confirmar)}
          >
            {ocupado ? 'enviando…' : titulo}
          </Botao>
        </div>
      </div>
    </Modal>
  )
}
