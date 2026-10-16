import { useEffect, useRef } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'

// Mantém a tela de documentos fiscais em dia sem botão: quem atualiza o status é o robô do banco (pg_cron
// 'sincronizar-documentos-fiscais' a cada minuto -> Focus NFe -> documentacao_operacao). Aqui:
//  - Realtime em documentacao_operacao e operacao_ciot_vpo (vale quando as tabelas estão na publicação
//    supabase_realtime — migration 20261016_02); o RLS de cada tabela continua decidindo o que chega;
//  - e, enquanto houver documento processando na SEFAZ, uma releitura a cada 10 s (funciona mesmo sem Realtime e
//    para sozinha quando nada mais está pendente).
// operacaoId = uma operação (filtra no servidor); null = todas as que o usuário enxerga (tela Fiscal).
export function useDocumentosAoVivo(operacaoId: string | null, processando: boolean, recarregar: () => void, intervaloMs = 10000) {
  const recarregarRef = useRef(recarregar)
  useEffect(() => {
    recarregarRef.current = recarregar
  }, [recarregar])

  useEffect(() => {
    let espera: ReturnType<typeof setTimeout> | null = null
    // Vários eventos juntos (o robô grava CT-e e MDF-e na mesma rodada) viram uma releitura só.
    const agendar = () => {
      if (espera) clearTimeout(espera)
      espera = setTimeout(() => recarregarRef.current(), 400)
    }
    const filtro = operacaoId ? { filter: `operacao_id=eq.${operacaoId}` } : {}
    const canal = supabase
      .channel(`docs-fiscais:${operacaoId ?? 'todas'}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documentacao_operacao', ...filtro }, agendar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'operacao_ciot_vpo', ...filtro }, agendar)
      .subscribe()
    return () => {
      if (espera) clearTimeout(espera)
      void supabase.removeChannel(canal)
    }
  }, [operacaoId])

  useEffect(() => {
    if (!processando) return
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') recarregarRef.current()
    }, intervaloMs)
    return () => clearInterval(t)
  }, [processando, intervaloMs])
}

// Documento enviado à SEFAZ (tem referência na Focus) e ainda sem resposta final.
export function estaProcessando(doc: { tipo: string; status: string; referencia?: string | null }): boolean {
  return doc.status === 'pendente' && !!doc.referencia && (doc.tipo === 'cte' || doc.tipo === 'mdfe' || doc.tipo === 'nfse')
}
