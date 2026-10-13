import { describe, it, expect } from 'vitest'
import { normalizarPlaca, placaValida, formatarPlaca } from './placa.js'

// Review Focus 3 vizinho: a mesma placa digitada de jeitos diferentes
// precisa achar o mesmo carro.
describe('normalizarPlaca', () => {
  it('sobe para maiúscula e tira hífen e espaço', () => {
    expect(normalizarPlaca('abc-1234')).toBe('ABC1234')
    expect(normalizarPlaca(' abc 1d23 ')).toBe('ABC1D23')
    expect(normalizarPlaca('ABC1D23')).toBe('ABC1D23')
  })

  it('devolve string vazia para entrada inútil', () => {
    expect(normalizarPlaca('')).toBe('')
    expect(normalizarPlaca(null)).toBe('')
    expect(normalizarPlaca(undefined)).toBe('')
  })
})

describe('placaValida', () => {
  it('aceita o formato antigo e o Mercosul', () => {
    expect(placaValida('ABC1234')).toBe(true)
    expect(placaValida('ABC1D23')).toBe(true)
  })

  it('recusa tamanho errado e posições trocadas', () => {
    expect(placaValida('ABC123')).toBe(false)
    expect(placaValida('ABC12345')).toBe(false)
    expect(placaValida('AB1C234')).toBe(false)
    expect(placaValida('')).toBe(false)
  })

  it('valida já normalizando a entrada', () => {
    expect(placaValida('abc-1234')).toBe(true)
  })
})

describe('formatarPlaca', () => {
  it('põe hífen só no formato antigo', () => {
    expect(formatarPlaca('ABC1234')).toBe('ABC-1234')
    expect(formatarPlaca('ABC1D23')).toBe('ABC1D23')
  })

  it('devolve a entrada normalizada quando não reconhece', () => {
    expect(formatarPlaca('xyz')).toBe('XYZ')
  })
})
