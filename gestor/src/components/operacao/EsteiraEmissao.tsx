import DevolverOperacao from './DevolverOperacao'
import AvisoJanelaEmissao from './AvisoJanelaEmissao'

// Painel do Fiscal (visuais Fiscal-Servico e Fiscal-Erro): esteira de emissão com o estado de cada etapa, o que deu errado e "Algo errado?".
// Só leitura do que a tela já carrega; emitir, reemitir e cancelar continuam nos cartões de documento abaixo (lógica intacta).
type Doc = { tipo: string; status: string; numero_documento?: string | null; mensagem_erro?: string | null; emitido_em?: string | null }

const ETAPAS: { tipo: string; rotulo: string; vazio: string }[] = [
  { tipo: 'cte', rotulo: 'CT-e', vazio: 'Ainda não emitido' },
  { tipo: 'atm', rotulo: 'Averbação do CT-e', vazio: 'Automática após o CT-e' },
  { tipo: 'vpo', rotulo: 'Vale-pedágio (VPO)', vazio: 'Rota sem pedágio não precisa' },
  { tipo: 'ciot', rotulo: 'CIOT', vazio: 'Ainda não emitido' },
  { tipo: 'mdfe', rotulo: 'MDF-e', vazio: 'Libera quando CIOT e VPO (se houver) estiverem emitidos' },
]

// Desfazer e prazos (visual "Fiscal-Desfazer"): consulta de quanto tempo cada etapa ainda pode ser desfeita. Texto de referência do desenho
// aprovado; os prazos legais devem ser conferidos antes de virarem trava (anotado em PENDENCIAS-PEDRO.md). Não cancela nada por si.
const PRAZOS: { etapa: string; prazo: string; tom: 'verde' | 'amarelo' | 'vermelho'; faz: string; quem: string }[] = [
  { etapa: 'MDF-e', prazo: 'até 24h', tom: 'verde', faz: 'Cancelar, se a viagem não começou. Com viagem em curso: encerrar e emitir outro.', quem: 'Fiscal' },
  { etapa: 'CIOT', prazo: '24h antes da saída', tom: 'amarelo', faz: 'Cancelar antes do início. Depois só encerrar (até 5 dias). Troca de veículo vira novo CIOT.', quem: 'Fiscal' },
  { etapa: 'Vale-pedágio', prazo: '15 dias', tom: 'amarelo', faz: 'Cancelar conforme a regra da operadora. Se a compra falhar, chamar o gestor.', quem: 'Fiscal + gestor' },
  { etapa: 'Averbação', prazo: 'com o documento', tom: 'verde', faz: 'Cancela junto com o CT-e. Falha ao cancelar: chamar o gestor.', quem: 'Fiscal' },
  { etapa: 'CT-e', prazo: 'até 7 dias', tom: 'verde', faz: 'Cancelar se não há MDF-e ativo. Passou de 7 dias: substituição ou complemento.', quem: 'Fiscal' },
  { etapa: 'CT-e fora do prazo', prazo: 'após 7 dias', tom: 'vermelho', faz: 'Não cancela. Gestor decide com a contabilidade (substituição, até 60 dias).', quem: 'Só gestor' },
]
const TOM = { verde: { bg: '#d6ecdf', fg: '#1a6b3c' }, amarelo: { bg: '#fff0d6', fg: '#7a5200' }, vermelho: { bg: '#fbe3e1', fg: '#b42318' } }

export function DesfazerEPrazos() {
  return (
    <div className="bg-white border rounded-2xl overflow-hidden" style={{ borderColor: 'var(--rbr-border)' }}>
      <div className="px-4 py-3 text-[11px] font-extrabold tracking-[0.08em]" style={{ color: 'var(--rbr-muted)', background: '#f7f8fc' }}>
        DESFAZER E PRAZOS · CADA ETAPA MOSTRA SE AINDA DÁ PARA DESFAZER
      </div>
      {PRAZOS.map((x) => (
        <div key={x.etapa} className="grid md:grid-cols-[1fr_1.1fr_3fr_1fr] gap-1 md:gap-3 px-4 py-3 items-center text-[13px]" style={{ borderTop: '1px solid #eef0f5' }}>
          <b>{x.etapa}</b>
          <span><span className="text-[11px] font-extrabold rounded-full px-2.5 py-1 whitespace-nowrap" style={{ background: TOM[x.tom].bg, color: TOM[x.tom].fg }}>{x.prazo}</span></span>
          <span style={{ color: '#4a5275' }}>{x.faz}</span>
          <span><span className="text-[11px] font-extrabold rounded-full px-2.5 py-1" style={{ background: x.quem === 'Só gestor' ? '#fbe3e1' : x.quem === 'Fiscal' ? '#eef0fa' : '#fff0d6', color: x.quem === 'Só gestor' ? '#b42318' : x.quem === 'Fiscal' ? '#1c2559' : '#7a5200' }}>{x.quem}</span></span>
        </div>
      ))}
      <div className="px-4 py-3 text-[12px] rounded-b-2xl" style={{ background: '#fbe3e1', color: '#7d1a12' }}>
        <b>Seguradora.</b> Cancelar ou trocar algo depois da averbação precisa ser comunicado (cláusulas 23 e 24). Hoje o aviso à seguradora é feito pelo gestor.
      </div>
    </div>
  )
}

// Troca de motorista e veículo (visual "Fiscal-Troca"): consulta do que o fiscal refaz em cada situação. Só texto de referência.
const TROCA_MOTORISTA = [
  { q: 'ANTES DA SAÍDA', tom: 'verde', t: 'Sem documentos emitidos', d: 'Operação troca. Nada a desfazer.' },
  { q: 'ANTES DA SAÍDA', tom: 'amarelo', t: 'Com documentos emitidos', d: 'Novo GR do motorista. CIOT: cancelar e emitir outro (TAC). MDF-e: cancelar e emitir outro. Aviso à seguradora.' },
  { q: 'EM VIAGEM', tom: 'amarelo', t: 'Mesmo veículo', d: 'Evento de inclusão de condutor no MDF-e. CIOT novo para o novo motorista. GR e seguradora antes.' },
  { q: 'TRANSBORDO', tom: 'vermelho', t: 'Outro veículo', d: 'Encerrar MDF-e e CIOT atuais, emitir novos. Só o gestor autoriza.' },
]
const TROCA_VEICULO = [
  { q: 'ANTES DA SAÍDA', tom: 'verde', t: 'Mesmo tipo e eixos', d: 'Operação troca. Atualiza MDF-e (novo), CIOT (novo) e RC-V (placa). Nível B.' },
  { q: 'ANTES DA SAÍDA', tom: 'vermelho', t: 'Tipo ou eixos diferentes', d: 'Muda piso e valor: nível A. Nova proposta e novo aceite.' },
  { q: 'CARRETA', tom: 'amarelo', t: 'Troca só da carreta', d: 'Gatilho hoje só avisa. Passa a refazer MDF-e, CIOT e RC-V.' },
  { q: 'EM VIAGEM', tom: 'vermelho', t: 'Quebra de veículo', d: 'Encerrar MDF-e e CIOT da viagem e emitir novos. Fiscal e gestor juntos.' },
]
const TOM_T = { verde: { bg: '#d6ecdf', fg: '#1a6b3c' }, amarelo: { bg: '#fff0d6', fg: '#7a5200' }, vermelho: { bg: '#fbe3e1', fg: '#b42318' } } as const

export function TrocaMotoristaVeiculo() {
  const lista = (titulo: string, itens: typeof TROCA_MOTORISTA) => (
    <div className="bg-white border rounded-2xl overflow-hidden" style={{ borderColor: 'var(--rbr-border)' }}>
      <div className="px-4 py-3 text-[11px] font-extrabold tracking-[0.08em]" style={{ color: 'var(--rbr-muted)', background: '#f7f8fc' }}>{titulo}</div>
      {itens.map((x) => (
        <div key={x.t} className="flex gap-3 px-4 py-3" style={{ borderTop: '1px solid #eef0f5' }}>
          <span className="text-[10px] font-extrabold rounded-lg px-2.5 py-1.5 h-fit w-[84px] text-center flex-shrink-0" style={{ background: TOM_T[x.tom as 'verde'].bg, color: TOM_T[x.tom as 'verde'].fg }}>{x.q}</span>
          <div className="text-[12px]" style={{ color: '#4a5275' }}>
            <div className="text-[14px] font-extrabold text-[color:var(--rbr-navy-dark)]">{x.t}</div>
            {x.d}
          </div>
        </div>
      ))}
    </div>
  )
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: 'var(--rbr-muted)' }}>TROCA DE MOTORISTA E VEÍCULO · O QUE O FISCAL REFAZ (REFERÊNCIA)</div>
      <div className="grid gap-3 lg:grid-cols-2 items-start">
        {lista('TROCA DE MOTORISTA', TROCA_MOTORISTA)}
        {lista('TROCA DE VEÍCULO', TROCA_VEICULO)}
      </div>
      <div className="bg-white border rounded-2xl px-4 py-3 text-[12px]" style={{ borderColor: 'var(--rbr-border)', color: '#4a5275' }}>
        <b>Regras para qualquer troca:</b> quem pede e quem aprova fica na trilha · GR do novo motorista ou veículo antes de seguir · aviso à seguradora · documento antigo nunca é apagado, só cancelado ou encerrado · placa no MDF-e averbado (exigência do RC-V).
      </div>
    </div>
  )
}

export default function EsteiraEmissao({ operacaoId, status, docs, onDevolvida }: { operacaoId: string; status: string; docs: Doc[]; onDevolvida: () => void }) {
  const estado = (tipo: string) => docs.find((d) => d.tipo === tipo)
  const feitas = ETAPAS.filter((e) => estado(e.tipo)?.status === 'emitido').length
  const comErro = ETAPAS.map((e) => ({ e, d: estado(e.tipo) })).filter((x) => x.d && (x.d.status === 'erro' || x.d.status === 'bloqueado'))
  return (
    <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-start">
      <div className="bg-white border rounded-2xl p-5 flex flex-col gap-2.5" style={{ borderColor: 'var(--rbr-border)' }}>
        <div className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: 'var(--rbr-muted)' }}>
          ESTEIRA DE EMISSÃO · {feitas} DE {ETAPAS.length} CONCLUÍDAS
        </div>
        {ETAPAS.map((e) => {
          const d = estado(e.tipo)
          const ok = d?.status === 'emitido'
          const erro = d?.status === 'erro' || d?.status === 'bloqueado'
          return (
            <div key={e.tipo} className="flex items-center gap-3 rounded-xl border px-3.5 py-2.5" style={{ borderColor: erro ? '#f2c4c0' : 'var(--rbr-border)', background: erro ? '#fff7f6' : ok ? '#fff' : '#fafbfd' }}>
              <span className="w-7 h-7 rounded-full inline-flex items-center justify-center text-[13px] font-extrabold flex-shrink-0" style={{ background: erro ? '#fbe3e1' : ok ? '#d6ecdf' : '#eef0f5', color: erro ? '#b42318' : ok ? '#1a6b3c' : '#8a91ad' }}>
                {erro ? '✕' : ok ? '✓' : '•'}
              </span>
              <div className="min-w-0">
                <div className="text-[14px] font-extrabold">{e.rotulo}</div>
                <div className="text-[12px]" style={{ color: erro ? '#b42318' : 'var(--rbr-muted)' }}>
                  {erro ? (d?.mensagem_erro ?? 'Rejeitado') : ok ? `${d?.numero_documento ? `nº ${d.numero_documento} · ` : ''}emitido` : d ? 'Em andamento' : e.vazio}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex flex-col gap-3.5">
        {comErro.length > 0 && (
          <div className="bg-white border rounded-2xl p-5 flex flex-col gap-2" style={{ borderColor: '#f2c4c0' }}>
            <div className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: 'var(--rbr-muted)' }}>
              O QUE DEU ERRADO
            </div>
            {comErro.map((x) => (
              <div key={x.e.tipo} className="rounded-xl px-3.5 py-3 text-[13px]" style={{ background: '#fbe3e1', color: '#7d1a12' }}>
                <b>{x.e.rotulo} com problema.</b> {x.d?.mensagem_erro ?? 'Sem mensagem do órgão.'}
              </div>
            ))}
            <div className="text-[12px]" style={{ color: 'var(--rbr-muted)' }}>
              As etapas anteriores seguem válidas. Reemitir pelo cartão do documento abaixo usa o mesmo pedido.
            </div>
          </div>
        )}
        <AvisoJanelaEmissao operacaoId={operacaoId} />
        <div className="bg-white border rounded-2xl p-5 flex flex-col gap-2" style={{ borderColor: 'var(--rbr-border)' }}>
          <div className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: 'var(--rbr-muted)' }}>
            ALGO ERRADO?
          </div>
          <div className="text-[12px]" style={{ color: 'var(--rbr-muted)' }}>
            Devolva à Operação com o motivo, ou desfaça o que já foi emitido (cancelar fica no cartão de cada documento, abaixo).
          </div>
          {status === 'aguardando_liberacao_fiscal' ? <DevolverOperacao operacaoId={operacaoId} onDevolvida={onDevolvida} /> : <div className="text-[12px]" style={{ color: '#8a91ad' }}>Devolver só aparece enquanto a operação aguarda o fiscal.</div>}
        </div>
      </div>
    </div>
  )
}
