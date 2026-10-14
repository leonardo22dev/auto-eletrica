import { describe, it, expect } from 'vitest'
import { textoDoEvento } from './textoDoEvento.js'
import { formatarBRL } from '../lib/dinheiro.js'

const quem = 'Maria'
const ev = (acao, detalhe = {}, usuario_nome = quem) => ({ acao, usuario_nome, detalhe })

describe('textoDoEvento', () => {
  it('criação', () => {
    expect(textoDoEvento(ev('criada'))).toBe('Maria criou a OS')
  })

  it('itens: mostra o total antes e depois quando muda', () => {
    expect(textoDoEvento(ev('itens_alterados', { total_de: 38000, total_para: 48000 })))
      .toBe(`Maria alterou os itens (${formatarBRL(38000)} → ${formatarBRL(48000)})`)
  })

  it('itens: primeira inclusão não finge que havia valor antes', () => {
    expect(textoDoEvento(ev('itens_alterados', { total_de: 0, total_para: 48000 })))
      .toBe(`Maria incluiu os itens (${formatarBRL(48000)})`)
  })

  it('itens: mesmo total, só a descrição mudou', () => {
    expect(textoDoEvento(ev('itens_alterados', { total_de: 30000, total_para: 30000 })))
      .toBe('Maria alterou os itens')
  })

  it('dados: nomeia o que mudou', () => {
    expect(textoDoEvento(ev('dados_alterados', {
      cliente_nome: { de: 'a', para: 'b' }, veiculo_placa: { de: 'c', para: 'd' },
    }))).toBe('Maria alterou o nome e a placa')
    expect(textoDoEvento(ev('dados_alterados', {
      cliente_telefone: { de: '', para: '1' }, veiculo_descricao: { de: 'a', para: 'b' },
      data_os: { de: 'a', para: 'b' },
    }))).toBe('Maria alterou o telefone, o veículo e a data')
  })

  it('status e cancelamento', () => {
    expect(textoDoEvento(ev('status_alterado', { de: 'orcamento', para: 'aprovada' })))
      .toBe('Maria mudou a situação de Orçamento para Aprovada')
    expect(textoDoEvento(ev('cancelada', { de: 'aprovada' }))).toBe('Maria cancelou a OS')
  })

  it('link e aceite', () => {
    expect(textoDoEvento(ev('link_gerado'))).toBe('Maria gerou o link de assinatura')
    expect(textoDoEvento(ev('aceita', { total_centavos: 48000 }, 'Cliente (assinatura)')))
      .toBe(`Cliente (assinatura) assinou de acordo (${formatarBRL(48000)})`)
  })

  it('ação desconhecida não quebra', () => {
    expect(textoDoEvento(ev('algo_novo'))).toBe('Maria fez uma alteração')
  })

  it('campo desconhecido em dados_alterados não quebra', () => {
    expect(textoDoEvento(ev('dados_alterados', { cor: { de: 1, para: 2 } })))
      .toBe('Maria alterou os dados')
  })
})
