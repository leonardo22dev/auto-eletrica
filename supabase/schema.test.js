import { describe, it, expect, beforeEach } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS = join(AQUI, 'migrations')

// O Supabase traz prontos o schema `auth`, o schema `storage` e os papéis
// `authenticated` e `anon`. O PGlite é Postgres puro, então as migrations
// reais rodam sobre estes stubs — eles existem só para que as referências
// e as políticas resolvam, e não são testados aqui.
const STUBS_DO_SUPABASE = `
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

async function criarBanco() {
  const db = await new PGlite()
  await db.exec(STUBS_DO_SUPABASE)
  const arquivos = readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql')).sort()
  for (const nome of arquivos) {
    await db.exec(readFileSync(join(MIGRATIONS, nome), 'utf8'))
  }
  return db
}

async function semearClienteEVeiculo(db) {
  const { rows: [cliente] } = await db.query(
    `insert into clientes (nome, telefone) values ('Cliente Teste', '11988887777')
     returning id`,
  )
  const { rows: [veiculo] } = await db.query(
    `insert into veiculos (cliente_id, placa, marca, modelo)
     values ($1, 'ABC1D23', 'GM', 'Chevette') returning id`,
    [cliente.id],
  )
  return { clienteId: cliente.id, veiculoId: veiculo.id }
}

async function criarOS(db, { clienteId, veiculoId }) {
  const { rows: [os] } = await db.query(
    `insert into ordens_servico (cliente_id, veiculo_id, cliente_nome,
                                 veiculo_descricao, veiculo_placa)
     values ($1, $2, 'Cliente Teste', 'GM Chevette', 'ABC1D23')
     returning id, numero`,
    [clienteId, veiculoId],
  )
  return os
}

async function adicionarItem(db, osId, posicao, descricao, centavos) {
  await db.query(
    `insert into os_itens (os_id, posicao, quantidade, descricao,
                           valor_unitario_centavos, valor_total_centavos)
     values ($1, $2, 1, $3, $4, $4)`,
    [osId, posicao, descricao, centavos],
  )
}

async function totalDaOS(db, osId) {
  const { rows } = await db.query(
    'select total_centavos from ordens_servico where id = $1', [osId],
  )
  return rows[0].total_centavos
}

let db
let semente

beforeEach(async () => {
  db = await criarBanco()
  semente = await semearClienteEVeiculo(db)
})

describe('migrations', () => {
  it('aplicam as quatro sem erro e semeiam a configuração da Mizuho', async () => {
    const { rows } = await db.query('select * from configuracoes where id = 1')
    expect(rows).toHaveLength(1)
    expect(rows[0].razao_social).toBe('Auto Elétrica MIZUHO II Ltda. - ME')
    expect(rows[0].cnpj).toBe('03.053.178/0001-99')
    expect(rows[0].garantia_meses).toBe(3)
    expect(rows[0].servicos_cabecalho).toContain('INJEÇÃO ELETRÔNICA')
  })

  it('cria o bucket público dos PDFs', async () => {
    const { rows } = await db.query(
      "select public from storage.buckets where id = 'os-pdfs'",
    )
    expect(rows[0].public).toBe(true)
  })
})

describe('trigger do total', () => {
  it('OS sem item nasce com total zero', async () => {
    const os = await criarOS(db, semente)
    expect(await totalDaOS(db, os.id)).toBe(0)
  })

  it('recalcula ao inserir itens', async () => {
    const os = await criarOS(db, semente)
    await adicionarItem(db, os.id, 1, 'Alternador', 38000)
    await adicionarItem(db, os.id, 2, 'Correia', 10000)
    expect(await totalDaOS(db, os.id)).toBe(48000)
  })

  it('recalcula ao remover item', async () => {
    const os = await criarOS(db, semente)
    await adicionarItem(db, os.id, 1, 'Alternador', 38000)
    await adicionarItem(db, os.id, 2, 'Correia', 10000)
    await db.query('delete from os_itens where os_id = $1 and posicao = 2', [os.id])
    expect(await totalDaOS(db, os.id)).toBe(38000)
  })

  it('volta a zero quando todos os itens saem', async () => {
    const os = await criarOS(db, semente)
    await adicionarItem(db, os.id, 1, 'Alternador', 38000)
    await db.query('delete from os_itens where os_id = $1', [os.id])
    expect(await totalDaOS(db, os.id)).toBe(0)
  })
})

describe('numeração', () => {
  it('é sequencial', async () => {
    const a = await criarOS(db, semente)
    const b = await criarOS(db, semente)
    expect(Number(b.numero)).toBe(Number(a.numero) + 1)
  })

  it('definir_proximo_numero manda a próxima OS para o número escolhido', async () => {
    await db.query('select definir_proximo_numero($1)', [1042])
    const os = await criarOS(db, semente)
    expect(Number(os.numero)).toBe(1042)
  })

  it('definir_proximo_numero recusa número já usado', async () => {
    const os = await criarOS(db, semente)
    await expect(
      db.query('select definir_proximo_numero($1)', [Number(os.numero)]),
    ).rejects.toThrow(/Ja existe OS com numero maior ou igual/)
  })
})

describe('cancelar_os', () => {
  it('devolve o número quando a OS cancelada é a última', async () => {
    const a = await criarOS(db, semente)
    const b = await criarOS(db, semente)

    const { rows } = await db.query('select cancelar_os($1) as devolveu', [b.id])
    expect(rows[0].devolveu).toBe(true)

    const { rows: depois } = await db.query(
      'select numero, status from ordens_servico where id = $1', [b.id],
    )
    expect(depois[0].numero).toBe(null)
    expect(depois[0].status).toBe('cancelada')

    // A próxima OS nasce com o número devolvido.
    const c = await criarOS(db, semente)
    expect(Number(c.numero)).toBe(Number(b.numero))
    expect(Number(c.numero)).toBe(Number(a.numero) + 1)
  })

  it('não devolve nada ao cancelar uma OS antiga, que mantém o número', async () => {
    const a = await criarOS(db, semente)
    await criarOS(db, semente)

    const { rows } = await db.query('select cancelar_os($1) as devolveu', [a.id])
    expect(rows[0].devolveu).toBe(false)

    const { rows: depois } = await db.query(
      'select numero, status from ordens_servico where id = $1', [a.id],
    )
    expect(Number(depois[0].numero)).toBe(Number(a.numero))
    expect(depois[0].status).toBe('cancelada')
  })

  it('cancelar duas vezes não devolve número de novo', async () => {
    const os = await criarOS(db, semente)
    const primeira = await db.query('select cancelar_os($1) as devolveu', [os.id])
    expect(primeira.rows[0].devolveu).toBe(true)
    const segunda = await db.query('select cancelar_os($1) as devolveu', [os.id])
    expect(segunda.rows[0].devolveu).toBe(false)
  })

  // Dois cancelamentos seguidos é onde esse tipo de lógica costuma quebrar.
  it('devolve duas vezes seguidas quando se cancela a ponta duas vezes', async () => {
    const a = await criarOS(db, semente)
    const b = await criarOS(db, semente)
    const c = await criarOS(db, semente)

    expect((await db.query('select cancelar_os($1) as d', [c.id])).rows[0].d).toBe(true)
    expect((await db.query('select cancelar_os($1) as d', [b.id])).rows[0].d).toBe(true)

    const nova = await criarOS(db, semente)
    expect(Number(nova.numero)).toBe(Number(a.numero) + 1)
  })

  it('cancelar a primeiríssima OS deixa a numeração recomeçar do 1', async () => {
    const primeira = await criarOS(db, semente)
    expect(Number(primeira.numero)).toBe(1)

    const { rows } = await db.query('select cancelar_os($1) as d', [primeira.id])
    expect(rows[0].d).toBe(true)

    const nova = await criarOS(db, semente)
    expect(Number(nova.numero)).toBe(1)
  })

  it('reclama de OS inexistente', async () => {
    await expect(
      db.query('select cancelar_os($1)', ['00000000-0000-0000-0000-000000000000']),
    ).rejects.toThrow(/nao encontrada/)
  })
})

describe('substituir_itens', () => {
  it('troca o conjunto de itens e recalcula o total', async () => {
    const os = await criarOS(db, semente)
    await adicionarItem(db, os.id, 1, 'Alternador', 38000)
    await db.query('select substituir_itens($1, $2::jsonb)', [
      os.id,
      JSON.stringify([
        { posicao: 1, quantidade: 1, descricao: 'Bateria',
          valor_unitario_centavos: 32500, valor_total_centavos: 32500 },
        { posicao: 2, quantidade: 2, descricao: 'Lâmpada',
          valor_unitario_centavos: 1500, valor_total_centavos: 3000 },
      ]),
    ])
    expect(await totalDaOS(db, os.id)).toBe(35500)
    const { rows } = await db.query(
      'select descricao from os_itens where os_id = $1 order by posicao', [os.id])
    expect(rows.map((r) => r.descricao)).toEqual(['Bateria', 'Lâmpada'])
  })

  it('aceita lista vazia, zerando a OS', async () => {
    const os = await criarOS(db, semente)
    await adicionarItem(db, os.id, 1, 'Alternador', 38000)
    await db.query("select substituir_itens($1, '[]'::jsonb)", [os.id])
    expect(await totalDaOS(db, os.id)).toBe(0)
  })

  // O ponto da função existir: antes eram duas requisições HTTP, logo duas
  // transações. Se a inserção falhasse depois do delete, a OS ficava sem
  // nenhum item e com total zero — documento emitido destruído.
  it('não perde os itens antigos quando os novos são recusados', async () => {
    const os = await criarOS(db, semente)
    await adicionarItem(db, os.id, 1, 'Alternador', 38000)

    await expect(
      db.query('select substituir_itens($1, $2::jsonb)', [
        os.id,
        JSON.stringify([
          { posicao: 1, quantidade: 1, descricao: 'Inválido',
            valor_unitario_centavos: -500, valor_total_centavos: -500 },
        ]),
      ]),
    ).rejects.toThrow()

    const { rows } = await db.query(
      'select descricao from os_itens where os_id = $1', [os.id])
    expect(rows.map((r) => r.descricao)).toEqual(['Alternador'])
    expect(await totalDaOS(db, os.id)).toBe(38000)
  })

  it('reclama de OS inexistente', async () => {
    await expect(
      db.query("select substituir_itens($1, '[]'::jsonb)",
        ['00000000-0000-0000-0000-000000000000']),
    ).rejects.toThrow(/nao encontrada/)
  })
})

describe('data de abertura', () => {
  // O Supabase roda com TimeZone = UTC. Com `current_date`, uma OS aberta às
  // 21h30 de 12/08 em São Paulo nasceria datada de 13/08 e o documento sairia
  // com a data errada.
  // O valor só divergiria entre 21h e meia-noite, então checar o valor
  // passaria na maior parte do dia mesmo com o bug. O que precisa ser
  // verificado é a regra: o default tem de citar o fuso de São Paulo.
  it('tem default ancorado no fuso de São Paulo, não no do servidor', async () => {
    const { rows } = await db.query(`
      select pg_get_expr(d.adbin, d.adrelid) as expressao
        from pg_attrdef d
        join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
       where d.adrelid = 'ordens_servico'::regclass and a.attname = 'data_abertura'`)
    expect(rows[0].expressao).toContain('America/Sao_Paulo')
    expect(rows[0].expressao).not.toContain('CURRENT_DATE')
  })

  it('grava a data de hoje em São Paulo mesmo com o servidor em UTC', async () => {
    await db.exec("set time zone 'UTC'")
    const { rows: [agora] } = await db.query(
      "select to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') as em_sp")
    const os = await criarOS(db, semente)
    const { rows } = await db.query(
      "select to_char(data_abertura, 'YYYY-MM-DD') as d from ordens_servico where id = $1",
      [os.id])
    expect(rows[0].d).toBe(agora.em_sp)
  })
})

describe('integridade dos cadastros', () => {
  it('recusa placa fora do formato normalizado', async () => {
    await expect(
      db.query('insert into veiculos (cliente_id, placa) values ($1, $2)',
        [semente.clienteId, 'abc-1234']),
    ).rejects.toThrow()
  })

  it('não deixa apagar cliente que tem veículo', async () => {
    await expect(
      db.query('delete from clientes where id = $1', [semente.clienteId]),
    ).rejects.toThrow()
  })

  it('não deixa apagar veículo que tem OS', async () => {
    await criarOS(db, semente)
    await expect(
      db.query('delete from veiculos where id = $1', [semente.veiculoId]),
    ).rejects.toThrow()
  })

  it('apagar a OS leva os itens junto', async () => {
    const os = await criarOS(db, semente)
    await adicionarItem(db, os.id, 1, 'Alternador', 38000)
    await db.query('delete from ordens_servico where id = $1', [os.id])
    const { rows } = await db.query('select count(*)::int as n from os_itens')
    expect(rows[0].n).toBe(0)
  })

  it('recusa item com quantidade zero ou valor negativo', async () => {
    const os = await criarOS(db, semente)
    await expect(
      db.query(
        `insert into os_itens (os_id, posicao, quantidade, descricao,
                               valor_unitario_centavos, valor_total_centavos)
         values ($1, 1, 0, 'Item', 100, 100)`, [os.id]),
    ).rejects.toThrow()
    await expect(
      db.query(
        `insert into os_itens (os_id, posicao, quantidade, descricao,
                               valor_unitario_centavos, valor_total_centavos)
         values ($1, 1, 1, 'Item', -100, -100)`, [os.id]),
    ).rejects.toThrow()
  })

  it('recusa status fora do ciclo', async () => {
    const os = await criarOS(db, semente)
    await expect(
      db.query("update ordens_servico set status = 'inventado' where id = $1", [os.id]),
    ).rejects.toThrow()
  })

  it('carimba atualizado_em ao alterar a OS', async () => {
    const os = await criarOS(db, semente)
    const { rows: antes } = await db.query(
      'select atualizado_em from ordens_servico where id = $1', [os.id])
    await db.query(
      "update ordens_servico set observacoes = 'nota' where id = $1", [os.id])
    const { rows: depois } = await db.query(
      'select atualizado_em from ordens_servico where id = $1', [os.id])
    expect(new Date(depois[0].atualizado_em).getTime())
      .toBeGreaterThanOrEqual(new Date(antes[0].atualizado_em).getTime())
  })
})
