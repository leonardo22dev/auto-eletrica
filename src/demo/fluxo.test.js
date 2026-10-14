import { describe, it, expect, beforeAll, vi } from 'vitest'

// Percorre o modo demonstração pelas MESMAS funções que as telas chamam.
// É o que prova que o tradutor de consultas cobre as formas realmente usadas:
// um select que ele não entenda quebra aqui, não na mão de quem abriu o app.
vi.stubEnv('VITE_MODO_DEMO', '1')

let ordens, configuracoes, STATUS, hojeISO, vencimentoGarantia, garantiaVigente

beforeAll(async () => {
  ordens = await import('../data/ordens.js')
  configuracoes = await import('../data/configuracoes.js')
  STATUS = (await import('../lib/status.js')).STATUS
  hojeISO = (await import('../lib/datas.js')).hojeISO
  const g = await import('../lib/garantia.js')
  vencimentoGarantia = g.vencimentoGarantia
  garantiaVigente = g.garantiaVigente
})

describe('modo demonstração — leitura', () => {
  it('lê as configurações semeadas', async () => {
    const c = await configuracoes.buscarConfiguracoes()
    expect(c.razao_social).toContain('MIZUHO')
  })

  it('lista OS e filtra por status', async () => {
    expect((await ordens.listarOrdens()).length).toBe(3)
    expect(await ordens.listarOrdens({ status: STATUS.ORCAMENTO })).toHaveLength(1)
  })

  it('traz só o que está em aberto', async () => {
    const abertas = await ordens.listarOrdens({ emAberto: true })
    expect(abertas).toHaveLength(2)
    expect(abertas.every((o) => o.status !== STATUS.FINALIZADA)).toBe(true)
  })

  // O limite vale no banco, antes de qualquer filtro. Se o recorte fosse por
  // data e o status filtrado depois, no cliente, um orçamento antigo
  // esperando resposta sumiria da tela de Início — que existe justamente
  // para mostrar o que está pendurado.
  it('acha o que está em aberto mesmo além do limite por data', async () => {
    const orcamentoAntigo = await ordens.criarOrdem({
      dados: {
        veiculo_placa: 'OLD1A23', data_os: '2020-01-10',
        cliente_nome: 'Orçamento Antigo', cliente_telefone: '',
        veiculo_descricao: 'Carro antigo',
      },
      itens: [],
    })
    // Enche a frente da lista com OS finalizadas, todas mais recentes.
    for (let i = 0; i < 5; i++) {
      const os = await ordens.criarOrdem({
        dados: {
          veiculo_placa: 'FIL1A23', data_os: hojeISO(),
          cliente_nome: `Enchendo ${i}`, cliente_telefone: '',
          veiculo_descricao: 'Carro',
        },
        itens: [], status: STATUS.APROVADA,
      })
      await ordens.mudarStatus(os.id, STATUS.FINALIZADA)
    }

    const abertas = await ordens.listarOrdens({ emAberto: true, limite: 3 })
    expect(abertas.map((o) => o.id)).toContain(orcamentoAntigo.id)
  })

  it('busca por nome, por placa e por número', async () => {
    expect(await ordens.listarOrdens({ termo: 'Marcos' })).toHaveLength(1)
    expect(await ordens.listarOrdens({ termo: 'abc-1234' })).toHaveLength(1)
    // A busca por número é um OU com nome e placa, de propósito: é um campo
    // só. Digitar "3" também acha placa que contém 3 — então o que se exige
    // é que a OS daquele número esteja no resultado.
    const uma = (await ordens.listarOrdens())[0]
    const porNumero = await ordens.listarOrdens({ termo: String(uma.numero) })
    expect(porNumero.map((o) => o.id)).toContain(uma.id)
  })

  // Review Focus 1: a mesma placa escrita de jeitos diferentes.
  it('sugere os dados da última OS da placa, escrita de qualquer jeito', async () => {
    for (const escrita of ['ABC1234', 'abc-1234', ' abc 1234 ']) {
      const s = await ordens.ultimaOsDaPlaca(escrita)
      expect(s.cliente_nome).toBe('João Silva')
      expect(s.veiculo_descricao).toContain('Chevette')
    }
  })

  // Review Focus 3: primeira vez daquele carro.
  it('não sugere nada para placa sem histórico', async () => {
    expect(await ordens.ultimaOsDaPlaca('ZZZ9Z99')).toBe(null)
    expect(await ordens.ultimaOsFinalizadaDaPlaca('ZZZ9Z99')).toBe(null)
  })

  it('acha a última finalizada da placa, com garantia ainda vigente', async () => {
    const u = await ordens.ultimaOsFinalizadaDaPlaca('ABC1234')
    expect(u.status).toBe(STATUS.FINALIZADA)
    expect(ordens.servicoPrincipal(u)).toContain('Alternador')
    const venc = vencimentoGarantia(u.data_os, 3)
    expect(garantiaVigente(venc, hojeISO())).toBe(true)
  })
})

describe('modo demonstração — escrita', () => {
  it('cria OS digitando tudo, sem cadastro nenhum', async () => {
    const os = await ordens.criarOrdem({
      dados: {
        veiculo_placa: 'tst-1d23',
        data_os: hojeISO(),
        cliente_nome: '  Cliente de Teste  ',
        cliente_telefone: '(11) 95555-4444',
        veiculo_descricao: 'Fiat Uno 1995',
      },
      itens: [
        { quantidade: '1', descricao: 'Troca de bateria', valor_unitario_centavos: 32500 },
        { quantidade: '2', descricao: 'Lâmpada H4', valor_unitario_centavos: 1800 },
      ],
      status: STATUS.APROVADA,
    })
    expect(os.veiculo_placa).toBe('TST1D23')
    expect(os.cliente_nome).toBe('Cliente de Teste')
    expect(os.total_centavos).toBe(36100)
  })

  // Review Focus 5.
  it('recusa OS sem nome e sem veículo', async () => {
    const base = {
      veiculo_placa: 'XYZ1A23', data_os: hojeISO(),
      cliente_nome: 'Fulano', veiculo_descricao: 'Carro',
    }
    await expect(ordens.criarOrdem({ dados: { ...base, cliente_nome: '' }, itens: [] }))
      .rejects.toThrow(/nome/)
    await expect(ordens.criarOrdem({ dados: { ...base, veiculo_descricao: '' }, itens: [] }))
      .rejects.toThrow(/veículo/)
  })

  it('corrige os dados de uma OS já emitida', async () => {
    const lista = await ordens.listarOrdens({ termo: 'Marcos' })
    const os = await ordens.atualizarDadosDaOs(lista[0].id, {
      veiculo_placa: 'HIJ3K67', data_os: hojeISO(),
      cliente_nome: 'Marcos Pereira da Silva',
      cliente_telefone: '(11) 97777-6666',
      veiculo_descricao: 'VW Fusca 1975 — Azul',
    })
    expect(os.cliente_nome).toBe('Marcos Pereira da Silva')
  })

  // Review Focus 2: cancelada não serve de sugestão.
  it('ignora OS cancelada ao sugerir pela placa', async () => {
    const nova = await ordens.criarOrdem({
      dados: {
        veiculo_placa: 'ABC1234', data_os: hojeISO(),
        cliente_nome: 'Nome Errado', cliente_telefone: '',
        veiculo_descricao: 'Carro errado',
      },
      itens: [],
    })
    await ordens.cancelarOrdem(nova.id)
    const s = await ordens.ultimaOsDaPlaca('ABC1234')
    expect(s.cliente_nome).toBe('João Silva')
  })

  // Review Focus 4: a data digitada manda na garantia e no documento.
  it('conta a garantia a partir da data digitada', async () => {
    const os = await ordens.criarOrdem({
      dados: {
        veiculo_placa: 'DAT1A23', data_os: '2026-01-31',
        cliente_nome: 'Data Antiga', cliente_telefone: '',
        veiculo_descricao: 'Carro',
      },
      itens: [{ quantidade: '1', descricao: 'Serviço', valor_unitario_centavos: 1000 }],
      status: STATUS.APROVADA,
    })
    const finalizada = await ordens.mudarStatus(os.id, STATUS.FINALIZADA)
    expect(String(finalizada.data_os)).toContain('2026-01-31')
    expect(vencimentoGarantia('2026-01-31', 3)).toBe('2026-04-30')
  })

  it('cancela a última OS e devolve o número', async () => {
    const nova = await ordens.criarOrdem({
      dados: {
        veiculo_placa: 'CAN1A23', data_os: hojeISO(),
        cliente_nome: 'Cancelado', cliente_telefone: '',
        veiculo_descricao: 'Carro',
      },
      itens: [],
    })
    expect(await ordens.cancelarOrdem(nova.id)).toBe(true)
    const depois = await ordens.buscarOrdem(nova.id)
    expect(depois.numero).toBe(null)
  })
})
