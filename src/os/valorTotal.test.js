import { describe, it, expect } from 'vitest'
import {
  ROTULO_VALOR_TOTAL,
  ehModoValorTotal,
  separarValorTotal,
  montarItensValorTotal,
  paraModoValorTotal,
  paraModoDetalhado,
  totalDeQuemSaiu,
  itemSemPreco,
} from './valorTotal.js'
import { validarItens } from './validarItens.js'

const servico = (descricao, quantidade = '1') =>
  ({ quantidade, descricao, valor_unitario_centavos: 0 })
const fechamento = (centavos) =>
  ({ quantidade: '1', descricao: 'Valor total', valor_unitario_centavos: centavos })

describe('rótulo', () => {
  it('a linha de fechamento se chama "Valor total"', () => {
    expect(ROTULO_VALOR_TOTAL).toBe('Valor total')
  })
})

describe('ehModoValorTotal', () => {
  it('reconhece serviços sem preço fechados por uma linha "Valor total"', () => {
    expect(ehModoValorTotal([servico('Troca de alternador'), fechamento(120000)])).toBe(true)
  })

  it('só a linha de valor total também vale', () => {
    expect(ehModoValorTotal([fechamento(80000)])).toBe(true)
  })

  it('ignora maiúscula e espaço no rótulo', () => {
    expect(ehModoValorTotal([{ ...fechamento(100), descricao: '  VALOR TOTAL ' }])).toBe(true)
  })

  it('OS sem itens, ou itemizada, não é valor total', () => {
    expect(ehModoValorTotal([])).toBe(false)
    expect(ehModoValorTotal(undefined)).toBe(false)
    expect(ehModoValorTotal([
      { quantidade: '1', descricao: 'Alternador', valor_unitario_centavos: 38000 },
    ])).toBe(false)
  })

  it('serviço com preço antes do fechamento é OS itemizada', () => {
    expect(ehModoValorTotal([
      { quantidade: '1', descricao: 'Alternador', valor_unitario_centavos: 38000 },
      fechamento(10000),
    ])).toBe(false)
  })

  it('a linha de fechamento precisa ser de quantidade 1', () => {
    expect(ehModoValorTotal([{ ...fechamento(100), quantidade: '2' }])).toBe(false)
  })

  it('o fechamento é a ÚLTIMA linha', () => {
    expect(ehModoValorTotal([fechamento(100), servico('Troca de alternador')])).toBe(false)
  })
})

describe('separarValorTotal', () => {
  it('devolve os serviços e o valor total', () => {
    const itens = [servico('Revisão'), servico('Bateria', '2'), fechamento(150000)]
    expect(separarValorTotal(itens)).toEqual({
      servicos: [servico('Revisão'), servico('Bateria', '2')],
      totalCentavos: 150000,
    })
  })
})

describe('montarItensValorTotal', () => {
  it('põe a linha "Valor total" por último, com o valor', () => {
    const itens = montarItensValorTotal([servico('Revisão')], 90000)
    expect(itens).toEqual([servico('Revisão'), fechamento(90000)])
  })

  it('descarta serviço em branco e apara espaços', () => {
    const itens = montarItensValorTotal(
      [servico('  Revisão  '), servico('   '), servico('')], 5000)
    expect(itens.map((i) => i.descricao)).toEqual(['Revisão', 'Valor total'])
  })

  it('serviço nunca carrega preço, mesmo que viesse com um', () => {
    const itens = montarItensValorTotal(
      [{ quantidade: '1', descricao: 'Revisão', valor_unitario_centavos: 999 }], 5000)
    expect(itens[0].valor_unitario_centavos).toBe(0)
  })

  it('sem serviços, fica só o valor total', () => {
    expect(montarItensValorTotal([], 70000)).toEqual([fechamento(70000)])
  })

  it('o resultado é um conjunto válido para salvar, e a soma é o valor total', () => {
    const { erro, itens } = validarItens(
      montarItensValorTotal([servico('Revisão'), servico('Bateria', '2')], 123456))
    expect(erro).toBe('')
    expect(itens).toHaveLength(3)
    expect(itens.reduce((s, i) => s + i.valor_total_centavos, 0)).toBe(123456)
  })

  it('ida e volta não perde nada', () => {
    const servicos = [servico('Revisão'), servico('Bateria', '2')]
    const volta = separarValorTotal(montarItensValorTotal(servicos, 45000))
    expect(volta).toEqual({ servicos, totalCentavos: 45000 })
  })
})

describe('paraModoValorTotal', () => {
  it('troca de itemizado para valor total: descrições ficam, o total é a soma', () => {
    const itens = paraModoValorTotal([
      { quantidade: '2', descricao: 'Lâmpada', valor_unitario_centavos: 1800 },
      { quantidade: '1', descricao: 'Mão de obra', valor_unitario_centavos: 5000 },
    ])
    expect(itens).toEqual([
      { quantidade: '2', descricao: 'Lâmpada', valor_unitario_centavos: 0 },
      { quantidade: '1', descricao: 'Mão de obra', valor_unitario_centavos: 0 },
      fechamento(8600),
    ])
  })

  it('linhas em branco do fim do formulário não viram serviço', () => {
    const itens = paraModoValorTotal([
      { quantidade: '1', descricao: 'Revisão', valor_unitario_centavos: 7000 },
      { quantidade: '1', descricao: '', valor_unitario_centavos: 0 },
    ])
    expect(itens.map((i) => i.descricao)).toEqual(['Revisão', 'Valor total'])
    expect(itens.at(-1).valor_unitario_centavos).toBe(7000)
  })

  it('quantidade decimal entra no total do jeito que o banco calcula', () => {
    const itens = paraModoValorTotal([
      { quantidade: '0,5', descricao: 'Fluido', valor_unitario_centavos: 4000 },
    ])
    expect(itens.at(-1).valor_unitario_centavos).toBe(2000)
  })

  it('já estando em valor total, devolve como está', () => {
    const atual = [servico('Revisão'), fechamento(90000)]
    expect(paraModoValorTotal(atual)).toEqual(atual)
  })

  it('formulário vazio vira só "Valor total" zerado', () => {
    expect(paraModoValorTotal([{ quantidade: '1', descricao: '', valor_unitario_centavos: 0 }]))
      .toEqual([fechamento(0)])
  })
})

// Voltar para "Detalhar valores" precisa deixar de parecer valor total, senão a
// tela voltaria sozinha para o outro modo (o modo vem dos próprios itens).
describe('paraModoDetalhado', () => {
  it('um serviço só recebe o valor total como preço', () => {
    const itens = paraModoDetalhado([servico('Revisão'), fechamento(90000)])
    expect(itens).toEqual([
      { quantidade: '1', descricao: 'Revisão', valor_unitario_centavos: 90000 },
    ])
    expect(ehModoValorTotal(itens)).toBe(false)
  })

  it('vários serviços ficam sem preço, para a oficina informar um a um', () => {
    const itens = paraModoDetalhado([servico('Revisão'), servico('Bateria'), fechamento(90000)])
    expect(itens).toEqual([servico('Revisão'), servico('Bateria')])
    expect(ehModoValorTotal(itens)).toBe(false)
  })

  it('só o valor total vira uma linha em branco com o valor, pronta para descrever', () => {
    const itens = paraModoDetalhado([fechamento(70000)])
    expect(itens).toEqual([{ quantidade: '1', descricao: '', valor_unitario_centavos: 70000 }])
    expect(ehModoValorTotal(itens)).toBe(false)
  })

  it('OS que já é itemizada volta como está', () => {
    const atual = [{ quantidade: '1', descricao: 'Alternador', valor_unitario_centavos: 38000 }]
    expect(paraModoDetalhado(atual)).toEqual(atual)
  })

  it('o valor total que ficou de fora é informado, para a tela avisar', () => {
    expect(totalDeQuemSaiu([servico('A'), servico('B'), fechamento(90000)])).toBe(90000)
    expect(totalDeQuemSaiu([servico('A'), fechamento(90000)])).toBe(0)
    expect(totalDeQuemSaiu([{ quantidade: '1', descricao: 'X', valor_unitario_centavos: 5 }])).toBe(0)
  })
})

describe('itemSemPreco', () => {
  it('é o item de valor zero, que o documento imprime sem preço', () => {
    expect(itemSemPreco({ valor_unitario_centavos: 0, valor_total_centavos: 0 })).toBe(true)
    expect(itemSemPreco({ valor_unitario_centavos: 100, valor_total_centavos: 100 })).toBe(false)
    expect(itemSemPreco({})).toBe(true)
  })
})
