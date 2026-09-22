import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import type { Database } from '@rbr/shared/database.types'
import { initials } from '@rbr/shared/format'
import { IconCamera, IconLogOut } from '@rbr/shared/icons'
import { IconFileText } from '../icons-local'

type Pessoa = Database['public']['Tables']['pessoas']['Row']
type Veiculo = Database['public']['Tables']['veiculos']['Row']
type Assinatura = Database['public']['Tables']['assinaturas_motorista']['Row']

type PixInfo = { chave_pix: string; nome_titular: string; banco: string }

const STATUS_ASSINATURA_LABEL: Record<string, { texto: string; bg: string; cor: string }> = {
  ativa: { texto: 'Ativo', bg: 'var(--rbr-positive)', cor: '#FFFFFF' },
  aguardando_confirmacao: { texto: 'Aguardando pagamento', bg: 'var(--rbr-warning-bg)', cor: 'var(--rbr-navy-dark)' },
  inadimplente: { texto: 'Inadimplente', bg: '#FCE8E8', cor: 'var(--rbr-danger)' },
  bloqueada: { texto: 'Bloqueado', bg: '#FCE8E8', cor: 'var(--rbr-danger)' },
  cancelada: { texto: 'Cancelado', bg: 'var(--rbr-muted-bg)', cor: 'var(--rbr-muted)' },
  encerrado_por_motorista: { texto: 'Encerrado', bg: 'var(--rbr-muted-bg)', cor: 'var(--rbr-muted)' },
  suspenso_por_rbr: { texto: 'Suspenso', bg: '#FCE8E8', cor: 'var(--rbr-danger)' },
}

type VeiculoFormState = {
  id: string | null
  placa: string
  renavam: string
  marca_modelo: string
  ano: string
  tipo_veiculo: string
  capacidade_carga: string
  crlv_foto_url: string | null
  crlv_extraido_por_ia: boolean
  crlv_preenchido_manualmente: boolean
}

const VEICULO_VAZIO: VeiculoFormState = {
  id: null,
  placa: '',
  renavam: '',
  marca_modelo: '',
  ano: '',
  tipo_veiculo: '',
  capacidade_carga: '',
  crlv_foto_url: null,
  crlv_extraido_por_ia: false,
  crlv_preenchido_manualmente: false,
}

function veiculoParaForm(v: Veiculo): VeiculoFormState {
  return {
    id: v.id,
    placa: v.placa ?? '',
    renavam: v.renavam ?? '',
    marca_modelo: v.marca_modelo ?? '',
    ano: v.ano?.toString() ?? '',
    tipo_veiculo: v.tipo_veiculo ?? '',
    capacidade_carga: v.capacidade_carga?.toString() ?? '',
    crlv_foto_url: v.crlv_foto_url ?? null,
    crlv_extraido_por_ia: v.crlv_extraido_por_ia ?? false,
    crlv_preenchido_manualmente: v.crlv_preenchido_manualmente ?? false,
  }
}

type FormState = {
  nome: string
  email: string
  celular: string
  cpf: string
  pix: string
  cep: string
  logradouro: string
  numero_endereco: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
  cnh_numero_registro: string
  cnh_categoria: string
  cnh_validade: string
  cnh_preenchido_manualmente: boolean
  cnh_extraido_por_ia: boolean
}

function toFormState(pessoa: Pessoa): FormState {
  return {
    nome: pessoa.nome ?? '',
    email: pessoa.email ?? '',
    celular: pessoa.celular ?? '',
    cpf: pessoa.cpf ?? '',
    pix: pessoa.pix ?? '',
    cep: pessoa.cep ?? '',
    logradouro: pessoa.logradouro ?? '',
    numero_endereco: pessoa.numero_endereco ?? '',
    complemento: pessoa.complemento ?? '',
    bairro: pessoa.bairro ?? '',
    cidade: pessoa.cidade ?? '',
    uf: pessoa.uf ?? '',
    cnh_numero_registro: pessoa.cnh_numero_registro ?? '',
    cnh_categoria: pessoa.cnh_categoria ?? '',
    cnh_validade: pessoa.cnh_validade ?? '',
    cnh_preenchido_manualmente: pessoa.cnh_preenchido_manualmente ?? false,
    cnh_extraido_por_ia: pessoa.cnh_extraido_por_ia ?? false,
  }
}

const inputClass =
  'border rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-[color:var(--rbr-navy)] w-full'
const inputStyle = { borderColor: 'var(--rbr-border)' }

const cardStyle = {
  borderColor: 'var(--rbr-border)',
  boxShadow: '0 1px 2px rgba(18,23,61,0.03), 0 6px 18px rgba(18,23,61,0.05)',
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-[color:var(--rbr-muted)]">{label}</span>
      {children}
    </label>
  )
}

export default function Perfil({ pessoa, onSignOut }: { pessoa: Pessoa; onSignOut: () => void }) {
  const [form, setForm] = useState<FormState>(() => toFormState(pessoa))
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [veiculos, setVeiculos] = useState<Veiculo[]>([])
  const [cnhUploading, setCnhUploading] = useState(false)
  const [veiculoFormOpen, setVeiculoFormOpen] = useState(false)
  const [veiculoForm, setVeiculoForm] = useState<VeiculoFormState>(VEICULO_VAZIO)
  const [veiculoSaving, setVeiculoSaving] = useState(false)
  const [veiculoErro, setVeiculoErro] = useState<string | null>(null)
  const [crlvUploading, setCrlvUploading] = useState(false)
  const [assinaturas, setAssinaturas] = useState<Record<string, Assinatura>>({})
  const [pixInfo, setPixInfo] = useState<PixInfo | null>(null)
  const [pagamentoPendenteInfo, setPagamentoPendenteInfo] = useState<{ placa: string } | null>(null)

  const ehTitular = pessoa.papel === 'titular_motorista'

  const loadVeiculos = useCallback(async () => {
    if (!ehTitular) return
    const { data } = await supabase.from('veiculos').select('*').eq('titular_id', pessoa.id).order('created_at', { ascending: false })
    const lista = data ?? []
    setVeiculos(lista)
    if (lista.length > 0) {
      const { data: assData } = await supabase
        .from('assinaturas_motorista')
        .select('*')
        .in('veiculo_id', lista.map((v) => v.id))
      const porVeiculo: Record<string, Assinatura> = {}
      for (const a of assData ?? []) porVeiculo[a.veiculo_id] = a
      setAssinaturas(porVeiculo)
    } else {
      setAssinaturas({})
    }
  }, [pessoa.id, ehTitular])

  const loadPixInfo = useCallback(async () => {
    if (!ehTitular) return
    const { data } = await supabase
      .from('parametros_sistema')
      .select('valor')
      .eq('chave', 'pix_cobranca_taxa_motorista')
      .maybeSingle()
    if (data?.valor) setPixInfo(data.valor as unknown as PixInfo)
  }, [ehTitular])

  useEffect(() => {
    setForm(toFormState(pessoa))
  }, [pessoa])

  useEffect(() => {
    loadVeiculos()
    loadPixInfo()
  }, [loadVeiculos, loadPixInfo])

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSave() {
    setSaving(true)
    setSavedMsg(null)
    setErrorMsg(null)
    // CPF é salvo só com dígitos (o banco exige esse formato) — o motorista
    // pode digitar com ponto/traço normalmente, a gente limpa aqui.
    const cpfLimpo = form.cpf.replace(/\D/g, '')
    const { error } = await supabase
      .from('pessoas')
      .update({
        nome: form.nome,
        email: form.email || null,
        celular: form.celular || null,
        cpf: cpfLimpo === '' ? null : cpfLimpo,
        pix: form.pix || null,
        cep: form.cep || null,
        logradouro: form.logradouro || null,
        numero_endereco: form.numero_endereco || null,
        complemento: form.complemento || null,
        bairro: form.bairro || null,
        cidade: form.cidade || null,
        uf: form.uf || null,
        cnh_numero_registro: form.cnh_numero_registro || null,
        cnh_categoria: form.cnh_categoria || null,
        cnh_validade: form.cnh_validade || null,
        cnh_preenchido_manualmente: form.cnh_preenchido_manualmente,
        cnh_extraido_por_ia: form.cnh_extraido_por_ia,
      })
      .eq('id', pessoa.id)
    setSaving(false)
    if (error) {
      setErrorMsg(error.message)
      return
    }
    setSavedMsg('Dados salvos com sucesso.')
  }

  async function handleCnhUpload(file: File) {
    setCnhUploading(true)
    setErrorMsg(null)
    const path = `pessoa/${pessoa.id}/cnh-${Date.now()}.jpg`
    const { error: uploadError } = await supabase.storage.from('documentos-pessoais').upload(path, file)
    if (uploadError) {
      setErrorMsg(uploadError.message)
      setCnhUploading(false)
      return
    }
    const { error: insertError } = await supabase
      .from('documentos_pessoais_imagens')
      .insert({ pessoa_id: pessoa.id, tipo: 'cnh', arquivo_url: path })
    if (insertError) {
      setCnhUploading(false)
      setErrorMsg(insertError.message)
      return
    }

    // Tenta ler os campos automaticamente via Gemini. Se a função ainda não
    // tiver a chave configurada (503) ou falhar por qualquer motivo, cai
    // silenciosamente no fluxo manual que já existia — nunca bloqueia o envio.
    const { data: extracao, error: extracaoError } = await supabase.functions.invoke('extrair-documento', {
      body: { tipo: 'cnh', path },
    })

    setCnhUploading(false)

    if (!extracaoError && extracao?.sucesso && extracao.campos) {
      const c = extracao.campos as {
        numero_registro?: string | null
        categoria?: string | null
        validade?: string | null
        cpf?: string | null
      }
      setForm((f) => ({
        ...f,
        cnh_numero_registro: c.numero_registro || f.cnh_numero_registro,
        cnh_categoria: c.categoria || f.cnh_categoria,
        cnh_validade: c.validade || f.cnh_validade,
        // O OCR da CNH também lê o CPF — só preenche se o campo ainda
        // estiver vazio, nunca sobrescreve o que a pessoa já digitou.
        cpf: f.cpf || c.cpf || f.cpf,
        cnh_preenchido_manualmente: false,
        cnh_extraido_por_ia: true,
      }))
      setSavedMsg('Foto da CNH enviada e lida automaticamente — confira os campos abaixo antes de salvar.')
    } else {
      setSavedMsg('Foto da CNH enviada. Preencha os campos abaixo (leitura automática indisponível no momento).')
    }
  }

  function openNovoVeiculo() {
    setVeiculoForm(VEICULO_VAZIO)
    setVeiculoErro(null)
    setVeiculoFormOpen(true)
  }

  function openEditarVeiculo(v: Veiculo) {
    setVeiculoForm(veiculoParaForm(v))
    setVeiculoErro(null)
    setVeiculoFormOpen(true)
  }

  async function handleCrlvUpload(file: File) {
    setCrlvUploading(true)
    setVeiculoErro(null)
    const path = `pessoa/${pessoa.id}/crlv-${Date.now()}.jpg`
    const { error: uploadError } = await supabase.storage.from('documentos-pessoais').upload(path, file)
    if (uploadError) {
      setVeiculoErro(uploadError.message)
      setCrlvUploading(false)
      return
    }

    // Mesma lógica da CNH: tenta ler automaticamente via Gemini, e se falhar
    // (chave não configurada, foto ilegível) cai no preenchimento manual sem
    // travar o cadastro do veículo.
    const { data: extracao, error: extracaoError } = await supabase.functions.invoke('extrair-documento', {
      body: { tipo: 'crlv', path },
    })

    setCrlvUploading(false)

    if (!extracaoError && extracao?.sucesso && extracao.campos) {
      const c = extracao.campos as {
        placa?: string | null
        renavam?: string | null
        marca_modelo?: string | null
        ano?: number | null
        capacidade_carga?: number | null
      }
      setVeiculoForm((f) => ({
        ...f,
        placa: f.placa || c.placa || f.placa,
        renavam: f.renavam || c.renavam || f.renavam,
        marca_modelo: f.marca_modelo || c.marca_modelo || f.marca_modelo,
        ano: f.ano || (c.ano != null ? c.ano.toString() : f.ano),
        capacidade_carga: f.capacidade_carga || (c.capacidade_carga != null ? c.capacidade_carga.toString() : f.capacidade_carga),
        crlv_foto_url: path,
        crlv_preenchido_manualmente: false,
        crlv_extraido_por_ia: true,
      }))
    } else {
      setVeiculoForm((f) => ({ ...f, crlv_foto_url: path, crlv_extraido_por_ia: false }))
    }
  }

  async function handleSalvarVeiculo() {
    if (!veiculoForm.placa.trim() || !veiculoForm.renavam.trim()) {
      setVeiculoErro('Placa e Renavam são obrigatórios.')
      return
    }
    setVeiculoSaving(true)
    setVeiculoErro(null)

    const patch = {
      titular_id: pessoa.id,
      placa: veiculoForm.placa.trim().toUpperCase(),
      renavam: veiculoForm.renavam.trim(),
      marca_modelo: veiculoForm.marca_modelo || null,
      ano: veiculoForm.ano ? Number(veiculoForm.ano) : null,
      tipo_veiculo: veiculoForm.tipo_veiculo || null,
      capacidade_carga: veiculoForm.capacidade_carga ? Number(veiculoForm.capacidade_carga) : null,
      crlv_foto_url: veiculoForm.crlv_foto_url,
      crlv_extraido_por_ia: veiculoForm.crlv_extraido_por_ia,
      crlv_preenchido_manualmente: veiculoForm.crlv_preenchido_manualmente,
    }

    const ehVeiculoNovo = !veiculoForm.id

    const result = veiculoForm.id
      ? await supabase.from('veiculos').update(patch).eq('id', veiculoForm.id)
      : await supabase.from('veiculos').insert(patch).select('id').single()

    if (result.error) {
      setVeiculoSaving(false)
      setVeiculoErro(result.error.message)
      return
    }

    // Veículo novo → já cria a assinatura pendente (taxa de R$19,90). Sem
    // Efí/gateway configurado ainda, a confirmação de pagamento é manual —
    // o gestor confere o Pix e libera pelo painel dele. O veículo já fica
    // cadastrado, só não conta como "ativo" até isso acontecer.
    if (ehVeiculoNovo && !veiculoForm.id) {
      const novoVeiculoId = (result.data as { id: string } | null)?.id
      if (novoVeiculoId) {
        await supabase.from('assinaturas_motorista').insert({
          veiculo_id: novoVeiculoId,
          motorista_titular_id: pessoa.id,
          valor_base: 19.9,
          valor_atual: 19.9,
          teto_autorizado: 19.9,
          forma_cobranca: 'pix_manual',
          status: 'aguardando_confirmacao',
        })
        setPagamentoPendenteInfo({ placa: patch.placa })
      }
    }

    setVeiculoSaving(false)
    setVeiculoFormOpen(false)
    loadVeiculos()
  }

  return (
    <div className="px-5 pt-8 pb-6 flex flex-col gap-3.5">
      <div className="flex items-center gap-3">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold flex-shrink-0"
          style={{ background: 'var(--rbr-muted-bg)', color: 'var(--rbr-navy)' }}
        >
          {initials(pessoa.nome)}
        </div>
        <div>
          <div className="rbr-display font-bold text-xl leading-tight text-[color:var(--rbr-navy-dark)]">
            {pessoa.nome}
          </div>
          <div className="text-xs text-[color:var(--rbr-muted)]">
            {pessoa.papel === 'titular_motorista' ? 'Titular da frota' : 'Condutor'}
          </div>
        </div>
      </div>

      <div className="bg-white border rounded-[20px] p-[18px] flex flex-col gap-3" style={cardStyle}>
        <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">
          Dados pessoais
        </div>
        <Field label="Nome completo">
          <input className={inputClass} style={inputStyle} value={form.nome} onChange={(e) => update('nome', e.target.value)} />
        </Field>
        <Field label="E-mail">
          <input
            className={inputClass}
            style={inputStyle}
            type="email"
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
          />
        </Field>
        <Field label="Celular">
          <input className={inputClass} style={inputStyle} value={form.celular} onChange={(e) => update('celular', e.target.value)} />
        </Field>
        <Field label="CPF">
          <input
            className={inputClass}
            style={inputStyle}
            inputMode="numeric"
            placeholder="000.000.000-00"
            value={form.cpf}
            onChange={(e) => update('cpf', e.target.value)}
          />
        </Field>
        <Field label="Chave PIX">
          <input className={inputClass} style={inputStyle} value={form.pix} onChange={(e) => update('pix', e.target.value)} />
        </Field>
      </div>

      <div className="bg-white border rounded-[20px] p-[18px] flex flex-col gap-3" style={cardStyle}>
        <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">Endereço</div>
        <Field label="CEP">
          <input className={inputClass} style={inputStyle} value={form.cep} onChange={(e) => update('cep', e.target.value)} />
        </Field>
        <Field label="Logradouro">
          <input
            className={inputClass}
            style={inputStyle}
            value={form.logradouro}
            onChange={(e) => update('logradouro', e.target.value)}
          />
        </Field>
        <div className="flex gap-3">
          <div className="flex-1">
            <Field label="Número">
              <input
                className={inputClass}
                style={inputStyle}
                value={form.numero_endereco}
                onChange={(e) => update('numero_endereco', e.target.value)}
              />
            </Field>
          </div>
          <div className="flex-[2]">
            <Field label="Complemento">
              <input
                className={inputClass}
                style={inputStyle}
                value={form.complemento}
                onChange={(e) => update('complemento', e.target.value)}
              />
            </Field>
          </div>
        </div>
        <Field label="Bairro">
          <input className={inputClass} style={inputStyle} value={form.bairro} onChange={(e) => update('bairro', e.target.value)} />
        </Field>
        <div className="flex gap-3">
          <div className="flex-[2]">
            <Field label="Cidade">
              <input
                className={inputClass}
                style={inputStyle}
                value={form.cidade}
                onChange={(e) => update('cidade', e.target.value)}
              />
            </Field>
          </div>
          <div className="flex-1">
            <Field label="UF">
              <input
                className={inputClass}
                style={inputStyle}
                maxLength={2}
                value={form.uf}
                onChange={(e) => update('uf', e.target.value.toUpperCase())}
              />
            </Field>
          </div>
        </div>
      </div>

      <div className="bg-white border rounded-[20px] p-[18px] flex flex-col gap-3" style={cardStyle}>
        <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">CNH</div>
        <Field label="Número de registro">
          <input
            className={inputClass}
            style={inputStyle}
            value={form.cnh_numero_registro}
            onChange={(e) => update('cnh_numero_registro', e.target.value)}
          />
        </Field>
        <div className="flex gap-3">
          <div className="flex-1">
            <Field label="Categoria">
              <input
                className={inputClass}
                style={inputStyle}
                value={form.cnh_categoria}
                onChange={(e) => update('cnh_categoria', e.target.value.toUpperCase())}
              />
            </Field>
          </div>
          <div className="flex-[2]">
            <Field label="Validade">
              <input
                className={inputClass}
                style={inputStyle}
                type="date"
                value={form.cnh_validade}
                onChange={(e) => update('cnh_validade', e.target.value)}
              />
            </Field>
          </div>
        </div>
        <label className="flex items-center gap-2.5 text-xs text-[color:var(--rbr-muted)]">
          <input
            type="checkbox"
            checked={form.cnh_preenchido_manualmente}
            onChange={(e) => update('cnh_preenchido_manualmente', e.target.checked)}
          />
          Preenchi manualmente porque o OCR falhou
        </label>

        <label
          htmlFor="cnh-foto"
          className="flex items-center justify-center gap-2 border rounded-xl py-2.5 text-sm font-semibold"
          style={{ borderColor: 'var(--rbr-navy)', color: 'var(--rbr-navy)', opacity: cnhUploading ? 0.6 : 1 }}
        >
          <IconCamera width={16} height={16} />
          {cnhUploading ? 'Enviando…' : 'Enviar foto da CNH'}
          <input
            id="cnh-foto"
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            disabled={cnhUploading}
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) handleCnhUpload(file)
            }}
          />
        </label>
      </div>

      {ehTitular && (
        <div className="bg-white border rounded-[20px] p-[18px] flex flex-col gap-3" style={cardStyle}>
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">
              Meus veículos
            </div>
            {!veiculoFormOpen && (
              <button
                type="button"
                onClick={openNovoVeiculo}
                className="text-xs font-bold underline"
                style={{ color: 'var(--rbr-navy)' }}
              >
                + Adicionar
              </button>
            )}
          </div>

          {veiculos.length === 0 && !veiculoFormOpen && (
            <div className="text-xs text-[color:var(--rbr-muted)]">Nenhum veículo cadastrado ainda.</div>
          )}

          {!veiculoFormOpen &&
            veiculos.map((v) => {
              const status = assinaturas[v.id]?.status
              const badge = status ? STATUS_ASSINATURA_LABEL[status] : null
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => openEditarVeiculo(v)}
                  className="flex items-center gap-2.5 text-left"
                >
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: 'var(--rbr-muted-bg)' }}
                  >
                    <IconFileText width={16} height={16} style={{ color: 'var(--rbr-navy)' }} />
                  </div>
                  <div className="flex-1">
                    <div className="text-[13px] font-bold">{v.placa}</div>
                    <div className="text-xs text-[color:var(--rbr-muted)]">
                      {v.tipo_veiculo ?? 'Tipo não informado'}
                      {v.ano ? ` · ${v.ano}` : ''}
                      {v.crlv_foto_url ? ' · CRLV enviado' : ''}
                    </div>
                  </div>
                  {badge && (
                    <span
                      className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full flex-shrink-0"
                      style={{ background: badge.bg, color: badge.cor }}
                    >
                      {badge.texto}
                    </span>
                  )}
                </button>
              )
            })}

          {veiculoFormOpen && (
            <div className="flex flex-col gap-3 border-t pt-3" style={{ borderColor: 'var(--rbr-border)' }}>
              <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">
                {veiculoForm.id ? 'Editar veículo' : 'Novo veículo'}
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <Field label="Placa">
                    <input
                      className={inputClass}
                      style={inputStyle}
                      value={veiculoForm.placa}
                      onChange={(e) => setVeiculoForm((f) => ({ ...f, placa: e.target.value.toUpperCase() }))}
                    />
                  </Field>
                </div>
                <div className="flex-[2]">
                  <Field label="Renavam">
                    <input
                      className={inputClass}
                      style={inputStyle}
                      value={veiculoForm.renavam}
                      onChange={(e) => setVeiculoForm((f) => ({ ...f, renavam: e.target.value }))}
                    />
                  </Field>
                </div>
              </div>
              <Field label="Marca/modelo">
                <input
                  className={inputClass}
                  style={inputStyle}
                  value={veiculoForm.marca_modelo}
                  onChange={(e) => setVeiculoForm((f) => ({ ...f, marca_modelo: e.target.value }))}
                />
              </Field>
              <div className="flex gap-3">
                <div className="flex-1">
                  <Field label="Ano">
                    <input
                      className={inputClass}
                      style={inputStyle}
                      inputMode="numeric"
                      value={veiculoForm.ano}
                      onChange={(e) => setVeiculoForm((f) => ({ ...f, ano: e.target.value.replace(/\D/g, '') }))}
                    />
                  </Field>
                </div>
                <div className="flex-[2]">
                  <Field label="Tipo de veículo">
                    <input
                      className={inputClass}
                      style={inputStyle}
                      placeholder="ex: Fiorino, HR, Truck"
                      value={veiculoForm.tipo_veiculo}
                      onChange={(e) => setVeiculoForm((f) => ({ ...f, tipo_veiculo: e.target.value }))}
                    />
                  </Field>
                </div>
              </div>
              <Field label="Capacidade de carga (kg)">
                <input
                  className={inputClass}
                  style={inputStyle}
                  inputMode="numeric"
                  value={veiculoForm.capacidade_carga}
                  onChange={(e) => setVeiculoForm((f) => ({ ...f, capacidade_carga: e.target.value.replace(/\D/g, '') }))}
                />
              </Field>

              <label className="flex items-center gap-2.5 text-xs text-[color:var(--rbr-muted)]">
                <input
                  type="checkbox"
                  checked={veiculoForm.crlv_preenchido_manualmente}
                  onChange={(e) => setVeiculoForm((f) => ({ ...f, crlv_preenchido_manualmente: e.target.checked }))}
                />
                Preenchi manualmente porque o OCR falhou
              </label>

              <label
                htmlFor="crlv-foto"
                className="flex items-center justify-center gap-2 border rounded-xl py-2.5 text-sm font-semibold"
                style={{ borderColor: 'var(--rbr-navy)', color: 'var(--rbr-navy)', opacity: crlvUploading ? 0.6 : 1 }}
              >
                <IconCamera width={16} height={16} />
                {crlvUploading ? 'Enviando…' : veiculoForm.crlv_foto_url ? 'Trocar foto do CRLV' : 'Enviar foto do CRLV'}
                <input
                  id="crlv-foto"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  disabled={crlvUploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (file) handleCrlvUpload(file)
                  }}
                />
              </label>

              {veiculoErro && (
                <div className="text-xs rounded-xl px-3.5 py-2.5" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
                  {veiculoErro}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setVeiculoFormOpen(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold border"
                  style={{ borderColor: 'var(--rbr-border)', color: 'var(--rbr-muted)' }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSalvarVeiculo}
                  disabled={veiculoSaving}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold disabled:opacity-60"
                  style={{ background: 'var(--rbr-gold)', color: 'var(--rbr-navy-dark)' }}
                >
                  {veiculoSaving ? 'Salvando…' : 'Salvar veículo'}
                </button>
              </div>
            </div>
          )}

          {pagamentoPendenteInfo && (
            <div
              className="flex flex-col gap-2 rounded-xl px-3.5 py-3 text-xs"
              style={{ background: 'var(--rbr-warning-bg)', color: 'var(--rbr-navy-dark)' }}
            >
              <div className="font-bold text-[13px]">Veículo {pagamentoPendenteInfo.placa} cadastrado!</div>
              <div>
                Pra ativar esse veículo e poder receber cargas, é preciso pagar a taxa de <strong>R$ 19,90</strong>{' '}
                via Pix. Assim que confirmarmos o recebimento, o veículo é liberado automaticamente.
              </div>
              {pixInfo?.chave_pix ? (
                <div className="bg-white/60 rounded-lg px-2.5 py-2 flex flex-col gap-0.5">
                  <div>
                    Chave Pix: <strong>{pixInfo.chave_pix}</strong>
                  </div>
                  {pixInfo.nome_titular && <div>Titular: {pixInfo.nome_titular}</div>}
                  {pixInfo.banco && <div>Banco: {pixInfo.banco}</div>}
                </div>
              ) : (
                <div>A equipe da RBR vai entrar em contato pra combinar o pagamento dessa taxa.</div>
              )}
              <button
                type="button"
                onClick={() => setPagamentoPendenteInfo(null)}
                className="self-start text-[11px] font-bold underline"
              >
                Entendi
              </button>
            </div>
          )}
        </div>
      )}

      {(savedMsg || errorMsg) && (
        <div
          className="text-xs rounded-xl px-3.5 py-2.5"
          style={{
            background: errorMsg ? '#FBE9E9' : 'var(--rbr-warning-bg)',
            color: errorMsg ? 'var(--rbr-danger)' : 'var(--rbr-navy-dark)',
          }}
        >
          {errorMsg ?? savedMsg}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-3 rounded-xl text-sm font-bold disabled:opacity-60"
        style={{ background: 'var(--rbr-gold)', color: 'var(--rbr-navy-dark)' }}
      >
        {saving ? 'Salvando…' : 'Salvar alterações'}
      </button>

      <button
        onClick={onSignOut}
        className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 border"
        style={{ borderColor: 'var(--rbr-danger)', color: 'var(--rbr-danger)' }}
      >
        <IconLogOut width={16} height={16} />
        Sair
      </button>
    </div>
  )
}
