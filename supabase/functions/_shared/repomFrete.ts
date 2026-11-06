// Repom Frete (cliente 9520): SÓ TIPOS E ESQUELETO. Sem chamadas de rede e sem segredo. Os segredos do 9520 ainda NÃO
// estão no Vault. Decisão vigente: CIOT pela efrete — este cliente NÃO substitui nem altera o efreteClient.
// Autenticação (resumo do pedido): POST /Token com User, Version, Password e Partner (Partner = CNPJ).
// Campos obrigatórios de POST /Shipping: não encontrados (o manual do Repom Frete não está em docs/). TODO ao receber o manual.

export interface CredenciaisRepomFrete {
  user: string
  version: string
  password: string
  partner: string // CNPJ do parceiro
}
export interface TokenRepomFrete {
  token: string
  expiraEm: number
}
export interface PedidoShipping {
  // TODO: campos obrigatórios de POST /Shipping (manual não disponível).
  [campo: string]: unknown
}

export class RepomFreteNaoImplementado extends Error {
  readonly codigo = 'NAO_IMPLEMENTADO'
  constructor(metodo: string) {
    super(`Repom Frete (${metodo}): não implementado — aguardando manual e credenciais do cliente 9520`)
    this.name = 'RepomFreteNaoImplementado'
  }
}

export interface ClienteRepomFrete {
  token(c: CredenciaisRepomFrete): Promise<TokenRepomFrete> // POST /Token
  emitir(p: PedidoShipping): Promise<never> // POST /Shipping
  consultar(id: string): Promise<never>
  cancelar(id: string, motivo: string): Promise<never>
  encerrar(id: string): Promise<never>
}

export function criarRepomFreteEsqueleto(): ClienteRepomFrete {
  const nao = (m: string) => () => Promise.reject(new RepomFreteNaoImplementado(m))
  return { token: nao('token'), emitir: nao('emitir'), consultar: nao('consultar'), cancelar: nao('cancelar'), encerrar: nao('encerrar') }
}
