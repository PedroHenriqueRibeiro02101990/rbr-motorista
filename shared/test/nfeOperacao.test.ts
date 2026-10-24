// Testes da NF-e do cliente na operação (shared/nfeOperacao.ts + parser shared/nfeParser.ts). Sem rede nem banco.
// Rodar na raiz do repositório (o DOMParser vem do xmldom, porque Deno/Node não têm DOMParser):
//   deno test --sloppy-imports shared/test/nfeOperacao.test.ts
// O XML de exemplo segue o leiaute oficial da NF-e 4.00 (nfeProc autorizado) com dados fictícios e chave com DV válido.
import { DOMParser as XmlDomParser } from 'npm:@xmldom/xmldom@0.8.10'
import { assert, assertEquals } from 'jsr:@std/assert@1'

;(globalThis as unknown as { DOMParser: unknown }).DOMParser = XmlDomParser
const m = await import('../nfeOperacao.ts')

const CHAVE = '35261069115969000104550010000000011000000019'
const CHAVE2 = '35261069115969000104550010000000021000000024'

const nfeProc = (chave: string, nNF: string, vNF: string, pesoB: string) => `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe xmlns="http://www.portalfiscal.inf.br/nfe">
    <infNFe Id="NFe${chave}" versao="4.00">
      <ide><cUF>35</cUF><cNF>00000001</cNF><natOp>VENDA DE MERCADORIA</natOp><mod>55</mod><serie>1</serie><nNF>${nNF}</nNF>
        <dhEmi>2026-10-24T08:00:00-03:00</dhEmi><tpNF>1</tpNF><idDest>1</idDest><cMunFG>3550308</cMunFG><tpAmb>2</tpAmb></ide>
      <emit><CNPJ>69115969000104</CNPJ><xNome>EMBARCADOR FICTICIO LTDA</xNome>
        <enderEmit><xLgr>AV PAULISTA</xLgr><nro>777</nro><xBairro>BELA VISTA</xBairro><cMun>3550308</cMun><xMun>São Paulo</xMun><UF>SP</UF><CEP>01311914</CEP><fone>1130000000</fone></enderEmit>
        <IE>123456789110</IE><CRT>1</CRT></emit>
      <dest><CNPJ>11222333000181</CNPJ><xNome>DESTINATARIO FICTICIO SA</xNome>
        <enderDest><xLgr>RUA DO TESTE</xLgr><nro>100</nro><xBairro>CENTRO</xBairro><cMun>3509502</cMun><xMun>Campinas</xMun><UF>SP</UF><CEP>13010000</CEP></enderDest>
        <indIEDest>1</indIEDest><IE>244000000110</IE></dest>
      <det nItem="1"><prod><cProd>1</cProd><xProd>CAIXA PLASTICA</xProd><NCM>39231090</NCM><CFOP>5102</CFOP><uCom>UN</uCom><qCom>1000</qCom><vUnCom>8</vUnCom><vProd>8000.00</vProd></prod></det>
      <det nItem="2"><prod><cProd>2</cProd><xProd>TAMPA PLASTICA</xProd><NCM>39235000</NCM><CFOP>5102</CFOP><uCom>UN</uCom><qCom>1000</qCom><vUnCom>2</vUnCom><vProd>2000.00</vProd></prod></det>
      <total><ICMSTot><vProd>10000.00</vProd><vNF>${vNF}</vNF></ICMSTot></total>
      <transp><modFrete>0</modFrete><vol><qVol>40</qVol><pesoL>950.000</pesoL><pesoB>${pesoB}</pesoB></vol></transp>
    </infNFe>
  </NFe>
  <protNFe versao="4.00"><infProt><tpAmb>2</tpAmb><chNFe>${chave}</chNFe><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe>
</nfeProc>`

const cteProc = `<?xml version="1.0" encoding="UTF-8"?>
<cteProc xmlns="http://www.portalfiscal.inf.br/cte" versao="4.00"><CTe><infCte Id="CTe35261069115969000104570010000000011000000010" versao="4.00">
  <infCTeNorm><infDoc><infNFe><chave>${CHAVE}</chave></infNFe><infNFe><chave>${CHAVE2}</chave></infNFe></infDoc></infCTeNorm>
</infCte></CTe></cteProc>`

const ctx = {
  clienteCnpj: '69115969000104',
  cidadeOrigem: 'SAO PAULO',
  ufOrigem: 'SP',
  cidadeDestino: 'CAMPINAS',
  ufDestino: 'SP',
  valorCargaCotacao: 10000,
  duplicadasEmOutraOperacao: [] as string[],
}

Deno.test('lê o XML autorizado (nfeProc): chave, número, emitente, destinatário, valor, peso, NCM e cidades', () => {
  const r = m.lerXmlNotaOuCte(nfeProc(CHAVE, '1', '10000.00', '1000.000'))
  assert(r.tipo === 'nfe')
  const n = r.nota
  assertEquals(n.chave_acesso, CHAVE)
  assertEquals([n.numero, n.serie], ['1', '1'])
  assertEquals([n.emitente_cnpj, n.destinatario_cnpj], ['69115969000104', '11222333000181'])
  assertEquals([n.valor, n.peso_kg, n.quantidade_volumes], [10000, 1000, 40])
  assertEquals(n.ncm, '39231090') // item de maior valor
  assertEquals(n.ncms, ['39231090', '39235000'])
  assertEquals([n.municipio_origem, n.uf_origem, n.municipio_destino, n.uf_destino], ['São Paulo', 'SP', 'Campinas', 'SP'])
  assertEquals(n.data_emissao, '2026-10-24')
  assertEquals(n.origem, 'xml')
  assertEquals(m.conferirNotas([n], ctx), []) // tudo confere
})

Deno.test('aceita o XML do CT-e autorizado: devolve as chaves das NF-e citadas', () => {
  assertEquals(m.lerXmlNotaOuCte(cteProc), { tipo: 'cte', chaves: [CHAVE, CHAVE2] })
})

Deno.test('arquivo que não é NF-e nem CT-e e NF-e com chave inválida são recusados', () => {
  assertEquals(m.lerXmlNotaOuCte('<foo><bar/></foo>').tipo, 'invalido')
  const ruim = m.lerXmlNotaOuCte(nfeProc('35261069115969000104550010000000011000000018', '1', '10000.00', '1000'))
  assert(ruim.tipo === 'invalido' && /Dígito verificador/.test(ruim.motivo))
})

Deno.test('chave digitada: tamanho, modelo e dígito verificador; número/série/emitente saem da própria chave', () => {
  assertEquals(m.conferirChaveNfe(CHAVE).ok, true)
  assertEquals(m.conferirChaveNfe('3526106911596900010455001000000001100000001').ok, false)
  const mod57 = m.conferirChaveNfe('35261069115969000104570010000000011000000010')
  assert(!mod57.ok && mod57.problema === 'modelo')
  const dv = m.conferirChaveNfe('3526 1069 1159 6900 0104 5500 1000 0000 0110 0000 0018')
  assert(!dv.ok && dv.problema === 'digito')
  const d = m.notaDigitada({ chave: CHAVE2, valor: 2500, pesoKg: 700, ncm: '3923.10.90' })
  assert(d.ok)
  assertEquals([d.nota.numero, d.nota.serie, d.nota.emitente_cnpj, d.nota.ncm, d.nota.origem], ['2', '1', '69115969000104', '39231090', 'digitada'])
  assertEquals(m.notaDigitada({ chave: CHAVE, valor: 0 }).ok, false)
})

Deno.test('várias notas: soma de valor e peso; soma diferente da cotação só avisa', () => {
  const a = (m.lerXmlNotaOuCte(nfeProc(CHAVE, '1', '6000.00', '600')) as { nota: Parameters<typeof m.conferirNotas>[0][number] }).nota
  const b = (m.lerXmlNotaOuCte(nfeProc(CHAVE2, '2', '4000.00', '400')) as { nota: typeof a }).nota
  assertEquals(m.totaisNotas([a, b]), { quantidade: 2, valor: 10000, pesoKg: 1000 })
  assertEquals(m.conferirNotas([a, b], ctx), [])
  const avisos = m.conferirNotas([a], ctx)
  assertEquals(avisos.map((x) => x.codigo), ['soma'])
})

Deno.test('conferências que só avisam: cliente, origem/destino da rota e NF duplicada em outra operação', () => {
  const n = (m.lerXmlNotaOuCte(nfeProc(CHAVE, '1', '10000.00', '1000')) as { nota: Parameters<typeof m.conferirNotas>[0][number] }).nota
  const outro = { ...ctx, clienteCnpj: '99888777000166', cidadeOrigem: 'Jundiaí', cidadeDestino: 'Campinas', duplicadasEmOutraOperacao: [CHAVE] }
  assertEquals(m.conferirNotas([n], outro).map((x) => x.codigo), ['cliente', 'origem', 'duplicada'])
})

Deno.test('"Usar a NF da cotação": copia os campos nf_* e marca origem cotacao', () => {
  const r = m.notaDaCotacao({
    nf_chave_acesso: CHAVE, nf_numero: '1', nf_serie: '1', nf_remetente_cnpj: '69.115.969/0001-04', nf_remetente_razao_social: 'X',
    nf_destinatario_cnpj: '11222333000181', nf_destinatario_razao_social: 'Y', nf_data_emissao: '2026-10-24', nf_produto_predominante: 'CAIXA',
    nf_quantidade_volumes: 40, valor_nf: 10000, peso_bruto_kg: 1000, ncms_produtos: ['39231090'],
    cidade_origem: 'SAO PAULO', uf_origem: 'SP', cidade_destino: 'CAMPINAS', uf_destino: 'SP',
  })
  assert(r.ok)
  assertEquals([r.nota.origem, r.nota.emitente_cnpj, r.nota.valor, r.nota.ncm], ['cotacao', '69115969000104', 10000, '39231090'])
  assertEquals(m.notaDaCotacao({ ...({} as never), nf_chave_acesso: null } as never).ok, false)
})
