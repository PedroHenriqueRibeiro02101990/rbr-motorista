import { useEffect, useState } from 'react'
import { dbNovo } from '@rbr/shared/dbNovo'

// Tarefa 10.1: ao fechar a carga, o agenciador declara (cláusula 6 do contrato) quem embarca, o que, quanto, a NF,
// os endereços e o contato de quem entrega, e marca as 4 declarações. O registro é imutável (hash, IP, aparelho).

export type DadosIniciais = {
  embarcador_nome?: string | null
  embarcador_documento?: string | null
  valor?: string | number | null
  nf_numero?: string | null
  nf_chave?: string | null
  endereco_coleta?: string | null
  endereco_entrega?: string | null
}
type Textos = { minuta?: boolean; a: string; b: string; c: string; d: string }

const CAMPOS: [keyof Campos, string, string?][] = [
  ['embarcador_nome', 'Embarcador (nome/razão social)'],
  ['embarcador_documento', 'CNPJ/CPF do embarcador', 'numeric'],
  ['mercadoria', 'Mercadoria'],
  ['quantidade', 'Quantidade (ex.: 20 paletes, 12 t)'],
  ['valor', 'Valor da mercadoria (R$)', 'decimal'],
  ['nf_numero', 'Número da NF', 'numeric'],
  ['nf_chave', 'Chave da NF-e (44 dígitos)', 'numeric'],
  ['endereco_coleta', 'Endereço de coleta'],
  ['endereco_entrega', 'Endereço de entrega'],
  ['contato_entrega_nome', 'Contato de quem entrega a carga'],
  ['contato_entrega_telefone', 'Telefone desse contato', 'tel'],
]
type Campos = {
  embarcador_nome: string
  embarcador_documento: string
  mercadoria: string
  quantidade: string
  valor: string
  nf_numero: string
  nf_chave: string
  endereco_coleta: string
  endereco_entrega: string
  contato_entrega_nome: string
  contato_entrega_telefone: string
}

export default function DeclaracaoCarga({
  cotacaoId,
  iniciais,
  onFechar,
  onDeclarado,
}: {
  cotacaoId: string
  iniciais: DadosIniciais
  onFechar: () => void
  onDeclarado: () => Promise<void>
}) {
  const [c, setC] = useState<Campos>({
    embarcador_nome: iniciais.embarcador_nome ?? '',
    embarcador_documento: iniciais.embarcador_documento ?? '',
    mercadoria: '',
    quantidade: '',
    valor: iniciais.valor != null ? String(iniciais.valor) : '',
    nf_numero: iniciais.nf_numero ?? '',
    nf_chave: iniciais.nf_chave ?? '',
    endereco_coleta: iniciais.endereco_coleta ?? '',
    endereco_entrega: iniciais.endereco_entrega ?? '',
    contato_entrega_nome: '',
    contato_entrega_telefone: '',
  })
  const [marcadas, setMarcadas] = useState<Record<'a' | 'b' | 'c' | 'd', boolean>>({ a: false, b: false, c: false, d: false })
  const [textos, setTextos] = useState<Textos | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    void dbNovo.rpc('textos_declaracao_carga').then(({ data }) => setTextos((data as Textos | null) ?? null))
  }, [])

  const completo = CAMPOS.every(([k]) => c[k].trim()) && marcadas.a && marcadas.b && marcadas.c && marcadas.d

  async function declarar() {
    setErro(null)
    setEnviando(true)
    try {
      const valor = Number(c.valor.replace(/\./g, '').replace(',', '.'))
      if (!Number.isFinite(valor) || valor <= 0) throw new Error('Valor da mercadoria inválido.')
      const { error } = await dbNovo.rpc('declarar_carga', {
        p_cotacao: cotacaoId,
        p_dados: { ...c, valor, declaracoes: marcadas },
        p_user_agent: navigator.userAgent,
      })
      if (error) throw new Error(error.message)
      await onDeclarado()
    } catch (e) {
      setErro('✗ ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-3" style={{ background: 'rgba(60,60,60,0.55)' }}>
      <div className="bg-white rounded-[20px] w-full max-w-lg max-h-[90vh] overflow-auto p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="font-bold text-[color:var(--rbr-navy-dark)]">Declaração da carga</div>
          <button type="button" className="text-sm font-bold text-[color:var(--rbr-muted)]" onClick={onFechar} disabled={enviando}>
            Fechar
          </button>
        </div>
        <div className="text-xs text-[color:var(--rbr-muted)]">
          Obrigatória para a carga virar operação (cláusula 6 do contrato). Fica registrada com data, hora, IP e aparelho e não pode ser alterada.
        </div>
        <div className="grid grid-cols-1 gap-2">
          {CAMPOS.map(([k, rotulo, modo]) => (
            <label key={k} className="flex flex-col gap-1 text-xs font-semibold text-[color:var(--rbr-muted)]">
              {rotulo}
              <input
                value={c[k]}
                inputMode={modo as React.HTMLAttributes<HTMLInputElement>['inputMode']}
                onChange={(e) => setC((x) => ({ ...x, [k]: e.target.value }))}
                className="border rounded-xl px-3 py-2.5 text-sm text-[color:var(--rbr-navy-dark)]"
                style={{ borderColor: 'var(--rbr-border)' }}
              />
            </label>
          ))}
        </div>
        {textos?.minuta && <div className="text-[11px] font-bold" style={{ color: '#8A5A00' }}>Texto das declarações em revisão jurídica (minuta).</div>}
        {(['a', 'b', 'c', 'd'] as const).map((k) => (
          <label key={k} className="flex gap-3 items-start border rounded-xl p-3 text-sm" style={{ borderColor: marcadas[k] ? 'var(--rbr-positive)' : 'var(--rbr-border)' }}>
            <input type="checkbox" className="mt-1 w-5 h-5 flex-shrink-0" checked={marcadas[k]} onChange={(e) => setMarcadas((m) => ({ ...m, [k]: e.target.checked }))} />
            <span>
              <b>6.2 ({k})</b> {textos?.[k] ?? '…'}
            </span>
          </label>
        ))}
        {erro && <div className="text-xs font-semibold" style={{ color: 'var(--rbr-danger)' }}>{erro}</div>}
        <button
          type="button"
          disabled={!completo || enviando}
          onClick={() => void declarar()}
          className="rounded-xl py-3 font-bold text-sm disabled:opacity-50"
          style={{ background: 'var(--rbr-navy)', color: '#fff' }}
        >
          {enviando ? 'enviando…' : 'Declarar e fechar a carga'}
        </button>
      </div>
    </div>
  )
}
