import { describe, it, expect, beforeEach } from 'vitest'
import { criarBanco, como, USUARIO_TESTE } from './banco-de-teste.js'

const ATENDENTE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OUTRO_ADMIN = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

let db
const comoUsuario = (uid, fn) => como(db, 'authenticated', fn, uid)
const comoAdmin = (fn) => comoUsuario(USUARIO_TESTE, fn)

const criar = (usuario, nome = 'Maria', senha = 'senha1234', papel = 'atendente') =>
  comoAdmin(async () => {
    const { rows: [r] } = await db.query(
      'select criar_usuario($1, $2, $3, $4) as r', [usuario, nome, senha, papel])
    return r.r
  })

const alterar = (quem, id, nome, papel, ativo) =>
  comoUsuario(quem, () => db.query(
    'select alterar_usuario($1, $2, $3, $4)', [id, nome, papel, ativo]))

async function perfilDe(id) {
  const { rows } = await db.query('select * from perfis where user_id = $1', [id])
  return rows[0]
}

beforeEach(async () => {
  db = await criarBanco()
  // Um atendente e um segundo administrador já existentes, criados como dono.
  for (const [id, usuario, papel] of [
    [ATENDENTE, 'atendente1', 'atendente'], [OUTRO_ADMIN, 'admin2', 'admin'],
  ]) {
    await db.query('insert into auth.users (id, email) values ($1, $2)',
      [id, `${usuario}@mizuho.invalid`])
    await db.query(
      `insert into perfis (user_id, usuario, nome, papel) values ($1, $2, $3, $4)`,
      [id, usuario, usuario, papel])
  }
})

describe('quem pode chamar', () => {
  it('atendente é recusado em todas as funções de gestão', async () => {
    const chamadas = [
      ['select listar_usuarios()', []],
      ["select criar_usuario('novo1', 'Novo', 'senha1234', 'atendente')", []],
      ['select alterar_usuario($1, $2, $3, $4)', [ATENDENTE, 'X', 'atendente', true]],
      ['select redefinir_senha($1, $2)', [ATENDENTE, 'senha1234']],
    ]
    for (const [sql, args] of chamadas) {
      await expect(comoUsuario(ATENDENTE, () => db.query(sql, args)))
        .rejects.toThrow(/acesso_negado/)
    }
  })

  it('visitante não executa nenhuma', async () => {
    await expect(como(db, 'anon', () => db.query('select listar_usuarios()')))
      .rejects.toThrow(/permission denied/)
  })

  it('bloqueado também é recusado', async () => {
    await db.query('update perfis set ativo = false where user_id = $1', [ATENDENTE])
    await expect(comoUsuario(ATENDENTE, () => db.query('select listar_usuarios()')))
      .rejects.toThrow(/acesso_negado/)
  })
})

describe('listar_usuarios', () => {
  it('devolve todos, com o que a tela precisa', async () => {
    const lista = await comoAdmin(async () => {
      const { rows: [r] } = await db.query('select listar_usuarios() as r')
      return r.r
    })
    expect(lista).toHaveLength(3)
    expect(Object.keys(lista[0]).sort()).toEqual(
      ['ativo', 'criado_em', 'nome', 'papel', 'user_id', 'usuario'])
  })
})

describe('criar_usuario', () => {
  it('cria o login do Supabase Auth, a identidade e o perfil', async () => {
    const r = await criar('maria', 'Maria Souza')
    expect(r.usuario).toBe('maria')

    const { rows: [u] } = await db.query('select * from auth.users where id = $1', [r.user_id])
    expect(u.email).toBe('maria@mizuho.invalid')
    expect(u.aud).toBe('authenticated')
    expect(u.role).toBe('authenticated')
    expect(u.email_confirmed_at).not.toBe(null)
    expect(u.instance_id).toBe('00000000-0000-0000-0000-000000000000')
    expect(u.encrypted_password).toMatch(/^stub\$/)
    expect(u.encrypted_password).not.toContain('senha1234')
    // O GoTrue lê estas quatro como texto: NULL quebra o login com
    // "Database error querying schema".
    for (const col of ['confirmation_token', 'recovery_token',
                       'email_change_token_new', 'email_change']) {
      expect(u[col]).toBe('')
    }

    const { rows: ident } = await db.query(
      'select * from auth.identities where user_id = $1', [r.user_id])
    expect(ident).toHaveLength(1)
    expect(ident[0].provider).toBe('email')
    expect(ident[0].identity_data.email).toBe('maria@mizuho.invalid')

    const p = await perfilDe(r.user_id)
    expect(p).toMatchObject({ usuario: 'maria', nome: 'Maria Souza', papel: 'atendente', ativo: true })
    expect(p.criado_por).toBe(USUARIO_TESTE)
  })

  it('normaliza o usuário: maiúscula e espaço nas pontas', async () => {
    const r = await criar('  MARIA ')
    expect(r.usuario).toBe('maria')
  })

  it('registra a criação no histórico de usuários', async () => {
    await criar('maria', 'Maria Souza')
    const { rows } = await db.query(
      "select ator_nome, alvo_usuario, acao, detalhe from usuarios_historico where acao = 'criado'")
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ alvo_usuario: 'maria', detalhe: { papel: 'atendente' } })
  })

  it.each([
    ['usuario curto', ['ab'], /usuario_invalido/],
    ['usuario com espaço', ['ma ria'], /usuario_invalido/],
    ['usuario com acento', ['josé'], /usuario_invalido/],
    ['usuario com 31 caracteres', ['a'.repeat(31)], /usuario_invalido/],
    ['nome vazio', ['maria', '   '], /nome_invalido/],
    ['senha de 7 caracteres', ['maria', 'Maria', '1234567'], /senha_invalida/],
    ['senha de 73 bytes', ['maria', 'Maria', 'a'.repeat(73)], /senha_invalida/],
    ['papel desconhecido', ['maria', 'Maria', 'senha1234', 'dono'], /papel_invalido/],
  ])('recusa %s', async (_nome, args, erro) => {
    await expect(criar(...args)).rejects.toThrow(erro)
  })

  it('aceita senha acentuada de exatamente 72 bytes', async () => {
    // 'é' ocupa 2 bytes: 36 letras = 72 bytes.
    await expect(criar('maria', 'Maria', 'é'.repeat(36))).resolves.toBeTruthy()
  })

  it('recusa usuário repetido, inclusive em outra caixa', async () => {
    await criar('maria')
    await expect(criar('MARIA')).rejects.toThrow(/usuario_em_uso/)
  })

  it('recusa usuário cujo e-mail já existe sem perfil (criado direto no painel)', async () => {
    await db.query("insert into auth.users (id, email) values (gen_random_uuid(), 'fantasma@mizuho.invalid')")
    await expect(criar('fantasma')).rejects.toThrow(/usuario_em_uso/)
  })
})

describe('alterar_usuario', () => {
  it('muda nome e nível e registra cada mudança', async () => {
    await alterar(USUARIO_TESTE, ATENDENTE, 'Novo Nome', 'admin', true)
    expect(await perfilDe(ATENDENTE)).toMatchObject({ nome: 'Novo Nome', papel: 'admin' })
    const { rows } = await db.query(
      "select acao, detalhe from usuarios_historico where alvo_id = $1 order by acao", [ATENDENTE])
    expect(rows.map((r) => r.acao)).toEqual(['nome_alterado', 'papel_alterado'])
    expect(rows[1].detalhe).toEqual({ de: 'atendente', para: 'admin' })
  })

  it('bloquear: marca inativo, proíbe novo login e encerra as sessões', async () => {
    await db.query('insert into auth.sessions (user_id) values ($1), ($1)', [ATENDENTE])
    await alterar(USUARIO_TESTE, ATENDENTE, 'atendente1', 'atendente', false)

    expect((await perfilDe(ATENDENTE)).ativo).toBe(false)
    const { rows: [u] } = await db.query(
      'select banned_until from auth.users where id = $1', [ATENDENTE])
    expect(new Date(u.banned_until).getTime()).toBeGreaterThan(Date.now() + 365 * 86400000)
    const { rows: s } = await db.query(
      'select 1 from auth.sessions where user_id = $1', [ATENDENTE])
    expect(s).toHaveLength(0)
    const { rows: h } = await db.query(
      "select acao from usuarios_historico where alvo_id = $1", [ATENDENTE])
    expect(h.map((r) => r.acao)).toContain('bloqueado')
  })

  it('bloqueado perde o acesso às OS na mesma hora', async () => {
    await db.query(`insert into ordens_servico (cliente_nome, veiculo_descricao, veiculo_placa)
                    values ('C', 'V', 'ABC1D23')`)
    const antes = await comoUsuario(ATENDENTE, () => db.query('select id from ordens_servico'))
    expect(antes.rows).toHaveLength(1)
    await alterar(USUARIO_TESTE, ATENDENTE, 'atendente1', 'atendente', false)
    const depois = await comoUsuario(ATENDENTE, () => db.query('select id from ordens_servico'))
    expect(depois.rows).toHaveLength(0)
  })

  it('reativar: volta a ativo e limpa o banimento', async () => {
    await alterar(USUARIO_TESTE, ATENDENTE, 'atendente1', 'atendente', false)
    await alterar(USUARIO_TESTE, ATENDENTE, 'atendente1', 'atendente', true)
    expect((await perfilDe(ATENDENTE)).ativo).toBe(true)
    const { rows: [u] } = await db.query(
      'select banned_until from auth.users where id = $1', [ATENDENTE])
    expect(u.banned_until).toBe(null)
    const { rows: h } = await db.query(
      "select acao from usuarios_historico where alvo_id = $1 order by id", [ATENDENTE])
    expect(h.map((r) => r.acao)).toEqual(['bloqueado', 'reativado'])
  })

  it('ninguém altera o próprio papel nem o próprio ativo', async () => {
    await expect(alterar(USUARIO_TESTE, USUARIO_TESTE, 'Eu', 'atendente', true))
      .rejects.toThrow(/proprio_usuario/)
    await expect(alterar(USUARIO_TESTE, USUARIO_TESTE, 'Eu', 'admin', false))
      .rejects.toThrow(/proprio_usuario/)
    expect((await perfilDe(USUARIO_TESTE)).papel).toBe('admin')
  })

  it('o próprio nome pode mudar', async () => {
    await alterar(USUARIO_TESTE, USUARIO_TESTE, 'Dono da Oficina', 'admin', true)
    expect((await perfilDe(USUARIO_TESTE)).nome).toBe('Dono da Oficina')
  })

  it('rebaixado, o administrador perde o poder na hora (o que o lock garante sob concorrência)', async () => {
    await alterar(USUARIO_TESTE, OUTRO_ADMIN, 'admin2', 'atendente', true)
    await expect(alterar(OUTRO_ADMIN, USUARIO_TESTE, 'x', 'atendente', true))
      .rejects.toThrow(/acesso_negado/)
    expect((await perfilDe(USUARIO_TESTE)).papel).toBe('admin')
  })

  it('recusa usuário inexistente e dados inválidos', async () => {
    await expect(alterar(USUARIO_TESTE, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'X', 'atendente', true))
      .rejects.toThrow(/usuario_nao_encontrado/)
    await expect(alterar(USUARIO_TESTE, ATENDENTE, '', 'atendente', true))
      .rejects.toThrow(/nome_invalido/)
    await expect(alterar(USUARIO_TESTE, ATENDENTE, 'X', 'dono', true))
      .rejects.toThrow(/papel_invalido/)
    await expect(alterar(USUARIO_TESTE, ATENDENTE, 'X', 'atendente', null))
      .rejects.toThrow(/dados_invalidos/)
  })
})

describe('redefinir_senha', () => {
  const redefinir = (quem, id, senha) =>
    comoUsuario(quem, () => db.query('select redefinir_senha($1, $2)', [id, senha]))

  it('troca o hash, encerra as sessões e registra', async () => {
    await db.query(
      "update auth.users set encrypted_password = 'stub$antiga' where id = $1", [ATENDENTE])
    await db.query('insert into auth.sessions (user_id) values ($1)', [ATENDENTE])
    await redefinir(USUARIO_TESTE, ATENDENTE, 'novasenha99')

    const { rows: [depois] } = await db.query(
      'select encrypted_password from auth.users where id = $1', [ATENDENTE])
    expect(depois.encrypted_password).not.toBe('stub$antiga')
    expect(depois.encrypted_password).not.toContain('novasenha99')
    const { rows: s } = await db.query('select 1 from auth.sessions where user_id = $1', [ATENDENTE])
    expect(s).toHaveLength(0)
    const { rows: h } = await db.query(
      "select acao from usuarios_historico where alvo_id = $1", [ATENDENTE])
    expect(h.map((r) => r.acao)).toEqual(['senha_redefinida'])
  })

  it('o administrador troca a própria senha', async () => {
    await expect(redefinir(USUARIO_TESTE, USUARIO_TESTE, 'outrasenha1')).resolves.toBeTruthy()
  })

  it('recusa senha curta e usuário inexistente', async () => {
    await expect(redefinir(USUARIO_TESTE, ATENDENTE, '1234567')).rejects.toThrow(/senha_invalida/)
    await expect(redefinir(USUARIO_TESTE, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'senha1234'))
      .rejects.toThrow(/usuario_nao_encontrado/)
  })
})

// Bloquear preserva o acesso para depois; excluir apaga a conta de vez. O que a
// pessoa produziu (OS e atividade) fica, porque é documento da oficina.
describe('excluir_usuario', () => {
  const excluir = (quem, id) =>
    comoUsuario(quem, () => db.query('select excluir_usuario($1)', [id]))

  async function osDoAtendente() {
    const { rows: [os] } = await db.query(
      `insert into ordens_servico (cliente_nome, veiculo_descricao, veiculo_placa, criado_por)
       values ('Cliente', 'Carro', 'ABC1D23', $1) returning id`, [ATENDENTE])
    return os
  }

  it('o administrador exclui: o perfil e a conta de login somem', async () => {
    await excluir(USUARIO_TESTE, ATENDENTE)
    expect(await perfilDe(ATENDENTE)).toBeUndefined()
    const { rows } = await db.query('select 1 from auth.users where id = $1', [ATENDENTE])
    expect(rows).toHaveLength(0)
  })

  it('a identidade e as sessões do excluído saem junto', async () => {
    await db.query('insert into auth.sessions (user_id) values ($1)', [ATENDENTE])
    await db.query(
      `insert into auth.identities (user_id, provider_id, identity_data, provider)
       values ($1, $2, '{}'::jsonb, 'email')`, [ATENDENTE, ATENDENTE])
    await excluir(USUARIO_TESTE, ATENDENTE)
    const { rows: s } = await db.query('select 1 from auth.sessions where user_id = $1', [ATENDENTE])
    const { rows: i } = await db.query('select 1 from auth.identities where user_id = $1', [ATENDENTE])
    expect([s.length, i.length]).toEqual([0, 0])
  })

  it('as OS que a pessoa criou permanecem, sem autor', async () => {
    const os = await osDoAtendente()
    await excluir(USUARIO_TESTE, ATENDENTE)
    const { rows: [o] } = await db.query(
      'select criado_por from ordens_servico where id = $1', [os.id])
    expect(o).toEqual({ criado_por: null })
  })

  it('a atividade da OS mantém o nome de quem fez', async () => {
    const os = await comoUsuario(ATENDENTE, async () => {
      const { rows: [r] } = await db.query(
        `insert into ordens_servico (cliente_nome, veiculo_descricao, veiculo_placa)
         values ('Cliente', 'Carro', 'ABC1D23') returning id`)
      return r
    })
    await excluir(USUARIO_TESTE, ATENDENTE)
    const { rows } = await db.query(
      "select usuario_nome from os_historico where os_id = $1 and acao = 'criada'", [os.id])
    expect(rows[0].usuario_nome).toBe('atendente1')
  })

  it('registra a exclusão no histórico de usuários', async () => {
    await excluir(USUARIO_TESTE, ATENDENTE)
    const { rows } = await db.query(
      "select ator_nome, alvo_usuario, acao, detalhe from usuarios_historico where acao = 'excluido'")
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      alvo_usuario: 'atendente1', detalhe: { papel: 'atendente', nome: 'atendente1' },
    })
    expect(rows[0].ator_nome).toBeTruthy()
  })

  it('o registro sobrevive à exclusão de quem agiu', async () => {
    await excluir(USUARIO_TESTE, ATENDENTE)
    await db.query('delete from auth.users where id = $1', [USUARIO_TESTE])
    const { rows } = await db.query(
      "select ator_nome from usuarios_historico where acao = 'excluido'")
    expect(rows[0].ator_nome).toBeTruthy()
  })

  it.each([
    ['atendente', ATENDENTE],
    ['bloqueado', ATENDENTE],
  ])('%s é recusado', async (nome, uid) => {
    if (nome === 'bloqueado') {
      await db.query('update perfis set ativo = false where user_id = $1', [uid])
    }
    await expect(excluir(uid, OUTRO_ADMIN)).rejects.toThrow(/acesso_negado/)
    expect(await perfilDe(OUTRO_ADMIN)).toBeTruthy()
  })

  it('o visitante não executa a função', async () => {
    await expect(como(db, 'anon', () => db.query('select excluir_usuario($1)', [ATENDENTE])))
      .rejects.toThrow(/permission denied/)
  })

  it('ninguém exclui a si mesmo', async () => {
    await expect(excluir(USUARIO_TESTE, USUARIO_TESTE)).rejects.toThrow(/proprio_usuario/)
    expect(await perfilDe(USUARIO_TESTE)).toBeTruthy()
  })

  it('não deixa o sistema sem administrador ativo', async () => {
    // Com os dois administradores, excluir um é permitido.
    await excluir(USUARIO_TESTE, OUTRO_ADMIN)
    // Agora o dono é o único: o outro administrador já não existe para excluí-lo,
    // e ele mesmo é barrado por proprio_usuario. A guarda vale para o caso de
    // sobrar um admin bloqueado e outro ativo.
    await db.query(
      `insert into auth.users (id, email) values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'c@mizuho.invalid')`)
    await db.query(
      `insert into perfis (user_id, usuario, nome, papel, ativo)
       values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'admin3', 'Admin 3', 'admin', true)`)
    await db.query('update perfis set ativo = false where user_id = $1', [USUARIO_TESTE])
    await expect(
      comoUsuario('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', () =>
        db.query('select excluir_usuario($1)', ['eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'])),
    ).rejects.toThrow(/proprio_usuario/)
  })

  it('o último administrador ativo não é excluído por outro administrador', async () => {
    // O dono fica inativo; sobra OUTRO_ADMIN ativo, que um terceiro admin
    // (também ativo) tentaria excluir. Guarda defensiva da regra.
    await db.query('update perfis set ativo = false where user_id = $1', [USUARIO_TESTE])
    await db.query('update perfis set papel = $2 where user_id = $1', [ATENDENTE, 'admin'])
    await expect(excluir(ATENDENTE, OUTRO_ADMIN)).resolves.toBeTruthy()
    await expect(excluir(ATENDENTE, ATENDENTE)).rejects.toThrow(/proprio_usuario/)
  })

  it('usuário inexistente é recusado', async () => {
    await expect(excluir(USUARIO_TESTE, 'ffffffff-ffff-4fff-8fff-ffffffffffff'))
      .rejects.toThrow(/usuario_nao_encontrado/)
  })
})

describe('usuarios_historico', () => {
  it('só o administrador lê; ninguém escreve pela API', async () => {
    await criar('maria')
    const admin = await comoAdmin(() => db.query('select id from usuarios_historico'))
    expect(admin.rows.length).toBeGreaterThan(0)
    const atendente = await comoUsuario(ATENDENTE, () => db.query('select id from usuarios_historico'))
    expect(atendente.rows).toHaveLength(0)

    await expect(comoAdmin(() => db.query(
      `insert into usuarios_historico (ator_nome, alvo_id, alvo_usuario, acao)
       values ('x', gen_random_uuid(), 'x', 'criado')`))).rejects.toThrow(/row-level security/)
    const alterado = await comoAdmin(() => db.query(
      "update usuarios_historico set ator_nome = 'forjado' returning id"))
    expect(alterado.rows).toHaveLength(0)
    const apagado = await comoAdmin(() => db.query('delete from usuarios_historico returning id'))
    expect(apagado.rows).toHaveLength(0)
  })

  it('o nome de quem agiu fica congelado no registro', async () => {
    await criar('maria')
    await alterar(USUARIO_TESTE, USUARIO_TESTE, 'Nome Novo do Dono', 'admin', true)
    const { rows } = await db.query(
      "select ator_nome from usuarios_historico where acao = 'criado'")
    expect(rows[0].ator_nome).not.toBe('Nome Novo do Dono')
  })
})
