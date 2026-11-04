// B5: o endereço da NF-e vence o do cadastro quando divergem, COM aviso visível. Esta parte só compara e avisa:
// não grava nem sobrescreve o cadastro do cliente (a gravação fica para o gestor decidir).
export interface EnderecoNfMini {
  logradouro?: string | null
  numero?: string | null
  bairro?: string | null
  municipio?: string | null
  uf?: string | null
  cep?: string | null
}
export interface EnderecoCadastroMini {
  logradouro?: string | null
  numero_endereco?: string | null
  bairro?: string | null
  cidade?: string | null
  uf?: string | null
  cep?: string | null
}

const norm = (v: unknown) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
const dig = (v: unknown) => String(v ?? '').replace(/\D/g, '')

export interface DivergenciaEndereco {
  campo: string
  nf: string
  cadastro: string
}

// Só compara os campos que os DOIS lados têm preenchidos (campo vazio no cadastro não é divergência: a NF completa).
export function divergenciasEndereco(nf: EnderecoNfMini | null, cad: EnderecoCadastroMini | null): DivergenciaEndereco[] {
  if (!nf || !cad) return []
  const pares: [string, string, string, boolean][] = [
    ['CEP', dig(nf.cep), dig(cad.cep), true],
    ['Logradouro', norm(nf.logradouro), norm(cad.logradouro), false],
    ['Número', norm(nf.numero), norm(cad.numero_endereco), false],
    ['Bairro', norm(nf.bairro), norm(cad.bairro), false],
    ['Cidade', norm(nf.municipio), norm(cad.cidade), false],
    ['UF', norm(nf.uf), norm(cad.uf), false],
  ]
  return pares
    .filter(([, a, b]) => a !== '' && b !== '' && a !== b)
    .map(([campo]) => ({
      campo,
      nf: String(campo === 'CEP' ? nf.cep : campo === 'Logradouro' ? nf.logradouro : campo === 'Número' ? nf.numero : campo === 'Bairro' ? nf.bairro : campo === 'Cidade' ? nf.municipio : nf.uf ?? ''),
      cadastro: String(campo === 'CEP' ? cad.cep : campo === 'Logradouro' ? cad.logradouro : campo === 'Número' ? cad.numero_endereco : campo === 'Bairro' ? cad.bairro : campo === 'Cidade' ? cad.cidade : cad.uf ?? ''),
    }))
}
