import { useEffect, useState } from 'react'
import { jsPDF } from 'jspdf'
import { supabase } from '@rbr/shared/supabaseClient'
import type { Database } from '@rbr/shared/database.types'
import { desenharOrdemColeta, dataHora, type OrdemColeta } from '@rbr/shared/ordemColetaPdf'

type Linha = Database['public']['Tables']['ordens_coleta']['Row']

// Ordem de coleta da carga (gerada pela RBR). O banco só mostra a ordem depois que a carga é liberada para coleta;
// o PDF é montado aqui, no celular, com o mesmo layout do gestor (shared/ordemColetaPdf.ts).
export default function OrdemColetaBotao({ operacaoId, motorista }: { operacaoId: string; motorista: string | null }) {
  const [ordem, setOrdem] = useState<Linha | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    supabase
      .from('ordens_coleta')
      .select('*')
      .eq('operacao_id', operacaoId)
      .is('cancelada_em', null)
      .order('versao', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (vivo) setOrdem(data?.[0] ?? null)
      })
    return () => {
      vivo = false
    }
  }, [operacaoId])

  if (!ordem) return null

  function abrir() {
    if (!ordem) return
    setErro(null)
    try {
      const o: OrdemColeta = {
        codigo: `${operacaoId.slice(0, 8).toUpperCase()}-v${ordem.versao}`,
        rota: `Carregamento em ${ordem.cidade_carregamento}/${ordem.uf_carregamento}`,
        endereco_carregamento: ordem.endereco_carregamento,
        cep_carregamento: ordem.cep_carregamento,
        cidade_carregamento: ordem.cidade_carregamento,
        uf_carregamento: ordem.uf_carregamento,
        contato_nome: ordem.contato_nome,
        contato_telefone: ordem.contato_telefone,
        coleta_prevista_em: ordem.coleta_prevista_em,
        carga_descricao: ordem.carga_descricao,
        peso_kg: ordem.peso_kg,
        volumes: ordem.volumes,
        documentos: Array.isArray(ordem.documentos) ? (ordem.documentos as OrdemColeta['documentos']) : [],
        observacoes: ordem.observacoes,
        motorista,
        gerada_em: ordem.gerada_em,
        empresa: { nome: 'RBR Cargo' },
      }
      const doc = new jsPDF({ unit: 'mm', format: 'a4' })
      desenharOrdemColeta(doc, o)
      const url = URL.createObjectURL(doc.output('blob'))
      const a = document.createElement('a')
      a.href = url
      a.download = `ordem-coleta-${o.codigo}.pdf`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } catch (e) {
      setErro(`Não consegui abrir a ordem: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <div className="rounded-xl border px-3 py-2.5 flex flex-col gap-1.5 mb-3" style={{ borderColor: 'var(--rbr-border)' }}>
      <div className="text-xs font-bold text-[color:var(--rbr-navy-dark)]">Ordem de coleta</div>
      <div className="text-xs text-[color:var(--rbr-muted)]">
        {ordem.endereco_carregamento} · {ordem.cidade_carregamento}/{ordem.uf_carregamento} · {dataHora(ordem.coleta_prevista_em)}
      </div>
      <button type="button" onClick={abrir} className="self-start text-xs font-bold px-3 py-2 rounded-lg" style={{ background: 'var(--rbr-navy)', color: '#fff' }}>
        Abrir ordem de coleta (PDF)
      </button>
      {erro && <div className="text-xs" style={{ color: 'var(--rbr-danger)' }}>{erro}</div>}
    </div>
  )
}
