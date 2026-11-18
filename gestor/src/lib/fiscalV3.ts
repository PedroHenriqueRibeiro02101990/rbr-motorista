// Flag da aba Fiscal v3 (Parte B): padrao DESLIGADA. Com ela desligada a tela Fiscal fica exatamente como hoje.
// Para ligar: VITE_FISCAL_V3=true no ambiente de build (so o Pedro e o assistente ligam, depois de conferir).
export const FISCAL_V3_HABILITADO = import.meta.env?.VITE_FISCAL_V3 === 'true'
