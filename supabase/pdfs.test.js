import { describe, it, expect, beforeEach } from 'vitest'
import { criarBanco, como, USUARIO_TESTE } from './banco-de-teste.js'

// A política antiga deixava QUALQUER visitante listar o bucket dos PDFs, e com
// a lista os caminhos (uuid da OS) de todos os documentos. A leitura por link
// direto não depende de política: o bucket é público.

const BLOQUEADO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
let db
const comoUsuario = (uid, fn) => como(db, 'authenticated', fn, uid)

beforeEach(async () => {
  db = await criarBanco()
  // O Supabase concede o schema storage aos papéis; o stub de teste não.
  await db.exec(`
    grant usage on schema storage to anon, authenticated;
    grant select, insert, update on storage.objects to anon, authenticated;
  `)
  await db.query("insert into auth.users (id, email) values ($1, 'b@mizuho.invalid')", [BLOQUEADO])
  await db.query(
    `insert into perfis (user_id, usuario, nome, papel, ativo)
     values ($1, 'bloqueado1', 'Bloqueado', 'atendente', false)`, [BLOQUEADO])
  await db.query(`insert into storage.objects (bucket_id, name) values
    ('os-pdfs', '11111111-aaaa-4aaa-8aaa-111111111111/OS-1-Cliente.pdf'),
    ('outro', 'x.pdf')`)
})

describe('listagem do bucket os-pdfs', () => {
  it('o visitante, só com a chave pública, não lista', async () => {
    const r = await como(db, 'anon', () => db.query('select name from storage.objects'))
    expect(r.rows).toHaveLength(0)
  })

  it('o usuário ativo lista os PDFs, e só os do bucket', async () => {
    const r = await comoUsuario(USUARIO_TESTE, () => db.query('select bucket_id from storage.objects'))
    expect(r.rows).toEqual([{ bucket_id: 'os-pdfs' }])
  })

  it('o bloqueado não lista', async () => {
    const r = await comoUsuario(BLOQUEADO, () => db.query('select name from storage.objects'))
    expect(r.rows).toHaveLength(0)
  })
})

describe('gravar e regravar o PDF (o que o app faz)', () => {
  const inserir = () => db.query(
    "insert into storage.objects (bucket_id, name) values ('os-pdfs', '22222222-bbbb/OS-2.pdf') returning id")

  it('o usuário ativo envia o PDF', async () => {
    const r = await comoUsuario(USUARIO_TESTE, inserir)
    expect(r.rows).toHaveLength(1)
  })

  it('o usuário ativo regrava o PDF existente (upsert)', async () => {
    const r = await comoUsuario(USUARIO_TESTE, () => db.query(
      "update storage.objects set name = name where bucket_id = 'os-pdfs' returning id"))
    expect(r.rows).toHaveLength(1)
  })

  it('o bloqueado e o visitante não enviam', async () => {
    await expect(comoUsuario(BLOQUEADO, inserir)).rejects.toThrow(/row-level security/)
    await expect(como(db, 'anon', inserir)).rejects.toThrow(/row-level security/)
  })
})

describe('o link direto continua valendo', () => {
  it('o bucket segue público, que é o que serve o link do WhatsApp', async () => {
    const { rows: [b] } = await db.query("select public from storage.buckets where id = 'os-pdfs'")
    expect(b.public).toBe(true)
  })
})
