import { describe, it, expect } from 'vitest'
import { derivarAcesso, lidoAposSessao } from './estadoAuth.js'

const sessaoDe = (id) => ({ user: { id } })
const ativo = { user_id: 'u1', nome: 'Maria', papel: 'atendente', ativo: true }
const bloqueado = { ...ativo, ativo: false }

describe('derivarAcesso', () => {
  it('sem sessão, não há o que ler nem o que bloquear', () => {
    expect(derivarAcesso({ sessao: null, lido: null })).toEqual({
      perfilLido: undefined, perfil: null, semAcesso: false, falhouAoLer: false, lendo: false,
    })
  })

  it('com sessão e sem leitura, está lendo o perfil', () => {
    const r = derivarAcesso({ sessao: sessaoDe('u1'), lido: null })
    expect(r.lendo).toBe(true)
    expect(r.semAcesso).toBe(false)
    expect(r.perfil).toBe(null)
  })

  it('perfil ativo entra', () => {
    const r = derivarAcesso({
      sessao: sessaoDe('u1'), lido: { id: 'u1', perfil: ativo, erro: false },
    })
    expect(r.perfil).toBe(ativo)
    expect(r.semAcesso).toBe(false)
    expect(r.lendo).toBe(false)
  })

  it('perfil bloqueado e perfil inexistente ficam sem acesso', () => {
    for (const perfil of [bloqueado, null]) {
      const r = derivarAcesso({ sessao: sessaoDe('u1'), lido: { id: 'u1', perfil, erro: false } })
      expect(r.semAcesso).toBe(true)
      expect(r.perfil).toBe(null)
    }
  })

  it('o perfil lido de outra pessoa não vale para a sessão atual', () => {
    const r = derivarAcesso({
      sessao: sessaoDe('u2'), lido: { id: 'u1', perfil: bloqueado, erro: false },
    })
    expect(r.semAcesso).toBe(false)
    expect(r.lendo).toBe(true)
  })

  it('falha de rede na primeira leitura não é bloqueio', () => {
    const r = derivarAcesso({
      sessao: sessaoDe('u1'), lido: { id: 'u1', perfil: undefined, erro: true },
    })
    expect(r.falhouAoLer).toBe(true)
    expect(r.semAcesso).toBe(false)
    expect(r.lendo).toBe(false)
  })

  it('falha de rede depois de já saber o perfil mantém o que se sabia', () => {
    const r = derivarAcesso({
      sessao: sessaoDe('u1'), lido: { id: 'u1', perfil: ativo, erro: true },
    })
    expect(r.perfil).toBe(ativo)
    expect(r.falhouAoLer).toBe(false)
  })
})

// O dono bloqueia alguém por engano e reativa em seguida: a pessoa tem de
// conseguir entrar de novo na mesma aba, sem recarregar a página.
describe('reativado entra de novo na mesma aba', () => {
  it('ao sair, o que se leu antes é esquecido', () => {
    const lido = { id: 'u1', perfil: bloqueado, erro: false }
    expect(lidoAposSessao(lido, null)).toBe(null)
  })

  it('enquanto a sessão segue, a leitura é mantida', () => {
    const lido = { id: 'u1', perfil: ativo, erro: false }
    expect(lidoAposSessao(lido, sessaoDe('u1'))).toBe(lido)
  })

  it('o novo login do mesmo usuário espera a leitura nova, em vez de usar o bloqueio antigo', () => {
    const depoisDoLogout = lidoAposSessao({ id: 'u1', perfil: bloqueado, erro: false }, null)
    const r = derivarAcesso({ sessao: sessaoDe('u1'), lido: depoisDoLogout })
    expect(r.semAcesso).toBe(false)
    expect(r.lendo).toBe(true)
  })
})
