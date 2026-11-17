// node --test gestor/test/prospeccaoCaixa.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  acaoDoAtalho, anexosValidos, assuntoEncaminhar, assuntoResposta, citacao, destinatariosResposta, exemplos, filtrarConversas, hrefSeguro, interpretarDiagnostico, referenciasDaResposta,
  sanitizarHtml, textoParaHtml, type Conversa, type LinhaDiagnostico,
} from '../src/lib/prospeccaoCaixa.ts'

test('HTML seguro: script, estilo, eventos, iframe e imagem remota somem', () => {
  const sujo = '<p onclick="x()" style="color:red">Oi <b>mundo</b></p><script>alert(1)</script><style>@import url(//x)</style><img src="https://rastreio.com/p.gif" onerror="alert(1)"><iframe src="https://x"></iframe><svg onload="alert(1)"></svg>'
  const s = sanitizarHtml(sujo)
  for (const ruim of ['<script', 'alert(', 'onclick', 'onerror', 'onload', 'style', '<img', '<iframe', '<svg', 'rastreio.com']) assert.ok(!s.includes(ruim), `sobrou ${ruim}: ${s}`)
  assert.ok(s.includes('<b>mundo</b>') && s.includes('<p>'))
  assert.match(s, /1 imagem\(ns\) remota\(s\) bloqueada\(s\)/)
})

test('HTML seguro: links so http, https e mailto; javascript disfarcado e bloqueado; links abrem em aba nova com marca de aviso', () => {
  assert.equal(hrefSeguro('https://rbrcargo.com.br/x'), 'https://rbrcargo.com.br/x')
  assert.equal(hrefSeguro('mailto:a@b.com'), 'mailto:a@b.com')
  for (const ruim of ['javascript:alert(1)', ' JaVaScRiPt:alert(1)', '&#106;avascript:alert(1)', 'jav&#x09;ascript:alert(1)', 'java\nscript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:x', '//evil.com', '/relativo'])
    assert.equal(hrefSeguro(ruim), null, ruim)
  const ok = sanitizarHtml('<a href="https://exemplo.com/a?b=1&c=2" onclick="x">clique</a>')
  assert.match(ok, /<a href="https:\/\/exemplo\.com\/a\?b=1&amp;c=2" target="_blank" rel="noopener noreferrer nofollow" data-externo="1">clique<\/a>/)
  for (const link of ['<a href="javascript:alert(1)">x</a>', '<a href="&#106;avascript:alert(1)">x</a>', "<a href='JAVASCRIPT:alert(1)'>x</a>"]) {
    const s = sanitizarHtml(link)
    assert.ok(!/javascript/i.test(s), s)
    assert.ok(!s.includes('href'), s)
  }
})

test('HTML seguro: tag quebrada e vetores classicos viram texto inofensivo', () => {
  for (const v of ['<scr<script>ipt>alert(1)</scr</script>ipt>', '<<script>script>alert(1)<</script>/script>', '<img src=x onerror=alert(1)//', '<a href="x" onmouseover=alert(1)>', '<div style="background:url(javascript:alert(1))">x</div>', '<input autofocus onfocus=alert(1)>', '<body onload=alert(1)>']) {
    const s = sanitizarHtml(v)
    assert.ok(!/<(script|img|input|body)\b/i.test(s), `${v} => ${s}`)
    assert.ok(!/<[^>]*\son\w+\s*=/i.test(s), `evento dentro de tag real: ${v} => ${s}`)
    assert.ok(!/<[^>]*javascript:/i.test(s), `${v} => ${s}`)
  }
  assert.equal(textoParaHtml('a < b\n<script>'), 'a &lt; b<br>&lt;script&gt;')
})

const conv = (p: Partial<Conversa>): Conversa => ({
  id: 'c', empresa_id: null, caixa_id: 'x', assunto: 'Frete', status: 'nova', ultima_mensagem_em: '2026-11-16T10:00:00Z', nao_lidas: 0, assumida_por: null, classificacao_ia: null,
  resumo_ia: null, dados_extraidos: {}, ia_pausada: false, ...p,
})
test('filtros da lista: precisa de voce, rascunho pronto, cotacao, assumidas, devolucoes, todas; busca sem acento; mais recente primeiro', () => {
  const lista = [
    conv({ id: 'a', status: 'precisa_de_voce', classificacao_ia: 'cotacao', ultima_mensagem_em: '2026-11-16T10:00:00Z', assunto: 'Re: Frete de bebidas' }),
    conv({ id: 'b', status: 'rascunho_pronto', ultima_mensagem_em: '2026-11-16T12:00:00Z' }),
    conv({ id: 'c', status: 'assumida', classificacao_ia: 'preco_prazo_negociacao', ultima_mensagem_em: '2026-11-15T10:00:00Z' }),
    conv({ id: 'd', status: 'encerrada', classificacao_ia: 'devolucao', ultima_mensagem_em: '2026-11-14T10:00:00Z' }),
    conv({ id: 'e', status: 'nova', ultima_mensagem_em: '2026-11-13T10:00:00Z', assunto: 'Cotação plásticos' }),
  ]
  const ids = (f: Parameters<typeof filtrarConversas>[1], q = '') => filtrarConversas(lista, f, q).map((c) => c.id)
  assert.deepEqual(ids('precisa_de_voce'), ['a', 'e'])
  assert.deepEqual(ids('rascunho_pronto'), ['b'])
  assert.deepEqual(ids('cotacao'), ['a', 'c'])
  assert.deepEqual(ids('assumidas'), ['c'])
  assert.deepEqual(ids('devolucoes'), ['d'])
  assert.deepEqual(ids('todas'), ['b', 'a', 'c', 'd', 'e'])
  assert.deepEqual(ids('todas', 'COTACAO'), ['a', 'e'], 'busca sem acento e sem maiusculas casa assunto (Cotação) e classificacao')
  assert.deepEqual(ids('todas', 'bebidas'), ['a'])
})

test('resposta: assunto, destinatarios (responder x responder a todos, sem as nossas caixas), referencias e citacao', () => {
  assert.equal(assuntoResposta('Frete X'), 'Re: Frete X')
  assert.equal(assuntoResposta('RE: Frete X'), 'RE: Frete X')
  assert.equal(assuntoEncaminhar('Frete X'), 'Enc: Frete X')
  const e = { de: 'Ana Souza <ana@cliente.com>', para: 'Pedro <pedro@rbrcargo.com.br>, joao@cliente.com', cc: 'COMERCIAL@rbrcargo.com.br; maria@cliente.com' }
  const nossos = ['pedro@rbrcargo.com.br', 'comercial@rbrcargo.com.br']
  assert.deepEqual(destinatariosResposta(e, false, nossos), { para: ['ana@cliente.com'], cc: [] })
  assert.deepEqual(destinatariosResposta(e, true, nossos), { para: ['ana@cliente.com'], cc: ['joao@cliente.com', 'maria@cliente.com'] })
  assert.equal(referenciasDaResposta({ message_id: '<c@x>', referencias: '<a@x> <b@x>' }), '<a@x> <b@x> <c@x>')
  assert.equal(referenciasDaResposta({ message_id: '<c@x>', referencias: '<c@x>' }), '<c@x>')
  assert.equal(referenciasDaResposta({ message_id: null, referencias: null }), null)
  assert.match(citacao({ de: 'Ana', recebido_em: '2026-11-16T10:00:00Z', corpo_texto: 'linha 1\nlinha 2' }), /Ana escreveu:\n> linha 1\n> linha 2/)
})

test('anexos: limite de 25 MB somados', () => {
  assert.equal(anexosValidos([{ name: 'a.pdf', size: 10 * 1048576 }, { name: 'b.pdf', size: 15 * 1048576 }]), null)
  assert.match(anexosValidos([{ name: 'a.pdf', size: 20 * 1048576 }, { name: 'b.pdf', size: 6 * 1048576 }]) ?? '', /25 MB/)
})

test('atalhos: j/k/r/e/a so fora de campos de texto e sem Ctrl', () => {
  assert.equal(acaoDoAtalho('j'), 'proxima'); assert.equal(acaoDoAtalho('K'), 'anterior'); assert.equal(acaoDoAtalho('r'), 'responder')
  assert.equal(acaoDoAtalho('e'), 'encerrar'); assert.equal(acaoDoAtalho('a'), 'assumir'); assert.equal(acaoDoAtalho('x'), null)
  assert.equal(acaoDoAtalho('r', true), null, 'Ctrl+R nao e o atalho'); assert.equal(acaoDoAtalho('r', false, true), null, 'digitando em campo')
})

test('diagnostico em linguagem simples: verde, amarelo e vermelho', () => {
  const bom: LinhaDiagnostico = { conexao_nuvem_ok: true, smtp_ok: true, imap_ok: true, idle_suportado: true, append_ok: true, flags_ok: true, mover_ok: true,
    cabecalhos_preservados: { message_id: true, in_reply_to: true, references: true, list_unsubscribe: true, list_unsubscribe_post: true }, servidor_guarda_enviados: false,
    pastas_descobertas: { entrada: 'INBOX', enviados: 'Sent', spam: 'Junk', lixo: 'Trash' } }
  assert.equal(interpretarDiagnostico(bom).resumo, 'verde')
  assert.equal(interpretarDiagnostico({ ...bom, idle_suportado: false }).resumo, 'amarelo')
  assert.equal(interpretarDiagnostico({ ...bom, cabecalhos_preservados: { ...bom.cabecalhos_preservados!, references: false } }).resumo, 'vermelho')
  const nuvem = interpretarDiagnostico({ ...bom, conexao_nuvem_ok: false })
  assert.equal(nuvem.resumo, 'vermelho'); assert.match(nuvem.achados[0].explicacao, /nuvem/)
})

test('exemplos: marcados como Exemplo e com ids que nunca batem com ids reais (uuid)', () => {
  const { conversas, emails } = exemplos(new Date('2026-11-16T12:00:00Z'))
  assert.ok(conversas.length >= 3 && conversas.every((c) => c.exemplo === true && c.id.startsWith('ex-')))
  assert.ok(emails.every((e) => e.exemplo === true && conversas.some((c) => c.id === e.conversa_id)))
  assert.ok(emails.some((e) => e.rascunho_ia && e.motivo_ia), 'mostra um rascunho da IA com o motivo')
})
