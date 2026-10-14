-- Mizuho OS - usuarios, niveis de acesso e registro de atividade.
-- Cole no SQL Editor do Supabase e rode UMA vez. Depois disso, publique o app.
-- Tudo ou nada: se algo falhar, nada e aplicado.

begin;

-- ====== 0008_perfis_e_acesso.sql ======
-- Perfis, niveis de acesso e acesso so de usuario ativo.
--
-- Ate aqui qualquer usuario logado fazia tudo. Agora o acesso depende de um
-- perfil ativo, e Ajustes e numeracao dependem de ser administrador.

-- ---------------------------------------------------------------------------
-- 1. Perfis
-- ---------------------------------------------------------------------------
create table perfis (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  usuario    text not null unique check (usuario ~ '^[a-z0-9._-]{3,30}$'),
  nome       text not null check (length(trim(nome)) > 0),
  papel      text not null check (papel in ('admin', 'atendente')),
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now(),
  criado_por uuid references auth.users(id) on delete set null
);
alter table perfis enable row level security;

-- Quem ja usava o sistema vira administrador: e o dono e quem ele ja liberou.
-- O usuario sai da parte do e-mail antes do @; repetidos ganham um sufixo.
with base as (
  select u.id, u.created_at,
         left(
           case
             when length(regexp_replace(lower(split_part(coalesce(u.email, ''), '@', 1)),
                                        '[^a-z0-9._-]', '', 'g')) >= 3
               then regexp_replace(lower(split_part(coalesce(u.email, ''), '@', 1)),
                                   '[^a-z0-9._-]', '', 'g')
             else 'usuario'
           end, 24) as nome_base
    from auth.users u
), numerado as (
  select id, nome_base,
         row_number() over (partition by nome_base order by created_at, id) as n
    from base
)
insert into perfis (user_id, usuario, nome, papel)
select id,
       case when n = 1 then nome_base else nome_base || '.' || substr(id::text, 1, 4) end,
       nome_base,
       'admin'
  from numerado;

-- Trava: se existem usuarios e nenhum virou administrador, algo deu errado, e
-- aplicar as policies abaixo trancaria o dono para fora.
do $$
begin
  if exists (select 1 from auth.users)
     and not exists (select 1 from perfis where papel = 'admin' and ativo) then
    raise exception 'migration abortada: existem usuarios e nenhum virou administrador';
  end if;
end $$;

-- Projeto novo: o primeiro usuario criado (pelo painel) vira administrador.
-- Sem isto, quem instala o sistema do zero nao entraria nunca. Depois do
-- primeiro, usuario criado fora do sistema fica sem perfil e sem acesso.
create or replace function perfil_do_primeiro_usuario() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_base text;
begin
  perform pg_advisory_xact_lock(hashtext('perfis_primeiro'));
  if not exists (select 1 from perfis) then
    v_base := regexp_replace(lower(split_part(coalesce(new.email, ''), '@', 1)),
                             '[^a-z0-9._-]', '', 'g');
    if length(v_base) < 3 then v_base := 'admin'; end if;
    v_base := left(v_base, 30);
    insert into perfis (user_id, usuario, nome, papel)
    values (new.id, v_base, v_base, 'admin');
  end if;
  return new;
end $$;

create trigger auth_users_primeiro_perfil
after insert on auth.users
for each row execute function perfil_do_primeiro_usuario();

-- ---------------------------------------------------------------------------
-- 2. Quem e quem
--
-- security definer para ler `perfis` sem passar pelo proprio RLS dele (que
-- chama estas funcoes). Sem perfil, ou inativo, e sem acesso.
-- ---------------------------------------------------------------------------
create or replace function usuario_ativo() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from perfis where user_id = auth.uid() and ativo)
$$;

create or replace function usuario_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from perfis
                  where user_id = auth.uid() and ativo and papel = 'admin')
$$;

revoke execute on function usuario_ativo(), usuario_admin() from public, anon;
grant  execute on function usuario_ativo(), usuario_admin() to authenticated;
revoke execute on function perfil_do_primeiro_usuario() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. RLS: so usuario ativo; Ajustes so administrador
--
-- `(select ...)` faz o Postgres avaliar a funcao uma vez por consulta, nao
-- uma por linha.
-- ---------------------------------------------------------------------------
drop policy conf_le  on configuracoes;
drop policy conf_upd on configuracoes;
create policy conf_le  on configuracoes for select to authenticated
  using ((select usuario_ativo()));
create policy conf_upd on configuracoes for update to authenticated
  using ((select usuario_admin())) with check ((select usuario_admin()));

drop policy os_le  on ordens_servico;
drop policy os_ins on ordens_servico;
drop policy os_upd on ordens_servico;
create policy os_le  on ordens_servico for select to authenticated
  using ((select usuario_ativo()));
create policy os_ins on ordens_servico for insert to authenticated
  with check ((select usuario_ativo()));
create policy os_upd on ordens_servico for update to authenticated
  using ((select usuario_ativo())) with check ((select usuario_ativo()));

drop policy item_le  on os_itens;
drop policy item_ins on os_itens;
drop policy item_upd on os_itens;
drop policy item_del on os_itens;
create policy item_le  on os_itens for select to authenticated
  using ((select usuario_ativo()));
create policy item_ins on os_itens for insert to authenticated
  with check ((select usuario_ativo()));
create policy item_upd on os_itens for update to authenticated
  using ((select usuario_ativo())) with check ((select usuario_ativo()));
create policy item_del on os_itens for delete to authenticated
  using ((select usuario_ativo()));

drop policy pdf_grava   on storage.objects;
drop policy pdf_regrava on storage.objects;
create policy pdf_grava on storage.objects for insert to authenticated
  with check (bucket_id = 'os-pdfs' and (select usuario_ativo()));
create policy pdf_regrava on storage.objects for update to authenticated
  using (bucket_id = 'os-pdfs' and (select usuario_ativo()))
  with check (bucket_id = 'os-pdfs' and (select usuario_ativo()));

-- Perfis: cada um le o proprio (o bloqueado precisa saber que foi bloqueado);
-- o administrador le todos. Nao ha policy de escrita: so as funcoes escrevem.
create policy perfis_le on perfis for select to authenticated
  using (user_id = (select auth.uid()) or (select usuario_admin()));
revoke insert, update, delete, truncate on perfis from authenticated, anon;

-- ---------------------------------------------------------------------------
-- 4. Funcoes que o RLS nao cobre
--
-- gerar_link_assinatura e security definer: ignora o RLS, entao a checagem
-- tem de ser dela. (cancelar_os e substituir_itens sao security invoker e
-- ja respondem pelo RLS; versao_da_os nem e chamavel por usuario.)
-- ---------------------------------------------------------------------------
create or replace function gerar_link_assinatura(
  p_os_id uuid, p_renovar boolean default false
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v        ordens_servico%rowtype;
  v_codigo text;
  v_expira timestamptz;
begin
  if not usuario_ativo() then
    raise exception 'acesso_negado';
  end if;

  select * into v from ordens_servico where id = p_os_id for update;
  if not found then
    raise exception 'OS % nao encontrada', p_os_id;
  end if;
  if v.aceite_em is not null then
    raise exception 'ja_assinada';
  end if;
  if v.status not in ('orcamento', 'aprovada') then
    raise exception 'status_invalido: OS % nao aceita assinatura', v.status;
  end if;

  if not p_renovar and v.assinatura_codigo is not null
     and v.assinatura_expira_em > now() then
    return jsonb_build_object('codigo', v.assinatura_codigo,
                              'expira_em', v.assinatura_expira_em);
  end if;

  -- 244 bits, com funcao nativa do Postgres e sem extensao.
  v_codigo := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_expira := now() + interval '30 days';

  update ordens_servico
     set assinatura_codigo = v_codigo, assinatura_expira_em = v_expira
   where id = p_os_id;

  return jsonb_build_object('codigo', v_codigo, 'expira_em', v_expira);
end $$;

create or replace function definir_proximo_numero(p_numero bigint) returns void
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if not usuario_admin() then
    raise exception 'acesso_negado';
  end if;
  if p_numero < 1 then
    raise exception 'O proximo numero precisa ser maior que zero';
  end if;
  if exists (select 1 from ordens_servico
              where numero is not null and numero >= p_numero) then
    raise exception 'Ja existe OS com numero maior ou igual a %', p_numero;
  end if;
  perform setval('os_numero_seq', p_numero, false);
end $$;

-- ---------------------------------------------------------------------------
-- 5. Apagar um usuario no painel nao pode esbarrar nas OS dele
-- ---------------------------------------------------------------------------
alter table ordens_servico drop constraint ordens_servico_criado_por_fkey;
alter table ordens_servico add constraint ordens_servico_criado_por_fkey
  foreign key (criado_por) references auth.users(id) on delete set null;


-- ====== 0009_gestao_de_usuarios.sql ======
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


-- ====== 0010_historico_de_atividade.sql ======
-- Historico de atividade por OS: quem criou, quem mudou o que e quando.
--
-- Gravado por gatilho, no banco, para nao depender da tela: uma chamada direta
-- a API deixa o mesmo rastro. Tabela so de inclusao.

create table os_historico (
  id           bigint generated always as identity primary key,
  -- cascade: a limpeza manual de OS de teste (delete no SQL Editor) precisa
  -- continuar possivel; quem usa o sistema nao apaga OS.
  os_id        uuid not null references ordens_servico(id) on delete cascade,
  usuario_id   uuid,
  -- Copia congelada: renomear ou apagar a pessoa nao reescreve o passado.
  usuario_nome text not null,
  acao         text not null check (acao in
                 ('criada', 'dados_alterados', 'itens_alterados',
                  'status_alterado', 'link_gerado', 'aceita', 'cancelada')),
  detalhe      jsonb not null default '{}'::jsonb,
  -- Junta as linhas de item de uma mesma operacao em um evento so.
  transacao    bigint not null default txid_current(),
  em           timestamptz not null default now()
);
create index os_historico_os_idx on os_historico (os_id, em, id);
create unique index os_historico_itens_unico
  on os_historico (os_id, transacao) where acao = 'itens_alterados';

alter table os_historico enable row level security;
create policy os_historico_le on os_historico for select to authenticated
  using ((select usuario_ativo()));
revoke insert, update, delete, truncate on os_historico from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Registrar (interna: so os gatilhos chamam, como dono)
-- ---------------------------------------------------------------------------
create or replace function registrar_historico(
  p_os uuid, p_acao text, p_detalhe jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid  uuid;
  v_nome text;
begin
  if p_acao = 'aceita' then
    -- Quem assina e o cliente, mesmo que haja um funcionario logado no mesmo
    -- navegador.
    v_nome := 'Cliente (assinatura)';
  else
    v_uid := auth.uid();
    select nome into v_nome from perfis where user_id = v_uid;
    if v_nome is null then
      v_uid := null;
      v_nome := 'Sistema';
    end if;
  end if;

  insert into os_historico (os_id, usuario_id, usuario_nome, acao, detalhe)
  values (p_os, v_uid, v_nome, p_acao, coalesce(p_detalhe, '{}'::jsonb))
  on conflict (os_id, transacao) where acao = 'itens_alterados' do nothing;
end $$;

revoke execute on function registrar_historico(uuid, text, jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Gatilho da OS
-- ---------------------------------------------------------------------------
create or replace function historico_da_os() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_dados jsonb := '{}'::jsonb;
begin
  if tg_op = 'INSERT' then
    perform registrar_historico(new.id, 'criada',
      jsonb_build_object('status', new.status, 'numero', new.numero));
    return null;
  end if;

  -- O total muda por causa dos itens: completa o evento de itens da mesma
  -- transacao (aberto pelo gatilho de os_itens) com o total final.
  if new.total_centavos is distinct from old.total_centavos then
    update os_historico
       set detalhe = detalhe || jsonb_build_object('total_para', new.total_centavos)
     where os_id = new.id and acao = 'itens_alterados' and transacao = txid_current();
  end if;

  if old.aceite_em is null and new.aceite_em is not null then
    perform registrar_historico(new.id, 'aceita', jsonb_build_object(
      'total_centavos', new.aceite_total_centavos,
      'status_de', old.status, 'status_para', new.status));
  elsif new.status is distinct from old.status then
    if new.status = 'cancelada' then
      perform registrar_historico(new.id, 'cancelada',
        jsonb_build_object('de', old.status));
    else
      perform registrar_historico(new.id, 'status_alterado',
        jsonb_build_object('de', old.status, 'para', new.status));
    end if;
  end if;

  if new.assinatura_codigo is not null
     and new.assinatura_codigo is distinct from old.assinatura_codigo then
    perform registrar_historico(new.id, 'link_gerado',
      jsonb_build_object('expira_em', new.assinatura_expira_em));
  end if;

  if new.cliente_nome is distinct from old.cliente_nome then
    v_dados := v_dados || jsonb_build_object('cliente_nome',
      jsonb_build_object('de', old.cliente_nome, 'para', new.cliente_nome));
  end if;
  if new.cliente_telefone is distinct from old.cliente_telefone then
    v_dados := v_dados || jsonb_build_object('cliente_telefone',
      jsonb_build_object('de', old.cliente_telefone, 'para', new.cliente_telefone));
  end if;
  if new.veiculo_descricao is distinct from old.veiculo_descricao then
    v_dados := v_dados || jsonb_build_object('veiculo_descricao',
      jsonb_build_object('de', old.veiculo_descricao, 'para', new.veiculo_descricao));
  end if;
  if new.veiculo_placa is distinct from old.veiculo_placa then
    v_dados := v_dados || jsonb_build_object('veiculo_placa',
      jsonb_build_object('de', old.veiculo_placa, 'para', new.veiculo_placa));
  end if;
  if new.data_os is distinct from old.data_os then
    v_dados := v_dados || jsonb_build_object('data_os',
      jsonb_build_object('de', old.data_os, 'para', new.data_os));
  end if;
  if new.observacoes is distinct from old.observacoes then
    v_dados := v_dados || jsonb_build_object('observacoes',
      jsonb_build_object('de', old.observacoes, 'para', new.observacoes));
  end if;
  if v_dados <> '{}'::jsonb then
    perform registrar_historico(new.id, 'dados_alterados', v_dados);
  end if;

  return null;
end $$;

create trigger ordens_historico
after insert or update on ordens_servico
for each row execute function historico_da_os();

-- ---------------------------------------------------------------------------
-- Gatilho dos itens
--
-- BEFORE, para ler o total ANTES de a linha mudar e de o recalculo rodar. O
-- nome sorteia antes de os_itens_trava_assinada: se a trava recusar, a
-- instrucao inteira desfaz, inclusive este registro.
-- ---------------------------------------------------------------------------
create or replace function historico_dos_itens() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_os    uuid := coalesce(new.os_id, old.os_id);
  v_total int;
begin
  select total_centavos into v_total from ordens_servico where id = v_os;
  -- OS ja removida (apagada no SQL Editor, itens saindo em cascata): nada a
  -- registrar, e gravar aqui violaria a chave estrangeira do historico.
  if found then
    perform registrar_historico(v_os, 'itens_alterados',
      jsonb_build_object('total_de', v_total, 'total_para', v_total));
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create trigger os_itens_historico
before insert or update or delete on os_itens
for each row execute function historico_dos_itens();


commit;
