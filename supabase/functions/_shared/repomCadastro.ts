// Preparo do cadastro de motorista e veiculo na Repom a partir do cadastro confirmado (Parte A etapa 7). SEM chamar a Repom: so monta
// o corpo (conforme docs/repom/ESPECIFICACAO-FRETE.md secoes 3 e 4), diz o que falta e valida a ORDEM (erros 801 e 760).
// Teste: node --test supabase/functions/_shared/repomCadastro.test.ts
export interface MotoristaCadastro {
  nome?: string | null; cpf?: string | null; cnh_numero_registro?: string | null; data_nascimento?: string | null; genero?: string | null
  cep?: string | null; logradouro?: string | null; numero_endereco?: string | null; complemento?: string | null; bairro?: string | null
  celular?: string | null
}
export interface VeiculoCadastroRepom {
  placa?: string | null; quantidade_eixos?: number | null; e_reboque?: boolean | null; tipo_veiculo?: string | null
}
export interface ProprietarioCadastro { nome?: string | null; documento?: string | null; rntrc?: string | null; nome_fantasia?: string | null }

const so = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const placa = (s: unknown) => String(s ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();

export interface CorpoComFalta<T> { corpo: T; faltando: string[] }

export function montarCorpoMotoristaRepom(m: MotoristaCadastro): CorpoComFalta<Record<string, unknown>> {
  const faltando: string[] = [];
  if (so(m.cpf).length !== 11) faltando.push("CPF do motorista");
  if (!m.cnh_numero_registro) faltando.push("numero da CNH");
  if (!m.nome) faltando.push("nome do motorista");
  if (!m.data_nascimento) faltando.push("data de nascimento");
  if (!m.genero) faltando.push("genero (M ou F)");
  const cel = so(m.celular);
  if (cel.length < 10) faltando.push("telefone com DDD");
  // TypeId do telefone: a Repom exige e o guia nao lista os codigos; sem origem no cadastro (registrado no relatorio).
  const corpo: Record<string, unknown> = {
    Country: "Brazil",
    NationalId: so(m.cpf),
    DriverLicenseNumber: m.cnh_numero_registro ?? undefined,
    Address: m.logradouro ? { Street: m.logradouro, Number: m.numero_endereco ?? "S/N", Complement: m.complemento ?? undefined, Neighborhood: m.bairro ?? undefined, ZipCode: so(m.cep) || undefined } : undefined,
    Phones: cel.length >= 10 ? [{ AreaCode: cel.slice(0, 2), Number: cel.slice(2), Preferential: true, TypeId: undefined }] : [],
    DriverPersonalInformation: { BirthDate: m.data_nascimento ?? undefined, Name: m.nome ?? undefined, Gender: m.genero === "F" ? "Female" : m.genero === "M" ? "Male" : undefined },
  };
  return { corpo, faltando };
}

export function montarCorpoVeiculoRepom(v: VeiculoCadastroRepom, p: ProprietarioCadastro): CorpoComFalta<Record<string, unknown>> {
  const faltando: string[] = [];
  if (!placa(v.placa)) faltando.push("placa");
  const eixos = Number(v.quantidade_eixos);
  if (!Number.isInteger(eixos) || eixos < 1 || eixos > 10) faltando.push("quantidade de eixos (define o valor do vale-pedagio)");
  const doc = so(p.documento);
  if (doc.length !== 11 && doc.length !== 14) faltando.push("CPF/CNPJ do proprietario");
  if (!p.rntrc) faltando.push("RNTRC do proprietario");
  if (!p.nome) faltando.push("nome do proprietario");
  const pj = doc.length === 14;
  if (pj && !p.nome_fantasia) faltando.push("nome fantasia do proprietario (empresa)");
  const corpo = {
    Country: "Brazil",
    LicensePlate: placa(v.placa),
    VehicleClassification: v.e_reboque ? "Implement" : "Traction",
    VehicleCategory: "CommercialHeavyweight", // o guia da Repom nao traz o nome do enum "pesado" (3): conferir com a Karen
    VehicleAxles: Number.isInteger(eixos) && eixos >= 1 && eixos <= 10 ? `Axle${String(eixos).padStart(2, "0")}` : undefined,
    VehicleOwner: {
      Country: "Brazil", NationalId: doc, Type: pj ? "Company" : "Person",
      BrazilianSettings: { RNTRC: p.rntrc ?? undefined, ...(pj ? { VehiclePessoaJuridica: { NomeFantasia: p.nome_fantasia ?? undefined } } : {}) },
      VehiclePersonalInformation: { Name: p.nome ?? undefined },
    },
  };
  return { corpo, faltando };
}

export interface EstadoRepom {
  /** o motorista ja existe na Repom (consulta feita antes) */
  motoristaCadastradoNaRepom: boolean
  /** o veiculo ja pertence ao prestador na Repom */
  veiculoNoPrestador: boolean
  eCavalo: boolean
  temImplemento: boolean
}
export interface ProblemaRepom { codigo: "801" | "760" | "implemento"; mensagem: string; dono: string }

/** Pre-checagem: em vez de enviar e falhar, mostra o que falta. */
export function preChecagemRepom(e: EstadoRepom): ProblemaRepom[] {
  const out: ProblemaRepom[] = [];
  if (!e.motoristaCadastradoNaRepom) out.push({ codigo: "801", mensagem: "falta cadastrar o motorista na Repom antes do contrato (erro 801 se enviar assim).", dono: "Eduardo" });
  if (!e.veiculoNoPrestador) out.push({ codigo: "760", mensagem: "veiculo nao esta no prestador (erro 760): falar com a Karen.", dono: "Karen" });
  if (e.eCavalo && !e.temImplemento) out.push({ codigo: "implemento", mensagem: "cavalo exige implemento (carreta) vinculado antes do contrato.", dono: "Eduardo" });
  return out;
}

/** Campos exigidos pela Repom que ainda NAO tem origem no cadastro (para o relatorio). */
export const CAMPOS_REPOM_SEM_ORIGEM = [
  "Phones[].TypeId (codigos nao listados no guia)",
  "Gender (coluna genero entra na etapa 26)",
  "VehicleCategory pesado (nome do enum nao consta no guia)",
  "VehiclePessoaJuridica.NomeFantasia do proprietario empresa",
  "BranchCode (codigo da filial Repom; coluna entra na etapa 26)",
] as const;
