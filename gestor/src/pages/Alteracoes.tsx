// Alterações depois do aceite (visual aprovado "Operacao-Alteracao"): as quatro faixas de regra do projeto.
// O pedido de alteração em formulário ainda não existe no sistema: o formulário aparece desativado.
const NIVEIS = [
  { n: 'A', cor: { bg: '#fbe3e1', fg: '#b42318' }, titulo: 'Nova proposta e novo aceite do cliente', quando: 'muda valor, rota (origem ou destino), tipo de veículo ou eixos, peso acima do cotado ou prazo de pagamento.', acontece: 'a operação fica em pausa. O gestor aprova a versão 2, o cliente aceita de novo pelo link e só então segue. A versão 2 sai com valor fechado, sem negociação.' },
  { n: 'B', cor: { bg: '#fff0d6', fg: '#7a5200' }, titulo: 'Livre, mas o gestor é informado', quando: 'muda data de coleta ou entrega, motorista ou veículo do mesmo tipo e eixos, endereço dentro da mesma cidade.', acontece: 'entra na lista de alterações do gestor com o antes e o depois. Não trava nada.' },
  { n: 'C', cor: { bg: '#d6ecdf', fg: '#1a6b3c' }, titulo: 'Só registro', quando: 'muda contato, recado ou observação.', acontece: 'fica no histórico da operação: quem, quando, antes e depois.' },
  { n: 'D', cor: { bg: '#eef0fa', fg: '#1c2559' }, titulo: 'Depois que o fiscal começou', quando: 'qualquer mudança em motorista, veículo ou rota.', acontece: 'o fiscal desfaz o que já foi emitido na ordem inversa (MDF-e, CIOT, VPO, averbação, CT-e) e a operação volta para a Operação. O gestor é avisado.' },
]

export default function Alteracoes() {
  const off = 'rounded-xl border px-3 py-2 bg-[#f7f8fc] opacity-70 cursor-not-allowed'
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[30px] leading-tight text-[color:var(--rbr-navy-dark)]">Alterações depois do aceite</h1>
          <div className="text-[13px] mt-1" style={{ color: '#4a5275' }}>Regras propostas (ainda não aplicadas automaticamente). O gestor sempre fica sabendo.</div>
        </div>
        <div className="text-[12px] font-semibold" style={{ color: 'var(--rbr-muted)' }}>Valem para Operação e Comercial</div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
        <div className="bg-white border rounded-2xl overflow-hidden" style={{ borderColor: 'var(--rbr-border)' }}>
          {NIVEIS.map((x, i) => (
            <div key={x.n} className="flex gap-4 px-4 py-4" style={{ borderTop: i ? '1px solid #eef0f5' : undefined }}>
              <span className="text-[11px] font-extrabold rounded-lg px-2.5 py-1.5 h-fit whitespace-nowrap" style={{ background: x.cor.bg, color: x.cor.fg }}>NÍVEL {x.n}</span>
              <div className="text-[12px] flex flex-col gap-1" style={{ color: '#4a5275' }}>
                <div className="text-[15px] font-extrabold text-[color:var(--rbr-navy-dark)]">{x.titulo}</div>
                <div><b>Quando:</b> {x.quando}</div>
                <div><b>O que acontece:</b> {x.acontece}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-3.5">
          <div className="bg-white border rounded-2xl p-5 flex flex-col gap-2.5" style={{ borderColor: 'var(--rbr-border)' }}>
            <div className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: 'var(--rbr-muted)' }}>COMO O OPERADOR PEDE</div>
            <div className={off}><div className="text-[10px]">O que muda</div><div className="text-[13px] font-extrabold">Escolher… (valor, rota, veículo, data, outro)</div></div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className={off}><div className="text-[10px]">De</div><div className="text-[13px] font-extrabold">—</div></div>
              <div className={off}><div className="text-[10px]">Para</div><div className="text-[13px] font-extrabold">—</div></div>
            </div>
            <div className={off}><div className="text-[10px]">Motivo (obrigatório)</div><div className="text-[13px]">Explique em uma frase.</div></div>
            <button type="button" disabled className="text-[13px] font-extrabold px-4 py-2.5 rounded-xl text-white cursor-not-allowed opacity-50" style={{ background: '#1c2559' }}>Enviar ao gestor</button>
            <div className="text-[11px]" style={{ color: 'var(--rbr-muted)' }}>Ainda não disponível. Hoje a alteração é feita direto na operação; o nível A já existe como status “pausada por alteração”.</div>
          </div>
          <div className="bg-white border rounded-2xl p-5 flex flex-col gap-2.5" style={{ borderColor: 'var(--rbr-border)' }}>
            <div className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: 'var(--rbr-muted)' }}>O QUE O GESTOR VÊ</div>
            <div className="rounded-xl px-3.5 py-3 text-[12px]" style={{ background: '#fbe3e1', color: '#7d1a12' }}>Nenhum pedido de alteração aguardando você.</div>
            <div className="flex gap-2">
              <button type="button" disabled className="text-[13px] font-extrabold px-4 py-2 rounded-xl text-white cursor-not-allowed opacity-50" style={{ background: '#1c2559' }}>Aprovar versão 2</button>
              <button type="button" disabled className="text-[13px] font-extrabold px-4 py-2 rounded-xl border cursor-not-allowed opacity-50" style={{ borderColor: 'var(--rbr-border)', color: '#1c2559' }}>Recusar</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
