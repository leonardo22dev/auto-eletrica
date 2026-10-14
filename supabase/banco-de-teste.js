import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { STUBS_DO_SUPABASE } from '../src/demo/stubsSupabase.js'

const AQUI = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS = join(AQUI, 'migrations')

// O usuário logado "padrão" dos testes. Num projeto novo o primeiro usuário
// criado vira administrador (migration 0008), e é isto que ele é.
export const USUARIO_TESTE = '11111111-1111-4111-8111-111111111111'

export function arquivosDeMigration() {
  return readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql')).sort()
}

export function aplicarMigration(db, nome) {
  return db.exec(readFileSync(join(MIGRATIONS, nome), 'utf8'))
}

// O Supabase concede as tabelas aos papéis anon e authenticated por padrão, e
// é o RLS que protege. Sem imitar isso, "visitante não lê" passaria por falta
// de permissão de tabela e não provaria nada sobre o RLS.
export function concederComoOSupabase(db) {
  return db.exec(`
    grant usage on schema public to anon, authenticated;
    grant all on all tables in schema public to anon, authenticated;
    grant all on all sequences in schema public to anon, authenticated;
  `)
}

// `ate` é o prefixo da última migration a aplicar (ex.: '0007'): serve para
// testar o caminho de quem já usava o sistema antes da atualização.
export async function criarBanco({ ate } = {}) {
  const db = await new PGlite()
  await db.exec(STUBS_DO_SUPABASE)
  for (const nome of arquivosDeMigration()) {
    if (ate && nome.slice(0, 4) > ate) break
    await aplicarMigration(db, nome)
  }
  await concederComoOSupabase(db)
  if (!ate) {
    await db.query(
      "insert into auth.users (id, email) values ($1, 'teste@mizuho.invalid')",
      [USUARIO_TESTE],
    )
  }
  return db
}

// Executa como um papel do Supabase e volta a ser dono. Para `authenticated`,
// informa quem é o usuário (o `sub` do JWT), que é o que auth.uid() lê.
export async function como(db, papel, fn, uid = USUARIO_TESTE) {
  await db.exec(`set role ${papel}`)
  if (papel === 'authenticated') {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid])
  }
  try {
    return await fn()
  } finally {
    await db.exec('reset role')
    await db.exec("select set_config('request.jwt.claim.sub', '', false)")
  }
}

export async function criarOS(db, extra = {}) {
  const campos = {
    cliente_nome: 'Cliente Teste',
    cliente_telefone: '(11) 98888-7777',
    veiculo_descricao: 'GM Chevette 1982',
    veiculo_placa: 'ABC1D23',
    ...extra,
  }
  const { rows: [os] } = await db.query(
    `insert into ordens_servico
       (cliente_nome, cliente_telefone, veiculo_descricao, veiculo_placa)
     values ($1, $2, $3, $4) returning id, numero, data_os`,
    [campos.cliente_nome, campos.cliente_telefone,
     campos.veiculo_descricao, campos.veiculo_placa],
  )
  return os
}

export async function adicionarItem(db, osId, posicao, descricao, centavos) {
  await db.query(
    `insert into os_itens (os_id, posicao, quantidade, descricao,
                           valor_unitario_centavos, valor_total_centavos)
     values ($1, $2, 1, $3, $4, $4)`,
    [osId, posicao, descricao, centavos],
  )
}
