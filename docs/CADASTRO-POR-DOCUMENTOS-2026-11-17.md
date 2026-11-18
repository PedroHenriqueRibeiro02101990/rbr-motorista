# Cadastro por documentos (Parte A do prompt mestre de 18/11/2026)

Objetivo: o Eduardo (operacao) deixa de digitar. Ele solta os documentos (CRLV do cavalo, CRLV da carreta, CNH, RNTRC, comprovante de residencia, dados bancarios) e o sistema le, confere e cadastra tudo ja vinculado. A pessoa so confere e confirma.

## Fluxo
1. Tela **Cadastros > Novo cadastro por documentos** (so aparece com a flag `VITE_CADASTRO_POR_DOCUMENTOS=true`; padrao desligada).
2. Arrastar e soltar varios arquivos (PDF, PNG, JPG ate 10 MB). Cada um vai para o bucket privado `cadastro-documentos`.
3. A funcao `extrair-documento` (modo `cadastro`) classifica cada arquivo e extrai os campos, cada um com **confianca** (alta, media, baixa), trecho de origem e motivo quando vier vazio. Nunca inventa.
4. Conferencia: documento de um lado, campos do outro, cor da confianca; campo vazio ou de baixa confianca fica destacado e e obrigatorio conferir. Validacoes ao lado.
5. Resumo do que sera criado ("1 motorista, 1 cavalo, 1 carreta vinculada ao cavalo") e botao **Confirmar cadastro**.
6. Confirmar chama a RPC `confirmar_cadastro_por_documentos` (uma transacao): motorista por CPF, veiculo por placa (sem duplicar), `e_reboque` pela especie do CRLV, carreta vinculada ao cavalo (`carreta_padrao_id`), auditoria por campo. So mostra "ok" depois de reler os registros gravados.

## Regras globais de campos
- **G1 peso**: so kg inteiro, exibido "25.500 kg". "25,5" e "25.5" sao recusados ("Tara e em kg. Voce quis dizer 25.500?"). A unica conversao automatica e a da leitura de CRLV, que mostra "25,5 t para 25.500 kg" para confirmar.
- **G2 reais**: `CampoMoeda` (mascara de centavos). 150025 vira R$ 1.500,25; acima de R$ 100.000,00 pede confirmacao. Conversao do formato brasileiro num unico lugar: `supabase/functions/_shared/unidades-br.ts`.
- **G3 tara em tres niveis** (`_shared/tara-aproximada.ts`, funcao `resolverTara`): 1 confirmada plausivel; 2 so carreta, PBT menos capacidade (capacidade < PBT, >= 1.000 kg, resultado 2.000 a 20.000 kg), origem `derivada_crlv`; 3 tabela aproximada provisoria (cavalo 2 eixos 7.700; cavalo 3 eixos 9.500; carreta 3 eixos aberta/carga seca 7.000; cacamba/basculante 9.200), origem `aproximada_tabela`, com aviso amarelo. Outros tipos pedem a tara manual. Tara gravada absurda e ignorada na emissao; o cadastro nao e reescrito.
- **G4 CRLV digital**: nao traz tara; PBT e capacidade vem em toneladas; `*.*` e vazio; PBT de cavalo nunca e tara; CMT so para aviso.
- **G5**: avisos derivados do estado gravado (nada de texto fixo); confirmacao como linha permanente com data, hora e quem fez (`StatusAcao`).

## Validacoes (`_shared/validacoes-cadastro.ts`)
Placa (antiga e Mercosul), CPF/CNPJ com digito verificador, tara fora de 1.000 a 30.000 kg (cavalo/caminhao) ou 2.000 a 20.000 kg (carreta) = bloqueio; faixa usual = aviso; PBT usado como tara = bloqueio; capacidade x (PBT menos tara) acima de 10% = aviso; especie do CRLV marca `e_reboque`; cavalo sem carreta = aviso; CNH vencida = bloqueio, a vencer em 30 dias = aviso; RNTRC so bloqueia se a ANTT confirmar inativo; placa do CRLV diferente da digitada = bloqueio; proprietario diferente do motorista = aviso com o tipo de transportador (TAC/ETC).

## Banco (migracoes em arquivo; aplicadas somente na etapa 28)
- `supabase/migrations/20261118-0100-cadastro-por-documentos.sql`: colunas novas (opcionais), bucket `cadastro-documentos`, tabela `cadastro_auditoria`, RPC.
- `supabase/migrations/20261118-0110-padronizacao-pesos-valores.sql`: CHECK ... NOT VALID (valida so gravacoes novas).
- Rollbacks em `supabase/rollback/`.
- Perfis: `gestor_rbr`, `operacao` e `fiscal` (Eduardo = operacao).

## Como corrigir um cadastro existente
Cadastros > **Cadastros para corrigir** lista os veiculos com tara ou capacidade fora da faixa (ex.: MKT6E78 e MLN9A91). Para corrigir, **Novo cadastro por documentos** com o CRLV: a RPC atualiza pela placa. Nada e alterado por script.

## Como testar
`node --test gestor/test/*.test.ts supabase/functions/_shared/*.test.ts supabase/functions/emitir-mdfe/*.test.ts shared/*.test.ts agenciador/src/lib/*.test.ts`
Documentos de exemplo nos testes sao sinteticos (nenhum dado real no repositorio).

## Repom (etapa 7)
`_shared/repomCadastro.ts` monta o corpo de motorista e veiculo e valida a ordem (801 motorista antes do contrato; 760 veiculo no prestador; cavalo exige implemento). O botao "Cadastrar na Repom" fica desligado (`VITE_REPOM_CADASTRO_HABILITADO`). Campos sem origem no cadastro: telefone TypeId, genero (etapa 26), categoria pesada, nome fantasia do proprietario empresa, filial Repom.
