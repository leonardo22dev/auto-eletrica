import { tituloDocumento } from '../lib/status.js'
import { dataPorExtenso } from '../lib/datas.js'
import { formatarPlaca } from '../lib/placa.js'
import { centavosParaTexto } from '../lib/dinheiro.js'
import { formatarDataHora } from '../lib/datas.js'

// O talão de papel tem 18 linhas fixas. Manter isso preserva o peso visual
// do documento e deixa espaço para anotação à mão na oficina.
export const LINHAS_DO_TALAO = 18

const LINHA_VAZIA = {
  quantidade: '', descricao: '', unitario: '', total: '', vazia: true,
}

// As fontes padrão do PDF cobrem acento, cedilha e til, mas não os caracteres
// tipográficos — travessão, bullet, aspas curvas, reticências. Eles somem do
// papel sem erro nenhum. Numa descrição de serviço, caractere que desaparece
// em silêncio vira discussão no balcão, então são trocados por equivalentes
// que a fonte imprime.
const SUBSTITUICOES = [
  [/[—–−]/g, '-'],
  [/[‘’‛]/g, "'"],
  [/[“”‟]/g, '"'],
  [/…/g, '...'],
  [/[•·]/g, '*'],
  [/ /g, ' '],
]

export function textoImprimivel(valor) {
  if (valor == null) return valor
  let s = String(valor)
  for (const [de, para] of SUBSTITUICOES) s = s.replace(de, para)
  return s
}

// A razão social divide a moldura do cabeçalho com o logo e o telefone. Em
// fonte 21, o nome da Mizuho (34 caracteres) passava da coluna e o "- ME"
// caía para a linha de baixo. O tamanho acompanha o comprimento: nomes curtos
// ficam no tamanho cheio e os longos encolhem até caber numa linha só.
const RAZAO_TAMANHO_MAXIMO = 21
const RAZAO_TAMANHO_MINIMO = 11
// Largura útil da coluna (pt) e largura média de um caractere em fonte
// serifada em negrito, em fração do corpo — medidas no documento impresso.
const RAZAO_LARGURA_COLUNA = 300
const RAZAO_LARGURA_CARACTERE = 0.503

export function tamanhoDaRazaoSocial(texto) {
  const comprimento = String(texto ?? '').length
  if (comprimento === 0) return RAZAO_TAMANHO_MAXIMO
  const cabe = RAZAO_LARGURA_COLUNA / (comprimento * RAZAO_LARGURA_CARACTERE)
  return Math.max(RAZAO_TAMANHO_MINIMO, Math.min(RAZAO_TAMANHO_MAXIMO, cabe))
}

function formatarQuantidade(valor) {
  const n = Number(valor) || 0
  return Number.isInteger(n) ? String(n) : String(n).replace('.', ',')
}

function textoDaAssinatura(aceiteEm) {
  return `Assinado digitalmente pelo cliente em ${formatarDataHora(aceiteEm)}`
}

export function montarDadosDocumento(os, config) {
  const itens = (os.itens || []).slice().sort((a, b) => a.posicao - b.posicao)

  // Sem corte em 18: uma OS com mais itens imprime todos. Truncar deixaria o
  // TOTAL maior que a soma das linhas visíveis, e documento que não fecha a
  // conta é documento que o cliente contesta no balcão.
  const preenchidas = itens.map((i) => ({
    quantidade: formatarQuantidade(i.quantidade),
    descricao: textoImprimivel(i.descricao),
    unitario: centavosParaTexto(i.valor_unitario_centavos),
    total: centavosParaTexto(i.valor_total_centavos),
    vazia: false,
  }))

  const linhas = preenchidas.concat(
    Array.from(
      { length: Math.max(0, LINHAS_DO_TALAO - preenchidas.length) },
      () => ({ ...LINHA_VAZIA }),
    ),
  )

  return {
    empresa: {
      razaoSocial: textoImprimivel(config.razao_social),
      cnpj: textoImprimivel(config.cnpj),
      inscricaoEstadual: textoImprimivel(config.inscricao_estadual),
      endereco: textoImprimivel(config.endereco),
      cidadeUf: textoImprimivel(config.cidade_uf),
      telefone: textoImprimivel(config.telefone),
      email: textoImprimivel(config.email),
      servicos: (config.servicos_cabecalho || []).map(textoImprimivel),
      tamanhoRazao: tamanhoDaRazaoSocial(textoImprimivel(config.razao_social)),
    },
    titulo: tituloDocumento(os.status),
    // O travessão do "sem número" também não imprime: no papel vira três
    // hifens, que é como o talão marcava campo não preenchido.
    numero: os.numero == null ? '---' : String(os.numero),
    data: dataPorExtenso(os.data_os),
    cliente: {
      nome: textoImprimivel(os.cliente_nome),
      telefone: textoImprimivel(os.cliente_telefone || ''),
    },
    veiculo: {
      descricao: textoImprimivel(os.veiculo_descricao),
      placa: formatarPlaca(os.veiculo_placa),
    },
    textoGarantia: textoImprimivel(config.texto_garantia),
    assinatura: os.aceite_em && os.aceite_assinatura
      ? { imagem: os.aceite_assinatura, textoData: textoDaAssinatura(os.aceite_em) }
      : null,
    linhas,
    total: centavosParaTexto(os.total_centavos),
  }
}
