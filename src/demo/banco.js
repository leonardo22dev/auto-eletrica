import { PGlite } from '@electric-sql/pglite'

// O Supabase traz prontos o schema `auth`, o `storage` e os papéis. O PGlite
// é Postgres puro, então as migrations reais rodam sobre estes stubs.
const STUBS = `
  create schema if not exists auth;
  create table auth.users (id uuid primary key default gen_random_uuid());
  create role authenticated;
  create role anon;
  create schema if not exists storage;
  create table storage.buckets (
    id text primary key, name text not null, public boolean not null default false
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(), bucket_id text, name text
  );
  alter table storage.objects enable row level security;
`

// As migrations entram como texto no bundle, na ordem do nome do arquivo —
// as mesmas que vão para o Supabase de verdade.
const MIGRATIONS = import.meta.glob('../../supabase/migrations/*.sql', {
  query: '?raw', import: 'default', eager: true,
})

const SEMENTE = `
  insert into clientes (id, nome, telefone) values
    ('11111111-1111-4111-8111-111111111111', 'João Silva', '(11) 98888-7777'),
    ('22222222-2222-4222-8222-222222222222', 'Marcos Pereira', '(11) 97777-6666'),
    ('33333333-3333-4333-8333-333333333333', 'Ana Ribeiro', '(11) 96666-5555');

  insert into veiculos (id, cliente_id, placa, marca, modelo, ano, cor) values
    ('aaaaaaaa-1111-4111-8111-111111111111',
     '11111111-1111-4111-8111-111111111111', 'ABC1234', 'GM', 'Chevette', 1982, 'Bege'),
    ('aaaaaaaa-2222-4222-8222-222222222222',
     '11111111-1111-4111-8111-111111111111', 'DEF2G45', 'VW', 'Saveiro', 2015, 'Branco'),
    ('aaaaaaaa-3333-4333-8333-333333333333',
     '22222222-2222-4222-8222-222222222222', 'HIJ3K67', 'VW', 'Fusca', 1975, 'Azul'),
    ('aaaaaaaa-4444-4444-8444-444444444444',
     '33333333-3333-4333-8333-333333333333', 'LMN4P89', 'Volvo', 'V70', 2003, 'Prata');

  -- Uma finalizada com garantia ainda vigente, para o aviso aparecer ao
  -- digitar a placa ABC1234.
  insert into ordens_servico
    (id, status, cliente_id, veiculo_id, cliente_nome, cliente_telefone,
     veiculo_descricao, veiculo_placa, data_abertura, data_conclusao, finalizada_em)
  values
    ('bbbbbbbb-1111-4111-8111-111111111111', 'finalizada',
     '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-1111-4111-8111-111111111111',
     'João Silva', '(11) 98888-7777', 'GM Chevette 1982 — Bege', 'ABC1234',
     current_date - 20, current_date - 18, now() - interval '18 days'),
    ('bbbbbbbb-2222-4222-8222-222222222222', 'aprovada',
     '22222222-2222-4222-8222-222222222222', 'aaaaaaaa-3333-4333-8333-333333333333',
     'Marcos Pereira', '(11) 97777-6666', 'VW Fusca 1975 — Azul', 'HIJ3K67',
     current_date - 3, null, null),
    ('bbbbbbbb-3333-4333-8333-333333333333', 'orcamento',
     '33333333-3333-4333-8333-333333333333', 'aaaaaaaa-4444-4444-8444-444444444444',
     'Ana Ribeiro', '(11) 96666-5555', 'Volvo V70 2003 — Prata', 'LMN4P89',
     current_date - 1, null, null);

  insert into os_itens
    (os_id, posicao, quantidade, descricao, valor_unitario_centavos, valor_total_centavos)
  values
    ('bbbbbbbb-1111-4111-8111-111111111111', 1, 1,
     'Alternador — recondicionamento completo', 38000, 38000),
    ('bbbbbbbb-1111-4111-8111-111111111111', 2, 1, 'Correia do alternador', 10000, 10000),
    ('bbbbbbbb-2222-4222-8222-222222222222', 1, 1, 'Limpeza de bicos injetores', 28000, 28000),
    ('bbbbbbbb-2222-4222-8222-222222222222', 2, 4, 'Vela de ignição NGK', 5000, 20000),
    ('bbbbbbbb-3333-4333-8333-333333333333', 1, 1, 'Módulo de injeção — diagnóstico', 18000, 18000),
    ('bbbbbbbb-3333-4333-8333-333333333333', 2, 1, 'Bateria Moura 60Ah', 32500, 32500);

  -- Continua a numeração acima das três OS de exemplo.
  select setval('os_numero_seq', (select max(numero) from ordens_servico), true);
`

let promessa = null

export function bancoDemo() {
  if (promessa) return promessa
  promessa = (async () => {
    const db = await new PGlite()
    await db.exec(STUBS)
    for (const caminho of Object.keys(MIGRATIONS).sort()) {
      await db.exec(MIGRATIONS[caminho])
    }
    await db.exec(SEMENTE)
    return db
  })()
  return promessa
}
