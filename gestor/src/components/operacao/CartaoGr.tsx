import type { DetalheOperacao } from '../../lib/operacaoDetalhe'
import { dadosMotoristaVeiculo, faltandoCopia, textoCopia } from '../../lib/copiaOperacao'
import BotaoAcao from './BotaoAcao'

// Cartão "Dados para a GR": o que a pesquisa GR (Shogun) pede, com copiar. Sem GR liberada, a liberação da coleta
// continua travada pela regra do banco (ver pendenciasLiberacao: GR exigida e não cumprida bloqueia).
export default function CartaoGr({ d }: { d: DetalheOperacao }) {
  const linhas = dadosMotoristaVeiculo(d)
  const faltam = faltandoCopia(linhas)

  return (
    <div className="rounded-xl border p-3 flex flex-col gap-2" style={{ borderColor: 'var(--rbr-border)' }}>
      <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">Dados para a GR</div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm m-0">
        {linhas.map((l) => (
          <div key={l.rotulo} className="contents">
            <dt className="text-xs text-[color:var(--rbr-muted)]">{l.rotulo}</dt>
            <dd className="m-0 font-semibold text-[color:var(--rbr-navy-dark)]">{l.valor ?? <span style={{ color: 'var(--rbr-danger)' }}>faltando</span>}</dd>
          </div>
        ))}
      </dl>
      {faltam.length > 0 && <div className="text-xs" style={{ color: 'var(--rbr-danger)' }}>Faltam no cadastro: {faltam.join(', ')}.</div>}
      <BotaoAcao
        rotulo="Copiar dados"
        fazer={() => navigator.clipboard.writeText(textoCopia(linhas)).then(() => 'Dados copiados.')}
      />
    </div>
  )
}
