import { useEffect, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { Botao, Aviso } from '../financeiro/ui'
import NovoCadastroPorDocumentos from './NovoCadastroPorDocumentos'
import { CADASTRO_POR_DOCUMENTOS_HABILITADO, veiculosParaCorrigir, type VeiculoParaCorrigir } from '../../lib/cadastroPorDocumentos'
import { formatarKg } from '../../../../supabase/functions/_shared/unidades-br.ts'

// Ponto de entrada do fluxo novo na tela Cadastros. Com a flag desligada (padrao) NAO renderiza nada: a tela continua como hoje.
export default function CadastroPorDocumentosAcesso() {
  const [aberto, setAberto] = useState(false)
  const [lista, setLista] = useState<VeiculoParaCorrigir[] | null>(null)
  const [verLista, setVerLista] = useState(false)
  const [quem, setQuem] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function carregar() {
    // select defensivo: colunas que a migracao ainda pode nao ter sido aplicada ficam de fora
    const { data, error } = await supabase.from('veiculos').select('id, placa, tara_kg, capacidade_carga, e_reboque, tipo_veiculo, quantidade_eixos').is('deleted_at', null)
    if (error) { setErro('Nao consegui carregar a lista de veiculos agora.'); return }
    setErro(null)
    setLista(veiculosParaCorrigir((data ?? []) as never))
  }

  useEffect(() => {
    if (!CADASTRO_POR_DOCUMENTOS_HABILITADO) return
    void carregar()
    void supabase.auth.getUser().then(async ({ data }) => {
      const id = data.user?.id
      if (!id) return
      const { data: p } = await supabase.from('pessoas').select('nome').eq('auth_user_id', id).maybeSingle()
      setQuem(p?.nome?.split(' ')[0] ?? null)
    })
  }, [])

  if (!CADASTRO_POR_DOCUMENTOS_HABILITADO) return null
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Botao onClick={() => setAberto(true)}>Novo cadastro por documentos</Botao>
      <Botao variante="secundario" onClick={() => setVerLista((v) => !v)}>
        Cadastros para corrigir{lista ? ` (${lista.length})` : ''}
      </Botao>
      {erro && <Aviso tipo="atencao">{erro}</Aviso>}
      {verLista && lista && (
        <div className="basis-full rounded border p-2 text-xs flex flex-col gap-1" style={{ borderColor: 'var(--rbr-border)' }}>
          {lista.length === 0 && <div>Nenhum veiculo com tara ou capacidade fora da faixa.</div>}
          {lista.map((v) => (
            <div key={v.placa}>
              <b>{v.placa}</b> - tara {v.tara_kg === null ? '-' : formatarKg(Number(v.tara_kg)) || String(v.tara_kg)}, capacidade {v.capacidade_carga === null ? '-' : String(v.capacidade_carga)}: {v.motivos.join('; ')}.
              {' '}Corrija enviando o CRLV (botao acima). Nada e alterado sozinho.
            </div>
          ))}
        </div>
      )}
      {aberto && <NovoCadastroPorDocumentos quem={quem} onFechar={() => setAberto(false)} aoConcluir={() => void carregar()} />}
    </div>
  )
}
