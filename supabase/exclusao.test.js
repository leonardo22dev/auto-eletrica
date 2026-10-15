import { describe, it, expect, beforeEach } from 'vitest'
import {
  criarBanco, como, criarOS, adicionarItem, USUARIO_TESTE,
} from './banco-de-teste.js'

// Excluir OS: só o administrador, qualquer status (inclusive assinada), por
// uma função. A API continua sem permitir apagar direto. Fica um registro
// mínimo, legível só pelo administrador.

const ATENDENTE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const BLOQUEADO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

let db
const comoUsuario = (uid, fn) => como(db, 'authenticated', fn, uid)
const excluir = (quem, id) =>
  comoUsuario(quem, () => db.query('select excluir_os($1)', [id]))

async function contar(tabela, onde = '', args = []) {
  const { rows: [r] } = await db.query(`select count(*)::int as n from ${tabela} ${onde}`, args)
  return r.n
}

// Uma OS com item e atividade, como nasce no uso real.
async function osComItem(centavos = 48000) {
  const os = await criarOS(db)
  await adicionarItem(db, os.id, 1, 'Alternador', centavos)
  return os
}

async function assinar(osId) {
  const { rows: [{ r: link }] } = await comoUsuario(USUARIO_TESTE, () =>
    db.query('select gerar_link_assinatura($1, false) as r', [osId]))
  const { rows: [{ r: vista }] } = await como(db, 'anon', () =>
    db.query('select obter_os_para_assinatura($1) as r', [link.codigo]))
  await como(db, 'anon', () => db.query(
    'select registrar_aceite($1, $2, $3, $4)', [link.codigo, PNG, 48000, vista.versao]))
}

beforeEach(async () => {
  db = await criarBanco()
  await db.exec(`
    grant usage on schema storage to anon, authenticated;
    grant select, insert, update, delete on storage.objects to anon, authenticated;
  `)
  await db.query(
    "insert into auth.users (id, email) values ($1, 'a@mizuho.invalid'), ($2, 'b@mizuho.invalid')",
    [ATENDENTE, BLOQUEADO])
  await db.query(
    `insert into perfis (user_id, usuario, nome, papel, ativo) values
       ($1, 'atendente1', 'Atendente', 'atendente', true),
       ($2, 'bloqueado1', 'Bloqueado', 'atendente', false)`, [ATENDENTE, BLOQUEADO])
})

describe('quem pode excluir', () => {
  it('o administrador exclui a OS, os itens e a atividade', async () => {
    const os = await osComItem()
    expect(await contar('os_historico', 'where os_id = $1', [os.id])).toBeGreaterThan(0)

    await excluir(USUARIO_TESTE, os.id)

    expect(await contar('ordens_servico', 'where id = $1', [os.id])).toBe(0)
    expect(await contar('os_itens', 'where os_id = $1', [os.id])).toBe(0)
    expect(await contar('os_historico', 'where os_id = $1', [os.id])).toBe(0)
  })

  it.each([
    ['atendente', ATENDENTE],
    ['bloqueado', BLOQUEADO],
  ])('%s é recusado e a OS fica', async (_nome, uid) => {
    const os = await osComItem()
    await expect(excluir(uid, os.id)).rejects.toThrow(/acesso_negado/)
    expect(await contar('ordens_servico', 'where id = $1', [os.id])).toBe(1)
    expect(await contar('os_excluidas')).toBe(0)
  })

  it('o visitante não executa a função', async () => {
    const os = await osComItem()
    await expect(como(db, 'anon', () => db.query('select excluir_os($1)', [os.id])))
      .rejects.toThrow(/permission denied/)
  })

  it('OS inexistente, ou já excluída, é recusada', async () => {
    const os = await osComItem()
    await excluir(USUARIO_TESTE, os.id)
    await expect(excluir(USUARIO_TESTE, os.id)).rejects.toThrow(/nao encontrada/)
  })
})

describe('apagar direto pela API continua barrado', () => {
  it('nem o administrador apaga a OS por delete', async () => {
    const os = await osComItem()
    const r = await comoUsuario(USUARIO_TESTE, () => db.query(
      'delete from ordens_servico where id = $1 returning id', [os.id]))
    expect(r.rows).toHaveLength(0)
    expect(await contar('ordens_servico', 'where id = $1', [os.id])).toBe(1)
  })
})

describe('qualquer OS, inclusive a assinada', () => {
  it('exclui OS assinada pelo cliente', async () => {
    const os = await osComItem()
    await assinar(os.id)
    expect(await contar('ordens_servico', 'where id = $1 and aceite_em is not null', [os.id])).toBe(1)

    await excluir(USUARIO_TESTE, os.id)

    expect(await contar('ordens_servico', 'where id = $1', [os.id])).toBe(0)
    expect(await contar('os_itens', 'where os_id = $1', [os.id])).toBe(0)
  })

  it('exclui OS finalizada', async () => {
    const os = await osComItem()
    await db.query("update ordens_servico set status = 'finalizada' where id = $1", [os.id])
    await excluir(USUARIO_TESTE, os.id)
    expect(await contar('ordens_servico', 'where id = $1', [os.id])).toBe(0)
  })
})

describe('registro mínimo', () => {
  it('guarda o que era a OS e quem excluiu', async () => {
    const os = await osComItem(48000)
    await db.query("update ordens_servico set status = 'aprovada' where id = $1", [os.id])
    await excluir(USUARIO_TESTE, os.id)

    const { rows: [r] } = await db.query('select * from os_excluidas')
    expect(r).toMatchObject({
      os_id: os.id,
      numero: Number(os.numero),
      cliente_nome: 'Cliente Teste',
      veiculo_placa: 'ABC1D23',
      veiculo_descricao: 'GM Chevette 1982',
      status: 'aprovada',
      total_centavos: 48000,
      assinada: false,
      aceite_em: null,
      excluida_por: USUARIO_TESTE,
    })
    expect(r.excluida_por_nome).toBeTruthy()
    expect(r.excluida_em).toBeTruthy()
  })

  it('registra que a OS estava assinada, e quando', async () => {
    const os = await osComItem()
    await assinar(os.id)
    await excluir(USUARIO_TESTE, os.id)
    const { rows: [r] } = await db.query('select assinada, aceite_em, status from os_excluidas')
    expect(r.assinada).toBe(true)
    expect(r.aceite_em).not.toBe(null)
    expect(r.status).toBe('aprovada')
  })

  it('o registro não carrega o desenho da assinatura nem os itens', async () => {
    const os = await osComItem()
    await assinar(os.id)
    await excluir(USUARIO_TESTE, os.id)
    const { rows: [r] } = await db.query('select * from os_excluidas')
    expect(Object.keys(r)).not.toEqual(expect.arrayContaining(['aceite_assinatura']))
    expect(JSON.stringify(r)).not.toContain('data:image')
  })

  it('só o administrador lê, e ninguém escreve pela API', async () => {
    const os = await osComItem()
    await excluir(USUARIO_TESTE, os.id)

    const admin = await comoUsuario(USUARIO_TESTE, () => db.query('select id from os_excluidas'))
    expect(admin.rows).toHaveLength(1)
    const atendente = await comoUsuario(ATENDENTE, () => db.query('select id from os_excluidas'))
    expect(atendente.rows).toHaveLength(0)
    const visitante = await como(db, 'anon', () => db.query('select id from os_excluidas'))
    expect(visitante.rows).toHaveLength(0)

    await expect(comoUsuario(USUARIO_TESTE, () => db.query(
      `insert into os_excluidas (os_id, cliente_nome, excluida_por_nome)
       values (gen_random_uuid(), 'x', 'x')`))).rejects.toThrow(/row-level security/)
    const alterado = await comoUsuario(USUARIO_TESTE, () => db.query(
      "update os_excluidas set cliente_nome = 'forjado' returning id"))
    expect(alterado.rows).toHaveLength(0)
    const apagado = await comoUsuario(USUARIO_TESTE, () =>
      db.query('delete from os_excluidas returning id'))
    expect(apagado.rows).toHaveLength(0)
  })
})

describe('numeração', () => {
  it('excluir a última OS devolve o número', async () => {
    const os = await osComItem()
    expect(Number(os.numero)).toBe(1)
    await excluir(USUARIO_TESTE, os.id)
    const proxima = await criarOS(db)
    expect(Number(proxima.numero)).toBe(1)
    // O registro guarda o número que a OS tinha, mesmo devolvido à fila.
    const { rows: [r] } = await db.query('select numero from os_excluidas')
    expect(Number(r.numero)).toBe(1)
  })

  it('excluir uma OS do meio não mexe na numeração', async () => {
    const a = await osComItem()
    await osComItem()
    await excluir(USUARIO_TESTE, a.id)
    const proxima = await criarOS(db)
    expect(Number(proxima.numero)).toBe(3)
  })
})

describe('PDF no armazenamento', () => {
  beforeEach(async () => {
    await db.query(`insert into storage.objects (bucket_id, name) values
      ('os-pdfs', 'uuid-a/OS-1.pdf')`)
  })

  it('o administrador apaga o PDF; o atendente e o visitante não', async () => {
    const atendente = await comoUsuario(ATENDENTE, () => db.query(
      "delete from storage.objects where bucket_id = 'os-pdfs' returning id"))
    expect(atendente.rows).toHaveLength(0)
    const visitante = await como(db, 'anon', () => db.query(
      "delete from storage.objects where bucket_id = 'os-pdfs' returning id"))
    expect(visitante.rows).toHaveLength(0)

    const admin = await comoUsuario(USUARIO_TESTE, () => db.query(
      "delete from storage.objects where bucket_id = 'os-pdfs' returning id"))
    expect(admin.rows).toHaveLength(1)
  })
})
