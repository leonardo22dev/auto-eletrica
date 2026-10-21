-- Mizuho OS - excluir usuario (so administrador).
-- Cole no SQL Editor do Supabase e rode UMA vez, ANTES de publicar o app novo:
-- o botao Excluir usuario chama a funcao criada aqui.

begin;

-- ====== 0013_excluir_usuario.sql ======
-- Excluir usuario: so o administrador, pela funcao. Apaga a conta de login e o
-- perfil de vez. Bloquear continua existindo para quem vai voltar; excluir e
-- para quem nao volta.
--
-- O que a pessoa produziu NAO some: as OS dela ficam (criado_por vira nulo, pela
-- chave estrangeira on delete set null) e a atividade mantem o nome congelado.
-- Documento emitido e da oficina, nao de quem digitou.

-- ---------------------------------------------------------------------------
-- 1. O registro passa a aceitar a acao nova
-- ---------------------------------------------------------------------------
alter table usuarios_historico drop constraint if exists usuarios_historico_acao_check;
alter table usuarios_historico add constraint usuarios_historico_acao_check
  check (acao in ('criado', 'nome_alterado', 'papel_alterado',
                  'bloqueado', 'reativado', 'senha_redefinida', 'excluido'));

-- ---------------------------------------------------------------------------
-- 2. A funcao
--
-- Mesmas travas de alterar_usuario: ninguem mexe em si mesmo, e o sistema nunca
-- fica sem administrador ativo. O lock vem de iniciar_gestao_de_usuarios, que
-- confere o administrador antes e depois de pegar a trava.
-- ---------------------------------------------------------------------------
create or replace function excluir_usuario(p_user_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ator perfis%rowtype;
  v_alvo perfis%rowtype;
begin
  v_ator := iniciar_gestao_de_usuarios();

  select * into v_alvo from perfis where user_id = p_user_id for update;
  if not found then
    raise exception 'usuario_nao_encontrado';
  end if;

  -- Quem se exclui nao volta sozinho, e ainda derrubaria a propria sessao.
  if p_user_id = v_ator.user_id then
    raise exception 'proprio_usuario';
  end if;

  if v_alvo.papel = 'admin' and v_alvo.ativo
     and not exists (select 1 from perfis
                      where papel = 'admin' and ativo and user_id <> p_user_id) then
    raise exception 'ultimo_admin';
  end if;

  -- Registra ANTES de apagar: depois do delete o perfil ja nao existe para ler.
  -- usuarios_historico nao tem chave estrangeira, entao o registro sobrevive a
  -- exclusao tanto do alvo quanto de quem agiu.
  insert into usuarios_historico (ator_id, ator_nome, alvo_id, alvo_usuario, acao, detalhe)
  values (v_ator.user_id, v_ator.nome, p_user_id, v_alvo.usuario, 'excluido',
          jsonb_build_object('nome', v_alvo.nome, 'papel', v_alvo.papel));

  -- O perfil, a identidade e as sessoes saem em cascata; as OS ficam.
  delete from auth.users where id = p_user_id;
end $$;

revoke execute on function excluir_usuario(uuid) from public, anon;
grant  execute on function excluir_usuario(uuid) to authenticated;


commit;
