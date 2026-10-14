import { describe, it, expect } from 'vitest'
import {
  normalizarUsuario, validarNovoUsuario, validarSenha, acoesDoUsuario, textoDaAtividade,
} from './regras.js'

describe('normalizarUsuario', () => {
  it('tira espaço das pontas e passa para minúsculo', () => {
    expect(normalizarUsuario('  MARIA ')).toBe('maria')
    expect(normalizarUsuario(null)).toBe('')
  })
})

describe('validarNovoUsuario', () => {
  const bom = { usuario: 'maria', nome: 'Maria', senha: 'senha1234', papel: 'atendente' }

  it('aceita o caso comum', () => {
    expect(validarNovoUsuario(bom)).toEqual({})
  })

  it('espelha as regras do banco', () => {
    expect(validarNovoUsuario({ ...bom, usuario: 'ab' }).usuario).toBeTruthy()
    expect(validarNovoUsuario({ ...bom, usuario: 'ma ria' }).usuario).toBeTruthy()
    expect(validarNovoUsuario({ ...bom, usuario: 'josé' }).usuario).toBeTruthy()
    expect(validarNovoUsuario({ ...bom, nome: '  ' }).nome).toBeTruthy()
    expect(validarNovoUsuario({ ...bom, senha: '1234567' }).senha).toBeTruthy()
    expect(validarNovoUsuario({ ...bom, papel: '' }).papel).toBeTruthy()
  })

  it('maiúscula no usuário não é erro: o banco normaliza', () => {
    expect(validarNovoUsuario({ ...bom, usuario: 'MARIA' })).toEqual({})
  })
})

describe('validarSenha', () => {
  it('pede 8 caracteres', () => {
    expect(validarSenha('1234567')).toMatch(/8/)
    expect(validarSenha('12345678')).toBe('')
  })
})

describe('acoesDoUsuario', () => {
  const ativo = { user_id: 'a', ativo: true, papel: 'atendente' }
  const bloqueado = { user_id: 'b', ativo: false, papel: 'atendente' }

  it('em outra pessoa: pode bloquear ou reativar e mudar o nível', () => {
    expect(acoesDoUsuario({ alvo: ativo, euId: 'x' })).toEqual({
      ehVoce: false, podeBloquear: true, podeReativar: false, podeMudarPapel: true,
    })
    expect(acoesDoUsuario({ alvo: bloqueado, euId: 'x' })).toMatchObject({
      podeBloquear: false, podeReativar: true,
    })
  })

  it('em si mesmo: nada de bloquear nem mudar o nível', () => {
    expect(acoesDoUsuario({ alvo: ativo, euId: 'a' })).toEqual({
      ehVoce: true, podeBloquear: false, podeReativar: false, podeMudarPapel: false,
    })
  })
})

describe('textoDaAtividade', () => {
  const base = { ator_nome: 'Dono', alvo_usuario: 'maria' }

  it('descreve cada ação em português', () => {
    expect(textoDaAtividade({ ...base, acao: 'criado', detalhe: { papel: 'atendente' } }))
      .toBe('Dono criou o usuário maria (Atendente)')
    expect(textoDaAtividade({ ...base, acao: 'bloqueado', detalhe: {} }))
      .toBe('Dono bloqueou maria')
    expect(textoDaAtividade({ ...base, acao: 'reativado', detalhe: {} }))
      .toBe('Dono reativou maria')
    expect(textoDaAtividade({ ...base, acao: 'senha_redefinida', detalhe: {} }))
      .toBe('Dono redefiniu a senha de maria')
    expect(textoDaAtividade({ ...base, acao: 'papel_alterado', detalhe: { de: 'atendente', para: 'admin' } }))
      .toBe('Dono mudou o nível de maria para Administrador')
    expect(textoDaAtividade({ ...base, acao: 'nome_alterado', detalhe: { de: 'a', para: 'Maria S.' } }))
      .toBe('Dono mudou o nome de maria para Maria S.')
  })

  it('ação desconhecida não quebra a tela', () => {
    expect(textoDaAtividade({ ...base, acao: 'nova_coisa', detalhe: {} }))
      .toBe('Dono fez uma alteração em maria')
  })
})
