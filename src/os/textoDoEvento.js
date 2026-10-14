import { formatarBRL } from '../lib/dinheiro.js'
import { rotuloStatus } from '../lib/status.js'

const CAMPOS = {
  cliente_nome: 'o nome',
  cliente_telefone: 'o telefone',
  veiculo_descricao: 'o veículo',
  veiculo_placa: 'a placa',
  data_os: 'a data',
  observacoes: 'as observações',
}

function juntar(partes) {
  if (partes.length <= 1) return partes.join('')
  return `${partes.slice(0, -1).join(', ')} e ${partes.at(-1)}`
}

export function textoDoEvento({ acao, usuario_nome: quem, detalhe = {} }) {
  switch (acao) {
    case 'criada':
      return `${quem} criou a OS`

    case 'dados_alterados': {
      const nomes = Object.keys(detalhe).map((c) => CAMPOS[c]).filter(Boolean)
      return nomes.length > 0
        ? `${quem} alterou ${juntar(nomes)}`
        : `${quem} alterou os dados`
    }

    case 'itens_alterados': {
      const { total_de: de, total_para: para } = detalhe
      if (de === 0 && para > 0) return `${quem} incluiu os itens (${formatarBRL(para)})`
      if (de !== para) {
        return `${quem} alterou os itens (${formatarBRL(de)} → ${formatarBRL(para)})`
      }
      return `${quem} alterou os itens`
    }

    case 'status_alterado':
      return `${quem} mudou a situação de ${rotuloStatus(detalhe.de)} para ${rotuloStatus(detalhe.para)}`

    case 'cancelada':
      return `${quem} cancelou a OS`

    case 'link_gerado':
      return `${quem} gerou o link de assinatura`

    case 'aceita':
      return `${quem} assinou de acordo (${formatarBRL(detalhe.total_centavos)})`

    default:
      return `${quem} fez uma alteração`
  }
}
