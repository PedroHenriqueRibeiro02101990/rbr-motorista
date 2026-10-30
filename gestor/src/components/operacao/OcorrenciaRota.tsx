import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { fluxoDaOcorrencia, type TipoOcorrencia } from '@rbr/shared/regrasFluxo'
import { mensagemClara } from '../../lib/mensagemClara'

// D10 · Ocorrência em rota (quadro 49). Registra o que aconteceu, mostra o próximo passo certo para o tipo e deixa encerrar com motivo.
// Usa as funções do banco registrar_incidente_carga e encerrar_incidente_carga (que já existem).
const TIPOS: { id: TipoOcorrencia; rotulo: string }[] = [
  { id: 'atraso', rotulo: 'Atraso' },
  { id: 'avaria', rotulo: 'Avaria' },
  { id: 'quebra', rotulo: 'Quebra do veículo' },
  { id: 'acidente', rotulo: 'Acidente' },
  { id: 'recusa', rotulo: 'Recusa na entrega' },
  { id: 'roubo', rotulo: 'Roubo' },
]
type Incidente = { id: string; descricao: string; status: string; registrado_em: string }
type ChamaRpc = (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>

export default function OcorrenciaRota({ operacaoId }: { operacaoId: string }) {
  const [lista, setLista] = useState<Incidente[]>([])
  const [aberto, setAberto] = useState(false)
  const [tipo, setTipo] = useState<TipoOcorrencia>('atraso')
  const [texto, setTexto] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [proximo, setProximo] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('incidentes_carga').select('id, descricao, status, registrado_em').eq('operacao_id', operacaoId).order('registrado_em', { ascending: false }).limit(10)
    setLista((data ?? []) as Incidente[])
  }, [operacaoId])
  useEffect(() => {
    void carregar()
  }, [carregar])

  async function registrar() {
    setOcupado(true)
    setErro(null)
    const rotulo = TIPOS.find((t) => t.id === tipo)?.rotulo ?? tipo
    const { error } = await (supabase.rpc as unknown as ChamaRpc).call(supabase, 'registrar_incidente_carga', { p_operacao: operacaoId, p_descricao: `[${rotulo}] ${texto.trim()}` })
    setOcupado(false)
    if (error) return setErro(mensagemClara(error, 'Não consegui registrar agora.'))
    setProximo(fluxoDaOcorrencia(tipo).proximo)
    setTexto('')
    setAberto(false)
    await carregar()
  }

  async function encerrar(id: string) {
    const motivo = window.prompt('Motivo para encerrar a ocorrência:')?.trim()
    if (!motivo || motivo.length < 5) return
    const { error } = await (supabase.rpc as unknown as ChamaRpc).call(supabase, 'encerrar_incidente_carga', { p_incidente: id, p_motivo: motivo })
    if (error) setErro(mensagemClara(error, 'Não consegui encerrar.'))
    await carregar()
  }

  const caixa = 'text-xs rounded-lg border px-2.5 py-1.5 bg-white'
  const abertas = lista.filter((i) => i.status !== 'encerrado' && i.status !== 'encerrada')
  return (
    <div className="flex flex-col gap-2 text-xs">
      {proximo && (
        <div className="rounded-xl px-3 py-2 font-semibold" style={{ background: '#FDF1DC', color: '#8A5A00' }} role="status">
          Ocorrência registrada e gestores avisados. Próximo passo: {proximo}
        </div>
      )}
      {abertas.map((i) => (
        <div key={i.id} className="flex items-center justify-between gap-2 flex-wrap rounded-xl px-3 py-2" style={{ background: '#FBE9E9' }}>
          <span className="font-semibold text-[color:var(--rbr-navy-dark)]">{i.descricao}</span>
          <button type="button" onClick={() => void encerrar(i.id)} className="font-bold underline">
            Encerrar
          </button>
        </div>
      ))}
      {!aberto ? (
        <button type="button" onClick={() => setAberto(true)} className="font-bold underline self-start text-[color:var(--rbr-navy)]">
          Registrar ocorrência em rota
        </button>
      ) : (
        <div className="flex items-center gap-2 flex-wrap">
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoOcorrencia)} className={caixa} style={{ borderColor: 'var(--rbr-border)' }} aria-label="Tipo da ocorrência" disabled={ocupado}>
            {TIPOS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.rotulo}
              </option>
            ))}
          </select>
          <input value={texto} onChange={(e) => setTexto(e.target.value)} className={caixa} style={{ borderColor: 'var(--rbr-border)', flex: '1 1 220px' }} placeholder="O que aconteceu (mín. 5 letras)" aria-label="Descrição da ocorrência" disabled={ocupado} />
          <button type="button" onClick={() => void registrar()} disabled={ocupado || texto.trim().length < 5} className="font-bold underline disabled:opacity-50 text-[color:var(--rbr-navy)]">
            {ocupado ? 'Registrando…' : 'Registrar'}
          </button>
          <button type="button" onClick={() => setAberto(false)} className="underline text-[color:var(--rbr-muted)]">
            Voltar
          </button>
        </div>
      )}
      {erro && <span style={{ color: 'var(--rbr-danger)' }}>{erro}</span>}
    </div>
  )
}
