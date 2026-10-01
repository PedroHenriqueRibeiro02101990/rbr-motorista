import { useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'

// Eventos fiscais pós-emissão (encerrar MDF-e, cancelar MDF-e/CT-e, carta de correção, trocar condutor).
// Tudo passa pela Edge Function `eventos-fiscais`, que valida as regras, chama a Focus NFe e grava o log de auditoria.

export type AcaoEventoFiscal = 'encerrar_mdfe' | 'cancelar_mdfe' | 'cancelar_cte' | 'carta_correcao_cte' | 'incluir_condutor_mdfe'

const TITULOS: Record<AcaoEventoFiscal, string> = {
  encerrar_mdfe: 'Encerrar MDF-e',
  cancelar_mdfe: 'Cancelar MDF-e',
  cancelar_cte: 'Cancelar CT-e',
  carta_correcao_cte: 'Carta de correção do CT-e',
  incluir_condutor_mdfe: 'Trocar / incluir condutor no MDF-e',
}

const AVISOS: Record<AcaoEventoFiscal, string> = {
  encerrar_mdfe:
    'Normalmente o MDF-e é encerrado sozinho quando o motorista finaliza a entrega. Use isto só se isso não aconteceu ou se a entrega foi feita de outro jeito. Prazo legal: até 30 dias da emissão.',
  cancelar_mdfe:
    'Só vale para MDF-e autorizado, antes de a viagem começar (regra legal: até 24 horas). Depois disso o caminho é encerrar. O cancelamento não pode ser desfeito.',
  cancelar_cte:
    'Só vale para CT-e autorizado, e o MDF-e dessa operação precisa estar cancelado antes. O cancelamento não pode ser desfeito e a SEFAZ aplica o prazo legal.',
  carta_correcao_cte:
    'Não corrige valor, peso, remetente, destinatário nem datas. A carta é cumulativa (até 20): a última enviada é a que vale, então reenvie as correções anteriores que quiser manter.',
  incluir_condutor_mdfe: 'Registra um motorista adicional no MDF-e já autorizado (evento fiscal). Só vale antes do encerramento.',
}

type Erro = { erro?: string }

async function extrairErro(error: unknown): Promise<string> {
  try {
    const context = (error as { context?: unknown } | null | undefined)?.context
    if (context && typeof (context as Response).json === 'function') {
      const body = (await (context as Response).json()) as Erro
      if (body?.erro) return body.erro
    }
  } catch {
    // corpo não veio como JSON — cai no fallback
  }
  return error instanceof Error ? error.message : 'Erro desconhecido ao chamar a função.'
}

export default function EventoFiscalModal({
  operacaoId,
  acao,
  cidadeDestino,
  ufDestino,
  onFechar,
  onConcluido,
}: {
  operacaoId: string
  acao: AcaoEventoFiscal
  cidadeDestino?: string | null
  ufDestino?: string | null
  onFechar: () => void
  onConcluido: () => void
}) {
  const [justificativa, setJustificativa] = useState('')
  const [data, setData] = useState(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }))
  const [uf, setUf] = useState(ufDestino ?? '')
  const [municipio, setMunicipio] = useState(cidadeDestino ?? '')
  const [campo, setCampo] = useState('')
  const [valor, setValor] = useState('')
  const [grupo, setGrupo] = useState('')
  const [item, setItem] = useState('')
  const [nome, setNome] = useState('')
  const [cpf, setCpf] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const cancelamento = acao === 'cancelar_mdfe' || acao === 'cancelar_cte'

  async function enviar() {
    setEnviando(true)
    setErro(null)
    setAviso(null)
    const body: Record<string, unknown> = { acao, operacao_id: operacaoId }
    if (cancelamento) body.justificativa = justificativa
    if (acao === 'encerrar_mdfe') {
      body.data = data
      body.sigla_uf = uf
      body.nome_municipio = municipio
    }
    if (acao === 'carta_correcao_cte') {
      body.campo_corrigido = campo
      body.valor_corrigido = valor
      if (grupo) body.grupo_corrigido = grupo
      if (item) body.numero_item_grupo_corrigido = item
    }
    if (acao === 'incluir_condutor_mdfe') {
      body.nome = nome
      body.cpf = cpf
    }
    const { data: resp, error } = await supabase.functions.invoke('eventos-fiscais', { body })
    setEnviando(false)
    if (error || resp?.sucesso === false) {
      setErro(error ? await extrairErro(error) : (resp?.erro ?? 'Não foi possível concluir.'))
      return
    }
    if (resp?.aviso) setAviso(String(resp.aviso))
    onConcluido()
    if (!resp?.aviso) onFechar()
  }

  const campoCls = 'text-xs rounded-lg border px-2.5 py-1.5 w-full bg-white'
  const campoStyle = { borderColor: 'var(--rbr-border)' }
  const rotulo = 'flex flex-col gap-1 text-[11px] text-[color:var(--rbr-muted)]'
  const pode =
    (cancelamento && justificativa.trim().length >= 15) ||
    (acao === 'encerrar_mdfe' && !!data && !!uf && !!municipio) ||
    (acao === 'carta_correcao_cte' && !!campo && !!valor) ||
    (acao === 'incluir_condutor_mdfe' && nome.trim().length >= 2 && cpf.replace(/\D/g, '').length === 11)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3" style={{ background: 'rgba(18,23,61,0.55)' }}>
      <div className="bg-white rounded-xl w-full max-w-md max-h-[92vh] flex flex-col" style={{ boxShadow: '0 20px 60px rgba(18,23,61,0.35)' }}>
        <div className="px-5 pt-4 pb-3 border-b" style={{ borderColor: 'var(--rbr-border)' }}>
          <div className="text-sm font-extrabold text-[color:var(--rbr-navy-dark)]">{TITULOS[acao]}</div>
          <div className="text-[11px] text-[color:var(--rbr-muted)] mt-0.5">{AVISOS[acao]}</div>
        </div>

        <div className="px-5 py-3 overflow-y-auto flex flex-col gap-2.5">
          {cancelamento && (
            <label className={rotulo}>
              Justificativa (15 a 255 caracteres) — {justificativa.trim().length}/255
              <textarea className={campoCls} style={campoStyle} rows={3} maxLength={255} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} />
            </label>
          )}

          {acao === 'encerrar_mdfe' && (
            <>
              <label className={rotulo}>
                Data do encerramento
                <input type="date" className={campoCls} style={campoStyle} value={data} onChange={(e) => setData(e.target.value)} />
              </label>
              <div className="grid gap-2.5" style={{ gridTemplateColumns: '1fr 80px' }}>
                <label className={rotulo}>
                  Município do encerramento
                  <input className={campoCls} style={campoStyle} value={municipio} onChange={(e) => setMunicipio(e.target.value)} />
                </label>
                <label className={rotulo}>
                  UF
                  <input className={campoCls} style={campoStyle} value={uf} maxLength={2} onChange={(e) => setUf(e.target.value.toUpperCase())} />
                </label>
              </div>
            </>
          )}

          {acao === 'carta_correcao_cte' && (
            <>
              <label className={rotulo}>
                Campo a corrigir (nome do campo na API, ex.: observacao)
                <input className={campoCls} style={campoStyle} value={campo} onChange={(e) => setCampo(e.target.value)} />
              </label>
              <label className={rotulo}>
                Novo valor
                <input className={campoCls} style={campoStyle} value={valor} onChange={(e) => setValor(e.target.value)} />
              </label>
              <div className="grid gap-2.5" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <label className={rotulo}>
                  Grupo (opcional)
                  <input className={campoCls} style={campoStyle} value={grupo} onChange={(e) => setGrupo(e.target.value)} />
                </label>
                <label className={rotulo}>
                  Nº do item no grupo (opcional)
                  <input className={campoCls} style={campoStyle} value={item} inputMode="numeric" onChange={(e) => setItem(e.target.value)} />
                </label>
              </div>
            </>
          )}

          {acao === 'incluir_condutor_mdfe' && (
            <>
              <label className={rotulo}>
                Nome do condutor
                <input className={campoCls} style={campoStyle} value={nome} onChange={(e) => setNome(e.target.value)} />
              </label>
              <label className={rotulo}>
                CPF do condutor
                <input className={campoCls} style={campoStyle} value={cpf} inputMode="numeric" onChange={(e) => setCpf(e.target.value)} />
              </label>
            </>
          )}

          {erro && (
            <div className="text-xs rounded-lg px-3 py-2.5" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
              {erro}
            </div>
          )}
          {aviso && (
            <div className="text-xs rounded-lg px-3 py-2.5" style={{ background: '#E8F5EC', color: 'var(--rbr-positive)' }}>
              Enviado. {aviso}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t flex items-center justify-end gap-2" style={{ borderColor: 'var(--rbr-border)' }}>
          <button onClick={onFechar} disabled={enviando} className="text-xs font-bold px-3.5 py-2 rounded-lg border disabled:opacity-60" style={{ borderColor: 'var(--rbr-navy)', color: 'var(--rbr-navy)' }}>
            {aviso ? 'Fechar' : 'Cancelar'}
          </button>
          {!aviso && (
            <button
              onClick={enviar}
              disabled={!pode || enviando}
              className="text-xs font-bold px-3.5 py-2 rounded-lg disabled:opacity-50"
              style={{ background: cancelamento ? 'var(--rbr-danger)' : 'var(--rbr-navy)', color: '#fff' }}
            >
              {enviando ? 'Enviando…' : `Confirmar — ${TITULOS[acao]}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
