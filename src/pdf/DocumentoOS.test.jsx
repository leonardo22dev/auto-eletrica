import { describe, it, expect } from 'vitest'
import { renderToBuffer } from '@react-pdf/renderer'
import { inflateSync } from 'node:zlib'
import DocumentoOS from './DocumentoOS.jsx'
import { montarDadosDocumento } from './dadosDocumento.js'

const CONFIG = {
  razao_social: 'Auto Elétrica MIZUHO II Ltda. - ME',
  cnpj: '03.053.178/0001-99', inscricao_estadual: '635.338.217.110',
  endereco: 'Av. Robert Kennedy, 3340', cidade_uf: 'São Bernardo do Campo - SP',
  telefone: '11 4355-9830', email: 'teste@exemplo.com',
  servicos_cabecalho: ['BATERIAS', 'ALTERNADORES'],
  texto_garantia: 'GARANTIA DE 3 (TRÊS) MESES PARA PEÇAS COM DEFEITO',
  garantia_meses: 3,
}

const OS = {
  numero: 1042, status: 'finalizada', cliente_nome: 'João Silva',
  cliente_telefone: '(11) 98888-7777', veiculo_descricao: 'GM Chevette 1982',
  veiculo_placa: 'ABC1234', data_os: '2026-08-12', total_centavos: 48000,
  itens: [{ posicao: 1, quantidade: 1, descricao: 'Alternador',
            valor_unitario_centavos: 48000, valor_total_centavos: 48000 }],
}

// Lê o texto que o PDF realmente imprime. Sem isso, um campo esquecido no
// layout passaria despercebido: os testes de dados provam que a string foi
// calculada, não que ela chegou ao papel.
function textoDoPdf(buffer) {
  const latin = buffer.toString('latin1')
  const marcador = /stream\r?\n/g
  let conteudo = ''
  let m
  while ((m = marcador.exec(latin)) !== null) {
    const inicio = m.index + m[0].length
    const fim = latin.indexOf('endstream', inicio)
    if (fim < 0) continue
    try {
      const s = inflateSync(Buffer.from(latin.slice(inicio, fim), 'latin1'))
        .toString('latin1')
      if (s.includes('TJ')) conteudo += s
    } catch { /* stream binário, como a imagem do logo */ }
  }
  // O react-pdf escreve o texto como grupos [<hex> ...] TJ.
  const trechos = []
  const grupo = /\[([^\]]*)\]\s*TJ/g
  let g
  while ((g = grupo.exec(conteudo)) !== null) {
    const hex = [...g[1].matchAll(/<([0-9A-Fa-f]*)>/g)].map((h) => h[1]).join('')
    const bytes = hex.match(/../g) || []
    trechos.push(bytes.map((b) => String.fromCharCode(parseInt(b, 16))).join(''))
  }
  return trechos.join('\n')
}

// O PDF quebra linhas onde o layout manda, partindo um mesmo campo em vários
// trechos. Para asserções sobre o conteúdo, não sobre a quebra, colapsa-se
// o espaço em branco.
function colapsar(texto) {
  return texto.replace(/\s+/g, ' ').trim()
}

async function renderizar(os, config = CONFIG) {
  return renderToBuffer(<DocumentoOS dados={montarDadosDocumento(os, config)} />)
}

describe('DocumentoOS', () => {
  it('renderiza um PDF válido', async () => {
    const buffer = await renderizar(OS)
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-')
    expect(buffer.length).toBeGreaterThan(1000)
  })

  it('imprime o cabeçalho da empresa vindo das configurações', async () => {
    const texto = colapsar(textoDoPdf(await renderizar(OS)))
    expect(texto).toContain('Auto Elétrica MIZUHO II Ltda. - ME')
    expect(texto).toContain('11 4355-9830')
    expect(texto).toContain('CNPJ 03.053.178/0001-99')
    expect(texto).toContain('Inscr. Estadual nº 635.338.217.110')
    expect(texto).toContain('BATERIAS')
    expect(texto).toContain('ALTERNADORES')
  })

  // Cada linha do PDF vira um grupo de texto próprio. Se a razão social não
  // couber na coluna, o "- ME" cai para a linha de baixo e o nome aparece
  // partido em dois grupos — que é o que se via impresso.
  it('imprime a razão social inteira numa linha só', async () => {
    const linhas = textoDoPdf(await renderizar(OS)).split('\n')
    expect(linhas).toContain('Auto Elétrica MIZUHO II Ltda. - ME')
  })

  it('mantém numa linha só uma razão social mais longa', async () => {
    const longa = 'Auto Elétrica e Injeção Eletrônica MIZUHO II Ltda. - ME'
    const linhas = textoDoPdf(
      await renderizar(OS, { ...CONFIG, razao_social: longa })).split('\n')
    expect(linhas).toContain(longa)
  })

  it('imprime cliente, veículo, placa e data da OS', async () => {
    const texto = textoDoPdf(await renderizar(OS))
    expect(texto).toContain('João Silva')
    expect(texto).toContain('(11) 98888-7777')
    expect(texto).toContain('GM Chevette 1982')
    expect(texto).toContain('ABC-1234')
    expect(texto).toContain('agosto')
    expect(texto).toContain('2026')
  })

  it('imprime a tarja da garantia e a linha de assinatura', async () => {
    const texto = textoDoPdf(await renderizar(OS))
    expect(texto).toContain('GARANTIA DE 3 (TRÊS) MESES PARA PEÇAS COM DEFEITO')
    expect(texto).toContain('Assinatura do Cliente')
  })

  it('imprime os itens e o total', async () => {
    const texto = textoDoPdf(await renderizar(OS))
    expect(texto).toContain('Alternador')
    expect(texto).toContain('TOTAL R$')
    expect(texto).toContain('480,00')
  })

  it('imprime o cabeçalho da tabela nas quatro colunas do talão', async () => {
    const texto = textoDoPdf(await renderizar(OS))
    expect(texto).toContain('Quant.')
    expect(texto).toContain('Discriminação')
    expect(texto).toContain('Unitário')
    expect(texto).toContain('Total')
  })

  it('sai como ORÇAMENTO enquanto for orçamento', async () => {
    const texto = textoDoPdf(await renderizar({ ...OS, status: 'orcamento' }))
    expect(texto).toContain('ORÇAMENTO')
    expect(texto).not.toContain('ORDEM DE SERVIÇOS')
  })

  it('sai como ORDEM DE SERVIÇOS depois de aprovada', async () => {
    const texto = textoDoPdf(await renderizar({ ...OS, status: 'aprovada' }))
    expect(texto).toContain('ORDEM DE SERVIÇOS')
  })

  // Review Focus 5: OS vazia não pode derrubar a geração.
  it('renderiza OS sem itens, com o total zerado', async () => {
    const buffer = await renderizar({ ...OS, itens: [], total_centavos: 0 })
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-')
    const texto = textoDoPdf(buffer)
    expect(texto).toContain('TOTAL R$')
    expect(texto).toContain('0,00')
  })

  it('imprime todos os itens quando passam das 18 linhas do talão', async () => {
    const muitos = Array.from({ length: 25 }, (_, i) => ({
      posicao: i + 1, descricao: `Peça número ${i + 1}`, quantidade: 1,
      valor_unitario_centavos: 1000, valor_total_centavos: 1000,
    }))
    const texto = textoDoPdf(
      await renderizar({ ...OS, itens: muitos, total_centavos: 25000 }),
    )
    expect(texto).toContain('Peça número 1')
    expect(texto).toContain('Peça número 25')
  })
})
