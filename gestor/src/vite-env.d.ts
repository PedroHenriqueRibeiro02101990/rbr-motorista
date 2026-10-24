/// <reference types="vite/client" />

interface ImportMetaEnv {
  // CIOT pela efrete no gestor. Padrão desligada: enquanto a conta de produção não existir, só o CIOT manual.
  readonly VITE_EFRETE_CIOT_HABILITADO?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
