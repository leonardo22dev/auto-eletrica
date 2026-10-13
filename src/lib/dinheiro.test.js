import { describe, it, expect } from 'vitest'
import {
  formatarBRL,
  centavosParaTexto,
  textoParaCentavos,
  totalDoItem,
  somarCentavos,
} from './dinheiro.js'

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
