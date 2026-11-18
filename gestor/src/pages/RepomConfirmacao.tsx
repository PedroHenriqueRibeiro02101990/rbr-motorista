import { useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { Aviso, Botao, Campo, Card, inputClass, inputStyle } from '../components/financeiro/ui'
import {
  CLIENTES,
  TEXTO_TRAVA,
  assinaturaDoFormulario,
  erroCurto,
  estadoDaTrava,
  funcaoDoCliente,
  lerPrevia,
  montarEntradaEnvio,
  montarEntradaPrevia,
  podeEnviar,
  resumoDaPrevia,
  statusDoEnvio,
  validarFormulario,
  type ClienteRepom,
  type EstadoTrava,
  type FormularioRepom,
  type PreviaRecebida,
  type SaidaEnvio,
} from '../lib/repomConfirmacao'

// Prévia e confirmação humana do Repom (9501 vale-pedágio, 9520 frete/CIOT). Escondida atrás de VITE_REPOM_UI = "sim".
// NÃO mergear antes da homologação da Repom e da revisão do Pedro. Nunca mostra token nem senha.

async function chamar(funcao: string, corpo: Record<string, unknown>): Promise<{ status: number; corpo: unknown }> {
  const { data, error } = await supabase.functions.invoke(funcao, { body: corpo })
  if (!error) return { status: 200, corpo: data }
  const resp = (error as { context?: Response }).context
  if (resp && typeof resp.json === 'function') {
    const status = typeof resp.status === 'number' ? resp.status : 500
    return { status, corpo: await resp.json().catch(() => ({ erro: `A função respondeu ${status}.` })) }
  }
  return { status: 0, corpo: { erro: 'Não consegui falar com o servidor.' } }
}

export default function RepomConfirmacao() {
  const [form, setForm] = useState<FormularioRepom>({ cliente: '9501', operacaoId: '', valor: '', rota: '', dadosJson: '' })
  const [previa, setPrevia] = useState<PreviaRecebida | null>(null)
  const [assinatura, setAssinatura] = useState<string | null>(null)
  const [geradaEm, setGeradaEm] = useState<number | null>(null)
  const [trava, setTrava] = useState<EstadoTrava>('desconhecida')
  const [nome, setNome] = useState('')
  const [confirmou, setConfirmou] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [envio, setEnvio] = useState<SaidaEnvio | null>(null)

  const mudou = previa != null && assinatura !== assinaturaDoFormulario(form)
  const decisao = podeEnviar({ previa, formularioMudou: mudou, nome, confirmou, ocupado, trava, geradaEm })

  function alterar(p: Partial<FormularioRepom>) {
    setForm((f) => ({ ...f, ...p }))
    setConfirmou(false)
    setEnvio(null)
  }

  async function gerarPrevia() {
    setErro(null)
    setEnvio(null)
    const inval = validarFormulario(form)
    if (inval) return setErro(inval)
    setOcupado(true)
    const r = await chamar(funcaoDoCliente(form.cliente), montarEntradaPrevia(form))
    setOcupado(false)
    setTrava(estadoDaTrava(r.status, r.corpo))
    const p = lerPrevia(r.corpo)
    if (!p) {
      setPrevia(null)
      return setErro(erroCurto((r.corpo as { erro?: unknown } | null)?.erro ?? `A função respondeu ${r.status}.`))
    }
    setPrevia(p)
    setAssinatura(assinaturaDoFormulario(form))
    setGeradaEm(Date.now())
    setConfirmou(false)
  }

  async function enviar() {
    if (!previa || !decisao.pode) return
    setErro(null)
    setOcupado(true)
    const r = await chamar(funcaoDoCliente(form.cliente), montarEntradaEnvio(form, previa.previa_hash, nome))
    setOcupado(false)
    setEnvio(statusDoEnvio(r.status, r.corpo))
    setConfirmou(false)
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-xl font-bold text-[color:var(--rbr-navy-dark)]">Repom · prévia e confirmação</h1>
      <Aviso tipo="atencao">Tela em teste, ligada por VITE_REPOM_UI. Só use depois da homologação da Repom. Nada é enviado sem a prévia e a sua confirmação.</Aviso>

      <Card titulo="1. Dados da operação">
        <div className="grid gap-3 md:grid-cols-2">
          <Campo label="Cliente Repom">
            <select aria-label="Cliente Repom" className={inputClass} style={inputStyle} value={form.cliente} onChange={(e) => alterar({ cliente: e.target.value as ClienteRepom })}>
              {CLIENTES.map((c) => (
                <option key={c.id} value={c.id}>{c.rotulo}</option>
              ))}
            </select>
          </Campo>
          <Campo label="Operação (id)">
            <input aria-label="Operação" className={inputClass} style={inputStyle} value={form.operacaoId} onChange={(e) => alterar({ operacaoId: e.target.value })} />
          </Campo>
          <Campo label="Valor (R$)">
            <input aria-label="Valor" inputMode="decimal" className={inputClass} style={inputStyle} value={form.valor} onChange={(e) => alterar({ valor: e.target.value })} />
          </Campo>
          {form.cliente === '9501' && (
            <Campo label="Descrição da rota">
              <input aria-label="Rota" className={inputClass} style={inputStyle} value={form.rota} onChange={(e) => alterar({ rota: e.target.value })} />
            </Campo>
          )}
          <Campo className="md:col-span-2" label={form.cliente === '9501' ? 'Pedido do vale-pedágio (JSON)' : 'Contrato de frete (JSON)'} dica="Os mesmos campos que a função espera.">
            <textarea aria-label="Dados da operação" rows={8} className={`${inputClass} font-mono text-xs`} style={inputStyle} value={form.dadosJson} onChange={(e) => alterar({ dadosJson: e.target.value })} />
          </Campo>
        </div>
        <div className="mt-3">
          <Botao onClick={gerarPrevia} disabled={ocupado}>Gerar prévia</Botao>
        </div>
      </Card>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {previa && (
        <Card titulo="2. Prévia">
          <dl className="grid gap-x-6 gap-y-1 text-sm md:grid-cols-2">
            {resumoDaPrevia(previa, form.cliente).map((l) => (
              <div key={l.rotulo} className="flex justify-between gap-3 border-b py-1" style={{ borderColor: 'var(--rbr-border)' }}>
                <dt className="text-[color:var(--rbr-muted)]">{l.rotulo}</dt>
                <dd className="font-semibold text-right">{l.valor}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs font-bold" data-testid="trava">{TEXTO_TRAVA[trava]}</p>
          {mudou && <Aviso tipo="atencao">Os dados mudaram depois da prévia. Gere a prévia de novo.</Aviso>}
        </Card>
      )}

      {previa && (
        <Card titulo="3. Confirmação humana">
          <div className="space-y-3">
            <Campo label="Nome do responsável" dica="Quem está autorizando este envio (mínimo 3 letras).">
              <input aria-label="Nome do responsável" className={inputClass} style={inputStyle} value={nome} onChange={(e) => setNome(e.target.value)} />
            </Campo>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" aria-label="Confirmo" checked={confirmou} onChange={(e) => setConfirmou(e.target.checked)} />
              <span>Conferi a prévia e autorizo o envio à Repom ({previa.ambiente === 'prd' ? 'PRODUÇÃO' : 'QA'}).</span>
            </label>
            <div className="flex items-center gap-3">
              <Botao onClick={enviar} disabled={!decisao.pode} variante="ouro">Enviar à Repom</Botao>
              {decisao.motivo && <span className="text-xs text-[color:var(--rbr-muted)]">{decisao.motivo}</span>}
            </div>
          </div>
        </Card>
      )}

      {envio && (
        <Aviso tipo={envio.tipo === 'emitido' ? 'ok' : envio.tipo === 'incerto' ? 'atencao' : 'erro'}>
          {envio.tipo === 'emitido' ? 'Enviado. ' : envio.tipo === 'incerto' ? 'Resultado incerto, não envie de novo. ' : 'Não enviado. '}
          {envio.texto}
        </Aviso>
      )}
    </div>
  )
}
