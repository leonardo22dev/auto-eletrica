// O Supabase traz prontos o schema `auth`, o `storage`, o pgcrypto (no schema
// `extensions`) e os papéis anon/authenticated. O PGlite é Postgres puro, então
// as migrations reais rodam sobre estes stubs. As COLUNAS de auth.users e
// auth.identities são as que as migrations usam; o bcrypt de verdade só é
// verificado contra o Supabase real.
export const STUBS_DO_SUPABASE = `
  create schema if not exists auth;
  create schema if not exists extensions;

  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    instance_id uuid, aud text, role text, email text,
    encrypted_password text, email_confirmed_at timestamptz,
    raw_app_meta_data jsonb, raw_user_meta_data jsonb,
    created_at timestamptz not null default now(), updated_at timestamptz,
    banned_until timestamptz, last_sign_in_at timestamptz,
    confirmation_token text, recovery_token text,
    email_change_token_new text, email_change text
  );
  create table auth.identities (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    provider_id text not null, identity_data jsonb not null, provider text not null,
    last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz
  );
  create table auth.sessions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade
  );

  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;

  create function extensions.gen_salt(text) returns text
    language sql as $$ select 'salt' $$;
  create function extensions.crypt(text, text) returns text
    language sql as $$ select 'stub$' || md5($1 || $2) $$;

  create role authenticated;
  create role anon;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;

  create schema if not exists storage;
  create table storage.buckets (
    id text primary key, name text not null, public boolean not null default false
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(), bucket_id text, name text
  );
  alter table storage.objects enable row level security;
`
