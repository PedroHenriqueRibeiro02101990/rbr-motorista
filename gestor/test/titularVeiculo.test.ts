// C1/C2/C4 + D5/D6 (correcoes da auditoria 19/11/2026): titular do veiculo = proprietario do CRLV, documentos vinculados, tipo do veiculo que o emissor entende.
// node --test gestor/test/titularVeiculo.test.ts   (dados sinteticos; CPF/CNPJ de teste validos, nenhum dado real)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { normalizarExtracao } from '../../supabase/functions/_shared/extracao-documentos.ts'
import { carroceriaParaMdfe, tipoVeiculoDoCrlv } from '../../supabase/functions/_shared/validacoes-cadastro.ts'
import { mapearTipoCarroceria, mapearTipoRodado, montarMdfe, type DadosMdfe, type VeiculoMdfe } from '../../supabase/functions/emitir-mdfe/mdfe.ts'
import { decidirTitular, type PessoaCadastrada } from '../src/lib/titularVeiculo.ts'
import { bucketECaminho } from '../src/lib/arquivoCadastro.ts'
import { achadosDoPayload, montarPayload, temBloqueio, titularesDoPayload } from '../src/lib/cadastroPorDocumentos.ts'

const HOJE = '2026-11-19'
const CPF_MOTORISTA = '52998224725' // valido (teste)
const CPF_DONO = '11144477735' // valido (teste)
const CNPJ_EMPRESA = '11222333000181' // valido (teste)
const c = (valor: unknown, confianca = 'alta') => ({ valor, confianca, trecho: 'x' })

const motorista: PessoaCadastrada = { id: 'p-mot', nome: 'Joao Motorista', cpf: CPF_MOTORISTA, cnpj: null, papel: 'titular_motorista' }
const gestor: PessoaCadastrada = { id: 'p-gestor', nome: 'Funcionario Logado', cpf: '39053344705', cnpj: null, papel: 'gestor_rbr' }

// ---------- C1: regra do titular ----------
test('C1 motorista dono do veiculo: CPF do CRLV = CPF do motorista cadastrado -> usa o motorista', () => {
  const d = decidirTitular({ documento: '529.982.247-25', nome: 'JOAO MOTORISTA', uf: 'SP' }, [motorista, gestor])
  assert.deepEqual(d, { acao: 'usar', pessoaId: 'p-mot', nome: 'Joao Motorista' })
})

test('C1 veiculo de OUTRA pessoa: o titular e o dono do CRLV (criado), nunca o motorista do lote', () => {
  const d = decidirTitular({ documento: CPF_DONO, nome: ' Maria  Dona ', uf: 'mg' }, [motorista, gestor])
  assert.equal(d.acao, 'criar')
  if (d.acao === 'criar') {
    assert.equal(d.nome, 'Maria  Dona'.trim())
    assert.equal(d.documento, CPF_DONO); assert.equal(d.tipo, 'PF'); assert.equal(d.uf, 'MG'); assert.equal(d.papel, 'titular_motorista')
  }
})

test('C1 veiculo de EMPRESA (CNPJ): cadastrada -> usa; nao cadastrada -> cria titular PJ com UF do CRLV', () => {
  const empresa: PessoaCadastrada = { id: 'p-emp', nome: 'Transportes LTDA', cpf: null, cnpj: '11.222.333/0001-81', papel: 'prestador_parceiro' }
  assert.deepEqual(decidirTitular({ documento: CNPJ_EMPRESA, nome: 'X', uf: 'SP' }, [empresa]), { acao: 'usar', pessoaId: 'p-emp', nome: 'Transportes LTDA' })
  const nova = decidirTitular({ documento: CNPJ_EMPRESA, nome: 'Transportes LTDA', uf: 'sp' }, [motorista])
  assert.equal(nova.acao, 'criar'); if (nova.acao === 'criar') { assert.equal(nova.tipo, 'PJ'); assert.equal(nova.uf, 'SP'); assert.equal(nova.documento, CNPJ_EMPRESA) }
})

test('C1 FUNCIONARIO cadastrando: o titular nunca e o funcionario (nem entra na decisao), mesmo sem motorista no lote', () => {
  const d = decidirTitular({ documento: CPF_DONO, nome: 'Maria Dona', uf: 'SP' }, [gestor])
  assert.equal(d.acao, 'criar') // criou o dono; o gestor logado nao foi usado
  // se o documento do CRLV existir na equipe E em outra pessoa, prefere a pessoa que nao e da equipe
  const dup: PessoaCadastrada = { id: 'p-gestor-2', nome: 'Mesmo CPF', cpf: gestor.cpf, papel: 'titular_motorista' }
  assert.deepEqual(decidirTitular({ documento: gestor.cpf!, nome: 'x' }, [gestor, dup]), { acao: 'usar', pessoaId: 'p-gestor-2', nome: 'Mesmo CPF' })
})

test('C1 sem documento, documento invalido ou sem nome (para criar): bloqueia, nunca inventa titular', () => {
  assert.equal(decidirTitular({ documento: '', nome: 'X' }, [motorista]).acao, 'bloquear')
  assert.equal(decidirTitular({ documento: '12345678900', nome: 'X' }, []).acao, 'bloquear')
  assert.equal(decidirTitular({ documento: CPF_DONO, nome: '  ' }, []).acao, 'bloquear')
  assert.equal(decidirTitular({ documento: CPF_DONO, nome: '' }, [{ id: 'p-dono', nome: 'Maria Dona', cpf: CPF_DONO, papel: 'titular_motorista' }]).acao, 'usar') // ja cadastrado: nome do CRLV nao e preciso
  assert.equal(decidirTitular({ documento: CPF_DONO, nome: 'Maria Dona' }, [{ id: 'p-apagado', nome: 'Maria Dona', cpf: CPF_DONO, papel: 'titular_motorista', deleted_at: '2026-01-01' }]).acao, 'criar') // apagada nao conta
})

// ---------- C1 na RPC (guarda estatica da migracao; o teste real de banco esta em supabase/tests/) ----------
test('C1 a migracao nova nao usa mais o ator/motorista como titular e cria o titular pelo CRLV', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/20261119-0900-cadastro-docs-titular-e-vinculos.sql', import.meta.url), 'utf8')
  const semComentario = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
  assert.ok(!/coalesce\(\s*v_mot\s*,\s*v_ator\s*\)/i.test(semComentario), 'titular nao pode ser coalesce(motorista, ator)')
  assert.ok(/_titular_do_crlv\(\s*v->>'proprietario_documento'/.test(semComentario))
  const insVeiculo = semComentario.slice(semComentario.indexOf('insert into veiculos'), semComentario.indexOf('returning id into v_id', semComentario.indexOf('insert into veiculos')))
  assert.ok(insVeiculo.includes('v_titular') && !insVeiculo.includes('v_ator') && !insVeiculo.includes('v_mot'))
  // a funcao interna nao recebe o usuario logado
  const fnTitular = semComentario.slice(semComentario.indexOf('create or replace function public._titular_do_crlv'), semComentario.indexOf('revoke all on function public._titular_do_crlv'))
  assert.ok(!/current_pessoa_id|v_ator/.test(fnTitular))
  assert.ok(/revoke all on function public\._titular_do_crlv\(text, text, text\) from public, anon, authenticated/.test(semComentario))
})

// ---------- payload: C1 + C2 + D5 + D6 ----------
const cnh = normalizarExtracao('cnh', { nome: c('Joao Motorista'), cpf: c(CPF_MOTORISTA), numero_registro: c('12345678900'), categoria: c('E'), validade: c('2030-05-01'), data_nascimento: c('1985-03-02') }, HOJE)
const rg = normalizarExtracao('rg', { nome: c('Joao Motorista'), numero_rg: c('123456789'), orgao_emissor: c('SSP'), uf_emissor: c('SP'), cpf: c(CPF_MOTORISTA) }, HOJE)
const cpfDoc = normalizarExtracao('cpf', { nome: c('Joao Motorista'), cpf: c(CPF_MOTORISTA) }, HOJE)
const rntrc = normalizarExtracao('rntrc', { numero: c('012345678'), titular: c('Joao Motorista'), validade: c('2027-01-01'), situacao: c('ativo') }, HOJE)
const comp = normalizarExtracao('comprovante_residencia', { nome_titular: c('Joao Motorista'), logradouro: c('Rua A'), numero: c('10'), bairro: c('Centro'), cidade: c('Campinas'), uf: c('SP'), cep: c('13000000'), data_emissao: c('2026-10-20') }, HOJE)
const banco = normalizarExtracao('dados_bancarios', { titular: c('Joao Motorista'), cpf_cnpj: c(CPF_MOTORISTA), banco_codigo: c('001'), agencia: c('1234'), conta: c('99999-0'), tipo_conta: c('corrente') }, HOJE)
const crlvCavalo = (dono = CPF_DONO, extra: Record<string, unknown> = {}) => normalizarExtracao('crlv', {
  placa: c('MKT6E78'), renavam: c('00000000001'), especie_tipo: c('TRACAO CAMINHAO TRATOR'), carroceria: c('SEM CARROCERIA'), quantidade_eixos: c(3), pbt: c(16.0),
  nome_proprietario: c('MARIA DONA'), cpf_cnpj_proprietario: c(dono), uf: c('MG'), ...extra }, HOJE)
const crlvCarreta = normalizarExtracao('crlv', {
  placa: c('MLN9A91'), renavam: c('00000000002'), especie_tipo: c('SEMIRREBOQUE'), carroceria: c('CARROCERIA ABERTA'), quantidade_eixos: c(3), pbt: c(25.5), capacidade_carga: c(16.33),
  nome_proprietario: c('TRANSPORTES LTDA'), cpf_cnpj_proprietario: c('11.222.333/0001-81'), uf: c('SP') }, HOJE)

test('C1 payload: o proprietario do CRLV (nome, documento, UF) segue para a RPC e e diferente do motorista', () => {
  const p = montarPayload([{ path: 'l/cnh.pdf', tipo: 'cnh', normalizado: cnh }, { path: 'l/cav.pdf', tipo: 'crlv', normalizado: crlvCavalo() }, { path: 'l/car.pdf', tipo: 'crlv', normalizado: crlvCarreta }])
  assert.equal(p.motorista?.cpf, CPF_MOTORISTA)
  assert.equal(p.cavalo?.proprietario_documento, CPF_DONO); assert.equal(p.cavalo?.proprietario_nome, 'MARIA DONA'); assert.equal(p.cavalo?.uf_licenciamento, 'MG')
  assert.equal(p.carreta?.proprietario_documento, CNPJ_EMPRESA); assert.equal(p.carreta?.proprietario_nome, 'TRANSPORTES LTDA')
  assert.ok(!temBloqueio(achadosDoPayload(p, HOJE).filter((a) => a.campo === 'proprietario')))
  assert.equal(titularesDoPayload(p).length, 2)
})

test('C1 sem CNH no lote (funcionario cadastrando so o CRLV): nao ha aviso de "titular sou eu"; o titular vem do CRLV; sem dono no CRLV bloqueia', () => {
  const ok = montarPayload([{ path: 'l/cav.pdf', tipo: 'crlv', normalizado: crlvCavalo() }])
  const a = achadosDoPayload(ok, HOJE)
  assert.ok(!a.some((x) => /VOCE|quem esta cadastrando/i.test(x.mensagem)))
  assert.ok(!a.some((x) => x.campo === 'proprietario'))
  const semDono = montarPayload([{ path: 'l/cav.pdf', tipo: 'crlv', normalizado: crlvCavalo('', { nome_proprietario: c(null) }) }])
  const b = achadosDoPayload(semDono, HOJE)
  assert.ok(b.some((x) => x.nivel === 'bloqueio' && x.campo === 'proprietario'))
})

test('C2 documentos: CNH, RG, CPF, RNTRC, comprovante e dados bancarios vao vinculados a pessoa; cada CRLV ao seu veiculo', () => {
  const p = montarPayload([
    { path: 'l/cnh.pdf', tipo: 'cnh', normalizado: cnh }, { path: 'l/rg.pdf', tipo: 'rg', normalizado: rg }, { path: 'l/cpf.pdf', tipo: 'cpf', normalizado: cpfDoc },
    { path: 'l/rntrc.pdf', tipo: 'rntrc', normalizado: rntrc }, { path: 'l/comp.pdf', tipo: 'comprovante_residencia', normalizado: comp, edicoes: { data_emissao: '2026-10-25' } },
    { path: 'l/banco.pdf', tipo: 'dados_bancarios', normalizado: banco },
    { path: 'l/cav.pdf', tipo: 'crlv', normalizado: crlvCavalo() }, { path: 'l/car.pdf', tipo: 'crlv', normalizado: crlvCarreta },
  ])
  const por = (t: string) => p.documentos.filter((d) => d.tipo === t)
  for (const t of ['cnh', 'rg', 'cpf', 'rntrc', 'comprovante_residencia', 'dados_bancarios']) { assert.equal(por(t).length, 1, t); assert.equal(por(t)[0].alvo, 'motorista', t) }
  assert.deepEqual(por('crlv').map((d) => [d.path, d.alvo]), [['l/cav.pdf', 'cavalo'], ['l/car.pdf', 'carreta']])
  assert.equal(por('comprovante_residencia')[0].data, '2026-10-25') // data confirmada na tela vai para pessoas.comprovante_residencia_data
  assert.equal(p.excedentes.length, 0)
})

test('C2 o arquivo do cadastro por documentos abre no bucket certo; o do app continua em documentos-pessoais', () => {
  assert.deepEqual(bucketECaminho('cadastro-documentos/lote-1/1-cnh.pdf'), { bucket: 'cadastro-documentos', caminho: 'lote-1/1-cnh.pdf' })
  assert.deepEqual(bucketECaminho('pessoa/abc/cnh-1.jpg'), { bucket: 'documentos-pessoais', caminho: 'pessoa/abc/cnh-1.jpg' })
})

test('C2 a migracao vincula tudo (pessoa, veiculo, cnh_foto_url, cnh_extracao_id, comprovante) e amplia o CHECK de tipos', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/20261119-0900-cadastro-docs-titular-e-vinculos.sql', import.meta.url), 'utf8')
  for (const trecho of ['insert into documentos_pessoais_imagens', 'cnh_foto_url = v_url', 'cnh_extracao_id = v_url', 'comprovante_residencia_url = v_url', "'rntrc'::text", "'cpf'::text", "'dados_bancarios'::text", 'from documento_extracoes where path = v_url']) assert.ok(sql.includes(trecho), trecho)
  assert.ok(sql.includes('pessoa_id is not distinct from v_pes'), 'idempotente por dono')
})

test('D5 CRLV a mais NAO e descartado em silencio: vira excedente que bloqueia; o 2o cavalo nao vira carreta', () => {
  const outro = normalizarExtracao('crlv', { placa: c('ABC1D23'), renavam: c('00000000003'), especie_tipo: c('CAMINHAO TRATOR'), quantidade_eixos: c(3), nome_proprietario: c('X'), cpf_cnpj_proprietario: c(CPF_DONO) }, HOJE)
  const p = montarPayload([{ path: 'l/a.pdf', tipo: 'crlv', normalizado: crlvCavalo() }, { path: 'l/b.pdf', tipo: 'crlv', normalizado: outro }])
  assert.equal(p.cavalo?.placa, 'MKT6E78'); assert.equal(p.carreta, undefined)
  assert.equal(p.excedentes.length, 1); assert.match(p.excedentes[0].descricao, /ABC1D23/)
  assert.ok(temBloqueio(achadosDoPayload(p, HOJE)))
  // 2 carretas: a 1a fica, a 2a e excedente (antes a ultima sobrescrevia a primeira)
  const car2 = normalizarExtracao('crlv', { placa: c('XYZ9K88'), renavam: c('00000000004'), especie_tipo: c('SEMIRREBOQUE'), quantidade_eixos: c(3), nome_proprietario: c('X'), cpf_cnpj_proprietario: c(CPF_DONO) }, HOJE)
  const q = montarPayload([{ path: 'l/c.pdf', tipo: 'crlv', normalizado: crlvCarreta }, { path: 'l/d.pdf', tipo: 'crlv', normalizado: car2 }])
  assert.equal(q.carreta?.placa, 'MLN9A91'); assert.equal(q.excedentes.length, 1)
  // 2o documento pessoal do mesmo tipo: so aviso
  const r = montarPayload([{ path: 'l/c1.pdf', tipo: 'cnh', normalizado: cnh }, { path: 'l/c2.pdf', tipo: 'cnh', normalizado: cnh }])
  assert.equal(r.excedentes.length, 1); assert.equal(r.excedentes[0].bloqueia, false)
})

test('D6 carroceria: texto do CRLV vira o que o emissor do MDF-e entende; o que nao tem equivalente fica como esta e a tela avisa', () => {
  const casos: [string, string][] = [['CARROCERIA ABERTA', 'aberta'], ['Graneleira', 'graneleira'], ['BAÚ', 'bau'], ['Carroceria fechada', 'bau'], ['SIDER', 'sider'], ['porta-container', 'container'], ['PRANCHA', 'aberta'], ['SEM CARROCERIA', 'nao aplicavel'], ['NAO APLICAVEL', 'nao aplicavel']]
  for (const [entrada, esperado] of casos) {
    const r = carroceriaParaMdfe(entrada)
    assert.deepEqual([r.valor, r.reconhecida], [esperado, true], entrada)
    assert.notEqual(mapearTipoCarroceria(r.valor), null, `o emissor deve entender "${r.valor}"`)
  }
  for (const nao of ['TANQUE', 'FRIGORIFICA', 'BASCULANTE', 'CEGONHA']) { const r = carroceriaParaMdfe(nao); assert.equal(r.reconhecida, false, nao); assert.equal(mapearTipoCarroceria(r.valor), null) }
  assert.deepEqual(carroceriaParaMdfe(''), { valor: null, reconhecida: false })
  // no payload: truck com carroceria que o emissor nao entende -> grava o texto cru e AVISA; cavalo nunca grava texto sem equivalente
  const truck = normalizarExtracao('crlv', { placa: c('TRK1A23'), renavam: c('00000000005'), especie_tipo: c('CAMINHAO'), carroceria: c('TANQUE'), quantidade_eixos: c(3), nome_proprietario: c('Maria'), cpf_cnpj_proprietario: c(CPF_DONO) }, HOJE)
  const p = montarPayload([{ path: 'l/t.pdf', tipo: 'crlv', normalizado: truck }])
  assert.equal(p.cavalo?.tipo_carroceria, 'TANQUE')
  assert.ok(achadosDoPayload(p, HOJE).some((a) => a.campo === 'tipo_carroceria' && a.nivel === 'aviso'))
  const cav = montarPayload([{ path: 'l/c.pdf', tipo: 'crlv', normalizado: crlvCavalo('11144477735', { carroceria: c('QUALQUER COISA') }) }])
  assert.equal(cav.cavalo?.tipo_carroceria, null)
  assert.ok(!achadosDoPayload(cav, HOJE).some((a) => a.campo === 'tipo_carroceria'))
  assert.equal(montarPayload([{ path: 'l/a.pdf', tipo: 'crlv', normalizado: crlvCarreta }]).carreta?.tipo_carroceria, 'aberta')
})

// ---------- C4: tipo do veiculo que o emissor entende ----------
test('C4 CRLV novo grava um tipo que o emissor reconhece (TRACAO CAMINHAO TRATOR, truck, toco, van, utilitario) e reboque vai para reboques', () => {
  const trator = ['TRACAO CAMINHAO TRATOR', 'CAMINHAO TRATOR', 'CARGA/CAMINHÃO TRATOR', 'TRAÇÃO/CAMINHÃO TRATOR']
  for (const e of trator) { const t = tipoVeiculoDoCrlv(e, 3).tipo; assert.equal(mapearTipoRodado(t), '03', e) }
  assert.equal(mapearTipoRodado(tipoVeiculoDoCrlv('CAMINHAO', 3).tipo), '01') // truck
  assert.equal(mapearTipoRodado(tipoVeiculoDoCrlv('CAMINHAO', 2).tipo), '02') // toco
  assert.equal(mapearTipoRodado(tipoVeiculoDoCrlv('MICROONIBUS VAN', 2).tipo), '04')
  assert.equal(mapearTipoRodado(tipoVeiculoDoCrlv('CAMIONETA', 2).tipo), '05')
  assert.equal(tipoVeiculoDoCrlv('SEMIRREBOQUE', 3).tipo, 'semirreboque'); assert.equal(mapearTipoRodado('semirreboque'), null)
  // o texto cru do CRLV, esse sim, o emissor NAO entende (e o que esta nos cavalos SXR2E28 e MIT7D37): o dado antigo e corrigido em correcoes-pendentes bloco 9
  assert.equal(mapearTipoRodado('TRACAO CAMINHAO TRATOR'), null)
})

test('C4 cavalo gravado pelo cadastro novo + carreta gravada pelo cadastro novo: o previa do MDF-e nao trava por rodado nem por carroceria', () => {
  const p = montarPayload([{ path: 'l/cav.pdf', tipo: 'crlv', normalizado: crlvCavalo() }, { path: 'l/car.pdf', tipo: 'crlv', normalizado: crlvCarreta }])
  const v = (x: Record<string, unknown> | undefined): VeiculoMdfe => ({
    placa: String(x?.placa), renavam: String(x?.renavam), tara_kg: 7500, capacidade_carga: (x?.capacidade_carga as number) ?? null, tipo_veiculo: x?.tipo_veiculo as string,
    tipo_carroceria: x?.tipo_carroceria as string | null, uf_licenciamento: 'SP', is_veiculo_proprio: true, quantidade_eixos: x?.quantidade_eixos as number, titular: null,
  })
  const { bloqueios, payload } = montarMdfe({
    op: { ambiente_fiscal: 'homologacao', ie_configurada: true, emitente_cnpj: '69115969000104', emitente_ie: '162095813113', emitente_razao_social: 'RBR CARGO LTDA', veiculo_id: 'v1', veiculo_rntrc_ativo: true, motorista_id: 'm1', motorista_rntrc_ativo: true, motorista_nome: 'Motorista Teste', motorista_cpf: '123.456.789-09', cidade_origem: 'SAO PAULO', uf_origem: 'SP', cidade_destino: 'CAMPINAS', uf_destino: 'SP', valor_nf: 5000 },
    pf: { responsavel_tecnico_cnpj: '69115969000104', responsavel_tecnico_email: 'fiscal@rbr.com.br', endereco_logradouro: 'Rua', endereco_numero: '1', endereco_bairro: 'B', endereco_cep: '01000-000', endereco_uf: 'SP', endereco_codigo_municipio: '3550308', rntrc: '012345678' },
    municipioEmitente: 'São Paulo', cte: { status: 'emitido', chave_acesso: '35261069115969000104570010000000011211536013' },
    tracao: v(p.cavalo), reboques: [v(p.carreta)],
    carregamento: { codigo_ibge: '3550308', cidade: 'São Paulo' }, descarregamento: { codigo_ibge: '3509502', cidade: 'Campinas' },
    cotacao: { peso_bruto_kg: 1000, tipo_carga: 'Carga geral', produto: 'Mercadoria teste', ncm: '49111090', pedagio: 0 },
    apolice: { seguradora_nome: 'Seguradora X', seguradora_cnpj: '11222333000181', numero_apolice: '123', responsavel_seguro: 'emitente' },
    motorista: { pix: 'chave-pix', banco_codigo: null, banco_agencia: null }, cliente: { cnpj: '11444777000161', cpf: null, razao_social: 'CLIENTE TESTE' },
    ciotVpo: { numero_averbacao: 'AVB-123' }, cepCarregamento: '01000000', cepDescarregamento: '13000000', condicao: { valor_total_contrato: 1500, valor_adiantamento: 1200, saldo_prazo_dias: 1 },
    agora: new Date('2026-10-07T12:00:00Z'),
  } as DadosMdfe)
  assert.deepEqual(bloqueios.filter((b: unknown) => /rodado|carroceria/i.test(String(typeof b === 'string' ? b : (b as { mensagem?: string }).mensagem ?? JSON.stringify(b)))), [])
  assert.equal(payload.modal_rodoviario.tipo_rodado_veiculo, '03')
  assert.equal(payload.modal_rodoviario.tipo_carroceria_veiculo, '00') // carroceria do cavalo nao entra
  assert.equal(payload.modal_rodoviario.veiculos_reboque[0].tipo_carroceria, '01') // carreta "CARROCERIA ABERTA" -> aberta
})
