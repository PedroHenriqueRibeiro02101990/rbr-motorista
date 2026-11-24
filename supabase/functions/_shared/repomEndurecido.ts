// Cliente Repom endurecido (Parte D etapa 25), somente regras puras e mocks: nenhuma chamada a producao.
// Origem: testes de QA da Repom em 17/11/2026 e reuniao com a Repom. Reaproveita o cliente existente (repomFreteClient, repomFluxos);
// aqui ficam as travas e ordenacoes que vem ANTES de enviar. Teste: node --test supabase/functions/_shared/repomEndurecido.test.ts

// ---- (a) Emissao sequencial por prestador + motorista ----
/** Fila por chave: tarefas da mesma chave rodam uma de cada vez; chaves diferentes seguem em paralelo. */
export class FilaPorChave {
  private caudas = new Map<string, Promise<unknown>>();
  rodar<T>(chave: string, tarefa: () => Promise<T>): Promise<T> {
    const anterior = this.caudas.get(chave) ?? Promise.resolve();
    const atual = anterior.catch(() => undefined).then(tarefa);
    const cauda = atual.catch(() => undefined);
    this.caudas.set(chave, cauda);
    void cauda.then(() => { if (this.caudas.get(chave) === cauda) this.caudas.delete(chave); });
    return atual;
  }
}
export const chaveFila = (prestadorDoc: string, motoristaCpf: string) => `${prestadorDoc.replace(/\D/g, "")}|${motoristaCpf.replace(/\D/g, "")}`;

// ---- (b) Consultar antes de reenviar (adotar o contrato existente) ----
export interface ConsultaContrato { existe: boolean; codigoContrato?: string | null }
export interface DepsAdocao {
  consultarPorIdentifier(identifier: string): Promise<ConsultaContrato>;
  emitir(identifier: string): Promise<{ ok: true; codigoContrato: string } | { ok: false; erro: string; timeout?: boolean }>;
}
export type ResultadoEmissao = { estado: "emitido" | "adotado"; codigoContrato: string } | { estado: "erro"; erro: string };

export const JA_CADASTRADO = /processo do cliente j[aá] est[aá] cadastrado/i;

/** Identifier deterministico (da operacao) e SEMPRE consulta antes de reenviar apos timeout ou "ja esta cadastrado". Nunca cria de novo. */
export async function emitirOuAdotar(identifier: string, deps: DepsAdocao): Promise<ResultadoEmissao> {
  const r = await deps.emitir(identifier);
  if (r.ok) return { estado: "emitido", codigoContrato: r.codigoContrato };
  if (r.timeout || JA_CADASTRADO.test(r.erro)) {
    const c = await deps.consultarPorIdentifier(identifier);
    if (c.existe && c.codigoContrato) return { estado: "adotado", codigoContrato: c.codigoContrato };
    if (JA_CADASTRADO.test(r.erro)) return { estado: "erro", erro: "A Repom diz que o contrato ja existe, mas nao o encontrei pelo identificador. Nao vou criar outro: fale com a Karen." };
    return { estado: "erro", erro: "Sem resposta da Repom e o contrato nao foi encontrado pelo identificador. Consulte de novo antes de reenviar." };
  }
  return { estado: "erro", erro: r.erro };
}

// ---- (c) Piso ANTT ----
export interface ValidacaoSimples { ok: boolean; mensagem?: string }
/** O piso vem de configuracao editavel (nunca inventado aqui). Sem piso configurado: nao bloqueia, avisa. */
export function validarPiso(valor: number, piso: number | null | undefined): ValidacaoSimples & { aviso?: string } {
  if (piso == null || !Number.isFinite(piso)) return { ok: true, aviso: "Piso ANTT nao configurado: nao consegui conferir o valor." };
  if (valor < piso) return { ok: false, mensagem: `Valor do frete (R$ ${valor.toFixed(2)}) abaixo do piso minimo ANTT (R$ ${piso.toFixed(2)}). A Repom rejeita; corrija o valor.` };
  return { ok: true };
}

// ---- (d) Cavalo exige implemento ----
export function validarImplemento(p: { eCavalo: boolean; carretas: number }): ValidacaoSimples {
  if (p.eCavalo && p.carretas < 1) return { ok: false, mensagem: "Cavalo sem carreta (implemento) vinculada: a Repom rejeita o contrato. Vincule a carreta." };
  return { ok: true };
}

// ---- (e) Conta digital x cartao fisico ----
export interface PrestadorCartao { contaDigital: boolean; cartaoFisico?: string | null }
export interface VinculoCartao { cartao: string; prestadorDoc: string; motoristaCpf: string }
export function numeroDoCartao(p: PrestadorCartao): { cardNumber: number | string; erro?: string } {
  if (p.contaDigital) return { cardNumber: 0 }; // viagem digital: CardNumber 0 (o numero de cartao digital foi rejeitado)
  if (!p.cartaoFisico) return { cardNumber: 0, erro: "Prestador sem conta digital e sem cartao fisico informado." };
  return { cardNumber: p.cartaoFisico };
}
/** Cartao fisico e amarrado a UM prestador e UM motorista: nao reutilizar em outro motorista (caso BWH3818). */
export function validarVinculoCartao(cartao: string, prestadorDoc: string, motoristaCpf: string, vinculos: VinculoCartao[]): ValidacaoSimples {
  const v = vinculos.find((x) => x.cartao === cartao);
  if (!v) return { ok: true };
  const d = (s: string) => s.replace(/\D/g, "");
  if (d(v.prestadorDoc) !== d(prestadorDoc) || d(v.motoristaCpf) !== d(motoristaCpf)) {
    return { ok: false, mensagem: "Este cartao pertence a outro motorista ou prestador na Repom. Use o cartao do proprio motorista (ou conta digital)." };
  }
  return { ok: true };
}

// ---- (f) Ordem: motorista antes do contrato (801) e veiculo do prestador (760) ----
export { preChecagemRepom } from "./repomCadastro.ts";

// ---- (g) MinimumFreightCost e um OBJETO, nunca numero solto ----
export interface PisoObjeto { distanceTravel: number; emptyReturn: boolean; highPerformanceTransport: boolean; veichleComposition: number }
export function montarMinimumFreightCost(p: PisoObjeto) {
  return { DistanceTravel: p.distanceTravel, EmptyReturn: p.emptyReturn, HighPerformanceTransport: p.highPerformanceTransport, VeichleComposition: p.veichleComposition }; // "Veichle" como na API
}

// ---- (h) Quitacao e erro 2768 ----
export type StatusViagem = "InTransit" | "Finished" | "Quitada" | string;
export function podeAutorizarPagamento(status: StatusViagem): ValidacaoSimples {
  if (status !== "Quitada" && status !== "Paid") return { ok: false, mensagem: "O pagamento so pode ser autorizado depois que a viagem estiver quitada (antes disso a Repom pode devolver erro 760). No QA, depois da quitacao o status da Repom passa a Paid." };
  return { ok: true };
}

// ---- (i) Tabela de erros: codigo da Repom -> mensagem, dono da acao e se pode tentar de novo ----
export type Dono = "Eduardo" | "Karen" | "Alan" | "Pedro";
export interface ErroRepom { mensagem: string; dono: Dono; podeTentarDeNovo: boolean; pendenciaExterna?: boolean }
export const TABELA_ERROS_REPOM: Record<string, ErroRepom> = {
  "801": { mensagem: "Motorista nao cadastrado na Repom antes do contrato. Cadastre o motorista e tente de novo.", dono: "Eduardo", podeTentarDeNovo: true },
  "760": { mensagem: "Erro 760 da Repom (codigo generico): pode ser veiculo fora do prestador, pagamento antes da quitacao OU data de pagamento invalida. Leia a mensagem que veio junto.", dono: "Karen", podeTentarDeNovo: false },
  "760_DATA": { mensagem: "Data de pagamento recusada pela Repom (deve ser maior ou igual a data atual). Envie PaymentDate (AAAA-MM-DD) do dia seguinte e tente uma vez.", dono: "Pedro", podeTentarDeNovo: true },
  "2768": { mensagem: "Aguardando a Karen configurar o controle de saldo (ControleSaldo) na Repom.", dono: "Karen", podeTentarDeNovo: false, pendenciaExterna: true },
  "JA_CADASTRADO": { mensagem: "O processo ja esta cadastrado na Repom: vamos adotar o contrato existente, sem criar outro.", dono: "Eduardo", podeTentarDeNovo: false },
  "PISO": { mensagem: "Valor abaixo do piso minimo ANTT.", dono: "Eduardo", podeTentarDeNovo: true },
  "CARTAO": { mensagem: "Cartao pertence a outro motorista ou prestador, ou numero de cartao digital rejeitado.", dono: "Alan", podeTentarDeNovo: true },
};
export function traduzirErroRepom(bruto: unknown): ErroRepom & { codigo: string } | null {
  const t = String(bruto ?? "");
  if (JA_CADASTRADO.test(t)) return { codigo: "JA_CADASTRADO", ...TABELA_ERROS_REPOM.JA_CADASTRADO };
  const m = t.match(/\b(801|760|2768)\b/);
  // 760 e generico: com mensagem de data de pagamento e erro de data (dono Pedro), nao de prestador/quitacao
  if (m && m[1] === "760" && /data de pagamento|payment ?date|data atual/i.test(t)) return { codigo: "760", ...TABELA_ERROS_REPOM["760_DATA"] };
  if (m) return { codigo: m[1], ...TABELA_ERROS_REPOM[m[1]] };
  return null;
}
/** Evento sem dados pessoais (G5): so codigo, mensagem e dono. */
export function eventoDeErro(operacaoId: string, e: ErroRepom & { codigo: string }) {
  return { operacao_id: operacaoId, tipo_documento: "ciot", evento: "erro", origem: "repom", sucesso: false, mensagem: `${e.codigo}: ${e.mensagem} (dono: ${e.dono})`, origem_acao: "repom_endurecido" };
}
