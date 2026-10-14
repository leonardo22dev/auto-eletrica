import { describe, it, expect, beforeAll, vi } from 'vitest'

// Percorre o modo demonstração pelas MESMAS funções que as telas chamam.
// É o que prova que o tradutor de consultas cobre as formas realmente usadas:
// um select que ele não entenda quebra aqui, não na mão de quem abriu o app.
vi.stubEnv('VITE_MODO_DEMO', '1')

let clientes, veiculos, ordens, configuracoes, STATUS

beforeAll(async () => {
  clientes = await import('../data/clientes.js')
  veiculos = await import('../data/veiculos.js')
  ordens = await import('../data/ordens.js')
  configuracoes = await import('../data/configuracoes.js')
  STATUS = (await import('../lib/status.js')).STATUS
})

describe('modo demonstração — leitura', () => {
  it('lê as configurações semeadas', async () => {
    const c = await configuracoes.buscarConfiguracoes()
    expect(c.razao_social).toContain('MIZUHO')
    expect(c.garantia_meses).toBe(3)
  })

  it('lista clientes e filtra por nome', async () => {
    expect((await clientes.listarClientes()).length).toBeGreaterThanOrEqual(3)
    const achados = await clientes.listarClientes({ termo: 'Silva' })
    expect(achados.map((c) => c.nome)).toContain('João Silva')
  })

  // Era o caso que derrubava a busca antes da correção do escape.
  it('filtra cliente por telefone com parêntese', async () => {
    const achados = await clientes.listarClientes({ termo: '(11) 98888' })
    expect(achados.map((c) => c.nome)).toContain('João Silva')
  })

  it('traz o cliente com os veículos embutidos', async () => {
    const lista = await clientes.listarClientes({ termo: 'João' })
    const c = await clientes.buscarCliente(lista[0].id)
    expect(c.veiculos.length).toBe(2)
  })

  it('acha o veículo pela placa, com o dono junto', async () => {
    const v = await veiculos.buscarVeiculoPorPlaca('abc-1234')
    expect(v.modelo).toBe('Chevette')
    expect(v.cliente.nome).toBe('João Silva')
  })

  it('devolve nulo para placa desconhecida', async () => {
    expect(await veiculos.buscarVeiculoPorPlaca('ZZZ9Z99')).toBe(null)
  })

  it('lista OS e filtra por status', async () => {
    expect((await ordens.listarOrdens()).length).toBe(3)
    const orcamentos = await ordens.listarOrdens({ status: STATUS.ORCAMENTO })
    expect(orcamentos).toHaveLength(1)
  })

  it('busca OS por nome e por placa', async () => {
    expect((await ordens.listarOrdens({ termo: 'Marcos' }))).toHaveLength(1)
    expect((await ordens.listarOrdens({ termo: 'abc-1234' }))).toHaveLength(1)
  })

  it('traz a OS com os itens ordenados', async () => {
    const lista = await ordens.listarOrdens({ termo: 'João' })
    const os = await ordens.buscarOrdem(lista[0].id)
    expect(os.itens.map((i) => i.posicao)).toEqual([1, 2])
    expect(os.total_centavos).toBe(48000)
  })

  it('acha a última OS finalizada do veículo, para o aviso de garantia', async () => {
    const v = await veiculos.buscarVeiculoPorPlaca('ABC1234')
    const ultima = await ordens.ultimaOrdemDoVeiculo(v.id)
    expect(ultima.status).toBe(STATUS.FINALIZADA)
    expect(ordens.servicoPrincipal(ultima)).toContain('Alternador')
  })
})

describe('modo demonstração — escrita', () => {
  it('cria cliente, veículo e OS, com total calculado pelo gatilho', async () => {
    const cliente = await clientes.criarCliente({
      nome: 'Cliente de Teste', telefone: '(11) 95555-4444',
    })
    const veiculo = await veiculos.criarVeiculo({
      cliente_id: cliente.id, placa: 'TST1D23', marca: 'Fiat', modelo: 'Uno', ano: 1995,
    })

    const os = await ordens.criarOrdem({
      cliente,
      veiculo: {
        id: veiculo.id, placa: veiculo.placa,
        descricao: veiculos.descricaoVeiculo(veiculo),
      },
      itens: [
        { quantidade: '1', descricao: 'Troca de bateria', valor_unitario_centavos: 32500 },
        { quantidade: '2', descricao: 'Lâmpada H4', valor_unitario_centavos: 1800 },
      ],
      status: STATUS.APROVADA,
    })

    expect(os.numero).toBeTruthy()
    expect(os.veiculo_descricao).toBe('Fiat Uno 1995')
    // 32500 + 2 x 1800 — somado pelo trigger do banco, não pelo front.
    expect(os.total_centavos).toBe(36100)
  })

  it('recusa item com valor e sem discriminação', async () => {
    const v = await veiculos.buscarVeiculoPorPlaca('HIJ3K67')
    await expect(ordens.criarOrdem({
      cliente: v.cliente, veiculo: { id: v.id, placa: v.placa, descricao: 'x' },
      itens: [{ quantidade: '1', descricao: '', valor_unitario_centavos: 5000 }],
    })).rejects.toThrow(/discriminação/)
  })

  it('substitui os itens e recalcula o total', async () => {
    const lista = await ordens.listarOrdens({ termo: 'Marcos' })
    await ordens.atualizarItens(lista[0].id, [
      { quantidade: '1', descricao: 'Serviço único', valor_unitario_centavos: 9900 },
    ])
    const os = await ordens.buscarOrdem(lista[0].id)
    expect(os.itens).toHaveLength(1)
    expect(os.total_centavos).toBe(9900)
  })

  it('finaliza a OS e grava a data de conclusão', async () => {
    const lista = await ordens.listarOrdens({ termo: 'Marcos' })
    const os = await ordens.mudarStatus(lista[0].id, STATUS.FINALIZADA)
    expect(os.status).toBe(STATUS.FINALIZADA)
    expect(os.data_conclusao).toBeTruthy()
    expect(os.finalizada_em).toBeTruthy()
  })

  it('cancela a última OS e devolve o número', async () => {
    const cliente = (await clientes.listarClientes({ termo: 'Ana' }))[0]
    const veiculo = await veiculos.buscarVeiculoPorPlaca('LMN4P89')
    const nova = await ordens.criarOrdem({
      cliente,
      veiculo: { id: veiculo.id, placa: veiculo.placa, descricao: 'Volvo V70' },
      itens: [],
    })
    const devolveu = await ordens.cancelarOrdem(nova.id)
    expect(devolveu).toBe(true)

    const depois = await ordens.buscarOrdem(nova.id)
    expect(depois.status).toBe(STATUS.CANCELADA)
    expect(depois.numero).toBe(null)
  })

  it('salva as configurações', async () => {
    const salva = await configuracoes.salvarConfiguracoes({ telefone: '11 0000-0000' })
    expect(salva.telefone).toBe('11 0000-0000')
  })
})
