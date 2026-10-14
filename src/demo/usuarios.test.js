import { describe, it, expect, beforeAll, vi } from 'vitest'

// Percorre a gestão de usuários e a atividade da OS pelas MESMAS funções que
// as telas chamam, sobre o Postgres em WebAssembly com as migrations reais.
vi.stubEnv('VITE_MODO_DEMO', '1')

let supabase, usuarios, historico, ordens, hojeISO

beforeAll(async () => {
  supabase = (await import('../data/supabase.js')).supabase
  usuarios = await import('../data/usuarios.js')
  historico = await import('../data/historico.js')
  ordens = await import('../data/ordens.js')
  hojeISO = (await import('../lib/datas.js')).hojeISO
})

describe('sem sessão', () => {
  it('a gestão de usuários recusa', async () => {
    await expect(usuarios.listarUsuarios()).rejects.toMatchObject({ codigo: 'acesso_negado' })
  })
})

describe('com o administrador da demonstração', () => {
  beforeAll(async () => {
    await supabase.auth.signInWithPassword({ email: 'demo', password: 'x' })
  })

  it('lê o próprio perfil', async () => {
    const { data } = await supabase.auth.getUser()
    const perfil = await usuarios.buscarPerfil(data.user.id)
    expect(perfil).toMatchObject({ papel: 'admin', ativo: true })
  })

  it('cria, lista, bloqueia e redefine a senha', async () => {
    const criado = await usuarios.criarUsuario({
      usuario: 'maria', nome: 'Maria', senha: 'senha1234', papel: 'atendente',
    })
    expect(criado.usuario).toBe('maria')

    const lista = await usuarios.listarUsuarios()
    expect(lista.map((u) => u.usuario)).toContain('maria')

    await usuarios.alterarUsuario({
      userId: criado.user_id, nome: 'Maria', papel: 'atendente', ativo: false,
    })
    const depois = await usuarios.listarUsuarios()
    expect(depois.find((u) => u.usuario === 'maria').ativo).toBe(false)

    await usuarios.redefinirSenha({ userId: criado.user_id, senha: 'outrasenha1' })

    const atividade = await usuarios.listarAtividadeDeUsuarios()
    expect(atividade.map((a) => a.acao)).toEqual(
      expect.arrayContaining(['criado', 'bloqueado', 'senha_redefinida']))
  })

  it('traduz a recusa do banco em .codigo e mensagem em português', async () => {
    await expect(usuarios.criarUsuario({
      usuario: 'maria', nome: 'Outra', senha: 'senha1234', papel: 'atendente',
    })).rejects.toMatchObject({ codigo: 'usuario_em_uso', message: expect.stringMatching(/já existe/i) })
  })

  it('a OS criada mostra quem a criou na atividade', async () => {
    const os = await ordens.criarOrdem({
      dados: {
        veiculo_placa: 'ABC1D23', data_os: hojeISO(), cliente_nome: 'Cliente Atividade',
        cliente_telefone: '', veiculo_descricao: 'Carro',
      },
      itens: [{ quantidade: '1', descricao: 'Lâmpada', valor_unitario_centavos: 1800 }],
    })
    const eventos = await historico.listarAtividadeDaOs(os.id)
    const acoes = eventos.map((e) => e.acao)
    expect(acoes).toContain('criada')
    expect(acoes).toContain('itens_alterados')
    expect(eventos.find((e) => e.acao === 'criada').usuario_nome).toBe('Demonstração')
  })
})
