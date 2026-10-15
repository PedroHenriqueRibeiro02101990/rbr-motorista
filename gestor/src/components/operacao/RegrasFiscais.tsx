// Bloqueios e avisos das funções fiscais (emitir-cte, emitir-mdfe, enviar-averbacao, emitir-nfe-teste-producao)
// com a origem de cada um: o que trava é regra da SEFAZ ou da ANTT/lei (vermelho); regra interna da RBR só avisa
// (amarelo) e o gestor segue por conta própria. A origem vem em `regras` na resposta da função.

export type OrigemRegra = 'sefaz' | 'antt' | 'rbr' | 'info' | 'tecnico' | 'teste'

export interface RegraFiscal {
  tipo: 'bloqueio' | 'aviso'
  origem: OrigemRegra
  mensagem: string
}

const ROTULO: Record<OrigemRegra, string | null> = {
  sefaz: 'SEFAZ',
  antt: 'ANTT',
  rbr: 'Regra da RBR',
  tecnico: 'Requisito técnico',
  teste: 'Trava do teste',
  info: null,
}

function origemDe(mensagem: string, tipo: RegraFiscal['tipo'], regras: RegraFiscal[] | undefined): OrigemRegra {
  const achada = regras?.find((r) => r.tipo === tipo && r.mensagem === mensagem)
  if (achada) return achada.origem
  // Mensagens da trava_teste_fiscal (banco) não passam pela classificação.
  if (/^(Trava do modo teste|Modo teste|Operação de teste)/.test(mensagem)) return tipo === 'bloqueio' ? 'teste' : 'info'
  return 'info'
}

function Rotulo({ origem, cor }: { origem: OrigemRegra; cor: string }) {
  const texto = ROTULO[origem]
  if (!texto) return null
  return (
    <span
      className="inline-block mr-1.5 px-1.5 py-px rounded text-[10px] font-extrabold uppercase tracking-wide align-middle"
      style={{ border: `1px solid ${cor}`, color: cor }}
    >
      {texto}
    </span>
  )
}

export default function RegrasFiscais({
  bloqueios = [],
  avisos = [],
  regras,
  tituloBloqueios = 'Falta resolver antes de emitir',
}: {
  bloqueios?: string[]
  avisos?: string[]
  regras?: RegraFiscal[]
  tituloBloqueios?: string
}) {
  if (bloqueios.length === 0 && avisos.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      {bloqueios.length > 0 && (
        <div className="text-xs rounded-lg px-3 py-2.5 flex flex-col gap-1" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
          <strong>
            {tituloBloqueios} ({bloqueios.length}):
          </strong>
          <ul className="list-disc pl-4 flex flex-col gap-0.5">
            {bloqueios.map((b, i) => (
              <li key={i}>
                <Rotulo origem={origemDe(b, 'bloqueio', regras)} cor="var(--rbr-danger)" />
                {b}
              </li>
            ))}
          </ul>
        </div>
      )}
      {avisos.length > 0 && (
        <div className="text-xs rounded-lg px-3 py-2.5 flex flex-col gap-1" style={{ background: '#FFF6E0', color: 'var(--rbr-navy-dark)' }}>
          <strong>Atenção (não impede a emissão):</strong>
          <ul className="list-disc pl-4 flex flex-col gap-0.5">
            {avisos.map((a, i) => (
              <li key={i}>
                <Rotulo origem={origemDe(a, 'aviso', regras)} cor="#9A6700" />
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
