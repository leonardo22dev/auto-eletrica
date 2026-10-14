import { describe, it, expect, beforeEach } from 'vitest'
import { criarBanco, como, criarOS, adicionarItem } from './banco-de-teste.js'

async function totalDaOS(db, osId) {
  const { rows } = await db.query(
    'select total_centavos from ordens_servico where id = $1', [osId],
  )
  return rows[0].total_centavos
}

let db

beforeEach(async () => {
  db = await criarBanco()
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
    const os = await criarOS(db)
    expect(await totalDaOS(db, os.id)).toBe(0)
  })

  it('recalcula ao inserir itens', async () => {
    const os = await criarOS(db)
    await adicionarItem(db, os.id, 1, 'Alternador', 38000)
    await adicionarItem(db, os.id, 2, 'Correia', 10000)
    expect(await totalDaOS(db, os.id)).toBe(48000)
  })

  it('recalcula ao remover item', async () => {
    const os = await criarOS(db)
    await adicionarItem(db, os.id, 1, 'Alternador', 38000)
    await adicionarItem(db, os.id, 2, 'Correia', 10000)
    await db.query('delete from os_itens where os_id = $1 and posicao = 2', [os.id])
    expect(await totalDaOS(db, os.id)).toBe(38000)
  })

  it('volta a zero quando todos os itens saem', async () => {
    const os = await criarOS(db)
    await adicionarItem(db, os.id, 1, 'Alternador', 38000)
    await db.query('delete from os_itens where os_id = $1', [os.id])
    expect(await totalDaOS(db, os.id)).toBe(0)
  })
})

describe('numeração', () => {
  it('é sequencial', async () => {
    const a = await criarOS(db)
    const b = await criarOS(db)
    expect(Number(b.numero)).toBe(Number(a.numero) + 1)
  })

  it('definir_proximo_numero manda a próxima OS para o número escolhido', async () => {
    await db.query('select definir_proximo_numero($1)', [1042])
    const os = await criarOS(db)
    expect(Number(os.numero)).toBe(1042)
  })

  it('definir_proximo_numero recusa número já usado', async () => {
    const os = await criarOS(db)
    await expect(
      db.query('select definir_proximo_numero($1)', [Number(os.numero)]),
    ).rejects.toThrow(/Ja existe OS com numero maior ou igual/)
  })
})

describe('cancelar_os', () => {
  it('devolve o número quando a OS cancelada é a última', async () => {
    const a = await criarOS(db)
    const b = await criarOS(db)

    const { rows } = await db.query('select cancelar_os($1) as devolveu', [b.id])
    expect(rows[0].devolveu).toBe(true)

    const { rows: depois } = await db.query(
      'select numero, status from ordens_servico where id = $1', [b.id],
    )
    expect(depois[0].numero).toBe(null)
    expect(depois[0].status).toBe('cancelada')

    // A próxima OS nasce com o número devolvido.
    const c = await criarOS(db)
    expect(Number(c.numero)).toBe(Number(b.numero))
    expect(Number(c.numero)).toBe(Number(a.numero) + 1)
  })

  it('não devolve nada ao cancelar uma OS antiga, que mantém o número', async () => {
    const a = await criarOS(db)
    await criarOS(db)

    const { rows } = await db.query('select cancelar_os($1) as devolveu', [a.id])
    expect(rows[0].devolveu).toBe(false)

    const { rows: depois } = await db.query(
      'select numero, status from ordens_servico where id = $1', [a.id],
    )
    expect(Number(depois[0].numero)).toBe(Number(a.numero))
    expect(depois[0].status).toBe('cancelada')
  })

  it('cancelar duas vezes não devolve número de novo', async () => {
    const os = await criarOS(db)
    const primeira = await db.query('select cancelar_os($1) as devolveu', [os.id])
    expect(primeira.rows[0].devolveu).toBe(true)
    const segunda = await db.query('select cancelar_os($1) as devolveu', [os.id])
    expect(segunda.rows[0].devolveu).toBe(false)
  })

  // Dois cancelamentos seguidos é onde esse tipo de lógica costuma quebrar.
  it('devolve duas vezes seguidas quando se cancela a ponta duas vezes', async () => {
    const a = await criarOS(db)
    const b = await criarOS(db)
    const c = await criarOS(db)

    expect((await db.query('select cancelar_os($1) as d', [c.id])).rows[0].d).toBe(true)
    expect((await db.query('select cancelar_os($1) as d', [b.id])).rows[0].d).toBe(true)

    const nova = await criarOS(db)
    expect(Number(nova.numero)).toBe(Number(a.numero) + 1)
  })

  it('cancelar a primeiríssima OS deixa a numeração recomeçar do 1', async () => {
    const primeira = await criarOS(db)
    expect(Number(primeira.numero)).toBe(1)

    const { rows } = await db.query('select cancelar_os($1) as d', [primeira.id])
    expect(rows[0].d).toBe(true)

    const nova = await criarOS(db)
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
    const os = await criarOS(db)
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
    const os = await criarOS(db)
    await adicionarItem(db, os.id, 1, 'Alternador', 38000)
    await db.query("select substituir_itens($1, '[]'::jsonb)", [os.id])
    expect(await totalDaOS(db, os.id)).toBe(0)
  })

  // O ponto da função existir: antes eram duas requisições HTTP, logo duas
  // transações. Se a inserção falhasse depois do delete, a OS ficava sem
  // nenhum item e com total zero — documento emitido destruído.
  it('não perde os itens antigos quando os novos são recusados', async () => {
    const os = await criarOS(db)
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

describe('data da OS', () => {
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
       where d.adrelid = 'ordens_servico'::regclass and a.attname = 'data_os'`)
    expect(rows[0].expressao).toContain('America/Sao_Paulo')
    expect(rows[0].expressao).not.toContain('CURRENT_DATE')
  })

  it('grava a data de hoje em São Paulo mesmo com o servidor em UTC', async () => {
    await db.exec("set time zone 'UTC'")
    const { rows: [agora] } = await db.query(
      "select to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') as em_sp")
    const os = await criarOS(db)
    const { rows } = await db.query(
      "select to_char(data_os, 'YYYY-MM-DD') as d from ordens_servico where id = $1",
      [os.id])
    expect(rows[0].d).toBe(agora.em_sp)
  })
})

describe('OS autossuficiente', () => {
  it('não existe mais tabela de cliente nem de veículo', async () => {
    await expect(db.query('select 1 from clientes')).rejects.toThrow()
    await expect(db.query('select 1 from veiculos')).rejects.toThrow()
  })

  it('cria OS sem nenhum cadastro por trás', async () => {
    const os = await criarOS(db)
    expect(os.numero).toBeTruthy()
    const { rows } = await db.query(
      'select cliente_nome, veiculo_placa from ordens_servico where id = $1', [os.id])
    expect(rows[0].cliente_nome).toBe('Cliente Teste')
    expect(rows[0].veiculo_placa).toBe('ABC1D23')
  })

  // Review Focus 5: segunda barreira, depois da validação no app.
  it('recusa nome em branco', async () => {
    await expect(criarOS(db, { cliente_nome: '   ' })).rejects.toThrow()
  })

  it('recusa veículo em branco', async () => {
    await expect(criarOS(db, { veiculo_descricao: '' })).rejects.toThrow()
  })

  it('recusa placa fora do formato normalizado', async () => {
    await expect(criarOS(db, { veiculo_placa: 'abc-1234' })).rejects.toThrow()
  })

  it('apagar a OS leva os itens junto', async () => {
    const os = await criarOS(db)
    await adicionarItem(db, os.id, 1, 'Alternador', 38000)
    await db.query('delete from ordens_servico where id = $1', [os.id])
    const { rows } = await db.query('select count(*)::int as n from os_itens')
    expect(rows[0].n).toBe(0)
  })

  it('recusa item com quantidade zero ou valor negativo', async () => {
    const os = await criarOS(db)
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
    const os = await criarOS(db)
    await expect(
      db.query("update ordens_servico set status = 'inventado' where id = $1", [os.id]),
    ).rejects.toThrow()
  })

  it('carimba atualizado_em ao alterar a OS', async () => {
    const os = await criarOS(db)
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

// ---------------------------------------------------------------------------
// Assinatura do cliente
// ---------------------------------------------------------------------------
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

// As colunas do aceite só mudam pelas funções, que rodam como dono. O teste
// também roda como dono (o administrador do painel), então pode montar estados
// que um usuário da API não conseguiria — como um link já vencido.
async function comoAdmin(db, sql) {
  await db.exec(sql)
}

// A trava vale para quem vem pela API. As tentativas de forja rodam como
// `authenticated`, que é o papel que o PostgREST e o GraphQL usam.
const comoLogado = (db, fn) => como(db, 'authenticated', fn)

// Bytes de um PNG com o cabeçalho IHDR pedido. O conteúdo depois dele não
// importa: o banco só confere a assinatura e as dimensões.
function pngComDimensoes(largura, altura) {
  const b = Buffer.alloc(33)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0)
  b.writeUInt32BE(13, 8)
  b.write('IHDR', 12)
  b.writeUInt32BE(largura, 16)
  b.writeUInt32BE(altura, 20)
  b[24] = 8
  b[25] = 6
  return `data:image/png;base64,${b.toString('base64')}`
}

async function osComItem(db, centavos = 48000) {
  const os = await criarOS(db)
  await adicionarItem(db, os.id, 1, 'Alternador', centavos)
  return os
}

async function gerarLink(db, osId, renovar = false) {
  const { rows: [r] } = await db.query(
    'select gerar_link_assinatura($1, $2) as r', [osId, renovar])
  return r.r
}

async function obter(db, codigo) {
  const { rows: [r] } = await db.query(
    'select obter_os_para_assinatura($1) as r', [codigo])
  return r.r
}

// A página manda a versão que o cliente viu. Sem `versao`, o teste a pega do
// que o link mostra agora, como a página faz ao abrir.
async function aceitar(db, codigo, total = 48000, desenho = PNG, versao) {
  const v = versao === undefined ? (await obter(db, codigo)).versao : versao
  const { rows: [r] } = await db.query(
    'select registrar_aceite($1, $2, $3, $4) as r', [codigo, desenho, total, v ?? null])
  return r.r
}

describe('gerar_link_assinatura', () => {
  it('cria um código de 64 caracteres hexadecimais e validade de 30 dias', async () => {
    const os = await osComItem(db)
    const l = await gerarLink(db, os.id)
    expect(l.codigo).toMatch(/^[0-9a-f]{64}$/)
    const dias = (new Date(l.expira_em) - Date.now()) / 86400000
    expect(dias).toBeGreaterThan(29.9)
    expect(dias).toBeLessThan(30.1)
  })

  it('devolve o mesmo código enquanto ele valer', async () => {
    const os = await osComItem(db)
    const a = await gerarLink(db, os.id)
    const b = await gerarLink(db, os.id)
    expect(b.codigo).toBe(a.codigo)
  })

  it('renovar troca o código e invalida o anterior', async () => {
    const os = await osComItem(db)
    const a = await gerarLink(db, os.id)
    const b = await gerarLink(db, os.id, true)
    expect(b.codigo).not.toBe(a.codigo)
    expect((await obter(db, a.codigo)).situacao).toBe('invalido')
    expect((await obter(db, b.codigo)).situacao).toBe('valido')
  })

  it('gera outro código quando o anterior venceu', async () => {
    const os = await osComItem(db)
    const a = await gerarLink(db, os.id)
    await comoAdmin(db, `update ordens_servico set assinatura_expira_em = now() - interval '1 day' where id = '${os.id}'`)
    const b = await gerarLink(db, os.id)
    expect(b.codigo).not.toBe(a.codigo)
  })

  it('recusa OS finalizada, cancelada e já assinada', async () => {
    for (const status of ['finalizada', 'cancelada']) {
      const os = await osComItem(db)
      await db.query('update ordens_servico set status = $1 where id = $2', [status, os.id])
      await expect(gerarLink(db, os.id)).rejects.toThrow(/status/)
    }
    const os = await osComItem(db)
    const l = await gerarLink(db, os.id)
    await aceitar(db, l.codigo)
    await expect(gerarLink(db, os.id)).rejects.toThrow(/ja_assinada/)
  })
})

describe('obter_os_para_assinatura', () => {
  it('entrega só a OS do código, sem telefone do cliente', async () => {
    const os = await osComItem(db)
    await osComItem(db, 9900)
    const { codigo } = await gerarLink(db, os.id)
    const r = await obter(db, codigo)
    expect(r.situacao).toBe('valido')
    expect(r.os.total_centavos).toBe(48000)
    expect(r.os.itens).toHaveLength(1)
    expect(r.os.cliente_nome).toBe('Cliente Teste')
    expect(JSON.stringify(r)).not.toContain('98888-7777')
    expect(r.oficina.razao_social).toContain('MIZUHO')
  })

  // Quem tenta códigos não pode aprender quais existem.
  it('responde igual para código inexistente e para link vencido', async () => {
    const os = await osComItem(db)
    const { codigo } = await gerarLink(db, os.id)
    await comoAdmin(db, `update ordens_servico set assinatura_expira_em = now() - interval '1 day' where id = '${os.id}'`)
    const vencido = await obter(db, codigo)
    const inexistente = await obter(db, 'a'.repeat(64))
    expect(vencido).toEqual(inexistente)
    expect(vencido).toEqual({ situacao: 'invalido' })
  })

  it('aguenta entrada nula, vazia e curta', async () => {
    for (const lixo of [null, '', 'abc']) {
      const { rows: [r] } = await db.query('select obter_os_para_assinatura($1) as r', [lixo])
      expect(r.r).toEqual({ situacao: 'invalido' })
    }
  })

  it('mostra cancelada e finalizada sem permitir aceite', async () => {
    for (const status of ['cancelada', 'finalizada']) {
      const os = await osComItem(db)
      const { codigo } = await gerarLink(db, os.id)
      await db.query('update ordens_servico set status = $1 where id = $2', [status, os.id])
      expect((await obter(db, codigo)).situacao).toBe(status)
    }
  })

  it('informa assinado, com a data do aceite', async () => {
    const os = await osComItem(db)
    const { codigo } = await gerarLink(db, os.id)
    await aceitar(db, codigo)
    const r = await obter(db, codigo)
    expect(r.situacao).toBe('assinado')
    expect(r.aceite_em).toBeTruthy()
  })
})

describe('registrar_aceite', () => {
  it('grava o aceite e leva Orçamento para Aprovada', async () => {
    const os = await osComItem(db)
    const { codigo } = await gerarLink(db, os.id)
    const r = await aceitar(db, codigo)
    expect(r.ok).toBe(true)

    const { rows: [o] } = await db.query(
      'select * from ordens_servico where id = $1', [os.id])
    expect(o.status).toBe('aprovada')
    expect(o.aceite_em).toBeTruthy()
    expect(o.data_aprovacao).toBeTruthy()
    expect(o.aceite_assinatura).toBe(PNG)
    expect(o.aceite_total_centavos).toBe(48000)
    expect(o.aceite_nome).toBe('Cliente Teste')
  })

  it('mantém Aprovada como Aprovada', async () => {
    const os = await osComItem(db)
    await db.query("update ordens_servico set status = 'aprovada' where id = $1", [os.id])
    const { codigo } = await gerarLink(db, os.id)
    await aceitar(db, codigo)
    const { rows: [o] } = await db.query('select status from ordens_servico where id = $1', [os.id])
    expect(o.status).toBe('aprovada')
  })

  // Review Focus 1: o segundo toque.
  it('recusa a segunda assinatura', async () => {
    const os = await osComItem(db)
    const { codigo } = await gerarLink(db, os.id)
    await aceitar(db, codigo)
    await expect(aceitar(db, codigo)).rejects.toThrow(/ja_assinada/)
  })

  // Review Focus 4: o dono mexeu no valor enquanto o cliente olhava.
  it('recusa total divergente e não grava nada', async () => {
    const os = await osComItem(db, 48000)
    const { codigo } = await gerarLink(db, os.id)
    await expect(aceitar(db, codigo, 30000)).rejects.toThrow(/total_divergente/)
    const { rows: [o] } = await db.query(
      'select aceite_em, status from ordens_servico where id = $1', [os.id])
    expect(o.aceite_em).toBe(null)
    expect(o.status).toBe('orcamento')
  })

  it('recusa código errado, vencido e OS cancelada', async () => {
    await expect(aceitar(db, 'b'.repeat(64))).rejects.toThrow(/link_invalido/)

    const os = await osComItem(db)
    const { codigo } = await gerarLink(db, os.id)
    await comoAdmin(db, `update ordens_servico set assinatura_expira_em = now() - interval '1 day' where id = '${os.id}'`)
    await expect(aceitar(db, codigo)).rejects.toThrow(/link_invalido/)

    const os2 = await osComItem(db)
    const l2 = await gerarLink(db, os2.id)
    await db.query("update ordens_servico set status = 'cancelada' where id = $1", [os2.id])
    await expect(aceitar(db, l2.codigo)).rejects.toThrow(/status_invalido/)
  })

  it('recusa desenho fora do formato ou grande demais', async () => {
    const os = await osComItem(db)
    const { codigo } = await gerarLink(db, os.id)
    for (const ruim of [null, '', 'oi', 'data:image/jpeg;base64,AAAA',
      'data:image/png;base64,<script>', `data:image/png;base64,${'A'.repeat(200001)}`]) {
      await expect(aceitar(db, codigo, 48000, ruim)).rejects.toThrow(/assinatura_invalida/)
    }
  })
})

describe('trava depois do aceite', () => {
  async function osAssinada() {
    const os = await osComItem(db)
    const { codigo } = await gerarLink(db, os.id)
    await aceitar(db, codigo)
    return os
  }

  it('o banco recusa inserir, alterar e apagar itens', async () => {
    const os = await osAssinada()
    await expect(adicionarItem(db, os.id, 2, 'Extra', 1000)).rejects.toThrow(/assinada/)
    await expect(
      db.query('update os_itens set descricao = $1 where os_id = $2', ['Outro', os.id]),
    ).rejects.toThrow(/assinada/)
    await expect(
      db.query('delete from os_itens where os_id = $1', [os.id]),
    ).rejects.toThrow(/assinada/)
  })

  it('substituir_itens também é recusada e não perde nada', async () => {
    const os = await osAssinada()
    await expect(
      db.query("select substituir_itens($1, '[]'::jsonb)", [os.id]),
    ).rejects.toThrow(/assinada/)
    expect(await totalDaOS(db, os.id)).toBe(48000)
    const { rows } = await db.query('select count(*)::int as n from os_itens where os_id = $1', [os.id])
    expect(rows[0].n).toBe(1)
  })

  it('o total não muda por escrita direta', async () => {
    const os = await osAssinada()
    await expect(
      db.query('update ordens_servico set total_centavos = 1 where id = $1', [os.id]),
    ).rejects.toThrow(/assinada/)
  })

  // Review Focus 5. Como `authenticated`, que é o papel da API.
  it('o aceite não se forja por escrita direta', async () => {
    const os = await osComItem(db)
    await expect(comoLogado(db, () =>
      db.query('update ordens_servico set aceite_em = now() where id = $1', [os.id]),
    )).rejects.toThrow(/funcoes/)
    await expect(comoLogado(db, () =>
      db.query("update ordens_servico set assinatura_codigo = 'previsivel' where id = $1", [os.id]),
    )).rejects.toThrow(/funcoes/)
    await expect(comoLogado(db, () =>
      db.query(`insert into ordens_servico (cliente_nome, veiculo_descricao, veiculo_placa, aceite_em)
                values ('A', 'B', 'ABC1D23', now())`),
    )).rejects.toThrow(/funcoes/)
  })

  // O GraphQL do Supabase roda as mutations de uma requisição numa transação
  // só. Um sinalizador de transação, ligado por uma função, ficava ligado para
  // o update direto que vinha logo depois: gerar o link e forjar o aceite.
  it('gerar o link e forjar o aceite na MESMA transação é recusado', async () => {
    const os = await osComItem(db)
    await comoLogado(db, async () => {
      await db.exec('begin')
      try {
        await db.query('select gerar_link_assinatura($1, false)', [os.id])
        await expect(db.query(
          `update ordens_servico
              set aceite_em = '2020-01-01',
                  aceite_assinatura = 'data:image/png;base64,AA==',
                  aceite_total_centavos = 1
            where id = $1`, [os.id]),
        ).rejects.toThrow(/funcoes/)
      } finally {
        await db.exec('rollback')
      }
    })
    const { rows: [o] } = await db.query(
      'select aceite_em from ordens_servico where id = $1', [os.id])
    expect(o.aceite_em).toBe(null)
  })

  it('um item não muda de OS para escapar da trava', async () => {
    const assinada = await osAssinada()
    const livre = await osComItem(db, 1000)

    // Sair da OS assinada para uma livre.
    await expect(comoLogado(db, () => db.query(
      'update os_itens set os_id = $1, posicao = 9 where os_id = $2', [livre.id, assinada.id]),
    )).rejects.toThrow()

    // Entrar numa OS assinada vindo de uma livre.
    await expect(comoLogado(db, () => db.query(
      'update os_itens set os_id = $1, posicao = 9 where os_id = $2', [assinada.id, livre.id]),
    )).rejects.toThrow()

    expect(await totalDaOS(db, assinada.id)).toBe(48000)
    const { rows } = await db.query(
      'select count(*)::int as n from os_itens where os_id = $1', [assinada.id])
    expect(rows[0].n).toBe(1)
  })

  it('o aceite não se desfaz', async () => {
    const os = await osAssinada()
    await expect(
      db.query('update ordens_servico set aceite_em = null where id = $1', [os.id]),
    ).rejects.toThrow()
    await expect(
      comoAdmin(db, `update ordens_servico set aceite_assinatura = 'x' where id = '${os.id}'`),
    ).rejects.toThrow()
  })

  it('nome, telefone e status continuam editáveis, e o aceite guarda o nome original', async () => {
    const os = await osAssinada()
    await db.query(
      "update ordens_servico set cliente_nome = 'Nome Corrigido', cliente_telefone = '11999990000' where id = $1",
      [os.id])
    await db.query("update ordens_servico set status = 'finalizada' where id = $1", [os.id])
    const { rows: [o] } = await db.query(
      'select cliente_nome, aceite_nome, status from ordens_servico where id = $1', [os.id])
    expect(o.cliente_nome).toBe('Nome Corrigido')
    expect(o.aceite_nome).toBe('Cliente Teste')
    expect(o.status).toBe('finalizada')
  })

  it('cancelar OS assinada é permitido', async () => {
    const os = await osAssinada()
    await db.query('select cancelar_os($1)', [os.id])
    const { rows: [o] } = await db.query('select status from ordens_servico where id = $1', [os.id])
    expect(o.status).toBe('cancelada')
  })

  // A trava de itens não pode impedir o administrador de limpar uma OS: na
  // cascata, a OS já não é visível para o gatilho dos itens.
  it('apagar a OS inteira, pelo painel, leva os itens junto mesmo assinada', async () => {
    const os = await osAssinada()
    await db.query('delete from ordens_servico where id = $1', [os.id])
    const { rows } = await db.query('select count(*)::int as n from os_itens')
    expect(rows[0].n).toBe(0)
  })
})

describe('permissões do visitante', () => {
  it('visitante executa só as duas funções do link', async () => {
    const os = await osComItem(db)
    const { codigo } = await gerarLink(db, os.id)
    const r = await como(db, 'anon', () => obter(db, codigo))
    expect(r.situacao).toBe('valido')
    const ok = await como(db, 'anon', () => aceitar(db, codigo))
    expect(ok.ok).toBe(true)
  })

  // Já existia aberto a visitante antes desta mudança: com a chave anon, que é
  // pública, alguém poderia reiniciar a numeração das OS.
  it('visitante NÃO executa as funções internas', async () => {
    const os = await osComItem(db)
    const chamadas = [
      ['select definir_proximo_numero(5)', []],
      ['select cancelar_os($1)', [os.id]],
      ["select substituir_itens($1, '[]'::jsonb)", [os.id]],
      ['select gerar_link_assinatura($1, false)', [os.id]],
    ]
    for (const [sql, args] of chamadas) {
      await expect(como(db, 'anon', () => db.query(sql, args))).rejects.toThrow(/permission denied/)
    }
  })

  it('usuário logado executa as internas', async () => {
    const os = await osComItem(db)
    await como(db, 'authenticated', async () => {
      const { rows: [r] } = await db.query('select gerar_link_assinatura($1, false) as r', [os.id])
      expect(r.r.codigo).toHaveLength(64)
    })
  })

  // Com os grants do criarBanco, o visitante TEM permissão de tabela, como no
  // Supabase. O que o segura é o RLS — e é isso que este teste exercita, sem
  // um try/catch que o fizesse passar por qualquer erro.
  it('visitante não lê a tabela: o RLS devolve zero linhas', async () => {
    await osComItem(db)
    const { rows } = await como(db, 'anon', () => db.query('select * from ordens_servico'))
    expect(rows).toHaveLength(0)
  })

  it('visitante não escreve na tabela', async () => {
    const os = await osComItem(db)
    const r = await como(db, 'anon', () => db.query(
      "update ordens_servico set cliente_nome = 'Invasor' where id = $1 returning id", [os.id]))
    expect(r.rows).toHaveLength(0)
    const { rows: [o] } = await db.query(
      'select cliente_nome from ordens_servico where id = $1', [os.id])
    expect(o.cliente_nome).toBe('Cliente Teste')
  })
})

// A versão amarra o aceite ao que o cliente VIU, não só ao total: trocar a
// descrição mantendo o valor não muda o total, e a conferência por total sozinha
// deixava o cliente assinar itens que nunca tinha visto.
describe('versão do que o cliente viu', () => {
  it('obter devolve uma versão estável', async () => {
    const os = await osComItem(db)
    const { codigo } = await gerarLink(db, os.id)
    const a = await obter(db, codigo)
    const b = await obter(db, codigo)
    expect(a.versao).toMatch(/^[0-9a-f]{32}$/)
    expect(b.versao).toBe(a.versao)
  })

  it('trocar a descrição com o MESMO total muda a versão e recusa o aceite', async () => {
    const os = await osComItem(db, 30000)
    const { codigo } = await gerarLink(db, os.id)
    const visto = await obter(db, codigo)

    await db.query(
      "update os_itens set descricao = 'Alternador recondicionado' where os_id = $1", [os.id])
    expect(await totalDaOS(db, os.id)).toBe(30000)

    await expect(aceitar(db, codigo, 30000, PNG, visto.versao))
      .rejects.toThrow(/total_divergente/)
    const { rows: [o] } = await db.query(
      'select aceite_em from ordens_servico where id = $1', [os.id])
    expect(o.aceite_em).toBe(null)
  })

  it('mudar o nome do cliente também muda a versão', async () => {
    const os = await osComItem(db)
    const { codigo } = await gerarLink(db, os.id)
    const visto = await obter(db, codigo)
    await db.query("update ordens_servico set cliente_nome = 'Outro Nome' where id = $1", [os.id])
    await expect(aceitar(db, codigo, 48000, PNG, visto.versao))
      .rejects.toThrow(/total_divergente/)
  })

  it('a versão que o cliente viu, sem mudança, é aceita', async () => {
    const os = await osComItem(db)
    const { codigo } = await gerarLink(db, os.id)
    const visto = await obter(db, codigo)
    const r = await aceitar(db, codigo, 48000, PNG, visto.versao)
    expect(r.ok).toBe(true)
  })

  it('sem versão, o aceite é recusado', async () => {
    const os = await osComItem(db)
    const { codigo } = await gerarLink(db, os.id)
    await expect(aceitar(db, codigo, 48000, PNG, null)).rejects.toThrow(/total_divergente/)
  })
})

// O desenho vem do cliente e é decodificado no celular do dono, para gerar o
// PDF. Um PNG com cabeçalho de 20000x20000 cabe no limite de caracteres
// (o deflate chega a 1000:1) e descomprime em centenas de megabytes.
describe('validação do desenho PNG', () => {
  async function tentar(desenho) {
    const os = await osComItem(db)
    const { codigo } = await gerarLink(db, os.id)
    return aceitar(db, codigo, 48000, desenho)
  }

  it('aceita um PNG de tamanho razoável', async () => {
    expect((await tentar(pngComDimensoes(500, 150))).ok).toBe(true)
  })

  it('aceita o PNG de 1x1 usado nos demais testes', async () => {
    expect((await tentar(PNG)).ok).toBe(true)
  })

  it('recusa dimensões absurdas no cabeçalho', async () => {
    await expect(tentar(pngComDimensoes(20000, 20000))).rejects.toThrow(/assinatura_invalida/)
    await expect(tentar(pngComDimensoes(1201, 100))).rejects.toThrow(/assinatura_invalida/)
    await expect(tentar(pngComDimensoes(100, 601))).rejects.toThrow(/assinatura_invalida/)
  })

  it('recusa dimensão zero', async () => {
    await expect(tentar(pngComDimensoes(0, 100))).rejects.toThrow(/assinatura_invalida/)
  })

  it('recusa base64 que não é um PNG', async () => {
    // "AAAA..." decodifica em bytes que não têm a assinatura do PNG.
    await expect(tentar(`data:image/png;base64,${'A'.repeat(64)}`))
      .rejects.toThrow(/assinatura_invalida/)
  })

  it('recusa PNG truncado, sem espaço para o cabeçalho', async () => {
    await expect(tentar('data:image/png;base64,iVBORw0KGgo='))
      .rejects.toThrow(/assinatura_invalida/)
  })
})
