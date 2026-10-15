import { describe, it, expect, beforeAll, vi } from 'vitest'

// Percorre a exclusão pelas MESMAS funções que a tela chama, sobre o banco da
// demonstração com as migrations reais.
vi.stubEnv('VITE_MODO_DEMO', '1')

let supabase, ordens, hojeISO

beforeAll(async () => {
  supabase = (await import('../data/supabase.js')).supabase
  ordens = await import('../data/ordens.js')
  hojeISO = (await import('../lib/datas.js')).hojeISO
  await supabase.auth.signInWithPassword({ email: 'demo', password: 'x' })
})

const nova = (nome) => ordens.criarOrdem({
  dados: {
    veiculo_placa: 'ABC1D23', data_os: hojeISO(), cliente_nome: nome,
    cliente_telefone: '', veiculo_descricao: 'Carro',
  },
  itens: [{ quantidade: '1', descricao: 'Lâmpada', valor_unitario_centavos: 1800 }],
})

describe('excluir OS (demonstração)', () => {
  it('exclui, a OS some e fica o registro mínimo', async () => {
    const os = await nova('Cliente Para Excluir')
    await ordens.excluirOrdem(os)

    await expect(ordens.buscarOrdem(os.id)).rejects.toThrow()
    const registros = await ordens.listarOsExcluidas()
    const r = registros.find((x) => x.os_id === os.id)
    expect(r).toMatchObject({
      cliente_nome: 'Cliente Para Excluir', total_centavos: 1800, assinada: false,
    })
    expect(r.excluida_por_nome).toBe('Demonstração')
  })

  it('OS excluída sai da lista do Histórico', async () => {
    const os = await nova('Cliente Some Da Lista')
    await ordens.excluirOrdem(os)
    const lista = await ordens.listarOrdens({ termo: 'Some Da Lista' })
    expect(lista).toHaveLength(0)
  })

  it('traduz a recusa do banco em mensagem para a tela', async () => {
    await expect(ordens.excluirOrdem({ id: '00000000-0000-4000-8000-000000000000' }))
      .rejects.toThrow(/excluir/i)
  })

  it('remove o PDF publicado antes de excluir, quando existe', async () => {
    const os = await nova('Cliente Com PDF')
    const caminho = `${os.id}/OS-teste.pdf`
    await supabase.storage.from('os-pdfs').upload(caminho, new Blob(['x']))
    await ordens.registrarPdfDaOrdem(os.id, caminho)
    const comPdf = await ordens.buscarOrdem(os.id)

    await ordens.excluirOrdem(comPdf)

    const { data } = supabase.storage.from('os-pdfs').getPublicUrl(caminho)
    expect(data.publicUrl).toBe('#') // o arquivo deixou de existir na demonstração
  })
})
