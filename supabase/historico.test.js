import { describe, it, expect, beforeEach } from 'vitest'
import {
  criarBanco, como, criarOS, adicionarItem, USUARIO_TESTE,
} from './banco-de-teste.js'

const ATENDENTE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

let db
const comoUsuario = (uid, fn) => como(db, 'authenticated', fn, uid)

async function eventos(osId, acao) {
  const { rows } = await db.query(
    `select acao, usuario_nome, usuario_id, detalhe from os_historico
      where os_id = $1 ${acao ? 'and acao = $2' : ''} order by id`,
    acao ? [osId, acao] : [osId])
  return rows
}

// Cria a OS como o atendente, pela API (é assim que ela nasce na vida real).
async function osDoAtendente() {
  return comoUsuario(ATENDENTE, async () => {
    const { rows: [os] } = await db.query(
      `insert into ordens_servico (cliente_nome, veiculo_descricao, veiculo_placa, criado_por)
       values ('Cliente', 'Carro', 'ABC1D23', $1) returning id`, [ATENDENTE])
    return os
  })
}

beforeEach(async () => {
  db = await criarBanco()
  await db.query("insert into auth.users (id, email) values ($1, 'atendente1@mizuho.invalid')", [ATENDENTE])
  await db.query(
    `insert into perfis (user_id, usuario, nome, papel)
     values ($1, 'atendente1', 'Maria Atendente', 'atendente')`, [ATENDENTE])
})

describe('quem fez', () => {
  it('registra a criação com o nome de quem criou', async () => {
    const os = await osDoAtendente()
    const ev = await eventos(os.id)
    expect(ev).toHaveLength(1)
    expect(ev[0]).toMatchObject({
      acao: 'criada', usuario_nome: 'Maria Atendente', usuario_id: ATENDENTE,
    })
  })

  it('fora de uma sessão, o autor é "Sistema"', async () => {
    const os = await criarOS(db)
    expect((await eventos(os.id))[0].usuario_nome).toBe('Sistema')
  })

  it('o nome gravado não muda quando a pessoa é renomeada, nem some se ela for apagada', async () => {
    const os = await osDoAtendente()
    await db.query("update perfis set nome = 'Outro Nome' where user_id = $1", [ATENDENTE])
    expect((await eventos(os.id))[0].usuario_nome).toBe('Maria Atendente')
    await db.query('delete from auth.users where id = $1', [ATENDENTE])
    const ev = await eventos(os.id)
    expect(ev[0].usuario_nome).toBe('Maria Atendente')
  })
})

describe('o que é registrado', () => {
  it('dados alterados: só os campos que mudaram, com de e para', async () => {
    const os = await osDoAtendente()
    await comoUsuario(ATENDENTE, () => db.query(
      `update ordens_servico set cliente_nome = 'Cliente Novo', veiculo_placa = 'XYZ9K88'
        where id = $1`, [os.id]))
    const [ev] = await eventos(os.id, 'dados_alterados')
    expect(ev.detalhe).toEqual({
      cliente_nome: { de: 'Cliente', para: 'Cliente Novo' },
      veiculo_placa: { de: 'ABC1D23', para: 'XYZ9K88' },
    })
  })

  it('atualizar sem mudar nada não registra', async () => {
    const os = await osDoAtendente()
    await comoUsuario(ATENDENTE, () => db.query(
      "update ordens_servico set cliente_nome = 'Cliente' where id = $1", [os.id]))
    expect(await eventos(os.id, 'dados_alterados')).toHaveLength(0)
  })

  it('status: de e para; cancelar tem ação própria', async () => {
    const os = await osDoAtendente()
    await comoUsuario(ATENDENTE, () => db.query(
      "update ordens_servico set status = 'aprovada' where id = $1", [os.id]))
    expect((await eventos(os.id, 'status_alterado'))[0].detalhe)
      .toEqual({ de: 'orcamento', para: 'aprovada' })

    await comoUsuario(ATENDENTE, () => db.query('select cancelar_os($1)', [os.id]))
    const cancelada = await eventos(os.id, 'cancelada')
    expect(cancelada).toHaveLength(1)
    expect(cancelada[0].usuario_nome).toBe('Maria Atendente')
    expect(cancelada[0].detalhe).toEqual({ de: 'aprovada' })
  })

  it('o link de assinatura gerado vira evento', async () => {
    const os = await osDoAtendente()
    await comoUsuario(ATENDENTE, () =>
      db.query('select gerar_link_assinatura($1, false)', [os.id]))
    const ev = await eventos(os.id, 'link_gerado')
    expect(ev).toHaveLength(1)
    expect(ev[0].usuario_nome).toBe('Maria Atendente')
    expect(ev[0].detalhe.expira_em).toBeTruthy()
  })

  it('o aceite do cliente aparece como "Cliente (assinatura)", sem usuário', async () => {
    const os = await osDoAtendente()
    await adicionarItem(db, os.id, 1, 'Alternador', 48000)
    const { rows: [{ r: link }] } = await comoUsuario(ATENDENTE, () =>
      db.query('select gerar_link_assinatura($1, false) as r', [os.id]))
    const { rows: [{ r: vista }] } = await como(db, 'anon', () =>
      db.query('select obter_os_para_assinatura($1) as r', [link.codigo]))
    // Mesmo com um funcionário logado no mesmo navegador, quem assina é o cliente.
    await comoUsuario(ATENDENTE, () => db.query(
      'select registrar_aceite($1, $2, $3, $4)', [link.codigo, PNG, 48000, vista.versao]))

    const [aceite] = await eventos(os.id, 'aceita')
    expect(aceite.usuario_nome).toBe('Cliente (assinatura)')
    expect(aceite.usuario_id).toBe(null)
    expect(aceite.detalhe).toEqual({
      total_centavos: 48000, status_de: 'orcamento', status_para: 'aprovada',
    })
    // O status mudou por causa do aceite: não há um segundo evento para isso.
    expect(await eventos(os.id, 'status_alterado')).toHaveLength(0)
  })
})

describe('itens', () => {
  it('uma operação com vários itens vira UM evento, com total antes e depois', async () => {
    const os = await osDoAtendente()
    await comoUsuario(ATENDENTE, () => db.query(
      'select substituir_itens($1, $2::jsonb)', [os.id, JSON.stringify([
        { posicao: 1, quantidade: 1, descricao: 'Alternador',
          valor_unitario_centavos: 38000, valor_total_centavos: 38000 },
        { posicao: 2, quantidade: 1, descricao: 'Correia',
          valor_unitario_centavos: 10000, valor_total_centavos: 10000 },
      ])]))
    const ev = await eventos(os.id, 'itens_alterados')
    expect(ev).toHaveLength(1)
    expect(ev[0].detalhe).toEqual({ total_de: 0, total_para: 48000 })
    expect(ev[0].usuario_nome).toBe('Maria Atendente')
  })

  it('uma segunda edição é outro evento, partindo do total anterior', async () => {
    const os = await osDoAtendente()
    const itens = (valor) => JSON.stringify([
      { posicao: 1, quantidade: 1, descricao: 'Alternador',
        valor_unitario_centavos: valor, valor_total_centavos: valor }])
    await comoUsuario(ATENDENTE, () =>
      db.query('select substituir_itens($1, $2::jsonb)', [os.id, itens(38000)]))
    await comoUsuario(ATENDENTE, () =>
      db.query('select substituir_itens($1, $2::jsonb)', [os.id, itens(45000)]))
    const ev = await eventos(os.id, 'itens_alterados')
    expect(ev.map((e) => e.detalhe)).toEqual([
      { total_de: 0, total_para: 38000 },
      { total_de: 38000, total_para: 45000 },
    ])
  })

  it('trocar um item por outro do mesmo valor também é registrado', async () => {
    const os = await osDoAtendente()
    await adicionarItem(db, os.id, 1, 'Alternador novo', 30000)
    await comoUsuario(ATENDENTE, () => db.query(
      "update os_itens set descricao = 'Alternador recondicionado' where os_id = $1", [os.id]))
    const ev = await eventos(os.id, 'itens_alterados')
    expect(ev.length).toBeGreaterThan(0)
    expect(ev.at(-1).detalhe).toEqual({ total_de: 30000, total_para: 30000 })
  })

  it('OS assinada recusa a edição e não deixa evento para trás', async () => {
    const os = await osDoAtendente()
    await adicionarItem(db, os.id, 1, 'Alternador', 48000)
    const { rows: [{ r: link }] } = await comoUsuario(ATENDENTE, () =>
      db.query('select gerar_link_assinatura($1, false) as r', [os.id]))
    const { rows: [{ r: vista }] } = await como(db, 'anon', () =>
      db.query('select obter_os_para_assinatura($1) as r', [link.codigo]))
    await como(db, 'anon', () => db.query(
      'select registrar_aceite($1, $2, $3, $4)', [link.codigo, PNG, 48000, vista.versao]))
    const antes = (await eventos(os.id, 'itens_alterados')).length

    await expect(comoUsuario(ATENDENTE, () => db.query(
      "update os_itens set descricao = 'Outro' where os_id = $1", [os.id])))
      .rejects.toThrow(/assinada/)
    expect((await eventos(os.id, 'itens_alterados')).length).toBe(antes)
  })
})

describe('o histórico não se altera', () => {
  it('quem usa o sistema lê, mas não escreve, edita nem apaga', async () => {
    const os = await osDoAtendente()
    const lido = await comoUsuario(ATENDENTE, () =>
      db.query('select id from os_historico where os_id = $1', [os.id]))
    expect(lido.rows.length).toBeGreaterThan(0)

    await expect(comoUsuario(ATENDENTE, () => db.query(
      `insert into os_historico (os_id, usuario_nome, acao) values ($1, 'x', 'criada')`,
      [os.id]))).rejects.toThrow(/row-level security/)
    const alterado = await comoUsuario(ATENDENTE, () => db.query(
      "update os_historico set usuario_nome = 'forjado' returning id"))
    expect(alterado.rows).toHaveLength(0)
    const apagado = await comoUsuario(ATENDENTE, () =>
      db.query('delete from os_historico returning id'))
    expect(apagado.rows).toHaveLength(0)
  })

  it('bloqueado e visitante não leem', async () => {
    const os = await osDoAtendente()
    await db.query('update perfis set ativo = false where user_id = $1', [ATENDENTE])
    const bloqueado = await comoUsuario(ATENDENTE, () =>
      db.query('select id from os_historico where os_id = $1', [os.id]))
    expect(bloqueado.rows).toHaveLength(0)
    const visitante = await como(db, 'anon', () =>
      db.query('select id from os_historico'))
    expect(visitante.rows).toHaveLength(0)
  })

  it('não há função de registro exposta a ninguém', async () => {
    const os = await criarOS(db)
    await expect(comoUsuario(USUARIO_TESTE, () => db.query(
      "select registrar_historico($1, 'criada', '{}'::jsonb)", [os.id])))
      .rejects.toThrow(/permission denied/)
  })
})

// A limpeza manual dos registros de teste, no SQL Editor, é um delete direto.
describe('limpeza manual', () => {
  it('apagar uma OS com itens e histórico funciona e leva o histórico junto', async () => {
    const os = await osDoAtendente()
    await adicionarItem(db, os.id, 1, 'Alternador', 48000)
    await comoUsuario(ATENDENTE, () => db.query(
      "update ordens_servico set cliente_nome = 'Outro' where id = $1", [os.id]))
    expect((await eventos(os.id)).length).toBeGreaterThan(2)

    await db.query('delete from ordens_servico where id = $1', [os.id])

    const { rows: o } = await db.query('select 1 from ordens_servico where id = $1', [os.id])
    const { rows: h } = await db.query('select 1 from os_historico where os_id = $1', [os.id])
    const { rows: i } = await db.query('select 1 from os_itens where os_id = $1', [os.id])
    expect([o.length, h.length, i.length]).toEqual([0, 0, 0])
  })
})
