import { STATUS } from '../lib/status.js'

export function mensagemWhatsApp({ os, config, urlPdf, urlAssinatura }) {
  const documento = os.status === STATUS.ORCAMENTO ? 'orçamento' : 'OS'
  const artigo = os.status === STATUS.ORCAMENTO ? 'o' : 'a'
  const titulo = os.numero == null
    ? `seu ${documento}`
    : `${artigo} ${documento} nº ${os.numero}`

  const linhas = [
    `Olá, ${os.cliente_nome}! Segue ${titulo} da ${config.razao_social}.`,
    `Veículo: ${os.veiculo_descricao} — ${os.veiculo_placa}`,
  ]
  if (urlPdf) linhas.push(urlPdf)
  if (urlAssinatura) {
    linhas.push('', 'Para aprovar, confira e assine por aqui:', urlAssinatura)
  }
  return linhas.join('\n')
}
