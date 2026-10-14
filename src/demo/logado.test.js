import { describe, it, expect, beforeAll, vi } from 'vitest'

// Os testes de fluxo rodam sem sessão, então `criado_por` ia sempre nulo e
// a chave estrangeira para auth.users nunca era exercida. No navegador o
// usuário entra antes de criar a OS — e o usuário simulado não existia no
// banco, derrubando toda criação. Este arquivo percorre o caminho logado.
vi.stubEnv('VITE_MODO_DEMO', '1')

let supabase, ordens, hojeISO, STATUS

beforeAll(async () => {
  supabase = (await import('../data/supabase.js')).supabase
  ordens = await import('../data/ordens.js')
  hojeISO = (await import('../lib/datas.js')).hojeISO
  STATUS = (await import('../lib/status.js')).STATUS
  await supabase.auth.signInWithPassword({ email: 'teste@teste.com', password: '123' })
})

const dados = () => ({
  veiculo_placa: 'ABC1D23', data_os: hojeISO(),
  cliente_nome: 'Teste Logado', cliente_telefone: '',
  veiculo_descricao: 'Carro',
})

describe('modo demonstração — com sessão aberta', () => {
  it('cria OS como orçamento e grava quem criou', async () => {
    const os = await ordens.criarOrdem({ dados: dados(), itens: [] })
    expect(os.id).toBeTruthy()
    expect(os.criado_por).toBeTruthy()
  })

  it('cria OS aprovada com itens e total', async () => {
    const os = await ordens.criarOrdem({
      dados: dados(),
      itens: [{ quantidade: '2', descricao: 'Lâmpada', valor_unitario_centavos: 1800 }],
      status: STATUS.APROVADA,
    })
    expect(os.total_centavos).toBe(3600)
    expect(os.data_aprovacao).toBeTruthy()
  })
})
