/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Repom (roteirizacao de pedagio na cotacao). Desligada por padrao em todos os escopos.
  readonly VITE_REPOM_ROTEIRIZACAO_HABILITADO?: string
  // CIOT pela efrete no gestor. Padrão desligada: enquanto a conta de produção não existir, só o CIOT manual.
  readonly VITE_EFRETE_CIOT_HABILITADO?: string
  // Rota /demo-ciot (sem login, dados fictícios). Só no build de preview.
  readonly VITE_DEMO_CIOT?: string
  readonly VITE_CENTRAL_INTEGRACOES?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
