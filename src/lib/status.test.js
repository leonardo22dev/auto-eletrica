import { describe, it, expect } from 'vitest'
import { STATUS, podeTransicionar, rotuloStatus, tituloDocumento } from './status.js'

describe('podeTransicionar', () => {
  it('segue o ciclo do spec', () => {
    expect(podeTransicionar(STATUS.ORCAMENTO, STATUS.APROVADA)).toBe(true)
    expect(podeTransicionar(STATUS.APROVADA, STATUS.FINALIZADA)).toBe(true)
    expect(podeTransicionar(STATUS.ORCAMENTO, STATUS.CANCELADA)).toBe(true)
    expect(podeTransicionar(STATUS.APROVADA, STATUS.CANCELADA)).toBe(true)
    expect(podeTransicionar(STATUS.FINALIZADA, STATUS.CANCELADA)).toBe(true)
  })

  it('não pula etapa nem anda para trás', () => {
    expect(podeTransicionar(STATUS.ORCAMENTO, STATUS.FINALIZADA)).toBe(false)
    expect(podeTransicionar(STATUS.APROVADA, STATUS.ORCAMENTO)).toBe(false)
    expect(podeTransicionar(STATUS.FINALIZADA, STATUS.APROVADA)).toBe(false)
  })

  it('cancelada é terminal', () => {
    expect(podeTransicionar(STATUS.CANCELADA, STATUS.ORCAMENTO)).toBe(false)
    expect(podeTransicionar(STATUS.CANCELADA, STATUS.APROVADA)).toBe(false)
    expect(podeTransicionar(STATUS.CANCELADA, STATUS.CANCELADA)).toBe(false)
  })

  it('recusa status desconhecido', () => {
    expect(podeTransicionar('inventado', STATUS.APROVADA)).toBe(false)
    expect(podeTransicionar(STATUS.ORCAMENTO, 'inventado')).toBe(false)
  })
})

describe('rotuloStatus', () => {
  it('traz o rótulo da tela', () => {
    expect(rotuloStatus(STATUS.ORCAMENTO)).toBe('Orçamento')
    expect(rotuloStatus(STATUS.FINALIZADA)).toBe('Finalizada')
  })
})

describe('tituloDocumento', () => {
  it('orçamento imprime como orçamento', () => {
    expect(tituloDocumento(STATUS.ORCAMENTO)).toBe('ORÇAMENTO')
  })

  it('os demais imprimem como ordem de serviços', () => {
    expect(tituloDocumento(STATUS.APROVADA)).toBe('ORDEM DE SERVIÇOS')
    expect(tituloDocumento(STATUS.FINALIZADA)).toBe('ORDEM DE SERVIÇOS')
    expect(tituloDocumento(STATUS.CANCELADA)).toBe('ORDEM DE SERVIÇOS')
  })
})
