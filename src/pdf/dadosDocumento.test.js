import { describe, it, expect } from 'vitest'
import { montarDadosDocumento, LINHAS_DO_TALAO } from './dadosDocumento.js'

const CONFIG = {
  razao_social: 'Auto Elétrica MIZUHO II Ltda. - ME',
  cnpj: '03.053.178/0001-99',
  inscricao_estadual: '635.338.217.110',
  endereco: 'Avenida Robert Kennedy, 3340 - Assunção',
  cidade_uf: 'São Bernardo do Campo - SP',
  telefone: '11 4355-9830',
  email: 'autoeletricamizuhodois@gmail.com',
  servicos_cabecalho: ['INJEÇÃO ELETRÔNICA', 'BATERIAS'],
  texto_garantia: 'GARANTIA DE 3 (TRÊS) MESES PARA PEÇAS COM DEFEITO',
  garantia_meses: 3,
}

const OS = {
  numero: 1042,
  status: 'finalizada',
  cliente_nome: 'João Silva',
  cliente_telefone: '(11) 98888-7777',
  veiculo_descricao: 'GM Chevette 1982 — Bege',
  veiculo_placa: 'ABC1234',
  data_abertura: '2026-08-10',
  data_conclusao: '2026-08-12',
  total_centavos: 48000,
  itens: [
    { posicao: 1, quantidade: 1, descricao: 'Alternador',
      valor_unitario_centavos: 38000, valor_total_centavos: 38000 },
    { posicao: 2, quantidade: 1, descricao: 'Correia',
      valor_unitario_centavos: 10000, valor_total_centavos: 10000 },
  ],
}

describe('montarDadosDocumento', () => {
  it('traz os dados da empresa do config, não fixos no código', () => {
    const d = montarDadosDocumento(OS, CONFIG)
    expect(d.empresa.razaoSocial).toBe('Auto Elétrica MIZUHO II Ltda. - ME')
    expect(d.empresa.cnpj).toBe('03.053.178/0001-99')
    expect(d.empresa.servicos).toEqual(['INJEÇÃO ELETRÔNICA', 'BATERIAS'])
    expect(d.textoGarantia).toBe('GARANTIA DE 3 (TRÊS) MESES PARA PEÇAS COM DEFEITO')
  })

  it('usa a data de conclusão e não desloca o dia', () => {
    const d = montarDadosDocumento(OS, CONFIG)
    expect(d.data).toEqual({ dia: '12', mes: 'agosto', ano: '2026' })
  })

  it('cai na data de abertura quando não há conclusão', () => {
    const d = montarDadosDocumento({ ...OS, data_conclusao: null }, CONFIG)
    expect(d.data).toEqual({ dia: '10', mes: 'agosto', ano: '2026' })
  })

  it('imprime como orçamento enquanto for orçamento', () => {
    expect(montarDadosDocumento({ ...OS, status: 'orcamento' }, CONFIG).titulo)
      .toBe('ORÇAMENTO')
    expect(montarDadosDocumento(OS, CONFIG).titulo).toBe('ORDEM DE SERVIÇOS')
  })

  it('formata a placa antiga com hífen', () => {
    expect(montarDadosDocumento(OS, CONFIG).veiculo.placa).toBe('ABC-1234')
  })

  it('preenche o talão até 18 linhas, com as sobras em branco', () => {
    const d = montarDadosDocumento(OS, CONFIG)
    expect(d.linhas).toHaveLength(LINHAS_DO_TALAO)
    expect(d.linhas[0]).toEqual({
      quantidade: '1', descricao: 'Alternador',
      unitario: '380,00', total: '380,00', vazia: false,
    })
    expect(d.linhas[2]).toEqual({
      quantidade: '', descricao: '', unitario: '', total: '', vazia: true,
    })
  })

  it('mostra quantidade fracionária sem casas inúteis', () => {
    const d = montarDadosDocumento({
      ...OS,
      itens: [{ posicao: 1, quantidade: 0.5, descricao: 'Fluido',
                valor_unitario_centavos: 4000, valor_total_centavos: 2000 }],
    }, CONFIG)
    expect(d.linhas[0].quantidade).toBe('0,5')
  })

  // Review Focus 5: OS sem item nenhum ainda precisa gerar documento válido.
  it('gera documento válido para OS sem itens', () => {
    const d = montarDadosDocumento({ ...OS, itens: [], total_centavos: 0 }, CONFIG)
    expect(d.linhas).toHaveLength(LINHAS_DO_TALAO)
    expect(d.linhas.every((l) => l.vazia)).toBe(true)
    expect(d.total).toBe('0,00')
  })

  it('aceita OS cancelada sem número', () => {
    const d = montarDadosDocumento({ ...OS, numero: null }, CONFIG)
    expect(d.numero).toBe('—')
  })

  it('não perde itens quando passam de 18 — abre as linhas necessárias', () => {
    const muitos = Array.from({ length: 23 }, (_, i) => ({
      posicao: i + 1, descricao: `Item ${i + 1}`, quantidade: 1,
      valor_unitario_centavos: 100, valor_total_centavos: 100,
    }))
    const d = montarDadosDocumento({ ...OS, itens: muitos }, CONFIG)
    expect(d.linhas).toHaveLength(23)
    expect(d.linhas[22].descricao).toBe('Item 23')
    expect(d.linhas.filter((l) => l.vazia)).toHaveLength(0)
  })

  it('ordena os itens pela posição, não pela ordem que vieram', () => {
    const d = montarDadosDocumento({
      ...OS,
      itens: [
        { posicao: 2, descricao: 'Segundo', quantidade: 1,
          valor_unitario_centavos: 100, valor_total_centavos: 100 },
        { posicao: 1, descricao: 'Primeiro', quantidade: 1,
          valor_unitario_centavos: 100, valor_total_centavos: 100 },
      ],
    }, CONFIG)
    expect(d.linhas[0].descricao).toBe('Primeiro')
    expect(d.linhas[1].descricao).toBe('Segundo')
  })
})
