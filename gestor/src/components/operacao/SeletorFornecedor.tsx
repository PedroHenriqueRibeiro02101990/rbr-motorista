import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { SELETOR_FORNECEDOR_HABILITADO } from '../../lib/efreteFlags'
import { bloqueioTroca, opcoesFornecedor, podeTrocarFornecedor, rotuloEtapa, seletorVisivel, textoEmpresa, type FornecedorFiscal, type TipoFornecimento } from '../../lib/fornecedorFiscal'

// "Empresa que emite" do cartão Vale-pedágio ou CIOT da aba Fiscal. Desligado por padrão (VITE_SELETOR_FORNECEDOR) e nunca aparece
// na demonstração. A regra de verdade (papel, trava, disponibilidade) está na função escolher_fornecedor_fiscal do banco.
// As tabelas novas ainda não estão nos tipos gerados do Supabase: acesso solto, só aqui.
type Solto = { from: (t: string) => any; rpc: (f: string, a?: Record<string, unknown>) => any } // eslint-disable-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as Solto

type Linha = { ciot_fornecedor: string | null; vpo_fornecedor: string | null; ciot_status: string | null; vpo_idvpo: string | null; fornecedor_escolhido_em: string | null }

export default function SeletorFornecedor({ operacaoId, tipo, demo = false, onMudou }: { operacaoId: string; tipo: TipoFornecimento; demo?: boolean; onMudou?: () => void }) {
  const [catalogo, setCatalogo] = useState<FornecedorFiscal[]>([])
  const [linha, setLinha] = useState<Linha | null>(null)
  const [papel, setPapel] = useState<string | null>(null)
  const [andamento, setAndamento] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const ativo = seletorVisivel(SELETOR_FORNECEDOR_HABILITADO, demo)

  const carregar = useCallback(async () => {
    const [cat, op, pp, req] = await Promise.all([
      db.from('fornecedores_fiscais').select('id, nome, capacidades, ativo, disponivel_emissao, ordem, padrao_ciot, padrao_vpo'),
      db.from('operacao_ciot_vpo').select('ciot_fornecedor, vpo_fornecedor, ciot_status, vpo_idvpo, fornecedor_escolhido_em').eq('operacao_id', operacaoId).maybeSingle(),
      db.rpc('current_papel'),
      db.from('vpo_requisicoes').select('id').eq('operacao_id', operacaoId).eq('situacao', 'em_processamento').limit(1),
    ])
    setCatalogo((cat.data as FornecedorFiscal[] | null) ?? [])
    setLinha((op.data as Linha | null) ?? null)
    setPapel((pp.data as string | null) ?? null)
    setAndamento(((req.data as unknown[] | null) ?? []).length > 0)
  }, [operacaoId])

  useEffect(() => {
    if (ativo) void carregar()
  }, [ativo, carregar])

  if (!ativo || catalogo.length === 0) return null

  const escolhido = (tipo === 'ciot' ? linha?.ciot_fornecedor : linha?.vpo_fornecedor) ?? null
  const travado = bloqueioTroca(tipo, { ciotStatus: linha?.ciot_status, vpoIdvpo: linha?.vpo_idvpo, vpoEmAndamento: andamento })
  const podeTrocar = podeTrocarFornecedor(papel)
  const opcoes = opcoesFornecedor(catalogo, tipo)
  const valor = escolhido ?? opcoes.find((o) => !o.desabilitada && textoEmpresa(tipo, null, catalogo, false).startsWith(o.nome))?.id ?? ''

  async function trocar(id: string) {
    setErro(null)
    setSalvando(true)
    const { error } = await db.rpc('escolher_fornecedor_fiscal', { p_operacao: operacaoId, p_tipo: tipo, p_fornecedor: id })
    setSalvando(false)
    if (error) {
      setErro(String(error.message ?? 'Não foi possível trocar a empresa.'))
      return
    }
    await carregar()
    onMudou?.()
  }

  const idAtual = escolhido ?? catalogo.find((f) => (tipo === 'ciot' ? f.padrao_ciot : f.padrao_vpo))?.id ?? 'nstech'
  return (
    <div className="rounded-lg border px-3 py-2 text-xs flex flex-col gap-1" style={{ borderColor: 'var(--rbr-border, #e5e7eb)' }}>
      {/* Opções sempre à vista (radio): a empresa marcada e as que ainda estão "em implantação" (desabilitadas) aparecem sem abrir lista. */}
      <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1 border-0 p-0 m-0 min-w-0" id={`forn-${tipo}`}>
        <legend className="sr-only">Empresa que emite</legend>
        <span className="font-bold text-[color:var(--rbr-navy-dark)]" aria-hidden>Empresa que emite</span>
        {opcoes.map((o) => (
          <label key={o.id} className={`inline-flex items-center gap-1.5 ${o.desabilitada ? 'opacity-60' : ''}`}>
            <input
              type="radio"
              name={`forn-${tipo}`}
              value={o.id}
              checked={valor === o.id}
              disabled={o.desabilitada || !podeTrocar || !!travado || salvando}
              onChange={() => void trocar(o.id)}
            />
            {o.rotulo}
          </label>
        ))}
        <span className="text-[color:var(--rbr-muted)]">{rotuloEtapa(tipo, idAtual, catalogo.find((f) => f.id === idAtual)?.nome)}{escolhido ? '' : ' · padrão, sem escolha feita'}</span>
      </fieldset>
      {travado && <div className="text-[color:var(--rbr-muted)]">{travado}</div>}
      {!travado && !podeTrocar && <div className="text-[color:var(--rbr-muted)]">Só o Fiscal ou o gestor trocam a empresa.</div>}
      {linha?.fornecedor_escolhido_em && escolhido && <div className="text-[color:var(--rbr-muted)]">Escolhida em {new Date(linha.fornecedor_escolhido_em).toLocaleString('pt-BR')}.</div>}
      {erro && <div style={{ color: 'var(--rbr-danger)' }}>{erro}</div>}
    </div>
  )
}
