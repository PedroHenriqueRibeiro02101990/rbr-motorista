// Flags da efrete no gestor. Padrão desligada: sem a conta de produção, o CIOT da operação é manual (Repom).
// Para ligar, defina VITE_EFRETE_CIOT_HABILITADO=true no ambiente de build (só depois da conta de produção).
// O ?. deixa os testes (node, sem Vite) importarem este arquivo: lá não há import.meta.env e a flag fica desligada.
export const CIOT_EFRETE_HABILITADO = import.meta.env?.VITE_EFRETE_CIOT_HABILITADO === 'true'
