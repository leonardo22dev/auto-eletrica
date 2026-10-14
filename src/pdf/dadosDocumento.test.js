import { describe, it, expect } from 'vitest'
import { montarDadosDocumento, LINHAS_DO_TALAO, tamanhoDaRazaoSocial } from './dadosDocumento.js'

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
  data_os: '2026-08-12',
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

  it('imprime a data da OS, sem deslocar o dia', () => {
    const d = montarDadosDocumento(OS, CONFIG)
    expect(d.data).toEqual({ dia: '12', mes: 'agosto', ano: '2026' })
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
    expect(d.numero).toBe('---')
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

  // As fontes padrão do PDF não têm travessão, bullet, aspas curvas nem
  // reticências: esses caracteres somem do papel sem erro nenhum. Numa
  // descrição de serviço, caractere que desaparece em silêncio é defeito.
  describe('caracteres que a fonte do PDF não imprime', () => {
    it('troca travessão e meia-risca por hífen na descrição do item', () => {
      const d = montarDadosDocumento({
        ...OS,
        itens: [{ posicao: 1, quantidade: 1, quantidadeTexto: '1',
                  descricao: 'Alternador — recondicionamento – completo',
                  valor_unitario_centavos: 100, valor_total_centavos: 100 }],
      }, CONFIG)
      expect(d.linhas[0].descricao).toBe('Alternador - recondicionamento - completo')
    })

    it('troca travessão na descrição do veículo', () => {
      const d = montarDadosDocumento(
        { ...OS, veiculo_descricao: 'GM Chevette 1982 — Bege' }, CONFIG)
      expect(d.veiculo.descricao).toBe('GM Chevette 1982 - Bege')
    })

    it('troca aspas curvas e reticências', () => {
      const d = montarDadosDocumento({
        ...OS,
        cliente_nome: '“João” ‘Silva’…',
        itens: [],
      }, CONFIG)
      expect(d.cliente.nome).toBe('"João" \'Silva\'...')
    })

    it('mantém acentos, cedilha e til, que a fonte imprime', () => {
      const d = montarDadosDocumento({
        ...OS,
        itens: [{ posicao: 1, quantidade: 1, descricao: 'Injeção eletrônica à São',
                  valor_unitario_centavos: 100, valor_total_centavos: 100 }],
      }, CONFIG)
      expect(d.linhas[0].descricao).toBe('Injeção eletrônica à São')
    })

    it('limpa também os textos vindos das configurações', () => {
      const d = montarDadosDocumento(OS, {
        ...CONFIG,
        razao_social: 'Auto Elétrica — MIZUHO II',
        servicos_cabecalho: ['BATERIAS — TODAS'],
      })
      expect(d.empresa.razaoSocial).toBe('Auto Elétrica - MIZUHO II')
      expect(d.empresa.servicos).toEqual(['BATERIAS - TODAS'])
    })
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

// A coluna da razão social divide a moldura com o logo e o telefone. Em fonte
// 21 o nome da Mizuho (34 caracteres) não cabia, e o "- ME" caía para a linha
// de baixo. O tamanho passa a depender do comprimento, para caber numa linha.
describe('tamanhoDaRazaoSocial', () => {
  it('reduz o nome da Mizuho abaixo de 21, onde ele quebrava', () => {
    const t = tamanhoDaRazaoSocial('Auto Elétrica MIZUHO II Ltda. - ME')
    expect(t).toBeLessThan(21)
    expect(t).toBeGreaterThanOrEqual(16)
  })

  it('mantém o tamanho cheio quando o nome é curto', () => {
    expect(tamanhoDaRazaoSocial('Mizuho Ltda')).toBe(21)
  })

  it('reduz mais quanto maior o nome', () => {
    const a = tamanhoDaRazaoSocial('A'.repeat(40))
    const b = tamanhoDaRazaoSocial('A'.repeat(60))
    expect(b).toBeLessThan(a)
  })

  it('nunca desce abaixo do mínimo legível', () => {
    expect(tamanhoDaRazaoSocial('A'.repeat(300))).toBe(11)
  })

  it('aguenta vazio e nulo', () => {
    expect(tamanhoDaRazaoSocial('')).toBe(21)
    expect(tamanhoDaRazaoSocial(null)).toBe(21)
  })

  it('o documento entrega o tamanho junto com a empresa', () => {
    const d = montarDadosDocumento(OS, CONFIG)
    expect(d.empresa.tamanhoRazao).toBe(tamanhoDaRazaoSocial(d.empresa.razaoSocial))
  })
})

// Modo "Valor total": serviços sem preço e uma linha "Valor total" no fim. O
// documento mostra os serviços com as colunas de valor em branco e o valor só
// na linha de fechamento, que é onde o cliente procura.
describe('valor total no documento', () => {
  const SERVICOS = {
    ...OS,
    total_centavos: 120000,
    itens: [
      { posicao: 1, quantidade: 1, descricao: 'Troca de alternador',
        valor_unitario_centavos: 0, valor_total_centavos: 0 },
      { posicao: 2, quantidade: 2, descricao: 'Troca de baterias',
        valor_unitario_centavos: 0, valor_total_centavos: 0 },
      { posicao: 3, quantidade: 1, descricao: 'Valor total',
        valor_unitario_centavos: 120000, valor_total_centavos: 120000 },
    ],
  }

  it('serviço sem preço sai com as colunas de valor em branco', () => {
    const d = montarDadosDocumento(SERVICOS, CONFIG)
    expect(d.linhas[0]).toEqual({
      quantidade: '1', descricao: 'Troca de alternador',
      unitario: '', total: '', vazia: false,
    })
    expect(d.linhas[1]).toMatchObject({ quantidade: '2', unitario: '', total: '' })
  })

  it('a linha "Valor total" leva o valor só na coluna do total', () => {
    const d = montarDadosDocumento(SERVICOS, CONFIG)
    expect(d.linhas[2]).toEqual({
      quantidade: '', descricao: 'Valor total',
      unitario: '', total: '1.200,00', vazia: false,
    })
  })

  it('o total do rodapé é o valor total', () => {
    expect(montarDadosDocumento(SERVICOS, CONFIG).total).toBe('1.200,00')
  })

  it('OS itemizada continua imprimindo unitário e total', () => {
    const d = montarDadosDocumento(OS, CONFIG)
    expect(d.linhas[0]).toMatchObject({ unitario: '380,00', total: '380,00' })
  })
})

describe('assinatura do cliente no documento', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgo='

  it('sem aceite, não há assinatura', () => {
    expect(montarDadosDocumento(OS, CONFIG).assinatura).toBe(null)
  })

  it('com aceite, entrega o desenho e a data do aceite', () => {
    const d = montarDadosDocumento({
      ...OS, aceite_em: '2026-10-14T15:32:00-03:00', aceite_assinatura: PNG,
    }, CONFIG)
    expect(d.assinatura.imagem).toBe(PNG)
    expect(d.assinatura.textoData).toBe(
      'Assinado digitalmente pelo cliente em 14/10/2026 às 15:32')
  })

  // O nome do cliente na OS segue editável depois do aceite. Quem assinou foi
  // o nome que constava na hora do aceite, e é ele que a legenda deve mostrar.
  it('a legenda traz o nome de quem assinou, não o nome atual da OS', () => {
    const d = montarDadosDocumento({
      ...OS,
      cliente_nome: 'Nome Corrigido Depois',
      aceite_nome: 'João Silva',
      aceite_em: '2026-10-14T15:32:00-03:00',
      aceite_assinatura: PNG,
    }, CONFIG)
    expect(d.assinatura.textoData).toBe(
      'Assinado digitalmente por João Silva em 14/10/2026 às 15:32')
  })

  it('aceite sem desenho não imprime assinatura', () => {
    const d = montarDadosDocumento({
      ...OS, aceite_em: '2026-10-14T15:32:00-03:00', aceite_assinatura: null,
    }, CONFIG)
    expect(d.assinatura).toBe(null)
  })
})
