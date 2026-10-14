import { PGlite } from '@electric-sql/pglite'

// OID do tipo date no Postgres.
const DATE = 1082

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
  insert into ordens_servico
    (id, status, cliente_nome, cliente_telefone,
     veiculo_descricao, veiculo_placa, data_os, finalizada_em)
  values
    ('bbbbbbbb-1111-4111-8111-111111111111', 'finalizada',
     'João Silva', '(11) 98888-7777', 'GM Chevette 1982 — Bege', 'ABC1234',
     current_date - 18, now() - interval '18 days'),
    ('bbbbbbbb-2222-4222-8222-222222222222', 'aprovada',
     'Marcos Pereira', '(11) 97777-6666', 'VW Fusca 1975 — Azul', 'HIJ3K67',
     current_date - 3, null),
    ('bbbbbbbb-3333-4333-8333-333333333333', 'orcamento',
     'Ana Ribeiro', '(11) 96666-5555', 'Volvo V70 2003 — Prata', 'LMN4P89',
     current_date - 1, null);

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

  select setval('os_numero_seq', (select max(numero) from ordens_servico), true);
`

let promessa = null

export function bancoDemo() {
  if (promessa) return promessa
  promessa = (async () => {
    // O PGlite devolve coluna `date` como objeto Date; o PostgREST devolve a
    // string 'YYYY-MM-DD'. Sem igualar isso, a demonstração mente sobre o
    // tipo e o cálculo de garantia, que trata datas como texto, falha só aqui.
    const db = await new PGlite({ parsers: { [DATE]: (v) => v } })
    await db.exec(STUBS)
    for (const caminho of Object.keys(MIGRATIONS).sort()) {
      await db.exec(MIGRATIONS[caminho])
    }
    await db.exec(SEMENTE)
    return db
  })()
  return promessa
}
