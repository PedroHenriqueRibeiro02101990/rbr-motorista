import { useEffect, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import type { Database } from '@rbr/shared/database.types'
import { consultarCnpj } from '@rbr/shared/consultaCadastro'

type ParametrosFiscais = Database['public']['Tables']['parametros_fiscais']['Row']

// Campos que, se vazios, entram na lista de pendências mostrada no topo do
// painel — cada um tem uma explicação curta de por que falta e quem resolve.
// Mantido à parte da lógica de bloqueio das Edge Functions (emitir-cte,
// emitir-nfse-intramunicipal) — aqui é só um resumo visual pro gestor não
// precisar abrir o Supabase pra saber o que falta.
type Pendencia = { campo: keyof ParametrosFiscais; label: string; motivo: string }

const PENDENCIAS: Pendencia[] = [
  {
    campo: 'inscricao_municipal',
    label: 'Inscrição Municipal (IM)',
    motivo: 'necessária pra NFS-e municipal comum de São Paulo — confirmar no CCM da Prefeitura de SP ou com o Alan.',
  },
  {
    campo: 'csosn',
    label: 'CSOSN (101 ou 102)',
    motivo: 'a RBR é Simples Nacional — sem isso o CT-e não sabe como declarar o ICMS. Confirmar com o Alan.',
  },
  {
    campo: 'item_lista_servico_transporte_municipal',
    label: 'Item de serviço (LC 116) pra NFS-e',
    motivo: 'código do item 16.xx da lista de serviços — confirmar com o Alan antes da 1ª emissão de NFS-e intramunicipal.',
  },
]

const inputStyle = {
  borderColor: 'var(--rbr-border)',
}

function Campo({
  label,
  children,
  hint,
}: {
  label: string
  children: React.ReactNode
  hint?: string
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-bold text-[color:var(--rbr-muted)] uppercase tracking-wide">{label}</span>
      {children}
      {hint && <span className="text-[10px] text-[color:var(--rbr-muted)]">{hint}</span>}
    </label>
  )
}

export default function ParametrosFiscaisPanel() {
  const [aberto, setAberto] = useState(false)
  const [pf, setPf] = useState<ParametrosFiscais | null>(null)
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [salvoOk, setSalvoOk] = useState(false)

  useEffect(() => {
    let ativo = true
    async function carregar() {
      setLoading(true)
      const { data, error } = await supabase
        .from('parametros_fiscais')
        .select('*')
        .eq('provedor', 'focusnfe')
        .maybeSingle()
      if (!ativo) return
      if (error) setErro(error.message)
      setPf(data)
      setLoading(false)
    }
    carregar()
    return () => {
      ativo = false
    }
  }, [])

  const pendencias = pf ? PENDENCIAS.filter((p) => !pf[p.campo]) : []

  // Ao sair do CNPJ, completa razão social, IE e endereço (só o que está vazio).
  async function autoCnpjRbr() {
    if (!pf) return
    const r = await consultarCnpj(pf.cnpj ?? '')
    const d = r.dados
    if (!d) return
    setPf((atual) => {
      if (!atual) return atual
      const v = (x: string | null | undefined) => (x && String(x).trim() ? x : null)
      return {
        ...atual,
        razao_social: v(atual.razao_social) ?? d.razao_social ?? atual.razao_social,
        inscricao_estadual: v(atual.inscricao_estadual) ?? d.inscricao_estadual,
        endereco_logradouro: v(atual.endereco_logradouro) ?? d.logradouro,
        endereco_numero: v(atual.endereco_numero) ?? d.numero_endereco,
        endereco_complemento: v(atual.endereco_complemento) ?? d.complemento,
        endereco_bairro: v(atual.endereco_bairro) ?? d.bairro,
        endereco_cep: v(atual.endereco_cep) ?? d.cep,
        endereco_uf: v(atual.endereco_uf) ?? d.uf,
        endereco_codigo_municipio: v(atual.endereco_codigo_municipio) ?? d.codigo_ibge,
      }
    })
  }

  function set<K extends keyof ParametrosFiscais>(campo: K, valor: ParametrosFiscais[K]) {
    setPf((atual) => (atual ? { ...atual, [campo]: valor } : atual))
    setSalvoOk(false)
  }

  async function salvar() {
    if (!pf) return
    setSalvando(true)
    setErro(null)
    setSalvoOk(false)
    const { id, created_at, ...resto } = pf
    const { error } = await supabase.from('parametros_fiscais').update(resto).eq('id', id)
    setSalvando(false)
    if (error) {
      setErro(error.message)
      return
    }
    setSalvoOk(true)
  }

  if (loading) {
    return (
      <div className="bg-white border rounded-[20px] p-[18px] text-sm text-[color:var(--rbr-muted)]" style={{ borderColor: 'var(--rbr-border)' }}>
        Carregando parâmetros fiscais…
      </div>
    )
  }

  if (!pf) {
    return (
      <div className="bg-white border rounded-[20px] p-[18px] text-sm" style={{ borderColor: 'var(--rbr-border)', color: 'var(--rbr-danger)' }}>
        {erro ?? 'Nenhuma configuração fiscal encontrada (parametros_fiscais).'}
      </div>
    )
  }

  return (
    <div className="bg-white border rounded-[20px] p-[18px] flex flex-col gap-3" style={{ borderColor: 'var(--rbr-border)' }}>
      <button
        onClick={() => setAberto((a) => !a)}
        className="flex items-center justify-between gap-3 w-full text-left"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[15px] font-bold text-[color:var(--rbr-navy-dark)]">Parâmetros Fiscais</span>
          <span
            className="text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full"
            style={{
              background: pf.ativo ? 'var(--rbr-positive)' : 'var(--rbr-muted-bg)',
              color: pf.ativo ? '#fff' : 'var(--rbr-muted)',
            }}
          >
            {pf.provedor} · {pf.ambiente} · {pf.ativo ? 'ativo' : 'inativo'}
          </span>
          {pendencias.length > 0 && (
            <span
              className="text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full"
              style={{ background: 'var(--rbr-warning-bg)', color: 'var(--rbr-navy-dark)' }}
            >
              {pendencias.length} pendência{pendencias.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <span className="text-xs font-bold text-[color:var(--rbr-navy)]">{aberto ? 'Fechar' : 'Configurar'}</span>
      </button>

      {!aberto && pendencias.length > 0 && (
        <ul className="flex flex-col gap-1 pl-1">
          {pendencias.map((p) => (
            <li key={p.campo} className="text-[11px] text-[color:var(--rbr-muted)]">
              <span className="font-bold" style={{ color: 'var(--rbr-navy-dark)' }}>
                {p.label}:
              </span>{' '}
              {p.motivo}
            </li>
          ))}
        </ul>
      )}

      {aberto && (
        <div className="flex flex-col gap-5">
          {pendencias.length > 0 && (
            <div
              className="text-xs rounded-lg px-3 py-2.5 flex flex-col gap-1"
              style={{ background: 'var(--rbr-warning-bg)', color: 'var(--rbr-navy-dark)' }}
            >
              <span className="font-bold">Ainda falta confirmar:</span>
              <ul className="list-disc pl-4 flex flex-col gap-0.5">
                {pendencias.map((p) => (
                  <li key={p.campo}>
                    <span className="font-bold">{p.label}</span> — {p.motivo}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <section className="flex flex-col gap-2.5">
            <div className="text-xs font-bold text-[color:var(--rbr-navy)]">Dados do emitente</div>
            <div className="grid grid-cols-2 gap-2.5">
              <Campo label="Razão social">
                <input
                  value={pf.razao_social ?? ''}
                  onChange={(e) => set('razao_social', e.target.value)}
                  className="border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                  style={inputStyle}
                />
              </Campo>
              <Campo label="CNPJ">
                <input
                  value={pf.cnpj ?? ''}
                  onChange={(e) => set('cnpj', e.target.value)}
                  onBlur={autoCnpjRbr}
                  className="border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                  style={inputStyle}
                />
              </Campo>
              <Campo label="Inscrição Estadual (IE)">
                <input
                  value={pf.inscricao_estadual ?? ''}
                  onChange={(e) => set('inscricao_estadual', e.target.value || null)}
                  className="border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                  style={inputStyle}
                />
              </Campo>
              <Campo label="Inscrição Municipal (IM)" hint="Necessária pra NFS-e municipal de SP.">
                <input
                  value={pf.inscricao_municipal ?? ''}
                  onChange={(e) => set('inscricao_municipal', e.target.value || null)}
                  className="border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                  style={inputStyle}
                />
              </Campo>
              <Campo label="RNTRC (ETC)">
                <input
                  value={pf.rntrc ?? ''}
                  onChange={(e) => set('rntrc', e.target.value || null)}
                  className="border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                  style={inputStyle}
                />
              </Campo>
            </div>
          </section>

          <section className="flex flex-col gap-2.5">
            <div className="text-xs font-bold text-[color:var(--rbr-navy)]">Endereço do estabelecimento</div>
            <div className="grid grid-cols-2 gap-2.5">
              <Campo label="Logradouro">
                <input
                  value={pf.endereco_logradouro ?? ''}
                  onChange={(e) => set('endereco_logradouro', e.target.value || null)}
                  className="border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                  style={inputStyle}
                />
              </Campo>
              <Campo label="Número">
                <input
                  value={pf.endereco_numero ?? ''}
                  onChange={(e) => set('endereco_numero', e.target.value || null)}
                  className="border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                  style={inputStyle}
                />
              </Campo>
              <Campo label="Complemento">
                <input
                  value={pf.endereco_complemento ?? ''}
                  onChange={(e) => set('endereco_complemento', e.target.value || null)}
                  className="border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                  style={inputStyle}
                />
              </Campo>
              <Campo label="Bairro">
                <input
                  value={pf.endereco_bairro ?? ''}
                  onChange={(e) => set('endereco_bairro', e.target.value || null)}
                  className="border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                  style={inputStyle}
                />
              </Campo>
              <Campo label="CEP">
                <input
                  value={pf.endereco_cep ?? ''}
                  onChange={(e) => set('endereco_cep', e.target.value || null)}
                  className="border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                  style={inputStyle}
                />
              </Campo>
              <Campo label="UF">
                <input
                  value={pf.endereco_uf ?? ''}
                  onChange={(e) => set('endereco_uf', e.target.value.toUpperCase() || null)}
                  maxLength={2}
                  className="border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                  style={inputStyle}
                />
              </Campo>
            </div>
          </section>

          <section className="flex flex-col gap-2.5">
            <div className="text-xs font-bold text-[color:var(--rbr-navy)]">Contato comercial (aparece no documento)</div>
            <div className="grid grid-cols-2 gap-2.5">
              <Campo label="Telefone">
                <input
                  value={pf.telefone_contato ?? ''}
                  onChange={(e) => set('telefone_contato', e.target.value || null)}
                  className="border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                  style={inputStyle}
                />
              </Campo>
              <Campo label="E-mail">
                <input
                  value={pf.email_contato ?? ''}
                  onChange={(e) => set('email_contato', e.target.value || null)}
                  className="border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                  style={inputStyle}
                />
              </Campo>
            </div>
          </section>

          <section className="flex flex-col gap-2.5">
            <div className="text-xs font-bold text-[color:var(--rbr-navy)]">Tributário — Simples Nacional</div>
            <div className="grid grid-cols-2 gap-2.5">
              <Campo label="CSOSN" hint="101 = com crédito ao tomador · 102 = sem crédito (mais comum).">
                <select
                  value={pf.csosn ?? ''}
                  onChange={(e) => set('csosn', e.target.value || null)}
                  className="border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                  style={inputStyle}
                >
                  <option value="">Não confirmado</option>
                  <option value="101">101 — tributada com permissão de crédito</option>
                  <option value="102">102 — tributada sem permissão de crédito</option>
                </select>
              </Campo>
              {pf.csosn === '101' && (
                <Campo label="Alíquota de crédito (%)" hint="Só se aplica ao CSOSN 101.">
                  <input
                    type="number"
                    step="0.01"
                    value={pf.icms_aliquota_credito_simples ?? ''}
                    onChange={(e) =>
                      set('icms_aliquota_credito_simples', e.target.value ? Number(e.target.value) : null)
                    }
                    className="border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                    style={inputStyle}
                  />
                </Campo>
              )}
              <Campo label="Item lista serviço (LC 116) — NFS-e transporte">
                <input
                  value={pf.item_lista_servico_transporte_municipal ?? ''}
                  onChange={(e) => set('item_lista_servico_transporte_municipal', e.target.value || null)}
                  className="border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                  style={inputStyle}
                />
              </Campo>
              <label className="flex items-center gap-2 text-[11px] text-[color:var(--rbr-muted)] mt-5">
                <input
                  type="checkbox"
                  checked={pf.nfse_nacional_habilitada}
                  onChange={(e) => set('nfse_nacional_habilitada', e.target.checked)}
                />
                Emissor Nacional de NFS-e habilitado no painel da Focus
              </label>
            </div>
          </section>

          <section className="flex flex-col gap-2.5">
            <div className="text-xs font-bold text-[color:var(--rbr-navy)]">Responsável técnico (exigência da SEFAZ)</div>
            <div className="grid grid-cols-2 gap-2.5">
              <Campo label="CNPJ">
                <input
                  value={pf.responsavel_tecnico_cnpj ?? ''}
                  onChange={(e) => set('responsavel_tecnico_cnpj', e.target.value || null)}
                  className="border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                  style={inputStyle}
                />
              </Campo>
              <Campo label="Contato">
                <input
                  value={pf.responsavel_tecnico_contato ?? ''}
                  onChange={(e) => set('responsavel_tecnico_contato', e.target.value || null)}
                  className="border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                  style={inputStyle}
                />
              </Campo>
              <Campo label="E-mail">
                <input
                  value={pf.responsavel_tecnico_email ?? ''}
                  onChange={(e) => set('responsavel_tecnico_email', e.target.value || null)}
                  className="border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                  style={inputStyle}
                />
              </Campo>
              <Campo label="Telefone">
                <input
                  value={pf.responsavel_tecnico_telefone ?? ''}
                  onChange={(e) => set('responsavel_tecnico_telefone', e.target.value || null)}
                  className="border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                  style={inputStyle}
                />
              </Campo>
            </div>
          </section>

          <section className="flex flex-col gap-2.5">
            <div className="text-xs font-bold text-[color:var(--rbr-navy)]">Provedor (Focus NFe)</div>
            <div className="grid grid-cols-2 gap-2.5">
              <Campo label="Ambiente">
                <select
                  value={pf.ambiente}
                  onChange={(e) => set('ambiente', e.target.value)}
                  className="border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                  style={inputStyle}
                >
                  <option value="homologacao">Homologação (sem validade fiscal)</option>
                  <option value="producao">Produção</option>
                </select>
              </Campo>
              <label className="flex items-center gap-2 text-[11px] text-[color:var(--rbr-muted)] mt-5">
                <input type="checkbox" checked={pf.ativo} onChange={(e) => set('ativo', e.target.checked)} />
                Configuração ativa
              </label>
            </div>
          </section>

          {erro && (
            <div className="text-xs rounded-lg px-3 py-2.5" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
              {erro}
            </div>
          )}
          {salvoOk && (
            <div
              className="text-xs rounded-lg px-3 py-2.5"
              style={{ background: 'var(--rbr-positive)', color: '#fff' }}
            >
              Salvo.
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={salvar}
              disabled={salvando}
              className="text-xs font-bold px-4 py-2 rounded-lg disabled:opacity-60"
              style={{ background: 'var(--rbr-navy)', color: '#fff' }}
            >
              {salvando ? 'Salvando…' : 'Salvar parâmetros fiscais'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
