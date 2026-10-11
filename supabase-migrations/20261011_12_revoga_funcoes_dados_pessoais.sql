-- 20261011_12 (aplicada no banco real pelo gestor, apontada pelo verificador de segurança do Supabase):
-- campos_do_cadastro, renderizar_termo e texto_para_hash são SECURITY DEFINER e recebiam EXECUTE do authenticated pelo
-- privilégio padrão do Supabase; qualquer usuário logado conseguia ler nome e CPF/CNPJ de outra pessoa pelo id.
-- Só o service_role executa direto; as funções que as usam (meu_termo_pendente, aceitar_termo, contrato_agenciador_gerar,
-- dados_pdf_aceite) são SECURITY DEFINER e continuam chamando como dono.

revoke execute on function public.campos_do_cadastro(text, uuid) from authenticated, anon, public;
revoke execute on function public.renderizar_termo(uuid, uuid) from authenticated, anon, public;
revoke execute on function public.texto_para_hash(uuid, uuid) from authenticated, anon, public;
grant execute on function public.campos_do_cadastro(text, uuid) to service_role;
grant execute on function public.renderizar_termo(uuid, uuid) to service_role;
grant execute on function public.texto_para_hash(uuid, uuid) to service_role;
