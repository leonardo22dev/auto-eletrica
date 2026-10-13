import { tituloDocumento } from '../lib/status.js'
import { dataPorExtenso } from '../lib/datas.js'
import { formatarPlaca } from '../lib/placa.js'
import { centavosParaTexto } from '../lib/dinheiro.js'

// O talão de papel tem 18 linhas fixas. Manter isso preserva o peso visual
// do documento e deixa espaço para anotação à mão na oficina.
export const LINHAS_DO_TALAO = 18

const LINHA_VAZIA = {
  quantidade: '', descricao: '', unitario: '', total: '', vazia: true,
}

function formatarQuantidade(valor) {
  const n = Number(valor) || 0
  return Number.isInteger(n) ? String(n) : String(n).replace('.', ',')
}

export function montarDadosDocumento(os, config) {
  const itens = (os.itens || []).slice().sort((a, b) => a.posicao - b.posicao)

  // Sem corte em 18: uma OS com mais itens imprime todos. Truncar deixaria o
  // TOTAL maior que a soma das linhas visíveis, e documento que não fecha a
  // conta é documento que o cliente contesta no balcão.
  const preenchidas = itens.map((i) => ({
    quantidade: formatarQuantidade(i.quantidade),
    descricao: i.descricao,
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
      razaoSocial: config.razao_social,
      cnpj: config.cnpj,
      inscricaoEstadual: config.inscricao_estadual,
      endereco: config.endereco,
      cidadeUf: config.cidade_uf,
      telefone: config.telefone,
      email: config.email,
      servicos: config.servicos_cabecalho || [],
    },
    titulo: tituloDocumento(os.status),
    numero: os.numero == null ? '—' : String(os.numero),
    data: dataPorExtenso(os.data_conclusao || os.data_abertura),
    cliente: { nome: os.cliente_nome, telefone: os.cliente_telefone || '' },
    veiculo: {
      descricao: os.veiculo_descricao,
      placa: formatarPlaca(os.veiculo_placa),
    },
    textoGarantia: config.texto_garantia,
    linhas,
    total: centavosParaTexto(os.total_centavos),
  }
}
