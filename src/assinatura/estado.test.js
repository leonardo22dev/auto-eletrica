import { describe, it, expect } from 'vitest'
import { situacaoDoLink } from './estado.js'

const AGORA = new Date('2026-10-14T15:00:00-03:00')
const base = { status: 'orcamento', assinatura_codigo: null, assinatura_expira_em: null, aceite_em: null }

describe('situacaoDoLink', () => {
  it('nao_enviada quando ainda não há código', () => {
    expect(situacaoDoLink(base, AGORA)).toBe('nao_enviada')
  })

  it('aguardando dentro da validade', () => {
    const os = { ...base, assinatura_codigo: 'x', assinatura_expira_em: '2026-11-01T00:00:00-03:00' }
    expect(situacaoDoLink(os, AGORA)).toBe('aguardando')
  })

  it('vencido depois da validade', () => {
    const os = { ...base, assinatura_codigo: 'x', assinatura_expira_em: '2026-10-01T00:00:00-03:00' }
    expect(situacaoDoLink(os, AGORA)).toBe('vencido')
  })

  it('assinada quando há aceite, mesmo com o link vencido', () => {
    const os = { ...base, aceite_em: '2026-10-10T10:00:00-03:00',
      assinatura_codigo: 'x', assinatura_expira_em: '2026-10-01T00:00:00-03:00' }
    expect(situacaoDoLink(os, AGORA)).toBe('assinada')
  })

  it('indisponivel para OS cancelada ou finalizada sem aceite', () => {
    expect(situacaoDoLink({ ...base, status: 'cancelada' }, AGORA)).toBe('indisponivel')
    expect(situacaoDoLink({ ...base, status: 'finalizada' }, AGORA)).toBe('indisponivel')
  })

  it('aprovada sem aceite ainda aceita o link', () => {
    expect(situacaoDoLink({ ...base, status: 'aprovada' }, AGORA)).toBe('nao_enviada')
  })

  it('aguenta OS nula', () => {
    expect(situacaoDoLink(null, AGORA)).toBe('indisponivel')
  })
})
