import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { STUBS_DO_SUPABASE } from '../src/demo/stubsSupabase.js'
import { criarBanco, arquivosDeMigration } from './banco-de-teste.js'

const AQUI = dirname(fileURLToPath(import.meta.url))
// Fim de linha do Windows não pode fazer um pacote parecer desatualizado.
const ler = (...partes) =>
  readFileSync(join(AQUI, ...partes), 'utf8').replace(/\r\n/g, '\n')

// Se alguém criar a migration 0011 e esquecer de regerar os pacotes, é aqui
// que aparece: eles são o que o dono cola no SQL Editor.
describe('pacotes para colar no SQL Editor', () => {
  it('setup-completo.sql traz todas as migrations e aplica num projeto novo', async () => {
    const pacote = ler('setup-completo.sql')
    for (const nome of arquivosDeMigration()) {
      expect(pacote).toContain(`-- ====== ${nome} ======`)
      expect(pacote).toContain(ler('migrations', nome).trim())
    }

    const db = await new PGlite()
    await db.exec(STUBS_DO_SUPABASE)
    await db.exec(pacote)
    // O primeiro usuário de um projeto novo precisa conseguir entrar.
    await db.query(
      "insert into auth.users (id, email) values (gen_random_uuid(), 'dono@mizuho.invalid')")
    const { rows } = await db.query('select usuario, papel, ativo from perfis')
    expect(rows).toEqual([{ usuario: 'dono', papel: 'admin', ativo: true }])
    await db.close()
  })

  it('atualizacao-usuarios.sql aplica sobre quem já estava na 0007', async () => {
    const pacote = ler('atualizacao-usuarios.sql')
    expect(pacote).toMatch(/^begin;$/m)
    expect(pacote).toMatch(/^commit;$/m)
    for (const nome of arquivosDeMigration().filter((n) => n.slice(0, 4) >= '0008')) {
      expect(pacote).toContain(ler('migrations', nome).trim())
    }

    const db = await criarBanco({ ate: '0007' })
    await db.query(
      "insert into auth.users (id, email) values (gen_random_uuid(), 'mizuho@mizuho.invalid')")
    await db.exec(pacote)
    const { rows } = await db.query('select usuario, papel, ativo from perfis')
    expect(rows).toEqual([{ usuario: 'mizuho', papel: 'admin', ativo: true }])
    await db.close()
  })

  it('a atualização não traz migration antiga, que quebraria quem já tem o banco', () => {
    const pacote = ler('atualizacao-usuarios.sql')
    expect(pacote).not.toContain('-- ====== 0007_')
    expect(pacote).not.toContain('create table configuracoes')
  })
})
