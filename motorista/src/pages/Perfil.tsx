import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import type { Database } from '@rbr/shared/database.types'
import { initials } from '@rbr/shared/format'
import { IconCamera, IconLogOut } from '@rbr/shared/icons'
import { IconFileText } from '../icons-local'
import { BadgeAprovacao, enviarDocumentoPessoal, lerDocumento, MeusDados, StatusCadastro } from '@rbr/shared/cadastro'
import { BiometriaToggle } from '@rbr/shared/biometria'
import { formatarDoc } from '@rbr/shared/documento'
import Condutores from '../components/Condutores'

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

export default function Perfil({
  pessoa,
  onSignOut,
  onRecarregar,
}: {
  pessoa: Pessoa
  onSignOut: () => void
  onRecarregar: () => Promise<void> | void
}) {
  const [crlvNovoPath, setCrlvNovoPath] = useState<string | null>(null)
  const [cartaoUploading, setCartaoUploading] = useState(false)
  const ehPJ = pessoa.tipo_pessoa_doc === 'PJ'
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
    // CPF/CNPJ não muda depois do cadastro (1 documento = 1 conta).
    const { error } = await supabase
      .from('pessoas')
      .update({
        nome: form.nome,
        email: form.email || null,
        celular: form.celular || null,
        pix: form.pix || null,
        cep: form.cep || null,
        logradouro: form.logradouro || null,
        numero_endereco: form.numero_endereco || null,
        complemento: form.complemento || null,
        bairro: form.bairro || null,
        cidade: form.cidade || null,
        uf: form.uf || null,
      })
      .eq('id', pessoa.id)
    setSaving(false)
    if (error) {
      setErrorMsg(error.message)
      return
    }
    setSavedMsg('Dados salvos com sucesso.')
    await onRecarregar()
  }

  async function handleCnhUpload(file: File) {
    setCnhUploading(true)
    setErrorMsg(null)
    setSavedMsg(null)
    const r = await enviarDocumentoPessoal({ tipo: 'cnh', arquivo: file, pessoaId: pessoa.id, pastaPessoaId: pessoa.id })
    setCnhUploading(false)
    if (r.erro) {
      setErrorMsg(r.erro)
      return
    }
    await onRecarregar()
    setSavedMsg(
      r.campos
        ? 'Foto da CNH recebida e conferida automaticamente. Veja a situação do cadastro no topo.'
        : 'Foto da CNH recebida. A leitura automática está indisponível agora — a RBR confere manualmente.',
    )
  }

  async function handleCartaoCnpjUpload(file: File) {
    setCartaoUploading(true)
    setErrorMsg(null)
    setSavedMsg(null)
    const r = await enviarDocumentoPessoal({ tipo: 'cartao_cnpj', arquivo: file, pessoaId: pessoa.id, pastaPessoaId: pessoa.id })
    setCartaoUploading(false)
    if (r.erro) {
      setErrorMsg(r.erro)
      return
    }
    await onRecarregar()
    setSavedMsg('Cartão CNPJ recebido. Veja a situação do cadastro no topo.')
  }

  function openNovoVeiculo() {
    setCrlvNovoPath(null)
    setVeiculoForm(VEICULO_VAZIO)
    setVeiculoErro(null)
    setVeiculoFormOpen(true)
  }

  function openEditarVeiculo(v: Veiculo) {
    setCrlvNovoPath(null)
    setVeiculoForm(veiculoParaForm(v))
    setVeiculoErro(null)
    setVeiculoFormOpen(true)
  }

  async function handleCrlvUpload(file: File) {
    setCrlvUploading(true)
    setVeiculoErro(null)
    // Lê a foto pra pré-preencher; o documento é registrado (e conferido) quando o veículo é salvo.
    const r = await lerDocumento('crlv', file, pessoa.id)
    setCrlvUploading(false)
    if (r.erro) {
      setVeiculoErro(r.erro)
      return
    }
    setCrlvNovoPath(r.path)
    const c = (r.campos ?? {}) as {
      placa?: string | null
      renavam?: string | null
      marca_modelo?: string | null
      ano?: number | null
      capacidade_carga?: number | null
    }
    setVeiculoForm((f) => ({
      ...f,
      placa: f.placa || (c.placa ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '') || f.placa,
      renavam: f.renavam || c.renavam || f.renavam,
      marca_modelo: f.marca_modelo || c.marca_modelo || f.marca_modelo,
      ano: f.ano || (c.ano != null ? c.ano.toString() : f.ano),
      capacidade_carga: f.capacidade_carga || (c.capacidade_carga != null ? c.capacidade_carga.toString() : f.capacidade_carga),
      crlv_foto_url: r.path,
      crlv_preenchido_manualmente: !r.campos,
    }))
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
      placa: veiculoForm.placa.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''),
      renavam: veiculoForm.renavam.trim(),
      marca_modelo: veiculoForm.marca_modelo || null,
      ano: veiculoForm.ano ? Number(veiculoForm.ano) : null,
      tipo_veiculo: veiculoForm.tipo_veiculo || null,
      capacidade_carga: veiculoForm.capacidade_carga ? Number(veiculoForm.capacidade_carga) : null,
      crlv_preenchido_manualmente: veiculoForm.crlv_preenchido_manualmente,
    }

    const ehVeiculoNovo = !veiculoForm.id

    const result = veiculoForm.id
      ? await supabase.from('veiculos').update(patch).eq('id', veiculoForm.id)
      : await supabase.from('veiculos').insert(patch).select('id').single()

    if (result.error) {
      setVeiculoSaving(false)
      setVeiculoErro(
        /veiculos_placa_key|duplicate/i.test(result.error.message)
          ? 'Esta placa ou RENAVAM já está cadastrada em outra conta. Fale com a RBR.'
          : result.error.message,
      )
      return
    }
    const veiculoId = veiculoForm.id ?? (result.data as { id: string } | null)?.id ?? null
    // Foto nova do CRLV: registra e dispara a conferência automática.
    if (veiculoId && crlvNovoPath) {
      await enviarDocumentoPessoal({ tipo: 'crlv', veiculoId, pastaPessoaId: pessoa.id, caminhoExistente: crlvNovoPath })
      setCrlvNovoPath(null)
    }

    // Veículo novo → já cria a assinatura pendente (taxa de R$19,90). Sem
    // Efí/gateway configurado ainda, a confirmação de pagamento é manual —
    // o gestor confere o Pix e libera pelo painel dele. O veículo já fica
    // cadastrado, só não conta como "ativo" até isso acontecer.
    if (ehVeiculoNovo && !veiculoForm.id) {
      const novoVeiculoId = veiculoId
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
    await loadVeiculos()
    await onRecarregar()
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
            {pessoa.papel === 'titular_motorista' ? (ehPJ ? 'Empresa / frota' : 'Titular da frota') : 'Condutor'}
          </div>
        </div>
      </div>

      <StatusCadastro
        pessoa={pessoa}
        veiculos={veiculos}
        onAtualizar={async () => {
          await onRecarregar()
          await loadVeiculos()
        }}
      />

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
        <Field label={ehPJ ? 'CNPJ' : 'CPF'}>
          <div className={inputClass + ' bg-[color:var(--rbr-muted-bg)] text-[color:var(--rbr-muted)]'} style={inputStyle}>
            {formatarDoc(ehPJ ? pessoa.cnpj : pessoa.cpf) || '—'}
          </div>
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

      {ehPJ && (
        <div className="bg-white border rounded-[20px] p-[18px] flex flex-col gap-3" style={cardStyle}>
          <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">Cartão CNPJ</div>
          <div className="text-xs text-[color:var(--rbr-muted)]">
            Comprovante de inscrição emitido no site da Receita Federal. Quem dirige são os condutores cadastrados abaixo, cada um com a
            própria CNH.
          </div>
          <label
            htmlFor="cartao-cnpj"
            className="flex items-center justify-center gap-2 border rounded-xl py-2.5 text-sm font-semibold"
            style={{ borderColor: 'var(--rbr-navy)', color: 'var(--rbr-navy)', opacity: cartaoUploading ? 0.6 : 1 }}
          >
            <IconCamera width={16} height={16} />
            {cartaoUploading ? 'Enviando e conferindo…' : 'Enviar Cartão CNPJ (foto ou PDF)'}
            <input
              id="cartao-cnpj"
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              disabled={cartaoUploading}
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) handleCartaoCnpjUpload(file)
              }}
            />
          </label>
        </div>
      )}

      {!ehPJ && (
      <div className="bg-white border rounded-[20px] p-[18px] flex flex-col gap-3" style={cardStyle}>
        <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">CNH</div>
        <div className="text-xs text-[color:var(--rbr-muted)]">
          Envie a foto da CNH (física ou digital). Os dados abaixo vêm da foto e não podem ser digitados — para corrigir, envie outra foto.
        </div>
        <Field label="Número de registro">
          <input
            className={inputClass}
            style={inputStyle}
            value={form.cnh_numero_registro}
                readOnly
                disabled
          />
        </Field>
        <div className="flex gap-3">
          <div className="flex-1">
            <Field label="Categoria">
              <input
                className={inputClass}
                style={inputStyle}
                value={form.cnh_categoria}
                readOnly
                disabled
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
                readOnly
                disabled
              />
            </Field>
          </div>
        </div>


        <label
          htmlFor="cnh-foto"
          className="flex items-center justify-center gap-2 border rounded-xl py-2.5 text-sm font-semibold"
          style={{ borderColor: 'var(--rbr-navy)', color: 'var(--rbr-navy)', opacity: cnhUploading ? 0.6 : 1 }}
        >
          <IconCamera width={16} height={16} />
          {cnhUploading ? 'Enviando e conferindo…' : pessoa.cnh_foto_url ? 'Trocar foto da CNH' : 'Enviar foto da CNH'}
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
      )}

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
                  <BadgeAprovacao status={v.aprovacao_status} />
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
                      list="tipos-veiculo"
                      value={veiculoForm.tipo_veiculo}
                      onChange={(e) => setVeiculoForm((f) => ({ ...f, tipo_veiculo: e.target.value }))}
                    />
                  </Field>
                </div>
              </div>
              <datalist id="tipos-veiculo">
                {['Fiorino', 'Van', 'HR / Bongo', 'VUC', '3/4', 'Toco', 'Truck', 'Bitruck', 'Cavalo mecânico', 'Carreta', 'Bitrem', 'Rodotrem'].map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
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
                {crlvUploading ? 'Lendo o CRLV…' : veiculoForm.crlv_foto_url ? 'Trocar foto do CRLV' : 'Enviar foto do CRLV'}
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

      {ehTitular && <Condutores titular={pessoa} />}

      <div className="bg-white border rounded-[20px] p-[18px] flex flex-col gap-3" style={cardStyle}>
        <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">Segurança</div>
        <BiometriaToggle userId={pessoa.auth_user_id ?? pessoa.id} nome={pessoa.nome} email={pessoa.email} />
      </div>

      <div className="bg-white border rounded-[20px] p-[18px] flex flex-col gap-3" style={cardStyle}>
        <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">Meus dados (LGPD)</div>
        <MeusDados pessoa={pessoa} />
      </div>

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
