/// <reference types="vite/client" />

interface ImportMetaEnv {
  // CIOT pela efrete no gestor. Padrão desligada: enquanto a conta de produção não existir, só o CIOT manual.
  readonly VITE_EFRETE_CIOT_HABILITADO?: string
  // Rota /demo-ciot (sem login, dados fictícios). Só no build de preview.
  readonly VITE_DEMO_CIOT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
