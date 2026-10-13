import { describe, it, expect } from 'vitest'
import { editadaDepoisDeEmitida } from './edicao.js'

// A marca "Editada em" é a salvaguarda que o spec vinculou à decisão de
// permitir editar OS finalizada. Comparar dia com dia, e ainda em UTC,
// quebrava nos dois sentidos: não marcava a correção feita no mesmo dia —
// que é o caso real — e marcava uma OS intocada finalizada à noite.
describe('editadaDepoisDeEmitida', () => {
  it('marca a correção feita horas depois, no mesmo dia', () => {
    expect(editadaDepoisDeEmitida({
      finalizada_em: '2026-10-13T10:00:00-03:00',
      atualizado_em: '2026-10-13T15:00:00-03:00',
    })).toBe(true)
  })

  it('não marca a OS que ninguém tocou depois de finalizar', () => {
    expect(editadaDepoisDeEmitida({
      finalizada_em: '2026-10-13T22:00:00-03:00',
      atualizado_em: '2026-10-13T22:00:00-03:00',
    })).toBe(false)
  })

  // O caso do falso positivo antigo: 22h em São Paulo já é o dia seguinte
  // em UTC, e a comparação por dia acusava edição que não houve.
  it('não marca por virada de dia em UTC', () => {
    expect(editadaDepoisDeEmitida({
      finalizada_em: '2026-10-13T22:00:00-03:00',
      atualizado_em: '2026-10-13T22:00:01-03:00',
    })).toBe(false)
  })

  it('marca quando passa da tolerância de gravação', () => {
    expect(editadaDepoisDeEmitida({
      finalizada_em: '2026-10-13T22:00:00-03:00',
      atualizado_em: '2026-10-13T22:00:30-03:00',
    })).toBe(true)
  })

  it('não marca OS que nunca foi finalizada', () => {
    expect(editadaDepoisDeEmitida({
      finalizada_em: null,
      atualizado_em: '2026-10-13T15:00:00-03:00',
    })).toBe(false)
  })

  it('não marca sem dados', () => {
    expect(editadaDepoisDeEmitida({})).toBe(false)
    expect(editadaDepoisDeEmitida(null)).toBe(false)
  })

  it('não marca com data inválida', () => {
    expect(editadaDepoisDeEmitida({
      finalizada_em: 'nao é data', atualizado_em: '2026-10-13T15:00:00-03:00',
    })).toBe(false)
  })
})
