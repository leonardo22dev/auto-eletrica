import { describe, it, expect } from 'vitest'
import { ehAdmin, abasDoMenu, rotuloPapel } from './perfil.js'

const admin = { papel: 'admin', ativo: true, nome: 'Dono' }
const atendente = { papel: 'atendente', ativo: true, nome: 'Maria' }

describe('perfil', () => {
  it('só administrador ativo é administrador', () => {
    expect(ehAdmin(admin)).toBe(true)
    expect(ehAdmin({ ...admin, ativo: false })).toBe(false)
    expect(ehAdmin(atendente)).toBe(false)
    expect(ehAdmin(null)).toBe(false)
    expect(ehAdmin(undefined)).toBe(false)
  })

  it('o administrador vê Usuários e Ajustes; o atendente, não', () => {
    expect(abasDoMenu(admin).map((a) => a.id))
      .toEqual(['inicio', 'historico', 'usuarios', 'ajustes'])
    expect(abasDoMenu(atendente).map((a) => a.id)).toEqual(['inicio', 'historico'])
  })

  it('sem perfil, o menu é o mínimo', () => {
    expect(abasDoMenu(null).map((a) => a.id)).toEqual(['inicio', 'historico'])
  })

  it('cada aba aponta para a rota certa', () => {
    const rotas = Object.fromEntries(abasDoMenu(admin).map((a) => [a.id, a.para]))
    expect(rotas).toEqual({
      inicio: '/', historico: '/os', usuarios: '/usuarios', ajustes: '/configuracoes',
    })
  })

  it('rotula os níveis em português', () => {
    expect(rotuloPapel('admin')).toBe('Administrador')
    expect(rotuloPapel('atendente')).toBe('Atendente')
    expect(rotuloPapel('x')).toBe('')
  })
})
