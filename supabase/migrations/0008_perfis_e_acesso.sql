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
