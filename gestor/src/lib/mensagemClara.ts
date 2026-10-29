// Troca mensagens técnicas (rede, sessão, banco, função) por português claro para o gestor. Mensagens que já vêm em
// português das regras do sistema (ex.: "Motorista sem CPF.") passam como estão. O texto original continua disponível
// onde a tela oferece "Ver a mensagem original". Testes: node --test gestor/test/mensagemClara.test.ts

const PADRAO = 'Não consegui concluir agora. Tente de novo em instantes; se repetir, avise o suporte.'

const REGRAS: [RegExp, string][] = [
  [/failed to fetch|networkerror|load failed|fetcherror|network request failed/i, 'Sem conexão com o servidor. Confira a internet e tente de novo.'],
  [/relay ?error|functionsrelay/i, 'O servidor está indisponível no momento. Tente de novo em instantes.'],
  [/non-2xx|functionshttperror|edge function returned/i, 'O servidor recusou o pedido. Tente de novo; se repetir, avise o suporte.'],
  [/jwt expired|invalid jwt|jwt malformed|not authenticated|auth session missing/i, 'Sua sessão expirou. Entre de novo no sistema.'],
  [/row-level security|permission denied|not authorized|insufficient[_ ]privilege/i, 'Você não tem permissão para fazer isso.'],
  [/duplicate key|already exists|unique constraint/i, 'Esse registro já existe.'],
  [/foreign key/i, 'Esse registro está ligado a outro e não pode ser alterado assim.'],
  [/timeout|timed out|deadline exceeded|aborted/i, 'A resposta demorou demais. Tente de novo.'],
  // A efrete devolve "Erro interno. Tente novamente em alguns minutos." quando ela mesma falha; nada chegou a ser emitido.
  [/erro interno\.?\s*tente novamente/i, 'A efrete teve um erro interno e não respondeu. Tente de novo em alguns minutos: o sistema confere na efrete antes, então não gera CIOT duplicado.'],
]

function textoDe(e: unknown): string {
  if (typeof e === 'string') return e
  if (e && typeof e === 'object') {
    const m = (e as { message?: unknown }).message
    if (typeof m === 'string') return m
    const n = (e as { name?: unknown }).name
    if (typeof n === 'string') return n
  }
  return ''
}

export function mensagemClara(e: unknown, padrao = PADRAO): string {
  const bruto = textoDe(e)
    // Prefixos do robô da efrete que não ajudam o gestor.
    .replace(/^Sistema efrete \([^)]*\):\s*/i, '')
    .replace(/efreteErro\s*/i, '')
    .trim()
  if (!bruto || /^(undefined|null|\[object object\]|erro desconhecido)\.?$/i.test(bruto)) return padrao
  for (const [re, texto] of REGRAS) if (re.test(bruto)) return texto
  return bruto
}
