import type { DetalheOperacao } from '../../lib/operacaoDetalhe'
import { divergenciasEndereco, type EnderecoNfMini } from '../../lib/enderecoNf'

// B5: quando o remetente ou o destinatário da NF é o cliente da cotação e o endereço da NF difere do cadastro,
// mostra o aviso: a NF vence nos documentos fiscais; o cadastro NÃO é alterado por esta tela.
const dig = (v: unknown) => String(v ?? '').replace(/\D/g, '')

export default function AvisoEnderecoNf({ d }: { d: DetalheOperacao }) {
  const c = d.cotacao
  const cli = d.cliente
  if (!c || !cli) return null
  const partes = [
    { papel: 'remetente', cnpj: c.nf_remetente_cnpj, end: c.nf_remetente_endereco as EnderecoNfMini | null },
    { papel: 'destinatário', cnpj: c.nf_destinatario_cnpj, end: c.nf_destinatario_endereco as EnderecoNfMini | null },
  ].filter((p) => p.cnpj && dig(p.cnpj) === dig(cli.cnpj))
  const avisos = partes.flatMap((p) => divergenciasEndereco(p.end, cli).map((x) => ({ ...x, papel: p.papel })))
  if (avisos.length === 0) return null
  return (
    <div className="bg-white border rounded-2xl p-4 flex flex-col gap-2" style={{ borderColor: '#f0d9a8' }} role="status">
      <div className="text-[11px] font-extrabold tracking-[0.08em] text-[color:var(--rbr-muted)]">ENDEREÇO DA NF-E DIFERE DO CADASTRO DO CLIENTE</div>
      {avisos.map((a) => (
        <div key={`${a.papel}-${a.campo}`} className="text-[12px] rounded-lg px-3 py-2" style={{ background: '#fff0d6', color: '#7a5200' }}>
          <b>{a.campo}</b> ({a.papel}): NF-e <b>{a.nf}</b> · cadastro <b>{a.cadastro}</b>
        </div>
      ))}
      <div className="text-[11px]" style={{ color: 'var(--rbr-muted)' }}>Nos documentos fiscais vale o endereço da NF-e. O cadastro do cliente não foi alterado: atualize em Cadastros se a NF estiver certa.</div>
    </div>
  )
}
