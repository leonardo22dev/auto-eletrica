import { describe, it, expect } from 'vitest'
import { separarSelect, condicaoParaSql, montarSelect } from './consulta.js'

describe('separarSelect', () => {
  it('separa colunas simples', () => {
    expect(separarSelect('id, nome, telefone')).toEqual({
      colunas: ['id', 'nome', 'telefone'], embutidos: [],
    })
  })

  it('entende o asterisco', () => {
    expect(separarSelect('*')).toEqual({ colunas: ['*'], embutidos: [] })
  })

  it('separa um embutido com apelido', () => {
    expect(separarSelect('*, itens:os_itens(*)')).toEqual({
      colunas: ['*'],
      embutidos: [{ apelido: 'itens', tabela: 'os_itens', colunas: ['*'] }],
    })
  })

  it('separa um embutido sem apelido', () => {
    expect(separarSelect('*, veiculos(id, placa)')).toEqual({
      colunas: ['*'],
      embutidos: [{ apelido: 'veiculos', tabela: 'veiculos', colunas: ['id', 'placa'] }],
    })
  })

  it('separa colunas e embutido juntos', () => {
    expect(separarSelect('id, numero, itens:os_itens(posicao, descricao)')).toEqual({
      colunas: ['id', 'numero'],
      embutidos: [{ apelido: 'itens', tabela: 'os_itens', colunas: ['posicao', 'descricao'] }],
    })
  })

  // A vírgula dentro dos parênteses não pode cortar a lista de fora.
  it('não se perde com vírgula dentro do embutido', () => {
    const r = separarSelect('*, cliente:clientes(id, nome, telefone)')
    expect(r.colunas).toEqual(['*'])
    expect(r.embutidos).toHaveLength(1)
    expect(r.embutidos[0].colunas).toEqual(['id', 'nome', 'telefone'])
  })
})

describe('condicaoParaSql', () => {
  it('traduz igualdade', () => {
    expect(condicaoParaSql('numero.eq.1042', [])).toBe('numero = 1042')
  })

  it('traduz ilike com valor entre aspas', () => {
    const params = []
    expect(condicaoParaSql('nome.ilike."%Silva%"', params)).toBe('nome ilike $1')
    expect(params).toEqual(['%Silva%'])
  })

  it('preserva vírgula e parêntese dentro das aspas', () => {
    const params = []
    condicaoParaSql('telefone.ilike."%(11) 98888, x%"', params)
    expect(params).toEqual(['%(11) 98888, x%'])
  })

  it('desfaz o escape de aspas', () => {
    const params = []
    condicaoParaSql('nome.ilike."%Jo\\"ao%"', params)
    expect(params).toEqual(['%Jo"ao%'])
  })
})

describe('montarSelect', () => {
  it('monta consulta simples', () => {
    const { sql, params } = montarSelect({
      tabela: 'clientes', colunas: ['id', 'nome'], filtros: [],
      ordens: [], limite: null,
    })
    expect(sql).toBe('select id, nome from clientes')
    expect(params).toEqual([])
  })

  it('aplica igualdade como parâmetro', () => {
    const { sql, params } = montarSelect({
      tabela: 'clientes', colunas: ['*'],
      filtros: [{ tipo: 'eq', coluna: 'id', valor: 'abc' }],
      ordens: [], limite: null,
    })
    expect(sql).toBe('select * from clientes where id = $1')
    expect(params).toEqual(['abc'])
  })

  it('junta vários filtros com and', () => {
    const { sql } = montarSelect({
      tabela: 'ordens_servico', colunas: ['*'],
      filtros: [
        { tipo: 'eq', coluna: 'status', valor: 'aprovada' },
        { tipo: 'eq', coluna: 'veiculo_id', valor: 'v1' },
      ],
      ordens: [], limite: null,
    })
    expect(sql).toContain('where status = $1 and veiculo_id = $2')
  })

  it('agrupa o or entre parênteses, para não vazar sobre os outros filtros', () => {
    const { sql } = montarSelect({
      tabela: 'ordens_servico', colunas: ['*'],
      filtros: [
        { tipo: 'eq', coluna: 'status', valor: 'aprovada' },
        { tipo: 'or', expressao: 'numero.eq.5,cliente_nome.ilike."%ana%"' },
      ],
      ordens: [], limite: null,
    })
    expect(sql).toContain('where status = $1 and (numero = 5 or cliente_nome ilike $2)')
  })

  it('ordena e limita', () => {
    const { sql } = montarSelect({
      tabela: 'ordens_servico', colunas: ['*'], filtros: [],
      ordens: [
        { coluna: 'data_abertura', crescente: false },
        { coluna: 'numero', crescente: false, nulosPrimeiro: false },
      ],
      limite: 50,
    })
    expect(sql).toContain('order by data_abertura desc, numero desc nulls last')
    expect(sql).toContain('limit 50')
  })
})
