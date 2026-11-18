# Inventario de campos de peso e de valor em reais (gestor) - 18/11/2026

Gerado por busca no codigo (rotulos, placeholders e inputs numericos). Coluna 'Acao': CampoPeso/CampoMoeda = trocado nesta parte; pendente = ainda input livre (ver relatorio).

```
components/cadastros/RiscoComercial.tsx:220:            <Numero rotulo="Valor total" valor={valorTotal ?? '—'} />
components/financeiro/Conciliacao.tsx:510:                placeholder={(Math.abs(Number(item.valor)) - Number(escolhidoL.saldo_aberto)).toFixed(2).replace('.', ',')}
components/financeiro/Configuracoes.tsx:178:        <Campo label="Saldo inicial (R$)">
components/financeiro/Configuracoes.tsx:179:          <input inputMode="decimal" value={f.saldo_inicial} onChange={(e) => set('saldo_inicial', e.target.value)} className={inputClass} style={inputStyle
components/financeiro/Configuracoes.tsx:181:        <Campo label="Saldo em (data)">
components/financeiro/Configuracoes.tsx:182:          <input type="date" value={f.saldo_inicial_em} onChange={(e) => set('saldo_inicial_em', e.target.value)} className={inputClass} style={inputStyle} 
components/financeiro/Configuracoes.tsx:718:          <Campo label="Fixa ou variável" className="md:col-span-3" dica="Variável = acompanha a quantidade de fretes. Fixa = você paga mesmo num mês se
components/financeiro/Configuracoes.tsx:798:        <Campo label="Saldo mínimo de segurança (R$)" dica="Abaixo disso, o painel avisa no fluxo de caixa.">
components/financeiro/Configuracoes.tsx:799:          <input inputMode="decimal" value={saldoMin} onChange={(e) => setSaldoMin(e.target.value)} className={inputClass} style={inputStyle} />
components/financeiro/Configuracoes.tsx:804:        <Campo label="Saldo do motorista: dias após a entrega" dica="Padrão para operações novas; cada operação pode mudar.">
components/financeiro/Configuracoes.tsx:805:          <input inputMode="numeric" value={prazoSaldo} onChange={(e) => setPrazoSaldo(e.target.value)} className={inputClass} style={inputStyle} />
components/financeiro/InssRetido.tsx:138:        <Campo label="Base: % do frete bruto">
components/financeiro/LancamentoModais.tsx:700:          <input value={descricao} onChange={(e) => setDescricao(e.target.value)} className={inputClass} style={inputStyle} placeholder={tipo === 'pagar'
components/financeiro/LancamentoModais.tsx:741:        <Campo label={pago ? 'Valor (já tem pagamento — não muda)' : 'Valor total (R$)'}>
components/operacao/CiotOperacao.tsx:171:          <label className={labelClass}>Piso mínimo do frete (R$)</label>
components/operacao/OperacaoFluxo.tsx:1435:          <label className={labelClass}>Total do contrato (R$)<Obrig entidade="condicoes_pagamento_operacao" campo="valor_total_contrato" /></label>
components/operacao/OperacaoFluxo.tsx:1452:            <label className={labelClass}>Adiantamento (%)</label>
components/operacao/OperacaoFluxo.tsx:1461:            <label className={labelClass}>Saldo: dias após a entrega</label>
components/operacao/OperacaoFluxo.tsx:1462:            <input inputMode="numeric" value={saldoDias} onChange={(e) => setSaldoDias(e.target.value)} className={inputClass} style={inputStyle} />
components/operacao/OrdemColeta.tsx:179:          <label className={labelClass}>Peso (kg)</label>
components/precotacao/EditarPreCotacao.tsx:243:              <Campo label="Valor da mercadoria (R$)">
pages/Cadastros.tsx:2566:                              <CampoFiscal entidade="veiculos" campo="capacidade_carga" rotulo="Capacidade de carga (kg)">
pages/Cadastros.tsx:2568:                                  placeholder="Capacidade de carga (kg)"
pages/Cadastros.tsx:2576:                              <CampoFiscal entidade="veiculos" campo="tara_kg" rotulo="Tara (kg)">
pages/Cadastros.tsx:2578:                                  placeholder="Tara (kg)"
pages/Cotacao.tsx:3068:              <label className={labelClass}>Valor da mercadoria (R$)<Obrig entidade="cotacoes" campo="valor_nf" /></label>
pages/Cotacao.tsx:3348:            <label className={labelClass}>Quem paga o frete (tomador do CT-e)<Obrig entidade="cotacoes" campo="tomador_papel" /></label>
pages/Cotacao.tsx:3566:                        <label className={labelClass}>Frete motorista (R$)</label>
pages/Cotacao.tsx:3648:                <label className={labelClass}>Peso bruto (kg)<Obrig entidade="cotacoes" campo="peso_bruto_kg" /></label>
pages/Cotacao.tsx:4017:                <label className={labelClass}>Frete do motorista (R$) *</label>
pages/Cotacao.tsx:4089:                <label className={labelClass}>Valor final ao cliente (R$)<Obrig entidade="cotacoes" campo="valor_total" /></label>
pages/Operacoes.tsx:1007:                  <ResumoItem rotulo="Frete" valor={op.valorCliente != null ? formatMoney(op.valorCliente) : '—'} />
pages/Operacoes.tsx:1251:                                placeholder="Tara (kg)"
```
