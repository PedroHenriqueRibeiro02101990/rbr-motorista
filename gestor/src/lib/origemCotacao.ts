// Origem (local de coleta) da cotação. Padrão: endereço cadastrado do cliente. "Coleta em outro local": o gestor informa
// endereço, CEP, cidade e UF — e essa passa a ser a origem efetiva em tudo (rota única, rota por destino, piso ANTT,
// pedágio, texto da rota e o que é gravado em cotacoes.cidade_origem/uf_origem, de onde o CT-e e o MDF-e leem via
// v_checklist_prontidao; o gatilho do banco tira daí o ibge_origem que decide NFS-e × CT-e+MDF-e).
// CEP e endereço da coleta manual vão em cotacoes.origem_cep / origem_endereco (migration 20261016142300).
// Usado por pages/Cotacao.tsx; testes em gestor/test/origemCotacao.test.ts.

export interface ClienteEndereco {
  logradouro?: string | null
  numero_endereco?: string | null
  bairro?: string | null
  cidade?: string | null
  uf?: string | null
  cep?: string | null
}

export interface OrigemForm {
  origem_manual: boolean
  origem_cep: string
  origem_endereco: string
  cidade_origem: string
  uf_origem: string
}

export interface OrigemEfetiva {
  manual: boolean
  cidade: string
  uf: string
  cep: string | null
  endereco: string | null
  // Texto da origem (exibição; e endereco_origem quando é o endereço do cliente). Vazio = não dá para calcular.
  textoRota: string
  // Origem no corpo do calcular-rota-frete. Coleta manual vai por cidade/UF: endereço rural e CEP em texto livre
  // não são achados pelo OpenStreetMap (testado com São Sebastião da Bela Vista/MG), e a distância por cidade basta
  // para piso e pedágio.
  corpoRota: { endereco_origem: string } | { cidade_origem: string; uf_origem: string } | null
}

const limpo = (s: string | null | undefined) => (s ?? '').trim()
export const soDigitosCep = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')

export function enderecoDoCliente(c: ClienteEndereco | null): string {
  if (!c) return ''
  return [[c.logradouro, c.numero_endereco].filter((x) => limpo(x)).join(', '), c.bairro, [c.cidade, c.uf].filter((x) => limpo(x)).join('/')]
    .map(limpo)
    .filter(Boolean)
    .join(' — ')
}

export function origemEfetiva(f: OrigemForm, cliente: ClienteEndereco | null): OrigemEfetiva {
  if (f.origem_manual) {
    const cidade = limpo(f.cidade_origem)
    const uf = limpo(f.uf_origem).toUpperCase()
    const cep = soDigitosCep(f.origem_cep)
    const endereco = limpo(f.origem_endereco)
    const textoRota = cidade && uf ? [endereco, `${cidade}/${uf}`, cep ? `CEP ${cep}` : ''].filter(Boolean).join(' — ') : ''
    const corpoRota = cidade && uf ? { cidade_origem: cidade, uf_origem: uf } : null
    return { manual: true, cidade, uf, cep: cep || null, endereco: endereco || null, textoRota, corpoRota }
  }
  // Sem coleta manual vale o que já valia: cidade/UF do formulário (vêm do cliente ou do remetente da NF-e) e, para a
  // rota por destino, o endereço cadastrado do cliente.
  const textoRota = enderecoDoCliente(cliente)
  return {
    manual: false,
    cidade: limpo(f.cidade_origem) || limpo(cliente?.cidade),
    uf: (limpo(f.uf_origem) || limpo(cliente?.uf)).toUpperCase(),
    cep: null,
    endereco: null,
    textoRota,
    corpoRota: textoRota ? { endereco_origem: textoRota } : null,
  }
}

// Trocar o cliente só atualiza a origem quando o gestor não informou outra.
export function origemAoTrocarCliente(f: OrigemForm, novo: ClienteEndereco | null): Pick<OrigemForm, 'cidade_origem' | 'uf_origem'> {
  if (f.origem_manual) return { cidade_origem: f.cidade_origem, uf_origem: f.uf_origem }
  return { cidade_origem: novo?.cidade ?? f.cidade_origem, uf_origem: novo?.uf ?? f.uf_origem }
}

// "Coleta em outro local" exige CEP (vai como cep_carregamento do MDF-e), cidade e UF. Fora desse modo, nada muda.
export function erroOrigemManual(f: OrigemForm): string | null {
  if (!f.origem_manual) return null
  if (soDigitosCep(f.origem_cep).length !== 8) return 'Coleta em outro local: informe o CEP do local de coleta (8 dígitos).'
  if (!limpo(f.cidade_origem) || limpo(f.uf_origem).length !== 2) return 'Coleta em outro local: informe a cidade e a UF do local de coleta.'
  return null
}

// O que vai para o banco (colunas de cotacoes).
export function patchOrigem(f: OrigemForm, cliente: ClienteEndereco | null) {
  const e = origemEfetiva(f, cliente)
  return {
    cidade_origem: e.cidade || null,
    uf_origem: e.uf || null,
    origem_cep: e.manual ? e.cep : null,
    origem_endereco: e.manual ? e.endereco : null,
  }
}

// Ao reabrir: cotação com CEP de coleta gravado volta como "Coleta em outro local".
export function origemDaCotacao(c: { origem_cep?: string | null; origem_endereco?: string | null }): Pick<OrigemForm, 'origem_manual' | 'origem_cep' | 'origem_endereco'> {
  return { origem_manual: !!limpo(c.origem_cep), origem_cep: limpo(c.origem_cep), origem_endereco: limpo(c.origem_endereco) }
}

const normalizar = (s: string | null | undefined) =>
  limpo(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()

// Aviso (amarelo, não bloqueia) quando a coleta manual é em cidade/UF diferente do remetente da NF-e.
export function avisoRemetenteDiferente(f: OrigemForm, remetente: { municipio?: string | null; uf?: string | null } | null): string | null {
  if (!f.origem_manual || !remetente || !limpo(remetente.municipio) || !limpo(f.cidade_origem)) return null
  if (normalizar(remetente.municipio) === normalizar(f.cidade_origem) && normalizar(remetente.uf) === normalizar(f.uf_origem)) return null
  return `Coleta em ${limpo(f.cidade_origem)}/${limpo(f.uf_origem).toUpperCase()}, diferente do endereço do remetente da NF-e (${limpo(remetente.municipio)}/${limpo(remetente.uf).toUpperCase()}). Confira com o contador se precisa informar expedidor no CT-e.`
}
