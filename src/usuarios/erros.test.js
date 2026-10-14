import { describe, it, expect } from 'vitest'
import { codigoDoErro, mensagemDoErro } from './erros.js'

describe('erros da gestão de usuários', () => {
  it('reconhece o código dentro da mensagem do banco', () => {
    expect(codigoDoErro('acesso_negado')).toBe('acesso_negado')
    expect(codigoDoErro('ERROR: usuario_em_uso')).toBe('usuario_em_uso')
    expect(codigoDoErro('proprio_usuario')).toBe('proprio_usuario')
  })

  it('devolve vazio para o que não conhece', () => {
    expect(codigoDoErro('connection refused')).toBe('')
    expect(codigoDoErro(undefined)).toBe('')
  })

  it('traduz cada código para uma frase que a oficina entende', () => {
    expect(mensagemDoErro('usuario_em_uso')).toMatch(/já existe/i)
    expect(mensagemDoErro('senha_invalida')).toMatch(/8/)
    expect(mensagemDoErro('proprio_usuario')).toMatch(/a si mesmo|próprio/i)
    expect(mensagemDoErro('ultimo_admin')).toMatch(/administrador/i)
    expect(mensagemDoErro('acesso_negado')).toMatch(/permissão/i)
  })

  it('mensagem desconhecida cai num texto geral, sem vazar termo técnico', () => {
    const m = mensagemDoErro('relation "perfis" does not exist')
    expect(m).toMatch(/tente/i)
    expect(m).not.toMatch(/relation/)
  })
})
