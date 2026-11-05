/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** So no escopo Preview da Vercel: liga a rota /demo (dados ficticios, sem login). Em producao fica indefinida. */
  readonly VITE_DEMO_AGENCIADOR?: string
  /** Liga as telas fora do escopo atual (contrato gov.br, base de motoristas, frota etc.). Desligada por padrao. */
  readonly VITE_AGENCIADOR_MODULOS_RBR?: string
}
interface ImportMeta { readonly env: ImportMetaEnv }
