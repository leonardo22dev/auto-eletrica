import { describe, it, expect, beforeAll, vi } from 'vitest'

// Filtrar por mês pelas MESMAS funções que a tela do Histórico chama, sobre o
// banco da demonstração com as migrations reais.
vi.stubEnv('VITE_MODO_DEMO', '1')

let ordens, supabase

const dados = (nome, data) => ({
  veiculo_placa: 'MES1A23', data_os: data, cliente_nome: nome,
  cliente_telefone: '', veiculo_descricao: 'Carro do período',
})

beforeAll(async () => {
  supabase = (await import('../data/supabase.js')).supabase
  ordens = await import('../data/ordens.js')
  await supabase.auth.signInWithPassword({ email: 'demo', password: 'x' })

  await ordens.criarOrdem({
    dados: dados('Período Agosto A', '2026-08-03'),
    itens: [{ quantidade: '1', descricao: 'Serviço', valor_unitario_centavos: 10000 }],
  })
  await ordens.criarOrdem({
    dados: dados('Período Agosto B', '2026-08-29'),
    itens: [{ quantidade: '1', descricao: 'Serviço', valor_unitario_centavos: 25000 }],
  })
  await ordens.criarOrdem({
    dados: dados('Período Setembro', '2026-09-15'),
    itens: [{ quantidade: '1', descricao: 'Serviço', valor_unitario_centavos: 5000 }],
  })
})

describe('listarOrdens por mês', () => {
  const doPeriodo = (lista) => lista.filter((o) => o.cliente_nome.startsWith('Período'))

  it('traz só as OS do mês escolhido, inclusive as das pontas', async () => {
    const agosto = doPeriodo(await ordens.listarOrdens({ mes: '2026-08' }))
    expect(agosto.map((o) => o.cliente_nome).sort())
      .toEqual(['Período Agosto A', 'Período Agosto B'])
  })

  it('o primeiro e o último dia do mês entram', async () => {
    // 03 e 29 de agosto já cobrem o miolo; estas provam as bordas exatas.
    await ordens.criarOrdem({ dados: dados('Período Borda 1', '2026-08-01'), itens: [] })
    await ordens.criarOrdem({ dados: dados('Período Borda 31', '2026-08-31'), itens: [] })
    const nomes = doPeriodo(await ordens.listarOrdens({ mes: '2026-08' }))
      .map((o) => o.cliente_nome)
    expect(nomes).toContain('Período Borda 1')
    expect(nomes).toContain('Período Borda 31')
  })

  it('não mistura o mês vizinho', async () => {
    const setembro = doPeriodo(await ordens.listarOrdens({ mes: '2026-09' }))
    expect(setembro.map((o) => o.cliente_nome)).toEqual(['Período Setembro'])
  })

  it('sem mês, continua listando tudo como antes', async () => {
    const todas = doPeriodo(await ordens.listarOrdens({}))
    expect(todas.length).toBeGreaterThanOrEqual(3)
  })

  it('combina com a busca por nome', async () => {
    const r = await ordens.listarOrdens({ mes: '2026-08', termo: 'Agosto A' })
    expect(r.map((o) => o.cliente_nome)).toEqual(['Período Agosto A'])
  })

  it('combina com o filtro de situação', async () => {
    const r = doPeriodo(await ordens.listarOrdens({ mes: '2026-08', status: 'orcamento' }))
    expect(r.length).toBeGreaterThan(0)
    expect(r.every((o) => o.status === 'orcamento')).toBe(true)
  })

  it('mês sem nenhuma OS devolve lista vazia, não erro', async () => {
    expect(await ordens.listarOrdens({ mes: '2020-01' })).toEqual([])
  })
})

describe('dataDaOsMaisAntiga', () => {
  it('devolve a data da OS mais antiga, para montar o seletor de meses', async () => {
    expect(await ordens.dataDaOsMaisAntiga()).toBe('2026-08-01')
  })
})
