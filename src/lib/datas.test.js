import { describe, it, expect } from 'vitest'
import { hojeISO, formatarData, dataPorExtenso, formatarDataHora } from './datas.js'

// Review Focus 1: este é o bug clássico. new Date('2026-08-12') é meia-noite
// UTC, que em Brasília (UTC-3) é 11/08 às 21h. Uma OS concluída em 12/08
// imprimiria 11/08 no PDF entregue ao cliente.
describe('formatarData', () => {
  it('não desloca o dia por causa de fuso', () => {
    expect(formatarData('2026-08-12')).toBe('12/08/2026')
    expect(formatarData('2026-01-01')).toBe('01/01/2026')
    expect(formatarData('2026-12-31')).toBe('31/12/2026')
  })

  it('devolve string vazia para nulo', () => {
    expect(formatarData(null)).toBe('')
    expect(formatarData('')).toBe('')
  })
})

describe('dataPorExtenso', () => {
  it('quebra em dia, mês por nome e ano', () => {
    expect(dataPorExtenso('2026-08-12')).toEqual({
      dia: '12', mes: 'agosto', ano: '2026',
    })
    expect(dataPorExtenso('2026-03-01')).toEqual({
      dia: '01', mes: 'março', ano: '2026',
    })
  })

  it('devolve campos vazios para nulo', () => {
    expect(dataPorExtenso(null)).toEqual({ dia: '', mes: '', ano: '' })
  })
})

describe('hojeISO', () => {
  it('devolve YYYY-MM-DD', () => {
    expect(hojeISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('formatarDataHora', () => {
  it('formata timestamp com hora', () => {
    expect(formatarDataHora('2026-08-12T14:35:00-03:00')).toBe('12/08/2026 às 14:35')
  })

  it('devolve string vazia para nulo', () => {
    expect(formatarDataHora(null)).toBe('')
  })
})
