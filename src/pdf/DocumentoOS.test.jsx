import { describe, it, expect } from 'vitest'
import { renderToBuffer } from '@react-pdf/renderer'
import DocumentoOS from './DocumentoOS.jsx'
import { montarDadosDocumento } from './dadosDocumento.js'

const CONFIG = {
  razao_social: 'Auto Elétrica MIZUHO II Ltda. - ME',
  cnpj: '03.053.178/0001-99', inscricao_estadual: '635.338.217.110',
  endereco: 'Av. Robert Kennedy, 3340', cidade_uf: 'São Bernardo do Campo - SP',
  telefone: '11 4355-9830', email: 'teste@exemplo.com',
  servicos_cabecalho: ['BATERIAS'],
  texto_garantia: 'GARANTIA DE 3 (TRÊS) MESES PARA PEÇAS COM DEFEITO',
  garantia_meses: 3,
}

const OS = {
  numero: 1042, status: 'finalizada', cliente_nome: 'João Silva',
  cliente_telefone: '(11) 98888-7777', veiculo_descricao: 'GM Chevette 1982',
  veiculo_placa: 'ABC1234', data_abertura: '2026-08-10',
  data_conclusao: '2026-08-12', total_centavos: 48000,
  itens: [{ posicao: 1, quantidade: 1, descricao: 'Alternador',
            valor_unitario_centavos: 48000, valor_total_centavos: 48000 }],
}

// O teste roda sem as fontes registradas, usando a padrão do motor. Ele valida
// que o documento se monta e produz PDF, não a aparência — aparência é olho
// humano, na comparação com a foto do talão.
describe('DocumentoOS', () => {
  it('renderiza um PDF válido', async () => {
    const buffer = await renderToBuffer(
      <DocumentoOS dados={montarDadosDocumento(OS, CONFIG)} />,
    )
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-')
    expect(buffer.length).toBeGreaterThan(1000)
  })

  // Review Focus 5: OS vazia não pode derrubar a geração.
  it('renderiza OS sem itens', async () => {
    const buffer = await renderToBuffer(
      <DocumentoOS dados={montarDadosDocumento(
        { ...OS, itens: [], total_centavos: 0 }, CONFIG)} />,
    )
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('renderiza orçamento e OS com mais itens que o talão', async () => {
    const muitos = Array.from({ length: 25 }, (_, i) => ({
      posicao: i + 1, descricao: `Item ${i + 1}`, quantidade: 1,
      valor_unitario_centavos: 1000, valor_total_centavos: 1000,
    }))
    const buffer = await renderToBuffer(
      <DocumentoOS dados={montarDadosDocumento(
        { ...OS, status: 'orcamento', itens: muitos, total_centavos: 25000 },
        CONFIG)} />,
    )
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-')
  })
})
