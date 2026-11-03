// Jornada da operação (visual aprovado "Jornada-Operacao"): mapa de quem faz cada passo, da cotação aprovada à operação finalizada.
// É um quadro de referência do desenho; os passos que ainda não existem no sistema estão no rodapé como status propostos.
const LINHAS: { quem: string; cor: string; passos: { t: string; d?: string; destaque?: boolean }[] }[] = [
  { quem: 'COMERCIAL', cor: '#1c2559', passos: [{ t: 'Cotação aprovada', d: 'aceite pelo link' }, { t: 'Checklist e gerar operação', d: 'contatos, janelas, NF-e' }, { t: 'Alerta se aprovada e sem operação', d: 'novo' }] },
  { quem: 'OPERAÇÃO', cor: '#6b4fb3', passos: [{ t: 'Fila por urgência' }, { t: 'Assumir' }, { t: 'Escolher motorista' }, { t: 'Aceite + GR' }, { t: 'Completar', d: '11 itens' }, { t: 'Pronta para o fiscal', d: 'tudo verde', destaque: true }] },
  { quem: 'FISCAL', cor: '#0e7c86', passos: [{ t: 'Pré-voo' }, { t: 'CT-e' }, { t: 'Averbação' }, { t: 'VPO' }, { t: 'CIOT' }, { t: 'MDF-e' }, { t: 'RC-V', d: 'documentos prontos', destaque: true }] },
  { quem: 'GESTOR', cor: '#1a6b3c', passos: [{ t: 'Painel: prontas para liberar' }, { t: 'Libera a ordem de coleta', d: 'ordem ao motorista', destaque: true }, { t: 'Fica sabendo das alterações', d: 'níveis A a D' }] },
  { quem: 'MOTORISTA', cor: '#b8863b', passos: [{ t: 'Recebe a ordem' }, { t: 'Chega e carrega' }] },
  { quem: 'OPERAÇÃO', cor: '#6b4fb3', passos: [{ t: 'Libera o caminhão', d: 'e-mails ao embarcador e a quem recebe', destaque: true }] },
  { quem: 'MOTORISTA', cor: '#b8863b', passos: [{ t: 'Em rota', d: 'acompanhado pelo link' }, { t: 'Finaliza e envia o comprovante' }] },
  { quem: 'OPERAÇÃO', cor: '#6b4fb3', passos: [{ t: 'Confere o comprovante' }, { t: 'Finalizar operação', d: 'baixa do MDF-e e CIOT', destaque: true }, { t: 'Financeiro paga o saldo' }] },
]
const STATUS_PROPOSTOS = ['aguardando_assumir', 'alocando_motorista', 'aguardando_aceite_motorista', 'aguardando_liberacao_fiscal', 'em_emissao', 'devolvida_pelo_fiscal', 'pausada_por_alteracao', 'aguardando_liberacao_gestor', 'ordem_liberada', 'em_viagem', 'finalizada', 'cancelada']

export default function Jornada() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-[30px] leading-tight text-[color:var(--rbr-navy-dark)]">Jornada da operação</h1>
        <div className="text-[13px] mt-1" style={{ color: '#4a5275' }}>Da cotação aprovada à operação finalizada. Quem faz cada passo.</div>
      </div>
      <div className="flex flex-col gap-3">
        {LINHAS.map((l, i) => (
          <div key={i} className="flex items-center gap-3 flex-wrap">
            <span className="text-[12px] font-extrabold text-white rounded-xl px-4 py-3 w-[120px] text-center flex-shrink-0" style={{ background: l.cor }}>{l.quem}</span>
            {l.passos.map((p, k) => (
              <span key={p.t} className="flex items-center gap-2">
                {k > 0 && <span style={{ color: '#8a91ad' }}>→</span>}
                <span className="bg-white border rounded-xl px-3 py-2 text-[12px]" style={{ borderColor: p.destaque ? l.cor : 'var(--rbr-border)' }}>
                  <b className="block">{p.t}</b>
                  {p.d && <span style={{ color: 'var(--rbr-muted)' }}>{p.d}</span>}
                </span>
              </span>
            ))}
          </div>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2 text-[12px]">
        <div className="rounded-xl px-4 py-3" style={{ background: '#fbe3e1', color: '#7d1a12', border: '1px solid #f2c4c0' }}><b>Volta 1:</b> o fiscal devolve à Operação com motivo, só o item errado reabre, e a Operação reenvia. Tudo no histórico.</div>
        <div className="rounded-xl px-4 py-3" style={{ background: '#fff4d9', color: '#7a5200', border: '1px solid #f0d9a8' }}><b>Volta 2:</b> mudar valor, rota ou veículo depois do aceite pausa a operação, o gestor aprova a versão 2 e o cliente aceita de novo.</div>
      </div>
      <div className="bg-white border rounded-2xl p-4 flex flex-col gap-2" style={{ borderColor: 'var(--rbr-border)' }}>
        <div className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: 'var(--rbr-muted)' }}>STATUS DA OPERAÇÃO NO SISTEMA</div>
        <div className="flex gap-1.5 flex-wrap">
          {STATUS_PROPOSTOS.map((s) => (
            <span key={s} className="text-[11px] font-bold rounded-full px-2.5 py-1" style={{ background: '#ece6fb', color: '#4a3a8a' }}>{s}</span>
          ))}
        </div>
      </div>
    </div>
  )
}
