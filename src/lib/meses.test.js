import { describe, it, expect } from 'vitest'
import { limitesDoMes, rotuloDoMes, mesDaData, mesesDesde, MAXIMO_DE_MESES } from './meses.js'

describe('limitesDoMes', () => {
  it('devolve o primeiro e o último dia do mês', () => {
    expect(limitesDoMes('2026-09')).toEqual({ de: '2026-09-01', ate: '2026-09-30' })
    expect(limitesDoMes('2026-01')).toEqual({ de: '2026-01-01', ate: '2026-01-31' })
  })

  it('fevereiro comum tem 28; de ano bissexto, 29', () => {
    expect(limitesDoMes('2026-02').ate).toBe('2026-02-28')
    expect(limitesDoMes('2024-02').ate).toBe('2024-02-29')
    // 1900 não é bissexto; 2000 é.
    expect(limitesDoMes('1900-02').ate).toBe('1900-02-28')
    expect(limitesDoMes('2000-02').ate).toBe('2000-02-29')
  })

  it('mês inválido não vira data torta', () => {
    for (const ruim of ['', null, undefined, '2026-13', 'abc', '2026']) {
      expect(limitesDoMes(ruim)).toBe(null)
    }
  })
})

describe('rotuloDoMes', () => {
  it('escreve o mês por extenso, com o ano', () => {
    expect(rotuloDoMes('2026-09')).toBe('Setembro de 2026')
    expect(rotuloDoMes('2026-01')).toBe('Janeiro de 2026')
    expect(rotuloDoMes('2026-12')).toBe('Dezembro de 2026')
  })

  it('mês inválido devolve vazio, em vez de "undefined de NaN"', () => {
    expect(rotuloDoMes('2026-13')).toBe('')
    expect(rotuloDoMes(null)).toBe('')
  })
})

describe('mesDaData', () => {
  it('tira o mês de uma data da OS', () => {
    expect(mesDaData('2026-09-14')).toBe('2026-09')
  })

  it('data vazia ou torta não vira mês', () => {
    expect(mesDaData(null)).toBe('')
    expect(mesDaData('14/09/2026')).toBe('')
  })
})

describe('mesesDesde', () => {
  it('lista do mais recente para o mais antigo', () => {
    expect(mesesDesde('2026-08-15', '2026-11-06'))
      .toEqual(['2026-11', '2026-10', '2026-09', '2026-08'])
  })

  it('a primeira OS no mês corrente devolve só este mês', () => {
    expect(mesesDesde('2026-11-02', '2026-11-06')).toEqual(['2026-11'])
  })

  it('atravessa a virada do ano', () => {
    expect(mesesDesde('2025-11-20', '2026-02-10'))
      .toEqual(['2026-02', '2026-01', '2025-12', '2025-11'])
  })

  it('sem OS nenhuma, oferece ao menos o mês de hoje', () => {
    expect(mesesDesde(null, '2026-11-06')).toEqual(['2026-11'])
    expect(mesesDesde('', '2026-11-06')).toEqual(['2026-11'])
  })

  it('data mais antiga no futuro não inverte a lista', () => {
    expect(mesesDesde('2027-01-01', '2026-11-06')).toEqual(['2026-11'])
  })

  it('não cresce sem fim: uma data muito antiga para no teto', () => {
    const lista = mesesDesde('1999-01-01', '2026-11-06')
    expect(lista).toHaveLength(MAXIMO_DE_MESES)
    expect(lista[0]).toBe('2026-11')
  })
})
