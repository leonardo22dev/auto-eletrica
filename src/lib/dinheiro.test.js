import { describe, it, expect } from 'vitest'
import {
  formatarBRL,
  centavosParaTexto,
  textoParaCentavos,
  textoParaQuantidade,
  totalDoItem,
  somarCentavos,
} from './dinheiro.js'

// O campo de quantidade usa inputMode="decimal", e teclado pt-BR oferece
// vírgula. Number('1,5') é NaN — sem um parser próprio, meio litro de fluido
// vira quantidade 1 e total R$ 0,00 numa linha do documento.
describe('textoParaQuantidade', () => {
  it('aceita vírgula como decimal', () => {
    expect(textoParaQuantidade('1,5')).toBe(1.5)
    expect(textoParaQuantidade('0,5')).toBe(0.5)
  })

  it('aceita ponto como decimal', () => {
    expect(textoParaQuantidade('1.5')).toBe(1.5)
  })

  it('aceita inteiro', () => {
    expect(textoParaQuantidade('4')).toBe(4)
    expect(textoParaQuantidade(4)).toBe(4)
  })

  it('devolve nulo para entrada que não é quantidade válida', () => {
    expect(textoParaQuantidade('')).toBe(null)
    expect(textoParaQuantidade('abc')).toBe(null)
    expect(textoParaQuantidade('0')).toBe(null)
    expect(textoParaQuantidade('-2')).toBe(null)
    expect(textoParaQuantidade(null)).toBe(null)
  })
})

describe('formatarBRL', () => {
  it('formata com símbolo e duas casas', () => {
    expect(formatarBRL(48000)).toBe('R$ 480,00')
    expect(formatarBRL(118000)).toBe('R$ 1.180,00')
    expect(formatarBRL(0)).toBe('R$ 0,00')
    expect(formatarBRL(5)).toBe('R$ 0,05')
  })
})

describe('centavosParaTexto', () => {
  it('formata sem o símbolo, para campos de edição', () => {
    expect(centavosParaTexto(48000)).toBe('480,00')
    expect(centavosParaTexto(118000)).toBe('1.180,00')
  })
})

describe('textoParaCentavos', () => {
  it('lê o formato brasileiro', () => {
    expect(textoParaCentavos('480,00')).toBe(48000)
    expect(textoParaCentavos('1.180,00')).toBe(118000)
    expect(textoParaCentavos('480')).toBe(48000)
    expect(textoParaCentavos('0,05')).toBe(5)
  })

  it('aceita ponto como decimal quando não há vírgula', () => {
    expect(textoParaCentavos('480.50')).toBe(48050)
    expect(textoParaCentavos('150.00')).toBe(15000)
  })

  // Em pt-BR o ponto nunca é decimal. Quem digita 1.234 quer R$ 1.234,00;
  // tratar como decimal daria R$ 1,23 — erro de mil vezes numa linha do
  // documento. A regra: ponto seguido de exatamente três dígitos, sem
  // vírgula, é separador de milhar.
  it('lê ponto seguido de três dígitos como separador de milhar', () => {
    expect(textoParaCentavos('1.234')).toBe(123400)
    expect(textoParaCentavos('1.180')).toBe(118000)
    expect(textoParaCentavos('12.500')).toBe(1250000)
    expect(textoParaCentavos('1.234.567')).toBe(123456700)
  })

  it('ignora espaços, símbolo e devolve 0 para lixo', () => {
    expect(textoParaCentavos(' R$ 480,00 ')).toBe(48000)
    expect(textoParaCentavos('')).toBe(0)
    expect(textoParaCentavos('abc')).toBe(0)
    expect(textoParaCentavos(null)).toBe(0)
  })
})

describe('totalDoItem', () => {
  it('multiplica quantidade inteira', () => {
    expect(totalDoItem(4, 5000)).toBe(20000)
    expect(totalDoItem(1, 28000)).toBe(28000)
  })

  // Review Focus 3: quantidade fracionária não pode vazar float.
  it('arredonda quantidade fracionária para centavo inteiro', () => {
    expect(totalDoItem(0.5, 7501)).toBe(3751)
    expect(totalDoItem(1.5, 33333)).toBe(50000)
    expect(Number.isInteger(totalDoItem(0.3, 10010))).toBe(true)
  })

  it('entende quantidade escrita com vírgula, como o teclado pt-BR oferece', () => {
    expect(totalDoItem('1,5', 15000)).toBe(22500)
    expect(totalDoItem('0,5', 15000)).toBe(7500)
  })

  it('devolve 0 para quantidade inválida, em vez de fingir que é 1', () => {
    expect(totalDoItem('abc', 15000)).toBe(0)
    expect(totalDoItem('', 15000)).toBe(0)
  })
})

describe('somarCentavos', () => {
  it('soma a lista', () => {
    expect(somarCentavos([28000, 20000])).toBe(48000)
  })

  // Review Focus 5: OS sem itens.
  it('devolve 0 para lista vazia', () => {
    expect(somarCentavos([])).toBe(0)
  })
})
