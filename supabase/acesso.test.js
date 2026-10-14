import { describe, it, expect, beforeEach } from 'vitest'
import {
  criarBanco, como, criarOS, aplicarMigration, USUARIO_TESTE,
} from './banco-de-teste.js'

const ATENDENTE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const BLOQUEADO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const SEM_PERFIL = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

let db

// Cria o usuário em auth.users e, se `perfil` vier, o perfil (como dono, o que
// a API não permite a ninguém).
async function novoUsuario(id, perfil) {
  await db.query('insert into auth.users (id, email) values ($1, $2)',
    [id, `${id.slice(0, 8)}@mizuho.invalid`])
  if (!perfil) return
  await db.query(
    `insert into perfis (user_id, usuario, nome, papel, ativo)
     values ($1, $2, $3, $4, $5)`,
    [id, `u${id.slice(0, 6)}`, `Nome ${id.slice(0, 4)}`, perfil.papel, perfil.ativo ?? true])
}

const comoUsuario = (uid, fn) => como(db, 'authenticated', fn, uid)

const NOVA_OS = `insert into ordens_servico
  (cliente_nome, veiculo_descricao, veiculo_placa)
  values ('Cliente', 'Carro', 'ABC1D23') returning id`

beforeEach(async () => {
  db = await criarBanco()
  await novoUsuario(ATENDENTE, { papel: 'atendente' })
  await novoUsuario(BLOQUEADO, { papel: 'atendente', ativo: false })
  await novoUsuario(SEM_PERFIL, null)
})

describe('quem é quem', () => {
  it('o primeiro usuário de um projeto novo vira administrador', async () => {
    const { rows } = await db.query(
      'select papel, ativo from perfis where user_id = $1', [USUARIO_TESTE])
    expect(rows).toEqual([{ papel: 'admin', ativo: true }])
  })

  it('usuário criado depois, direto no painel, fica sem perfil e sem acesso', async () => {
    const { rows } = await db.query('select 1 from perfis where user_id = $1', [SEM_PERFIL])
    expect(rows).toHaveLength(0)
    const r = await comoUsuario(SEM_PERFIL, () => db.query('select usuario_ativo() as a'))
    expect(r.rows[0].a).toBe(false)
  })

  it('usuario_ativo e usuario_admin refletem o perfil', async () => {
    const ler = (uid) => comoUsuario(uid, async () => {
      const { rows: [r] } = await db.query(
        'select usuario_ativo() as ativo, usuario_admin() as admin')
      return r
    })
    expect(await ler(USUARIO_TESTE)).toEqual({ ativo: true, admin: true })
    expect(await ler(ATENDENTE)).toEqual({ ativo: true, admin: false })
    expect(await ler(BLOQUEADO)).toEqual({ ativo: false, admin: false })
    expect(await ler(SEM_PERFIL)).toEqual({ ativo: false, admin: false })
  })
})

describe('OS: só usuário ativo', () => {
  it('atendente cria e lê OS', async () => {
    await comoUsuario(ATENDENTE, () => db.query(NOVA_OS))
    const r = await comoUsuario(ATENDENTE, () => db.query('select id from ordens_servico'))
    expect(r.rows).toHaveLength(1)
  })

  it('usuário sem perfil não lê nem cria OS', async () => {
    await criarOS(db)
    const lido = await comoUsuario(SEM_PERFIL, () => db.query('select id from ordens_servico'))
    expect(lido.rows).toHaveLength(0)
    await expect(comoUsuario(SEM_PERFIL, () => db.query(NOVA_OS)))
      .rejects.toThrow(/row-level security/)
  })

  it('usuário bloqueado não lê nem altera OS', async () => {
    const os = await criarOS(db)
    const lido = await comoUsuario(BLOQUEADO, () => db.query('select id from ordens_servico'))
    expect(lido.rows).toHaveLength(0)
    const alterado = await comoUsuario(BLOQUEADO, () => db.query(
      "update ordens_servico set cliente_nome = 'Invasor' where id = $1 returning id", [os.id]))
    expect(alterado.rows).toHaveLength(0)
    const { rows: [o] } = await db.query(
      'select cliente_nome from ordens_servico where id = $1', [os.id])
    expect(o.cliente_nome).toBe('Cliente Teste')
  })

  it('visitante continua sem ler OS', async () => {
    await criarOS(db)
    const r = await como(db, 'anon', () => db.query('select id from ordens_servico'))
    expect(r.rows).toHaveLength(0)
  })
})

// O bloqueio vale também por funções, que não passam pelo RLS da mesma forma.
describe('funções: usuário bloqueado e atendente', () => {
  it('bloqueado não gera link de assinatura', async () => {
    const os = await criarOS(db)
    await expect(comoUsuario(BLOQUEADO, () =>
      db.query('select gerar_link_assinatura($1, false)', [os.id])))
      .rejects.toThrow(/acesso_negado/)
  })

  it('usuário ativo gera link de assinatura', async () => {
    const os = await criarOS(db)
    const r = await comoUsuario(ATENDENTE, () =>
      db.query('select gerar_link_assinatura($1, false) as r', [os.id]))
    expect(r.rows[0].r.codigo).toHaveLength(64)
  })

  it('bloqueado não cancela OS: ela não existe para ele', async () => {
    const os = await criarOS(db)
    await expect(comoUsuario(BLOQUEADO, () =>
      db.query('select cancelar_os($1)', [os.id]))).rejects.toThrow(/nao encontrada/)
    const { rows: [o] } = await db.query(
      'select status from ordens_servico where id = $1', [os.id])
    expect(o.status).toBe('orcamento')
  })

  it('bloqueado não substitui itens', async () => {
    const os = await criarOS(db)
    await expect(comoUsuario(BLOQUEADO, () =>
      db.query('select substituir_itens($1, $2::jsonb)', [os.id, '[]'])))
      .rejects.toThrow(/nao encontrada/)
  })

  it('atendente não define a numeração; administrador define', async () => {
    await expect(comoUsuario(ATENDENTE, () =>
      db.query('select definir_proximo_numero($1)', [500]))).rejects.toThrow(/acesso_negado/)
    await comoUsuario(USUARIO_TESTE, () =>
      db.query('select definir_proximo_numero($1)', [500]))
    const os = await criarOS(db)
    expect(Number(os.numero)).toBe(500)
  })
})

describe('Ajustes: só administrador', () => {
  it('atendente lê mas não altera as configurações', async () => {
    const lido = await comoUsuario(ATENDENTE, () =>
      db.query('select razao_social from configuracoes where id = 1'))
    expect(lido.rows).toHaveLength(1)
    const r = await comoUsuario(ATENDENTE, () => db.query(
      "update configuracoes set razao_social = 'X' where id = 1 returning id"))
    expect(r.rows).toHaveLength(0)
    const { rows: [c] } = await db.query('select razao_social from configuracoes where id = 1')
    expect(c.razao_social).toBe('Auto Elétrica MIZUHO II Ltda. - ME')
  })

  it('administrador altera as configurações', async () => {
    const r = await comoUsuario(USUARIO_TESTE, () => db.query(
      "update configuracoes set telefone = '11 0000-0000' where id = 1 returning id"))
    expect(r.rows).toHaveLength(1)
  })
})

describe('perfis: leitura limitada e nenhuma escrita direta', () => {
  it('atendente vê só o próprio perfil; administrador vê todos; visitante nenhum', async () => {
    const atendente = await comoUsuario(ATENDENTE, () => db.query('select user_id from perfis'))
    expect(atendente.rows.map((r) => r.user_id)).toEqual([ATENDENTE])
    const admin = await comoUsuario(USUARIO_TESTE, () => db.query('select user_id from perfis'))
    expect(admin.rows).toHaveLength(3)
    const visitante = await como(db, 'anon', () => db.query('select user_id from perfis'))
    expect(visitante.rows).toHaveLength(0)
  })

  it('o bloqueado ainda lê o próprio perfil (a tela precisa saber que foi bloqueado)', async () => {
    const r = await comoUsuario(BLOQUEADO, () => db.query('select ativo from perfis'))
    expect(r.rows).toEqual([{ ativo: false }])
  })

  it('ninguém se promove pela API', async () => {
    const r = await comoUsuario(ATENDENTE, () => db.query(
      "update perfis set papel = 'admin' where user_id = $1 returning user_id", [ATENDENTE]))
    expect(r.rows).toHaveLength(0)
    await expect(comoUsuario(ATENDENTE, () => db.query(
      `insert into perfis (user_id, usuario, nome, papel) values ($1, 'novo', 'Novo', 'admin')`,
      [SEM_PERFIL]))).rejects.toThrow(/row-level security/)
  })
})

describe('quem já usava o sistema antes da atualização', () => {
  it('vira administrador, com usuário tirado do e-mail e sem colisão', async () => {
    const antigo = await criarBanco({ ate: '0007' })
    await antigo.query(`
      insert into auth.users (id, email, created_at) values
        ('21111111-1111-4111-8111-111111111111', 'Maria.Silva@gmail.com', now() - interval '2 days'),
        ('22222222-2222-4222-8222-222222222222', 'maria.silva@outra.com',  now() - interval '1 day'),
        ('23333333-3333-4333-8333-333333333333', null,                     now())`)
    await aplicarMigration(antigo, '0008_perfis_e_acesso.sql')
    const { rows } = await antigo.query(
      'select usuario, papel, ativo from perfis order by usuario')
    expect(rows).toEqual([
      { usuario: 'maria.silva', papel: 'admin', ativo: true },
      { usuario: 'maria.silva.2222', papel: 'admin', ativo: true },
      { usuario: 'usuario', papel: 'admin', ativo: true },
    ])
  })

  it('a OS e o histórico de quem for apagado do painel permanecem', async () => {
    const os = await criarOS(db)
    await db.query('update ordens_servico set criado_por = $1 where id = $2', [ATENDENTE, os.id])
    await db.query('delete from auth.users where id = $1', [ATENDENTE])
    const { rows: [o] } = await db.query(
      'select criado_por from ordens_servico where id = $1', [os.id])
    expect(o.criado_por).toBe(null)
    const { rows: p } = await db.query('select 1 from perfis where user_id = $1', [ATENDENTE])
    expect(p).toHaveLength(0)
  })
})

describe('concessão', () => {
  it('as funções novas não ficam abertas ao visitante', async () => {
    for (const fn of ['usuario_ativo()', 'usuario_admin()']) {
      await expect(como(db, 'anon', () => db.query(`select ${fn}`)))
        .rejects.toThrow(/permission denied/)
    }
  })
})
