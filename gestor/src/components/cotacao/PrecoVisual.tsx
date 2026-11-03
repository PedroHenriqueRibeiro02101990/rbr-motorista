import { formatMoney } from '@rbr/shared/format'

// Elementos do visual aprovado para a cotação (Cotacao-Formal / Margem): cartão de preço e faixa de margem.
// Só apresentação: os números vêm da composição que a própria tela já calcula (mesma conta do banco).

// Faixas de cor da margem do desenho aprovado: vermelho abaixo de 29%, amarelo de 29% a 32%, verde acima de 32%.
export const MARGEM_VERMELHO_ATE = 0.29
export const MARGEM_VERDE_DE = 0.32

export function faixaDaMargem(m: number | null): { nome: 'vermelho' | 'amarelo' | 'verde' | null; cor: string; fundo: string } {
  if (m == null) return { nome: null, cor: '#6b7390', fundo: '#eef0fa' }
  if (m < MARGEM_VERMELHO_ATE) return { nome: 'vermelho', cor: '#b42318', fundo: '#fbe3e1' }
  if (m <= MARGEM_VERDE_DE) return { nome: 'amarelo', cor: '#7a5200', fundo: '#fff0d6' }
  return { nome: 'verde', cor: '#1a6b3c', fundo: '#d6ecdf' }
}

export function FaixaMargem({ margem, piso }: { margem: number | null; piso?: number | null }) {
  const f = faixaDaMargem(margem)
  const pos = margem == null ? null : Math.max(0, Math.min(0.5, margem)) / 0.5
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-[13px]">
        <span style={{ color: '#4a5275' }}>Margem</span>
        <span className="font-extrabold" style={{ color: f.cor }}>
          {margem == null ? '—' : `● ${(margem * 100).toFixed(1).replace('.', ',')}% · ${f.nome}`}
        </span>
      </div>
      <div className="relative h-2.5 rounded-full overflow-visible flex" aria-hidden>
        <span style={{ width: `${(MARGEM_VERMELHO_ATE / 0.5) * 100}%`, background: '#f4b9b4' }} className="rounded-l-full" />
        <span style={{ width: `${((MARGEM_VERDE_DE - MARGEM_VERMELHO_ATE) / 0.5) * 100}%`, background: '#f3d388' }} />
        <span style={{ flex: 1, background: '#a9dcbc' }} className="rounded-r-full" />
        {pos != null && <span className="absolute top-1/2 w-3.5 h-3.5 rounded-full border-2 border-white" style={{ left: `${pos * 100}%`, transform: 'translate(-50%, -50%)', background: f.cor }} />}
      </div>
      <div className="flex justify-between text-[10px]" style={{ color: '#8a91ad' }}>
        <span>0%</span>
        <span>vermelho abaixo de 29% · verde acima de 32%</span>
        <span>50%</span>
      </div>
      {piso != null && (
        <div className="text-[11px]" style={{ color: 'var(--rbr-muted)' }}>
          Faixa mínima de gravação: {(piso * 100).toFixed(0)}%.
        </div>
      )}
    </div>
  )
}

export type LinhaPreco = { rotulo: string; dica?: string; valor: number | null; verde?: boolean }

export function PrecoCard({ linhas, valorCliente, margem, piso }: { linhas: LinhaPreco[]; valorCliente: number | null; margem: number | null; piso?: number | null }) {
  return (
    <div className="bg-white border rounded-2xl p-5 flex flex-col gap-3" style={{ borderColor: 'var(--rbr-border)' }}>
      <div className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: 'var(--rbr-muted)' }}>
        PREÇO
      </div>
      <div className="flex flex-col gap-1.5">
        {linhas.map((l) => (
          <div key={l.rotulo} className="flex items-baseline justify-between text-[14px]">
            <span style={{ color: '#4a5275' }}>
              {l.rotulo}
              {l.dica && <span className="text-[11px] ml-1.5" style={{ color: '#8a91ad' }}>({l.dica})</span>}
            </span>
            <span className="font-extrabold tabular-nums" style={{ color: l.verde ? '#1a6b3c' : 'var(--rbr-navy-dark)' }}>
              {formatMoney(l.valor)}
            </span>
          </div>
        ))}
      </div>
      <div className="rounded-xl px-4 py-3 flex items-center justify-between" style={{ background: '#eef0fa' }}>
        <span className="text-[13px] font-bold" style={{ color: '#1c2559' }}>
          Valor para o cliente
        </span>
        <span className="text-[26px] font-extrabold tabular-nums" style={{ color: '#1c2559' }}>
          {formatMoney(valorCliente)}
        </span>
      </div>
      <FaixaMargem margem={margem} piso={piso} />
    </div>
  )
}

const PASSOS = [
  { id: 'rascunho', rotulo: 'Rascunho' },
  { id: 'enviada', rotulo: 'Enviada ao cliente' },
  { id: 'convertida', rotulo: 'Aprovada' },
]

// Esteira de três passos do topo da cotação (Rascunho → Enviada ao cliente → Aprovada). Perdida aparece à parte.
export function PassosCotacao({ status }: { status: string }) {
  if (status === 'perdida') {
    return (
      <span className="text-[12px] font-bold rounded-full px-3 py-1.5" style={{ background: '#fbe3e1', color: '#b42318' }}>
        Perdida
      </span>
    )
  }
  const atual = Math.max(0, PASSOS.findIndex((p) => p.id === status))
  return (
    <div className="flex items-center gap-1.5">
      {PASSOS.map((p, i) => (
        <span key={p.id} className="flex items-center gap-1.5">
          {i > 0 && <span className="w-4 h-0.5" style={{ background: i <= atual ? '#1a9b57' : '#d5d9e6' }} />}
          <span
            className="text-[12px] font-extrabold rounded-full px-3 py-1.5 border"
            style={i < atual ? { background: '#1a9b57', color: '#fff', borderColor: '#1a9b57' } : i === atual ? { background: '#1c2559', color: '#fff', borderColor: '#1c2559' } : { background: '#fff', color: '#8a91ad', borderColor: '#d5d9e6' }}
          >
            {i < atual ? '✓ ' : ''}
            {p.rotulo}
          </span>
        </span>
      ))}
    </div>
  )
}

// Validade da proposta (visual "Cotacao-Historico"): dias que faltam, data de expiração e barra. Renovar ainda não existe no sistema.
export function ValidadeCard({ criadaEm, validadeDias }: { criadaEm: string | null; validadeDias: number | null }) {
  if (!criadaEm || !validadeDias) return null
  const expira = new Date(new Date(criadaEm).getTime() + validadeDias * 86_400_000)
  const restam = Math.ceil((expira.getTime() - Date.now()) / 86_400_000)
  const pct = Math.max(0, Math.min(100, (restam / validadeDias) * 100))
  const vencida = restam < 0
  return (
    <div className="bg-white border rounded-2xl p-5 flex flex-col gap-2" style={{ borderColor: 'var(--rbr-border)' }}>
      <div className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: 'var(--rbr-muted)' }}>
        VALIDADE
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-[26px] font-extrabold" style={{ color: vencida ? '#b42318' : 'var(--rbr-navy-dark)' }}>
          {vencida ? 'Vencida' : restam === 1 ? '1 dia' : `${restam} dias`}
        </span>
        <span className="text-[12px]" style={{ color: 'var(--rbr-muted)' }}>
          {vencida ? 'venceu' : 'expira'} em {expira.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
        </span>
      </div>
      <div className="h-1.5 rounded-full" style={{ background: '#e9ecf4' }}>
        <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: restam <= 2 ? '#d64545' : '#e0a21c' }} />
      </div>
      <button type="button" disabled title="Ainda não disponível" className="self-start text-[12px] font-bold px-3.5 py-1.5 rounded-[10px] border opacity-50 cursor-not-allowed mt-1" style={{ borderColor: 'var(--rbr-border)', color: '#1c2559' }}>
        Renovar por 7 dias · ainda não disponível
      </button>
    </div>
  )
}

export type EventoLinha = { titulo: string; detalhe: string; tom: 'verde' | 'amarelo' | 'azul' }

// Linha do tempo (visual "Cotacao-Historico"), montada só com datas que existem na cotação.
export function HistoricoCard({ eventos }: { eventos: EventoLinha[] }) {
  const cor = { verde: '#1a9b57', amarelo: '#e0a21c', azul: '#1c2559' }
  return (
    <div className="bg-white border rounded-2xl p-5 flex flex-col gap-3" style={{ borderColor: 'var(--rbr-border)' }}>
      <div className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: 'var(--rbr-muted)' }}>
        HISTÓRICO DA COTAÇÃO
      </div>
      <div className="flex flex-col">
        {eventos.map((e, i) => (
          <div key={e.titulo + i} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className="w-3 h-3 rounded-full mt-1" style={{ background: cor[e.tom] }} />
              {i < eventos.length - 1 && <span className="w-0.5 flex-1 min-h-[22px]" style={{ background: '#d5d9e6' }} />}
            </div>
            <div className="pb-3">
              <div className="text-[14px] font-extrabold text-[color:var(--rbr-navy-dark)]">{e.titulo}</div>
              <div className="text-[12px]" style={{ color: 'var(--rbr-muted)' }}>
                {e.detalhe}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="text-[12px] rounded-xl px-3 py-2.5" style={{ background: '#f3f5f9', color: 'var(--rbr-muted)' }}>
        Versões da proposta ainda não são guardadas: aqui aparecem só as datas da cotação.
      </div>
    </div>
  )
}

export type ItemPronto = { titulo: string; detalhe: string; ok: boolean }

// "Para enviar a cotação" (visual "Cotacao-Recebedor"): o que já está pronto e o que falta, tirado dos dados da cotação.
export function ProntoParaEnviarCard({ itens }: { itens: ItemPronto[] }) {
  return (
    <div className="bg-white border rounded-2xl p-5 flex flex-col gap-3" style={{ borderColor: 'var(--rbr-border)' }}>
      <div className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: 'var(--rbr-muted)' }}>
        PARA ENVIAR A COTAÇÃO
      </div>
      {itens.map((i) => (
        <div key={i.titulo} className="flex items-start gap-3">
          <span className="w-6 h-6 rounded-full inline-flex items-center justify-center text-white text-[12px] font-extrabold flex-shrink-0" style={{ background: i.ok ? '#1a9b57' : '#e0a21c' }}>
            {i.ok ? '✓' : '!'}
          </span>
          <div>
            <div className="text-[14px] font-extrabold text-[color:var(--rbr-navy-dark)]">{i.titulo}</div>
            <div className="text-[12px]" style={{ color: 'var(--rbr-muted)' }}>
              {i.detalhe}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export type CampoRecebedor = { rotulo: string; valor: string | null; doXml?: boolean }

// "Quem recebe a carga" (visual "Cotacao-Recebedor"): dados do destinatário que vieram do XML da NF-e. Campo vazio aparece desativado.
export function RecebedorCard({ campos, avisar }: { campos: CampoRecebedor[]; avisar: CampoRecebedor[] }) {
  const caixa = (c: CampoRecebedor) => (
    <div key={c.rotulo} className="rounded-xl border px-3 py-2 min-w-0" style={{ borderColor: 'var(--rbr-border)', background: c.valor ? '#fff' : '#f7f8fc', opacity: c.valor ? 1 : 0.7 }}>
      <div className="flex items-center justify-between gap-2 text-[10px]" style={{ color: 'var(--rbr-muted)' }}>
        <span>{c.rotulo}</span>
        {c.doXml && c.valor && <span className="font-extrabold" style={{ color: '#1a6b3c' }}>✓ DO XML</span>}
      </div>
      <div className="text-[14px] font-extrabold truncate text-[color:var(--rbr-navy-dark)]">{c.valor ?? 'não informado'}</div>
    </div>
  )
  return (
    <div className="bg-white border rounded-2xl p-5 flex flex-col gap-3" style={{ borderColor: 'var(--rbr-border)' }}>
      <div className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: 'var(--rbr-muted)' }}>
        QUEM RECEBE A CARGA
      </div>
      <div className="text-[12px]" style={{ color: 'var(--rbr-muted)' }}>
        O XML da NF-e já traz os dados da empresa. Você só completa o contato de quem vai receber o aviso.
      </div>
      <div className="grid gap-2 grid-cols-1 sm:grid-cols-3">{campos.map(caixa)}</div>
      <div className="text-[11px] font-extrabold tracking-[0.08em] pt-1" style={{ color: 'var(--rbr-muted)' }}>
        QUEM AVISAR NA ENTREGA
      </div>
      <div className="grid gap-2 grid-cols-1 sm:grid-cols-3">{avisar.map(caixa)}</div>
      <div className="text-[11px]" style={{ color: 'var(--rbr-muted)' }}>
        O contato de aviso na entrega ainda não é guardado na cotação: os campos ficam desativados até existir esse dado.
      </div>
    </div>
  )
}

// Aprovação de preço (visual "Aprovacao-Preco"): o vendedor explica, o gestor decide. O pedido ainda não existe no sistema:
// aparece só quando a margem está no vermelho, com os campos e botões desativados.
export function AprovacaoPrecoCard({ preco, sugerido, margem }: { preco: number | null; sugerido: number | null; margem: number | null }) {
  const f = faixaDaMargem(margem)
  if (f.nome !== 'vermelho') return null
  return (
    <div className="bg-white border rounded-2xl p-5 flex flex-col gap-3" style={{ borderColor: '#f2c4c0' }}>
      <div className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: 'var(--rbr-muted)' }}>PREÇO NO VERMELHO · ENVIAR AO GESTOR</div>
      <div className="rounded-xl px-4 py-3 flex items-center justify-between" style={{ background: '#fdeceb' }}>
        <div>
          <div className="text-[11px]" style={{ color: '#b42318' }}>Seu preço</div>
          <div className="text-[24px] font-extrabold" style={{ color: '#7d1a12' }}>{formatMoney(preco)}</div>
        </div>
        <div className="text-right text-[11px]" style={{ color: 'var(--rbr-muted)' }}>
          preço no limite<br />
          {sugerido != null && <>sugerido {formatMoney(sugerido)}</>}
        </div>
      </div>
      <div className="rounded-xl border px-3 py-2 bg-[#f7f8fc] opacity-70 cursor-not-allowed">
        <div className="text-[10px] font-extrabold" style={{ color: 'var(--rbr-muted)' }}>OBSERVAÇÃO (OBRIGATÓRIA)</div>
        <div className="text-[13px]" style={{ color: '#8a91ad' }}>Explique o motivo para o gestor aprovar.</div>
      </div>
      <div className="flex gap-2">
        <button type="button" disabled className="flex-1 text-[13px] font-extrabold px-4 py-2.5 rounded-xl text-white cursor-not-allowed opacity-50" style={{ background: '#1c2559' }}>Enviar ao gestor</button>
        <button type="button" disabled className="text-[13px] font-extrabold px-4 py-2.5 rounded-xl border cursor-not-allowed opacity-50" style={{ borderColor: 'var(--rbr-border)', color: '#1c2559' }}>Aprovar</button>
        <button type="button" disabled className="text-[13px] font-extrabold px-4 py-2.5 rounded-xl border cursor-not-allowed opacity-50" style={{ borderColor: '#f2c4c0', color: '#b42318' }}>Recusar</button>
      </div>
      <div className="text-[11px]" style={{ color: 'var(--rbr-muted)' }}>Ainda não disponível: o pedido de aprovação e a conversa com o gestor não existem no sistema. A cotação continua podendo ser salva e enviada como hoje.</div>
    </div>
  )
}

// Enviar proposta (visual "Enviar-Proposta"): o envio por e-mail próprio ainda não existe; o formulário aparece desativado,
// com o texto montado a partir da cotação. O envio por WhatsApp/cópia de texto continua nos botões de sempre.
export function EnviarPropostaCard({ para, rota, valor }: { para: string | null; rota: string; valor: number | null }) {
  const off = 'rounded-xl border px-3 py-2 bg-[#f7f8fc] opacity-70 cursor-not-allowed'
  return (
    <div className="bg-white border rounded-2xl p-5 flex flex-col gap-2.5" style={{ borderColor: 'var(--rbr-border)' }}>
      <div className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: 'var(--rbr-muted)' }}>ENVIAR PROPOSTA POR E-MAIL</div>
      <div className={off}><div className="text-[10px]">De</div><div className="text-[13px] font-extrabold" style={{ color: '#8a91ad' }}>seu e-mail da empresa (não conectado)</div></div>
      <div className={off}><div className="text-[10px]">Para</div><div className="text-[13px] font-extrabold" style={{ color: '#8a91ad' }}>{para ?? 'e-mail do cliente'}</div></div>
      <div className={off}><div className="text-[10px]">Assunto</div><div className="text-[13px] font-extrabold" style={{ color: '#8a91ad' }}>Proposta de frete {rota} · RBR Cargo</div></div>
      <div className={off + ' text-[12px]'} style={{ color: '#8a91ad' }}>Segue a proposta para o transporte {rota}, {formatMoney(valor)}. Para aceitar, é só clicar no botão do e-mail.</div>
      <div className="flex gap-2 flex-wrap">
        <button type="button" disabled className="text-[12px] font-extrabold px-4 py-2 rounded-[10px] text-white cursor-not-allowed opacity-50" style={{ background: '#1c2559' }}>Enviar por e-mail</button>
        <button type="button" disabled className="text-[12px] font-extrabold px-4 py-2 rounded-[10px] border cursor-not-allowed opacity-50" style={{ borderColor: 'var(--rbr-border)', color: '#1c2559' }}>Baixar PDF da proposta</button>
      </div>
      <div className="text-[11px]" style={{ color: 'var(--rbr-muted)' }}>Ainda não disponível: e-mail próprio e PDF da proposta. Use o link de aceite e o envio por WhatsApp.</div>
    </div>
  )
}

// Visão do vendedor (visual "Vendedor-Cotacao"): só o valor e a qualidade do preço; custos, lucro e margem em número ficam só para o gestor.
export function QualidadePrecoCard({ valor, margem }: { valor: number | null; margem: number | null }) {
  const f = faixaDaMargem(margem)
  const rotulo = f.nome === 'verde' ? 'Bom' : f.nome === 'amarelo' ? 'Médio' : f.nome === 'vermelho' ? 'No limite' : '—'
  const pos = margem == null ? null : Math.max(0, Math.min(0.5, margem)) / 0.5
  return (
    <div className="bg-white border rounded-2xl p-5 flex flex-col gap-3" style={{ borderColor: 'var(--rbr-border)' }}>
      <div className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: 'var(--rbr-muted)' }}>PREÇO PARA O CLIENTE</div>
      <div className="rounded-xl px-4 py-3 text-center text-[30px] font-extrabold tabular-nums" style={{ background: '#eef0fa', color: '#1c2559' }}>{formatMoney(valor)}</div>
      <div className="flex items-center justify-between text-[13px]">
        <span style={{ color: '#4a5275' }}>Qualidade do preço</span>
        <span className="text-[12px] font-extrabold rounded-full px-3 py-1" style={{ background: f.fundo, color: f.cor }}>● {rotulo}</span>
      </div>
      <div className="relative h-2.5 rounded-full flex" aria-hidden>
        <span style={{ width: '58%', background: '#f4b9b4' }} className="rounded-l-full" />
        <span style={{ width: '6%', background: '#f3d388' }} />
        <span style={{ flex: 1, background: '#a9dcbc' }} className="rounded-r-full" />
        {pos != null && <span className="absolute top-1/2 w-3.5 h-3.5 rounded-full border-2 border-white" style={{ left: `${pos * 100}%`, transform: 'translate(-50%, -50%)', background: f.cor }} />}
      </div>
      <div className="flex justify-between text-[10px]" style={{ color: '#8a91ad' }}><span>No limite</span><span>Médio</span><span>Bom</span></div>
      <div className="text-[12px] rounded-xl px-3 py-2.5" style={{ background: '#f3f5f9', color: '#4a5275' }}>Custos e margem ficam só para o gestor.</div>
    </div>
  )
}
