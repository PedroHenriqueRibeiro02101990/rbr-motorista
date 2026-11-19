// D1 (19/11/2026): os documentos do cadastro por documentos ficam no bucket `cadastro-documentos`; os do app, em `documentos-pessoais`.
// A coluna guarda o caminho; quando vem com o prefixo `cadastro-documentos/` o arquivo esta no bucket do cadastro.
// Teste: node --test gestor/test/titularVeiculo.test.ts
export const BUCKET_CADASTRO = 'cadastro-documentos'
export const BUCKET_PESSOAIS = 'documentos-pessoais'

export function bucketECaminho(arquivoUrl: string): { bucket: string; caminho: string } {
  const prefixo = `${BUCKET_CADASTRO}/`
  return arquivoUrl.startsWith(prefixo) ? { bucket: BUCKET_CADASTRO, caminho: arquivoUrl.slice(prefixo.length) } : { bucket: BUCKET_PESSOAIS, caminho: arquivoUrl }
}
