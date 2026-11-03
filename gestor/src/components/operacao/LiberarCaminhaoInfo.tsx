// Liberar o caminhão (visual "Operacao-Liberar-Caminhao"): o que conferir antes e a pré-visualização dos dois e-mails.
// O envio de e-mail ao embarcador e a quem recebe ainda não existe no sistema: os cartões aparecem desativados.
export default function LiberarCaminhaoInfo() {
  const off = 'bg-white border rounded-2xl p-4 flex flex-col gap-2 opacity-70'
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] items-start text-[12px]">
      <div className="bg-white border rounded-2xl p-4 flex flex-col gap-2" style={{ borderColor: 'var(--rbr-border)' }}>
        <div className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: 'var(--rbr-muted)' }}>ANTES DE LIBERAR O CAMINHÃO</div>
        {['Ordem de coleta liberada', 'Motorista chegou na coleta', 'Carga carregada e conferida', 'Documentos a bordo (DACTE e MDF-e)'].map((x) => (
          <div key={x} className="font-semibold text-[color:var(--rbr-navy-dark)]">✓ {x}</div>
        ))}
        <div style={{ color: 'var(--rbr-muted)' }}>Só libere quando o caminhão já estiver carregado e pronto para sair. A operação muda para Em viagem e fica registrado quem liberou e a hora.</div>
      </div>
      {['PARA O EMBARCADOR', 'PARA QUEM RECEBE'].map((t) => (
        <div key={t} className={off} style={{ borderColor: 'var(--rbr-border)' }}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: 'var(--rbr-muted)' }}>{t}</span>
            <span className="text-[10px] font-extrabold rounded-full px-2 py-0.5" style={{ background: '#eef0fa' }}>e-mail</span>
          </div>
          <div style={{ color: 'var(--rbr-muted)' }}>Pré-visualização do e-mail (motorista, veículo, saída, previsão, documentos e botão Acompanhar a viagem).</div>
          <button type="button" disabled className="self-start text-[12px] font-extrabold px-4 py-2 rounded-[10px] text-white cursor-not-allowed opacity-50" style={{ background: '#1c2559' }}>Acompanhar a viagem</button>
          <div className="text-[11px]" style={{ color: '#8a91ad' }}>Ainda não disponível: o aviso por e-mail e o link de acompanhamento do cliente não existem no sistema.</div>
        </div>
      ))}
    </div>
  )
}
