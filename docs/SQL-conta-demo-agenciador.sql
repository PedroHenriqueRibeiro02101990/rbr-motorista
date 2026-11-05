-- NAO EXECUTADO. Aprova uma conta de agenciador de TESTE para demonstrar com login real.
-- Troque o e-mail abaixo pelo da conta de teste.
-- Regras lidas: trg_fn_agenciador_exige_aprovado exige pessoas.aprovacao_status = 'aprovado';
-- agenciador_pode_operar exige status_contrato_agenciador <> 'suspenso' e, se houver contrato em vigor, = 'validado'.
update public.pessoas
   set aprovacao_status = 'aprovado'
 where papel = 'agenciador' and email = 'TROCAR@EMAIL.DE.TESTE';
-- Se houver contrato em vigor (contrato_agenciador_em_vigor()), marque como validado:
-- update public.pessoas set status_contrato_agenciador = 'validado' where papel='agenciador' and email='TROCAR@EMAIL.DE.TESTE';

-- ROLLBACK:
-- update public.pessoas set aprovacao_status = 'em_analise' where papel='agenciador' and email='TROCAR@EMAIL.DE.TESTE';
-- update public.pessoas set status_contrato_agenciador = NULL where papel='agenciador' and email='TROCAR@EMAIL.DE.TESTE';
