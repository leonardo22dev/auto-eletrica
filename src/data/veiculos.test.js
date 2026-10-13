import { describe, it, expect } from 'vitest'
import { descricaoVeiculo } from './veiculos.js'

describe('descricaoVeiculo', () => {
  it('junta marca, modelo, ano e cor', () => {
    expect(descricaoVeiculo({ marca: 'GM', modelo: 'Chevette', ano: 1982, cor: 'Bege' }))
      .toBe('GM Chevette 1982 — Bege')
  })

  it('omite os campos ausentes sem deixar separador solto', () => {
    expect(descricaoVeiculo({ marca: 'GM', modelo: 'Chevette' })).toBe('GM Chevette')
    expect(descricaoVeiculo({ marca: 'VW', cor: 'Branco' })).toBe('VW — Branco')
    expect(descricaoVeiculo({ modelo: 'Fusca', ano: 1975 })).toBe('Fusca 1975')
  })

  it('cai na placa quando não há nada descrito', () => {
    expect(descricaoVeiculo({ placa: 'ABC1D23' })).toBe('ABC1D23')
    expect(descricaoVeiculo({})).toBe('')
    expect(descricaoVeiculo(null)).toBe('')
  })
})
