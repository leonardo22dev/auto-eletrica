-- Gestao de usuarios, so para administrador.
--
-- Cria e altera usuarios direto em auth.users, sem service_role. O caminho e
-- sensivel a mudancas internas do Supabase Auth: o que o GoTrue exige de uma
-- linha de auth.users esta no comentario de criar_usuario, e a verificacao
-- que vale e entrar com o usuario criado, contra o projeto real.

-- ---------------------------------------------------------------------------
-- 1. Registro das acoes sobre usuarios (so de inclusao)
-- ---------------------------------------------------------------------------
create table usuarios_historico (
  id            bigint generated always as identity primary key,
  -- Sem chave estrangeira: o historico sobrevive a quem for apagado do painel.
  ator_id       uuid,
  ator_nome     text not null,
  alvo_id       uuid not null,
  alvo_usuario  text not null,
  acao          text not null check (acao in
                  ('criado', 'nome_alterado', 'papel_alterado',
                   'bloqueado', 'reativado', 'senha_redefinida')),
  detalhe       jsonb not null default '{}'::jsonb,
  em            timestamptz not null default now()
);
create index usuarios_historico_em_idx on usuarios_historico (em desc, id desc);

alter table usuarios_historico enable row level security;
create policy usuarios_hist_le on usuarios_historico for select to authenticated
  using ((select usuario_admin()));
revoke insert, update, delete, truncate on usuarios_historico from authenticated, anon;

-- ---------------------------------------------------------------------------
-- 2. Porta de entrada comum
--
-- A ordem importa: o lock vem ANTES da conferencia de administrador. Se fosse
-- depois, dois administradores que se rebaixam ao mesmo tempo conferiam "sou
-- administrador" antes de qualquer um gravar, e os dois passavam.
-- Interna: so as funcoes abaixo a chamam (como dono).
-- ---------------------------------------------------------------------------
create or replace function iniciar_gestao_de_usuarios() returns perfis
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ator perfis%rowtype;
begin
  if not usuario_admin() then
    raise exception 'acesso_negado';
  end if;
  perform pg_advisory_xact_lock(hashtext('perfis_gestao'));
  select * into v_ator from perfis
   where user_id = auth.uid() and ativo and papel = 'admin';
  if not found then
    raise exception 'acesso_negado';
  end if;
  return v_ator;
end $$;

revoke execute on function iniciar_gestao_de_usuarios() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Listar
-- ---------------------------------------------------------------------------
create or replace function listar_usuarios() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not usuario_admin() then
    raise exception 'acesso_negado';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'user_id', p.user_id, 'usuario', p.usuario, 'nome', p.nome,
             'papel', p.papel, 'ativo', p.ativo, 'criado_em', p.criado_em)
           order by p.ativo desc, lower(p.nome), p.usuario)
      from perfis p), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- 4. Criar
--
-- O que o GoTrue exige de uma linha de auth.users para o login funcionar:
--  * instance_id nulo-zero, aud e role 'authenticated', e-mail confirmado;
--  * confirmation_token, recovery_token, email_change_token_new e email_change
--    como '' (NULL quebra o login com "Database error querying schema");
--  * uma linha em auth.identities com provider 'email';
--  * senha em bcrypt, via crypt() do pgcrypto (schema extensions no Supabase).
-- ---------------------------------------------------------------------------
create or replace function criar_usuario(
  p_usuario text, p_nome text, p_senha text, p_papel text
) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_ator    perfis%rowtype;
  v_usuario text := lower(trim(coalesce(p_usuario, '')));
  v_nome    text := trim(coalesce(p_nome, ''));
  v_email   text;
  v_id      uuid := gen_random_uuid();
begin
  v_ator := iniciar_gestao_de_usuarios();

  if v_usuario !~ '^[a-z0-9._-]{3,30}$' then
    raise exception 'usuario_invalido';
  end if;
  if v_nome = '' or length(v_nome) > 60 then
    raise exception 'nome_invalido';
  end if;
  if p_senha is null or length(p_senha) < 8 or octet_length(p_senha) > 72 then
    raise exception 'senha_invalida';
  end if;
  if p_papel is null or p_papel not in ('admin', 'atendente') then
    raise exception 'papel_invalido';
  end if;

  v_email := v_usuario || '@mizuho.invalid';
  if exists (select 1 from perfis where usuario = v_usuario)
     or exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'usuario_em_uso';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    v_email, crypt(p_senha, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
    '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', v_email,
                       'email_verified', true, 'phone_verified', false),
    'email', now(), now(), now()
  );

  insert into perfis (user_id, usuario, nome, papel, criado_por)
  values (v_id, v_usuario, v_nome, p_papel, v_ator.user_id);

  insert into usuarios_historico (ator_id, ator_nome, alvo_id, alvo_usuario, acao, detalhe)
  values (v_ator.user_id, v_ator.nome, v_id, v_usuario, 'criado',
          jsonb_build_object('papel', p_papel));

  return jsonb_build_object('user_id', v_id, 'usuario', v_usuario);
end $$;

-- ---------------------------------------------------------------------------
-- 5. Alterar (nome, nivel, bloqueio)
-- ---------------------------------------------------------------------------
create or replace function alterar_usuario(
  p_user_id uuid, p_nome text, p_papel text, p_ativo boolean
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ator perfis%rowtype;
  v_alvo perfis%rowtype;
  v_nome text := trim(coalesce(p_nome, ''));
begin
  v_ator := iniciar_gestao_de_usuarios();

  select * into v_alvo from perfis where user_id = p_user_id for update;
  if not found then
    raise exception 'usuario_nao_encontrado';
  end if;
  if v_nome = '' or length(v_nome) > 60 then
    raise exception 'nome_invalido';
  end if;
  if p_papel is null or p_papel not in ('admin', 'atendente') then
    raise exception 'papel_invalido';
  end if;
  if p_ativo is null then
    raise exception 'dados_invalidos';
  end if;

  -- Nem para cima nem para baixo: quem se bloqueia ou se rebaixa nao volta
  -- sozinho. O nome proprio pode mudar.
  if p_user_id = v_ator.user_id
     and (p_papel <> v_alvo.papel or p_ativo <> v_alvo.ativo) then
    raise exception 'proprio_usuario';
  end if;

  -- Guarda defensiva: com a regra acima o ator continua administrador ativo,
  -- entao so uma regressao nela deixaria o sistema sem administrador.
  if v_alvo.papel = 'admin' and v_alvo.ativo and (p_papel <> 'admin' or not p_ativo)
     and not exists (select 1 from perfis
                      where papel = 'admin' and ativo and user_id <> p_user_id) then
    raise exception 'ultimo_admin';
  end if;

  update perfis set nome = v_nome, papel = p_papel, ativo = p_ativo
   where user_id = p_user_id;

  if p_ativo is distinct from v_alvo.ativo then
    -- 100 anos: o GoTrue le banned_until como horario e nao entende 'infinity'.
    update auth.users
       set banned_until = case when p_ativo then null
                               else now() + interval '100 years' end
     where id = p_user_id;
    if not p_ativo then
      delete from auth.sessions where user_id = p_user_id;
    end if;
    insert into usuarios_historico (ator_id, ator_nome, alvo_id, alvo_usuario, acao)
    values (v_ator.user_id, v_ator.nome, p_user_id, v_alvo.usuario,
            case when p_ativo then 'reativado' else 'bloqueado' end);
  end if;

  if v_nome is distinct from v_alvo.nome then
    insert into usuarios_historico (ator_id, ator_nome, alvo_id, alvo_usuario, acao, detalhe)
    values (v_ator.user_id, v_ator.nome, p_user_id, v_alvo.usuario, 'nome_alterado',
            jsonb_build_object('de', v_alvo.nome, 'para', v_nome));
  end if;

  if p_papel is distinct from v_alvo.papel then
    insert into usuarios_historico (ator_id, ator_nome, alvo_id, alvo_usuario, acao, detalhe)
    values (v_ator.user_id, v_ator.nome, p_user_id, v_alvo.usuario, 'papel_alterado',
            jsonb_build_object('de', v_alvo.papel, 'para', p_papel));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Redefinir senha
-- ---------------------------------------------------------------------------
create or replace function redefinir_senha(p_user_id uuid, p_senha text) returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_ator perfis%rowtype;
  v_alvo perfis%rowtype;
begin
  v_ator := iniciar_gestao_de_usuarios();

  select * into v_alvo from perfis where user_id = p_user_id;
  if not found then
    raise exception 'usuario_nao_encontrado';
  end if;
  if p_senha is null or length(p_senha) < 8 or octet_length(p_senha) > 72 then
    raise exception 'senha_invalida';
  end if;

  update auth.users
     set encrypted_password = crypt(p_senha, gen_salt('bf')), updated_at = now()
   where id = p_user_id;
  delete from auth.sessions where user_id = p_user_id;

  insert into usuarios_historico (ator_id, ator_nome, alvo_id, alvo_usuario, acao)
  values (v_ator.user_id, v_ator.nome, p_user_id, v_alvo.usuario, 'senha_redefinida');
end $$;

-- ---------------------------------------------------------------------------
-- 7. Quem executa
-- ---------------------------------------------------------------------------
revoke execute on function listar_usuarios()                          from public, anon;
revoke execute on function criar_usuario(text, text, text, text)      from public, anon;
revoke execute on function alterar_usuario(uuid, text, text, boolean) from public, anon;
revoke execute on function redefinir_senha(uuid, text)                from public, anon;

grant execute on function listar_usuarios()                          to authenticated;
grant execute on function criar_usuario(text, text, text, text)      to authenticated;
grant execute on function alterar_usuario(uuid, text, text, boolean) to authenticated;
grant execute on function redefinir_senha(uuid, text)                to authenticated;
