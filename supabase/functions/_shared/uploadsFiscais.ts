// Uploads da aba Fiscal (Parte B etapa 12b): validacao (navegador e servidor), caminho no bucket, hash e plano de gravacao.
// Teste: node --test supabase/functions/_shared/uploadsFiscais.test.ts
export type CampoUpload = "nfe_xml" | "cte_pdf" | "vpo_pdf" | "ciot_pdf" | "mdfe_pdf";
export const MAX_BYTES = 10 * 1024 * 1024;
export const MAX_BYTES_XML = 2 * 1024 * 1024;

export interface RegraCampo {
  bucket: "operacao-documentos" | "operacao-nfe";
  pasta: string;
  extensoes: string[];
  mimes: string[];
  max: number;
  /** tipo na documentacao_operacao (null = NF-e vai para operacao_nfes pela rotina propria) */
  tipoDoc: "cte" | "mdfe" | "vpo" | "ciot" | null;
  rotulo: string;
}
export const REGRAS: Record<CampoUpload, RegraCampo> = {
  nfe_xml: { bucket: "operacao-nfe", pasta: "nfe", extensoes: ["xml"], mimes: ["text/xml", "application/xml"], max: MAX_BYTES_XML, tipoDoc: null, rotulo: "NF-e (XML)" },
  cte_pdf: { bucket: "operacao-documentos", pasta: "cte", extensoes: ["pdf"], mimes: ["application/pdf"], max: MAX_BYTES, tipoDoc: "cte", rotulo: "PDF do CT-e" },
  vpo_pdf: { bucket: "operacao-documentos", pasta: "vpo", extensoes: ["pdf", "png", "jpg", "jpeg"], mimes: ["application/pdf", "image/png", "image/jpeg"], max: MAX_BYTES, tipoDoc: "vpo", rotulo: "Vale-pedagio (PDF ou imagem)" },
  ciot_pdf: { bucket: "operacao-documentos", pasta: "ciot", extensoes: ["pdf"], mimes: ["application/pdf"], max: MAX_BYTES, tipoDoc: "ciot", rotulo: "PDF do CIOT" },
  mdfe_pdf: { bucket: "operacao-documentos", pasta: "mdfe", extensoes: ["pdf"], mimes: ["application/pdf"], max: MAX_BYTES, tipoDoc: "mdfe", rotulo: "PDF do MDF-e" },
};

export interface ArquivoMeta { nome: string; tamanho: number; mime?: string | null }
export interface ResultadoValidacao { ok: boolean; mensagem?: string }

export function validarArquivo(campo: CampoUpload, a: ArquivoMeta): ResultadoValidacao {
  const r = REGRAS[campo];
  const ext = (a.nome.split(".").pop() ?? "").toLowerCase();
  if (!a.tamanho || a.tamanho <= 0) return { ok: false, mensagem: "O arquivo esta vazio. Escolha outro arquivo." };
  if (!r.extensoes.includes(ext)) return { ok: false, mensagem: `${r.rotulo}: use ${r.extensoes.map((e) => e.toUpperCase()).join(", ")}. Voce enviou .${ext || "?"}.` };
  if (a.mime && !r.mimes.includes(a.mime) && a.mime !== "application/octet-stream") return { ok: false, mensagem: `${r.rotulo}: o tipo do arquivo (${a.mime}) nao e aceito. Envie ${r.extensoes.map((e) => e.toUpperCase()).join(" ou ")}.` };
  if (a.tamanho > r.max) return { ok: false, mensagem: `${r.rotulo}: arquivo maior que ${Math.round(r.max / 1024 / 1024)} MB. Reduza ou envie outro.` };
  return { ok: true };
}

/** {operacao_id}/{tipo}/{timestamp}-{nome_sanitizado} */
export function caminhoArquivo(campo: CampoUpload, operacaoId: string, nome: string, agora = Date.now()): string {
  const limpo = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_").slice(-80);
  return `${operacaoId}/${REGRAS[campo].pasta}/${agora}-${limpo}`;
}

export async function hashArquivo(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface DocExistente { id?: string; arquivo_path?: string | null; arquivo_nome?: string | null; arquivo_hash?: string | null; versao?: number | null; arquivo_historico?: string[] | null }
export type Plano =
  | { acao: "duplicado"; mensagem: string }
  | { acao: "criar"; versao: 1; historico: string[] }
  | { acao: "trocar"; versao: number; historico: string[] };

/** Mesmo arquivo (hash) na mesma operacao e tipo: avisa e nao duplica. Trocar NUNCA apaga: o caminho antigo vai para o historico/evento. */
export function planejarGravacao(existente: DocExistente | null, hash: string): Plano {
  if (!existente || !existente.arquivo_path) return { acao: "criar", versao: 1, historico: [] };
  if (existente.arquivo_hash && existente.arquivo_hash === hash) return { acao: "duplicado", mensagem: "Este mesmo arquivo ja foi enviado para esta operacao. Nada foi duplicado." };
  return { acao: "trocar", versao: (existente.versao ?? 1) + 1, historico: [...(existente.arquivo_historico ?? []), existente.arquivo_path] };
}

export type EventoUpload = "upload" | "leitura" | "confirmacao" | "troca" | "erro";
export interface EventoFiscal {
  operacao_id: string; tipo_documento: string; evento: EventoUpload; origem: string; ator_id: string | null; sucesso: boolean; mensagem: string
  requisicao?: unknown; resposta?: unknown; origem_acao: string
}
export function montarEvento(p: { operacaoId: string; campo: CampoUpload; evento: EventoUpload; atorId: string | null; sucesso: boolean; mensagem: string; requisicao?: unknown; resposta?: unknown }): EventoFiscal {
  return { operacao_id: p.operacaoId, tipo_documento: REGRAS[p.campo].tipoDoc ?? "nfe", evento: p.evento, origem: "manual", ator_id: p.atorId, sucesso: p.sucesso, mensagem: p.mensagem, requisicao: p.requisicao, resposta: p.resposta, origem_acao: "manual" };
}
