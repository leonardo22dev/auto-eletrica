import { describe, it, expect } from 'vitest'
import { usuarioParaEmail, DOMINIO_LOGIN } from './usuario.js'

// O Supabase exige e-mail e não tem login por nome de usuário. A tela aceita
// "usuário" e converte para um endereço interno, que nunca recebe e-mail.
describe('usuarioParaEmail', () => {
  it('converte o usuário no endereço interno', () => {
    expect(usuarioParaEmail('mizuho')).toBe(`mizuho@${DOMINIO_LOGIN}`)
  })

  it('ignora maiúscula e espaço nas pontas', () => {
    expect(usuarioParaEmail('  Mizuho ')).toBe(`mizuho@${DOMINIO_LOGIN}`)
  })

  // Quem já tem conta com e-mail de verdade continua entrando como antes.
  it('mantém um e-mail digitado, sem converter', () => {
    expect(usuarioParaEmail('dono@oficina.com.br')).toBe('dono@oficina.com.br')
  })

  it('aceita ponto, hífen e sublinhado', () => {
    expect(usuarioParaEmail('joao.silva_2')).toBe(`joao.silva_2@${DOMINIO_LOGIN}`)
    expect(usuarioParaEmail('ana-maria')).toBe(`ana-maria@${DOMINIO_LOGIN}`)
  })

  it('recusa vazio', () => {
    expect(usuarioParaEmail('')).toBe(null)
    expect(usuarioParaEmail('   ')).toBe(null)
    expect(usuarioParaEmail(null)).toBe(null)
  })

  it('recusa caractere que quebraria o endereço', () => {
    expect(usuarioParaEmail('joão')).toBe(null)
    expect(usuarioParaEmail('a b')).toBe(null)
    expect(usuarioParaEmail('a,b')).toBe(null)
    expect(usuarioParaEmail('a/b')).toBe(null)
  })

  it('o domínio interno é um sufixo reservado, que nunca resolve', () => {
    expect(DOMINIO_LOGIN.endsWith('.invalid')).toBe(true)
  })
})
