import { describe, it, expect, beforeEach } from 'vitest'
import { criarBanco, como, criarOS, USUARIO_TESTE } from './banco-de-teste.js'

// Achados da revisão final: pela API, um usuário ativo podia escrever o total,
// o número e o autor da OS direto (sem rastro), e quem estava bloqueado, ou o
// visitante com a chave pública, gastava números da sequência mesmo sendo
// recusado pelo RLS.

const ATENDENTE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const BLOQUEADO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

let db
const comoUsuario = (uid, fn) => como(db, 'authenticated', fn, uid)

const INSERIR = (extra = '', valores = '') => `
  insert into ordens_servico (cliente_nome, veiculo_descricao, veiculo_placa${extra})
  values ('Cliente', 'Carro', 'ABC1D23'${valores}) returning id, numero`

async function sequencia() {
  const { rows: [s] } = await db.query('select last_value, is_called from os_numero_seq')
  return `${s.last_value}:${s.is_called}`
}

beforeEach(async () => {
  db = await criarBanco()
  await db.query(
    "insert into auth.users (id, email) values ($1, 'a@mizuho.invalid'), ($2, 'b@mizuho.invalid')",
    [ATENDENTE, BLOQUEADO])
  await db.query(
    `insert into perfis (user_id, usuario, nome, papel, ativo) values
       ($1, 'atendente1', 'Atendente', 'atendente', true),
       ($2, 'bloqueado1', 'Bloqueado', 'atendente', false)`, [ATENDENTE, BLOQUEADO])
})

describe('campos que só o sistema escreve', () => {
  it('atendente não altera o total direto', async () => {
    const os = await criarOS(db)
    await expect(comoUsuario(ATENDENTE, () => db.query(
      'update ordens_servico set total_centavos = 1 where id = $1', [os.id])))
      .rejects.toThrow(/campo_protegido/)
    const { rows: [o] } = await db.query(
      'select total_centavos from ordens_servico where id = $1', [os.id])
    expect(o.total_centavos).toBe(0)
  })

  it('atendente não troca o número da OS', async () => {
    const os = await criarOS(db)
    await expect(comoUsuario(ATENDENTE, () => db.query(
      'update ordens_servico set numero = 99999 where id = $1', [os.id])))
      .rejects.toThrow(/campo_protegido/)
  })

  it('atendente não cria OS com número escolhido, e a numeração do administrador segue livre', async () => {
    await expect(comoUsuario(ATENDENTE, () => db.query(
      INSERIR(', numero', ', 500000'))))
      .rejects.toThrow(/campo_protegido/)
    await comoUsuario(USUARIO_TESTE, () =>
      db.query('select definir_proximo_numero($1)', [200]))
    const os = await criarOS(db)
    expect(Number(os.numero)).toBe(200)
  })

  it('atendente não cria OS já com total', async () => {
    await expect(comoUsuario(ATENDENTE, () => db.query(
      INSERIR(', total_centavos', ', 100'))))
      .rejects.toThrow(/campo_protegido/)
  })

  it('o autor da OS é quem a criou, e não muda', async () => {
    await expect(comoUsuario(ATENDENTE, () => db.query(
      INSERIR(', criado_por', `, '${USUARIO_TESTE}'`))))
      .rejects.toThrow(/campo_protegido/)

    const { rows: [os] } = await comoUsuario(ATENDENTE, () => db.query(
      INSERIR(', criado_por', `, '${ATENDENTE}'`)))
    await expect(comoUsuario(ATENDENTE, () => db.query(
      'update ordens_servico set criado_por = $1 where id = $2', [USUARIO_TESTE, os.id])))
      .rejects.toThrow(/campo_protegido/)
  })

  it('o total continua mudando pelos itens, e o número ao cancelar a última OS', async () => {
    const { rows: [os] } = await comoUsuario(ATENDENTE, () => db.query(INSERIR()))
    await comoUsuario(ATENDENTE, () => db.query(
      'select substituir_itens($1, $2::jsonb)', [os.id, JSON.stringify([
        { posicao: 1, quantidade: 1, descricao: 'Alternador',
          valor_unitario_centavos: 38000, valor_total_centavos: 38000 }])]))
    const { rows: [depois] } = await db.query(
      'select total_centavos, numero from ordens_servico where id = $1', [os.id])
    expect(depois.total_centavos).toBe(38000)

    const { rows: [r] } = await comoUsuario(ATENDENTE, () =>
      db.query('select cancelar_os($1) as devolveu', [os.id]))
    expect(r.devolveu).toBe(true)
    const { rows: [cancelada] } = await db.query(
      'select numero, status from ordens_servico where id = $1', [os.id])
    expect(cancelada).toEqual({ numero: null, status: 'cancelada' })
  })

  it('cancelar OS é coisa de usuário ativo', async () => {
    const os = await criarOS(db)
    await expect(comoUsuario(BLOQUEADO, () =>
      db.query('select cancelar_os($1)', [os.id]))).rejects.toThrow(/acesso_negado/)
    const { rows: [o] } = await db.query('select status from ordens_servico where id = $1', [os.id])
    expect(o.status).toBe('orcamento')
  })
})

describe('quem não pode criar OS não gasta número', () => {
  it('bloqueado é recusado antes de a sequência andar', async () => {
    const antes = await sequencia()
    await expect(comoUsuario(BLOQUEADO, () => db.query(INSERIR())))
      .rejects.toThrow(/acesso_negado/)
    expect(await sequencia()).toBe(antes)
  })

  it('visitante só com a chave pública também não', async () => {
    const antes = await sequencia()
    await expect(como(db, 'anon', () => db.query(INSERIR())))
      .rejects.toThrow(/acesso_negado/)
    expect(await sequencia()).toBe(antes)
  })

  it('a próxima OS de verdade sai com o número seguinte, sem buraco', async () => {
    await expect(comoUsuario(BLOQUEADO, () => db.query(INSERIR()))).rejects.toThrow()
    const { rows: [os] } = await comoUsuario(ATENDENTE, () => db.query(INSERIR()))
    expect(Number(os.numero)).toBe(1)
  })
})
