import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@rbr/shared/supabaseClient'
import { formatDateTime } from '@rbr/shared/format'
import { Aviso, Botao, Card, Carregando, Vazio } from '../components/financeiro/ui'
import { codigoCurto } from '../lib/painelOperacao'
import { mensagemClara } from '../lib/mensagemClara'

// G09 · Saúde fiscal: o que o robô de conferência achou nas operações recentes (documento pendente, CT-e sem averbação,
// MDF-e aberto depois da entrega, CIOT perto do prazo, vale-pedágio em operação cancelada). Só leitura; "Verificar agora" chama a
// função saude-fiscal, que NÃO emite, NÃO cancela e NÃO averba nada.

type Gravidade = 'verde' | 'amarelo' | 'vermelho' | 'precisa_de_voce'
type Achado = { id: string; operacao_id: string | null; gravidade: Gravidade; mensagem: string; criado_em: string }

const COR: Record<Gravidade, { rotulo: string; fundo: string; cor: string }> = {
  verde: { rotulo: 'Tudo em dia', fundo: '#E7F5EC', cor: 'var(--rbr-positive)' },
  amarelo: { rotulo: 'Atenção', fundo: '#FDF1DC', cor: '#8A5A00' },
  vermelho: { rotulo: 'Problema', fundo: '#FBE9E9', cor: 'var(--rbr-danger)' },
  precisa_de_voce: { rotulo: 'Precisa de você', fundo: '#FBE9E9', cor: 'var(--rbr-danger)' },
}
const ORDEM: Gravidade[] = ['precisa_de_voce', 'vermelho', 'amarelo', 'verde']

export function gravidadeGeral(achados: { gravidade: Gravidade }[]): Gravidade {
  return ORDEM.find((g) => achados.some((a) => a.gravidade === g)) ?? 'verde'
}

export default function SaudeFiscal() {
  const [achados, setAchados] = useState<Achado[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [verificando, setVerificando] = useState(false)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from('saude_fiscal_achados')
      .select('id, operacao_id, gravidade, mensagem, criado_em')
      .is('resolvido_em', null)
      .order('criado_em', { ascending: false })
      .limit(200)
    if (error) setErro(`Não consegui ler os achados. ${mensagemClara(error, '')}`.trim())
    else setErro(null)
    setAchados(error ? [] : ((data ?? []) as Achado[]))
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  async function verificarAgora() {
    setVerificando(true)
    setErro(null)
    try {
      const { data, error } = await supabase.functions.invoke('saude-fiscal', { body: {} })
      if (error || data?.ok === false) setErro(`A verificação não rodou. ${data?.erro ?? mensagemClara(error, '')}`.trim())
      await carregar()
    } catch (e) {
      setErro(mensagemClara(e, 'A verificação não rodou.'))
    } finally {
      setVerificando(false)
    }
  }

  const geral = gravidadeGeral(achados ?? [])
  const cor = COR[geral]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="rbr-display font-bold text-2xl md:text-3xl text-[color:var(--rbr-navy-dark)]">Saúde fiscal</h1>
        <Botao onClick={() => void verificarAgora()} disabled={verificando}>
          {verificando ? 'Verificando…' : 'Verificar agora'}
        </Botao>
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {achados === null ? (
        <Carregando />
      ) : (
        <>
          <div className="rounded-2xl px-4 py-3 font-bold" style={{ background: cor.fundo, color: cor.cor }} role="status">
            {cor.rotulo}
            {achados.length > 0 && <span className="font-normal"> · {achados.length} item(ns) em aberto</span>}
          </div>
          {achados.length === 0 ? (
            <Vazio>Nenhum achado em aberto. Toque em "Verificar agora" para conferir de novo.</Vazio>
          ) : (
            <div className="flex flex-col gap-2">
              {achados.map((a) => (
                <Card key={a.id}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex flex-col gap-1">
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full self-start" style={{ background: COR[a.gravidade].fundo, color: COR[a.gravidade].cor }}>
                        {COR[a.gravidade].rotulo}
                      </span>
                      <div className="text-sm text-[color:var(--rbr-navy-dark)]">{a.mensagem}</div>
                      <div className="text-xs text-[color:var(--rbr-muted)]">{formatDateTime(a.criado_em)}</div>
                    </div>
                    {a.operacao_id && (
                      <Link to={`/operacoes?op=${a.operacao_id}`} className="text-xs font-bold text-[color:var(--rbr-navy)] underline">
                        Abrir operação {codigoCurto(a.operacao_id)}
                      </Link>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
